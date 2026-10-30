#!/bin/sh
#
# 一致性检查：用同一批合成 PCM 分别跑 C++ 核心和 Vespertine 自己的 Swift 分析器，
# 并对它们报告的每个数值做 diff。需要 Xcode 的 Swift 工具链（仅 macOS）。
#
#   ./test/parity.sh
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
build="$root/build"

mkdir -p "$build"
clang++ -std=c++17 -O2 -Wall -Wextra -o "$build/core_test" "$here/core_test.cpp" "$root"/src/core/*.cpp
rm -rf "$build/dump"
mkdir -p "$build/dump"
"$build/core_test" --dump "$build/dump"

swift build -c release --package-path "$here/swift-parity" >/dev/null
"$here/swift-parity/.build/release/vesper-parity" "$build/dump" >/dev/null

status=0
for f in "$build"/dump/*.cpp.txt; do
    base=${f%.cpp.txt}
    if diff -q "$f" "$base.swift.txt" >/dev/null; then
        echo "identical  $(basename "$base")"
    else
        echo "DIFFERS    $(basename "$base")"
        diff "$f" "$base.swift.txt" || true
        status=1
    fi
done
[ "$status" -eq 0 ] && echo "C++ core and Swift reference agree on every case"
exit "$status"
