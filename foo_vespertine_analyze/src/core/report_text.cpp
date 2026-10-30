//
// foo_vespertine_analyze — 报告文本。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "report_text.h"

#include <cmath>
#include <cstdio>
#include <vector>

namespace vesper {

namespace {

std::string fmt(const char* format, double value) {
    char buffer[64];
    std::snprintf(buffer, sizeof(buffer), format, value);
    return buffer;
}

std::string num(int v) { return std::to_string(v); }

std::string rateText(double hz) { return FileAnalyzer::rateText(hz); }

std::string joined(const std::vector<std::string>& parts) {
    std::string out;
    for (const std::string& part : parts) {
        if (part.empty()) continue;
        if (!out.empty()) out += " / ";
        out += part;
    }
    return out;
}

//! 带宽的显示数字："44.1"、"96"。
std::string bandwidthKHz(double hz) { return rateText(hz); }

} // namespace

double sourceRateFor(double bandwidthHz) {
    static const double rates[] = {32000, 44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000};
    for (double rate : rates) {
        if (rate / 2 >= bandwidthHz - 1) return rate;
    }
    return 0;
}

std::string claimedText(const TrackClaim& claim) {
    std::vector<std::string> parts;
    // codec 与字长连写："FLAC 24-bit"，然后才是那些数字。
    std::string format = claim.codec;
    if (claim.bits) format += (format.empty() ? "" : " ") + num(*claim.bits) + "-bit";
    parts.push_back(format);
    if (claim.sampleRate > 0) parts.push_back(rateText(claim.sampleRate) + " kHz");
    if (claim.channels > 0) parts.push_back(num(claim.channels) + " ch");
    const std::string text = joined(parts);
    return text.empty() ? std::string("unknown") : text;
}

std::string actualText(const ReportRow& row) {
    const FileAnalysis& a = row.analysis;
    const std::string channels = row.claim.channels > 0 ? num(row.claim.channels) + " ch" : std::string();
    const std::string rate = row.claim.sampleRate > 0 ? rateText(row.claim.sampleRate) + " kHz" : std::string();

    switch (a.verdict) {
    case Verdict::Genuine:
        // 没问题：两列本来就该看起来一样。
        return claimedText(row.claim);

    case Verdict::PaddedBitDepth: {
        std::vector<std::string> parts;
        std::string format = row.claim.codec;
        if (a.effectiveBitDepth && *a.effectiveBitDepth > 0) {
            format += (format.empty() ? "" : " ") + num(*a.effectiveBitDepth) + "-bit";
        }
        parts.push_back(format);
        parts.push_back(rate);
        parts.push_back(channels);
        return joined(parts);
    }

    case Verdict::Upsampled: {
        std::vector<std::string> parts;
        const double source = a.bandwidthHz > 0 ? sourceRateFor(a.bandwidthHz) : 0;
        parts.push_back(source > 0 ? rateText(source) + " kHz master" : std::string("band-limited master"));
        if (a.bandwidthHz > 0) parts.push_back("content to " + bandwidthKHz(a.bandwidthHz) + " kHz");
        parts.push_back(channels);
        return joined(parts);
    }

    case Verdict::PossibleLossyOrigin: {
        std::vector<std::string> parts;
        if (a.bandwidthHz > 0) parts.push_back("~" + bandwidthKHz(a.bandwidthHz) + " kHz bandwidth");
        parts.push_back("lossy origin");
        parts.push_back(channels);
        return joined(parts);
    }

    case Verdict::BandwidthExtended: {
        std::vector<std::string> parts;
        if (a.bandwidthHz > 0) parts.push_back("HF from " + bandwidthKHz(a.bandwidthHz) + " kHz synthesized");
        parts.push_back(row.claim.bits ? num(*row.claim.bits) + "-bit" : std::string());
        parts.push_back(channels);
        return joined(parts);
    }

    case Verdict::NotApplicable:
        break;
    }
    return "unknown";
}

std::string detailText(const ReportRow& row) {
    const FileAnalysis& a = row.analysis;
    std::string text = verdictTitle(a.verdict);
    if (a.confidence > 0) text += "  (confidence " + num(static_cast<int>(std::lround(a.confidence * 100))) + "%)";
    text += "\n\n";
    text += a.summary;

    std::string numbers = "\n\n";
    numbers += "Analyzed " + fmt("%.1f", a.secondsAnalyzed) + " s, peak " +
               (std::isfinite(a.peakDBFS) ? fmt("%.1f", a.peakDBFS) + " dBFS" : std::string("silent"));
    if (a.clippedSamples > 0) numbers += ", " + num(a.clippedSamples) + " clipped samples";
    if (a.claimedBitDepth) {
        numbers += "\nWord length: " + num(*a.claimedBitDepth) + " bits in the container";
        if (a.effectiveBitDepth && *a.effectiveBitDepth > 0) {
            numbers += ", " + num(*a.effectiveBitDepth) + " in use";
        }
    }
    if (a.sampleRate > 0) {
        numbers += "\nSample rate: " + rateText(a.sampleRate) + " kHz (limit " +
                   rateText(a.sampleRate / 2) + " kHz)";
        if (a.bandwidthHz > 0) {
            numbers += ", content reaches " + fmt("%.1f", a.bandwidthHz / 1000) + " kHz";
        }
    }
    if (a.forensics) {
        const SpectralForensics& f = *a.forensics;
        numbers += "\nMeasured over " + num(f.framesAnalyzed) + " frames";
        if (f.floorDB > -159) numbers += ", noise floor " + fmt("%.1f", f.floorDB) + " dB";
        if (f.cliffHz) {
            numbers += "\nCutoff " + fmt("%.1f", *f.cliffHz / 1000) + " kHz, " +
                       fmt("%.0f", f.cliffDropDB) + " dB drop in " +
                       num(static_cast<int>(std::lround(f.cliffConsistency * 100))) + "% of frames";
        }
        if (f.shelfHz) {
            numbers += "\nStep " + fmt("%.1f", *f.shelfHz / 1000) + " kHz, " +
                       fmt("%.0f", f.shelfStepDB) + " dB, content up to " +
                       fmt("%.1f", f.shelfEndHz / 1000) + " kHz";
            if (f.shelfTracking) {
                numbers += ", follows the music at r " + fmt("%.2f", *f.shelfTracking);
            }
        }
        if (f.mirrorHz && f.mirrorCorrelation) {
            numbers += "\nMirror image above " + fmt("%.2f", *f.mirrorHz / 1000) + " kHz, r " +
                       fmt("%.2f", *f.mirrorCorrelation) + " in " +
                       num(f.mirrorFrames.value_or(0)) + " frames";
        }
    }
    return text + numbers;
}

} // namespace vesper
