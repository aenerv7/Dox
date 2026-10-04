"""Remove the duplicate Zen registration that makes Windows list Zen twice.

Windows renders one "Default apps" row per registered application entry. Zen
writes the same client key to the machine hive and the user hive, so one
installation is registered twice:

    HKLM\\Software\\RegisteredApplications   Firefox-<hash> -> Software\\Clients\\StartMenuInternet\\Firefox-<hash>\\Capabilities
    HKCU\\Software\\RegisteredApplications   Firefox-<hash> -> same target
                        |
                        +-- Settings > Default apps:  Zen
                                                      Zen

`detect` reports without writing; `fix` keeps one entry per installation and
deletes the rest. The machine hive wins when both hives name the same
executable; two live installations on different paths are never touched.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import json
import os
from pathlib import Path

REGISTERED = r'Software\RegisteredApplications'
CLIENTS = r'Software\Clients\StartMenuInternet'
EXECUTABLE = 'zen.exe'
HIVES = ('HKLM', 'HKCU')  # Machine-wide first: it outlives any single user profile.
LIVE, GONE, OFFLINE = 'live', 'gone', 'offline'


# ---------------------------------------------------------------------------
# Planning: pure decisions over entries, so the rules stay testable off Windows.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Entry:
    hive: str
    key_id: str
    exe: Path
    name: str

    def describe(self):
        return {'hive': self.hive, 'id': self.key_id, 'name': self.name, 'exe': str(self.exe)}


@dataclass
class Plan:
    keep: Entry | None = None
    remove: list = field(default_factory=list)      # duplicates and dead leftovers
    unresolved: list = field(default_factory=list)  # kept for the user to judge


def normal(path):
    # Windows paths compare case-insensitively.
    return os.path.normcase(os.path.normpath(str(path)))


def parse_executable(value):
    # Values seen in the registry: '"...\\zen.exe" -safe-mode' and '...\\zen.exe,0'.
    text = (value or '').strip()
    if not text:
        return None
    if text.startswith('"'):
        end = text.find('"', 1)
        return Path(text[1:end]) if end > 1 else None
    if text.endswith(',0'):
        return Path(text[:-2])
    return Path(text.split(' ')[0])


def probe_state(path):
    if path.exists():
        return LIVE
    # A missing file on a mounted volume is a leftover; a missing volume is merely unreachable.
    return GONE if path.parents and path.parents[-1].exists() else OFFLINE


def rank(entry):
    return (HIVES.index(entry.hive), entry.key_id.lower())


def classify(entries, probe=probe_state):
    """Pick the entry to keep and the entries that are safe to delete."""
    zen = [entry for entry in entries if entry.exe.name.lower() == EXECUTABLE]
    states = {normal(entry.exe): probe(entry.exe) for entry in zen}
    live = [entry for entry in zen if states[normal(entry.exe)] == LIVE]
    if not live:
        # Nothing runnable: report only, never delete the last registration.
        return Plan(None, [], zen)

    keep = min(live, key=rank)
    remove, unresolved = [], []
    for entry in zen:
        if entry is keep:
            continue
        if normal(entry.exe) == normal(keep.exe) or states[normal(entry.exe)] == GONE:
            remove.append(entry)
        else:
            unresolved.append(entry)
    return Plan(keep, remove, unresolved)


# ---------------------------------------------------------------------------
# Registry access: one thin layer over winreg, used by read_entries/delete_entry.
# ---------------------------------------------------------------------------

def registry():
    import winreg  # Windows-only, so importing it lazily keeps the planning tests portable.
    return winreg


def hive_roots():
    winreg = registry()
    return {'HKLM': winreg.HKEY_LOCAL_MACHINE, 'HKCU': winreg.HKEY_CURRENT_USER}


def open_path(root, path, access):
    winreg = registry()
    return winreg.OpenKey(root, path, 0, access | winreg.KEY_WOW64_64KEY)


def value(root, path, name=''):
    winreg = registry()
    try:
        with open_path(root, path, winreg.KEY_READ) as key:
            return winreg.QueryValueEx(key, name)[0]
    except OSError:
        return None


def registered(root):
    winreg = registry()
    with open_path(root, REGISTERED, winreg.KEY_READ) as key:
        return [winreg.EnumValue(key, index)[:2] for index in range(winreg.QueryInfoKey(key)[1])]


def client_executable(root, target):
    # target is '<client key>\\Capabilities'; the icon and command live around it.
    client = target.rsplit('\\', 1)[0]
    sources = ((target, 'ApplicationIcon'), (client, 'DefaultIcon'), (rf'{client}\shell\open\command', ''))
    for path, name in sources:
        exe = parse_executable(value(root, path, name))
        if exe is not None:
            return exe
    return None


def read_entries():
    """All registered applications whose executable is zen.exe."""
    roots = hive_roots()
    entries = []
    for hive in HIVES:
        root = roots[hive]
        try:
            pairs = registered(root)
        except OSError:
            continue
        for key_id, target in pairs:
            exe = client_executable(root, target)
            if exe is None or exe.name.lower() != EXECUTABLE:
                continue
            entries.append(Entry(hive, key_id, exe, value(root, target, 'ApplicationName') or ''))
    return entries


def delete_tree(root, path):
    winreg = registry()
    with open_path(root, path, winreg.KEY_READ) as key:
        children = [winreg.EnumKey(key, index) for index in range(winreg.QueryInfoKey(key)[0])]
    for child in children:
        delete_tree(root, rf'{path}\{child}')
    winreg.DeleteKey(root, path)


def delete_entry(entry):
    """Drop the registration value and the client key it points at."""
    winreg = registry()
    root = hive_roots()[entry.hive]
    with open_path(root, REGISTERED, winreg.KEY_SET_VALUE) as key:
        winreg.DeleteValue(key, entry.key_id)
    try:
        delete_tree(root, rf'{CLIENTS}\{entry.key_id}')
    except FileNotFoundError:
        pass


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------

def describe(plan):
    return {'keep': plan.keep.describe() if plan.keep else None,
            'remove': [entry.describe() for entry in plan.remove],
            'unresolved': [entry.describe() for entry in plan.unresolved],
            'needs_fix': bool(plan.remove)}


def apply(plan):
    removed, failed = [], []
    for entry in plan.remove:
        try:
            delete_entry(entry)
            removed.append(entry.describe())
        except PermissionError:
            failed.append({**entry.describe(), 'error': '拒绝访问，请用管理员终端重试'})
        except OSError as error:
            failed.append({**entry.describe(), 'error': str(error)})
    print(json.dumps({'removed': removed, 'failed': failed}, ensure_ascii=False, indent=2), flush=True)
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(
        prog='fix_zen_duplicate.py', add_help=False,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description='删除让「设置 > 默认应用」重复显示 Zen 的注册表项（Windows / Python 3.11+）。',
        epilog=r'''命令说明：
  help    显示本帮助；不传命令时也显示帮助，不写入注册表。
  detect  只读检查，列出 Zen 的注册项、保留项和待删除项。
  fix     删除重复项：每个安装只保留一条注册，机器级（HKLM）优先。

判定规则：
  只处理可执行文件名为 zen.exe 的注册项，Firefox 等其他浏览器不受影响。
  两个 hive 指向同一个 zen.exe 时删除用户级（HKCU）那条，机器级保留。
  文件已不存在且所在磁盘仍在的注册项按残留删除；磁盘不在的保留，避免误删移动盘安装。
  两处指向不同且都存在的 zen.exe（两份 Zen 安装）不删除，只在 unresolved 中报告。

权限与退出：
  detect 无需管理员权限，Zen 可以开着。
  fix 删除 HKCU 项无需管理员；删除 HKLM 项需要管理员终端，否则记入 failed 并以退出码 1 结束。
  重复项清掉后设置页面立即刷新，不需要重启。

常用示例：
  python -B .\fix_zen_duplicate.py detect
  python -B .\fix_zen_duplicate.py fix

相关说明见同目录 README.md。''')
    parser.add_argument('-h', '--help', action='help', help='显示中文使用指南并退出')
    parser.add_argument('command', nargs='?', default='help', choices=('help', 'detect', 'fix'),
                        help='要执行的命令，默认只显示帮助')
    args = parser.parse_args()
    if args.command == 'help':
        parser.print_help()
        return

    plan = classify(read_entries())
    print(json.dumps(describe(plan), ensure_ascii=False, indent=2), flush=True)
    if args.command == 'detect' or not plan.remove:
        return
    raise SystemExit(apply(plan))


if __name__ == '__main__':
    main()
