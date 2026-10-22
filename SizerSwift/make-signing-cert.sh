#!/usr/bin/env bash
#
# 创建本机自签名代码签名证书（默认名 "MAGI-OpenSource"），供 build.sh 使用。
#
#   ./make-signing-cert.sh                 创建默认证书（已存在则直接返回）
#   ./make-signing-cert.sh --name "Foo"    指定证书名称
#   ./make-signing-cert.sh --days 3650     指定有效期（默认 3650 天）
#
# 这张证书不只给 SizerSwift 用：本机其它个人小工具也可以 `codesign --sign
# "MAGI-OpenSource" --identifier <自己的 bundle id>`。DR 是
#   identifier "<bundle id>" and certificate leaf = H"…"
# identifier 不同就是不同 App，各自的 TCC / 登录项互不影响。
#
# 为什么需要固定证书：ad-hoc 签名的 designated requirement 就是 cdhash，
# 改一行代码 cdhash 就变，macOS 会认为「不是同一个 App」，辅助功能授权
# 每次重编译都要重做。换成固定证书后 DR 变成
#   identifier "magi.aenerv7.sizerswift" and certificate leaf = H"…"# 与构建产物无关，重编译、重新打包都不需要重新授权。
#
# 实现方式：openssl 生成带 codeSigning EKU 的自签名证书 → 导出 pkcs12 →
# security import 进登录钥匙串。不需要 GUI，也不需要管理员密码。
#
# 备份 / 迁移：证书与私钥只存在于登录钥匙串，生成时的 pem / p12 在临时目录里
# 随即删除。要备份请从钥匙串导出 .p12（必须含私钥），详见 DEVELOPMENT.md
# 「构建与部署」小节。
#
# 两个容易踩的坑：
# 1. pkcs12 必须用 /usr/bin/openssl（LibreSSL）导出。Homebrew 的 OpenSSL 3/4
#    默认 AES-256-CBC + SHA-256 MAC，security import 会报
#    "MAC verification failed during PKCS12 import (wrong password?)"。
# 2. 本脚本不设置证书信任（不做 security add-trusted-cert）。签名本身和 TCC
#    记录只需要「证书 + 私钥在钥匙串里」，未信任也能 codesign。只有想让系统级
#    校验（如 spctl）认这张证书时才需要「始终信任」，那要管理员密码，留给用户
#    自己在「钥匙串访问 → 显示简介 → 信任 → 代码签名：始终信任」里做。

set -euo pipefail

scriptDir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$scriptDir"

identityName="MAGI-OpenSource"
validDays=3650
keychain="$HOME/Library/Keychains/login.keychain-db"

usage() {
    cat <<'USAGE'
用法: ./make-signing-cert.sh [选项]

选项:
  --name <名称>    证书名称（默认 "MAGI-OpenSource"），build.sh 按这个名字找身份
  --days <天数>    证书有效期（默认 3650）
  -h, --help       显示本帮助

创建后即可用 ./build.sh 签名；证书与私钥只存在本机登录钥匙串里，
换机器或重装系统需要重新创建（届时已授权过辅助功能的用户要重新授权）。
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)
            if [[ $# -lt 2 ]]; then
                echo "错误: --name 需要一个参数" >&2
                exit 2
            fi
            identityName="$2"
            shift 2
            ;;
        --days)
            if [[ $# -lt 2 ]]; then
                echo "错误: --days 需要一个参数" >&2
                exit 2
            fi
            validDays="$2"
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

# `security find-identity -v` 只列「受信任」的身份，自签名证书会带
# CSSMERR_TP_NOT_TRUSTED 被过滤掉，所以这里不加 -v，按名字匹配。
if security find-identity -p codesigning 2>/dev/null | grep -Fq "\"$identityName\""; then
    echo "签名身份已存在: $identityName"
    security find-identity -p codesigning 2>/dev/null | grep -F "\"$identityName\"" | sed 's/^/    /'
    exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"

cat > "$work/req.cnf" <<'CNF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = MAGI-OpenSource
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
CNF
# 允许 --name 覆盖 CN，但不动扩展区（Code Signing EKU 是 codesign 的硬要求）。
sed -i '' "s/^CN = .*/CN = $identityName/" "$work/req.cnf"

passphrase="$(/usr/bin/openssl rand -hex 16)"

echo "==> 生成自签名证书"
/usr/bin/openssl req -x509 -newkey rsa:2048 -sha256 -days "$validDays" -nodes \
    -keyout "$work/key.pem" -out "$work/cert.pem" -config "$work/req.cnf" 2>/dev/null

echo "==> 导出 pkcs12 并导入登录钥匙串"
# LibreSSL 的 pkcs12 默认算法（3DES + SHA1 MAC）才被 security import 接受。
/usr/bin/openssl pkcs12 -export \
    -inkey "$work/key.pem" -in "$work/cert.pem" \
    -out "$work/identity.p12" -name "$identityName" \
    -passout "pass:$passphrase"

# -T /usr/bin/codesign：授权 codesign 直接取用私钥；-A 让任意程序可用，
# 避免每次签名弹「security 想要访问钥匙串中的密钥」对话框。
if ! security import "$work/identity.p12" -k "$keychain" -P "$passphrase" \
        -T /usr/bin/codesign -T /usr/bin/security -A; then
    echo "错误: 导入钥匙串失败。" >&2
    echo "      若报 'MAC verification failed'，说明 pkcs12 被换成了 Homebrew 的 openssl 导出。" >&2
    exit 1
fi

echo "==> 完成"
security find-identity -p codesigning 2>/dev/null | grep -F "\"$identityName\"" | sed 's/^/    /'
echo "    CSSMERR_TP_NOT_TRUSTED 是预期的：未在系统信任设置里标记，不影响 codesign 与 TCC。"
echo "    ./build.sh 会自动使用该身份；显式指定用 ./build.sh --identity \"$identityName\"。"
echo "    证书有效期 $validDays 天，到期后重新运行本脚本并在 build.sh 里换新名字，"
echo "    否则 TCC 授权会因证书 leaf 哈希变化而失效。"
