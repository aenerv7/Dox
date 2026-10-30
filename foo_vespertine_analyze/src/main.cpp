//
// foo_vespertine_analyze — 组件入口：菜单与生命周期。
//
// 把 Vespertine (https://github.com/szeremeta1/Vespertine) 的分析部分移植到 foobar2000：
// 它查找那些并非真的 hi-res 的 hi-res 文件 —— 补零的字长、有损来源、升频而来的素材、
// 合成出来的高频。
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
#include "app.h"
#include "report_window.h"
#include "scan.h"

namespace {

// 我们在上下文菜单和主菜单中的分组。
static const GUID guid_group = {0x5f2a1c3b, 0x8d47, 0x4e21, {0x9a, 0x63, 0x1d, 0x84, 0x2b, 0x77, 0xc0, 0x51}};
// 两个命令本身，以便把它们映射到键盘快捷键。
static const GUID guid_check = {0x1b6c9d54, 0x3f28, 0x4a17, {0x85, 0xd1, 0x6e, 0x02, 0xb9, 0x4c, 0x7a, 0x10}};
static const GUID guid_show = {0xc40e7a16, 0x2b93, 0x48de, {0x91, 0x5f, 0x38, 0xac, 0x66, 0xd2, 0x0b, 0x74}};

} // namespace

// ---------------------------------------------------------------------------------------------
// 上下文菜单（在曲目上右键）
// ---------------------------------------------------------------------------------------------
static contextmenu_group_popup_factory g_context_group(guid_group, contextmenu_groups::root,
                                                       "Vespertine", 0);

class vespertine_context_item : public contextmenu_item_simple {
public:
    enum { cmd_check = 0, cmd_show, cmd_total };

    GUID get_parent() override { return guid_group; }
    unsigned get_num_items() override { return cmd_total; }

    void get_item_name(unsigned index, pfc::string_base& out) override {
        switch (index) {
        case cmd_check: out = "Check for fake hi-res"; break;
        case cmd_show: out = "Show last report"; break;
        default: uBugCheck();
        }
    }

    void context_command(unsigned index, metadb_handle_list_cref data, const GUID&) override {
        switch (index) {
        case cmd_check: vesper::startScan(data); break;
        case cmd_show: vesper::showReportWindow(); break;
        default: uBugCheck();
        }
    }

    GUID get_item_guid(unsigned index) override {
        switch (index) {
        case cmd_check: return guid_check;
        case cmd_show: return guid_show;
        default: uBugCheck();
        }
    }

    bool get_item_description(unsigned index, pfc::string_base& out) override {
        switch (index) {
        case cmd_check:
            out = "Decodes the selected tracks and reports what they claim to be against what they "
                  "actually are: bit depth, bandwidth, lossy origin, upsampling.";
            return true;
        case cmd_show:
            out = "Brings back the report of the last check.";
            return true;
        default:
            uBugCheck();
        }
    }
};

static contextmenu_item_factory_t<vespertine_context_item> g_context_item;

// ---------------------------------------------------------------------------------------------
// 主菜单（View > Vespertine）
// ---------------------------------------------------------------------------------------------
static mainmenu_group_popup_factory g_main_menu_group(guid_group, mainmenu_groups::view, 0,
                                                      "Vespertine");

class vespertine_main_menu : public mainmenu_commands {
public:
    t_uint32 get_command_count() override { return 2; }

    GUID get_command(t_uint32 index) override { return index == 0 ? guid_check : guid_show; }

    void get_name(t_uint32 index, pfc::string_base& out) override {
        out = index == 0 ? "Check selected tracks for fake hi-res" : "Show last report";
    }

    bool get_description(t_uint32 index, pfc::string_base& out) override {
        out = index == 0 ? "Decodes the playing playlist's selection and reports fake hi-res."
                         : "Brings back the report of the last check.";
        return true;
    }

    GUID get_parent() override { return guid_group; }

    t_uint32 get_sort_priority() override { return sort_priority_base; }

    void execute(t_uint32 index, ctx_t) override {
        if (index == 0) {
            static_api_ptr_t<playlist_manager> playlists;
            metadb_handle_list items;
            playlists->activeplaylist_get_selected_items(items);
            vesper::startScan(items);
        } else {
            vesper::showReportWindow();
        }
    }
};

static mainmenu_commands_factory_t<vespertine_main_menu> g_main_menu;

// ---------------------------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------------------------
class vespertine_lifetime : public initquit {
public:
    void on_quit() override { vesper::destroyReportWindow(); }
};

static initquit_factory_t<vespertine_lifetime> g_lifetime;

DECLARE_COMPONENT_VERSION("Vespertine fake hi-res checker", "0.1.0",
                          "Looks for hi-res files that are not really hi-res.\n"
                          "A port of the analysis code from Vespertine by szeremeta1.\n"
                          "\n"
                          "Checks the word length actually in use, where the spectrum stops, "
                          "whether there is a codec-like cutoff, whether the high frequencies are "
                          "synthesized, and whether the top octave mirrors the music below it.\n"
                          "\n"
                          "GPL-3.0-or-later.\n"
                          "https://github.com/szeremeta1/Vespertine");

VALIDATE_COMPONENT_FILENAME("foo_vespertine_analyze.dll");
