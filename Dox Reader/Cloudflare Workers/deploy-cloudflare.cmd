@echo off
setlocal
where pwsh.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-cloudflare.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-cloudflare.ps1"
)
set "DOX_DEPLOY_EXIT=%ERRORLEVEL%"
if not "%DOX_DEPLOY_EXIT%"=="0" (
  echo.
  echo Deployment failed. Review the error above.
)
pause
exit /b %DOX_DEPLOY_EXIT%
