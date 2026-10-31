//
// foo_vespertine_analyze — 长期频谱图的绘制。
//
// 只依赖 Win32 GDI 和分析结果，不碰 foobar2000；报告窗口和自检程序共用这一份。
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
#pragma once

#include <windows.h>

#include "core/core.h"

namespace vesper {

//! 频谱图的配色，由调用方按暗色/亮色主题给出。
struct SpectrumColors {
    COLORREF background;
    COLORREF text;
    COLORREF grid;
    COLORREF curve;
    COLORREF fill;
};

//! 在 `rc` 内画一张对数频率轴上的长期频谱：面积图 + dB 网格 + 截止频率虚线。
//! `analysis` 为空或没有频谱数据时画一行占位文字。
void drawSpectrum(HDC dc, RECT rc, const FileAnalysis* analysis, HFONT font,
                  SpectrumColors const& colors);

//! 纵轴下限，低于它的 bin 画在底线上。
constexpr double kSpectrumMinDB = -120.0;

} // namespace vesper
