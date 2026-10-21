package com.dox.defaultapps;

import android.app.role.RoleManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Process;
import android.os.UserHandle;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.Keep;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public class DefaultsUserService extends IDefaultsService.Stub {

    private static final String TAG = "DefaultsService";
    private static final long ROLE_TIMEOUT_SECONDS = 10;

    private final Context context;

    @Keep
    public DefaultsUserService() {
        this(null);
    }

    @Keep
    public DefaultsUserService(Context context) {
        this.context = context;
    }

    @Override
    public void destroy() {
        System.exit(0);
    }

    @Override
    public void exit() {
        destroy();
    }

    @Override
    public String[] getRoleHolders(String role) {
        if (context == null) {
            return null;
        }
        RoleManager roleManager = context.getSystemService(RoleManager.class);
        if (roleManager == null) {
            return null;
        }
        try {
            Method method = RoleManager.class.getMethod("getRoleHoldersAsUser",
                    String.class, UserHandle.class);
            Object result = method.invoke(roleManager, role, Process.myUserHandle());
            return toArray(result);
        } catch (Throwable ignored) {
            try {
                Method method = RoleManager.class.getMethod("getRoleHolders", String.class);
                Object result = method.invoke(roleManager, role);
                return toArray(result);
            } catch (Throwable t) {
                Log.w(TAG, "getRoleHolders: " + t);
                return null;
            }
        }
    }

    private static String[] toArray(Object result) {
        if (!(result instanceof List)) {
            return null;
        }
        List<?> list = (List<?>) result;
        String[] out = new String[list.size()];
        for (int i = 0; i < out.length; i++) {
            out[i] = String.valueOf(list.get(i));
        }
        return out;
    }

    @Override
    public boolean setRole(String role, String pkg) {
        if (role == null || pkg == null) {
            return false;
        }
        try {
            return invokeRoleMethod("addRoleHolderAsUser", role, pkg);
        } catch (Throwable t) {
            Log.w(TAG, "setRole: " + t);
            return execRole("add-role-holder", role, pkg);
        }
    }

    @Override
    public boolean clearRole(String role) {
        if (role == null) {
            return false;
        }
        try {
            return invokeRoleMethod("clearRoleHoldersAsUser", role, null);
        } catch (Throwable t) {
            Log.w(TAG, "clearRole: " + t);
            return execRole("clear-role-holders", role, null);
        }
    }

    private boolean invokeRoleMethod(String name, String role, String pkg) throws Exception {
        if (context == null) {
            return false;
        }
        RoleManager roleManager = context.getSystemService(RoleManager.class);
        if (roleManager == null) {
            return false;
        }

        final CountDownLatch latch = new CountDownLatch(1);
        final boolean[] result = {false};
        Consumer<Boolean> callback = value -> {
            result[0] = value != null && value;
            latch.countDown();
        };

        Method method;
        Object[] args;
        if ("addRoleHolderAsUser".equals(name)) {
            method = RoleManager.class.getMethod(name, String.class, String.class, int.class,
                    UserHandle.class, Executor.class, Consumer.class);
            args = new Object[]{role, pkg, 0, Process.myUserHandle(),
                    (Executor) Runnable::run, callback};
        } else {
            method = RoleManager.class.getMethod(name, String.class, int.class,
                    UserHandle.class, Executor.class, Consumer.class);
            args = new Object[]{role, 0, Process.myUserHandle(),
                    (Executor) Runnable::run, callback};
        }

        method.invoke(roleManager, args);
        if (!latch.await(ROLE_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            return false;
        }
        return result[0];
    }

    private boolean execRole(String op, String role, String pkg) {
        try {
            List<String> command = new ArrayList<>();
            command.add("cmd");
            command.add("role");
            command.add(op);
            command.add("--user");
            command.add("0");
            command.add(role);
            if (pkg != null) {
                command.add(pkg);
            }
            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectErrorStream(true);
            return builder.start().waitFor() == 0;
        } catch (Throwable t) {
            Log.w(TAG, "execRole: " + t);
            return false;
        }
    }

    @Override
    public boolean setPreferred(String action, String mime, String scheme, String component) {
        if (context == null || TextUtils.isEmpty(action) || TextUtils.isEmpty(component)) {
            return false;
        }
        try {
            Intent intent = buildIntent(action, mime, scheme);
            PackageManager pm = context.getPackageManager();
            List<ResolveInfo> resolved = pm.queryIntentActivities(intent,
                    PackageManager.MATCH_DEFAULT_ONLY);
            if (resolved == null || resolved.isEmpty()) {
                return false;
            }

            ComponentName chosen = ComponentName.unflattenFromString(component);
            if (chosen == null) {
                return false;
            }

            ComponentName[] set = new ComponentName[resolved.size()];
            int bestMatch = 0;
            boolean found = false;
            for (int i = 0; i < resolved.size(); i++) {
                ResolveInfo info = resolved.get(i);
                set[i] = new ComponentName(info.activityInfo.packageName, info.activityInfo.name);
                if (info.match > bestMatch) {
                    bestMatch = info.match;
                }
                if (chosen.equals(set[i])) {
                    found = true;
                }
            }
            if (!found) {
                return false;
            }

            IntentFilter filter = buildFilter(intent);
            if (filter == null) {
                return false;
            }
            if (bestMatch == 0) {
                bestMatch = filter.match(intent.getAction(), intent.getType(),
                        intent.getScheme(), intent.getData(), intent.getCategories(), TAG);
            }
            if (bestMatch == 0) {
                return false;
            }

            addUniquePreferred(pm, filter, bestMatch, set, chosen);

            ResolveInfo applied = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (applied == null || applied.activityInfo == null) {
                return false;
            }
            return chosen.getPackageName().equals(applied.activityInfo.packageName);
        } catch (Throwable t) {
            Log.w(TAG, "setPreferred: " + t);
            return false;
        }
    }

    private void addUniquePreferred(PackageManager pm, IntentFilter filter, int match,
                                    ComponentName[] set, ComponentName chosen) throws Exception {
        try {
            Method method = pm.getClass().getMethod("addUniquePreferredActivity",
                    IntentFilter.class, int.class, ComponentName[].class, ComponentName.class);
            method.invoke(pm, filter, match, set, chosen);
        } catch (NoSuchMethodException e) {
            pm.addPreferredActivity(filter, match, set, chosen);
        } catch (Throwable t) {
            if (t.getCause() instanceof UnsupportedOperationException) {
                pm.addPreferredActivity(filter, match, set, chosen);
            } else {
                throw t;
            }
        }
    }

    private IntentFilter buildFilter(Intent intent) throws IntentFilter.MalformedMimeTypeException {
        IntentFilter filter = new IntentFilter();
        filter.addAction(intent.getAction());

        Set<String> categories = intent.getCategories();
        if (categories != null) {
            for (String category : categories) {
                filter.addCategory(category);
            }
        }
        filter.addCategory(Intent.CATEGORY_DEFAULT);

        Uri data = intent.getData();
        String scheme = data != null ? data.getScheme() : null;
        boolean hasType = !TextUtils.isEmpty(intent.getType());

        if (hasType) {
            filter.addDataType(intent.getType());
        }
        if (scheme != null && (!hasType || (!"file".equals(scheme) && !"content".equals(scheme)))) {
            filter.addDataScheme(scheme);
        }
        return filter;
    }

    private Intent buildIntent(String action, String mime, String scheme) {
        Intent intent = new Intent(action);
        if (!TextUtils.isEmpty(mime) && !TextUtils.isEmpty(scheme)) {
            intent.setDataAndType(Uri.parse(scheme + "://"), mime);
        } else if (!TextUtils.isEmpty(mime)) {
            intent.setType(mime);
        } else if (!TextUtils.isEmpty(scheme)) {
            intent.setData(Uri.parse(scheme + "://"));
        }
        return intent;
    }

    @Override
    public boolean clearPreferred(String pkg) {
        if (context == null || TextUtils.isEmpty(pkg)) {
            return false;
        }
        try {
            context.getPackageManager().clearPackagePreferredActivities(pkg);
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "clearPreferred: " + t);
            return false;
        }
    }
}



