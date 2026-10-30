//
// foo_vespertine_analyze — 文件对自己做出的声明。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "app.h"

namespace vesper {

std::wstring toWide(std::string const& text) {
    if (text.empty()) return std::wstring();
    const int size = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0);
    if (size <= 0) return std::wstring();
    std::wstring wide(static_cast<size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), &wide[0], size);
    return wide;
}

TrackClaim claimFor(metadb_handle_ptr const& track) {
    TrackClaim claim;
    if (!track.is_valid()) return claim;

    file_info_impl info;
    // False 表示“暂时没有可用信息”，而不是出错；此时仍有一个可以分析的路径。
    track->get_info_async(info);

    claim.codec = toUtf8(info.info_get("codec"));

    // 容器声明的字长，而不是解码器在转换之后给出的值。
    const t_int64 bits = info.info_get_int("bitspersample");
    if (bits > 0 && bits <= 64) claim.bits = static_cast<int>(bits);

    const t_int64 rate = info.info_get_int("samplerate");
    if (rate > 0 && static_cast<double>(rate) <= kMaxSampleRate) claim.sampleRate = static_cast<double>(rate);

    const t_int64 channels = info.info_get_int("channels");
    if (channels > 0 && channels <= 64) claim.channels = static_cast<int>(channels);

    return claim;
}

} // namespace vesper
