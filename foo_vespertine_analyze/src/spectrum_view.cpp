//
// foo_vespertine_analyze — 长期频谱图的绘制。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "spectrum_view.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace vesper {

namespace {

//! 横轴刻度文本："500"、"11k"、"22.05k"。
void formatHz(wchar_t* out, size_t count, double hz) {
    if (hz < 1000) {
        swprintf_s(out, count, L"%.0f", hz);
        return;
    }
    const double khz = hz / 1000;
    wchar_t text[32]{};
    swprintf_s(text, khz >= 100 ? L"%.0f" : L"%.2f", khz);
    std::wstring trimmed(text);
    while (!trimmed.empty() && trimmed.back() == L'0') trimmed.pop_back();
    if (!trimmed.empty() && trimmed.back() == L'.') trimmed.pop_back();
    swprintf_s(out, count, L"%sk", trimmed.c_str());
}

} // namespace

void drawSpectrum(HDC dc, RECT rc, const FileAnalysis* analysis, HFONT font,
                  SpectrumColors const& colors) {
    const HBRUSH background = CreateSolidBrush(colors.background);
    FillRect(dc, &rc, background);
    DeleteObject(background);

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, colors.text);
    const HGDIOBJ previousFont = SelectObject(dc, font);

    if (analysis == nullptr || analysis->spectrum.empty() || analysis->sampleRate <= 0) {
        const wchar_t* message = analysis == nullptr
                                     ? L"Select a track to see its long-term spectrum."
                                     : L"No spectrum for this file.";
        DrawTextW(dc, message, -1, &rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
        SelectObject(dc, previousFont);
        return;
    }

    // 留出左侧 dB 刻度、底部频率刻度、顶部 dBFS 标题的位置。
    const int left = rc.left + 52;
    const int right = rc.right - 16;
    const int top = rc.top + 22;
    const int bottom = rc.bottom - 20;
    if (right - left < 60 || bottom - top < 40) {
        SelectObject(dc, previousFont);
        return;
    }

    const double nyquist = analysis->sampleRate / 2.0;
    const double lowestHz = 20.0;
    const double octaves = std::log(nyquist / lowestHz);

    const auto yFor = [&](double db) {
        const double clamped = std::clamp(db, kSpectrumMinDB, 0.0);
        const double t = (clamped - kSpectrumMinDB) / -kSpectrumMinDB;
        return bottom - static_cast<int>(t * (bottom - top) + 0.5);
    };
    const auto xFor = [&](double hz) {
        if (hz <= lowestHz) return left;
        const double t = std::log(hz / lowestHz) / octaves;
        return left + static_cast<int>(std::clamp(t, 0.0, 1.0) * (right - left) + 0.5);
    };

    // dB 网格与纵轴标签。
    const HGDIOBJ previousPen = SelectObject(dc, GetStockObject(DC_PEN));
    SetDCPenColor(dc, colors.grid);
    for (int db = 0; db >= static_cast<int>(kSpectrumMinDB); db -= 20) {
        const int y = yFor(db);
        MoveToEx(dc, left, y, nullptr);
        LineTo(dc, right, y);
        wchar_t label[16];
        swprintf_s(label, L"%d", db);
        RECT labelRect{rc.left, y - 8, left - 6, y + 8};
        DrawTextW(dc, label, -1, &labelRect, DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    }
    RECT unitRect{rc.left, rc.top, left - 6, rc.top + 16};
    DrawTextW(dc, L"dBFS", -1, &unitRect, DT_RIGHT | DT_TOP | DT_SINGLELINE | DT_NOPREFIX);

    // 频率网格：100 Hz、1 kHz、10 kHz…，最后一个刻度单独标 Nyquist。
    for (double hz = 100; hz < nyquist * 0.999; hz *= 10) {
        const int x = xFor(hz);
        MoveToEx(dc, x, top, nullptr);
        LineTo(dc, x, bottom);
        wchar_t label[24];
        formatHz(label, 24, hz);
        RECT labelRect{x - 40, bottom + 2, x + 40, rc.bottom};
        DrawTextW(dc, label, -1, &labelRect, DT_CENTER | DT_TOP | DT_SINGLELINE | DT_NOPREFIX);
    }
    {
        wchar_t label[24];
        formatHz(label, 24, nyquist);
        RECT labelRect{right - 40, bottom + 2, right + 14, rc.bottom};
        DrawTextW(dc, label, -1, &labelRect, DT_RIGHT | DT_TOP | DT_SINGLELINE | DT_NOPREFIX);
    }

    // 曲线：核心给出 256 个对数等距的点，直接按索引铺满宽度。
    const std::size_t bins = analysis->spectrum.size();
    std::vector<POINT> curve;
    curve.reserve(static_cast<size_t>(right - left + 1));
    for (int x = left; x <= right; ++x) {
        // windows.h 的 min/max 宏会拆掉 std::min，这里手工夹取。
        std::size_t index =
            static_cast<std::size_t>(static_cast<double>(x - left) * (bins - 1) / (right - left));
        if (index >= bins) index = bins - 1;
        POINT point{x, yFor(analysis->spectrum[index])};
        curve.push_back(point);
    }

    std::vector<POINT> area = curve;
    area.push_back(POINT{right, bottom});
    area.push_back(POINT{left, bottom});
    SelectObject(dc, GetStockObject(DC_BRUSH));
    SetDCBrushColor(dc, colors.fill);
    Polygon(dc, area.data(), static_cast<int>(area.size()));

    HPEN curvePen = CreatePen(PS_SOLID, 2, colors.curve);
    SelectObject(dc, curvePen);
    SetDCPenColor(dc, colors.curve);
    Polyline(dc, curve.data(), static_cast<int>(curve.size()));
    DeleteObject(curvePen);
    SelectObject(dc, previousPen);
    SetDCPenColor(dc, colors.grid);

    // 截止频率标记。
    if (analysis->forensics && analysis->forensics->cliffHz && *analysis->forensics->cliffHz > lowestHz) {
        const double cutoff = *analysis->forensics->cliffHz;
        const int x = xFor(cutoff);
        HPEN dashPen = CreatePen(PS_DASH, 1, colors.curve);
        const HGDIOBJ old = SelectObject(dc, dashPen);
        MoveToEx(dc, x, top, nullptr);
        LineTo(dc, x, bottom);
        SelectObject(dc, old);
        DeleteObject(dashPen);

        wchar_t label[48];
        swprintf_s(label, L"cutoff %.1f kHz", cutoff / 1000.0);
        int labelRight = x + 160;
        if (labelRight > right) labelRight = right;
        RECT labelRect{x + 4, top + 2, labelRight, top + 18};
        DrawTextW(dc, label, -1, &labelRect, DT_LEFT | DT_TOP | DT_SINGLELINE | DT_NOPREFIX);
    }

    SelectObject(dc, previousFont);
}

} // namespace vesper
