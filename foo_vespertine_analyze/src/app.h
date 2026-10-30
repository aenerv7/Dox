//
// foo_vespertine_analyze — 分析核心与 foobar2000 之间的粘合层。
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
#pragma once

// foobar2000 会把 Windows 头文件、pfc 以及整个 SDK 一并引入。
#include <SDK/foobar2000-all.h>

#include <string>
#include <vector>

#include "core/core.h"
#include "core/report_text.h"

namespace vesper {

//! 判定前每个文件解码的秒数。Vespertine 也测量同样的窗口；频谱检查只需要几秒钟，剩下的时间是让
//! 统计量稳定下来。
constexpr double kMaxSeconds = 240.0;

//! 报告的值比这更离谱的解码器会被跳过，而不会送进 FFT。
constexpr double kMaxSampleRate = 768000.0;

//! pfc 字符串是 UTF-8，核心用的也是 UTF-8。
inline std::string toUtf8(const char* text) { return text != nullptr ? std::string(text) : std::string(); }

inline std::string toUtf8(pfc::string_base const& text) {
    return std::string(text.get_ptr(), text.get_length());
}

//! UTF-8 -> UTF-16，供 Windows API 使用。
std::wstring toWide(std::string const& text);

//! 读取容器所声称的字长、采样率、声道数和编码。
TrackClaim claimFor(metadb_handle_ptr const& track);

} // namespace vesper
