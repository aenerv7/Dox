#!/usr/bin/env bash
#
# 构建、签名并打包 SizerSwift.app。
#
#   ./build.sh                     构建 release、签名、打包到 build/SizerSwift.app
#   ./build.sh --install           打包后安装到 /Applications（会先退出正在运行的实例）
#   ./build.sh --version 1.2.0     写入 Info.plist 的版本号
#   ./build.sh --identity "Foo"    指定签名证书（默认 "MAGI-OpenSource"）
#   ./build.sh --identity none     不签名，保留 SwiftPM 的 ad-hoc 签名
#
# 默认用本机自签名证书签整包（证书用 ./make-signing-cert.sh 创建）。目的不是为了
# 过 Gatekeeper（自签名永远过不了，别人首次打开仍需手动放行，见 INSTALL.md），
# 而是固定 designated requirement：ad-hoc 的 DR 就是 cdhash，重编译就变，辅助功能
# 授权每次都要重做；固定证书的 DR 是 identifier + certificate leaf，与产物无关，
# 覆盖升级后授权自动保留。

set -euo pipefail

scriptDir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$scriptDir"

appName="SizerSwift"
bundleIdentifier="magi.aenerv7.sizerswift"
bundleVersion="1.0.0"
minimumSystemVersion="13.0"
defaultSigningIdentity="MAGI-OpenSource"
signingIdentity=""
signingIdentityExplicit=0
installToApplications=0

usage() {
    cat <<'USAGE'
用法: ./build.sh [选项]

选项:
  --install          打包后安装到 /Applications，清除隔离属性并重新启动
  --version <X.Y.Z>  写入 Info.plist 的版本号（默认 1.0.0）
  --identity <名称>  签名证书名称；默认 "MAGI-OpenSource"，none 表示保留 ad-hoc 签名
  -h, --help         显示本帮助

产物: SizerSwift/build/SizerSwift.app（build/ 已在仓库根 .gitignore 中）
环境变量: CODESIGN_IDENTITY 可代替 --identity（--identity 优先）
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
        --identity)
            if [[ $# -lt 2 ]]; then
                echo "错误: --identity 需要一个参数" >&2
                exit 2
            fi
            signingIdentity="$2"
            signingIdentityExplicit=1
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

# 解析签名身份：--identity > CODESIGN_IDENTITY > 默认自签名证书 > ad-hoc。
# 默认证书不存在不算错误（新克隆的仓库还没跑过 make-signing-cert.sh），但显式
# 指定的身份找不到必须报错，否则会静默签成 ad-hoc、下次升级又丢授权。
if [[ -z "$signingIdentity" && $signingIdentityExplicit -eq 0 ]]; then
    signingIdentity="${CODESIGN_IDENTITY:-$defaultSigningIdentity}"
fi
if [[ "$signingIdentity" == "none" ]]; then
    signingIdentity=""
fi
if [[ -n "$signingIdentity" ]] \
    && ! security find-identity -p codesigning 2>/dev/null | grep -Fq "\"$signingIdentity\""; then
    if [[ $signingIdentityExplicit -eq 1 || -n "${CODESIGN_IDENTITY:-}" ]]; then
        echo "错误: 找不到签名身份 '$signingIdentity'" >&2
        echo "      列出可用身份: security find-identity -p codesigning" >&2
        echo "      创建自签名证书: ./make-signing-cert.sh" >&2
        exit 1
    fi
    echo "提示: 未找到签名身份 '$signingIdentity'，本次保留 ad-hoc 签名。"
    echo "      ad-hoc 的 TCC 授权每次重编译都要重做；先运行 ./make-signing-cert.sh 再打包即可避免。"
    signingIdentity=""
fi

if ! command -v codesign >/dev/null 2>&1; then
    echo "错误: 找不到 codesign" >&2
    exit 1
fi

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

if [[ -n "$signingIdentity" ]]; then
    echo "==> codesign（${signingIdentity}）"
    # 签整包而不是只签二进制：这样 DR 才是 identifier + certificate leaf。
    # 不加 --options runtime：本机自签名分发不做公证，硬化运行时只会带来库校验问题。
    codesign --force --sign "$signingIdentity" --identifier "$bundleIdentifier" \
        --timestamp=none "$app"
    codesign --verify --verbose=1 "$app" 2>&1 | sed 's/^/    /'
    requirement="$(codesign -d -r- "$app" 2>&1 | sed -n 's/^designated => //p')"
    echo "    指定要求: ${requirement}"
else
    # ad-hoc 路径：手工拼的 bundle 没有 _CodeSignature/CodeResources，codesign --verify
    # 必然报 "code has no resources"，所以只确认二进制自带 ad-hoc 签名（Apple Silicon
    # 上没签名跑不起来）。
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
    if [[ -n "$signingIdentity" ]]; then
        codesign --verify "$destination"
        echo "    签名校验通过：覆盖安装后辅助功能授权会保留。"
    fi
    open "$destination"
    if [[ -n "$signingIdentity" ]]; then
        echo "    已安装并启动。首次安装需在「系统设置 → 隐私与安全性 → 辅助功能」中授权；"
        echo "    之后覆盖升级不需要重新授权（签名证书与包名保持不变）。"
    else
        echo "    已安装并启动。首次运行需在「系统设置 → 隐私与安全性 → 辅助功能」中授权。"
    fi
else
    echo "    未安装。可运行 ./build.sh --install，或手动复制到 /Applications 后执行 xattr -cr。"
fi

echo "Build succeeded: $app"
