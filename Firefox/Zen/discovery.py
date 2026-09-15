"""Read-only discovery of Windows Zen installations and user profiles."""
from __future__ import annotations

import configparser
import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import json
import os
from pathlib import Path
import subprocess


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
