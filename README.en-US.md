

# Dox

Self-used collection of Windows/macOS tools, browser extensions, user scripts, and UI customizations. Each directory is essentially an independent module that can be run, installed, or built on demand; the repository has no unified root-level build command.

## Feature Overview

| Module | Description |
|---|---|
| [`AutoHotkey/SizerAHK`](./AutoHotkey/SizerAHK) | AutoHotkey v2 window size and position adjustment tool |
| [`SizerWin`](./SizerWin) | Native Windows window adjustment tool that does not depend on the AutoHotkey runtime |
| [`CapsLockOSD`](./CapsLockOSD) | Native Windows Caps Lock status on-screen display |
| [`SizerSwift`](./SizerSwift) | macOS menu bar window adjustment tool |
| [`Firefox/AutoSortBookmarks`](./Firefox/AutoSortBookmarks) | Firefox bookmark auto-organization extension |
| [`Windhawk/CJKSpacer`](./Windhawk/CJKSpacer) | Windhawk module to add spaces at CJK character boundaries in Explorer menus and tooltips |
| [`css`](./css) | Chinese font mapping and VS Code appearance custom CSS |
| [`Userscript`](./Userscript) | Tampermonkey/Greasemonkey user scripts |
| [`Stash`](./Stash) | Stash tile script |
| [`Batch files/Flatten.bat`](./Batch%20files/Flatten.bat) | Windows directory flattening tool |

## Chinese Font Mapping

Maps common English font names, CSS generic font family names, and legacy Chinese font names to modern Chinese fonts via `@font-face`, optimizing Chinese text rendering on web pages.

The following two files share the same mapping rules and must be maintained synchronously when modified:

- [`css/font-face.css`](./css/font-face.css) — Standalone referable CSS
- [`Userscript/中文字体优化.user.js`](./Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — Tampermonkey user script version

### Target Fonts

| Category | Font | Fallback |
|---|---|---|
| Sans-serif | Noto Sans SC | PingFang SC |
| Serif | Noto Serif SC | — |
| Monospace | Maple Mono Normal NF CN | — |
| Cursive | LXGW WenKai | — |
| Fantasy | Yozai | — |

### Mapping Scope

- CSS generic families: `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`
- Common English fonts: CJK fallbacks for Georgia, Helvetica, Segoe UI, Consolas, etc.
- Legacy Chinese fonts: SimSun, NSimSun, MingLiU, etc.
- `unicode-range` covers major CJK blocks in Unicode 15.1, and includes extended characters, symbols/punctuation, full-width characters, Kana, and Hangul, etc.

## Windows Tools

### SizerAHK

A window size and position adjustment tool written in AutoHotkey v2. Press `Shift+Alt+Space` to summon the menu.

- Preset resolutions, auto-adjust to approx. 3/4 of the current monitor, center, and custom size
- Multi-monitor support, calculates usable area based on taskbar settings
- Custom size window supports `Enter` to apply, `Ctrl+Enter` to apply and center
- Bilingual UI (Chinese/English)
- Windows dark mode support

Entry point to run: `AutoHotkey/SizerAHK/SizerAHK.ahk`.

### SizerWin

Native Windows port of SizerAHK, written in pure C + Win32 API, compiled as a standalone exe, without depending on AutoHotkey or any other runtime. Suitable for scenarios where AutoHotkey is blocked by game anti-cheat software.

Also uses `Shift+Alt+Space` to summon the menu; maximized and minimized windows will not respond.

- Preset resolutions, auto-adjust to approx. 3/4 of the current monitor's work area, center, and custom size
- Multi-monitor support, avoids the taskbar based on the work area of the monitor where the current window resides
- Preset resolutions are configured via `SizerWin.ini` in the same directory as the exe; changes take effect in real-time upon reopening the menu
- Bilingual UI (Chinese/English), supports Windows dark mode
- Per-Monitor DPI awareness
- Custom size window uses native Win32 custom-drawn rounded input boxes and buttons, supports `Tab` / `Shift+Tab`, `Enter`, `Ctrl+Enter`, and `Esc`
- Hotkeys use `MOD_NOREPEAT` to avoid repeated triggers on long press

The PowerShell build script automatically locates Visual Studio / Build Tools:

```powershell
cd SizerWin
.\build.ps1
```

Can also be run in the Visual Studio Developer Command Prompt:

```bat
cd SizerWin
build.bat
```

Alternative CMake build method:

```powershell
cmake -S SizerWin -B SizerWin/build
cmake --build SizerWin/build --config Release
```

### CapsLockOSD

Native Windows Caps Lock on-screen display tool, implemented using C++, Win32 API, and system-native GDI+, without depending on third-party libraries or runtimes. Visual proportions are referenced from Logitech Options' Caps Lock indicator.

- Only displays OSD when Caps Lock state toggles
- Semi-transparent black rounded background, white `A/a` icon and status text
- OSD is topmost, focusless, and click-through, without interrupting current input
- Supports multi-monitor and Per-Monitor DPI, displays at approx. 90% vertical position on the screen where the current foreground window is located
- Status text supports Simplified Chinese, Traditional Chinese, and English, selected based on the system UI language
- Runs as a single instance, does not create a tray icon, and has no built-in auto-start on boot
- Reads `CapsLockOSD.ini` in the same directory on startup; auto-generates if missing, with configurable background opacity and display duration
- Standard Win32 windows cannot guarantee overlay on DirectX exclusive fullscreen

See [`CapsLockOSD/README.md`](./CapsLockOSD/README.md) for full configuration, limitations, and how to stop it. Build method:

```powershell
cd CapsLockOSD
.\build.ps1
```

Can also be built using `build.bat` or CMake.

## SizerSwift

macOS native port of SizerAHK, written in Swift, minimum supports macOS 13, compiled as a standalone `.app`.

- `⌥⌘C` — Center current window, preserving original size
- `⌃⌥⌘C` — Resize current window to 75% of the visible screen area and center it
- Persistent menu bar icon, no Dock icon
- Supports auto-start on boot via `SMAppService`
- Supports English, Traditional Chinese, and Simplified Chinese
- Prioritizes direct window manipulation via the Accessibility API; apps that do not expose AX windows will fallback to simulating title bar drag to center, and the fallback path cannot resize windows

First-time use requires authorization in "System Settings → Privacy & Security → Accessibility". Build:

```bash
cd SizerSwift
swift build -c release
```

After manually packaging into `.app` and deploying to `/Applications`, execute `xattr -cr` to clear quarantine attributes. Codesign is currently not used to prevent accessibility permissions from being invalidated due to re-signing.

## Firefox Extensions

### Auto Sort Bookmarks

[`Firefox/AutoSortBookmarks`](./Firefox/AutoSortBookmarks) is a Manifest V3 extension compatible with Firefox 142 and above, recursively organizing the `Bookmarks Menu` and `Other Bookmarks` root directories.

- Divides sections separated by dividers, with divider positions remaining unchanged
- Folders are pinned to the top of each section and sorted by title
- URL bookmarks follow, sorted by title then URL, supporting natural sort order
- Folders internally recursively apply the same rules
- Automatically schedules sorting upon installation, Firefox startup, and after bookmarks are created, modified, moved, or deleted, merging consecutive changes
- Only executes when a standard Firefox browser window is focused, avoiding re-sorting while the user is using the Library window

Temporary installation: Open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select `manifest.json` in this directory. API limitations and full instructions are in its [`README.md`](./Firefox/AutoSortBookmarks/README.md).

Run tests:

```powershell
node --test Firefox/AutoSortBookmarks/tests/sorter.test.js
```

## Windhawk

### CJKSpacer

[`Windhawk/CJKSpacer`](./Windhawk/CJKSpacer) is a Windhawk module that injects into `explorer.exe`, inserting a half-width space when CJK characters are directly adjacent to letters or numbers, for example:

```text
使用VS Code打开  →  使用 VS Code 打开
压缩为ZIP文件    →  压缩为 ZIP 文件
```

- Handles classic Win32 right-click menus for Explorer, desktop, taskbar, and jump lists
- Handles classic theme tooltips, including legacy tooltips used by some notification area icons
- Windows 11 new XAML right-click menus and tooltips can be optionally enabled via `modernUiText`
- Only temporarily modifies display text, does not modify file names, system files, or registry; restores when menu closes, element leaves visual tree, or module is unloaded
- Modern XAML path is disabled by default as it may conflict with XAML Diagnostics tools like Taskbar Styler or File Explorer Styler
- "Start", Search, and some flyout panels are hosted by other processes and are outside this module's injection scope

Installation steps, configuration options, known limitations, and troubleshooting are in [`Windhawk/CJKSpacer/README.md`](./Windhawk/CJKSpacer/README.md).

The repository also retains the [`Windhawk/windhawk-mods`](./Windhawk/windhawk-mods) submodule, which is an independent collection of Windhawk mods; usage instructions should refer to the submodule's documentation.

## CSS

- [`font-face.css`](./css/font-face.css) — Cross-platform Chinese font adaptation, see "Chinese Font Mapping" above for details
- [`vscode.css`](./css/vscode.css) — Specifies a Chinese font chain for Visual Studio Code's status bar and recent projects area

## Userscript

Install the scripts to Tampermonkey or Greasemonkey and use them on target websites:

- [`中文字体优化.user.js`](./Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js) — Site-wide Chinese font optimization, shares mapping rules with `css/font-face.css`
- [`EmuParadise Download Workaround.user.js`](./Userscript/EmuParadise%20Download%20Workaround.user.js) — Adds available download links on EmuParadise pages, relies on jQuery from script metadata
- [`Re-add Download Button Vimm's Lair.user.js`](./Userscript/Re-add%20Download%20Button%20Vimm's%20Lair.user.js) — Restores the submit button when the download button is removed on Vimm's Lair

## Stash

[`Stash/external-ip-address-tile.js`](./Stash/external-ip-address-tile.js) is a Stash external IP address tile script, fetches IP and country/region info via `ip-api.com`, displayed as `IP @ Country/Region`; shows "Fetch Failed" on request failure.

## Batch files

[`Batch files/Flatten.bat`](./Batch%20files/Flatten.bat) is used to move all files from subdirectories of one or more target folders into their respective root directories, and delete the now-empty subdirectories.

- Supports dragging one or multiple folders onto the script, or passing multiple paths via command line
- Multiple targets will be uniformly pre-checked and confirmed, then flattened in the order passed; duplicate targets are deduplicated, and parent-child target combinations are rejected
- Use `/Y` or `-Y` to skip confirmation and end pause
- Items with the same name will not be overwritten; original files and their directories are preserved
- Operations are irreversible; the script refuses to process disk root directories, share root directories, and symbolic links/junctions
