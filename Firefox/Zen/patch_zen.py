"""Version-locked, reversible local zh-CN supplement for Zen Browser (Windows).

Only `validate` needs fluent.syntax; every other command uses the standard library alone.
"""
from __future__ import annotations

import argparse
import configparser
import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import hashlib
import json
import os
import sys
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / 'build'
ARCHIVES = ('omni.ja', 'browser/omni.ja')
SETTINGS = 'chrome/browser/content/browser/preferences/zen-settings.js'
SHORTCUTS = 'chrome/browser/content/browser/zen-components/ZenKeyboardShortcuts.mjs'
APP_INI = 'application.ini'
SUPPLEMENT = '# Local zh-CN supplement (Firefox/Zen).'
# The one region rewritten without inspecting what upstream had there.
SHORTCUT_START = '  static keyToDisplayString(key, keycode) {'
SHORTCUT_END = '\n  toDisplayString() {'


# ---------------------------------------------------------------------------
# Discovery: locate the installation, the profile and its startup caches.
# ---------------------------------------------------------------------------

def read_ini(path):
    parser = configparser.ConfigParser(interpolation=None)
    parser.read(path, encoding='utf-8-sig')
    return parser


def unique(paths):
    return list(dict.fromkeys(Path(path).resolve() for path in paths))


@dataclass
class Profile:
    path: Path
    name: str
    local_path: Path
    last_install: Path | None = None
    default: bool = False

    def describe(self):
        return {'name': self.name, 'path': str(self.path), 'local_path': str(self.local_path),
                'last_install': str(self.last_install) if self.last_install else None}


def load_profiles(roaming, local):
    config = read_ini(roaming / 'profiles.ini')
    profiles = []
    for section in config.sections():
        if not section.startswith('Profile') or not config.has_option(section, 'Path'):
            continue
        value = Path(config.get(section, 'Path'))
        relative = config.getboolean(section, 'IsRelative', fallback=True)
        if relative and (value.is_absolute() or '..' in value.parts):
            raise ValueError(f'Invalid relative profile path: {value}')
        path = ((roaming / value) if relative else value).resolve()
        if not relative and not value.is_absolute():
            raise ValueError(f'Expected absolute profile path: {value}')
        if not path.is_dir():
            continue
        compatibility = read_ini(path / 'compatibility.ini')
        platform_dir = compatibility.get('Compatibility', 'LastPlatformDir', fallback='')
        profiles.append(Profile(
            path, config.get(section, 'Name', fallback=path.name),
            (local / value).resolve() if relative else path,
            Path(platform_dir).resolve() if platform_dir else None,
            config.getboolean(section, 'Default', fallback=False),
        ))
    defaults = []
    for source in (config, read_ini(roaming / 'installs.ini')):
        for section in source.sections():
            if section.startswith('Profile') or section in ('General', 'BackgroundTasksProfiles'):
                continue
            value = source.get(section, 'Default', fallback='')
            if value:
                path = Path(value)
                defaults.append((path if path.is_absolute() else roaming / path).resolve())
    return profiles, unique(defaults)


def profile_in_use(profile):
    # parent.lock remains after shutdown. Test Windows sharing, not mere existence.
    lock = profile.path / 'parent.lock'
    if os.name != 'nt' or not lock.exists():
        return False
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    create = kernel.CreateFileW
    create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                       wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    create.restype = wintypes.HANDLE
    handle = create(str(lock), 0x80000000, 7, None, 3, 0, None)
    if handle == ctypes.c_void_p(-1).value:
        return ctypes.get_last_error() in (32, 33)
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle(handle)
    return False


def select_profile(install, profiles, defaults, explicit=None, is_active=profile_in_use):
    if explicit:
        supplied = Path(explicit)
        matches = [p for p in profiles if explicit in (p.name, p.path.name)
                   or (supplied.is_absolute() and p.path == supplied.resolve())]
        if len(matches) == 1:
            return matches[0], 'explicit'
        if not matches and supplied.is_absolute() and (supplied / 'prefs.js').is_file():
            path = supplied.resolve()
            return Profile(path, path.name, path), 'explicit external profile'
        raise ValueError('Profile not found or name is ambiguous. Use --profile with its full directory path.')
    # Installation defaults belonging to another last-used installation are excluded.
    eligible = [p for p in profiles if p.last_install in (None, install)]
    ranked = (
        ('running profile', [p for p in eligible if is_active(p)]),
        ('installation default', [p for p in eligible if p.path in defaults and p.last_install == install]),
        ('registered installation default', [p for p in eligible if p.path in defaults]),
        ('profile default', [p for p in eligible if p.default]),
        ('only profile for installation', [p for p in eligible if p.last_install == install]),
        ('only available profile', eligible),
    )
    for reason, candidates in ranked:
        if len(candidates) == 1:
            return candidates[0], reason
        if len(candidates) > 1:
            choices = '\n'.join(str(p.path) for p in candidates)
            raise ValueError(f'Multiple possible profiles ({reason}); specify --profile:\n{choices}')
    raise ValueError('No profile found for this installation. Start Zen once, or pass --profile with its full path.')


def valid_install(path):
    return all((path / name).is_file() for name in ('zen.exe', 'omni.ja', 'browser/omni.ja'))


def running_installs():
    if os.name != 'nt':
        return []
    result = subprocess.run([
        'powershell.exe', '-NoProfile', '-Command',
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); '
        "Get-CimInstance Win32_Process -Filter \"name='zen.exe'\" | "
        'Select-Object -ExpandProperty ExecutablePath -Unique | ConvertTo-Json -Compress'
    ], capture_output=True, encoding='utf-8', errors='replace', timeout=15)
    if result.returncode or not result.stdout.strip():
        return []
    values = json.loads(result.stdout)
    return unique(Path(value).parent for value in (values if isinstance(values, list) else [values]) if value)


def registry_installs():
    if os.name != 'nt':
        return []
    import winreg
    paths = []
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            try:
                with winreg.OpenKey(hive, r'Software\Microsoft\Windows\CurrentVersion\App Paths\zen.exe',
                                    0, winreg.KEY_READ | view) as key:
                    paths.append(Path(winreg.QueryValueEx(key, '')[0].strip('"')).parent)
            except OSError:
                pass
            try:
                with winreg.OpenKey(hive, r'Software\Microsoft\Windows\CurrentVersion\Uninstall',
                                    0, winreg.KEY_READ | view) as root:
                    for index in range(winreg.QueryInfoKey(root)[0]):
                        try:
                            with winreg.OpenKey(root, winreg.EnumKey(root, index)) as key:
                                name = winreg.QueryValueEx(key, 'DisplayName')[0]
                                if name.lower().startswith('zen'):
                                    location = winreg.QueryValueEx(key, 'InstallLocation')[0]
                                    if location:
                                        paths.append(Path(location.strip('"')))
                        except OSError:
                            pass
            except OSError:
                pass
    return unique(paths)


def find_install(profiles, explicit=None):
    if explicit:
        path = Path(explicit).resolve()
        if not valid_install(path):
            raise ValueError(f'Not a Zen installation: {path}')
        return path
    running = [p for p in running_installs() if valid_install(p)]
    if len(running) == 1:
        return running[0]
    if len(running) > 1:
        raise ValueError('Multiple Zen installations are running; use --install-dir.')
    candidates = registry_installs() + [p.last_install for p in profiles if p.last_install]
    for variable, suffix in (('ProgramFiles', 'Zen Browser'), ('ProgramFiles(x86)', 'Zen Browser'),
                             ('LOCALAPPDATA', 'Programs/Zen Browser'), ('LOCALAPPDATA', 'Zen Browser')):
        if os.environ.get(variable):
            candidates.append(Path(os.environ[variable]) / suffix)
    candidates = [p for p in unique(candidates) if valid_install(p)]
    if len(candidates) != 1:
        raise ValueError('Cannot uniquely locate Zen. Use --install-dir. Candidates: ' + ', '.join(map(str, candidates)))
    return candidates[0]


def discover(install=None, profile=None, roaming=None, local=None):
    if roaming is not None and local is None:
        local = roaming  # Portable/custom roots do not use the standard user's cache tree.
    roaming = Path(roaming or Path(os.environ['APPDATA']) / 'zen').resolve()
    local = Path(local or Path(os.environ['LOCALAPPDATA']) / 'zen').resolve()
    profiles, defaults = load_profiles(roaming, local)
    install = find_install(profiles, install)
    selected, reason = select_profile(install, profiles, defaults, profile)
    return install, selected, reason


def discovered_install(roaming=None, local=None):
    # Minimal discovery for build, which only needs the install directory.
    if roaming is not None and local is None:
        local = roaming
    profiles, _ = load_profiles(Path(roaming or Path(os.environ['APPDATA']) / 'zen'),
                                Path(local or Path(os.environ['LOCALAPPDATA']) / 'zen'))
    return find_install(profiles)


def cache_targets(profile):
    # Validate all paths before deleting anything; never follow a cache junction.
    targets = []
    for parent in unique((profile.path, profile.local_path)):
        cache = parent / 'startupCache'
        if cache.exists():
            if cache.is_symlink() or (hasattr(cache, 'is_junction') and cache.is_junction()):
                raise ValueError(f'Refusing redirected cache: {cache}')
            resolved = cache.resolve()
            if resolved.parent != parent or resolved.name != 'startupCache' or not resolved.is_dir():
                raise ValueError(f'Invalid cache location: {cache}')
            targets.append(resolved)
    return targets


# ---------------------------------------------------------------------------
# Build: append the missing zh-CN messages and patch the two display scripts.
# ---------------------------------------------------------------------------

def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def read_manifest():
    # Records the pristine resources a build came from, so no separate baseline
    # file has to be stored and updated by hand.
    path = BUILD / 'manifest.json'
    if not path.exists():
        raise SystemExit(f'找不到 {path}；请先运行 build（或直接 install）生成构建清单。')
    return json.loads(path.read_text(encoding='utf-8'))


def application_ini_path(install):
    # Firefox keeps the authoritative copy under browser/; the root file exists too.
    for relative in (f'browser/{APP_INI}', APP_INI):
        path = install / relative
        if path.is_file():
            return path
    return None


def read_application_ini(install):
    path = application_ini_path(install)
    if path is None:
        raise ValueError(f'找不到 {APP_INI}：{install}')
    config = read_ini(path)
    fields = {'version': ('App', 'Version'), 'build_id': ('App', 'BuildID'),
              'source_revision': ('App', 'SourceStamp'), 'gecko_version': ('Gecko', 'MinVersion')}
    metadata = {}
    for key, (section, option) in fields.items():
        if not config.has_option(section, option):
            raise ValueError(f'{path} 缺少 [{section}] {option}')
        metadata[key] = config.get(section, option)
    return metadata


def scan_archive(path):
    # Local supplements are stored uncompressed, so the marker bytes appear literally.
    # Hashing and the patched check share one pass.
    marker = SUPPLEMENT.encode('utf-8')
    hasher = hashlib.sha256()
    tail = b''
    patched = False
    with Path(path).open('rb') as stream:
        while chunk := stream.read(1 << 20):
            hasher.update(chunk)
            if not patched:
                window = tail + chunk
                patched = marker in window
                tail = window[-(len(marker) - 1):]
    return hasher.hexdigest(), patched


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
    start = source.index(SHORTCUT_START)
    end = source.index(SHORTCUT_END, start)
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


def shortcut_body(source):
    # Pristine implementation of the region patch_shortcuts overwrites wholesale.
    # Every other edit is guarded by an exact-match assertion, so this is the only
    # spot where an upstream change could be dropped silently: keep it for review.
    start = source.index(SHORTCUT_START)
    return source[start:source.index(SHORTCUT_END, start)]


def build(install, metadata=None):
    # Every version-sensitive edit raises when upstream moves things, so the
    # pristine hashes can simply be re-derived from the given source. That keeps
    # the patch usable across Zen upgrades without a stored baseline hash.
    install = Path(install).resolve()
    metadata = Path(metadata).resolve() if metadata else install
    metadata_info = read_application_ini(metadata)
    originals = {}
    for archive in ARCHIVES:
        sha256, patched = scan_archive(install / archive)
        if patched:
            raise ValueError(f'{install / archive} 已经打过补丁，不能当作原版；'
                             '请用 --install-dir 指向原版安装目录，或 backups/<Build ID>。')
        originals[archive] = sha256
    additions = fragments()
    prior = read_manifest() if (BUILD / 'manifest.json').exists() else {}
    for archive, record in prior.get('archives', {}).items():
        if digest(BUILD / archive) != record['patched_sha256']:
            raise ValueError(f'Previous build changed: {archive}')
        saved = ROOT / 'backups' / metadata_info['build_id'] / 'revisions' / (record['patched_sha256'] + '.ja')
        saved.parent.mkdir(parents=True, exist_ok=True)
        if not saved.exists():
            shutil.copy2(BUILD / archive, saved)
    manifest = {'version': metadata_info['version'], 'gecko_version': metadata_info['gecko_version'],
                'build_id': metadata_info['build_id'], 'source_revision': metadata_info['source_revision'],
                'source': str(install), 'translations_sha256': digest(ROOT / 'translations.ftl'),
                'archives': {}}
    replaced = BUILD / 'replaced' / (Path(SHORTCUTS).stem + '.keyToDisplayString.mjs')
    for archive in ARCHIVES:
        destination = BUILD / archive
        destination.parent.mkdir(parents=True, exist_ok=True)
        changes = {}
        with zipfile.ZipFile(install / archive) as source:
            for name, addition in additions[archive].items():
                original = source.read(name) if name in source.namelist() else b''
                separator = f'\n\n{SUPPLEMENT}\n'.encode('utf-8')
                changes[name] = original + separator + addition.encode('utf-8')
            if archive == 'browser/omni.ja':
                changes[SETTINGS] = patch_settings(source.read(SETTINGS).decode('utf-8')).encode('utf-8')
                original_shortcuts = source.read(SHORTCUTS).decode('utf-8')
                changes[SHORTCUTS] = patch_shortcuts(original_shortcuts).encode('utf-8')
                body = shortcut_body(original_shortcuts)
                replaced.parent.mkdir(parents=True, exist_ok=True)
                replaced.write_bytes(body.encode('utf-8'))
                manifest['shortcut_display_sha256'] = hashlib.sha256(body.encode('utf-8')).hexdigest()
            with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_STORED) as target:
                target.comment = source.comment
                for entry in source.infolist():
                    target.writestr(entry, changes.get(entry.filename, source.read(entry)))
                # Generated entries reuse the source stamp; a wall-clock ZIP
                # timestamp would change the archive hash on every rebuild.
                stamp = source.infolist()[0].date_time
                for name in changes.keys() - set(source.namelist()):
                    target.writestr(zipfile.ZipInfo(name, stamp), changes[name])
        with zipfile.ZipFile(destination) as target:
            if target.testzip() is not None:
                raise ValueError(f'Invalid generated archive: {destination}')
        resource_root = BUILD / 'resources' / ('app' if archive == 'omni.ja' else 'browser')
        for name, content in changes.items():
            path = resource_root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        manifest['archives'][archive] = {
            'original_sha256': originals[archive],
            'patched_sha256': digest(destination),
            'previous_sha256': prior.get('archives', {}).get(archive, {}).get('patched_sha256'),
            'resources': sorted(changes),
        }
    write_json(BUILD / 'manifest.json', manifest)
    print(f'Built {sum(len(v["resources"]) for v in manifest["archives"].values())} resources in {BUILD}')
    print(f'keyToDisplayString 的原实现已存至 {replaced}，供与上游比对。')
    if prior.get('shortcut_display_sha256') not in (None, manifest['shortcut_display_sha256']):
        print('注意：这次的 keyToDisplayString 与上次构建不同，上游可能改动过该函数；'
              '它会被整体替换，请比对上面保存的原实现，确认没有丢掉上游修复。')
    return manifest


def needs_build(install):
    # An upgrade replaces both archives with hashes no build has seen yet; that
    # alone is the signal to rebuild instead of refusing to overwrite them.
    path = BUILD / 'manifest.json'
    if not path.exists():
        return True
    manifest = read_manifest()
    for archive, record in manifest['archives'].items():
        known = {record['original_sha256'], record['patched_sha256'], record.get('previous_sha256')}
        if digest(Path(install) / archive) not in known:
            return True
    return False


# ---------------------------------------------------------------------------
# Deploy: back up the originals, replace both archives, clear startup caches.
# ---------------------------------------------------------------------------

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
    manifest = read_manifest()
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


# ---------------------------------------------------------------------------
# Validate: compare the built patch with the pristine original resources.
# ---------------------------------------------------------------------------

def fluent_parser():
    # Imported late so build/install keep working when fluent.syntax is absent.
    try:
        from fluent.syntax import FluentParser, ast
    except ImportError as error:
        raise SystemExit('validate 需要 fluent.syntax；请先运行：python -m pip install fluent.syntax') from error
    return FluentParser(), ast


def fluent_entries(parser, ast, text):
    tree = parser.parse(text)
    errors = [node for node in tree.body if isinstance(node, ast.Junk)]
    assert not errors, f'Invalid Fluent syntax: {errors}'
    nodes = [node for node in tree.body if isinstance(node, (ast.Message, ast.Term))]
    names = [node.id.name for node in nodes]
    assert len(names) == len(set(names)), 'Duplicate Fluent IDs'
    return {node.id.name: node for node in nodes}


def fluent_references(node):
    result = set()

    def walk(value):
        if isinstance(value, dict):
            kind = value.get('type')
            if kind in ('VariableReference', 'TermReference', 'MessageReference'):
                result.add((kind, value['id']['name']))
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(node.to_json())
    return result


def original_dir(explicit):
    # Default to the pristine resources the current build came from: comparing
    # against an installed patch would validate itself.
    if explicit:
        return Path(explicit).resolve()
    manifest = read_manifest()
    candidates = [Path(manifest['source'])] if manifest.get('source') else []
    candidates.append(ROOT / 'backups' / manifest['build_id'])
    for candidate in candidates:
        if not candidate.is_dir():
            continue
        if all((candidate / archive).is_file() and digest(candidate / archive) == record['original_sha256']
               for archive, record in manifest['archives'].items()):
            return candidate
    raise SystemExit(f'找不到 {manifest["build_id"]} 的原版资源，'
                     '请用 --original-dir 指定原版安装或备份目录，或重新运行 build。')


def validate(original):
    parser, ast = fluent_parser()
    additions = fragments()
    missing_after = []
    count = 0
    files_checked = 0
    resource_changes = []
    for archive in ARCHIVES:
        with zipfile.ZipFile(original / archive) as pristine, zipfile.ZipFile(BUILD / archive) as patched:
            assert patched.testzip() is None
            for name in pristine.namelist():
                if name not in additions[archive] and name not in (SETTINGS, SHORTCUTS):
                    assert pristine.read(name) == patched.read(name), f'Unrelated resource changed: {name}'
            for name, addition in additions[archive].items():
                translated = fluent_entries(parser, ast, addition)
                combined = fluent_entries(parser, ast, patched.read(name).decode('utf-8'))
                assert translated.keys() <= combined.keys()
                if '/zh-CN/' not in name:
                    continue
                english_name = name.replace('/zh-CN/', '/en-US/')
                english = fluent_entries(parser, ast, patched.read(english_name).decode('utf-8'))
                for key, node in translated.items():
                    source = english[key]
                    assert fluent_references(node) == fluent_references(source), f'References differ: {key}'
                    assert bool(node.value) == bool(source.value), f'Value differs: {key}'
                    assert {a.id.name for a in node.attributes} == {a.id.name for a in source.attributes}, key
                    # Named markup is required for DOM localization overlays.
                    source_text = patched.read(english_name).decode('utf-8')[source.span.start:source.span.end]
                    target_text = addition[node.span.start:node.span.end]
                    assert sorted(re.findall(r'data-l10n-name="([^"]+)"', source_text)) == sorted(re.findall(r'data-l10n-name="([^"]+)"', target_text)), key
                count += len(translated)
                resource_changes.append({'archive': archive, 'resource': name, 'added_messages': len(translated)})
            for name in patched.namelist():
                if not name.startswith('localization/en-US/') or not name.endswith('.ftl'):
                    continue
                english = fluent_entries(parser, ast, patched.read(name).decode('utf-8'))
                chinese_name = name.replace('/en-US/', '/zh-CN/')
                chinese = fluent_entries(parser, ast, patched.read(chinese_name).decode('utf-8')) if chinese_name in patched.namelist() else {}
                files_checked += 1
                for key, node in english.items():
                    if key not in chinese:
                        missing_after.append(f'{archive}/{chinese_name}:{key}')
                    else:
                        assert {a.id.name for a in node.attributes} <= {a.id.name for a in chinese[key].attributes}, key
                        if node.value is not None:
                            assert chinese[key].value is not None, key
    assert not missing_after, missing_after
    report = {'fluent_files_compared': files_checked, 'chinese_messages_added': count,
              'missing_message_ids': missing_after, 'syntax_valid': True,
              'variables_and_references_preserved': True,
              'unrelated_resources_unchanged': True, 'changes': resource_changes}
    (ROOT / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'changes'}, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog='patch_zen.py', add_help=False,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description='Zen Browser 简体中文补全与快捷键显示修正（Windows / Python 3.11+）。',
        epilog=r'''命令说明：
  help      显示本帮助；不传命令时也显示帮助，不执行安装。
  detect    只读检查，显示自动识别的 Zen 安装目录、配置与启动缓存路径。
  build     仅生成补丁到 build/，不安装；输入须是未打过补丁的原版资源。
  validate  校验 build/ 中的补丁：Fluent 语法、缺项、变量引用与命名链接。需 fluent.syntax。
  install   安装补丁；缺少构建清单时自动先构建，再备份原文件、替换资源并清除启动缓存。
  verify    校验已安装的资源是否与 build/ 中的补丁一致，需先 build 或 install。
  restore   从 backups/ 还原原版资源，需保留本地 build/ 清单和原版备份。

推荐步骤（在脚本目录打开终端）：
  1. python .\patch_zen.py detect      只读检查，Zen 可以开着
  2. python .\patch_zen.py build       生成补丁，Zen 可以开着
  3. python .\patch_zen.py validate    校验补丁，Zen 可以开着
  4. 保存网页内容并完全退出 Zen（包括后台进程）。
  5. python .\patch_zen.py install     需要安装目录写权限
  6. python .\patch_zen.py verify
  7. 重新打开 Zen；需要还原时先退出，再运行 restore。

常用示例：
  python .\patch_zen.py --help
  python .\patch_zen.py detect --install-dir "D:\Apps\Zen Browser"
  python .\patch_zen.py build
  python .\patch_zen.py build --install-dir "D:\ZenNew"
  python .\patch_zen.py build --install-dir ".\backups\20261006042626"
  python .\patch_zen.py validate --original-dir ".\backups\20261006042626"
  python .\patch_zen.py install --profile "Default (release)"
  python .\patch_zen.py install --profile "D:\BrowserData\ZenProfile"
  python .\patch_zen.py detect --install-dir "D:\Apps\Zen" --profiles-root "D:\ZenData"
  python .\patch_zen.py restore

权限与配置：
  help / detect / build / validate / verify 通常无需管理员权限；build 与 validate 需要补丁目录可写。
  install / restore 需要安装目录可写；Program Files 安装版通常需要管理员终端。
  脚本不会自动提权。请使用当前账户，避免切换账户后识别到其他用户的配置。
  自动识别正在使用的已注册配置；Zen 关闭后选择对应默认配置。
  非默认配置可用 --profile 指定；多个候选无法确定时会停止，不猜测。
  validate 省略 --original-dir 时用本次构建的来源目录（其次 backups/<Build ID>）；不要用已打补丁的安装当参照。

适用范围：
  当前补丁按 Zen 1.23.1b / Gecko 157.0.1 编写；版本信息在每次构建时从输入目录的
  application.ini 读取，并随构建清单记录该次的原版资源与产物哈希，不保存固定基线。
  上游升级后直接运行 install：检测到未知资源就按新版原包自动重建补丁。
  资源已被打过补丁、或补丁目标结构变化时会明确报错，不会静默改错。
  不修改书签、密码、标签页、扩展或偏好设置；请保留 backups/ 用于还原。
  完整使用说明见脚本同目录 README.md。''')
    parser.add_argument('-h', '--help', action='help', help='显示中文使用指南并退出')
    parser.add_argument('command', nargs='?', default='help',
                        choices=('help', 'detect', 'build', 'validate', 'install', 'restore', 'verify'),
                        help='要执行的命令，默认只显示帮助')
    parser.add_argument('--install-dir', type=Path, metavar='目录',
                        help='Zen 安装目录；省略时自动识别。build 时也可指定原版安装或备份目录')
    parser.add_argument('--original-dir', type=Path, metavar='目录',
                        help='validate 的参照原版目录；省略时使用 backups/<Build ID> 备份')
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
            install = discovered_install(args.profiles_root, args.local_root)
        metadata = install if application_ini_path(install) else discovered_install(args.profiles_root, args.local_root)
        if metadata != install:
            print(f'{install} 中没有 {APP_INI}，改用已安装目录 {metadata} 读取版本信息。', file=sys.stderr)
        build(install, metadata)
        return
    if args.command == 'validate':
        # Only needs build/ and the pristine reference, so it must not require a discoverable install.
        validate(original_dir(args.original_dir))
        return
    install, profile, reason = discover(args.install_dir, args.profile, args.profiles_root, args.local_root)
    detection = {'install': str(install), 'profile': profile.describe(), 'selection': reason,
                 'startup_caches': [str(path) for path in cache_targets(profile)]}
    print(json.dumps(detection, ensure_ascii=False, indent=2), flush=True)
    if args.command == 'detect':
        return
    if args.command == 'verify':
        manifest = read_manifest()
        for archive, record in manifest['archives'].items():
            if digest(install / archive) != record['patched_sha256']:
                raise ValueError(f'{archive}: patch not installed or file changed')
        print('Both installed archives match the verified patch.')
    else:
        if args.command == 'install' and needs_build(install):
            require_closed()
            build(install)
        deploy(install, profile, restore=args.command == 'restore')


if __name__ == '__main__':
    main()
