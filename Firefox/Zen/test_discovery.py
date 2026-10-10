"""Portable discovery and deployment checks; uses only temporary fixtures."""
import ctypes
from pathlib import Path
import json
import os
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import patch_zen


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='zen-discovery-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.roaming = self.root / 'Roaming/zen'
        self.local = self.root / 'Local/zen'
        self.roaming.mkdir(parents=True)
        self.local.mkdir(parents=True)
        self.install = self.root / 'Apps/Zen Browser'
        for name in ('zen.exe', 'omni.ja', 'browser/omni.ja'):
            path = self.install / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'original')

    def profile(self, name, default=False, install=None):
        path = self.roaming / 'Profiles' / name
        path.mkdir(parents=True)
        (path / 'prefs.js').write_text('// untouched', encoding='utf8')
        return patch_zen.Profile(path, name, self.local / 'Profiles' / name,
                                 install or self.install, default)

    def test_relative_and_absolute_profiles_and_install_default(self):
        first = self.profile('random.Default (release)')
        external = self.root / 'External 中文/Profile'
        external.mkdir(parents=True)
        (first.path / 'compatibility.ini').write_text(
            f'[Compatibility]\nLastPlatformDir={self.install}\n', encoding='utf8')
        (self.roaming / 'profiles.ini').write_text(
            f'[Profile0]\nName=Default (release)\nIsRelative=1\nPath=Profiles/{first.path.name}\n'
            f'[Profile1]\nName=External\nIsRelative=0\nPath={external}\n', encoding='utf8')
        (self.roaming / 'installs.ini').write_text(
            f'[123]\nDefault=Profiles/{first.path.name}\n', encoding='utf8')
        profiles, defaults = patch_zen.load_profiles(self.roaming, self.local)
        selected, reason = patch_zen.select_profile(self.install, profiles, defaults, is_active=lambda p: False)
        self.assertEqual(selected.path, first.path)
        self.assertEqual(selected.local_path, first.local_path)
        self.assertEqual(reason, 'installation default')
        self.assertEqual(profiles[1].local_path, external)

    def test_running_profile_overrides_default_and_stale_lock(self):
        first, second = self.profile('default'), self.profile('current')
        selected, reason = patch_zen.select_profile(self.install, [first, second], [first.path],
                                                    is_active=lambda p: p == second)
        self.assertEqual(selected, second)
        self.assertEqual(reason, 'running profile')
        (first.path / 'parent.lock').touch()
        self.assertFalse(patch_zen.profile_in_use(first))

    @unittest.skipUnless(os.name == 'nt', 'Windows sharing semantics')
    def test_real_windows_profile_lock(self):
        profile = self.profile('locked')
        lock = profile.path / 'parent.lock'
        lock.touch()
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_ulong, ctypes.c_ulong,
                                      ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_void_p]
        kernel.CreateFileW.restype = ctypes.c_void_p
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.CreateFileW(str(lock), 0x80000000, 0, None, 3, 0, None)
        self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
        try:
            self.assertTrue(patch_zen.profile_in_use(profile))
        finally:
            kernel.CloseHandle(handle)

    def test_ambiguous_defaults_require_explicit_selection(self):
        first, second = self.profile('one'), self.profile('two')
        with self.assertRaisesRegex(ValueError, 'Multiple possible profiles'):
            patch_zen.select_profile(self.install, [first, second], [first.path, second.path], is_active=lambda p: False)
        selected, _ = patch_zen.select_profile(self.install, [first, second], [], explicit=str(second.path))
        self.assertEqual(selected, second)

    def test_other_install_is_not_selected(self):
        first = self.profile('right')
        second = self.profile('other', install=self.root / 'OtherZen')
        selected, _ = patch_zen.select_profile(self.install, [first, second], [first.path, second.path],
                                               is_active=lambda p: False)
        self.assertEqual(selected, first)

    def test_missing_profile_is_not_guessed(self):
        with self.assertRaisesRegex(ValueError, 'No profile found'):
            patch_zen.select_profile(self.install, [], [])

    def test_external_explicit_profile(self):
        external = self.root / 'Portable/Profile'
        external.mkdir(parents=True)
        (external / 'prefs.js').touch()
        selected, _ = patch_zen.select_profile(self.install, [], [], str(external))
        self.assertEqual(selected.local_path, external)

    def test_custom_root_uses_its_own_cache_root(self):
        profile = self.profile('custom')
        (self.roaming / 'profiles.ini').write_text(
            '[Profile0]\nName=custom\nIsRelative=1\nPath=Profiles/custom\n', encoding='utf8')
        _, selected, _ = patch_zen.discover(self.install, roaming=self.roaming)
        self.assertEqual(selected.local_path, profile.path)

    def test_cache_targets_are_only_startup_cache_directories(self):
        profile = self.profile('cache')
        for base in (profile.path, profile.local_path):
            (base / 'startupCache').mkdir(parents=True)
        self.assertEqual(set(patch_zen.cache_targets(profile)),
                         {profile.path / 'startupCache', profile.local_path / 'startupCache'})
        self.assertTrue((profile.path / 'prefs.js').exists())

    def test_registry_install_and_ambiguity(self):
        with patch.object(patch_zen, 'running_installs', return_value=[]), \
             patch.object(patch_zen, 'registry_installs', return_value=[self.install]), \
             patch.dict(os.environ, {}, clear=True):
            self.assertEqual(patch_zen.find_install([]), self.install)
        with patch.object(patch_zen, 'running_installs', return_value=[self.install, self.install / '..']), \
             patch.object(patch_zen, 'valid_install', return_value=True):
            with self.assertRaisesRegex(ValueError, 'Multiple Zen installations'):
                patch_zen.find_install([])

    def test_deploy_and_restore_with_discovered_profile(self):
        profile = self.profile('deploy')
        cache = profile.local_path / 'startupCache'
        cache.mkdir(parents=True)
        (cache / 'cache.bin').write_bytes(b'cached')
        build = self.root / 'package/build'
        manifest = {'build_id': 'fixture', 'archives': {}}
        for name in patch_zen.ARCHIVES:
            output = build / name
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(b'patched')
            manifest['archives'][name] = {
                'original_sha256': patch_zen.digest(self.install / name),
                'patched_sha256': patch_zen.digest(output),
            }
        patch_zen.write_json(build / 'manifest.json', manifest)
        with patch.object(patch_zen, 'ROOT', build.parent), patch.object(patch_zen, 'BUILD', build), \
             patch.object(patch_zen, 'require_closed'), patch('builtins.print'):
            patch_zen.deploy(self.install, profile)
            self.assertFalse(cache.exists())
            self.assertEqual((profile.path / 'prefs.js').read_text(), '// untouched')
            self.assertEqual((self.install / 'browser/omni.ja').read_bytes(), b'patched')
            patch_zen.deploy(self.install, profile, restore=True)
            self.assertEqual((self.install / 'browser/omni.ja').read_bytes(), b'original')

    SHORTCUT_FIXTURE = (patch_zen.SHORTCUT_START + '\n    return "";'
                        + patch_zen.SHORTCUT_END + '\n').encode('utf8')

    def test_build_is_reproducible(self):
        # Generated entries must inherit the source stamp: a wall-clock ZIP
        # timestamp makes every rebuild a different archive hash.
        stamp = (2010, 1, 1, 0, 0, 0)
        root = self.root / 'package'
        install = root / 'install'
        for name in patch_zen.ARCHIVES:
            path = install / name
            path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr(zipfile.ZipInfo(patch_zen.SETTINGS, stamp), b'settings')
                archive.writestr(zipfile.ZipInfo(patch_zen.SHORTCUTS, stamp), self.SHORTCUT_FIXTURE)
        (install / 'application.ini').write_text(
            '[App]\nVersion=1.23.1b\nBuildID=20261006042626\nSourceStamp=f6a167d\n'
            '[Gecko]\nMinVersion=157.0.1\n', encoding='utf8')
        (root / 'translations.ftl').write_text(
            '# @file omni.ja localization/zh-CN/toolkit/fixture.ftl\nfixture-message = 测试\n',
            encoding='utf8')
        build = root / 'build'
        results = []
        with patch.object(patch_zen, 'ROOT', root), patch.object(patch_zen, 'BUILD', build), \
             patch.object(patch_zen, 'patch_settings', side_effect=lambda text: text), \
             patch.object(patch_zen, 'patch_shortcuts', side_effect=lambda text: text), \
             patch('builtins.print'):
            # Two runs under different clocks must still produce the same archives.
            for clock in ((2026, 10, 8, 11, 0, 0), (2026, 10, 9, 12, 0, 0)):
                with patch('time.localtime', return_value=clock):
                    patch_zen.build(install)
                results.append({name: patch_zen.digest(build / name) for name in patch_zen.ARCHIVES})
            with zipfile.ZipFile(build / 'omni.ja') as produced:
                generated = produced.getinfo('localization/zh-CN/toolkit/fixture.ftl')
        self.assertEqual(generated.date_time, stamp)
        self.assertEqual(results[0], results[1])

    def pristine(self, name='pristine', application_ini=True):
        install = self.root / name
        hashes = {}
        for archive in patch_zen.ARCHIVES:
            path = install / archive
            path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(path, 'w') as output:
                output.writestr(patch_zen.SETTINGS, b'settings')
                output.writestr(patch_zen.SHORTCUTS, self.SHORTCUT_FIXTURE)
            hashes[archive] = patch_zen.digest(path)
        if application_ini:
            (install / 'application.ini').write_text(
                '[App]\nVersion=1.23.1b\nBuildID=20261006042626\n'
                'SourceStamp=f6a167d80b62a50c0ef5b9eedfb3bb777e0372f4\n'
                '[Gecko]\nMinVersion=157.0.1\n', encoding='utf8')
        return install, hashes

    def package_root(self):
        root = self.root / 'package'
        root.mkdir()
        (root / 'translations.ftl').write_text('', encoding='utf8')
        return root

    def run_build(self, install, root, metadata=None, printer=None):
        with patch.object(patch_zen, 'ROOT', root), patch.object(patch_zen, 'BUILD', root / 'build'), \
             patch.object(patch_zen, 'patch_settings', side_effect=lambda text: text), \
             patch.object(patch_zen, 'patch_shortcuts', side_effect=lambda text: text), \
             printer or patch('builtins.print'):
            return patch_zen.build(install, metadata)

    def test_build_records_source_metadata_and_hashes(self):
        # The source hashes are re-derived per build, so no baseline file is kept.
        install, hashes = self.pristine()
        root = self.package_root()
        manifest = self.run_build(install, root)
        self.assertEqual(manifest['version'], '1.23.1b')
        self.assertEqual(manifest['gecko_version'], '157.0.1')
        self.assertEqual(manifest['build_id'], '20261006042626')
        self.assertEqual(manifest['source_revision'], 'f6a167d80b62a50c0ef5b9eedfb3bb777e0372f4')
        self.assertEqual(manifest['source'], str(install))
        for archive in patch_zen.ARCHIVES:
            self.assertEqual(manifest['archives'][archive]['original_sha256'], hashes[archive])
        written = json.loads((root / 'build/manifest.json').read_text(encoding='utf8'))
        self.assertEqual(written, manifest)

    def test_build_rejects_patched_sources(self):
        install, _ = self.pristine()
        with zipfile.ZipFile(install / 'omni.ja', 'a') as output:
            output.writestr('chrome/note.txt', patch_zen.SUPPLEMENT.encode('utf8'))
        with self.assertRaisesRegex(ValueError, '已经打过补丁'):
            self.run_build(install, self.package_root())

    def test_build_takes_metadata_from_another_install(self):
        # backups/ only keeps the archives; version info must come from the app.
        install, hashes = self.pristine(application_ini=False)
        metadata = self.root / 'Apps/Zen Browser'
        (metadata / 'application.ini').write_text(
            '[App]\nVersion=9.9\nBuildID=1\nSourceStamp=abc\n[Gecko]\nMinVersion=1.0\n', encoding='utf8')
        manifest = self.run_build(install, self.package_root(), metadata)
        self.assertEqual(manifest['version'], '9.9')
        self.assertEqual(manifest['build_id'], '1')
        self.assertEqual(manifest['archives']['omni.ja']['original_sha256'], hashes['omni.ja'])

    def test_build_missing_metadata_is_reported(self):
        install, _ = self.pristine(application_ini=False)
        with self.assertRaisesRegex(ValueError, 'application.ini'):
            self.run_build(install, self.package_root())

    def test_build_saves_replaced_shortcut_body(self):
        # The wholesale-replaced region is kept so an upstream change inside it
        # can still be spotted even though no baseline hash pins the version.
        install, _ = self.pristine()
        root = self.package_root()
        manifest = self.run_build(install, root)
        saved = root / 'build/replaced/ZenKeyboardShortcuts.keyToDisplayString.mjs'
        expected = patch_zen.shortcut_body(self.SHORTCUT_FIXTURE.decode('utf8')).encode('utf8')
        self.assertEqual(saved.read_bytes(), expected)
        self.assertEqual(manifest['shortcut_display_sha256'], patch_zen.digest(saved))

    def test_build_warns_when_upstream_shortcut_body_changed(self):
        install, _ = self.pristine()
        root = self.package_root()
        self.run_build(install, root)
        manifest_path = root / 'build/manifest.json'
        stale = json.loads(manifest_path.read_text(encoding='utf8'))
        stale['shortcut_display_sha256'] = 'stale'
        patch_zen.write_json(manifest_path, stale)
        with patch('builtins.print') as printed:
            self.run_build(install, root, printer=printed)
        output = ''.join(str(call.args[0]) for call in printed.call_args_list)
        self.assertIn('上次构建不同', output)

    def test_needs_build_tracks_the_installed_build(self):
        install, _ = self.pristine()
        root = self.package_root()
        with patch.object(patch_zen, 'BUILD', root / 'build'):
            self.assertTrue(patch_zen.needs_build(install))
        self.run_build(install, root)
        with patch.object(patch_zen, 'BUILD', root / 'build'):
            self.assertFalse(patch_zen.needs_build(install))
            # An upgrade replaces the archives with files no build has seen yet.
            with zipfile.ZipFile(install / 'omni.ja', 'w') as output:
                output.writestr('chrome/new.txt', b'x')
            self.assertTrue(patch_zen.needs_build(install))

    def test_needs_build_accepts_its_own_patched_archives(self):
        install, _ = self.pristine()
        root = self.package_root()
        self.run_build(install, root)
        for archive in patch_zen.ARCHIVES:
            (install / archive).write_bytes((root / 'build' / archive).read_bytes())
        with patch.object(patch_zen, 'BUILD', root / 'build'):
            self.assertFalse(patch_zen.needs_build(install))

    def test_install_rebuilds_when_the_installation_is_unknown(self):
        profile = self.profile('upgraded')
        with patch.object(patch_zen, 'BUILD', self.root / 'new-package/build'), \
             patch.object(patch_zen, 'needs_build', return_value=True) as needs, \
             patch.object(patch_zen, 'discover', return_value=(self.install, profile, 'fixture')), \
             patch.object(patch_zen, 'require_closed'), patch.object(patch_zen, 'build') as build, \
             patch.object(patch_zen, 'deploy') as deploy, patch('builtins.print'), \
             patch('sys.argv', ['patch_zen.py', 'install']):
            patch_zen.main()
        needs.assert_called_once_with(self.install)
        build.assert_called_once_with(self.install, translate=True, codex_config=None, codex_profile=None)
        deploy.assert_called_once_with(self.install, profile, restore=False)

    def test_original_dir_defaults_to_the_build_source(self):
        install, _ = self.pristine()
        root = self.package_root()
        self.run_build(install, root)
        with patch.object(patch_zen, 'ROOT', root), patch.object(patch_zen, 'BUILD', root / 'build'):
            self.assertEqual(patch_zen.original_dir(None), install)

    def test_original_dir_reports_an_unusable_reference(self):
        install, _ = self.pristine()
        root = self.package_root()
        self.run_build(install, root)
        (install / 'omni.ja').write_bytes(b'changed')
        with patch.object(patch_zen, 'ROOT', root), patch.object(patch_zen, 'BUILD', root / 'build'):
            with self.assertRaisesRegex(SystemExit, '--original-dir'):
                patch_zen.original_dir(None)

    def test_first_install_builds_missing_payload(self):
        profile = self.profile('fresh')
        with patch.object(patch_zen, 'BUILD', self.root / 'new-package/build'), \
             patch.object(patch_zen, 'discover', return_value=(self.install, profile, 'fixture')), \
             patch.object(patch_zen, 'require_closed'), patch.object(patch_zen, 'build') as build, \
             patch.object(patch_zen, 'deploy') as deploy, patch('builtins.print'), \
             patch('sys.argv', ['patch_zen.py', 'install']):
            patch_zen.main()
            build.assert_called_once_with(self.install, translate=True, codex_config=None, codex_profile=None)
            deploy.assert_called_once_with(self.install, profile, restore=False)


if __name__ == '__main__':
    unittest.main()
