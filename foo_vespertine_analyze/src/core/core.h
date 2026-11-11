//
// foo_vespertine_analyze — 假 Hi-Res 检测核心。
//
// Vespertine 分析包（Packages/VespertineAnalysis/Sources/VespertineAnalysisCore,
// GPL-3.0-or-later）的忠实 C++17 移植：
//
//   Spectrum.swift          -> SpectrumAnalyzer, PortableFFT
//   SpectralForensics.swift -> SpectralForensics, ForensicsAccumulator
//   FileAnalysis.swift      -> FileAnalysis, AnalysisAccumulator, FileAnalyzer
//
// 本移植保留原有的算术（float 采样通路、double 统计量）、原有的迭代顺序
// 和原有的措辞，因此给定同一份 PCM，这里的结果与 Swift 分析器一致。
// 本头文件对 Windows 或 foobar2000 一无所知：它是纯 C++17，可在任何平台上
// 编译与测试。
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace vesper {

// ---------------------------------------------------------------- FFT / 频谱

//! 实数块的迭代式 radix-2 复数 FFT（double 精度）。幅值按 Accelerate 实数 FFT
//! 的报告方式打包：bin k 为 2*|X[k]|，bin 0 同时承载 DC 与 Nyquist
//! 两个分量。
struct PortableFFT {
    explicit PortableFFT(int size);

    //! `input` 保存 `size()` 个采样；返回 `size()/2` 个幅值。
    std::vector<float> packedMagnitudes(const float* input) const;

    int size() const { return size_; }

private:
    int size_ = 0;
    int bits_ = 0;
    std::vector<double> cosTable_;
    std::vector<double> sinTable_;
    std::vector<int> reversed_;
};

//! 单声道块的 2 的幂幅值谱，归一化到满幅正弦约为 0 dBFS。
class SpectrumAnalyzer {
public:
    explicit SpectrumAnalyzer(int size = 4096);

    int size() const { return size_; }

    //! 由 `samples` 尾部（`count` 个值）算出 `size()/2` 个 bin 各自的 dBFS。
    std::vector<float> magnitudes(const float* samples, std::size_t count) const;

private:
    int size_ = 0;
    std::vector<float> window_;
    PortableFFT fft_;
};

// ---------------------------------------------------------------- 频谱取证

struct SpectralForensics {
    std::optional<double> cliffHz;
    double cliffDropDB = 0;
    double cliffConsistency = 0;
    double belowDB = -160;
    double aboveDB = -160;
    double floorDB = -160;
    double extensionHz = 0;
    double extensionSlope = 0;
    double holeRatio = 0;
    double contentHz = 0;
    int framesAnalyzed = 0;
    std::optional<double> shelfHz;
    double shelfStepDB = 0;
    double shelfEndHz = 0;
    double shelfSlope = 0;
    double shelfAboveFloorDB = 0;
    double shelfConsistency = 0;
    std::optional<double> shelfTracking;
    std::optional<double> mirrorHz;
    std::optional<double> mirrorCorrelation;
    std::optional<int> mirrorFrames;
};

//! 一边解码文件一边累积逐帧频谱，解完再对其做测量。
class ForensicsAccumulator {
public:
    explicit ForensicsAccumulator(double sampleRate);

    int fftSize() const { return fftSize_; }

    //! 加入一帧的单声道采样（超过 `fftSize()` 时只取尾部）。
    void add(const float* mono, std::size_t count);

    SpectralForensics result() const;

private:
    struct MirrorSpan {
        float correlation; // 未测量时为 NaN（第一帧）
        float belowDB;
        float aboveDB;
    };

    std::vector<MirrorSpan> measureMirror(const std::vector<float>& db);
    static double pearson(const std::vector<double>& xs, const std::vector<double>& ys);

    double sampleRate_ = 0;
    int fftSize_ = 0;
    const double bandHz_ = 100;
    int bandCount_ = 0;
    SpectrumAnalyzer analyzer_;
    std::vector<std::vector<float>> frames_;
    std::vector<std::vector<float>> holes_;
    double binHz_ = 0;
    std::vector<std::vector<MirrorSpan>> mirror_;
    std::vector<std::vector<double>> mirrorPrevious_;
    static constexpr int mirrorSmoothing_ = 8;
};

// ---------------------------------------------------------------- 文件分析

enum class Verdict {
    Genuine,             // 未发现可疑之处
    PaddedBitDepth,      // 例如 24-bit 容器里装 16-bit 内容
    Upsampled,           // 带宽远低于 Nyquist
    PossibleLossyOrigin,
    BandwidthExtended,   // 在有损截止之上合成了高频
    NotApplicable,       // 有损 / DSD 源，或无可判断之处
};

//! 标签用的短稳定键："genuine"、"padded"、"upsampled"、"lossy-origin"、
//! "extended"、"n/a"。
const char* verdictKey(Verdict v);
//! 供人阅读的判定文本，用于列表与详情面板。
const char* verdictTitle(Verdict v);

struct FileAnalysis {
    std::optional<int> claimedBitDepth;
    std::optional<int> effectiveBitDepth;
    double sampleRate = 0;
    double bandwidthHz = 0;
    double peakDBFS = 0;
    int clippedSamples = 0;
    Verdict verdict = Verdict::NotApplicable;
    std::string summary;
    std::vector<float> spectrum;
    double secondsAnalyzed = 0;
    std::optional<SpectralForensics> forensics;
    int version = 1;
    double confidence = 0;
};

//! 解出的某个采样是 NaN 或无穷大（解码器或文件损坏）。
struct AnalysisError : std::runtime_error {
    explicit AnalysisError(const char* what) : std::runtime_error(what) {}
};

//! 以任意大小的块把解码音频喂给各项测量。结果不取决于解码器如何分块：每四分之一秒
//! 音频取一次频谱。
class AnalysisAccumulator {
public:
    //! `claimedBitDepth` 是容器的字长（24-bit FLAC 为 24，float 为 32）。
    AnalysisAccumulator(double sampleRate, int channels, std::optional<int> claimedBitDepth,
                        double maxSeconds = 600);

    //! 在已加入的音频不足 `maxSeconds` 时为 true。
    bool wantsMore() const { return framesDone_ < limit_; }

    double framesDone() const { return framesDone_; }

    //! 加入 `frames` 帧交织采样（满幅 +-1）；出错时抛 AnalysisError。
    void addInterleaved(const float* samples, int frames);

    //! 测量目前加入的全部内容并给出判定。
    FileAnalysis finish();

private:
    double sampleRate_ = 0;
    int channels_ = 1;
    std::optional<int> claimedBitDepth_;
    int claimed_ = 24;
    double scale_ = 0;
    float clipLevel_ = 0;
    double limit_ = 0;

    SpectrumAnalyzer analyzer_;
    std::vector<double> spectrumSum_;
    int spectrumFrames_ = 0;
    ForensicsAccumulator forensics_;
    int historyLimit_ = 0;
    std::vector<float> history_;
    int fftStride_ = 1;
    int framesSinceFFT_ = 0;

    int32_t orBits_ = 0;
    float peak_ = 0;
    int clipped_ = 0;
    double framesDone_ = 0;
};

class FileAnalyzer {
public:
    //! 分析学到新东西时递增，以便刷新旧结果。
    static constexpr int currentVersion = 4;
    //! 频谱类判定的置信度上限。
    static constexpr double spectralConfidenceCap = 0.75;
    //! 只有当 shelf 的电平与音乐贴合到这个程度时，才算它是生成的。
    static constexpr double shelfTrackingThreshold = 0.5;
    //! 旧 Nyquist 以上的内容，相关性高于此值才算作升采样器的镜像。
    static constexpr double mirrorThreshold = 0.5;
    static constexpr int mirrorMinimumFrames = 8;

    struct Judgement {
        Verdict verdict = Verdict::NotApplicable;
        std::string summary;
        double confidence = 0;
        std::optional<double> bandwidth;
    };

    static FileAnalysis notApplicable(std::optional<int> claimedBitDepth, double sampleRate,
                                      const std::string& summary);

    static FileAnalysis conclude(const SpectralForensics& measured,
                                 std::optional<int> claimedBitDepth,
                                 std::optional<int> effectiveBitDepth, double sampleRate,
                                 double peakDBFS, int clippedSamples, double bandwidth,
                                 const std::vector<float>& spectrum, double secondsAnalyzed);

    static Judgement judge(const SpectralForensics& f, int claimedBits,
                           std::optional<int> effectiveBits, double sampleRate);

    //! 速率文本："44.1"、"48"、"192"、"352.8"
    static std::string rateText(double rate);

    //! 平滑后电平明显高于顶部频带本底噪声的最高频率。
    static double estimateBandwidth(const std::vector<double>& db, double binHz);
};

} // namespace vesper
