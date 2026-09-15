"""翻译补全、缓存与语言包写入的回归测试；不访问网络或真实安装目录。"""

import contextlib
import io
import json
import os
import struct
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import helium_language_patcher as hp


def pack(strings):
    return hp.DataPack(5, struct.pack("<IB3xHH", 5, 1, 0, 0),
                       {key: value.encode("utf-8") for key, value in strings.items()})


class TranslationTests(unittest.TestCase):
    def test_scan_deduplicates_and_preserves_translated_and_manual_entries(self):
        english = pack({1: "Show loading progress", 2: "Show loading progress",
                        3: "Existing translation", 4: "Manual translation",
                        5: "New setting", 6: "Differentiate hibernated tabs"})
        target = pack({1: "Show loading progress", 2: "Show loading progress",
                       3: "已有翻译", 4: "Manual translation",
                       6: "Differentiate hibernated tabs"})
        found, skipped = hp.find_untranslated(english, target, {"Manual translation": "手工翻译"})
        self.assertEqual(found, ["Show loading progress", "New setting", "Differentiate hibernated tabs"])
        self.assertEqual(skipped, 0)

    def test_scan_excludes_non_ui_resources_and_reports_icu(self):
        strings = {1: ",Noto Sans SC,Microsoft YaHei", 2: "manage, change, update",
                   3: "https://example.com", 4: "YYYY", 5: "$1 - $2",
                   6: "{COUNT, plural, =1 {One tab} other {Many tabs}}",
                   7: "Impact", 8: "Consolas", 9: "en-US", 10: "serialNumber",
                   11: "bookmarks_$1.html", 12: "Alt+L", 13: "$1 KB/s",
                   14: "change language, translate", 15: "Microsoft YaHei"}
        found, skipped = hp.find_untranslated(pack(strings), pack(strings), {})
        self.assertEqual(found, [])
        self.assertEqual(skipped, 1)

    def test_translation_preserves_structural_tokens(self):
        hp.validate_translation('Open <a href="$1">$2</a> &amp; %s',
                                '打开 <a href="$1">$2</a> &amp; %s')
        for source, translated in [
            ("Remove $1", "移除"),
            ("Open %s", "打开 %d"),
            ('<a href="$1">Open</a>', '<a href="$2">打开</a>'),
            ("Visit https://example.com", "访问 https://other.example"),
            ("Hello", ""),
        ]:
            with self.subTest(source=source), self.assertRaises(hp.TranslationError):
                hp.validate_translation(source, translated)

    def test_codex_config_profile_and_environment_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.toml"
            path.write_text('''model = "default-model"
model_provider = "custom"
[model_providers.custom]
base_url = "https://example.com/v1"
experimental_bearer_token = "test-only-token"
wire_api = "responses"
[profiles.translate]
model = "translation-model"
''', encoding="utf-8")
            client = hp.TranslationClient.from_codex(path, "translate")
            self.assertEqual(client.model, "translation-model")
            self.assertEqual(client.headers["Authorization"], "Bearer test-only-token")
            self.assertNotIn("test-only-token", repr(client))
            path.write_text(path.read_text().replace('experimental_bearer_token = "test-only-token"',
                                                     'env_key = "HELIUM_TEST_KEY"'))
            with patch.dict(os.environ, {"HELIUM_TEST_KEY": "env-test-token"}):
                client = hp.TranslationClient.from_codex(path)
                self.assertEqual(client.headers["Authorization"], "Bearer env-test-token")
            with patch.dict(os.environ, {}, clear=True), self.assertRaises(hp.TranslationError):
                hp.TranslationClient.from_codex(path)

    def response(self, result):
        return io.BytesIO(json.dumps(result).encode())

    def test_responses_request_and_result(self):
        client = hp.TranslationClient("https://example.com", "test-model", {"Authorization": "Bearer test"})
        payload = {"status": "completed", "output": [{"type": "message", "content": [
            {"type": "output_text", "text": json.dumps({"0": "打开 $1"})}]}]}
        with patch.object(hp.urllib.request, "build_opener") as build:
            build.return_value.open.return_value = self.response(payload)
            self.assertEqual(client.translate(["Open $1"], "zh-CN"), {"Open $1": "打开 $1"})
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, "https://example.com/responses")
            body = json.loads(request.data)
            self.assertFalse(body["store"])
            self.assertEqual(json.loads(body["input"])["target_locale"], "zh-CN")

    def test_chat_request_and_result(self):
        client = hp.TranslationClient("https://example.com/v1", "test-model", {}, "chat")
        payload = {"choices": [{"finish_reason": "stop", "message": {"content": '{"0":"打开"}'}}]}
        with patch.object(hp.urllib.request, "build_opener") as build:
            build.return_value.open.return_value = self.response(payload)
            self.assertEqual(client.translate(["Open"], "zh-CN"), {"Open": "打开"})
            self.assertEqual(build.return_value.open.call_args.args[0].full_url,
                             "https://example.com/v1/chat/completions")

    def test_bad_responses_and_http_errors_do_not_expose_response_or_key(self):
        client = hp.TranslationClient("https://example.com", "test-model", {})
        for answer in ['{}', '{"0":"打开", "1":"额外"}', '{"0":null}', 'not json']:
            payload = {"output": [{"type": "message", "content": [{"type": "output_text", "text": answer}]}]}
            with patch.object(hp.urllib.request, "build_opener") as build:
                build.return_value.open.return_value = self.response(payload)
                with self.assertRaises(hp.TranslationError):
                    client.translate(["Open"], "zh-CN")
        with patch.object(hp.urllib.request, "build_opener") as build:
            build.return_value.open.side_effect = urllib.error.HTTPError(
                "https://example.com?key=secret", 401, "secret", {}, None)
            with self.assertRaisesRegex(hp.TranslationError, "^Translation API returned HTTP 401$"):
                client.translate(["Open"], "zh-CN")

    def test_partial_batches_are_cached_and_retry_only_needs_remaining_strings(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "zh-CN-overrides.json"
            hp.save_overrides(path, {"Manual": "手工"})
            client = hp.TranslationClient("https://example.com", "test-model", {})
            with patch.object(hp.TranslationClient, "translate", side_effect=[
                {"First setting": "第一个设置"}, hp.TranslationError("Failed")
            ]), self.assertRaises(hp.TranslationError):
                hp.update_overrides(path, hp.load_overrides(path), ["First setting", "Second setting"], "zh-CN", client, 1)
            cached = hp.load_overrides(path)
            self.assertEqual(cached, {"Manual": "手工", "First setting": "第一个设置"})
            fixture = pack({1: "First setting", 2: "Second setting"})
            self.assertEqual(hp.find_untranslated(fixture, fixture, cached)[0], ["Second setting"])
            backup = path.with_name(path.name + ".bak")
            self.assertEqual(hp.load_overrides(backup), {"Manual": "手工"})

    def test_backups_overwrite_single_file_and_remove_only_legacy_backups(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("zh-CN-overrides.json", "zh-CN.pak"):
                with self.subTest(name=name):
                    target = Path(tmp) / name
                    target.write_bytes(b"first version")
                    legacy = target.with_name(name + ".bak-20260914-120000-1")
                    legacy.write_bytes(b"legacy version")
                    unrelated = target.with_name(name + ".bak-manual")
                    unrelated.write_bytes(b"manual backup")
                    backup = hp.backup_existing(target)
                    self.assertEqual(backup.name, name + ".bak")
                    self.assertEqual(backup.read_bytes(), b"first version")
                    self.assertFalse(legacy.exists())
                    self.assertTrue(unrelated.exists())
                    target.write_bytes(b"second version")
                    self.assertEqual(hp.backup_existing(target), backup)
                    self.assertEqual(backup.read_bytes(), b"second version")
                    self.assertEqual(list(Path(tmp).glob(name + ".bak")), [backup])

    def test_failed_cache_replace_preserves_original(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "table.json"
            hp.save_overrides(path, {"Old": "旧"})
            with patch.object(hp.os, "replace", side_effect=PermissionError), self.assertRaises(PermissionError):
                hp.save_overrides(path, {"New": "新"})
            self.assertEqual(hp.load_overrides(path), {"Old": "旧"})
            self.assertEqual(list(Path(tmp).glob("*.tmp")), [])

    def test_main_dry_run_apply_cache_and_offline(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "locales").mkdir()
            for name in ("chrome.exe", "chrome.dll", "helium_update_helper.exe"):
                (root / name).touch()
            english = pack({1: "New setting", 2: "Existing setting"})
            target = pack({1: "New setting", 2: "已有设置"})
            (root / "locales/en-US.pak").write_bytes(english.build())
            target_path = root / "locales/zh-CN.pak"
            target_path.write_bytes(target.build())
            table = root / "zh-CN-overrides.json"
            args = ["patcher", "--root", str(root), "--overrides", str(table)]
            with patch.object(hp.TranslationClient, "from_codex") as config, contextlib.redirect_stdout(io.StringIO()):
                with patch.object(sys, "argv", args):
                    self.assertEqual(hp.main(), 0)
                config.assert_not_called()
                self.assertFalse(table.exists())
                self.assertEqual(target_path.read_bytes(), target.build())
                config.return_value.translate.return_value = {"New setting": "新设置"}
                with patch.object(sys, "argv", args + ["--apply"]):
                    self.assertEqual(hp.main(), 0)
                self.assertEqual(hp.DataPack.load(target_path).resources,
                                 {1: "新设置".encode(), 2: "已有设置".encode()})
                config.assert_called_once()
                config.reset_mock()
                with patch.object(sys, "argv", args + ["--apply"]):
                    self.assertEqual(hp.main(), 0)
                config.assert_not_called()
                # 更新覆盖语言包后，离线模式仍可重新应用缓存。
                target_path.write_bytes(target.build())
                with patch.object(sys, "argv", args + ["--apply", "--offline"]):
                    self.assertEqual(hp.main(), 0)
                config.assert_not_called()
                self.assertEqual(hp.DataPack.load(target_path).resources[1], "新设置".encode())


class InstallationTests(unittest.TestCase):
    def make_version(self, application, version):
        application.mkdir(parents=True, exist_ok=True)
        (application / "chrome.exe").touch()
        resources = application / version
        (resources / "Locales").mkdir(parents=True)
        (resources / "chrome.dll").touch()
        (resources / "helium_update_helper.exe").touch()
        data = pack({1: "New setting"}).build()
        for name in ("en-US.pak", "zh-CN.pak"):
            (resources / "Locales" / name).write_bytes(data)
        return resources

    def test_install_root_application_and_explicit_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            application = root / "Application"
            active = self.make_version(application, "0.17.0.1")
            self.make_version(application, "0.18.0.0")
            with patch.object(hp, "read_file_version", return_value="0.17.0.1"):
                for entry in (root, application, active):
                    with self.subTest(entry=entry):
                        result = hp.resolve_helium_install(entry)
                        self.assertEqual(result.resources, active)
                        self.assertEqual(result.locales, active / "Locales")
                        self.assertEqual(result.executable, application / "chrome.exe")

    def test_unknown_version_falls_back_only_when_unambiguous(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(hp, "read_file_version", return_value=None):
            root = Path(tmp)
            first = self.make_version(root / "Application", "0.17.0.1")
            self.assertEqual(hp.resolve_helium_install(root).resources, first)
            self.make_version(root / "Application", "0.18.0.0")
            with self.assertRaisesRegex(ValueError, "Cannot determine the active"):
                hp.resolve_helium_install(root)

    def test_missing_active_version_does_not_patch_another_version(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(hp, "read_file_version", return_value="0.18.0.0"):
            root = Path(tmp)
            self.make_version(root / "Application", "0.17.0.1")
            with self.assertRaisesRegex(ValueError, "resources are missing or incomplete"):
                hp.resolve_helium_install(root)

    def test_non_helium_resources_rejected(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(hp, "read_file_version", return_value="0.17.0.1"):
            root = Path(tmp)
            resource = self.make_version(root / "Application", "0.17.0.1")
            (resource / "helium_update_helper.exe").unlink()
            with self.assertRaises(ValueError):
                hp.resolve_helium_install(root)

    def test_apply_only_changes_selected_version_and_creates_bak_beside_pack(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            active = self.make_version(root / "Application", "0.17.0.1")
            other = self.make_version(root / "Application", "0.16.0.0")
            target = active / "Locales/zh-CN.pak"
            original = target.read_bytes()
            table = root / "zh-CN-overrides.json"
            hp.save_overrides(table, {"New setting": "新设置"})
            args = ["patcher", "--root", str(root), "--overrides", str(table), "--offline", "--apply"]
            with patch.object(hp, "read_file_version", return_value="0.17.0.1"), patch.object(sys, "argv", args), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(hp.main(), 0)
            self.assertEqual(hp.DataPack.load(target).resources[1], "新设置".encode())
            self.assertEqual((active / "Locales/zh-CN.pak.bak").read_bytes(), original)
            self.assertEqual((active / "Locales/en-US.pak").read_bytes(), original)
            self.assertEqual((other / "Locales/zh-CN.pak").read_bytes(), original)
            self.assertFalse((other / "Locales/zh-CN.pak.bak").exists())


if __name__ == "__main__":
    unittest.main()
