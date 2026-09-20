@echo off
chcp 65001 >nul
title Windows 11 图标缓存修复工具
color 0A

echo.
echo ========================================
echo      Windows 11 图标白块修复工具
echo ========================================
echo.

echo [1/5] 正在关闭资源管理器...
taskkill /f /im explorer.exe >nul 2>&1

timeout /t 2 /nobreak >nul

echo [2/5] 正在删除 IconCache.db...
del /a /f /q "%localappdata%\IconCache.db" >nul 2>&1

echo [3/5] 正在删除 Explorer 图标缓存...
del /a /f /q "%localappdata%\Microsoft\Windows\Explorer\iconcache*" >nul 2>&1

echo [4/5] 正在删除缩略图缓存...
del /a /f /q "%localappdata%\Microsoft\Windows\Explorer\thumbcache*" >nul 2>&1

echo [5/5] 正在重启资源管理器...
start explorer.exe

echo.
echo ========================================
echo              修复完成
echo      如果还有白块，请重启电脑
echo ========================================
echo.

pause