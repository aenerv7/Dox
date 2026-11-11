//
// foo_vespertine_analyze — 解码并分析一组曲目。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "scan.h"

#include "report_window.h"

#include <exception>
#include <optional>

namespace vesper {

namespace {

std::vector<ReportRow> g_rows;

//! 报告中显示的绝对路径。对于媒体库基准目录下的曲目，fb2k 给出的是相对路径；
//! g_get_display_path() 会像播放列表那样把它们展开。
std::string displayPath(metadb_handle_ptr const& track) {
    pfc::string8 expanded;
    try {
        filesystem::g_get_display_path(track->get_path(), expanded);
        return toUtf8(expanded);
    } catch (const pfc::exception&) {
        return toUtf8(track->get_path());
    }
}

//! 为完全无法分析的曲目生成一行。
ReportRow failureRow(std::string path, TrackClaim claim, std::string message) {
    ReportRow row;
    row.path = std::move(path);
    row.claim = std::move(claim);
    row.analysis = FileAnalyzer::notApplicable(row.claim.bits, row.claim.sampleRate, std::move(message));
    return row;
}

//! 把解码得到的 chunk 转换成核心验证时所用的 float 采样。
//! 在 64 位 foobar2000 中 `audio_sample` 是 double；不超过 24 位的整数格式以及所有 float32 格式
//! 都能无损转换为 float，这正是 Vespertine 所分析的内容。
void toFloat(const audio_chunk& chunk, std::vector<float>& buffer) {
    const audio_sample* data = chunk.get_data();
    const size_t count = chunk.get_sample_count() * chunk.get_channels();
    buffer.resize(count);
    for (size_t i = 0; i < count; ++i) buffer[i] = static_cast<float>(data[i]);
}

class analyze_process : public threaded_process_callback {
public:
    explicit analyze_process(metadb_handle_list_cref tracks) {
        for (t_size i = 0; i < tracks.get_count(); ++i) m_tracks.add_item(tracks[i]);
    }

    void run(threaded_process_status& status, abort_callback& abort) override {
        const t_size count = m_tracks.get_count();
        m_rows.reserve(count);
        for (t_size i = 0; i < count; ++i) {
            abort.check();
            status.set_progress(i, count);
            status.set_item_path(m_tracks[i]->get_path());
            m_rows.push_back(analyzeOne(m_tracks[i], status, abort));
        }
        status.set_progress(count, count);
    }

    void on_done(ctx_t, bool was_aborted) override {
        if (was_aborted) return; // 继续显示上一次扫描得到的结果
        g_rows = std::move(m_rows);
        showReportWindow();
    }

private:
    ReportRow analyzeOne(metadb_handle_ptr const& track, threaded_process_status& status,
                         abort_callback& abort) {
        const std::string path = displayPath(track);
        const TrackClaim claim = claimFor(track);
        try {
            return analyzeFile(track, path, claim, status, abort);
        } catch (exception_aborted const&) {
            throw;
        } catch (std::exception const& e) {
            return failureRow(path, claim, std::string("Could not analyze this file: ") + e.what());
        }
    }

    ReportRow analyzeFile(metadb_handle_ptr const& track, std::string const& path,
                          TrackClaim const& claim, threaded_process_status& status,
                          abort_callback& abort) {
        service_ptr_t<input_decoder> decoder;
        // 报告里显示的是展开后的路径；而解码器需要的是 fb2k 认识该曲目所用的那个路径。
        input_entry::g_open_for_decoding(decoder, nullptr, track->get_path(), abort);
        // 不开启后处理器：要测量的必须是文件本身的内容，而不是 HDCD 解码器这类
        // DSP 处理之后的结果。
        decoder->initialize(track->get_subsong_index(), input_flag_simpledecode | input_flag_no_postproc,
                            abort);

        std::optional<AnalysisAccumulator> accumulator;
        std::vector<float> samples;
        audio_chunk_impl_temporary chunk;
        unsigned decodedChannels = 0;

        while (decoder->run(chunk, abort)) {
            abort.check();
            status.poll_pause();
            if (chunk.is_empty()) continue;

            const unsigned rate = chunk.get_srate();
            const unsigned channels = chunk.get_channels();
            if (channels == 0 || rate == 0) continue;

            if (!accumulator) {
                if (static_cast<double>(rate) > kMaxSampleRate) {
                    return failureRow(path, claim,
                                      "Sample rate is beyond what this analysis is meant for.");
                }
                accumulator.emplace(static_cast<double>(rate), static_cast<int>(channels), claim.bits,
                                    kMaxSeconds);
                decodedChannels = channels;
            }

            toFloat(chunk, samples);
            accumulator->addInterleaved(samples.data(), static_cast<int>(chunk.get_sample_count()));

            status.set_progress_secondary(static_cast<size_t>(accumulator->framesDone()),
                                          static_cast<size_t>(kMaxSeconds * rate));
            if (!accumulator->wantsMore()) break;
        }

        ReportRow row;
        row.path = path;
        row.claim = claim;
        if (!accumulator) {
            row.analysis = FileAnalyzer::notApplicable(claim.bits, claim.sampleRate,
                                                      "The decoder returned no audio for this file.");
            return row;
        }
        row.analysis = accumulator->finish();
        // 补上容器没有告诉我们的信息，好让两列都能显示。
        if (row.claim.sampleRate <= 0) row.claim.sampleRate = row.analysis.sampleRate;
        if (row.claim.channels <= 0) row.claim.channels = decodedChannels != 0 ? static_cast<int>(decodedChannels) : 1;
        return row;
    }

    metadb_handle_list_t<pfc::alloc_fast_aggressive> m_tracks;
    std::vector<ReportRow> m_rows;
};

} // namespace

std::vector<ReportRow>& lastReport() { return g_rows; }

void startScan(metadb_handle_list_cref tracks) {
    if (tracks.get_count() == 0) {
        popup_message::g_show("Select the tracks you want to check first.", "Vespertine");
        return;
    }
    auto process = fb2k::service_new<analyze_process>(tracks);
    static_api_ptr_t<threaded_process>()->run_modeless(
        process,
        threaded_process::flag_show_progress_dual | threaded_process::flag_show_item | threaded_process::flag_show_abort,
        core_api::get_main_window(), "Vespertine: checking for fake Hi-Res");
}

} // namespace vesper
