"""Jar layout, discovery, gap scan, build and deployment checks; temporary fixtures only."""
import contextlib
import io
import os
from pathlib import Path
import shutil
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib

import patch_firefox as ff

DOS_DATE = 0x5A6C  # 2025-03-12
DOS_TIME = 0x6000  # 12:00:00
LOCAL_SIZE = struct.Struct('<4s5H3L2H').size
CENTRAL_SIZE = struct.Struct('<4s6H3L5H2L').size
EOCD_SIZE = struct.Struct('<4s4H2LH').size


def fluent_available():
    try:
        import fluent.syntax  # noqa: F401
    except ImportError:
        return False
    return True


FLUENT = fluent_available()


def optimized_jar(path, resources, comment=b''):
    """Write an archive the way Firefox does: central directory before the entries.

    python's zipfile cannot open this layout, which is exactly why patch_firefox
    carries its own reader.
    """
    locals_data = b''
    records = b''
    prefix_size = 4
    for name, text in resources.items():
        data = text.encode('utf-8')
        crc = zlib.crc32(data)
        encoded = name.encode('utf-8')
        offset = prefix_size + len(records)  # provisional; corrected below
        locals_data += struct.pack('<4s5H3L2H', ff.LOCAL_HEADER, 20, 0, ff.STORED, DOS_TIME, DOS_DATE,
                                   crc, len(data), len(data), len(encoded), 0) + encoded + data
        records += struct.pack('<4s6H3L5H2L', ff.CENTRAL_HEADER, 0x031E, 20, 0, ff.STORED, DOS_TIME,
                               DOS_DATE, crc, len(data), len(data), len(encoded), 0, 0, 0, 0, 0,
                               offset) + encoded
    # The first entry offset depends on the finished directory size, so rebuild
    # the directory once the size is known.
    directory_size = len(records)
    entries_start = prefix_size + directory_size + EOCD_SIZE + len(comment)
    records = b''
    body = b''
    for name, text in resources.items():
        data = text.encode('utf-8')
        crc = zlib.crc32(data)
        encoded = name.encode('utf-8')
        offset = entries_start + len(body)
        body += struct.pack('<4s5H3L2H', ff.LOCAL_HEADER, 20, 0, ff.STORED, DOS_TIME, DOS_DATE,
                            crc, len(data), len(data), len(encoded), 0) + encoded + data
        records += struct.pack('<4s6H3L5H2L', ff.CENTRAL_HEADER, 0x031E, 20, 0, ff.STORED, DOS_TIME,
                               DOS_DATE, crc, len(data), len(data), len(encoded), 0, 0, 0, 0, 0,
                               offset) + encoded
    assert len(records) == directory_size, 'directory size changed between passes'
    eocd = struct.pack('<4s4H2LH', ff.EOCD, 0, 0, len(resources), len(resources), directory_size,
                       prefix_size, len(comment)) + comment
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'\x0c\xe3\xde\x00' + records + eocd + body + eocd)


def plain_jar(path, resources):
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_STORED) as target:
        for name, text in resources.items():
            target.writestr(name, text)


class JarTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ff-jar-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def test_reads_firefox_optimized_layout(self):
        path = self.root / 'omni.ja'
        resources = {'localization/en-US/a.ftl': 'a = One\n', 'chrome/x.js': 'let x = 1;\n'}
        optimized_jar(path, resources, comment=b'firefox')
        # The reason this module has its own reader: zipfile mis-seeks here.
        with self.assertRaises(zipfile.BadZipFile):
            zipfile.ZipFile(path)
        with ff.Jar(path) as jar:
            self.assertEqual(jar.names(), list(resources))
            self.assertEqual(jar.comment, b'firefox')
            for name, text in resources.items():
                self.assertEqual(jar.read(name), text.encode('utf-8'))

    def test_reads_plain_zip_container(self):
        path = self.root / 'browser' / 'omni.ja'
        resources = {'localization/zh-CN/a.ftl': 'a = 一\n'}
        plain_jar(path, resources)
        with ff.Jar(path) as jar:
            self.assertEqual(jar.names(), list(resources))
            self.assertEqual(jar.read('localization/zh-CN/a.ftl'), 'a = 一\n'.encode('utf-8'))

    def test_missing_entry_and_broken_archive_are_reported(self):
        path = self.root / 'omni.ja'
        optimized_jar(path, {'a.txt': 'a'})
        with ff.Jar(path) as jar:
            with self.assertRaises(ff.Blocked):
                jar.read('nope.txt')
        broken = self.root / 'broken.ja'
        broken.write_bytes(b'not an archive at all')
        with self.assertRaises(ff.Blocked):
            ff.Jar(broken)

    def test_scan_archive_detects_supplement_and_hashes(self):
        clean = self.root / 'clean.ja'
        optimized_jar(clean, {'a.ftl': 'a = One\n'})
        sha, patched = ff.scan_archive(clean)
        self.assertFalse(patched)
        self.assertEqual(sha, ff.digest(clean))
        marked = self.root / 'marked.ja'
        optimized_jar(marked, {'a.ftl': f'a = One\n\n{ff.SUPPLEMENT}\na = 一\n'})
        self.assertTrue(ff.scan_archive(marked)[1])


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ff-discovery-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.roaming = self.root / 'Roaming'
        self.local = self.root / 'Local'
        self.profile = self.roaming / 'Profiles' / 'abc.default'
        self.profile.mkdir(parents=True)
        (self.profile / 'prefs.js').write_text('', encoding='utf-8')
        self.install = self.root / 'install'

    def write_ini(self, text):
        self.roaming.mkdir(parents=True, exist_ok=True)
        (self.roaming / 'profiles.ini').write_text(text, encoding='utf-8')

    def test_relative_and_absolute_profile_paths(self):
        absolute = self.root / 'elsewhere'
        absolute.mkdir()
        self.write_ini('[Profile0]\nName=default\nIsRelative=1\nPath=Profiles/abc.default\nDefault=1\n'
                       '[Profile1]\nName=external\nIsRelative=0\n'
                       f'Path={absolute}\n')
        profiles, _ = ff.load_profiles(self.roaming, self.local)
        self.assertEqual([p.path for p in profiles], [self.profile.resolve(), absolute.resolve()])
        self.assertEqual([p.name for p in profiles], ['default', 'external'])
        self.assertEqual(profiles[0].local_path, (self.local / 'Profiles' / 'abc.default').resolve())
        self.assertEqual(profiles[1].local_path, absolute.resolve())
        self.assertTrue(profiles[0].default)

    def test_unsafe_relative_path_is_rejected(self):
        self.write_ini('[Profile0]\nPath=../../etc\n')
        with self.assertRaises(ff.Blocked):
            ff.load_profiles(self.roaming, self.local)

    def test_last_platform_dir_and_installs_default_are_read(self):
        (self.profile / 'compatibility.ini').write_text(
            f'[Compatibility]\nLastPlatformDir={self.install}\n', encoding='utf-8')
        (self.roaming / 'installs.ini').write_text(
            '[ABCD1234]\nDefault=Profiles/abc.default\nLocked=1\n', encoding='utf-8')
        self.write_ini('[Profile0]\nName=default\nPath=Profiles/abc.default\n')
        profiles, defaults = ff.load_profiles(self.roaming, self.local)
        self.assertEqual(profiles[0].last_install, self.install)
        self.assertEqual(defaults, [(self.roaming / 'Profiles' / 'abc.default').resolve()])

    def selection(self, explicit=None, active=False):
        profiles, defaults = ff.load_profiles(self.roaming, self.local)
        return ff.select_profile(self.install, profiles, defaults, explicit, is_active=lambda p: active)

    def test_selection_rank_and_ambiguity(self):
        self.write_ini('[Profile0]\nName=one\nPath=Profiles/abc.default\nDefault=1\n')
        profile, reason = self.selection('one')
        self.assertEqual((profile.name, reason), ('one', 'explicit'))
        self.assertEqual(self.selection(active=True)[1], 'running profile')
        self.assertEqual(self.selection()[1], 'profile default')
        second = self.roaming / 'Profiles' / 'def.default'
        second.mkdir()
        (second / 'prefs.js').write_text('', encoding='utf-8')
        self.write_ini('[Profile0]\nName=one\nPath=Profiles/abc.default\n'
                       '[Profile1]\nName=two\nPath=Profiles/def.default\n')
        with self.assertRaises(ff.Blocked):
            self.selection()
        with self.assertRaises(ff.Blocked):
            self.selection('missing')

    def test_external_profile_directory_is_accepted(self):
        self.write_ini('')
        external = self.root / 'portable'
        external.mkdir()
        (external / 'prefs.js').write_text('', encoding='utf-8')
        profile, reason = self.selection(str(external))
        self.assertEqual((profile.path, reason), (external.resolve(), 'explicit external profile'))

    def install_fixture(self, root=None, name='install'):
        target = root or self.root
        install = target / name
        (install / 'browser').mkdir(parents=True)
        for relative in ('firefox.exe', 'omni.ja', 'browser/omni.ja', 'application.ini'):
            (install / relative).write_bytes(b'x')
        return install

    def test_find_install_explicit_and_invalid(self):
        install = self.install_fixture()
        self.assertEqual(ff.find_install([], str(install)), install.resolve())
        with self.assertRaises(ff.Blocked):
            ff.find_install([], str(self.root / 'nope'))

    def test_cache_targets_are_validated(self):
        self.write_ini('[Profile0]\nName=one\nPath=Profiles/abc.default\n')
        profile, _ = self.selection('one')
        self.assertEqual(ff.cache_targets(profile), [])
        cache = profile.local_path / 'startupCache'
        cache.mkdir(parents=True)
        self.assertEqual(ff.cache_targets(profile), [cache.resolve()])
        shutil.rmtree(cache)
        cache.write_text('', encoding='utf-8')  # a file where a directory belongs
        with self.assertRaises(ff.Blocked):
            ff.cache_targets(profile)

    def test_redirected_cache_is_refused(self):
        self.write_ini('[Profile0]\nName=one\nPath=Profiles/abc.default\n')
        profile, _ = self.selection('one')
        real = self.root / 'real-cache'
        real.mkdir()
        link = profile.local_path / 'startupCache'
        link.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.symlink(real, link, target_is_directory=True)
        except OSError:
            self.skipTest('creating symlinks needs Developer Mode or admin rights')
        with self.assertRaises(ff.Blocked):
            ff.cache_targets(profile)


class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ff-meta-test-')
        self.addCleanup(self.temp.cleanup)
        self.install = Path(self.temp.name).resolve() / 'install'
        self.install.mkdir(parents=True)

    def test_version_fields_are_read(self):
        (self.install / 'application.ini').write_text(
            '[App]\nVendor=Mozilla\nName=Firefox\nCodeName=Firefox Developer Edition\n'
            'Version=159.0\nBuildID=20261012090602\nSourceStamp=abc123\n\n[Gecko]\nMinVersion=159.0\n',
            encoding='utf-8')
        info = ff.read_application_ini(self.install)
        self.assertEqual((info['version'], info['build_id'], info['source_stamp'], info['gecko_version']),
                         ('159.0', '20261012090602', 'abc123', '159.0'))
        self.assertEqual(info['code_name'], 'Firefox Developer Edition')

    def test_missing_fields_are_reported(self):
        (self.install / 'application.ini').write_text('[App]\nName=Firefox\n', encoding='utf-8')
        with self.assertRaises(ff.Blocked):
            ff.read_application_ini(self.install)


class FluentScanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ff-scan-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.module = self.root / 'module'
        self.module.mkdir()
        self.install = self.root / 'install'
        (self.install / 'browser').mkdir(parents=True)
        for relative in ('firefox.exe', 'application.ini'):
            (self.install / relative).write_bytes(b'x')
        self.omni = {'localization/en-US/toolkit/a.ftl': 'a-one = One\na-two = Two\n',
                     'localization/zh-CN/toolkit/a.ftl': 'a-one = 一\n'}
        self.browser = {'localization/en-US/browser/b.ftl': 'b-one = One\n'}
        self.write_archives()

    def write_archives(self, optimized=True):
        writer = optimized_jar if optimized else plain_jar
        writer(self.install / 'omni.ja', self.omni)
        writer(self.install / 'browser' / 'omni.ja', self.browser)

    def additions(self, **resources):
        result = {archive: {} for archive in ff.ARCHIVES}
        for key, value in resources.items():
            archive, resource = key.split('|', 1)
            result[archive][resource] = value
        return result

    def test_gaps_cover_new_ids_missing_files_and_additions(self):
        gaps = ff.translation_gaps(self.install, self.additions(), 'en-US', 'zh-CN')
        self.assertEqual([(a, r, m) for a, r, m, _ in gaps],
                         [('omni.ja', 'localization/zh-CN/toolkit/a.ftl', 'a-two'),
                          ('browser/omni.ja', 'localization/zh-CN/browser/b.ftl', 'b-one')])
        solved = self.additions(**{'omni.ja|localization/zh-CN/toolkit/a.ftl': 'a-two = 二\n',
                                   'browser/omni.ja|localization/zh-CN/browser/b.ftl': 'b-one = 一\n'})
        self.assertEqual(ff.translation_gaps(self.install, solved, 'en-US', 'zh-CN'), [])

    def test_gaps_are_the_same_for_plain_and_optimized_archives(self):
        first = ff.translation_gaps(self.install, self.additions(), 'en-US', 'zh-CN')
        self.write_archives(optimized=False)
        self.assertEqual(ff.translation_gaps(self.install, self.additions(), 'en-US', 'zh-CN'), first)

    def test_message_helpers(self):
        text = '# c\nfoo = One\nbar =\n    .label = Two\n'
        self.assertEqual(ff.message_ids(text), ['foo', 'bar'])
        self.assertEqual(ff.message_block(text, 'foo'), 'foo = One')
        self.assertEqual(ff.message_block(text, 'bar'), 'bar =\n    .label = Two')

    def test_validate_message_keeps_structure_only(self):
        source = 'a = { $count } items <b data-l10n-name="x">'
        ff.validate_message('a', source, 'a = { $count } 个项目 <b data-l10n-name="x">')
        for broken in ('b = { $count } 个项目', 'a = 项目', 'a = { $count } 个项目 <b>', ''):
            with self.assertRaises(ff.Blocked):
                ff.validate_message('a', source, broken)

    def test_fragments_and_write_back(self):
        with patch.object(ff, 'ROOT', self.module):
            ff.translations_path('zh-CN').write_text(
                '# header\n\n# @file omni.ja localization/zh-CN/toolkit/a.ftl\na-one = 一\n', encoding='utf-8')
            self.assertEqual(ff.fragments('zh-CN'),
                             {'omni.ja': {'localization/zh-CN/toolkit/a.ftl': 'a-one = 一\n'},
                              'browser/omni.ja': {}})
            entries = [('omni.ja', 'localization/zh-CN/toolkit/a.ftl', 'a-two', 'a-two = 二'),
                       ('browser/omni.ja', 'localization/zh-CN/browser/b.ftl', 'b-one', 'b-one = 一')]
            self.assertEqual(ff.update_translations_file(entries, 'zh-CN'), 2)
            self.assertEqual(ff.update_translations_file(entries, 'zh-CN'), 0)
            text = ff.translations_path('zh-CN').read_text(encoding='utf-8')
            self.assertIn('a-one = 一\na-two = 二\n', text)
            self.assertTrue(text.endswith('# @file browser/omni.ja localization/zh-CN/browser/b.ftl\n'
                                          'b-one = 一\n'))

    def test_unsafe_translation_target_is_refused(self):
        with patch.object(ff, 'ROOT', self.module):
            ff.translations_path('zh-CN').write_text(
                '# @file omni.ja ../escape.ftl\nx = 1\n', encoding='utf-8')
            with self.assertRaises(ff.Blocked):
                ff.fragments('zh-CN')


class FakeMagpie:
    """Stands in for magpie: keeps structure, replaces human text."""

    base_url = 'fake://magpie'
    model = 'fake-model'

    def __init__(self, broken=()):
        self.broken = set(broken)
        self.seen = []

    @classmethod
    def from_env(cls, base_url=None, model=None, api_key=None):
        return cls.instance

    def ensure_ready(self):
        self.seen.append('ensure_ready')

    def translate(self, messages, language=None):
        answers = {}
        for key, source in messages.items():
            if key in self.broken:
                answers[key] = 'broken = { $missing }'
                continue
            lines = []
            for line in source.splitlines():
                match = ff.MESSAGE_ID.match(line) or ff.ATTRIBUTE.match(line)
                if match and line.split('=', 1)[1].strip():
                    lines.append(line.split('=', 1)[0] + '= 中文')
                else:
                    lines.append(line)
            answers[key] = '\n'.join(lines)
        return answers


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ff-build-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.module = self.root / 'module'
        self.module.mkdir()
        self.install = ScanFixture.make_install(self.root)
        self.profile = ff.Profile(self.root / 'profile', 'test', self.root / 'profile')
        self.profile.path.mkdir()
        (self.profile.path / 'prefs.js').write_text('', encoding='utf-8')
        self.original = {archive: ff.digest(self.install / archive) for archive in ff.ARCHIVES}
        FakeMagpie.instance = FakeMagpie()
        self.patch = patch.multiple(ff, ROOT=self.module, BUILD=self.module / 'build',
                                    BACKUPS=self.module / 'backups')
        self.patch.start()
        self.addCleanup(self.patch.stop)
        # Anchored to the patched ROOT: the fixture must never touch the real module.
        self.translations = ff.translations_path('zh-CN')
        self.assertEqual(self.translations.parent, self.module)
        self.translations.write_text('# header\n', encoding='utf-8')
        self.client = patch.object(ff.MagpieClient, 'from_env', FakeMagpie.from_env)
        self.client.start()
        self.addCleanup(self.client.stop)
        self.closed = patch.object(ff, 'require_closed', lambda: None)
        self.closed.start()
        self.addCleanup(self.closed.stop)

    def test_no_translate_reports_gaps_without_writing(self):
        with self.assertRaises(ff.Blocked) as caught:
            ff.build(self.install, translate=False)
        self.assertIn('a-two', str(caught.exception))
        self.assertNotIn('a-two', ff.translations_path('zh-CN').read_text(encoding='utf-8'))

    def test_review_first_stops_after_translating(self):
        self.assertIsNone(ff.build(self.install, review_first=True))
        self.assertIn('a-two = 中文', ff.translations_path('zh-CN').read_text(encoding='utf-8'))
        self.assertFalse((self.module / 'build' / 'manifest.json').exists())

    def test_limit_stops_with_a_partial_translation_file(self):
        self.assertIsNone(ff.build(self.install, limit=1))
        text = ff.translations_path('zh-CN').read_text(encoding='utf-8')
        self.assertEqual(text.count('= 中文'), 1)

    def test_broken_translation_is_refused(self):
        FakeMagpie.instance = FakeMagpie(broken={'omni.ja/localization/zh-CN/toolkit/a.ftl:a-two'})
        with self.assertRaises(ff.Blocked):
            ff.build(self.install)
        self.assertNotIn('a-two', ff.translations_path('zh-CN').read_text(encoding='utf-8'))

    @unittest.skipUnless(FLUENT, 'fluent.syntax is not installed')
    def test_build_install_verify_restore_round_trip(self):
        manifest = ff.build(self.install)
        self.assertEqual(manifest['version'], '159.0')
        self.assertFalse(ff.needs_build(self.install))
        for archive, record in manifest['archives'].items():
            self.assertEqual(ff.digest(self.install / archive), record['original_sha256'])
            self.assertEqual(ff.digest(self.module / 'build' / archive), record['patched_sha256'])
        self.assertEqual(ff.main(['validate', '--original-dir', str(self.install)]), 0)
        ff.deploy(self.install, self.profile)
        for archive, record in manifest['archives'].items():
            self.assertEqual(ff.digest(self.install / archive), record['patched_sha256'])
        self.assertTrue((self.module / 'build' / 'deployment.json').is_file())
        # The patch is inside the installed archive, readable through the jar reader.
        with ff.Jar(self.install / 'omni.ja') as jar:
            text = jar.read('localization/zh-CN/toolkit/a.ftl').decode('utf-8')
        self.assertIn('a-one = 一', text)
        self.assertIn('a-two = 中文', text)
        self.assertIn(ff.SUPPLEMENT, text)
        ff.deploy(self.install, self.profile, restore=True)
        for archive, original in self.original.items():
            self.assertEqual(ff.digest(self.install / archive), original)

    def test_installing_a_changed_install_is_refused(self):
        ff.build(self.install)
        (self.install / 'omni.ja').write_bytes(b'replaced by an upgrade')
        with self.assertRaises(ff.Blocked):
            ff.deploy(self.install, self.profile)

    def test_rebuild_from_a_patched_install_is_refused(self):
        ff.build(self.install)
        ff.deploy(self.install, self.profile)
        with self.assertRaises(ff.Blocked):
            ff.build(self.install)


class ScanFixture:
    @staticmethod
    def make_install(root, optimized=True):
        install = root / 'install'
        (install / 'browser').mkdir(parents=True, exist_ok=True)
        (install / 'firefox.exe').write_bytes(b'MZ')
        (install / 'application.ini').write_text(
            '[App]\nVendor=Mozilla\nName=Firefox\nCodeName=Firefox Test\nVersion=159.0\n'
            'BuildID=20261012090602\nSourceStamp=deadbeef\n\n[Gecko]\nMinVersion=159.0\nMaxVersion=159.0\n',
            encoding='utf-8')
        writer = optimized_jar if optimized else plain_jar
        writer(install / 'omni.ja', {'localization/en-US/toolkit/a.ftl': 'a-one = One\na-two = Two\n',
                                     'localization/zh-CN/toolkit/a.ftl': 'a-one = 一\n',
                                     'chrome/app.js': 'let app = 1;\n'})
        writer(install / 'browser' / 'omni.ja', {'localization/en-US/browser/b.ftl': 'b-one = One\n',
                                                 'localization/zh-CN/browser/keep.ftl': 'k = 保留\n'})
        return install


class CliTests(unittest.TestCase):
    def run_main(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = ff.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_help_needs_no_installation(self):
        code, out, _ = self.run_main([])
        self.assertEqual(code, 0)
        self.assertIn('patch_firefox.py', out)
        self.assertIn('magpie', out)

    def test_blocking_error_prints_the_reason_and_exits_non_zero(self):
        code, _, err = self.run_main(['scan', '--install-dir', str(Path(tempfile.gettempdir()) / 'no-ff-here')])
        self.assertEqual(code, 1)
        self.assertTrue(err.startswith('错误：'), err)

    def test_bad_magpie_address_is_reported(self):
        with self.assertRaises(ff.Blocked) as caught:
            ff.MagpieClient.from_env('ftp://127.0.0.1/v1')
        self.assertIn('地址无效', str(caught.exception))
        with self.assertRaises(ff.Blocked) as caught:
            ff.MagpieClient.from_env('http://example.test/v1')
        self.assertIn('HTTPS', str(caught.exception))


class LanguageTests(unittest.TestCase):
    """Which language the installation uses, and how it is decided."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ff-language-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def install(self, locales=('en-US', 'zh-CN')):
        install = self.root / 'install'
        (install / 'browser').mkdir(parents=True, exist_ok=True)
        (install / 'firefox.exe').write_bytes(b'MZ')
        (install / 'application.ini').write_text(
            '[App]\nName=Firefox\nVersion=159.0\nBuildID=1\nSourceStamp=x\n\n[Gecko]\nMinVersion=159.0\n',
            encoding='utf-8')
        resources = {f'localization/{locale}/toolkit/a.ftl': f'x = {locale}\n' for locale in locales}
        optimized_jar(install / 'omni.ja', resources)
        optimized_jar(install / 'browser' / 'omni.ja', {'chrome/app.js': 'let x = 1;\n'})
        return install

    def profile(self, prefs=''):
        profile = self.root / 'profile'
        profile.mkdir(exist_ok=True)
        (profile / 'prefs.js').write_text(prefs, encoding='utf-8')
        return ff.Profile(profile, 'test', profile)

    def test_english_detection(self):
        for locale in ('en', 'en-US', 'en-GB'):
            self.assertTrue(ff.is_english(locale), locale)
        for locale in ('zh-CN', 'ja', 'de', 'enx'):
            self.assertFalse(ff.is_english(locale), locale)

    def test_shipped_locales_and_source_locale(self):
        install = self.install(('en-US', 'ja', 'zh-CN'))
        self.assertEqual(ff.shipped_locales(install), ['en-US', 'ja', 'zh-CN'])
        self.assertEqual(ff.source_locale(['en-GB', 'ja']), 'en-GB')
        self.assertEqual(ff.source_locale(['en-US', 'ja']), 'en-US')
        with self.assertRaises(ff.Blocked):
            ff.source_locale(['ja'])

    def test_profile_prefs_win_over_the_install_default(self):
        install = self.install(('en-US', 'ja', 'zh-CN'))
        (install / 'defaults' / 'pref').mkdir(parents=True)
        (install / 'defaults' / 'pref' / 'l10n.js').write_text(
            'pref("general.useragent.locale", "zh-CN");\n', encoding='utf-8')
        self.assertEqual(ff.install_default_locale(install), 'zh-CN')
        language = ff.resolve_language(install, self.profile(
            'user_pref("intl.locale.requested", "ja");\n'))
        self.assertEqual((language.locale, language.source), ('ja', '配置 profile 的 prefs.js'))
        # A fallback list keeps its first entry; an empty value is skipped.
        self.assertEqual(ff.resolve_language(install, self.profile(
            'user_pref("intl.locale.requested", "ja,en-US");\n')).locale, 'ja')
        self.assertEqual(ff.resolve_language(install, self.profile(
            'user_pref("intl.locale.requested", "");\n'
            'user_pref("general.useragent.locale", "ja");\n')).locale, 'ja')

    def test_explicit_flag_wins_and_unknown_locale_is_refused(self):
        install = self.install(('en-US', 'zh-CN'))
        self.assertEqual(ff.resolve_language(install, None, 'zh-CN').locale, 'zh-CN')
        with self.assertRaises(ff.Blocked) as caught:
            ff.resolve_language(install, None, 'ja')
        self.assertIn('不在安装自带的语言资源中', str(caught.exception))

    def test_multiple_non_english_languages_need_a_choice(self):
        install = self.install(('en-US', 'ja', 'zh-CN'))
        with self.assertRaises(ff.Blocked) as caught:
            ff.resolve_language(install, None)
        self.assertIn('--target-locale', str(caught.exception))
        self.assertEqual(ff.resolve_language(install, None, 'ja').locale, 'ja')

    def test_single_non_english_language_is_used(self):
        language = ff.resolve_language(self.install(('en-US', 'zh-CN')), None)
        self.assertEqual((language.locale, language.english), ('zh-CN', False))
        self.assertEqual(language.source, '安装包中唯一的非英文语言')
        self.assertEqual(language.source_locale, 'en-US')

    def test_english_installation_has_nothing_to_complete(self):
        install = self.install(('en-US',))
        language = ff.resolve_language(install, None)
        self.assertTrue(language.english)
        self.assertEqual(ff.scan(install, language), [])


class OtherLanguageTests(unittest.TestCase):
    """A non-Chinese target proves the language is threaded through build and scan."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ff-ja-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.module = self.root / 'module'
        self.module.mkdir()
        self.install = self.root / 'install'
        (self.install / 'browser').mkdir(parents=True, exist_ok=True)
        (self.install / 'firefox.exe').write_bytes(b'MZ')
        (self.install / 'application.ini').write_text(
            '[App]\nName=Firefox\nVersion=159.0\nBuildID=1\nSourceStamp=x\n\n[Gecko]\nMinVersion=159.0\n',
            encoding='utf-8')
        optimized_jar(self.install / 'omni.ja', {
            'localization/en-US/toolkit/a.ftl': 'a-one = One\na-two = Two\n',
            'localization/ja/toolkit/a.ftl': 'a-one = 一\n',
            'localization/zh-CN/toolkit/a.ftl': 'a-one = 一\n'})
        optimized_jar(self.install / 'browser' / 'omni.ja', {'chrome/app.js': 'let x = 1;\n'})
        FakeMagpie.instance = FakeMagpie()
        self.patch = patch.multiple(ff, ROOT=self.module, BUILD=self.module / 'build',
                                    BACKUPS=self.module / 'backups')
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.client = patch.object(ff.MagpieClient, 'from_env', FakeMagpie.from_env)
        self.client.start()
        self.addCleanup(self.client.stop)

    def test_scan_and_build_target_the_requested_language(self):
        language = ff.resolve_language(self.install, None, 'ja')
        self.assertEqual(ff.scan(self.install, language), [
            ('omni.ja', 'localization/ja/toolkit/a.ftl', 'a-two', 'a-two = Two')])
        manifest = ff.build(self.install, locale='ja')
        self.assertEqual(manifest['target_locale'], 'ja')
        self.assertEqual(manifest['source_locale'], 'en-US')
        self.assertTrue((self.module / 'translations.ja.ftl').is_file())
        self.assertFalse((self.module / 'translations.zh-CN.ftl').exists())
        with ff.Jar(self.module / 'build' / 'omni.ja') as jar:
            text = jar.read('localization/ja/toolkit/a.ftl').decode('utf-8')
        self.assertIn('a-two = 中文', text)
        self.assertNotIn('zh-CN', text)

    def test_english_target_is_a_no_op(self):
        self.assertIsNone(ff.build(self.install, locale='en-US'))
        self.assertFalse((self.module / 'build' / 'manifest.json').exists())

    def test_switching_language_requires_a_clean_build(self):
        ff.build(self.install, locale='ja')
        with self.assertRaises(ff.Blocked) as caught:
            ff.build(self.install, locale='zh-CN')
        self.assertIn('先 restore', str(caught.exception))

    def test_translation_file_must_match_the_language(self):
        path = ff.translations_path('ja')
        path.write_text('# @file omni.ja localization/zh-CN/toolkit/a.ftl\nx = 1\n', encoding='utf-8')
        with self.assertRaises(ff.Blocked) as caught:
            ff.fragments('ja')
        self.assertIn('意外的目标', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
