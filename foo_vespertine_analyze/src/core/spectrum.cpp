//
// foo_vespertine_analyze — 幅值谱（Vespertine Spectrum.swift 的移植）。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "core.h"

#include <algorithm>
#include <cmath>

namespace vesper {

namespace {

constexpr double kPi = 3.14159265358979323846264338327950288;

int trailingZeroBits(int v) {
    int n = 0;
    while (v > 1 && (v & 1) == 0) {
        v >>= 1;
        ++n;
    }
    return n;
}

} // namespace

PortableFFT::PortableFFT(int size) : size_(size) {
    // 前置条件（precondition）：size.nonzeroBitCount == 1 && size >= 4
    bits_ = trailingZeroBits(size);
    cosTable_.resize(static_cast<std::size_t>(size) / 2);
    sinTable_.resize(static_cast<std::size_t>(size) / 2);
    for (int i = 0; i < size / 2; ++i) {
        const double a = 2 * kPi * static_cast<double>(i) / static_cast<double>(size);
        cosTable_[static_cast<std::size_t>(i)] = std::cos(a);
        sinTable_[static_cast<std::size_t>(i)] = std::sin(a);
    }
    reversed_.resize(static_cast<std::size_t>(size));
    for (int i = 0; i < size; ++i) {
        int r = 0;
        int v = i;
        for (int b = 0; b < bits_; ++b) {
            r = (r << 1) | (v & 1);
            v >>= 1;
        }
        reversed_[static_cast<std::size_t>(i)] = r;
    }
}

std::vector<float> PortableFFT::packedMagnitudes(const float* input) const {
    const int n = size_;
    std::vector<double> re(static_cast<std::size_t>(n), 0.0);
    std::vector<double> im(static_cast<std::size_t>(n), 0.0);
    for (int i = 0; i < n; ++i) {
        re[static_cast<std::size_t>(reversed_[static_cast<std::size_t>(i)])] =
            static_cast<double>(input[i]);
    }
    int len = 2;
    while (len <= n) {
        const int half = len / 2;
        const int step = n / len;
        int start = 0;
        while (start < n) {
            for (int k = 0; k < half; ++k) {
                const double c = cosTable_[static_cast<std::size_t>(k * step)];
                const double s = -sinTable_[static_cast<std::size_t>(k * step)];
                const int a = start + k;
                const int b = a + half;
                const double tr = re[static_cast<std::size_t>(b)] * c -
                                  im[static_cast<std::size_t>(b)] * s;
                const double ti = re[static_cast<std::size_t>(b)] * s +
                                  im[static_cast<std::size_t>(b)] * c;
                re[static_cast<std::size_t>(b)] = re[static_cast<std::size_t>(a)] - tr;
                im[static_cast<std::size_t>(b)] = im[static_cast<std::size_t>(a)] - ti;
                re[static_cast<std::size_t>(a)] += tr;
                im[static_cast<std::size_t>(a)] += ti;
            }
            start += len;
        }
        len <<= 1;
    }
    std::vector<float> out(static_cast<std::size_t>(n) / 2, 0.0f);
    out[0] = static_cast<float>(std::hypot(2 * re[0], 2 * re[static_cast<std::size_t>(n / 2)]));
    for (int k = 1; k < n / 2; ++k) {
        const double r = re[static_cast<std::size_t>(k)];
        const double i = im[static_cast<std::size_t>(k)];
        out[static_cast<std::size_t>(k)] = static_cast<float>(2 * std::sqrt(r * r + i * i));
    }
    return out;
}

SpectrumAnalyzer::SpectrumAnalyzer(int size) : size_(size), fft_(size) {
    // Hann 窗，"非归一化"（峰值为 1）：w[n] = 0.5*(1 - cos(2*pi*n/N))，与 vDSP 的相同。
    window_.resize(static_cast<std::size_t>(size));
    for (int i = 0; i < size; ++i) {
        window_[static_cast<std::size_t>(i)] = static_cast<float>(
            0.5 * (1 - std::cos(2 * kPi * static_cast<double>(i) / static_cast<double>(size))));
    }
}

std::vector<float> SpectrumAnalyzer::magnitudes(const float* samples,
                                                std::size_t count) const {
    // 前置条件（precondition）：samples.count >= size
    if (count < static_cast<std::size_t>(size_)) return {};
    const std::size_t offset = count - static_cast<std::size_t>(size_);
    const int half = size_ / 2;
    std::vector<float> windowed(static_cast<std::size_t>(size_), 0.0f);
    for (int i = 0; i < size_; ++i) {
        windowed[static_cast<std::size_t>(i)] =
            samples[offset + static_cast<std::size_t>(i)] * window_[static_cast<std::size_t>(i)];
    }
    std::vector<float> mags = fft_.packedMagnitudes(windowed.data());
    // Hann 窗相干增益 0.5，FFT 缩放 2/N -> 满幅正弦约 0 dBFS。
    const float scale = 1.0f / static_cast<float>(half);
    for (float& m : mags) {
        const float a = m * scale;
        m = a > 0 ? std::max(20.0f * std::log10(a), -160.0f) : -160.0f;
    }
    return mags;
}

} // namespace vesper
