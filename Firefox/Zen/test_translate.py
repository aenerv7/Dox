"""Translation gap detection, write-back and Codex config checks; uses only temporary fixtures."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import patch_zen


class MessageTests(unittest.TestCase):
    def test_message_ids_match_top_level_entries_only(self):
        text = '# comment\nfoo = One\nbar =\n    .label = Two\n    .tooltiptext = Three\n'
        self.assertEqual(patch_zen.message_ids(text), ['foo', 'bar'])

    def test_message_block_stops_at_next_message(self):
        text = 'foo = One\nbar =\n    .label = Two\n'
        self.assertEqual(patch_zen.message_block(text, 'foo'), 'foo = One')
        self.assertEqual(patch_zen.message_block(text, 'bar'), 'bar =\n    .label = Two')

    def test_structure_ignores_wording_but_not_syntax(self):
        source = 'library-media-turn-off =\n    .label = Turn off Media'
        self.assertEqual(patch_zen.structure(source),
                         patch_zen.structure('library-media-turn-off =\n    .label = 关闭媒体'))
        self.assertNotEqual(patch_zen.structure(source),
                            patch_zen.structure('library-media-turn-off =\n    .label = 关闭 { $name }'))

    def test_validate_message_rejects_broken_output(self):
        source = 'a = { $count } items <b data-l10n-name="x">'
        patch_zen.validate_message('a', source, 'a = { $count } 个项目 <b data-l10n-name="x">')
        for broken in ('b = { $count } 个项目', 'a = 项目', 'a = { $count } 个项目 <b>', ''):
            with self.assertRaises(patch_zen.TranslationError):
                patch_zen.validate_message('a', source, broken)


class InstallFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='zen-translate-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.install = self.root / 'install'
        self.install.mkdir()
        self.archive('omni.ja', {'localization/en-US/toolkit/a.ftl': 'a-one = One\na-two = Two\n',
                                 'localization/zh-CN/toolkit/a.ftl': 'a-one = 一\n'})
        self.archive('browser/omni.ja', {'localization/en-US/browser/b.ftl': 'b-one = One\n'})

    def archive(self, name, resources):
        path = self.install / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path, 'w') as target:
            for resource, text in resources.items():
                target.writestr(resource, text)


class GapTests(InstallFixture):
    def test_gaps_cover_new_ids_and_are_filled_by_additions(self):
        additions = {archive: {} for archive in patch_zen.ARCHIVES}
        self.assertEqual([(a, r, m) for a, r, m, _ in patch_zen.translation_gaps(self.install, additions)],
                         [('omni.ja', 'localization/zh-CN/toolkit/a.ftl', 'a-two'),
                          ('browser/omni.ja', 'localization/zh-CN/browser/b.ftl', 'b-one')])
        additions['omni.ja']['localization/zh-CN/toolkit/a.ftl'] = 'a-two = 二\n'
        additions['browser/omni.ja']['localization/zh-CN/browser/b.ftl'] = 'b-one = 一\n'
        self.assertEqual(patch_zen.translation_gaps(self.install, additions), [])


class WriteBackTests(InstallFixture):
    def test_appends_to_existing_section_and_adds_new_one(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            (root / 'translations.ftl').write_text(
                '# @file omni.ja localization/zh-CN/toolkit/a.ftl\na-one = 一\n\n'
                '# @file omni.ja localization/zh-CN/toolkit/b.ftl\nb-one = 一\n', encoding='utf-8')
            entries = [('omni.ja', 'localization/zh-CN/toolkit/a.ftl', 'a-two', 'a-two = 二'),
                       ('omni.ja', 'localization/zh-CN/toolkit/c.ftl', 'c-one', 'c-one = 一'),
                       ('omni.ja', 'localization/zh-CN/toolkit/c.ftl', 'c-two', 'c-two = 二')]
            with patch.object(patch_zen, 'ROOT', root):
                self.assertEqual(patch_zen.update_translations_file(entries), 3)
                # The messages now exist, so a repeated run adds nothing.
                self.assertEqual(patch_zen.update_translations_file(entries), 0)
                self.assertEqual(patch_zen.fragments(),
                                 {'omni.ja': {'localization/zh-CN/toolkit/a.ftl': 'a-one = 一\na-two = 二\n',
                                              'localization/zh-CN/toolkit/b.ftl': 'b-one = 一\n',
                                              'localization/zh-CN/toolkit/c.ftl': 'c-one = 一\nc-two = 二\n'},
                                  'browser/omni.ja': {}})
            text = (root / 'translations.ftl').read_text(encoding='utf-8')
            self.assertIn('a-one = 一\na-two = 二\n\n# @file omni.ja localization/zh-CN/toolkit/b.ftl\n', text)
            self.assertTrue(text.endswith(
                '# @file omni.ja localization/zh-CN/toolkit/c.ftl\nc-one = 一\nc-two = 二\n'))


class FakeClient:
    def __init__(self, answers):
        self.answers = answers

    def translate(self, messages):
        return {key: self.answers[key] for key in messages}


class SyncTests(InstallFixture):
    def sync(self, answers):
        config = self.root / 'config.toml'
        config.write_text('', encoding='utf-8')
        root = self.root / 'module'
        root.mkdir()
        (root / 'translations.ftl').write_text(
            '# @file omni.ja localization/zh-CN/toolkit/a.ftl\na-one = 一\n', encoding='utf-8')
        additions = {archive: {} for archive in patch_zen.ARCHIVES}
        with patch.object(patch_zen, 'ROOT', root), \
                patch.object(patch_zen.TranslationClient, 'from_codex', return_value=FakeClient(answers)):
            with self.assertRaises(SystemExit):
                patch_zen.sync_translations(self.install, additions, config_path=config)
        return (root / 'translations.ftl').read_text(encoding='utf-8')

    def test_sync_fills_gaps_and_stops_the_build(self):
        text = self.sync({'omni.ja/localization/zh-CN/toolkit/a.ftl:a-two': 'a-two = 二',
                          'browser/omni.ja/localization/zh-CN/browser/b.ftl:b-one': 'b-one = 一'})
        self.assertIn('a-one = 一\na-two = 二\n', text)
        self.assertTrue(text.endswith(
            '# @file browser/omni.ja localization/zh-CN/browser/b.ftl\nb-one = 一\n'))

    def test_broken_translation_is_not_written(self):
        config = self.root / 'config.toml'
        config.write_text('', encoding='utf-8')
        root = self.root / 'module'
        root.mkdir()
        (root / 'translations.ftl').write_text('# @file omni.ja localization/zh-CN/toolkit/a.ftl\n',
                                               encoding='utf-8')
        additions = {archive: {} for archive in patch_zen.ARCHIVES}
        with patch.object(patch_zen, 'ROOT', root), \
                patch.object(patch_zen.TranslationClient, 'from_codex', return_value=FakeClient(
                    {'omni.ja/localization/zh-CN/toolkit/a.ftl:a-two': 'a-two = 二 { $n }',
                     'browser/omni.ja/localization/zh-CN/browser/b.ftl:b-one': 'b-one = 一'})):
            with self.assertRaises(patch_zen.TranslationError):
                patch_zen.sync_translations(self.install, additions, config_path=config)
        self.assertNotIn('a-two', (root / 'translations.ftl').read_text(encoding='utf-8'))


class CodexConfigTests(unittest.TestCase):
    def config(self, base_url='https://example.test/v1', key='MY_KEY'):
        self.temp = tempfile.TemporaryDirectory(prefix='zen-codex-test-')
        self.addCleanup(self.temp.cleanup)
        path = Path(self.temp.name) / 'config.toml'
        env_line = f'env_key = "{key}"\n' if key else ''
        path.write_text('model = "gpt-test"\nmodel_provider = "local"\n'
                        '[model_providers.local]\n'
                        f'base_url = "{base_url}"\n{env_line}wire_api = "chat"\n', encoding='utf-8')
        return path

    def test_reads_provider_model_and_key(self):
        with patch.dict(os.environ, {'MY_KEY': 'secret'}):
            client = patch_zen.TranslationClient.from_codex(self.config())
        self.assertEqual((client.base_url, client.model, client.wire_api),
                         ('https://example.test/v1', 'gpt-test', 'chat'))
        self.assertEqual(client.headers['Authorization'], 'Bearer secret')

    def test_missing_key_and_plain_http_are_rejected(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(patch_zen.TranslationError):
                patch_zen.TranslationClient.from_codex(self.config())
        with patch.dict(os.environ, {'MY_KEY': 'secret'}):
            with self.assertRaises(patch_zen.TranslationError):
                patch_zen.TranslationClient.from_codex(self.config(base_url='http://example.test/v1'))


if __name__ == '__main__':
    unittest.main()
