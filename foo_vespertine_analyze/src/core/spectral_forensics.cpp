//
// foo_vespertine_analyze — 频谱取证（Vespertine SpectralForensics.swift 的移植）。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "core.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <tuple>

namespace vesper {

namespace {

constexpr double kMirrorCenters[2] = {22050.0, 24000.0};
constexpr double kMirrorStartHz = 150.0;
constexpr double kMirrorSpanHz = 800.0;
constexpr int kMirrorSpanCount = 5;

double meanOf(const std::vector<double>& s, int bandCount, int a, int b) {
    const int lo = std::max(0, a);
    const int hi = std::min(bandCount, b);
    if (!(hi > lo)) return -160;
    double sum = 0;
    for (int i = lo; i < hi; ++i) sum += s[static_cast<std::size_t>(i)];
    return sum / static_cast<double>(hi - lo);
}

//! float 频段电平切片的求和，以 float 累加，与 Swift 对 [Float] 做
//! `reduce(0, +)` 完全一致。
float floatSum(const std::vector<float>& v, int a, int b) {
    const int lo = std::max(0, a);
    const int hi = std::min(static_cast<int>(v.size()), b);
    float sum = 0;
    for (int i = lo; i < hi; ++i) sum += v[static_cast<std::size_t>(i)];
    return sum;
}

double frameMean(const std::vector<float>& f, int bandCount, int a, int b) {
    const int lo = std::max(0, a);
    const int hi = std::min(bandCount, b);
    if (!(hi > lo)) return -160;
    return static_cast<double>(floatSum(f, lo, hi)) / static_cast<double>(hi - lo);
}

double leastSquaresSlope(const std::vector<double>& s, int a, int z, double bandHz) {
    // xs = 频段索引 * bandHz / 1000（kHz），ys = s[band]
    const int count = z - a + 1;
    double mx = 0, my = 0;
    for (int i = a; i <= z; ++i) {
        mx += static_cast<double>(i) * bandHz / 1000;
        my += s[static_cast<std::size_t>(i)];
    }
    mx /= static_cast<double>(count);
    my /= static_cast<double>(count);
    double num = 0, den = 0;
    for (int i = a; i <= z; ++i) {
        const double x = static_cast<double>(i) * bandHz / 1000;
        const double y = s[static_cast<std::size_t>(i)];
        num += (x - mx) * (y - my);
        den += (x - mx) * (x - mx);
    }
    return den > 0 ? num / den : 0;
}

} // namespace

ForensicsAccumulator::ForensicsAccumulator(double sampleRate) : sampleRate_(sampleRate) {
    // 约 85 ms 一帧：44.1/48 kHz 用 4096，88.2/96 用 8192，176.4/192 用 16384。
    int size = 4096;
    while (static_cast<double>(size) / sampleRate < 0.07) size *= 2;
    fftSize_ = size;
    analyzer_ = SpectrumAnalyzer(size);
    binHz_ = sampleRate / static_cast<double>(size);
    bandCount_ = static_cast<int>((sampleRate / 2) / bandHz_);
}

std::vector<ForensicsAccumulator::MirrorSpan>
ForensicsAccumulator::measureMirror(const std::vector<float>& db) {
    std::vector<MirrorSpan> spans;
    if (sampleRate_ < 88200.0) return spans;

    const double reach = kMirrorStartHz + static_cast<double>(kMirrorSpanCount) * kMirrorSpanHz;
    const int w = mirrorSmoothing_;
    const double nan = std::numeric_limits<double>::quiet_NaN();
    std::vector<std::vector<double>> fineStructures;

    for (std::size_t ci = 0; ci < 2; ++ci) {
        const double c = kMirrorCenters[ci];
        const int lo = static_cast<int>(std::floor((c - reach) / binHz_)) - 1;
        const int hi = static_cast<int>(std::ceil((c + reach) / binHz_)) + 1;
        if (!(lo - w >= 0 && hi + w < static_cast<int>(db.size()))) return {};

        // lo...hi 范围内的精细结构：每个 bin 减去其周围 bin 的平均值。
        std::vector<double> prefix(static_cast<std::size_t>(hi - lo + 2 * w + 2), 0.0);
        for (int k = lo - w; k <= hi + w; ++k) {
            prefix[static_cast<std::size_t>(k - lo + w + 1)] =
                prefix[static_cast<std::size_t>(k - lo + w)] +
                static_cast<double>(db[static_cast<std::size_t>(k)]);
        }
        const double width = static_cast<double>(2 * w + 1);
        std::vector<double> fine(static_cast<std::size_t>(hi - lo + 1), 0.0);
        for (int k = lo; k <= hi; ++k) {
            const double sum = prefix[static_cast<std::size_t>(k - lo + 2 * w + 1)] -
                               prefix[static_cast<std::size_t>(k - lo)];
            fine[static_cast<std::size_t>(k - lo)] =
                static_cast<double>(db[static_cast<std::size_t>(k)]) - sum / width;
        }
        fineStructures.push_back(fine);

        const std::vector<double>* previous =
            ci < mirrorPrevious_.size() ? &mirrorPrevious_[ci] : nullptr;

        for (int j = 0; j < kMirrorSpanCount; ++j) {
            const double d0 = kMirrorStartHz + static_cast<double>(j) * kMirrorSpanHz;
            const double d1 = d0 + kMirrorSpanHz;
            const int b0 = static_cast<int>(std::ceil((c - d1) / binHz_));
            const int b1 = static_cast<int>(std::floor((c - d0) / binHz_));
            std::vector<double> xs, ys;
            double powerBelow = 0, powerAbove = 0;
            for (int k = b0; k <= b1; ++k) {
                // bin k 关于 c 的镜像位置；除非 c 正好落在栅格上，它位于两个 bin 之间。
                const double m = 2 * c / binHz_ - static_cast<double>(k);
                const int m0 = static_cast<int>(std::floor(m));
                const double t = m - static_cast<double>(m0);
                const double above = static_cast<double>(db[static_cast<std::size_t>(m0)]) * (1 - t) +
                                     static_cast<double>(db[static_cast<std::size_t>(m0 + 1)]) * t;
                powerBelow += std::pow(10, static_cast<double>(db[static_cast<std::size_t>(k)]) / 10);
                powerAbove += std::pow(10, above / 10);
                if (previous) {
                    const std::size_t i0 = static_cast<std::size_t>(m0 - lo);
                    const std::size_t ik = static_cast<std::size_t>(k - lo);
                    xs.push_back(fine[ik] - (*previous)[ik]);
                    const double d0f = fine[i0] - (*previous)[i0];
                    const double d1f = fine[i0 + 1] - (*previous)[i0 + 1];
                    ys.push_back(d0f * (1 - t) + d1f * t);
                }
            }
            const double n = static_cast<double>(b1 - b0 + 1);
            MirrorSpan span;
            span.correlation = previous ? static_cast<float>(pearson(xs, ys))
                                        : static_cast<float>(nan);
            span.belowDB = static_cast<float>(10 * std::log10(std::max(powerBelow / n, 1e-16)));
            span.aboveDB = static_cast<float>(10 * std::log10(std::max(powerAbove / n, 1e-16)));
            spans.push_back(span);
        }
    }
    mirrorPrevious_ = fineStructures;
    return spans;
}

double ForensicsAccumulator::pearson(const std::vector<double>& xs,
                                     const std::vector<double>& ys) {
    if (xs.size() < 3 || xs.size() != ys.size()) return 0;
    double mx = 0, my = 0;
    for (std::size_t i = 0; i < xs.size(); ++i) {
        mx += xs[i];
        my += ys[i];
    }
    mx /= static_cast<double>(xs.size());
    my /= static_cast<double>(ys.size());
    double sxy = 0, sxx = 0, syy = 0;
    for (std::size_t i = 0; i < xs.size(); ++i) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) * (xs[i] - mx);
        syy += (ys[i] - my) * (ys[i] - my);
    }
    return sxx > 0 && syy > 0 ? sxy / std::sqrt(sxx * syy) : 0;
}

void ForensicsAccumulator::add(const float* mono, std::size_t count) {
    const std::vector<float> db = analyzer_.magnitudes(mono, count);
    const int bins = static_cast<int>(db.size());

    // 100 Hz 频段，取每个频段的平均功率。
    std::vector<float> bands(static_cast<std::size_t>(bandCount_), -160.0f);
    for (int b = 0; b < bandCount_; ++b) {
        const int lo = static_cast<int>(static_cast<double>(b) * bandHz_ / binHz_);
        const int hi = std::min(
            bins, std::max(lo + 1, static_cast<int>(static_cast<double>(b + 1) * bandHz_ / binHz_)));
        if (!(lo < hi)) continue;
        double power = 0;
        for (int i = lo; i < hi; ++i) {
            power += std::pow(10, static_cast<double>(db[static_cast<std::size_t>(i)]) / 10);
        }
        bands[static_cast<std::size_t>(b)] =
            static_cast<float>(10 * std::log10(std::max(power / static_cast<double>(hi - lo), 1e-16)));
    }
    frames_.push_back(bands);

    // 空洞（holes）：在所在 1 kHz 区间确实有内容的地方，远低于该区间中位数的 bin。
    const int regions = static_cast<int>(sampleRate_ / 2 / 1000);
    std::vector<float> frameHoles(static_cast<std::size_t>(regions), -1.0f);
    for (int r = 0; r < regions; ++r) {
        const int lo = static_cast<int>(static_cast<double>(r) * 1000 / binHz_);
        const int hi = std::min(bins, static_cast<int>(static_cast<double>(r + 1) * 1000 / binHz_));
        if (hi - lo <= 8) continue;
        std::vector<float> slice(db.begin() + lo, db.begin() + hi);
        std::sort(slice.begin(), slice.end());
        const float median = slice[slice.size() / 2];
        if (!(median > -115)) continue;
        std::size_t empty = 0;
        for (float v : slice) {
            if (v < median - 30) {
                ++empty;
            } else {
                break;
            }
        }
        frameHoles[static_cast<std::size_t>(r)] =
            static_cast<float>(empty) / static_cast<float>(slice.size());
    }
    holes_.push_back(frameHoles);
    mirror_.push_back(measureMirror(db));
}

SpectralForensics ForensicsAccumulator::result() const {
    const double nyquist = sampleRate_ / 2;
    const int nFrames = static_cast<int>(frames_.size());
    SpectralForensics empty;
    empty.framesAnalyzed = nFrames;
    empty.belowDB = -160;
    empty.aboveDB = -160;
    empty.floorDB = -160;

    // 活跃帧：1-4 kHz 频带内有真实内容。
    const int lo1k = static_cast<int>(1000 / bandHz_);
    const int hi4k = std::min(bandCount_, static_cast<int>(4000 / bandHz_));
    std::vector<int> active;
    for (int i = 0; i < nFrames; ++i) {
        const std::vector<float>& f = frames_[static_cast<std::size_t>(i)];
        const int lo = std::max(0, lo1k), hi = std::min(bandCount_, hi4k);
        if (!(hi > lo)) continue;
        const float mean = floatSum(f, lo, hi) / static_cast<float>(hi - lo);
        if (mean > -75) active.push_back(i);
    }
    std::vector<int> use;
    if (active.size() >= 8) {
        use = active;
    } else {
        for (int i = 0; i < nFrames; ++i) use.push_back(i);
    }
    if (use.empty() || bandCount_ <= 40) return empty;

    // 长期谱：活跃帧的平均。
    std::vector<double> s(static_cast<std::size_t>(bandCount_), 0.0);
    for (int i : use) {
        const std::vector<float>& f = frames_[static_cast<std::size_t>(i)];
        for (int b = 0; b < bandCount_; ++b) {
            s[static_cast<std::size_t>(b)] += static_cast<double>(f[static_cast<std::size_t>(b)]);
        }
    }
    for (int b = 0; b < bandCount_; ++b) s[static_cast<std::size_t>(b)] /= static_cast<double>(use.size());

    auto mean = [&](int a, int b) { return meanOf(s, bandCount_, a, b); };

    // 本底噪声：1 kHz 以上最安静的那段 1 kHz。
    double floor = 0;
    {
        double best = std::numeric_limits<double>::infinity();
        int b = static_cast<int>(1000 / bandHz_);
        while (b + 10 <= bandCount_) {
            best = std::min(best, mean(b, b + 10));
            b += 5;
        }
        floor = std::isfinite(best) ? best : -160;
    }

    // 9 kHz 到紧邻 Nyquist 下方之间最陡的断层。
    int cliffBand = -1;
    double drop = 0;
    const int start = static_cast<int>(9000 / bandHz_);
    const int stop = bandCount_ - 6;
    if (start < stop) {
        for (int b = start; b < stop; ++b) {
            const double d = mean(b - 6, b - 2) - mean(b + 2, b + 6);
            if (d > drop) {
                drop = d;
                cliffBand = b;
            }
        }
    }
    std::optional<double> cliffHz;
    if (cliffBand >= 0 && drop >= 8) cliffHz = static_cast<double>(cliffBand) * bandHz_;

    double below = -160, above = -160, extensionHz = 0, slope = 0, consistency = 0, holeRatio = 0;
    if (cliffHz) {
        const int c = cliffBand;
        below = mean(c - 20, c - 3);
        above = mean(c + 3, std::min(bandCount_, c + 20));
        // 在断层之上延续的内容（允许短暂下凹）。
        int end = c + 2, gap = 0;
        int b = c + 2;
        while (b < bandCount_) {
            if (s[static_cast<std::size_t>(b)] > floor + 10) {
                end = b;
                gap = 0;
            } else {
                gap += 1;
                if (gap > 5) break;
            }
            b += 1;
        }
        extensionHz = std::max(0.0, static_cast<double>(end - c) * bandHz_);
        if (end - c > 8) slope = leastSquaresSlope(s, c + 3, end - 2, bandHz_);

        // 逐帧检查：在有下方内容的每个活跃帧里，断层是否显现？
        int seen = 0, with = 0;
        for (int i : use) {
            const std::vector<float>& f = frames_[static_cast<std::size_t>(i)];
            const double bl = frameMean(f, bandCount_, c - 6, c - 2);
            if (!(bl > floor + 15)) continue;
            seen += 1;
            if (bl - frameMean(f, bandCount_, c + 2, c + 6) >= 12) with += 1;
        }
        consistency = seen > 0 ? static_cast<double>(with) / static_cast<double>(seen) : 0;

        // 断层正下方 3 kHz 内的空洞。
        const int r1 = static_cast<int>(*cliffHz / 1000) - 1;
        const int r0 = std::max(0, r1 - 3);
        double sum = 0;
        int n = 0;
        for (const auto& h : holes_) {
            for (int r = r0; r < std::max(r0, r1); ++r) {
                if (r < static_cast<int>(h.size()) && h[static_cast<std::size_t>(r)] >= 0) {
                    sum += static_cast<double>(h[static_cast<std::size_t>(r)]);
                    n += 1;
                }
            }
        }
        holeRatio = n > 0 ? sum / static_cast<double>(n) : 0;
    }

    // 每个台阶：+-400 Hz 电平差的局部极大值。
    struct Step {
        int band;
        double drop;
    };
    std::vector<Step> steps;
    if (start < stop) {
        std::vector<double> d(static_cast<std::size_t>(bandCount_), 0.0);
        for (int b = 0; b < bandCount_; ++b) {
            if (b >= start && b < stop) {
                d[static_cast<std::size_t>(b)] = mean(b - 6, b - 2) - mean(b + 2, b + 6);
            }
        }
        for (int b = start; b < stop; ++b) {
            if (!(d[static_cast<std::size_t>(b)] >= 8)) continue;
            const int lo = std::max(start, b - 5);
            const int hi = std::min(stop - 1, b + 5);
            double best = d[static_cast<std::size_t>(lo)];
            for (int i = lo; i <= hi; ++i) best = std::max(best, d[static_cast<std::size_t>(i)]);
            if (d[static_cast<std::size_t>(b)] == best) steps.push_back({b, d[static_cast<std::size_t>(b)]});
        }
    }

    // 台阶在有下方内容的活跃帧中的一致性。
    auto stepConsistency = [&](int c) {
        int seen = 0, with = 0;
        for (int i : use) {
            const std::vector<float>& f = frames_[static_cast<std::size_t>(i)];
            const double bl = frameMean(f, bandCount_, c - 6, c - 2);
            if (!(bl > floor + 15)) continue;
            seen += 1;
            if (bl - frameMean(f, bandCount_, c + 2, c + 6) >= 8) with += 1;
        }
        return seen > 0 ? static_cast<double>(with) / static_cast<double>(seen) : 0;
    };

    // Shelf：不高于 24.5 kHz 的台阶，其上方是平坦内容，且在至少 1.5 kHz 内
    // （直到下一道墙或 Nyquist）始终远高于本底。
    struct Shelf {
        double hz;
        double step;
        double end;
        double slope;
        double above;
        double consistency;
    };
    std::optional<Shelf> shelf;
    for (const Step& step : steps) {
        if (!(static_cast<double>(step.band) * bandHz_ <= 24500)) continue;
        const int c = step.band;
        int end = c + 2, gap = 0, b = c + 3;
        while (b < bandCount_) {
            if (s[static_cast<std::size_t>(b)] > floor + 12) {
                end = b;
                gap = 0;
            } else {
                gap += 1;
                if (gap > 3) break;
            }
            // 在下一个显著台阶（终结 shelf 的那道墙）处停下。
            bool stopped = false;
            for (const Step& next : steps) {
                if (next.band > c + 5 && next.band <= b && next.drop >= 12) {
                    end = std::min(end, next.band);
                    stopped = true;
                    break;
                }
            }
            if (stopped) break;
            b += 1;
        }
        if (end - c < 15) continue;
        const int a = c + 3, z = end - 3;
        if (z - a < 8) continue;
        double my = 0;
        for (int i = a; i <= z; ++i) my += s[static_cast<std::size_t>(i)];
        my /= static_cast<double>(z - a + 1);
        const double candidateSlope = leastSquaresSlope(s, a, z, bandHz_);
        const Shelf candidate{static_cast<double>(c) * bandHz_, step.drop,
                              static_cast<double>(end) * bandHz_, candidateSlope, my - floor,
                              stepConsistency(c)};
        if (!shelf || candidate.step > shelf->step) shelf = candidate;
    }

    // shelf 是否随台阶下方的音乐一起升降？
    std::optional<double> tracking;
    if (shelf) {
        const int c = static_cast<int>(std::round(shelf->hz / bandHz_));
        const int end = static_cast<int>(std::round(shelf->end / bandHz_));
        std::vector<double> xs, ys;
        for (int i : use) {
            const std::vector<float>& f = frames_[static_cast<std::size_t>(i)];
            if (!(frameMean(f, bandCount_, c - 6, c - 2) > floor + 15)) continue;
            xs.push_back(frameMean(f, bandCount_, c - 20, c - 2));
            ys.push_back(frameMean(f, bandCount_, c + 3, end - 2));
        }
        tracking = 0; // 帧数太少，不足以证明它跟随音乐
        if (xs.size() >= 8) tracking = pearson(xs, ys);
    }

    // 有实际内容的最高频率。
    double content = 0;
    for (int b = bandCount_ - 1; b >= 0; --b) {
        if (s[static_cast<std::size_t>(b)] > floor + 10) {
            content = std::min(nyquist, static_cast<double>(b + 1) * bandHz_);
            break;
        }
    }

    // 镜像（imaging）：周围镜像得最好的那个旧 Nyquist。
    std::optional<std::tuple<double, double, int>> mirrored; // hz、correlation、frames
    {
        std::optional<std::tuple<double, double, int>> best;
        for (std::size_t ci = 0; ci < 2; ++ci) {
            const double c = kMirrorCenters[ci];
            double sum = 0;
            int n = 0, compared = 0;
            for (int i : use) {
                if (i >= static_cast<int>(mirror_.size())) continue;
                const auto& spans = mirror_[static_cast<std::size_t>(i)];
                if (spans.size() != 2u * static_cast<std::size_t>(kMirrorSpanCount)) continue;
                bool seen = false;
                for (int k = 0; k < kMirrorSpanCount; ++k) {
                    const MirrorSpan& span =
                        spans[ci * static_cast<std::size_t>(kMirrorSpanCount) + static_cast<std::size_t>(k)];
                    if (std::isnan(span.correlation)) continue;
                    if (!(static_cast<double>(span.aboveDB) > floor + 10)) continue;
                    if (!(static_cast<double>(span.belowDB) > floor + 15)) continue;
                    sum += static_cast<double>(span.correlation);
                    n += 1;
                    seen = true;
                }
                if (seen) compared += 1;
            }
            if (n == 0) continue;
            const std::tuple<double, double, int> candidate{c, sum / static_cast<double>(n), compared};
            if (!best) {
                best = candidate;
            } else {
                const int bFrames = std::get<2>(*best);
                const double bCorrelation = std::get<1>(*best);
                const bool better = compared >= FileAnalyzer::mirrorMinimumFrames
                                        ? (bFrames < FileAnalyzer::mirrorMinimumFrames ||
                                           std::get<1>(candidate) > bCorrelation)
                                        : (bFrames < FileAnalyzer::mirrorMinimumFrames &&
                                           compared > bFrames);
                if (better) best = candidate;
            }
        }
        mirrored = best;
    }

    SpectralForensics out;
    out.cliffHz = cliffHz;
    out.cliffDropDB = drop;
    out.cliffConsistency = consistency;
    out.belowDB = below;
    out.aboveDB = above;
    out.floorDB = floor;
    out.extensionHz = extensionHz;
    out.extensionSlope = slope;
    out.holeRatio = holeRatio;
    out.contentHz = content;
    out.framesAnalyzed = nFrames;
    if (shelf) {
        out.shelfHz = shelf->hz;
        out.shelfStepDB = shelf->step;
        out.shelfEndHz = shelf->end;
        out.shelfSlope = shelf->slope;
        out.shelfAboveFloorDB = shelf->above;
        out.shelfConsistency = shelf->consistency;
    }
    out.shelfTracking = tracking;
    if (mirrored) {
        out.mirrorHz = std::get<0>(*mirrored);
        out.mirrorCorrelation = std::get<1>(*mirrored);
        out.mirrorFrames = std::get<2>(*mirrored);
    }
    return out;
}

} // namespace vesper
