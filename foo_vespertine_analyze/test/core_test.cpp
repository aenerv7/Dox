//
// foo_vespertine_analyze — 分析核心的测试。
//
// 合成具有已知频谱形状的音频（随机相位 overlap-add，因此每一帧都像不同的
// 节目素材），送入累加器并检查判定结果。
// 同一批信号也可以导出给 Swift 一致性测试程序：
//
//   core_test --dump <dir>     写出 <dir>/<case>.f32 以及 <dir>/<case>.txt（期望的数值）
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "../src/core/core.h"
#include "../src/core/report_text.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace vesper;

namespace {

// ---------------------------------------------------------------- 合成辅助函数

//! 确定性的 PRNG（xorshift32），以便复现失败的用例。
struct Rng {
    uint32_t s = 0x9E3779B9u;
    uint32_t next() {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        return s;
    }
    double uniform() { return (next() >> 8) * (1.0 / 16777216.0); } // [0,1)
    double bipolar() { return uniform() * 2 - 1; }
};

void fft(std::vector<double>& re, std::vector<double>& im, bool inverse) {
    const int n = static_cast<int>(re.size());
    for (int i = 1, j = 0; i < n; ++i) {
        int bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            std::swap(re[static_cast<std::size_t>(i)], re[static_cast<std::size_t>(j)]);
            std::swap(im[static_cast<std::size_t>(i)], im[static_cast<std::size_t>(j)]);
        }
    }
    for (int len = 2; len <= n; len <<= 1) {
        const double angle = (inverse ? 2 : -2) * M_PI / len;
        const int half = len / 2;
        for (int i = 0; i < n; i += len) {
            for (int k = 0; k < half; ++k) {
                const double wr = std::cos(angle * k), wi = std::sin(angle * k);
                const double ar = re[static_cast<std::size_t>(i + k + half)];
                const double ai = im[static_cast<std::size_t>(i + k + half)];
                const double br = ar * wr - ai * wi;
                const double bi = ar * wi + ai * wr;
                const double xr = re[static_cast<std::size_t>(i + k)];
                const double xi = im[static_cast<std::size_t>(i + k)];
                re[static_cast<std::size_t>(i + k)] = xr + br;
                im[static_cast<std::size_t>(i + k)] = xi + bi;
                re[static_cast<std::size_t>(i + k + half)] = xr - br;
                im[static_cast<std::size_t>(i + k + half)] = xi - bi;
            }
        }
    }
    if (inverse) {
        for (int i = 0; i < n; ++i) {
            re[static_cast<std::size_t>(i)] /= n;
            im[static_cast<std::size_t>(i)] /= n;
        }
    }
}

//! 节目素材所在的频段（单位为 Hz），以及它的形状。
struct Shape {
    double from = 20;        //!< 下边界
    double to = 20000;       //!< 上边界
    double taper = 4000;     //!< `to` 下方滚降区的宽度
    double mirrorStart = 0;  //!< 大于 0 时，在这条线之上加入镜像（imaging）成分
    double mirrorGain = 0.02;
    double shelfAbove = 0;   //!< 大于 0 时，从这里到 `shelfTo` 之间加入额外的平坦内容
    double shelfTo = 0;
    double shelfGain = 0;
    double tilt = 4;         //!< 1 kHz 以上每倍频程的 dB 数，真实节目素材就是这样向下倾斜的
};

//! 随机相位 overlap-add 合成：频谱是精确的，每个 hop 的相位都是新的，所以相邻帧之间的
//! 差异就像节目素材那样。所有频点共有的一个缓慢电平变化，让高频段跟着低频段走
//! （shelf 用例则不跟随）。
std::vector<float> synthesize(const Shape& shape, double sampleRate, double seconds, Rng& rng) {
    const int block = 4096, hop = block / 2;
    const int total = static_cast<int>(seconds * sampleRate);
    std::vector<double> out(static_cast<std::size_t>(total) + block, 0.0);
    std::vector<double> window(block);
    for (int i = 0; i < block; ++i) {
        window[static_cast<std::size_t>(i)] = 0.5 * (1 - std::cos(2 * M_PI * i / block));
    }
    std::vector<double> re(block), im(block);
    const double binHz = sampleRate / block;
    auto envelope = [&](double f) {
        double m = 0;
        if (f >= shape.from && shape.to > 0) {
            if (f <= shape.to - shape.taper) {
                m = 1;
            } else if (f <= shape.to) {
                m = 0.5 * (1 + std::cos(M_PI * (f - (shape.to - shape.taper)) / shape.taper));
            }
        }
        if (shape.shelfAbove > 0 && f >= shape.shelfAbove && f <= shape.shelfTo) m = shape.shelfGain;
        if (m > 0 && f > 1000) m *= std::pow(1000.0 / f, shape.tilt / 6.0206);
        return m;
    };
    double level = 1;
    for (int start = 0, index = 0; start + block <= total + block; start += hop, ++index) {
        if (index % 8 == 0) level = 0.5 + 0.9 * rng.uniform(); // 约 190 ms 的公共电平变化
        std::fill(re.begin(), re.end(), 0.0);
        std::fill(im.begin(), im.end(), 0.0);
        for (int k = 1; k < block / 2; ++k) {
            double m = envelope(k * binHz);
            if (m > 0) m *= level * (1 + 0.2 * rng.bipolar());
            const double phase = 2 * M_PI * rng.uniform();
            re[static_cast<std::size_t>(k)] = m * std::cos(phase);
            im[static_cast<std::size_t>(k)] = m * std::sin(phase);
            re[static_cast<std::size_t>(block - k)] = re[static_cast<std::size_t>(k)];
            im[static_cast<std::size_t>(block - k)] = -im[static_cast<std::size_t>(k)];
        }
        fft(re, im, true);
        for (int i = 0; i < block; ++i) {
            out[static_cast<std::size_t>(start + i)] +=
                re[static_cast<std::size_t>(i)] * window[static_cast<std::size_t>(i)];
        }
    }
    std::vector<float> pcm(static_cast<std::size_t>(total));
    double peak = 0;
    for (int i = 0; i < total; ++i) peak = std::max(peak, std::fabs(out[static_cast<std::size_t>(i)]));
    const double gain = peak > 0 ? 0.85 / peak : 0;
    for (int i = 0; i < total; ++i) {
        pcm[static_cast<std::size_t>(i)] = static_cast<float>(out[static_cast<std::size_t>(i)] * gain);
    }
    return pcm;
}

//! 加入短采样率转换器的镜像（imaging）成分：在 `centerHz` 之上，是它下方内容的相干
//! （共轭）副本，按滤波器阻带的方式衰减。在频域中用重叠块完成，因此镜像确实是信号
//! 的函数。
void addMirrorImages(std::vector<float>& pcm, double sampleRate, double centerHz, double level,
                     double decayDBPerKHz) {
    const int n = 65536;                 // 中心正好落在 sampleRate/4 上，因此 n/2 是整数
    const int hop = n / 2;
    if (std::fabs(centerHz - sampleRate / 4) > 0.5) return;
    std::vector<double> window(static_cast<std::size_t>(n));
    for (int i = 0; i < n; ++i) {
        window[static_cast<std::size_t>(i)] = 0.5 * (1 - std::cos(2 * M_PI * i / n));
    }
    std::vector<double> out(pcm.size() + static_cast<std::size_t>(n), 0.0);
    std::vector<double> re(static_cast<std::size_t>(n)), im(static_cast<std::size_t>(n));
    const int mirrorBin = n / 2;
    for (std::size_t start = 0; start < pcm.size(); start += static_cast<std::size_t>(hop)) {
        for (int i = 0; i < n; ++i) {
            const std::size_t j = start + static_cast<std::size_t>(i);
            re[static_cast<std::size_t>(i)] =
                (j < pcm.size() ? static_cast<double>(pcm[j]) : 0.0) * window[static_cast<std::size_t>(i)];
            im[static_cast<std::size_t>(i)] = 0;
        }
        fft(re, im, false);
        std::vector<double> addRe(static_cast<std::size_t>(mirrorBin) + 1, 0.0);
        std::vector<double> addIm(static_cast<std::size_t>(mirrorBin) + 1, 0.0);
        for (int k = 1; k < mirrorBin; ++k) {
            const int t = mirrorBin - k;
            if (t <= 0 || t >= mirrorBin) continue;
            const double f = t * sampleRate / n;
            const double g = level * std::pow(10, -decayDBPerKHz * std::max(0.0, f - centerHz) / 1000.0 / 20.0);
            addRe[static_cast<std::size_t>(t)] += g * re[static_cast<std::size_t>(k)];
            addIm[static_cast<std::size_t>(t)] -= g * im[static_cast<std::size_t>(k)];
        }
        for (int k = 1; k < mirrorBin; ++k) {
            re[static_cast<std::size_t>(k)] += addRe[static_cast<std::size_t>(k)];
            im[static_cast<std::size_t>(k)] += addIm[static_cast<std::size_t>(k)];
            re[static_cast<std::size_t>(n - k)] = re[static_cast<std::size_t>(k)];
            im[static_cast<std::size_t>(n - k)] = -im[static_cast<std::size_t>(k)];
        }
        im[0] = 0;
        im[static_cast<std::size_t>(mirrorBin)] = 0;
        fft(re, im, true);
        for (int i = 0; i < n; ++i) out[start + static_cast<std::size_t>(i)] += re[static_cast<std::size_t>(i)];
    }
    double peak = 0;
    for (std::size_t i = 0; i < pcm.size(); ++i) peak = std::max(peak, std::fabs(out[i]));
    const double gain = peak > 0 ? 0.85 / peak : 0;
    for (std::size_t i = 0; i < pcm.size(); ++i) {
        pcm[i] = static_cast<float>(out[i] * gain);
    }
}

void quantize(std::vector<float>& pcm, int bits) {
    const double scale = std::pow(2.0, bits - 1);
    for (float& s : pcm) s = static_cast<float>(std::round(static_cast<double>(s) * scale) / scale);
}

// ---------------------------------------------------------------- 报告输出

void put(FILE* out, const std::string& key, const std::string& value) {
    std::fprintf(out, "%s=%s\n", key.c_str(), value.c_str());
}
void put(FILE* out, const std::string& key, double v) { std::fprintf(out, "%s=%.9g\n", key.c_str(), v); }
void put(FILE* out, const std::string& key, int v) { std::fprintf(out, "%s=%d\n", key.c_str(), v); }
void putOpt(FILE* out, const std::string& key, const std::optional<double>& v) {
    if (v) std::fprintf(out, "%s=%.9g\n", key.c_str(), *v); else std::fprintf(out, "%s=nan\n", key.c_str());
}

void report(FILE* out, const FileAnalysis& a) {
    put(out, "verdict", verdictKey(a.verdict));
    put(out, "confidence", a.confidence);
    put(out, "bandwidthHz", a.bandwidthHz);
    put(out, "peakDBFS", a.peakDBFS);
    put(out, "clippedSamples", a.clippedSamples);
    put(out, "secondsAnalyzed", a.secondsAnalyzed);
    put(out, "summary", a.summary);
    if (!a.forensics) return;
    const SpectralForensics& f = *a.forensics;
    putOpt(out, "cliffHz", f.cliffHz);
    put(out, "cliffDropDB", f.cliffDropDB);
    put(out, "cliffConsistency", f.cliffConsistency);
    put(out, "belowDB", f.belowDB);
    put(out, "aboveDB", f.aboveDB);
    put(out, "floorDB", f.floorDB);
    put(out, "extensionHz", f.extensionHz);
    put(out, "extensionSlope", f.extensionSlope);
    put(out, "holeRatio", f.holeRatio);
    put(out, "contentHz", f.contentHz);
    put(out, "framesAnalyzed", f.framesAnalyzed);
    putOpt(out, "shelfHz", f.shelfHz);
    put(out, "shelfStepDB", f.shelfStepDB);
    put(out, "shelfEndHz", f.shelfEndHz);
    put(out, "shelfSlope", f.shelfSlope);
    put(out, "shelfAboveFloorDB", f.shelfAboveFloorDB);
    put(out, "shelfConsistency", f.shelfConsistency);
    putOpt(out, "shelfTracking", f.shelfTracking);
    putOpt(out, "mirrorHz", f.mirrorHz);
    putOpt(out, "mirrorCorrelation", f.mirrorCorrelation);
    if (f.mirrorFrames) put(out, "mirrorFrames", *f.mirrorFrames); else put(out, "mirrorFrames", "none");
}

//! 运行一个用例。`chunk` > 0 时按固定大小的块送入音频，为 0 时一次送入。
FileAnalysis run(const std::vector<float>& pcm, double sampleRate, std::optional<int> claimed,
                 int chunk = 0) {
    AnalysisAccumulator acc(sampleRate, 1, claimed);
    if (chunk <= 0) {
        acc.addInterleaved(pcm.data(), static_cast<int>(pcm.size()));
    } else {
        for (std::size_t i = 0; i < pcm.size(); i += static_cast<std::size_t>(chunk)) {
            const int n = static_cast<int>(std::min<std::size_t>(static_cast<std::size_t>(chunk), pcm.size() - i));
            acc.addInterleaved(pcm.data() + i, n);
        }
    }
    return acc.finish();
}

Verdict verdictFromKey(const char* key) {
    for (int v = 0; v <= 5; ++v) {
        const Verdict cand = static_cast<Verdict>(v);
        if (std::strcmp(verdictKey(cand), key) == 0) return cand;
    }
    return Verdict::NotApplicable;
}

// ---------------------------------------------------------------- 测试用例

struct Case {
    const char* name;
    double sampleRate;
    double seconds;
    Shape shape;
    std::optional<int> claimed;
    int quantizeBits; // 0: 保持原样
    const char* expectVerdict;
};

std::vector<Case> cases() {
    std::vector<Case> v;
    // 真正的 16-bit CD 母带：节目素材到约 21 kHz，然后滚降，另有八个无效位。
    v.push_back({"genuine-16", 44100, 4, Shape{20, 21400, 4000}, 16, 16, "genuine"});
    // 同样的音频放在 24-bit 容器里。
    v.push_back({"padded-24-16", 44100, 4, Shape{20, 21400, 4000}, 24, 16, "padded"});
    // 真正的 hi-res 24-bit 母带。
    v.push_back({"genuine-24", 96000, 4, Shape{20, 43000, 8000}, 24, 24, "genuine"});
    // CD 区域之下的 16 kHz 砖墙：128 kbps MP3，或者是频带受限的母带。
    v.push_back({"wall-16k-44", 44100, 4, Shape{20, 15800, 150}, 16, 16, "lossy-origin"});
    // CD 编码区内的 20 kHz 级砖墙。
    v.push_back({"wall-20k-44", 44100, 4, Shape{20, 19900, 150}, 16, 16, "lossy-origin"});
    // 48 kHz 母带经过短升频器到 96 kHz：24 kHz 之上是逐渐衰减的镜像，再往上噪声底是空的。
    // （镜像是相干地加入的，就像真实滤波器那样。）
    v.push_back({"upsampled-mirror", 96000, 4, Shape{20, 24000, 200, 24000}, 24, 24, "upsampled"});
    // 96 kHz 文件里出现 44.1 kHz 风格的 20 kHz 砖墙。
    v.push_back({"upsampled-wall", 96000, 4, Shape{20, 19900, 150}, 24, 24, "upsampled"});
    // 有损文件被加上了合成高频的 shelf（HE-AAC SBR、AI “增强”）。
    v.push_back({"extended-shelf", 44100, 4, Shape{20, 15800, 150, 0, 0, 16000, 21000, 0.12}, 16, 16,
                 "extended"});
    // 数字静音。
    v.push_back({"silence", 44100, 4, Shape{0, 0, 150}, 16, 16, "n/a"});
    // 半秒钟：帧数不够做频谱检查。
    v.push_back({"too-short", 44100, 0.4, Shape{20, 21400, 4000}, 16, 16, "n/a"});
    // 非常安静，但真实：绝不会凭这些证据判定为假。
    v.push_back({"quiet", 44100, 4, Shape{20, 21400, 4000}, 16, 16, "genuine"});
    return v;
}

} // namespace

int main(int argc, char** argv) {
    const bool dump = argc > 2 && std::strcmp(argv[1], "--dump") == 0;
    const std::string dir = dump ? argv[2] : std::string();
    int failures = 0;
    for (const Case& c : cases()) {
        Rng rng;
        Shape shape = c.shape;
        std::vector<float> pcm = synthesize(shape, c.sampleRate, c.seconds, rng);
        if (shape.mirrorStart > 0) {
            addMirrorImages(pcm, c.sampleRate, shape.mirrorStart, shape.mirrorGain, 6);
        }
        if (c.quantizeBits) quantize(pcm, c.quantizeBits);
        if (std::strcmp(c.name, "quiet") == 0) {
            for (float& s : pcm) s = static_cast<float>(s * 0.001); // -60 dBFS
        }
        const FileAnalysis a = run(pcm, c.sampleRate, c.claimed);
        ReportRow row;
        row.path = std::string("/music/album/") + c.name + ".flac";
        row.claim.codec = "FLAC";
        row.claim.bits = c.claimed;
        row.claim.sampleRate = c.sampleRate;
        row.claim.channels = 1;
        row.analysis = a;
        bool ok = a.verdict == verdictFromKey(c.expectVerdict);
        if (a.verdict == Verdict::Genuine && actualText(row) != claimedText(row.claim)) {
            std::printf("%-18s FAIL a genuine file must read the same in both columns\n", c.name);
            ok = false;
        }
        if (!ok) ++failures;
        if (!dump) {
            std::printf("%-18s %-12s %s\n  %s\n", c.name, verdictKey(a.verdict),
                        ok ? "ok" : "FAIL", a.summary.c_str());
        } else {
            const std::string base = dir + "/" + c.name;
            FILE* f = std::fopen((base + ".f32").c_str(), "wb");
            if (f) {
                std::fwrite(pcm.data(), sizeof(float), pcm.size(), f);
                std::fclose(f);
            }
            FILE* meta = std::fopen((base + ".meta").c_str(), "w");
            if (meta) {
                std::fprintf(meta, "sampleRate=%g\n", c.sampleRate);
                std::fprintf(meta, "claimed=%d\n", c.claimed.value_or(0));
                std::fclose(meta);
            }
            FILE* columns = std::fopen((base + ".columns.txt").c_str(), "w");
            if (columns) {
                std::fprintf(columns, "path=%s\nclaimed=%s\nactual=%s\ndetail=\n%s\n",
                             row.path.c_str(), claimedText(row.claim).c_str(),
                             actualText(row).c_str(), detailText(row).c_str());
                std::fclose(columns);
            }
            FILE* m = std::fopen((base + ".cpp.txt").c_str(), "w");
            if (m) {
                report(m, a);
                std::fclose(m);
            }
            // 分块不能改变结果。
            const FileAnalysis chunked = run(pcm, c.sampleRate, c.claimed, 511);
            if (chunked.verdict != a.verdict || std::fabs(chunked.bandwidthHz - a.bandwidthHz) > 0.5 ||
                std::fabs(chunked.confidence - a.confidence) > 1e-9) {
                std::printf("%-18s FAIL chunking changed the result\n", c.name);
                ++failures;
            }
        }
    }
    // 报告文本：与音频无关的那些部分。
    struct {
        double bandwidth;
        double expect;
    } const rates[] = {{19900, 44100}, {22050, 44100}, {23000, 48000}, {43000, 88200},
                       {20000, 44100}, {24000, 48000}, {47000, 96000}, {200, 32000}};
    for (const auto& r : rates) {
        if (std::fabs(sourceRateFor(r.bandwidth) - r.expect) > 0.5) {
            std::printf("sourceRateFor(%.0f) = %.0f, expected %.0f\n", r.bandwidth,
                        sourceRateFor(r.bandwidth), r.expect);
            ++failures;
        }
    }
    {
        TrackClaim claim{"FLAC", 24, 96000, 2};
        if (claimedText(claim) != "FLAC 24-bit / 96 kHz / 2 ch") {
            std::printf("claimedText gave \"%s\"\n", claimedText(claim).c_str());
            ++failures;
        }
        TrackClaim bare{"MP3", std::nullopt, 44100, 2};
        if (claimedText(bare) != "MP3 / 44.1 kHz / 2 ch") {
            std::printf("claimedText gave \"%s\"\n", claimedText(bare).c_str());
            ++failures;
        }
    }

    std::printf(failures == 0 ? "\nall cases passed\n" : "\n%d case(s) failed\n", failures);
    return failures == 0 ? 0 : 1;
}
