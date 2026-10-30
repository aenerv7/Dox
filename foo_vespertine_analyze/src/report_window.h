//
// foo_vespertine_analyze — 报告窗口。
// SPDX-License-Identifier: GPL-3.0-or-later
//
#pragma once

#include "app.h"

namespace vesper {

//! 按需创建窗口，用 `lastReport()` 重新填充内容，并把它带到前台。
void showReportWindow();

//! 隐藏并销毁窗口，例如在组件被卸载时。
void destroyReportWindow();

} // namespace vesper
