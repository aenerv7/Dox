package com.dox.defaultapps;

import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import java.util.ArrayList;
import java.util.List;

public final class DefaultsRepository {

    private DefaultsRepository() {
    }

    public static List<DefaultsItem> load(Context context) {
        List<DefaultsItem> items = new ArrayList<>();
        RoleManager roleManager = context.getSystemService(RoleManager.class);

        addRole(items, roleManager, RoleManager.ROLE_BROWSER,
                "浏览器", "链接的默认打开方式", "\uD83C\uDF10",
                new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
                        .addCategory(Intent.CATEGORY_BROWSABLE));

        addRole(items, roleManager, RoleManager.ROLE_DIALER,
                "电话", "拨号与通话界面", "\uD83D\uDCDE",
                new Intent(Intent.ACTION_DIAL, Uri.parse("tel:10086")));

        addRole(items, roleManager, RoleManager.ROLE_SMS,
                "短信", "收发短信的默认应用", "\uD83D\uDCAC",
                new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:10086")));

        addRole(items, roleManager, RoleManager.ROLE_HOME,
                "主屏幕", "桌面启动器", "\uD83C\uDFE0",
                new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME));

        addRole(items, roleManager, RoleManager.ROLE_ASSISTANT,
                "数字助理", "长按 Home / 语音助手", "\u2728",
                new Intent(Intent.ACTION_ASSIST));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            addRole(items, roleManager, RoleManager.ROLE_NOTES,
                    "笔记", "系统默认笔记应用", "\uD83D\uDCDD",
                    new Intent(Intent.ACTION_CREATE_NOTE).setType("text/plain"));
        }

        items.add(new DefaultsItem("安装包", "点击 APK 时由谁接手安装", "\uD83D\uDCE6",
                DefaultsItem.KIND_INTENT, null,
                new Intent(Intent.ACTION_VIEW).setType("application/vnd.android.package-archive"), 0));

        items.add(new DefaultsItem("电子邮件", "mailto: 链接", "\u2709\uFE0F",
                DefaultsItem.KIND_INTENT, null,
                new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")), 0));

        items.add(new DefaultsItem("地图", "geo: 链接", "\uD83D\uDDFA\uFE0F",
                DefaultsItem.KIND_INTENT, null,
                new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0")), 0));

        items.add(new DefaultsItem("音乐", "audio/* 文件", "\uD83C\uDFB5",
                DefaultsItem.KIND_INTENT, null,
                new Intent(Intent.ACTION_VIEW).setType("audio/*"), 0));

        items.add(new DefaultsItem("视频", "video/* 文件", "\uD83C\uDFAC",
                DefaultsItem.KIND_INTENT, null,
                new Intent(Intent.ACTION_VIEW).setType("video/*"), 0));

        items.add(new DefaultsItem("PDF", "application/pdf 文件", "\uD83D\uDCC4",
                DefaultsItem.KIND_INTENT, null,
                new Intent(Intent.ACTION_VIEW).setType("application/pdf"), 0));

        items.add(new DefaultsItem("日历", "text/calendar 文件", "\uD83D\uDCC5",
                DefaultsItem.KIND_INTENT, null,
                new Intent(Intent.ACTION_VIEW).setType("text/calendar"), 0));

        items.add(new DefaultsItem("相机", "拍照请求", "\uD83D\uDCF7",
                DefaultsItem.KIND_INTENT, null,
                new Intent(MediaStore.ACTION_IMAGE_CAPTURE), 0));

        return items;
    }

    private static void addRole(List<DefaultsItem> items, RoleManager roleManager,
                                String role, String title, String subtitle, String emoji,
                                Intent intent) {
        if (roleManager == null) {
            return;
        }
        try {
            if (!roleManager.isRoleAvailable(role)) {
                return;
            }
        } catch (Throwable ignored) {
            return;
        }
        items.add(new DefaultsItem(title, subtitle, emoji, DefaultsItem.KIND_ROLE,
                role, intent, 0));
    }
}
