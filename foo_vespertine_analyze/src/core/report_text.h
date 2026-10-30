//
// foo_vespertine_analyze — 报告列表的三列与详情面板。
//
// 与 foobar2000 胶水层分开，以便脱离平台测试：这里的一切都是纯 C++17，
// 输入是文件描述加上分析结果。
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
#pragma once

#include "core.h"

#include <optional>
#include <string>

namespace vesper {

//! 文件对自身的声称，解码前从容器里读出。
struct TrackClaim {
    std::string codec;       //!< "FLAC"、"MP3"、"WAV"、"DSF"……未知时为空
    std::optional<int> bits; //!< 容器字长，例如 24-bit FLAC 为 24，float 为 32
    double sampleRate = 0;   //!< 单位 Hz
    int channels = 0;        //!< 未知时为 0
};

//! 报告中的一行。
struct ReportRow {
    std::string path;    //!< 文件的绝对路径
    TrackClaim claim;    //!< 它声称自己是什么
    FileAnalysis analysis; //!< 分析器得出的结论
};

//! 第 2 列：文件声称的格式与数字，例如 "FLAC 24-bit / 96 kHz / 2 ch"。
std::string claimedText(const TrackClaim& claim);

//! 第 3 列：分析器认为它实际上是什么。没有问题时与 `claimedText` 完全相同，
//! 这样名副其实的文件两列看起来就对齐了。
std::string actualText(const ReportRow& row);

//! 详情面板：判定、置信度、测量值，以及分析了什么。
std::string detailText(const ReportRow& row);

//! 带宽为 `bandwidthHz` 的限带文件可能来自的最大采样率，且不低于该带宽。
//! 例如 20100 -> 44100、23000 -> 48000、43000 -> 96000。
double sourceRateFor(double bandwidthHz);

} // namespace vesper
