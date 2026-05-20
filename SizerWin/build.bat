@echo off
REM SizerWin 构建脚本
REM 需要 Visual Studio 或 Windows SDK 的 cl.exe / rc.exe
REM 在 "Developer Command Prompt for VS" 中运行

rc /nologo SizerWin.rc
if %ERRORLEVEL% NEQ 0 goto :fail

cl /O2 /W4 /Fe:SizerWin.exe SizerWin.c SizerWin.res /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib advapi32.lib kernel32.lib gdi32.lib dwmapi.lib
if %ERRORLEVEL% NEQ 0 goto :fail

echo.
echo 构建成功: SizerWin.exe
del /q SizerWin.obj SizerWin.res 2>nul
goto :eof

:fail
echo.
echo 构建失败
