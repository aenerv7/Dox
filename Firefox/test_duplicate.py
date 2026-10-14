"""Duplicate registration planning checks; no registry access."""
from pathlib import Path
import tempfile
import unittest

import fix_duplicate as fix

MACHINE_ZEN = Path(r'C:\Program Files\Zen Browser\zen.exe')
USER_ZEN = Path(r'C:\Users\DD\AppData\Local\Programs\Zen Browser\zen.exe')
MACHINE_FIREFOX = Path(r'C:\Program Files\Mozilla Firefox\firefox.exe')
USER_FIREFOX = Path(r'C:\Users\DD\AppData\Local\Programs\Mozilla Firefox\firefox.exe')
CLIENT_KEY = 'Firefox-F0DC299D809B9700'
FIREFOX_KEY = 'Firefox-308046B0AF4A39CB'


def zen(hive, exe=MACHINE_ZEN, key_id=CLIENT_KEY):
    return fix.Entry(hive, key_id, exe, 'Zen')


def firefox(hive, exe=MACHINE_FIREFOX, key_id=FIREFOX_KEY):
    return fix.Entry(hive, key_id, exe, 'Firefox')


def unused_drive():
    # The offline case needs a volume letter nothing is mounted on.
    for letter in 'ZYXWVUTSRQ':
        root = Path(f'{letter}:\\')
        if not root.exists():
            return root
    return None


class ParseTests(unittest.TestCase):
    def test_quoted_command_line(self):
        self.assertEqual(fix.parse_executable(r'"C:\Program Files\Zen Browser\zen.exe" -safe-mode'), MACHINE_ZEN)

    def test_icon_reference_keeps_spaces(self):
        self.assertEqual(fix.parse_executable(r'C:\Program Files\Zen Browser\zen.exe,0'), MACHINE_ZEN)

    def test_empty_value(self):
        self.assertIsNone(fix.parse_executable(''))


class ProbeTests(unittest.TestCase):
    def test_existing_file_is_live(self):
        self.assertEqual(fix.probe_state(Path(__file__).resolve()), fix.LIVE)

    def test_missing_file_on_present_volume_is_gone(self):
        missing = Path(tempfile.gettempdir()) / 'no-such-zen.exe'
        self.assertEqual(fix.probe_state(missing), fix.GONE)

    def test_missing_volume_is_offline(self):
        root = unused_drive()
        if root is None:
            self.skipTest('every candidate drive letter is mounted')
        self.assertEqual(fix.probe_state(root / 'Zen' / 'zen.exe'), fix.OFFLINE)


class ClassifyTests(unittest.TestCase):
    def classify(self, entries, states=None):
        states = states or {}
        return fix.classify(entries, probe=lambda path: states.get(fix.normal(path), fix.LIVE))

    def test_same_executable_in_both_hives_keeps_machine(self):
        plan = self.classify([zen('HKLM'), zen('HKCU')])
        self.assertEqual(plan.keeps[0].hive, 'HKLM')
        self.assertEqual([entry.hive for entry in plan.remove], ['HKCU'])
        self.assertEqual(plan.unresolved, [])

    def test_machine_entry_alone_is_untouched(self):
        plan = self.classify([zen('HKLM')])
        self.assertEqual(plan.keeps[0].hive, 'HKLM')
        self.assertEqual(plan.remove, [])

    def test_user_entry_alone_is_untouched(self):
        plan = self.classify([zen('HKCU', USER_ZEN)])
        self.assertEqual(plan.keeps[0].hive, 'HKCU')
        self.assertEqual(plan.remove, [])

    def test_two_live_installations_are_not_removed(self):
        plan = self.classify([zen('HKLM'), zen('HKCU', USER_ZEN)])
        self.assertEqual(plan.keeps[0].hive, 'HKLM')
        self.assertEqual(plan.remove, [])
        self.assertEqual([entry.hive for entry in plan.unresolved], ['HKCU'])

    def test_dead_machine_entry_yields_to_live_user_entry(self):
        plan = self.classify([zen('HKLM'), zen('HKCU', USER_ZEN)], {fix.normal(MACHINE_ZEN): fix.GONE})
        self.assertEqual(plan.keeps[0].exe, USER_ZEN)
        self.assertEqual([entry.hive for entry in plan.remove], ['HKLM'])

    def test_offline_volume_is_not_treated_as_dead(self):
        offline = Path(r'Z:\Zen\zen.exe')
        plan = self.classify([zen('HKLM', offline), zen('HKCU', USER_ZEN)], {fix.normal(offline): fix.OFFLINE})
        self.assertEqual(plan.keeps[0].exe, USER_ZEN)
        self.assertEqual(plan.remove, [])
        self.assertEqual([entry.exe for entry in plan.unresolved], [offline])

    def test_unrelated_browsers_are_ignored(self):
        chrome = fix.Entry('HKLM', 'ChromeHTML', Path(r'C:\Program Files\Google\Chrome\chrome.exe'), 'Chrome')
        plan = self.classify([chrome, zen('HKCU')])
        self.assertEqual(plan.keeps[0].hive, 'HKCU')
        self.assertEqual(plan.remove, [])
        self.assertEqual(plan.unresolved, [])

    def test_second_key_for_same_executable_is_removed(self):
        plan = self.classify([zen('HKLM'), zen('HKLM', key_id='Zen')])
        self.assertEqual(plan.keeps[0].key_id, CLIENT_KEY)
        self.assertEqual([entry.key_id for entry in plan.remove], ['Zen'])

    def test_nothing_to_keep_removes_nothing(self):
        plan = self.classify([zen('HKLM')], {fix.normal(MACHINE_ZEN): fix.GONE})
        self.assertEqual(plan.keeps, [])
        self.assertEqual(plan.remove, [])
        self.assertEqual([entry.hive for entry in plan.unresolved], ['HKLM'])


class BothBrowsersTests(unittest.TestCase):
    """Firefox and Zen share the registration scheme, so each browser is planned on its own."""

    def classify(self, entries, states=None):
        states = states or {}
        return fix.classify(entries, probe=lambda path: states.get(fix.normal(path), fix.LIVE))

    def test_duplicate_firefox_entry_is_removed(self):
        plan = self.classify([firefox('HKLM'), firefox('HKCU')])
        self.assertEqual([entry.hive for entry in plan.keeps], ['HKLM'])
        self.assertEqual([entry.hive for entry in plan.remove], ['HKCU'])

    def test_firefox_duplicates_only_touch_firefox(self):
        plan = self.classify([firefox('HKLM'), firefox('HKCU'), zen('HKLM')])
        self.assertEqual([entry.key_id for entry in plan.keeps], [FIREFOX_KEY, CLIENT_KEY])
        self.assertEqual([entry.hive for entry in plan.remove], ['HKCU'])

    def test_live_zen_is_not_a_second_firefox_installation(self):
        plan = self.classify([firefox('HKLM'), zen('HKCU', USER_ZEN)])
        self.assertEqual([entry.exe for entry in plan.keeps], [MACHINE_FIREFOX, USER_ZEN])
        self.assertEqual(plan.remove, [])
        self.assertEqual(plan.unresolved, [])

    def test_dead_zen_entry_is_removed_next_to_live_firefox(self):
        plan = self.classify([firefox('HKLM'), zen('HKLM'), zen('HKCU', USER_ZEN)],
                             {fix.normal(MACHINE_ZEN): fix.GONE})
        self.assertEqual([entry.exe for entry in plan.keeps], [MACHINE_FIREFOX, USER_ZEN])
        self.assertEqual([entry.exe for entry in plan.remove], [MACHINE_ZEN])

    def test_sole_dead_zen_entry_survives_a_live_firefox(self):
        # The last registration of a browser is reported, never deleted, whoever else is installed.
        plan = self.classify([firefox('HKLM'), zen('HKLM')], {fix.normal(MACHINE_ZEN): fix.GONE})
        self.assertEqual([entry.exe for entry in plan.keeps], [MACHINE_FIREFOX])
        self.assertEqual(plan.remove, [])
        self.assertEqual([entry.exe for entry in plan.unresolved], [MACHINE_ZEN])

    def test_no_registration_yields_no_plan(self):
        plan = self.classify([])
        self.assertEqual(plan.keeps, [])
        self.assertEqual(plan.remove, [])
        self.assertEqual(plan.unresolved, [])


class FakeKey:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *error):
        return False


class FakeReg:
    """Minimal winreg stand-in shaped as {hive: {key path: {value name: data}}}."""

    HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER = 'HKLM', 'HKCU'
    KEY_READ = KEY_SET_VALUE = KEY_WOW64_64KEY = 0

    def __init__(self, keys):
        self.keys = keys

    def OpenKey(self, root, path, reserved, access):
        try:
            return FakeKey(self.keys[root][path])
        except KeyError:
            raise FileNotFoundError(path)

    def QueryValueEx(self, key, name):
        if name not in key.data:
            raise FileNotFoundError(name)
        return key.data[name], 1

    def EnumValue(self, key, index):
        name, data = list(key.data.items())[index]
        return name, data, 1

    def QueryInfoKey(self, key):
        return 0, len(key.data), 0


def registered_only(*apps):
    # (hive, key id, exe, display name) as an installer writes them.
    keys = {'HKLM': {}, 'HKCU': {}}
    for hive, key_id, exe, name in apps:
        capabilities = rf'Software\Clients\StartMenuInternet\{key_id}\Capabilities'
        keys[hive].setdefault(fix.REGISTERED, {})[key_id] = capabilities
        keys[hive][capabilities] = {'ApplicationName': name, 'ApplicationIcon': f'{exe},0'}
    return keys


class ReadEntriesTests(unittest.TestCase):
    """Detection over a fake registry: the executable name decides what the script sees."""

    def read(self, keys):
        original = fix.registry
        fix.registry = lambda: FakeReg(keys)
        try:
            return fix.read_entries()
        finally:
            fix.registry = original

    def test_firefox_and_zen_are_both_detected(self):
        entries = self.read(registered_only(('HKLM', FIREFOX_KEY, MACHINE_FIREFOX, 'Firefox'),
                                            ('HKCU', CLIENT_KEY, USER_ZEN, 'Zen')))
        self.assertEqual([entry.key_id for entry in entries], [FIREFOX_KEY, CLIENT_KEY])
        self.assertEqual([entry.name for entry in entries], ['Firefox', 'Zen'])

    def test_unrelated_browser_registration_is_skipped(self):
        chrome = Path(r'C:\Program Files\Google\Chrome\chrome.exe')
        entries = self.read(registered_only(('HKLM', 'ChromeHTML', chrome, 'Chrome')))
        self.assertEqual(entries, [])

    def test_unreadable_hive_is_skipped(self):
        keys = registered_only(('HKCU', CLIENT_KEY, USER_ZEN, 'Zen'))
        del keys['HKLM']
        self.assertEqual([entry.hive for entry in self.read(keys)], ['HKCU'])


if __name__ == '__main__':
    unittest.main()
