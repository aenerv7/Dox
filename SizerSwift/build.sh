#!/usr/bin/env bash
#
# 构建、签名并打包 SizerSwift.app。
#
#   ./build.sh                              构建 release，用 ad-hoc 签名打包到 build/SizerSwift.app
#   ./build.sh --install                    打包后安装到 /Applications（会先退出正在运行的实例）
#   ./build.sh --version 1.2.0              写入 Info.plist 的版本号
#   ./build.sh --identity "某个证书名称"    用本机钥匙串里的这张证书签整包
#   ./build.sh --help                       显示全部选项与签名说明
#
# 签名证书由开发者自己提供（自行创建或用 .p12 导入登录钥匙串），仓库不生成证书。
# 不传 --identity 时用 ad-hoc 签名：DR 是 cdhash，每次重编译都不一样，辅助功能与
# 开机自启动授权每次都要重做；传 --identity 后 DR 变成 identifier + certificate
# leaf，与产物内容无关，覆盖升级后授权自动保留。
# 自签名过不了 Gatekeeper（别人首次打开仍需手动放行，见 INSTALL.md），固定
# 签名身份是为了 TCC/SMAppService 授权，不是为了过 Gatekeeper。

set -euo pipefail

scriptDir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$scriptDir"

appName="SizerSwift"
bundleIdentifier="magi.aenerv7.sizerswift"
bundleVersion="1.0.0"
minimumSystemVersion="13.0"
signingIdentity=""
identitySpecified=0
installToApplications=0

usage() {
    cat <<'USAGE'
用法: ./build.sh [选项]

选项:
  --install           打包后安装到 /Applications，清除隔离属性并重新启动
  --version <X.Y.Z>   写入 Info.plist 的版本号（默认 1.0.0）
  --identity <名称>   用钥匙串里这张证书签整包；省略（或 none）时用 ad-hoc 签名
  -h, --help          显示本帮助

签名身份:
  证书由开发者自己提供，仓库不生成证书，也没有生成脚本。先把 .p12 导入登录
  钥匙串（或用「钥匙串访问」自行创建一张代码签名证书）：

      security import SizerSwift.p12 -k ~/Library/Keychains/login.keychain-db \
          -P <口令> -T /usr/bin/codesign -A
      security find-identity -p codesigning      # 查看可用名称，不要加 -v

  不传 --identity：用 ad-hoc 签名（codesign -s -）。ad-hoc 的 designated
  requirement 是 cdhash，每次重编译都会变，辅助功能与开机自启动授权都要重做。
  传 --identity 才固定签名身份，覆盖升级后授权保留。

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
            identitySpecified=1
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

# 解析签名身份：--identity > CODESIGN_IDENTITY > ad-hoc。没有默认证书名——
# 证书只由开发者提供，猜一个名字只会静默签成 ad-hoc、下次升级才丢授权。
# 显式指定（参数或环境变量）的身份在钥匙串里找不到时必须报错退出。
# 参数优先于环境变量，`--identity none` 也能压住 CODESIGN_IDENTITY。
if [[ $identitySpecified -eq 0 ]]; then
    signingIdentity="${CODESIGN_IDENTITY:-}"
fi
if [[ "$signingIdentity" == "none" || "$signingIdentity" == "-" ]]; then
    signingIdentity=""
fi
if [[ -n "$signingIdentity" ]] \
    && ! security find-identity -p codesigning 2>/dev/null | grep -Fq "\"$signingIdentity\""; then
    echo "错误: 钥匙串里找不到签名身份 '$signingIdentity'" >&2
    echo "      列出可用身份: security find-identity -p codesigning" >&2
    echo "      证书需自行导入: security import <文件>.p12 -k ~/Library/Keychains/login.keychain-db -P <口令>" >&2
    exit 1
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

# cp 而不是 strip/install：保留 swift build 自带的 ad-hoc 签名（随后整包重签）。
cp "$binary" "$app/Contents/MacOS/$appName"
chmod +x "$app/Contents/MacOS/$appName"
cp "$scriptDir/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"

if command -v plutil >/dev/null 2>&1; then
    plutil -lint "$app/Contents/Info.plist" >/dev/null
fi

# 签名：给了 --identity 就用证书签整包，否则 ad-hoc 签整包（每次重编译身份都变）。
# 两种都签整包，产出结构与校验方式一致，区别只在 designated requirement。
# 不给 --options runtime：本机自签名不公证、不分发，硬化运行时只会带来库校验问题。
if [[ -n "$signingIdentity" ]]; then
    echo "==> codesign（${signingIdentity}）"
else
    echo "==> codesign（ad-hoc）"
fi
codesign --force --sign "${signingIdentity:--}" --identifier "$bundleIdentifier" \
    --timestamp=none "$app"
codesign --verify --verbose=1 "$app" 2>&1 | sed 's/^/    /'
requirement="$(codesign -d -r- "$app" 2>&1 | sed -n 's/^#* *designated => //p')"
echo "    指定要求: ${requirement}"
if [[ -z "$signingIdentity" ]]; then
    echo "    提示: ad-hoc 的 DR 是 cdhash，每次重编译都会变；"
    echo "        要在覆盖升级后保留辅助功能/登录项授权，请传 --identity <证书名称>。"
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
    codesign --verify "$destination"
    if [[ -n "$signingIdentity" ]]; then
        echo "    签名校验通过：覆盖安装后辅助功能授权会保留。"
    else
        echo "    签名校验通过（ad-hoc）：下次重编译后需重新授权辅助功能。"
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
