#!/usr/bin/env bash
#
# 构建并打包 SizerSwift.app。
#
#   ./build.sh                     构建 release 并打包到 build/SizerSwift.app
#   ./build.sh --install           打包后安装到 /Applications（会先退出正在运行的实例）
#   ./build.sh --version 1.2.0     写入 Info.plist 的版本号
#
# 脚本刻意不执行 codesign：Apple Silicon 上 swift build 的产物自带 ad-hoc 签名，
# 用 cp 复制即可保留。重新签名会让 TCC 里的「辅助功能」授权对不上号，
# 每次重编译都要重新授权一次。

set -euo pipefail

scriptDir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$scriptDir"

appName="SizerSwift"
bundleIdentifier="com.dox.SizerSwift"
bundleVersion="1.0.0"
minimumSystemVersion="13.0"
installToApplications=0

usage() {
    cat <<'USAGE'
用法: ./build.sh [选项]

选项:
  --install          打包后安装到 /Applications，清除隔离属性并重新启动
  --version <X.Y.Z>  写入 Info.plist 的版本号（默认 1.0.0）
  -h, --help         显示本帮助

产物: SizerSwift/build/SizerSwift.app（build/ 已在仓库根 .gitignore 中）
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --install)
            installToApplications=1
            shift
            ;;
        --version)
            if [[ $# -lt 2 ]]; then
                echo "错误: --version 需要一个参数" >&2
                exit 2
            fi
            bundleVersion="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "错误: 未知参数 '$1'" >&2
            usage >&2
            exit 2
            ;;
    esac
done

echo "==> swift build -c release"
swift build -c release

binary="$scriptDir/.build/release/$appName"
if [[ ! -f "$binary" ]]; then
    echo "错误: 找不到构建产物 $binary" >&2
    exit 1
fi

app="$scriptDir/build/$appName.app"
echo "==> 打包 $app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>$appName</string>
	<key>CFBundleExecutable</key>
	<string>$appName</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>$bundleIdentifier</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$appName</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$bundleVersion</string>
	<key>CFBundleVersion</key>
	<string>$bundleVersion</string>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.utilities</string>
	<key>LSMinimumSystemVersion</key>
	<string>$minimumSystemVersion</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
</dict>
</plist>
PLIST

# cp 而不是 strip/install：保留 swift build 自带的 ad-hoc 签名。
cp "$binary" "$app/Contents/MacOS/$appName"
chmod +x "$app/Contents/MacOS/$appName"
cp "$scriptDir/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"

if command -v plutil >/dev/null 2>&1; then
    plutil -lint "$app/Contents/Info.plist" >/dev/null
fi
# 手工拼的 bundle 没有 _CodeSignature/CodeResources，codesign --verify 必然报
# "code has no resources"，这里只确认二进制自带 ad-hoc 签名（Apple Silicon 上没签名跑不起来）。
if command -v codesign >/dev/null 2>&1; then
    signature="$(codesign -dv "$app/Contents/MacOS/$appName" 2>&1 | sed -n 's/^Signature=//p')"
    if [[ -n "$signature" ]]; then
        echo "    二进制签名: ${signature}（保留 swift build 产物，未重新签名）"
    else
        echo "错误: 二进制没有签名，Apple Silicon 上无法运行" >&2
        exit 1
    fi
fi

if [[ $installToApplications -eq 1 ]]; then
    destination="/Applications/$appName.app"
    if pgrep -x "$appName" >/dev/null 2>&1; then
        echo "==> 退出正在运行的 $appName"
        pkill -x "$appName" >/dev/null 2>&1 || true
        sleep 1
    fi
    echo "==> 安装到 $destination"
    rm -rf "$destination"
    cp -R "$app" "$destination"
    xattr -cr "$destination"
    open "$destination"
    echo "    已安装并启动。首次运行需在「系统设置 → 隐私与安全性 → 辅助功能」中授权。"
else
    echo "    未安装。可运行 ./build.sh --install，或手动复制到 /Applications 后执行 xattr -cr。"
fi

echo "Build succeeded: $app"
