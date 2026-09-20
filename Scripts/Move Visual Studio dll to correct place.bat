@echo off
setlocal

set "COMP=HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\UserData\S-1-5-18\Components"
set "OUT_DIR=C:\Windows\SysWOW64"
goto :Process

:Fix
set "KEY=%COMP%\%~1"
set "OLD_FILE=%~2"
set "NEW_FILE=%~3"

for /f "tokens=1,2,*" %%A in ('reg query "%KEY%" 2^>nul') do (
    if "%%B"=="REG_SZ" if /i "%%C"=="%OLD_FILE%" (
        set "VAL=%%A"
        goto :Found
    )
)

echo.Value %OLD_FILE% not found in %KEY%
goto :CheckFile

:Found
reg add "%KEY%" /v "%VAL%" /t REG_SZ /d "%NEW_FILE%" /f && echo.Registry component %KEY%\%VAL% fixed || echo.Failed to update registry

:CheckFile
if exist "%OLD_FILE%" (
    move /Y "%OLD_FILE%" "%NEW_FILE%" && echo.%OLD_FILE% successfully moved to %NEW_FILE% || echo.Failed to move %OLD_FILE%
) else (
    echo.%OLD_FILE% does not exist, nothing to move
)
goto :EOF

:Process
call :Fix "0AF818DE4685190F5347FAF54BD80C82" "C:\appverifUI.dll" "%OUT_DIR%\appverifUI.dll"
call :Fix "E0C37F311948CF28AE087B694A681271" "C:\vfcompat.dll" "%OUT_DIR%\vfcompat.dll"

endlocal