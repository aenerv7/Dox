package com.dox.defaultapps;

import android.content.Intent;

public class DefaultsItem {

    public static final int KIND_ROLE = 0;
    public static final int KIND_INTENT = 1;

    public final String title;
    public final String subtitle;
    public final String emoji;
    public final int kind;
    public final String role;
    public final Intent intent;
    public final int minSdk;

    public DefaultsItem(String title, String subtitle, String emoji, int kind,
                        String role, Intent intent, int minSdk) {
        this.title = title;
        this.subtitle = subtitle;
        this.emoji = emoji;
        this.kind = kind;
        this.role = role;
        this.intent = intent;
        this.minSdk = minSdk;
    }

    public boolean isRole() {
        return kind == KIND_ROLE;
    }
}
