"""Version-locked, reversible local zh-CN supplement. Python 3.11+, stdlib only."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

from discovery import cache_targets, discover, find_install, load_profiles

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / 'build'
ARCHIVES = ('omni.ja', 'browser/omni.ja')
SETTINGS = 'chrome/browser/content/browser/preferences/zen-settings.js'
SHORTCUTS = 'chrome/browser/content/browser/zen-components/ZenKeyboardShortcuts.mjs'


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def fragments():
    text = (ROOT / 'translations.ftl').read_text(encoding='utf-8')
    parts = re.split(r'(?m)^# @file (\S+) (\S+)\n', text)
    result = {archive: {} for archive in ARCHIVES}
    for index in range(1, len(parts), 3):
        archive, resource, body = parts[index:index + 3]
        if archive not in result or not resource.startswith('localization/'):
            raise ValueError(f'Unexpected target: {archive}/{resource}')
        if resource in result[archive] or '..' in Path(resource).parts:
            raise ValueError(f'Duplicate/unsafe resource: {resource}')
        result[archive][resource] = body.strip() + '\n'
    return result


def patch_settings(source):
    # Patch only display labels. Key IDs, actions and stored bindings are unchanged.
    before = 'const zenMissingKeyboardShortcutL10n = {\n'
    after = before + (
        '  key_reload2: "zen-nav-reload-shortcut-2",\n'
        '  key_reload_skip_cache2: "zen-nav-reload-shortcut-skip-cache",\n'
        '  key_stop: "zen-key-stop",\n'
    )
    if source.count(before) != 1:
        raise ValueError('Shortcut label map changed; review patch for this version.')
    source = source.replace(before, after, 1)
    before = '  async _initializeCKS() {\n'
    after = before + '    this._notSet = await document.l10n.formatValue("zen-local-shortcut-not-set");\n'
    if source.count(before) != 1 or source.count('"Not set"') != 4:
        raise ValueError('Shortcut initialization changed; review patch for this version.')
    source = source.replace(before, after, 1)
    # Leave the upstream internal comparison (this.name == "Not set") intact.
    # Only localize the three assignments that actually display the text.
    for assignment in ('target.value', 'target.label', 'input.value'):
        before = f'{assignment} = "Not set";'
        if source.count(before) != 1:
            raise ValueError(f'Unexpected assignment: {before}')
        source = source.replace(before, f'{assignment} = this._notSet;', 1)
    return source


def patch_shortcuts(source):
    # Only presentation: leave key codes, matching and persisted bindings unchanged.
    replacements = {
        'str += AppConstants.platform == "macosx" ? "⌃" : "Ctrl";': 'str += "Ctrl";',
        'str += AppConstants.platform == "macosx" ? "⌘" : "Win";': 'str += AppConstants.platform == "macosx" ? "Cmd" : "Win";',
        'str += AppConstants.platform == "macosx" ? "⌘" : "Ctrl";': 'str += AppConstants.platform == "macosx" ? "Cmd" : "Ctrl";',
        'str += AppConstants.platform == "macosx" ? "⌥" : "Alt";': 'str += AppConstants.platform == "macosx" ? "Option" : "Alt";',
        'str += "⇧";': 'str += "Shift";',
        'str += AppConstants.platform == "macosx" ? "␣" : "Space";': 'str += "Space";',
        'str += "←";': 'str += "Left";',
        'str += "→";': 'str += "Right";',
        'str += "↑";': 'str += "Up";',
        'str += "↓";': 'str += "Down";',
        'str += AppConstants.platform == "macosx" ? "⎋" : "Esc";': 'str += "Esc";',
        'str += AppConstants.platform == "macosx" ? "↩" : "Enter";': 'str += "Enter";',
        'str += normalizedKey;': 'str += /^f\\d+$/i.test(k) ? k.toUpperCase() : normalizedKey;',
    }
    for before, after in replacements.items():
        if source.count(before) != 1:
            raise ValueError(f'Shortcut display implementation changed: {before}')
        source = source.replace(before, after, 1)
    start = source.index('  static keyToDisplayString(key, keycode) {')
    end = source.index('\n  toDisplayString() {', start)
    source = source[:start] + '''  static keyToDisplayString(key, keycode) {
    const raw = key || Object.entries(KEYCODE_MAP).find(([, value]) => value == keycode)?.[0]
      || keycode?.replace(/^VK_/, "") || "";
    const names = {
      " ": "Space", space: "Space", home: "Home", end: "End",
      tab: "Tab", enter: "Enter", return: "Enter", escape: "Esc", esc: "Esc",
      delete: "Delete", del: "Delete", backspace: "Backspace", back: "Backspace",
      insert: "Insert", pageup: "PageUp", page_up: "PageUp",
      pagedown: "PageDown", page_down: "PageDown",
      capslock: "CapsLock", caps_lock: "CapsLock",
      numlock: "NumLock", num_lock: "NumLock",
      scrolllock: "ScrollLock", scroll_lock: "ScrollLock",
      printscreen: "PrintScreen", printscreen_key: "PrintScreen", print_screen: "PrintScreen",
      pause: "Pause", contextmenu: "ContextMenu", context_menu: "ContextMenu",
      arrowleft: "Left", left: "Left", arrowright: "Right", right: "Right",
      arrowup: "Up", up: "Up", arrowdown: "Down", down: "Down",
    };
    return names[raw.toLowerCase()] ?? raw.toUpperCase();
  }
''' + source[end:]
    return source


def build(install):
    baseline = json.loads((ROOT / 'baseline.json').read_text(encoding='utf-8'))
    for archive in ARCHIVES:
        if digest(install / archive) != baseline['archives'][archive]:
            raise ValueError(f'{archive}: source differs from the verified original build; refusing to patch.')
    additions = fragments()
    previous = {}
    previous_path = BUILD / 'manifest.json'
    if previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding='utf-8'))['archives']
        for archive, record in previous.items():
            if digest(BUILD / archive) != record['patched_sha256']:
                raise ValueError(f'Previous build changed: {archive}')
            saved = ROOT / 'backups' / baseline['build_id'] / 'revisions' / (record['patched_sha256'] + '.ja')
            saved.parent.mkdir(parents=True, exist_ok=True)
            if not saved.exists():
                shutil.copy2(BUILD / archive, saved)
    manifest = {'version': baseline['version'], 'build_id': baseline['build_id'],
                'translations_sha256': digest(ROOT / 'translations.ftl'), 'archives': {}}
    for archive in ARCHIVES:
        destination = BUILD / archive
        destination.parent.mkdir(parents=True, exist_ok=True)
        changes = {}
        with zipfile.ZipFile(install / archive) as source:
            for name, addition in additions[archive].items():
                original = source.read(name) if name in source.namelist() else b''
                separator = b'\n\n# Local zh-CN supplement (Firefox/Zen).\n'
                changes[name] = original + separator + addition.encode('utf-8')
            if archive == 'browser/omni.ja':
                changes[SETTINGS] = patch_settings(source.read(SETTINGS).decode('utf-8')).encode('utf-8')
                changes[SHORTCUTS] = patch_shortcuts(source.read(SHORTCUTS).decode('utf-8')).encode('utf-8')
            with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_STORED) as target:
                target.comment = source.comment
                for info in source.infolist():
                    target.writestr(info, changes.get(info.filename, source.read(info)))
                for name in changes.keys() - set(source.namelist()):
                    target.writestr(name, changes[name])
        with zipfile.ZipFile(destination) as target:
            if target.testzip() is not None:
                raise ValueError(f'Invalid generated archive: {destination}')
        resource_root = BUILD / 'resources' / ('app' if archive == 'omni.ja' else 'browser')
        for name, content in changes.items():
            path = resource_root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        manifest['archives'][archive] = {
            'original_sha256': baseline['archives'][archive],
            'patched_sha256': digest(destination),
            'previous_sha256': previous.get(archive, {}).get('patched_sha256'),
            'resources': sorted(changes),
        }
    write_json(BUILD / 'manifest.json', manifest)
    print(f'Built {sum(len(v["resources"]) for v in manifest["archives"].values())} resources in {BUILD}')


def require_closed():
    result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq zen.exe', '/FO', 'CSV', '/NH'],
                            capture_output=True, text=True, check=True)
    if '"zen.exe"' in result.stdout.lower():
        raise RuntimeError('Close all Zen windows and background processes, then retry. Nothing was replaced.')


def replace_file(source, destination):
    # Stage on the same volume, then atomically replace the individual archive.
    descriptor, temp_name = tempfile.mkstemp(prefix='zen-l10n-', suffix='.tmp', dir=destination.parent)
    os.close(descriptor)
    temporary = Path(temp_name)
    try:
        shutil.copy2(source, temporary)
        if digest(temporary) != digest(source):
            raise IOError('Staged file checksum mismatch')
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def deploy(install, profile, restore=False):
    manifest = json.loads((BUILD / 'manifest.json').read_text(encoding='utf-8'))
    require_closed()
    caches = cache_targets(profile)
    backups = ROOT / 'backups' / manifest['build_id']
    pending = []
    # Validate all inputs before writing either installed archive.
    for archive, record in manifest['archives'].items():
        original = record['original_sha256']
        patched = record['patched_sha256']
        current = digest(install / archive)
        if current not in (original, patched, record.get('previous_sha256')):
            raise ValueError(f'{archive}: installation changed; refusing to overwrite it.')
        expected = original if restore else patched
        source = backups / archive if restore else BUILD / archive
        if current == expected:
            continue
        if not source.is_file() or digest(source) != expected:
            raise ValueError(f'Missing or modified deployment source: {source}')
        pending.append((archive, source))
    if not restore:
        for archive, _ in pending:
            backup = backups / archive
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copy2(install / archive, backup)
            if digest(backup) != manifest['archives'][archive]['original_sha256']:
                raise ValueError(f'Original backup checksum mismatch: {backup}')
    completed = []
    rollback_sources = {}
    for archive, _ in pending:
        current_hash = digest(install / archive)
        saved = backups / 'revisions' / (current_hash + '.ja')
        saved.parent.mkdir(parents=True, exist_ok=True)
        if not saved.exists():
            shutil.copy2(install / archive, saved)
        if digest(saved) != current_hash:
            raise ValueError(f'Rollback checksum mismatch: {saved}')
        rollback_sources[archive] = saved
    try:
        for archive, source in pending:
            replace_file(source, install / archive)
            completed.append(archive)
    except Exception:
        for archive in reversed(completed):
            replace_file(rollback_sources[archive], install / archive)
        raise
    for cache in caches:
        # Recheck after resource replacement before any recursive deletion.
        if cache not in cache_targets(profile):
            raise ValueError(f'Cache location changed during installation: {cache}')
        shutil.rmtree(cache)
    state = {'status': 'restored' if restore else 'installed', 'install': str(install),
             'profile': profile.describe(), 'backups': str(backups),
             'archive_sha256': {name: digest(install / name) for name in ARCHIVES}}
    write_json(BUILD / 'deployment.json', state)
    print(json.dumps(state, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(
        prog='patch_zen.py', add_help=False,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description='Zen Browser 简体中文补全与快捷键显示修正（Windows / Python 3.11+）。',
        epilog=r'''命令说明：
  help     显示本帮助；不传命令时也显示帮助，不执行安装。
  detect   只读检查，显示自动识别的 Zen 安装目录、配置与启动缓存路径。
  install  安装补丁；首次自动构建，先备份原文件，再替换资源并清除启动缓存。
  verify   校验安装资源是否与本地 build/ 中的补丁一致，需先构建或安装。
  restore  从 backups/ 还原原版资源，需保留本地 build/ 清单和原版备份。
  build    仅生成补丁到 build/，不安装；输入必须是匹配基线的原版资源。

推荐步骤（在脚本目录打开终端）：
  1. python .\patch_zen.py detect
  2. 保存网页内容并完全退出 Zen（包括后台进程）。
  3. python .\patch_zen.py install
  4. python .\patch_zen.py verify
  5. 重新打开 Zen；需要还原时先退出，再运行 restore。

常用示例：
  python .\patch_zen.py --help
  python .\patch_zen.py install --install-dir "D:\Apps\Zen Browser"
  python .\patch_zen.py install --profile "Default (release)"
  python .\patch_zen.py install --profile "D:\BrowserData\ZenProfile"
  python .\patch_zen.py detect --install-dir "D:\Apps\Zen" --profiles-root "D:\ZenData"
  python .\patch_zen.py restore
  python .\patch_zen.py build --install-dir ".\backups\20260915091052"

权限与配置：
  help / detect / verify 通常无需管理员权限；build 需要补丁目录可写。
  install / restore 需要安装目录可写；Program Files 安装版通常需要管理员终端。
  脚本不会自动提权。请使用当前账户，避免切换账户后识别到其他用户的配置。
  自动识别正在使用的已注册配置；Zen 关闭后选择对应默认配置。
  非默认配置可用 --profile 指定；多个候选无法确定时会停止，不猜测。

适用范围：
  仅适配 Zen 1.22.2b / Gecko 156.0，Build ID 20260915091052。
  资源包 SHA-256 必须匹配；浏览器升级后需要重新适配，不能覆盖新版资源。
  不修改书签、密码、标签页、扩展或偏好设置；请保留 backups/ 用于还原。
  完整使用说明见脚本同目录 README.md。''')
    parser.add_argument('-h', '--help', action='help', help='显示中文使用指南并退出')
    parser.add_argument('command', nargs='?', default='help',
                        choices=('help', 'detect', 'build', 'install', 'restore', 'verify'),
                        help='要执行的命令，默认只显示帮助')
    parser.add_argument('--install-dir', type=Path, metavar='目录',
                        help='Zen 安装目录；省略时自动识别。build 时也可指定原版备份目录')
    parser.add_argument('--profile', metavar='名称或路径',
                        help='配置名称、目录名或完整路径；省略时自动识别（build 不使用此参数）')
    parser.add_argument('--profiles-root', type=Path, metavar='目录',
                        help='含 profiles.ini 的自定义 Zen 数据根目录，用于便携版等布局')
    parser.add_argument('--local-root', type=Path, metavar='目录',
                        help='与数据根目录对应的本地缓存根；自定义数据根默认兼作缓存根')
    args = parser.parse_args()
    if args.command == 'help':
        parser.print_help()
        return
    if args.command == 'build':
        # Explicit build input can be a backup directory without zen.exe.
        if args.install_dir:
            install = args.install_dir.resolve()
        else:
            profiles, _ = load_profiles(Path(os.environ['APPDATA']) / 'zen', Path(os.environ['LOCALAPPDATA']) / 'zen')
            install = find_install(profiles)
        build(install)
        return
    install, profile, reason = discover(args.install_dir, args.profile, args.profiles_root, args.local_root)
    detection = {'install': str(install), 'profile': profile.describe(), 'selection': reason,
                 'startup_caches': [str(path) for path in cache_targets(profile)]}
    print(json.dumps(detection, ensure_ascii=False, indent=2), flush=True)
    if args.command == 'detect':
        return
    if args.command == 'verify':
        manifest = json.loads((BUILD / 'manifest.json').read_text(encoding='utf-8'))
        for archive, record in manifest['archives'].items():
            if digest(install / archive) != record['patched_sha256']:
                raise ValueError(f'{archive}: patch not installed or file changed')
        print('Both installed archives match the verified patch.')
    else:
        if args.command == 'install' and not (BUILD / 'manifest.json').exists():
            require_closed()
            build(install)
        deploy(install, profile, restore=args.command == 'restore')


if __name__ == '__main__':
    main()
