//
// foo_vespertine_analyze — 文件分析与判定
// （Vespertine FileAnalysis.swift 的移植）。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "core.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>

namespace vesper {

namespace {

const char* const kLeftQuote = "\xE2\x80\x9C";  // U+201C，左引号
const char* const kRightQuote = "\xE2\x80\x9D"; // U+201D，右引号

std::string num(int v) { return std::to_string(v); }

std::string khz(double hz) {
    char buffer[32];
    std::snprintf(buffer, sizeof(buffer), "%.1f", hz / 1000);
    return buffer;
}

int percent(double x) { return static_cast<int>(std::round(x * 100)); }

std::string bitsInUse(int effective, int claimed) {
    return "No zero padding: " + num(effective) + " of " + num(claimed) + " bits are in use.";
}

} // namespace

const char* verdictKey(Verdict v) {
    switch (v) {
    case Verdict::Genuine: return "genuine";
    case Verdict::PaddedBitDepth: return "padded";
    case Verdict::Upsampled: return "upsampled";
    case Verdict::PossibleLossyOrigin: return "lossy-origin";
    case Verdict::BandwidthExtended: return "extended";
    case Verdict::NotApplicable: return "n/a";
    }
    return "n/a";
}

const char* verdictTitle(Verdict v) {
    switch (v) {
    case Verdict::Genuine: return "Looks genuine";
    case Verdict::PaddedBitDepth: return "Zero-padded (fake bit depth)";
    case Verdict::Upsampled: return "Upsampled";
    case Verdict::PossibleLossyOrigin: return "Possible lossy origin";
    case Verdict::BandwidthExtended: return "High frequencies synthesized";
    case Verdict::NotApplicable: return "Not applicable";
    }
    return "Not applicable";
}

// ---------------------------------------------------------------- 累加器

AnalysisAccumulator::AnalysisAccumulator(double sampleRate, int channels,
                                         std::optional<int> claimedBitDepth, double maxSeconds)
    : sampleRate_(sampleRate),
      channels_(std::max(1, channels)),
      claimedBitDepth_(claimedBitDepth),
      analyzer_(8192),
      forensics_(sampleRate) {
    claimed_ = claimedBitDepth.value_or(24);
    const int shift = std::max(1, std::min(claimed_, 24)) - 1;
    scale_ = static_cast<double>(1 << shift);
    // 正向满幅比 1 低一个量化步（16-bit 文件中为 32767/32768）。
    clipLevel_ = static_cast<float>(std::min(0.99999, 1 - 1 / scale_));
    limit_ = std::max(0.0, maxSeconds) * sampleRate;
    spectrumSum_.assign(8192 / 2, 0.0);
    historyLimit_ = 2 * std::max(8192, forensics_.fftSize());
    history_.reserve(static_cast<std::size_t>(historyLimit_) + 32768);
    fftStride_ = std::max(1, static_cast<int>(sampleRate / 4)); // 每秒四张频谱
}

void AnalysisAccumulator::addInterleaved(const float* samples, int frames) {
    const int n = std::min(frames, std::max(0, static_cast<int>(limit_ - framesDone_)));
    if (n <= 0) return;
    const int needed = std::max(8192, forensics_.fftSize());
    int frame = 0;
    while (frame < n) {
        // 截止到下一个频谱点，这样无论输入如何分块，频谱都落在相同的
        // 音频位置上。
        const int segment =
            std::min(n - frame, std::max(1, fftStride_ - framesSinceFFT_));
        for (int f = frame; f < frame + segment; ++f) {
            float sum = 0;
            for (int c = 0; c < channels_; ++c) {
                const float s = samples[static_cast<std::size_t>(f) * static_cast<std::size_t>(channels_) +
                                       static_cast<std::size_t>(c)];
                if (!std::isfinite(s)) throw AnalysisError("invalid sample");
                const float a = std::fabs(s);
                if (a > peak_) peak_ = a;
                if (a >= clipLevel_) clipped_ += 1;
                const double integer = static_cast<double>(s) * scale_;
                double rounded = std::round(integer);
                rounded = std::max(static_cast<double>(INT32_MIN),
                                   std::min(static_cast<double>(INT32_MAX), rounded));
                orBits_ |= static_cast<int32_t>(rounded);
                sum += s;
            }
            history_.push_back(sum / static_cast<float>(channels_));
        }
        if (history_.size() > static_cast<std::size_t>(historyLimit_)) {
            const std::size_t excess = history_.size() - static_cast<std::size_t>(historyLimit_);
            history_.erase(history_.begin(), history_.begin() + static_cast<std::ptrdiff_t>(excess));
        }
        frame += segment;
        framesSinceFFT_ += segment;
        if (framesSinceFFT_ >= fftStride_ &&
            history_.size() >= static_cast<std::size_t>(needed)) {
            framesSinceFFT_ = 0;
            forensics_.add(history_.data() + history_.size() -
                               static_cast<std::size_t>(forensics_.fftSize()),
                           static_cast<std::size_t>(forensics_.fftSize()));
            const std::vector<float> mags =
                analyzer_.magnitudes(history_.data() + history_.size() - 8192, 8192);
            for (std::size_t i = 0; i < mags.size(); ++i) {
                spectrumSum_[i] += std::pow(10, static_cast<double>(mags[i]) / 10);
            }
            spectrumFrames_ += 1;
        }
    }
    framesDone_ += static_cast<double>(n);
}

FileAnalysis AnalysisAccumulator::finish() {
    // 有效位深：所有采样共有的尾部零位。仅在有已知字长时才判断：若对着假定的字长判断，
    // 16-bit 文件会被读成补零。
    std::optional<int> effective;
    if (claimedBitDepth_ && claimed_ <= 24) {
        if (orBits_ != 0) {
            int trailing = 0;
            uint32_t bits = static_cast<uint32_t>(orBits_);
            while ((bits & 1u) == 0) {
                bits >>= 1;
                ++trailing;
            }
            effective = std::min(claimed_, 24) - trailing;
        } else {
            effective = 0;
        }
    }

    // 长期谱与带宽。
    const double binHz = sampleRate_ / 8192.0;
    std::vector<double> avgDB(spectrumSum_.size());
    for (std::size_t i = 0; i < spectrumSum_.size(); ++i) {
        avgDB[i] = spectrumFrames_ > 0
                       ? 10 * std::log10(std::max(spectrumSum_[i] / static_cast<double>(spectrumFrames_), 1e-20))
                       : -200;
    }
    const double bandwidth = FileAnalyzer::estimateBandwidth(avgDB, binHz);
    const double nyquist = sampleRate_ / 2;
    std::vector<float> spectrum(256, 0.0f);
    for (int i = 0; i < 256; ++i) {
        const double f = 20 * std::pow(nyquist / 20, static_cast<double>(i) / 255);
        const int bin = std::min(static_cast<int>(avgDB.size()) - 1,
                                 std::max(0, static_cast<int>(f / binHz)));
        spectrum[static_cast<std::size_t>(i)] = static_cast<float>(avgDB[static_cast<std::size_t>(bin)]);
    }

    const SpectralForensics measured = forensics_.result();
    const double peakDBFS =
        peak_ == 0 ? -std::numeric_limits<double>::infinity()
                   : 20 * std::log10(static_cast<double>(peak_));
    return FileAnalyzer::conclude(measured, claimedBitDepth_, effective, sampleRate_, peakDBFS,
                                  clipped_, bandwidth, spectrum, framesDone_ / sampleRate_);
}

// ---------------------------------------------------------------- 判定

FileAnalysis FileAnalyzer::notApplicable(std::optional<int> claimedBitDepth, double sampleRate,
                                         const std::string& summary) {
    FileAnalysis a;
    a.claimedBitDepth = claimedBitDepth;
    a.effectiveBitDepth = std::nullopt;
    a.sampleRate = sampleRate;
    a.bandwidthHz = 0;
    a.peakDBFS = 0;
    a.clippedSamples = 0;
    a.verdict = Verdict::NotApplicable;
    a.summary = summary;
    return a;
}

FileAnalysis FileAnalyzer::conclude(const SpectralForensics& measured,
                                    std::optional<int> claimedBitDepth,
                                    std::optional<int> effectiveBitDepth, double sampleRate,
                                    double peakDBFS, int clippedSamples, double bandwidth,
                                    const std::vector<float>& spectrum, double secondsAnalyzed) {
    const int claimed = claimedBitDepth.value_or(24);
    if (!std::isfinite(peakDBFS)) {
        // 只解码出数字静音：两边都没证据，所以绝不判定为 genuine。
        FileAnalysis a;
        a.claimedBitDepth = claimedBitDepth;
        a.sampleRate = sampleRate;
        a.peakDBFS = -std::numeric_limits<double>::infinity();
        a.verdict = Verdict::NotApplicable;
        a.summary =
            "The file decoded as digital silence, so there's nothing to analyze.";
        a.spectrum = spectrum;
        a.secondsAnalyzed = secondsAnalyzed;
        a.forensics = measured;
        a.version = currentVersion;
        a.confidence = 0;
        return a;
    }

    const Judgement judged = judge(measured, claimed, effectiveBitDepth, sampleRate);

    // 频谱上可判的东西太少：文件极短，或没有任何东西能从本底里凸显
    // 出来（极安静，或声道混为单声道时互相抵消）。补零是精确的，仍会
    // 照实报告；其他项则不报。
    const int minimumFrames = 6;
    if (judged.verdict != Verdict::PaddedBitDepth &&
        (measured.framesAnalyzed < minimumFrames || measured.contentHz == 0)) {
        const std::string reason =
            measured.framesAnalyzed < minimumFrames
                ? "Too short for the spectral checks (they need a couple of seconds of audio), so the result is inconclusive."
                : "Nothing in the spectrum stands out from the noise floor (very quiet, or the channels cancel when mixed to mono), so the spectral checks are inconclusive.";
        std::string bits;
        if (effectiveBitDepth && *effectiveBitDepth > 0) {
            bits = " " + (*effectiveBitDepth >= claimed
                              ? std::string("No zero padding: all ") + num(claimed) +
                                    " bits are in use."
                              : bitsInUse(*effectiveBitDepth, claimed));
        } else {
            bits = " Word length not checked.";
        }
        FileAnalysis a;
        a.claimedBitDepth = claimedBitDepth;
        a.effectiveBitDepth = effectiveBitDepth;
        a.sampleRate = sampleRate;
        a.bandwidthHz = 0;
        a.peakDBFS = peakDBFS;
        a.clippedSamples = clippedSamples;
        a.verdict = Verdict::NotApplicable;
        a.summary = reason + bits;
        a.spectrum = spectrum;
        a.secondsAnalyzed = secondsAnalyzed;
        a.forensics = measured;
        a.version = currentVersion;
        a.confidence = 0;
        return a;
    }

    // 显示带宽跟随取证测量结果（对截止之上稀疏微弱的
    // 杂散更稳健）。
    FileAnalysis a;
    a.claimedBitDepth = claimedBitDepth;
    a.effectiveBitDepth = effectiveBitDepth;
    a.sampleRate = sampleRate;
    a.bandwidthHz = judged.bandwidth.value_or(bandwidth);
    a.peakDBFS = peakDBFS;
    a.clippedSamples = clippedSamples;
    a.verdict = judged.verdict;
    a.summary = judged.summary;
    a.spectrum = spectrum;
    a.secondsAnalyzed = secondsAnalyzed;
    a.forensics = measured;
    a.version = currentVersion;
    a.confidence = judged.confidence;
    return a;
}

FileAnalyzer::Judgement FileAnalyzer::judge(const SpectralForensics& f, int claimedBits,
                                            std::optional<int> effectiveBits,
                                            double sampleRate) {
    Judgement result;

    if (effectiveBits && *effectiveBits > 0 && *effectiveBits < claimedBits - 1) {
        result.verdict = Verdict::PaddedBitDepth;
        result.summary = num(claimedBits) + "-bit file, but only " + num(*effectiveBits) +
                         " bits carry audio (zero-padded).";
        result.confidence = 1;
        return result;
    }

    // 低于 44.1 kHz 时，文件自身的抗混叠滤波器就落在编解码器区域：它频带顶部十分之一是那个
    // 滤波器，而不是编解码器墙（真正的 32 kHz 母带在 15 kHz 附近截止）。
    auto ownFilter = [&](double hz) { return sampleRate < 44100 && hz >= 0.9 * sampleRate / 2; };

    // 编解码器墙：抗混叠区之下、逐帧稳定的陡峭低通。若其上方还有更陡的墙，较低的台阶也算数
    // （有损文件后来被升采样或扩展过）。
    struct Wall {
        double hz;
        double drop;
        double consistency;
    };
    std::optional<Wall> wall;
    double wallConfidence = 0;
    bool cdZoneWall = false;
    const bool hiRes = sampleRate >= 88200;

    if (f.cliffHz && *f.cliffHz < 19600 && !ownFilter(*f.cliffHz) && f.cliffDropDB >= 15 &&
        f.cliffConsistency >= 0.5) {
        wall = Wall{*f.cliffHz, f.cliffDropDB, f.cliffConsistency};
        wallConfidence = std::min(spectralConfidenceCap,
                                  0.5 + (f.cliffDropDB - 15) / 40 + (f.cliffConsistency - 0.5) / 2);
    } else if (f.shelfHz && *f.shelfHz < 19600 && !ownFilter(*f.shelfHz) &&
               f.shelfStepDB >= 15 && f.shelfConsistency >= 0.6) {
        wall = Wall{*f.shelfHz, f.shelfStepDB, f.shelfConsistency};
        wallConfidence = std::min(spectralConfidenceCap,
                                  0.5 + (f.shelfStepDB - 15) / 40 + (f.shelfConsistency - 0.6) / 2);
    } else if (!hiRes && f.cliffHz && *f.cliffHz >= 19600 && *f.cliffHz < 20700 &&
               f.cliffDropDB >= 22 && f.cliffConsistency >= 0.85) {
        // 有损编码器那类 20 kHz 低通坐在 19.9-20.6 kHz（MP3 320 约 20.0，Opus 20.3，
        // HE-AAC 20.4-20.6）；而真正的 CD 母带陡峭滤波器实测在 21.1 kHz 及以上。
        wall = Wall{*f.cliffHz, f.cliffDropDB, f.cliffConsistency};
        wallConfidence = std::min(0.55, 0.5 + (f.cliffDropDB - 22) / 40 + (f.cliffConsistency - 0.85));
        cdZoneWall = true;
    }

    // 合成高频：较低台阶之上有一段真实内容构成的平坦 shelf，其电平
    // 随音乐升降。
    const bool follows = f.shelfTracking ? *f.shelfTracking >= shelfTrackingThreshold : true;
    const bool wallVouches = wall.has_value() && !(cdZoneWall && sampleRate < 46000);
    // 远在 20 kHz 之前就停住的窄带，是编码器低通的过渡带。
    const bool encoderBand =
        f.shelfHz ? (f.shelfEndHz - *f.shelfHz < 3000 && f.shelfEndHz < 19600) : false;

    if (f.shelfHz && *f.shelfHz <= 20500 && !ownFilter(*f.shelfHz) && f.shelfStepDB >= 10 &&
        f.shelfSlope >= -2.5 && f.shelfAboveFloorDB >= 10 && f.shelfConsistency >= 0.8 &&
        f.shelfEndHz - *f.shelfHz >= 1500 && follows && !encoderBand &&
        (wallVouches || (*f.shelfHz < 19600 && f.shelfStepDB >= 15))) {
        const bool closedByWall = f.cliffHz ? (*f.cliffHz > *f.shelfHz + 1000 &&
                                               f.cliffDropDB >= 22 && f.cliffConsistency >= 0.85)
                                            : false;
        const double conf = std::min(
            spectralConfidenceCap,
            0.55 + (f.shelfConsistency - 0.8) + std::min(0.3, (f.shelfStepDB - 10) / 60) +
                (closedByWall ? 0.15 : 0));
        const std::string step = khz(*f.shelfHz);
        const std::string end = khz(f.shelfEndHz);
        const int share = percent(f.shelfConsistency);
        const int db = static_cast<int>(std::round(f.shelfStepDB));
        std::string text = "Steep step at ~" + step + " kHz in " + num(share) +
                           "% of the music (" + num(db) + " dB), then a flat shelf of content up to ~" +
                           end + " kHz";
        if (f.shelfTracking) {
            text += " that rises and falls with the music. High frequencies synthesized over a lossy "
                    "source (HE-AAC SBR, AI ";
        } else {
            text += ". High frequencies synthesized over a lossy source (HE-AAC SBR, AI ";
        }
        text += kLeftQuote;
        text += "enhancement";
        text += kRightQuote;
        text += ") look like this; so can an exciter or noise reduction used on a band-limited "
                "recording.";
        result.verdict = Verdict::BandwidthExtended;
        result.summary = text;
        result.confidence = conf;
        result.bandwidth = *f.shelfHz;
        return result;
    }

    if (wall) {
        const std::string cutoff = khz(wall->hz);
        const int share = percent(wall->consistency);
        const int drop = static_cast<int>(std::round(wall->drop));
        std::string text = "Steep cutoff at ~" + cutoff + " kHz in " + num(share) +
                           "% of the music (" + num(drop) +
                           " dB drop). MP3, AAC and Opus encodes look like this, but so do steep "
                           "mastering or anti-alias filters, FM broadcast sources and band-limited "
                           "historical masters.";
        if (f.shelfTracking && *f.shelfTracking < shelfTrackingThreshold && f.shelfHz &&
            std::fabs(*f.shelfHz - wall->hz) <= 1000 && f.shelfEndHz - *f.shelfHz >= 1500 &&
            f.shelfAboveFloorDB >= 10) {
            text += " Above it, steady noise-like content that doesn't follow the music, as analog "
                    "tape hiss or vinyl surface noise added after the cutoff would be.";
        } else if (encoderBand && follows && f.shelfHz && f.shelfEndHz - *f.shelfHz >= 1500 &&
                   f.shelfAboveFloorDB >= 10) {
            const std::string low = khz(*f.shelfHz), high = khz(f.shelfEndHz);
            text += " Between ~" + low + " and ~" + high +
                    " kHz, a narrow band of quieter content that follows the music, as a lossy "
                    "encoder's low-pass transition leaves.";
        }
        result.verdict = Verdict::PossibleLossyOrigin;
        result.summary = text;
        result.confidence = wallConfidence;
        result.bandwidth = wall->hz;
        return result;
    }

    // "22.05" 或 "24"：镜像所在的位置。
    auto nyquistText = [](double hz) {
        if (std::fabs(hz - 22050) < 1) return std::string("22.05");
        return rateText(hz);
    };
    const std::string fileRate = rateText(sampleRate);

    // 镜像（imaging）：在 44.1/48 kHz 源旧 Nyquist 之上，紧邻其下方的音乐出现的镜像，
    // 这是升采样器的滤波器太短时会留下的。
    if (hiRes && f.mirrorHz && f.mirrorCorrelation && *f.mirrorCorrelation >= mirrorThreshold &&
        f.mirrorFrames.value_or(0) >= mirrorMinimumFrames) {
        const double r = *f.mirrorCorrelation;
        const std::string source = rateText(2 * *f.mirrorHz);
        const std::string nyquist = nyquistText(*f.mirrorHz);
        char correlation[32];
        std::snprintf(correlation, sizeof(correlation), "%.2f", r);
        result.verdict = Verdict::Upsampled;
        result.summary = "Above " + nyquist +
                         " kHz, the spectrum mirrors the music just below it, moment by moment (r " +
                         correlation + " in " + num(f.mirrorFrames.value_or(0)) +
                         " frames): the image a sample-rate converter leaves behind. A " + source +
                         " kHz master upsampled to " + fileRate +
                         " kHz looks like this; so does a mix with parts recorded or processed at " +
                         source + " kHz.";
        result.confidence = std::min(spectralConfidenceCap, 0.6 + (r - mirrorThreshold) / 2);
        result.bandwidth = *f.mirrorHz;
        return result;
    }

    if (hiRes && f.cliffHz && *f.cliffHz >= 19600 && *f.cliffHz <= 24500 &&
        f.cliffDropDB >= 18 && f.cliffConsistency >= 0.9) {
        const std::string cutoff = khz(*f.cliffHz);
        const int share = percent(f.cliffConsistency);
        const int drop = static_cast<int>(std::round(f.cliffDropDB));
        const std::string limit = rateText(sampleRate / 2);
        const std::string cd = rateText(44100);
        result.verdict = Verdict::Upsampled;
        result.summary = "Steep cutoff at ~" + cutoff + " kHz in " + num(share) + "% of the music (" +
                         num(drop) + " dB drop), far below this " + fileRate + " kHz file's " +
                         limit + " kHz limit. A " + cd +
                         " or 48 kHz master (or a lossy file) upsampled to " + fileRate +
                         " kHz looks like this; so does a steep low-pass applied in mastering or in "
                         "a DSD-to-PCM conversion.";
        result.confidence = std::min(spectralConfidenceCap, 0.6 + (f.cliffDropDB - 18) / 40);
        result.bandwidth = *f.cliffHz;
        return result;
    }

    const double reach = f.contentHz;
    std::string note;
    if (effectiveBits && *effectiveBits > 0) {
        note = *effectiveBits >= claimedBits
                   ? std::string("No zero padding: all ") + num(claimedBits) + " bits are in use."
                   : bitsInUse(*effectiveBits, claimedBits);
    } else {
        note = claimedBits > 24
                   ? "Word length not checked (padding is only tested up to 24 bits)."
                   : "Word length not checked.";
    }
    note += " No codec-like cutoff, synthetic-looking shelf or upsampling wall found.";
    if (f.cliffHz && ownFilter(*f.cliffHz) && f.cliffDropDB >= 15) {
        note += " The steep cutoff at ~" + khz(*f.cliffHz) + " kHz is this " + fileRate +
                " kHz file's own anti-alias filter.";
    }
    if (hiRes && f.mirrorHz && f.mirrorCorrelation &&
        f.mirrorFrames.value_or(0) >= mirrorMinimumFrames && *f.mirrorCorrelation < mirrorThreshold) {
        note += " What's above " + nyquistText(*f.mirrorHz) +
                " kHz isn't a mirror image of the music below it, as an upsampler's would be.";
    }
    if (sampleRate >= 88200 && reach > 0 && reach < 26000) {
        note += " Little recorded above ~" + khz(reach) +
                " kHz, which is normal for analog-era masters.";
    }
    result.verdict = Verdict::Genuine;
    result.summary = note;
    result.confidence = effectiveBits && *effectiveBits > 0 ? 0.7 : 0.5;
    if (reach > 0) result.bandwidth = reach;
    return result;
}

std::string FileAnalyzer::rateText(double rate) {
    const double k = rate / 1000;
    if (std::fabs(std::round(k) - k) < 0.01) {
        return std::to_string(static_cast<long long>(std::round(k)));
    }
    char buffer[32];
    std::snprintf(buffer, sizeof(buffer), "%.1f", k);
    return buffer;
}

double FileAnalyzer::estimateBandwidth(const std::vector<double>& db, double binHz) {
    if (!(db.size() > 64) || !std::isfinite(binHz) || !(binHz > 0)) return 0;
    const int count = static_cast<int>(db.size());
    const int window = std::max(3, count / 256);
    std::vector<double> smoothed(static_cast<std::size_t>(count), -200.0);
    for (int i = 0; i < count; ++i) {
        const int lo = std::max(0, i - window), hi = std::min(count - 1, i + window);
        double sum = 0;
        for (int k = lo; k <= hi; ++k) sum += db[static_cast<std::size_t>(k)];
        smoothed[static_cast<std::size_t>(i)] = sum / static_cast<double>(hi - lo + 1);
    }
    std::vector<double> floorSlice(smoothed.begin() + (count - count / 40), smoothed.end());
    std::sort(floorSlice.begin(), floorSlice.end());
    const double floor = floorSlice[floorSlice.size() / 2];
    const double threshold = floor + 12;
    // 中频段的参考电平：遇到静音就退出。
    const int lo = std::min(count - 1, static_cast<int>(std::min(static_cast<double>(count - 1), 1000 / binHz)));
    const int hi = std::min(count, std::max(lo + 1,
                                            static_cast<int>(std::min(static_cast<double>(count),
                                                                      4000 / binHz)) + 1));
    double mid = -200;
    for (int i = lo; i < hi; ++i) mid = std::max(mid, smoothed[static_cast<std::size_t>(i)]);
    if (!(mid > -180)) return 0;
    if (!(mid > floor + 20)) return static_cast<double>(count) * binHz;
    for (int i = count - 1; i >= 1; --i) {
        if (smoothed[static_cast<std::size_t>(i)] > threshold) {
            return static_cast<double>(i) * binHz;
        }
    }
    return 0;
}

} // namespace vesper
