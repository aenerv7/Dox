"""Portable discovery and deployment checks; uses only temporary fixtures."""
import ctypes
from pathlib import Path
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import discovery
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
        return discovery.Profile(path, name, self.local / 'Profiles' / name,
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
        profiles, defaults = discovery.load_profiles(self.roaming, self.local)
        selected, reason = discovery.select_profile(self.install, profiles, defaults, is_active=lambda p: False)
        self.assertEqual(selected.path, first.path)
        self.assertEqual(selected.local_path, first.local_path)
        self.assertEqual(reason, 'installation default')
        self.assertEqual(profiles[1].local_path, external)

    def test_running_profile_overrides_default_and_stale_lock(self):
        first, second = self.profile('default'), self.profile('current')
        selected, reason = discovery.select_profile(self.install, [first, second], [first.path],
                                                    is_active=lambda p: p == second)
        self.assertEqual(selected, second)
        self.assertEqual(reason, 'running profile')
        (first.path / 'parent.lock').touch()
        self.assertFalse(discovery.profile_in_use(first))

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
            self.assertTrue(discovery.profile_in_use(profile))
        finally:
            kernel.CloseHandle(handle)

    def test_ambiguous_defaults_require_explicit_selection(self):
        first, second = self.profile('one'), self.profile('two')
        with self.assertRaisesRegex(ValueError, 'Multiple possible profiles'):
            discovery.select_profile(self.install, [first, second], [first.path, second.path], is_active=lambda p: False)
        selected, _ = discovery.select_profile(self.install, [first, second], [], explicit=str(second.path))
        self.assertEqual(selected, second)

    def test_other_install_is_not_selected(self):
        first = self.profile('right')
        second = self.profile('other', install=self.root / 'OtherZen')
        selected, _ = discovery.select_profile(self.install, [first, second], [first.path, second.path],
                                               is_active=lambda p: False)
        self.assertEqual(selected, first)

    def test_missing_profile_is_not_guessed(self):
        with self.assertRaisesRegex(ValueError, 'No profile found'):
            discovery.select_profile(self.install, [], [])

    def test_external_explicit_profile(self):
        external = self.root / 'Portable/Profile'
        external.mkdir(parents=True)
        (external / 'prefs.js').touch()
        selected, _ = discovery.select_profile(self.install, [], [], str(external))
        self.assertEqual(selected.local_path, external)

    def test_custom_root_uses_its_own_cache_root(self):
        profile = self.profile('custom')
        (self.roaming / 'profiles.ini').write_text(
            '[Profile0]\nName=custom\nIsRelative=1\nPath=Profiles/custom\n', encoding='utf8')
        _, selected, _ = discovery.discover(self.install, roaming=self.roaming)
        self.assertEqual(selected.local_path, profile.path)

    def test_cache_targets_are_only_startup_cache_directories(self):
        profile = self.profile('cache')
        for base in (profile.path, profile.local_path):
            (base / 'startupCache').mkdir(parents=True)
        self.assertEqual(set(discovery.cache_targets(profile)),
                         {profile.path / 'startupCache', profile.local_path / 'startupCache'})
        self.assertTrue((profile.path / 'prefs.js').exists())

    def test_registry_install_and_ambiguity(self):
        with patch.object(discovery, 'running_installs', return_value=[]), \
             patch.object(discovery, 'registry_installs', return_value=[self.install]), \
             patch.dict(os.environ, {}, clear=True):
            self.assertEqual(discovery.find_install([]), self.install)
        with patch.object(discovery, 'running_installs', return_value=[self.install, self.install / '..']), \
             patch.object(discovery, 'valid_install', return_value=True):
            with self.assertRaisesRegex(ValueError, 'Multiple Zen installations'):
                discovery.find_install([])

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

    def test_first_install_builds_missing_payload(self):
        profile = self.profile('fresh')
        with patch.object(patch_zen, 'BUILD', self.root / 'new-package/build'), \
             patch.object(patch_zen, 'discover', return_value=(self.install, profile, 'fixture')), \
             patch.object(patch_zen, 'require_closed'), patch.object(patch_zen, 'build') as build, \
             patch.object(patch_zen, 'deploy') as deploy, patch('builtins.print'), \
             patch('sys.argv', ['patch_zen.py', 'install']):
            patch_zen.main()
            build.assert_called_once_with(self.install)
            deploy.assert_called_once_with(self.install, profile, restore=False)


if __name__ == '__main__':
    unittest.main()
