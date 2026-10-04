"""Duplicate registration planning checks; no registry access."""
from pathlib import Path
import tempfile
import unittest

import fix_zen_duplicate as fix

MACHINE_ZEN = Path(r'C:\Program Files\Zen Browser\zen.exe')
USER_ZEN = Path(r'C:\Users\DD\AppData\Local\Programs\Zen Browser\zen.exe')
CLIENT_KEY = 'Firefox-F0DC299D809B9700'


def zen(hive, exe=MACHINE_ZEN, key_id=CLIENT_KEY):
    return fix.Entry(hive, key_id, exe, 'Zen')


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
        self.assertEqual(plan.keep.hive, 'HKLM')
        self.assertEqual([entry.hive for entry in plan.remove], ['HKCU'])
        self.assertEqual(plan.unresolved, [])

    def test_machine_entry_alone_is_untouched(self):
        plan = self.classify([zen('HKLM')])
        self.assertEqual(plan.keep.hive, 'HKLM')
        self.assertEqual(plan.remove, [])

    def test_user_entry_alone_is_untouched(self):
        plan = self.classify([zen('HKCU', USER_ZEN)])
        self.assertEqual(plan.keep.hive, 'HKCU')
        self.assertEqual(plan.remove, [])

    def test_two_live_installations_are_not_removed(self):
        plan = self.classify([zen('HKLM'), zen('HKCU', USER_ZEN)])
        self.assertEqual(plan.keep.hive, 'HKLM')
        self.assertEqual(plan.remove, [])
        self.assertEqual([entry.hive for entry in plan.unresolved], ['HKCU'])

    def test_dead_machine_entry_yields_to_live_user_entry(self):
        plan = self.classify([zen('HKLM'), zen('HKCU', USER_ZEN)], {fix.normal(MACHINE_ZEN): fix.GONE})
        self.assertEqual(plan.keep.exe, USER_ZEN)
        self.assertEqual([entry.hive for entry in plan.remove], ['HKLM'])

    def test_offline_volume_is_not_treated_as_dead(self):
        offline = Path(r'Z:\Zen\zen.exe')
        plan = self.classify([zen('HKLM', offline), zen('HKCU', USER_ZEN)], {fix.normal(offline): fix.OFFLINE})
        self.assertEqual(plan.keep.exe, USER_ZEN)
        self.assertEqual(plan.remove, [])
        self.assertEqual([entry.exe for entry in plan.unresolved], [offline])

    def test_other_browsers_are_ignored(self):
        firefox = fix.Entry('HKLM', 'Firefox-1234', Path(r'C:\Program Files\Mozilla Firefox\firefox.exe'), 'Firefox')
        plan = self.classify([firefox, zen('HKCU')])
        self.assertEqual(plan.keep.hive, 'HKCU')
        self.assertEqual(plan.remove, [])
        self.assertEqual(plan.unresolved, [])

    def test_second_key_for_same_executable_is_removed(self):
        plan = self.classify([zen('HKLM'), zen('HKLM', key_id='Zen')])
        self.assertEqual(plan.keep.key_id, CLIENT_KEY)
        self.assertEqual([entry.key_id for entry in plan.remove], ['Zen'])

    def test_nothing_to_keep_removes_nothing(self):
        plan = self.classify([zen('HKLM')], {fix.normal(MACHINE_ZEN): fix.GONE})
        self.assertIsNone(plan.keep)
        self.assertEqual(plan.remove, [])
        self.assertEqual([entry.hive for entry in plan.unresolved], ['HKLM'])


if __name__ == '__main__':
    unittest.main()
