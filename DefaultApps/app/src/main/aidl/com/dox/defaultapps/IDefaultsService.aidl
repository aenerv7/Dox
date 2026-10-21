package com.dox.defaultapps;

interface IDefaultsService {
    void destroy() = 16777114;

    String[] getRoleHolders(String role) = 1;

    boolean setRole(String role, String pkg) = 2;

    boolean clearRole(String role) = 3;

    boolean setPreferred(String action, String mime, String scheme, String component) = 4;

    boolean clearPreferred(String pkg) = 5;

    void exit() = 6;
}
