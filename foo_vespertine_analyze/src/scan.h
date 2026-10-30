//
// foo_vespertine_analyze — 解码并分析一组曲目。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#pragma once

#include "app.h"

namespace vesper {

//! 在非模态进度对话框中解码 `tracks`，然后填充并显示报告窗口。
//! 必须在主线程调用。`tracks` 为空时什么也不做。
void startScan(metadb_handle_list_cref tracks);

//! 最近一次扫描的各行，按扫描顺序排列。
std::vector<ReportRow>& lastReport();

} // namespace vesper
