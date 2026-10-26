package com.dox.defaultapps;

import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Configuration;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.AppCompatRadioButton;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.google.android.material.color.MaterialColors;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.progressindicator.CircularProgressIndicator;
import com.google.android.material.snackbar.Snackbar;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;
import com.google.android.material.textview.MaterialTextView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import rikka.shizuku.Shizuku;

public class MainActivity extends AppCompatActivity {

    private static final int REQUEST_SHIZUKU = 1001;

    private LinearLayout content;
    private ScrollView scroll;

    private volatile IDefaultsService service;
    private volatile boolean binding;
    private volatile boolean bindFailed;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final List<DefaultsItem> items = new ArrayList<>();

    private final Shizuku.OnBinderReceivedListener binderReceivedListener =
            () -> main.post(this::refresh);
    private final Shizuku.OnBinderDeadListener binderDeadListener =
            () -> main.post(() -> {
                service = null;
                binding = false;
                refresh();
            });
    private final Shizuku.OnRequestPermissionResultListener permissionResultListener =
            (requestCode, grantResult) -> main.post(this::refresh);

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            service = IDefaultsService.Stub.asInterface(binder);
            binding = false;
            bindFailed = false;
            main.post(MainActivity.this::refresh);
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            service = null;
            binding = false;
            bindFailed = true;
            main.post(MainActivity.this::refresh);
        }
    };

    private final Shizuku.UserServiceArgs userServiceArgs =
            new Shizuku.UserServiceArgs(new ComponentName(
                    BuildConfig.APPLICATION_ID, DefaultsUserService.class.getName()))
                    .daemon(false)
                    .processNameSuffix("defaults")
                    .debuggable(BuildConfig.DEBUG)
                    .version(1);

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        MaterialToolbar toolbar = findViewById(R.id.toolbar);
        toolbar.setTitle(R.string.app_name);
        toolbar.setSubtitle(R.string.toolbar_subtitle);
        content = findViewById(R.id.content);
        scroll = findViewById(R.id.scroll);

        applySystemBarAppearance();

        try {
            Shizuku.addBinderReceivedListenerSticky(binderReceivedListener);
            Shizuku.addBinderDeadListener(binderDeadListener);
            Shizuku.addRequestPermissionResultListener(permissionResultListener);
        } catch (Throwable ignored) {
        }

        refresh();
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarAppearance() {
        boolean night = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        Window window = getWindow();
        window.setStatusBarColor(MaterialColors.getColor(content,
                com.google.android.material.R.attr.colorSurface));

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!night);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            Shizuku.removeBinderReceivedListener(binderReceivedListener);
            Shizuku.removeBinderDeadListener(binderDeadListener);
            Shizuku.removeRequestPermissionResultListener(permissionResultListener);
        } catch (Throwable ignored) {
        }
        if (!isChangingConfigurations()) {
            IDefaultsService current = service;
            if (current != null) {
                try {
                    current.destroy();
                } catch (Throwable ignored) {
                }
            }
        }
        try {
            Shizuku.unbindUserService(userServiceArgs, connection, true);
        } catch (Throwable ignored) {
        }
        io.shutdownNow();
    }

    private void refresh() {
        if (isFinishing() || isDestroyed() || content == null) {
            return;
        }
        int scrollY = scroll.getScrollY();

        content.removeAllViews();
        items.clear();
        items.addAll(DefaultsRepository.load(this));

        addStatusCard();
        addSection("系统默认应用", findItems(true));
        addSection("文件与链接", findItems(false));
        addFooter();

        content.post(() -> scroll.scrollTo(0, scrollY));
    }

    private List<DefaultsItem> findItems(boolean role) {
        List<DefaultsItem> out = new ArrayList<>();
        for (DefaultsItem item : items) {
            if (item.isRole() == role) {
                out.add(item);
            }
        }
        return out;
    }

    private boolean shizukuAlive() {
        try {
            return Shizuku.pingBinder();
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean permissionGranted() {
        try {
            return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private void ensureBound() {
        if (service != null || binding || bindFailed
                || !shizukuAlive() || !permissionGranted()) {
            return;
        }
        binding = true;
        try {
            Shizuku.bindUserService(userServiceArgs, connection);
            main.postDelayed(() -> {
                if (service == null && binding) {
                    binding = false;
                    bindFailed = true;
                    refresh();
                }
            }, 6000);
        } catch (Throwable t) {
            binding = false;
            bindFailed = true;
        }
    }

    private void addStatusCard() {
        boolean alive = shizukuAlive();
        boolean permitted = alive && permissionGranted();
        int uid = -1;
        if (permitted) {
            try {
                uid = Shizuku.getUid();
            } catch (Throwable ignored) {
            }
        }

        String title;
        String desc;
        String action = null;
        Runnable onAction = null;
        int dotColor;

        if (!alive) {
            title = "未连接 Shizuku";
            desc = "普通应用无权修改默认应用。安装并启动 Shizuku 后，本应用会以 shell 身份写入系统设置。";
            dotColor = color(com.google.android.material.R.attr.colorError);
            action = "打开 Shizuku";
            onAction = this::openShizuku;
        } else if (!permitted) {
            title = "等待授权";
            desc = "Shizuku 已运行。授予本应用权限后才能修改默认项。";
            dotColor = color(com.google.android.material.R.attr.colorTertiary);
            action = "授予权限";
            onAction = () -> {
                try {
                    Shizuku.requestPermission(REQUEST_SHIZUKU);
                } catch (Throwable ignored) {
                }
            };
        } else if (service == null && bindFailed) {
            title = "特权服务连接失败";
            desc = "Shizuku 已授权，但 shell 服务没有启动。确认 Shizuku 正在运行后重试。";
            dotColor = color(com.google.android.material.R.attr.colorError);
            action = "重试";
            onAction = () -> {
                bindFailed = false;
                binding = false;
                refresh();
            };
        } else if (service == null) {
            title = "正在连接特权服务…";
            desc = "Shizuku 已授权，正在启动 shell 服务。";
            dotColor = color(com.google.android.material.R.attr.colorPrimary);
            ensureBound();
        } else {
            title = "已连接";
            desc = "当前特权：" + (uid == 0 ? "root" : "shell") + "。以下默认项可直接修改。";
            dotColor = color(com.google.android.material.R.attr.colorPrimary);
            action = "刷新";
            onAction = this::refresh;
        }

        MaterialCardView card = newCard();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(16), dp(20), dp(16));
        card.addView(box, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);

        View dot = new View(this);
        GradientDrawable dotBg = new GradientDrawable();
        dotBg.setShape(GradientDrawable.OVAL);
        dotBg.setColor(dotColor);
        dot.setBackground(dotBg);
        LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(dp(10), dp(10));
        dotLp.setMarginEnd(dp(10));
        head.addView(dot, dotLp);

        MaterialTextView titleView = text(title,
                com.google.android.material.R.style.TextAppearance_Material3_TitleMedium,
                com.google.android.material.R.attr.colorOnSurface);
        head.addView(titleView);

        if (service == null && alive && permitted) {
            CircularProgressIndicator progress = new CircularProgressIndicator(this);
            progress.setIndeterminate(true);
            LinearLayout.LayoutParams progressLp = new LinearLayout.LayoutParams(dp(20), dp(20));
            progressLp.setMarginStart(dp(12));
            head.addView(progress, progressLp);
        }

        box.addView(head);

        MaterialTextView descView = text(desc,
                com.google.android.material.R.style.TextAppearance_Material3_BodyMedium,
                com.google.android.material.R.attr.colorOnSurfaceVariant);
        LinearLayout.LayoutParams descLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        descLp.topMargin = dp(8);
        box.addView(descView, descLp);

        final String buttonLabel = action;
        final Runnable buttonAction = onAction;
        if (buttonLabel != null && buttonAction != null) {
            MaterialButton button = new MaterialButton(this, null,
                    com.google.android.material.R.attr.materialButtonOutlinedStyle);
            button.setText(buttonLabel);
            button.setOnClickListener(v -> buttonAction.run());
            LinearLayout.LayoutParams buttonLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            buttonLp.topMargin = dp(12);
            box.addView(button, buttonLp);
        }

        content.addView(card);
    }

    private void openShizuku() {
        Intent launch = getPackageManager().getLaunchIntentForPackage("moe.shizuku.privileged.api");
        if (launch != null) {
            try {
                startActivity(launch);
                return;
            } catch (Throwable ignored) {
            }
        }
        openUrl("https://shizuku.rikka.app/download/");
    }

    private void openUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Throwable t) {
            snack("没有可打开链接的应用");
        }
    }

    private void addSection(String title, List<DefaultsItem> sectionItems) {
        if (sectionItems.isEmpty()) {
            return;
        }

        MaterialTextView header = text(title,
                com.google.android.material.R.style.TextAppearance_Material3_TitleSmall,
                com.google.android.material.R.attr.colorPrimary);
        header.setPadding(dp(4), dp(24), dp(4), dp(8));
        content.addView(header);

        MaterialCardView card = newCard();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        card.addView(box, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        for (int i = 0; i < sectionItems.size(); i++) {
            if (i > 0) {
                box.addView(divider());
            }
            box.addView(createRow(sectionItems.get(i)));
        }
        content.addView(card);
    }

    private MaterialCardView newCard() {
        MaterialCardView card = new MaterialCardView(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        card.setLayoutParams(lp);
        card.setCardElevation(0);
        card.setRadius(dp(24));
        card.setStrokeWidth(dp(1));
        card.setCardBackgroundColor(color(
                com.google.android.material.R.attr.colorSurfaceContainerLow));
        card.setStrokeColor(color(com.google.android.material.R.attr.colorOutlineVariant));
        return card;
    }

    private View divider() {
        View divider = new View(this);
        divider.setBackgroundColor(color(
                com.google.android.material.R.attr.colorOutlineVariant));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(1));
        lp.setMarginStart(dp(72));
        divider.setLayoutParams(lp);
        return divider;
    }

    private View createRow(DefaultsItem item) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(14), dp(16), dp(14));
        row.setClickable(true);

        TypedValue background = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, background, true);
        row.setBackgroundResource(background.resourceId);

        row.addView(createIcon(item), new LinearLayout.LayoutParams(dp(40), dp(40)));

        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams labelsLp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        labelsLp.setMarginStart(dp(16));
        row.addView(labels, labelsLp);

        MaterialTextView title = text(item.title,
                com.google.android.material.R.style.TextAppearance_Material3_TitleMedium,
                com.google.android.material.R.attr.colorOnSurface);
        labels.addView(title);

        MaterialTextView summary = text(summary(item),
                com.google.android.material.R.style.TextAppearance_Material3_BodyMedium,
                com.google.android.material.R.attr.colorOnSurfaceVariant);
        summary.setMaxLines(1);
        summary.setEllipsize(TextUtils.TruncateAt.END);
        labels.addView(summary);

        MaterialTextView chevron = text("\u203A",
                com.google.android.material.R.style.TextAppearance_Material3_TitleLarge,
                com.google.android.material.R.attr.colorOnSurfaceVariant);
        chevron.setGravity(Gravity.CENTER);
        row.addView(chevron);

        row.setOnClickListener(v -> openPicker(item));
        return row;
    }

    private View createIcon(DefaultsItem item) {
        ResolveInfo resolved = resolve(item.intent);
        if (resolved != null && !isResolver(componentOf(resolved))) {
            ImageView icon = new ImageView(this);
            try {
                icon.setImageDrawable(resolved.loadIcon(getPackageManager()));
            } catch (Throwable ignored) {
            }
            icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
            return icon;
        }

        LinearLayout circle = new LinearLayout(this);
        circle.setGravity(Gravity.CENTER);
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(color(
                com.google.android.material.R.attr.colorSecondaryContainer));
        circle.setBackground(background);

        TextView emoji = new TextView(this);
        emoji.setText(item.emoji);
        emoji.setTextSize(20);
        circle.addView(emoji);
        return circle;
    }

    private String summary(DefaultsItem item) {
        ResolveInfo resolved = resolve(item.intent);
        if (resolved == null) {
            return "未设置";
        }
        if (isResolver(componentOf(resolved))) {
            return "每次询问";
        }
        try {
            return "当前：" + resolved.loadLabel(getPackageManager());
        } catch (Throwable t) {
            return "当前：" + resolved.activityInfo.packageName;
        }
    }

    @Nullable
    private ResolveInfo resolve(Intent intent) {
        try {
            return getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
        } catch (Throwable t) {
            return null;
        }
    }

    private ComponentName componentOf(ResolveInfo info) {
        return new ComponentName(info.activityInfo.packageName, info.activityInfo.name);
    }

    private boolean isResolver(ComponentName component) {
        String pkg = component.getPackageName();
        String cls = component.getClassName();
        return pkg.contains("intentresolver")
                || cls.contains("ChooserActivity")
                || cls.contains("ResolverActivity");
    }

    private void openPicker(DefaultsItem item) {
        if (service == null) {
            ensureBound();
            snack("先连接 Shizuku");
            return;
        }
        io.execute(() -> {
            List<AppEntry> apps = loadApps(item.intent);
            main.post(() -> {
                if (apps.isEmpty()) {
                    snack("没有找到可处理该类型的应用");
                } else {
                    showPickerSheet(item, apps);
                }
            });
        });
    }

    private List<AppEntry> loadApps(Intent prototype) {
        Intent intent = new Intent(prototype);
        List<AppEntry> apps = new ArrayList<>();
        try {
            List<ResolveInfo> resolved = getPackageManager().queryIntentActivities(
                    intent, PackageManager.MATCH_DEFAULT_ONLY);
            Map<String, AppEntry> byPackage = new LinkedHashMap<>();
            for (ResolveInfo info : resolved) {
                ActivityInfo activity = info.activityInfo;
                if (activity == null || !activity.exported) {
                    continue;
                }
                if (getPackageName().equals(activity.packageName)) {
                    continue;
                }
                if (byPackage.containsKey(activity.packageName)) {
                    continue;
                }
                CharSequence label;
                try {
                    label = activity.loadLabel(getPackageManager());
                } catch (Throwable t) {
                    label = activity.packageName;
                }
                Drawable icon = null;
                try {
                    icon = activity.loadIcon(getPackageManager());
                } catch (Throwable ignored) {
                }
                byPackage.put(activity.packageName,
                        new AppEntry(activity.packageName, activity.name, label, icon));
            }
            apps.addAll(byPackage.values());
            apps.sort((left, right) -> String.CASE_INSENSITIVE_ORDER.compare(
                    left.label.toString(), right.label.toString()));
        } catch (Throwable ignored) {
        }
        return apps;
    }

    private void showPickerSheet(DefaultsItem item, List<AppEntry> apps) {
        BottomSheetDialog sheet = new BottomSheetDialog(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(8), dp(24), dp(24));

        View handle = new View(this);
        GradientDrawable handleBg = new GradientDrawable();
        handleBg.setCornerRadius(dp(2));
        handleBg.setColor(color(com.google.android.material.R.attr.colorOutlineVariant));
        handle.setBackground(handleBg);
        LinearLayout.LayoutParams handleLp = new LinearLayout.LayoutParams(dp(32), dp(4));
        handleLp.gravity = Gravity.CENTER_HORIZONTAL;
        handleLp.bottomMargin = dp(16);
        root.addView(handle, handleLp);

        MaterialTextView title = text(item.title,
                com.google.android.material.R.style.TextAppearance_Material3_HeadlineSmall,
                com.google.android.material.R.attr.colorOnSurface);
        root.addView(title);

        MaterialTextView subtitle = text(item.subtitle,
                com.google.android.material.R.style.TextAppearance_Material3_BodyMedium,
                com.google.android.material.R.attr.colorOnSurfaceVariant);
        LinearLayout.LayoutParams subtitleLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleLp.topMargin = dp(4);
        subtitleLp.bottomMargin = dp(8);
        root.addView(subtitle, subtitleLp);

        ScrollView scrollView = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scrollView.addView(list);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(360));
        root.addView(scrollView, scrollLp);

        ResolveInfo current = resolve(item.intent);
        AppEntry initial = null;
        if (current != null && !isResolver(componentOf(current))) {
            for (AppEntry app : apps) {
                if (app.packageName.equals(current.activityInfo.packageName)) {
                    initial = app;
                    break;
                }
            }
        }

        final AppEntry[] selected = {initial};
        List<AppCompatRadioButton> radios = new ArrayList<>();

        MaterialButton apply = new MaterialButton(this);
        apply.setText("应用");
        apply.setEnabled(initial != null);

        MaterialButton clear = new MaterialButton(this, null,
                com.google.android.material.R.attr.materialButtonOutlinedStyle);
        clear.setText("清除默认");
        clear.setEnabled(current != null && !isResolver(componentOf(current)));
        clear.setOnClickListener(v -> {
            sheet.dismiss();
            clearDefault(item);
        });

        for (AppEntry app : apps) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(8), dp(10), dp(8), dp(10));
            row.setClickable(true);
            TypedValue background = new TypedValue();
            getTheme().resolveAttribute(android.R.attr.selectableItemBackground, background, true);
            row.setBackgroundResource(background.resourceId);

            ImageView icon = new ImageView(this);
            if (app.icon != null) {
                icon.setImageDrawable(app.icon);
            }
            icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
            row.addView(icon, new LinearLayout.LayoutParams(dp(40), dp(40)));

            LinearLayout labels = new LinearLayout(this);
            labels.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams labelsLp = new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            labelsLp.setMarginStart(dp(16));
            row.addView(labels, labelsLp);

            MaterialTextView label = text(String.valueOf(app.label),
                    com.google.android.material.R.style.TextAppearance_Material3_BodyLarge,
                    com.google.android.material.R.attr.colorOnSurface);
            labels.addView(label);

            MaterialTextView pkg = text(app.packageName,
                    com.google.android.material.R.style.TextAppearance_Material3_BodySmall,
                    com.google.android.material.R.attr.colorOnSurfaceVariant);
            labels.addView(pkg);

            AppCompatRadioButton radio = new AppCompatRadioButton(this);
            radio.setClickable(false);
            radio.setChecked(app == initial);
            row.addView(radio);
            radios.add(radio);

            row.setOnClickListener(v -> {
                selected[0] = app;
                for (int i = 0; i < apps.size(); i++) {
                    radios.get(i).setChecked(apps.get(i) == app);
                }
                apply.setEnabled(true);
            });

            list.addView(row);
        }

        LinearLayout footer = new LinearLayout(this);
        footer.setOrientation(LinearLayout.HORIZONTAL);
        footer.setGravity(Gravity.END);
        LinearLayout.LayoutParams footerLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        footerLp.topMargin = dp(8);
        LinearLayout.LayoutParams clearLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clearLp.setMarginEnd(dp(8));
        footer.addView(clear, clearLp);
        footer.addView(apply, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(footer, footerLp);

        apply.setOnClickListener(v -> {
            AppEntry app = selected[0];
            if (app == null) {
                return;
            }
            sheet.dismiss();
            apply(item, app);
        });

        sheet.setContentView(root);
        sheet.show();
    }

    private void apply(DefaultsItem item, AppEntry app) {
        IDefaultsService current = service;
        if (current == null) {
            snack("Shizuku 服务未连接");
            return;
        }
        io.execute(() -> {
            boolean ok = false;
            try {
                if (item.isRole()) {
                    ok = current.setRole(item.role, app.packageName);
                } else {
                    Uri data = item.intent.getData();
                    String scheme = data != null ? data.getScheme() : null;
                    ok = current.setPreferred(item.intent.getAction(), item.intent.getType(),
                            scheme, app.packageName + "/" + app.activityName);
                }
            } catch (Throwable ignored) {
            }
            final boolean result = ok;
            main.post(() -> {
                snack(result ? "已设置：" + app.label : "设置失败：应用可能不具备该资格");
                refresh();
            });
        });
    }

    private void clearDefault(DefaultsItem item) {
        IDefaultsService current = service;
        if (current == null) {
            snack("Shizuku 服务未连接");
            return;
        }
        io.execute(() -> {
            boolean ok = false;
            try {
                if (item.isRole()) {
                    ok = current.clearRole(item.role);
                } else {
                    ResolveInfo resolved = resolve(item.intent);
                    if (resolved != null) {
                        ok = current.clearPreferred(resolved.activityInfo.packageName);
                    }
                }
            } catch (Throwable ignored) {
            }
            final boolean result = ok;
            main.post(() -> {
                snack(result ? "已清除" : "没有可清除的默认项");
                refresh();
            });
        });
    }

    private void addFooter() {
        MaterialTextView note = text(
                "本应用通过 Shizuku 以 shell 身份写入默认项。系统角色由 Android 校验资格，设置失败通常表示该应用不具备该角色。",
                com.google.android.material.R.style.TextAppearance_Material3_BodySmall,
                com.google.android.material.R.attr.colorOnSurfaceVariant);
        note.setPadding(dp(4), dp(24), dp(4), dp(8));
        content.addView(note);

        MaterialButton system = new MaterialButton(this, null,
                com.google.android.material.R.attr.materialButtonOutlinedStyle);
        system.setText("打开系统默认应用页");
        system.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS));
            } catch (Throwable t) {
                snack("系统没有该页面");
            }
        });
        content.addView(system, footerButtonParams());

        MaterialButton more = new MaterialButton(this, null,
                com.google.android.material.R.attr.materialButtonOutlinedStyle);
        more.setText("厂商“更多默认应用”页");
        more.setOnClickListener(v -> {
            try {
                startActivity(new Intent("android.settings.MANAGE_MORE_DEFAULT_APPS_SETTINGS"));
            } catch (Throwable t) {
                snack("此 ROM 没有该页面");
            }
        });
        content.addView(more, footerButtonParams());

        MaterialButton custom = new MaterialButton(this, null,
                com.google.android.material.R.attr.materialButtonOutlinedStyle);
        custom.setText("自定义 Intent…");
        custom.setOnClickListener(v -> showCustomDialog());
        content.addView(custom, footerButtonParams());
    }

    private LinearLayout.LayoutParams footerButtonParams() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        return lp;
    }

    private void showCustomDialog() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(8), dp(24), 0);

        TextInputLayout actionBox = new TextInputLayout(this);
        actionBox.setHint("Action（必填）");
        actionBox.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
        TextInputEditText actionInput = new TextInputEditText(this);
        actionInput.setText("android.intent.action.VIEW");
        actionInput.setInputType(InputType.TYPE_CLASS_TEXT);
        actionBox.addView(actionInput);
        box.addView(actionBox);

        TextInputLayout mimeBox = new TextInputLayout(this);
        mimeBox.setHint("MIME（可选）");
        mimeBox.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
        TextInputEditText mimeInput = new TextInputEditText(this);
        mimeInput.setInputType(InputType.TYPE_CLASS_TEXT);
        mimeBox.addView(mimeInput);
        LinearLayout.LayoutParams mimeLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mimeLp.topMargin = dp(12);
        box.addView(mimeBox, mimeLp);

        TextInputLayout schemeBox = new TextInputLayout(this);
        schemeBox.setHint("Scheme（可选，如 mailto）");
        schemeBox.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
        TextInputEditText schemeInput = new TextInputEditText(this);
        schemeInput.setInputType(InputType.TYPE_CLASS_TEXT);
        schemeBox.addView(schemeInput);
        LinearLayout.LayoutParams schemeLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        schemeLp.topMargin = dp(12);
        box.addView(schemeBox, schemeLp);

        new MaterialAlertDialogBuilder(this)
                .setTitle("自定义 Intent")
                .setView(box)
                .setNegativeButton("取消", null)
                .setPositiveButton("继续", (dialog, which) -> {
                    String action = textOf(actionInput);
                    String mime = textOf(mimeInput);
                    String scheme = textOf(schemeInput);
                    if (TextUtils.isEmpty(action)) {
                        snack("Action 不能为空");
                        return;
                    }
                    Intent intent = new Intent(action);
                    if (!TextUtils.isEmpty(mime) && !TextUtils.isEmpty(scheme)) {
                        intent.setDataAndType(Uri.parse(scheme + "://"), mime);
                    } else if (!TextUtils.isEmpty(mime)) {
                        intent.setType(mime);
                    } else if (!TextUtils.isEmpty(scheme)) {
                        intent.setData(Uri.parse(scheme + "://"));
                    }
                    if (resolve(intent) == null) {
                        snack("没有应用响应该 Intent");
                        return;
                    }
                    DefaultsItem custom = new DefaultsItem("自定义", action, "\u2699\uFE0F",
                            DefaultsItem.KIND_INTENT, null, intent, 0);
                    openPicker(custom);
                })
                .show();
    }

    private String textOf(TextInputEditText input) {
        return input.getText() == null ? "" : input.getText().toString().trim();
    }

    private MaterialTextView text(String value, int styleRes, int colorAttr) {
        MaterialTextView view = new MaterialTextView(this);
        view.setText(value);
        view.setTextAppearance(styleRes);
        view.setTextColor(color(colorAttr));
        return view;
    }

    private int color(int attr) {
        return MaterialColors.getColor(content, attr);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void snack(String message) {
        Snackbar.make(content, message, Snackbar.LENGTH_LONG).show();
    }

    private static class AppEntry {
        final String packageName;
        final String activityName;
        final CharSequence label;
        final Drawable icon;

        AppEntry(String packageName, String activityName, CharSequence label, Drawable icon) {
            this.packageName = packageName;
            this.activityName = activityName;
            this.label = label;
            this.icon = icon;
        }
    }
}


