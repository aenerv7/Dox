@echo off
setlocal
cd /d "%~dp0"
rc /nologo CapsLockOSD.rc || exit /b 1
cl /O2 /MT /EHsc /utf-8 /W4 /Fe:CapsLockOSD.exe CapsLockOSD.cpp CapsLockOSD.res /link /SUBSYSTEM:WINDOWS user32.lib advapi32.lib kernel32.lib gdi32.lib gdiplus.lib || exit /b 1
del /q CapsLockOSD.obj CapsLockOSD.res 2>nul
echo Build succeeded: CapsLockOSD.exe
