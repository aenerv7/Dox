@echo off & setlocal
REM Based on ShadowWhisperer's Remove-MS-Edge project:
REM https://github.com/ShadowWhisperer/Remove-MS-Edge
REM land "clever" users back to native env (Win Vista and up; start /b not used due to some oddities)
if /i "%~1" equ "-help" goto help
if /i "%~1" equ "-h" goto help
if /i "%~1" equ "/?" goto help
if defined PROCESSOR_ARCHITEW6432 "%WinDir%\SysNative\cmd.exe" /c ""%~0" %*" & exit /b 0

REM
REM Check permissions and elevate if required
REM With -guard, exit before preparation unless Edge browser files or related AppX are detected
REM Obtain required files (from cache or from repo with hash validation)
REM Remove Edge
REM Preserve WebView2 Runtime and all shared Edge Update components
REM Remove AppX
REM Remove Edge remains
REM Remove AppX remains
REM Remove Extras
REM

set "ISSUE_GENERIC=1"
set "ISSUE_UAC=2"
set "ISSUE_NETWORK=3"
set "ISSUE_DOWNLOAD=4"
set "ISSUE_HASH=5"
set "ISSUE_ARCH=6"

set "RUN_MODE=normal"
if /i "%~1" equ "-guard" set "RUN_MODE=guard"
if /i "%~2" equ "guard" set "RUN_MODE=guard"
if /i "%~1" equ "-userchoice" set "RUN_MODE=userchoice"
if /i "%~2" equ "userchoice" set "RUN_MODE=userchoice"

REM check for architecture (x86 and amd64 are supported, arm - not)
if /i "%PROCESSOR_ARCHITECTURE%" equ "amd64" goto arch.pass
if /i "%PROCESSOR_ARCHITECTURE%" equ "x86" goto arch.pass
echo "%PROCESSOR_ARCHITECTURE%" platform is unsupported & echo. & pause & exit /b %ISSUE_ARCH%
:arch.pass

set "SCRIPT_VERSION=08/30/2026"
REM set logging verbosity ( log_lvl.none, log_lvl.errors, log_lvl.debug )
REM also see RemoveMSEdgeAll.bat for details
call :log_lvl.debug "%~1"

title Edge Remover - %SCRIPT_VERSION%
echo [main_script.start] %bat_dbg%



echo [uac()] %bat_dbg%
REM Get executor SID (Win 2003(XP x64) and up)
for /f "skip=1 tokens=1,2 delims=," %%a in ('whoami /user /fo csv') do set "EXEC_SID=%%~b"
REM When script elevates itself, the user SID should be passed as 1st argument (bad input here is not my fault)
set "USER_SID=%~1"
REM Check Admin permissions
net session >NUL 2>&1
echo err: %errorlevel%; EXEC_SID: "%EXEC_SID%"; USER_SID: "%USER_SID%" %bat_dbg%
if %errorlevel% equ 0 goto uac.success
REM When UAC disabled, elevation not works and SID never changes
if /i "%EXEC_SID%" equ "%USER_SID%" (
	echo Please, enable UAC and try again & echo. & pause & exit /b %ISSUE_UAC%
)
REM When 1st arg looks like valid NT_AUTHORITY SID, assume elevation by script (prevent infinite loop aka UAC bombing)
if /i "%USER_SID:~0,6%" equ "S-1-5-" (
	REM DO NOT put on the same line as condition: using another var after substring when its source is empty leads to hard fail
	echo Built-in Admin account possibly corrupted & echo. & pause & exit /b %ISSUE_UAC%
)
REM Elevate with psl (don't try go around cmd /c; see RemoveMSEdgeAll.bat for quotes details)
echo Start-Process -Verb RunAs """$env:COMSpec""" "%ecm% """"%~0"" ""%EXEC_SID%"" ""%RUN_MODE%"""""|powershell -noprofile - %bat_log%
echo [uac().elevated] err: "%errorlevel%" %bat_dbg%
exit /b %errorlevel%

REM Admin permissions granted, executor SID may be a SID of Built-in Admin account if it's enabled
:uac.success
echo [uac().success] %bat_dbg%
REM 1st arg looks like valid rev.1 SID (assume elevation by script)
if /i "%USER_SID:~0,4%" equ "S-1-" goto uac.done
REM 1st arg does not look like valid SID (elevation NOT by script)
set "USER_SID=%EXEC_SID%"
REM When Built-in Admin account disabled, SID does not change on elevation and usually match the condition
if "%EXEC_SID:~-4%" neq "-500" goto uac.done
REM For automaters: "-auto" and scheduled-task "-guard" bypass this confirmation
if /i "%~1" equ "-auto" goto uac.done
if /i "%~1" equ "-guard" goto uac.done
REM Built-in Admin account enabled and script not self elevated nor automated
choice /c yn /n /m "Logged as Admin? [Y,N]"
REM Check for positive answer, anything else considered as No
echo answer: %errorlevel% %bat_dbg%
if %errorlevel% equ 1 goto uac.done
echo Please, run script without elevation & echo. & pause & exit /b %ISSUE_UAC%

:uac.done
echo [uac().done] %bat_dbg%

if /i not "%RUN_MODE%" equ "userchoice" goto userchoice.mode.done
echo - Cleaning stale Edge UserChoice associations
call :userchoice_cleanup %USER_SID%
set "userchoice_result=%errorlevel%"
if "%userchoice_result%" neq "0" echo Failed to remove one or more protected Edge UserChoice associations.
exit /b %userchoice_result%

:userchoice.mode.done



set "REG_USERS_PATH=HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList"
if /i not "%RUN_MODE%" equ "guard" goto guard.done

echo [guard()] %bat_dbg%
call :edge_guard_detect %bat_log%
if "%edge_guard_found%" equ "1" goto guard.found
echo - Edge is not installed; nothing to remove
echo [guard().not_found] %bat_dbg%
exit /b 0

:guard.found
echo - Edge installation detected
echo [guard().found] %bat_dbg%

:guard.done
echo [guard().done] %bat_dbg%



set "has_net=0"
ipconfig | find "IPv" >NUL 2>&1
if %errorlevel% equ 0 set "has_net=1"
echo has network: %has_net% %bat_dbg%

REM prepare architecture-depend stuff (see RemoveMSEdgeAll.bat for details)
echo - Obtaining required files
echo [prepare()] %bat_dbg%
goto prepare.%PROCESSOR_ARCHITECTURE%


:prepare.amd64
echo [prepare().amd64] %bat_dbg%

set "x86ProgramsFolder=%ProgramFiles(x86)%"

call :file_obtain^
 "setup.x64.exe"^
 "0950336e0d633eb645e0cf66780d2102a182caa184264d4f62146fe229f636e7"^
 "https://raw.githubusercontent.com/ShadowWhisperer/Remove-MS-Edge/main/_Source/setup.x64.exe"^
 "file_setup_loc"^
 %bat_log%
if %errorlevel% neq 0 echo Cannot obtain "setup.exe" (%errorinfo%) & echo. & pause & exit /b %errorlevel%

call :file_obtain^
 "System.Data.SQLite.x64.dll"^
 "1b3742c5bd1b3051ae396c6e62d1037565ca0cbbedb35b460f7d10a70c30376f"^
 "https://raw.githubusercontent.com/ShadowWhisperer/Remove-MS-Edge/main/_Source/System.Data.SQLite.x64.dll"^
 "file_SQLite_loc"^
 %bat_log%
if %errorlevel% neq 0 echo Cannot obtain "System.Data.SQLite.dll" (%errorinfo%) & echo. & pause & exit /b %errorlevel%

set "file_setup=%file_setup_loc:.x64.=.%"
set "file_SQLite=%file_SQLite_loc:.x64.=.%"

goto prepare.end


:prepare.x86
echo [prepare().x86] %bat_dbg%

set "x86ProgramsFolder=%ProgramFiles%"

REM Thanks to @Ameterius for the 32bit setup.exe
call :file_obtain^
 "setup.x86.exe"^
 "97935c67fe17c388cff6c498b565130f9262ea9518150303fff08576c67cfd9d"^
 "https://raw.githubusercontent.com/ShadowWhisperer/Remove-MS-Edge/main/_Source/setup.x86.exe"^
 "file_setup_loc"^
 %bat_log%
if %errorlevel% neq 0 echo Cannot obtain "setup.exe" (%errorinfo%) & echo. & pause & exit /b %errorlevel%

call :file_obtain^
 "System.Data.SQLite.x86.dll"^
 "845f7cbae72cf0a09a7f8740029ea9a15cb3a51c0b883b67b6ff1fc15fb26729"^
 "https://raw.githubusercontent.com/ShadowWhisperer/Remove-MS-Edge/main/_Source/System.Data.SQLite.x86.dll"^
 "file_SQLite_loc"^
 %bat_log%
if %errorlevel% neq 0 echo Cannot obtain "System.Data.SQLite.dll" (%errorinfo%) & echo. & pause & exit /b %errorlevel%

set "file_setup=%file_setup_loc:.x86.=.%"
set "file_SQLite=%file_SQLite_loc:.x86.=.%"

goto prepare.end

:prepare.end
echo [prepare().end] %bat_dbg%
REM create hardlinks
del /f /q "%file_setup%" %bat_log%
del /f /q "%file_SQLite%" %bat_log%
fsutil hardlink create "%file_setup%" "%file_setup_loc%" %bat_log%
fsutil hardlink create "%file_SQLite%" "%file_SQLite_loc%" %bat_log%

echo x86ProgramsFolder: %x86ProgramsFolder% %bat_dbg%
echo [prepare().done] %bat_dbg%



REM query packages by pattern before Edge uninstalling
echo query packages %bat_dbg%
set "pkgs_pattern=*microsoftedge*"
for /f "delims=" %%p in ('powershell -noprofile -c "$pkgs='';foreach($pkg in (Get-AppxPackage -AllUsers).Where({$_.PackageFullName -like $env:pkgs_pattern})){$pkgs+=' '+[int]$pkg.NonRemovable+$pkg.PackageFullName}$pkgs.Trim()"') do (
	set "pkgs_list=%%~p"
)
echo "%pkgs_list%" %bat_dbg%
echo packages queried %bat_dbg%



%stp_dbg_rst%



REM #Uninstall
echo [uninstall()] %bat_dbg%
echo - Removing Edge
echo [uninstall().edge.init] %bat_dbg%
taskkill /im msedge.exe /f /t %bat_log%

set "edge_guard_found=0"
call :edge_guard_check_dir "%x86ProgramsFolder%\Microsoft\Edge\Application" %bat_log%
if defined ProgramFiles call :edge_guard_check_dir "%ProgramFiles%\Microsoft\Edge\Application" %bat_log%
if "%edge_guard_found%" equ "0" goto uninstall.edge.machine.done

echo [uninstall().edge.machine] %bat_dbg%
start /w "" "%file_setup%" --uninstall --system-level --force-uninstall %stp_dbg_arg% %bat_log%
%stp_dbg_get%

:uninstall.edge.machine.done
echo [uninstall().edge.machine.done] %bat_dbg%

set "edge_guard_found=0"
call :edge_guard_check_dir "%LOCALAPPDATA%\Microsoft\Edge\Application" %bat_log%
if "%edge_guard_found%" equ "0" goto uninstall.edge.user.done

echo [uninstall().edge.user] %bat_dbg%
start /w "" "%file_setup%" --uninstall --force-uninstall %stp_dbg_arg% %bat_log%
%stp_dbg_get%

:uninstall.edge.user.done
echo [uninstall().edge.user.done] %bat_dbg%

:uninstall.edge.done
echo [uninstall().edge.done] %bat_dbg%


echo - Removing AppX
echo [uninstall().appx.init] %bat_dbg%
set "LOC_APPREPO_DB=%AllUsersProfile%\Microsoft\Windows\AppRepository\StateRepository-Machine.srd"
set "REG_USERS_PATH=HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList"
set "REG_APPX_STORE=HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Appx\AppxAllUserStore"
set "REG32_APPX_STORE=HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Appx\AppxAllUserStore"

set "reg_SFT_paths_scn="
set "reg_CLS_paths_scn="
REM Registry locations for scan and remove appx keys, max length after batch vars expanding - 8167(8191 - 24; 24 - "set "reg_???_paths_scn="")
REM delimiter is \\, scan is recursive (see RemoveMSEdgeAll.bat for details)

REM reg_SFT_paths_scn - is only for keys located under HIVE\SOFTWARE key
REM HIVE\SOFTWARE\ part should be excluded from path
echo [uninstall().appx.init.reg_SFT] %bat_dbg%
set "reg_SFT_paths_scn=%reg_SFT_paths_scn%\\Microsoft\SecurityManager\CapAuthz\ApplicationsEx" %bat_log%
set "reg_SFT_paths_scn=%reg_SFT_paths_scn%\\Microsoft\Windows\CurrentVersion\AppHost\IndexedDB" %bat_log%
set "reg_SFT_paths_scn=%reg_SFT_paths_scn%\\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications" %bat_log%
set "reg_SFT_paths_scn=%reg_SFT_paths_scn%\\Microsoft\Windows\CurrentVersion\PushNotifications\Backup" %bat_log%
set "reg_SFT_paths_scn=%reg_SFT_paths_scn%\\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\Capabilities" %bat_log%
set "reg_SFT_paths_scn=%reg_SFT_paths_scn%\\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore" %bat_log%
set "reg_SFT_paths_scn=%reg_SFT_paths_scn%\\Microsoft\Windows NT\CurrentVersion\BackgroundModel\PreInstallTasks\RequireReschedule" %bat_log%
REM reg_CLS_paths_scn - is only for keys located under HIVE\SOFTWARE\Classes key
REM HIVE\SOFTWARE\Classes\ part should be excluded from path
echo [uninstall().appx.init.reg_CLS] %bat_dbg%
set "reg_CLS_paths_scn=%reg_CLS_paths_scn%\\ActivatableClasses\Package" %bat_log%
set "reg_CLS_paths_scn=%reg_CLS_paths_scn%\\Extensions\ContractId" %bat_log%
set "reg_CLS_paths_scn=%reg_CLS_paths_scn%\\Local Settings\MrtCache" %bat_log%
set "reg_CLS_paths_scn=%reg_CLS_paths_scn%\\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\PolicyCache" %bat_log%
set "reg_CLS_paths_scn=%reg_CLS_paths_scn%\\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData" %bat_log%

echo [uninstall().appx] %bat_dbg%
call :appx_unlock_and_delete %bat_log%

echo [uninstall().appx.done] %bat_dbg%

echo [uninstall().end] %bat_dbg%



REM #Cleanup
echo [cleanup()] %bat_dbg%
echo - Cleaning Edge remains
echo [cleanup().edge] %bat_dbg%

REM Delete Edge empty folders
echo [cleanup().edge.dirs] %bat_dbg%
rd /s /q "%x86ProgramsFolder%\Microsoft\Edge" %bat_log%
rd /s /q "%ProgramFiles%\Microsoft\Edge" %bat_log%
REM EdgeCore, EdgeUpdate, their tasks and services are shared with WebView2.
REM Leave them untouched; Edge Update removes unused components on its own.

REM Delete Desktop, StartMenu and TaskBar shortcuts; cleanup user registry
echo [cleanup().edge.users] %bat_dbg%
for /f "skip=2 tokens=2*" %%c in ('reg query "%REG_USERS_PATH%" /v Public') do ( call :user_lnks_remove_by_path "%%~d" %bat_log% )
del /f /q "%AllUsersProfile%\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk" %bat_log%
for /f "skip=2 tokens=2*" %%c in ('reg query "%REG_USERS_PATH%" /v Default') do (
	call :user_lnks_remove_by_path "%%~d" %bat_log%
	call :user_reg_cleanup .DEFAULT "%%~d" %bat_log%
)
for /f "skip=1 tokens=7 delims=\" %%k in ('reg query "%REG_USERS_PATH%" /k /f "*"') do ( call :user_cleanup_by_sid %%k %bat_log% )

echo [cleanup().edge.done] %bat_dbg%


echo - Cleaning AppX remains
echo [cleanup().appx] %bat_dbg%
REM Delete remained packages
REM %SystemRoot%\SystemApps\Microsoft.MicrosoftEdge*
echo [cleanup().appx.SystemApps] %bat_dbg%
for /d %%d in ("%SystemRoot%\SystemApps\Microsoft.MicrosoftEdge*") do (
	echo dir: "%%~d" %bat_dbg%
	takeown /f "%%~d" /r /d y %bat_dbg%
	icacls "%%~d" /grant "%UserName%:F" /t /c %bat_dbg%
	rd /s /q "%%~d" %bat_log%
)
REM %ProgramFiles%\WindowsApps\Microsoft.MicrosoftEdge*
echo [cleanup().appx.WindowsApps] %bat_dbg%
for /d %%d in ("%ProgramFiles%\WindowsApps\Microsoft.MicrosoftEdge*") do (
	echo dir: "%%~d" %bat_dbg%
	takeown /f "%%~d" /r /d y %bat_dbg%
	icacls "%%~d" /grant "%UserName%:F" /t /c %bat_dbg%
	rd /s /q "%%~d" %bat_log%
)

echo [cleanup().appx.done] %bat_dbg%

echo [cleanup().end] %bat_dbg%



REM #Additional Data
echo - Removing additional data
echo [extra_cleanup()] %bat_dbg%
REM Registry
echo [extra_cleanup().registry.regular] %bat_dbg%

reg delete "HKLM\SOFTWARE\Microsoft\Edge" /f %bat_log%
reg delete "HKLM\SOFTWARE\Microsoft\MicrosoftEdge" /f %bat_log%
reg delete "HKLM\SOFTWARE\Microsoft\Internet Explorer\EdgeDebugActivation" /f %bat_log%
reg delete "HKLM\SOFTWARE\Microsoft\Internet Explorer\EdgeIntegration" /f %bat_log%
reg delete "HKLM\SOFTWARE\WOW6432Node\Microsoft\Edge" /f %bat_log%
reg delete "HKLM\SOFTWARE\WOW6432Node\Microsoft\MicrosoftEdge" /f %bat_log%

set "reg_HKLM_keys_del="
REM Keys for TakeOwn+FullControl and deleting, max length after batch vars expanding - 8167(8191 - 24; 24 - "set "reg_HKLM_keys_del="")
REM delimiter is \\ (see RemoveMSEdgeAll.bat for details)
echo [extra_cleanup().registry.inaccessible.init] %bat_dbg%
set "reg_HKLM_keys_del=%reg_HKLM_keys_del%\\SOFTWARE\Microsoft\Windows\CurrentVersion\MicrosoftEdge" %bat_log%
set "reg_HKLM_keys_del=%reg_HKLM_keys_del%\\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\MicrosoftEdge" %bat_log%
set "reg_HKLM_keys_del=%reg_HKLM_keys_del%\\SOFTWARE\Microsoft\WindowsRuntime\Server\Windows.Internal.WebRuntime.BCHostServer" %bat_log%
set "reg_HKLM_keys_del=%reg_HKLM_keys_del%\\SOFTWARE\Microsoft\WindowsRuntime\Server\Windows.Internal.WebRuntime.ContentProcessServer" %bat_log%
set "reg_HKLM_keys_del=%reg_HKLM_keys_del%\\SOFTWARE\Microsoft\WindowsRuntime\Server\Windows.Internal.WebRuntime.F12Server" %bat_log%

echo [extra_cleanup().registry.inaccessible] %bat_dbg%
call :reg_HKLM_keys_access_and_delete %bat_log%

REM System32
echo [extra_cleanup().files.System32] %bat_dbg%
for %%f in ("%SystemRoot%\System32\MicrosoftEdge*.exe") do (
	echo file: "%%~f" %bat_dbg%
	takeown /f "%%~f" %bat_log%
	icacls "%%~f" /grant "%UserName%:F" /c %bat_log%
	del /f /q "%%~f" %bat_log%
)


REM Malformed Keys
echo - Fixing registry
echo [extra_cleanup().registry.fix] %bat_dbg%
setlocal EnableDelayedExpansion
set "reg_path=HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Appx\AppxAllUserStore"
for /f "tokens=*" %%k in ('reg query "%reg_path%" /s 2^>NUL ^| findstr /b /i "%reg_path%"') do (
	set "full_key=%%k"
	set "delete_key=false"
	set "reason="
	for %%a in ("!full_key!") do set "key_name=%%~nxa"
	REM Skip empty or unchanged names
	if "!key_name!"=="" (
		set "reason=empty key name"
	) else if "!key_name!"=="!full_key!" (
		set "reason=key name same as full path"
	) else (
		REM Check for space
		set "spaced_key=!key_name: =!"
		if not "!key_name!"=="!spaced_key!" (
			set "delete_key=true"
		) else (
			REM Check for letters
			echo /7 - !key_name! | findstr /r /c:"[a-zA-Z]" >NUL
			if !errorlevel! neq 0 set "delete_key=true"
		)
	)
	if "!delete_key!"=="true" reg delete "!full_key!" /f >nul 2>&1
)
endlocal


echo [extra_cleanup().end] %bat_dbg%



REM Main script end
echo - Edge removal complete
echo [main_script.end] %bat_dbg%
REM remove hardlinks
del /f /q "%file_setup%" %bat_log%
del /f /q "%file_SQLite%" %bat_log%
echo [main_script.done] %bat_dbg%
exit /b 0



REM =====  Functions  =====

REM labels, starts with underscore( _ ), are for internal usage and should not be called from main script
REM labels, starts with regular symbol, are public functions and can be called from main script


REM levels of logging verbosity

:log_lvl.none
REM release mode
set "bat_log=>NUL 2>&1"
set "bat_dbg=>NUL 2>&1"
set "cll_dbg=%bat_dbg%"
set "psl_dbg=*^^^>$null"
set "for_psl_dbg=*^^^^^^^>$null"
REM set "for_psl_dbg_hlpr="
REM power_hell(even 7.5) put errors to stdout if stderr not redirected
set "for_out_hlpr=2^>NUL"
REM set "for_out_get="
REM set "for_out_del="
REM all output mutes so there nothing in console
set "ecm=/c"
REM set "stp_dbg_arg="
REM set "stp_dbg_get="
REM set "stp_dbg_rst="
exit /b 0

:log_lvl.errors
REM errors only
set "bat_log=>NUL"
set "bat_dbg=>NUL 2>&1"
set "cll_dbg=%bat_dbg%"
set "psl_dbg=*^^^>$null"
set "for_psl_dbg=*^^^^^^^>$null"
REM set "for_psl_dbg_hlpr="
set "for_out_hlpr=2^>"%~dpn0_hlpr.log""
set "for_out_get=1>&2(echo [for.cmd.errors] & type "%~dpn0_hlpr.log" & echo [for.cmd.end])"
set "for_out_del=del /f /q "%~dpn0_hlpr.log" >NUL 2>&1"
set "ecm=/k"
REM set "stp_dbg_arg="
REM set "stp_dbg_get="
REM set "stp_dbg_rst="
exit /b 0

:log_lvl.debug
REM debug mode, put all output to file(except user-trageted output)
set "bat_log=>>"%~dpn0_dbg.log" 2>&1"
set "bat_dbg=>>"%~dpn0_dbg.log" 2>&1"
REM resolves issue with accessing log file from sub-routines
REM set "cll_dbg="
REM set "psl_dbg="
REM redirect debug to stderr
REM it can works without extra file but it's a quirk
set "for_psl_dbg=^^^^^^^|dbg2err"
set "for_psl_dbg_hlpr=function dbg2err^([Parameter^(ValueFromPipeline^)]$m^){process{[Console]::Error.WriteLine^($m^)}}"
set "for_out_hlpr=2^>"%~dpn0_hlpr.log""
set "for_out_get=echo [for.cmd] & type "%~dpn0_hlpr.log" & echo [for.cmd.end]"
set "for_out_del=del /f /q "%~dpn0_hlpr.log" >NUL 2>&1"
REM all output redirected to file except batch errors
set "ecm=/k"
set "stp_dbg_arg=--verbose-logging"
REM uninstaller log grabber
set "stp_dbg_get=type "%Temp%\msedge_installer.log" %bat_dbg% & type NUL>"%Temp%\msedge_installer.log""
REM reset existing log
set "stp_dbg_rst=type NUL>"%Temp%\msedge_installer.log""
REM resolves issue with accessing log file on elevation
timeout /t 1 /nobreak >NUL 2>&1
REM reset log file if this is not elevation re-run (bad check, cuz someone may pass an argument)
if "%~1" equ "" echo %~nx0 %SCRIPT_VERSION% >"%~dpn0_dbg.log"
if /i "%~1" equ "-auto" echo %~nx0 %SCRIPT_VERSION% >"%~dpn0_dbg.log"
if /i "%~1" equ "-guard" echo %~nx0 %SCRIPT_VERSION% >"%~dpn0_dbg.log"
exit /b 0


REM check script and %tmp% directories for file, check file hash, (re-)download from URL if required
REM if file successfully validated its full path will be stored to variable
REM arguments: file name, file hash, file URL and variable name in this exact order
REM return result as exit code
:file_obtain
echo [file_obtain()] %cll_dbg%
echo   name: "%~1" %cll_dbg%
echo   hash: "%~2" %cll_dbg%
echo   url:  "%~3" %cll_dbg%
echo   var:  "%~4" %cll_dbg%
if "%~1" equ "" goto _file_obtain.fail
if "%~2" equ "" goto _file_obtain.fail
if "%~3" equ "" goto _file_obtain.fail
if "%~4" equ "" goto _file_obtain.fail

set "on_hash_err=download"
set "file_path=%~dp0%~1"
if exist "%file_path%" goto _file_obtain.check
set "file_path=%tmp%\%~1"
if exist "%file_path%" goto _file_obtain.check

echo file not cached %cll_dbg%

:_file_obtain.download
if %has_net% equ 0 goto _file_obtain.net.fail

echo [file_obtain().download] %cll_dbg%
set "on_hash_err=check.fail"
del /f /q "%file_path%" >NUL 2>&1
if exist "%file_path%" goto _file_obtain.download.fail
powershell -noprofile -c "[Net.WebClient]::new().DownloadFile('%~3', '%file_path%')"
if %errorlevel% neq 0 goto _file_obtain.download.fail
if not exist "%file_path%" goto _file_obtain.download.fail

:_file_obtain.check
echo [file_obtain().check] "%file_path%"; on_hash_err: "%on_hash_err%" %cll_dbg%
set "file_hash_path=%file_path%"
set "file_hash_expected=%~2"
powershell -noprofile -c "$sha = [Security.Cryptography.SHA256]::Create(); $stream = [IO.File]::OpenRead($env:file_hash_path); try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }; if ($hash -ne $env:file_hash_expected) { exit 1 }"
if %errorlevel% neq 0 goto _file_obtain.%on_hash_err%

set "%~4=%file_path%"
echo [file_obtain().done] %cll_dbg%
exit /b 0

:_file_obtain.fail
set "errorinfo=%ISSUE_GENERIC%: generic"
echo [file_obtain().fail] %cll_dbg%
exit /b %ISSUE_GENERIC%

:_file_obtain.net.fail
set "errorinfo=%ISSUE_NETWORK%: no network"
echo [file_obtain().net.fail] %cll_dbg%
exit /b %ISSUE_NETWORK%

:_file_obtain.download.fail
set "errorinfo=%ISSUE_DOWNLOAD%: download error"
echo [file_obtain().download.fail] %cll_dbg%
exit /b %ISSUE_DOWNLOAD%

:_file_obtain.check.fail
set "errorinfo=%ISSUE_HASH%: hash mismatch"
echo [file_obtain().check.fail] %cll_dbg%
exit /b %ISSUE_HASH%


REM Scheduled-task guard: detect Edge browser files for machine/all profiles and Edge AppX for all users.
REM WebView2, EdgeCore and EdgeUpdate are deliberately excluded from the detection criteria.
:edge_guard_detect
echo [edge_guard_detect()] %cll_dbg%
set "edge_guard_found=0"

if defined ProgramFiles(x86) call :edge_guard_check_dir "%ProgramFiles(x86)%\Microsoft\Edge\Application"
if defined ProgramFiles call :edge_guard_check_dir "%ProgramFiles%\Microsoft\Edge\Application"
if defined LOCALAPPDATA call :edge_guard_check_dir "%LOCALAPPDATA%\Microsoft\Edge\Application"
for /f "skip=1 tokens=7 delims=\" %%s in ('reg query "%REG_USERS_PATH%" /k /f "*"') do ( call :edge_guard_check_profile %%s )

set "edge_guard_appx="
for /f "delims=" %%p in ('powershell -noprofile -c "try { if (@(Get-AppxPackage -AllUsers -ErrorAction Stop).Where({$_.PackageFullName -like '*MicrosoftEdge*'}).Count -gt 0) { '1' } else { '0' } } catch { exit 1 }"') do ( set "edge_guard_appx=%%~p" )
if not defined edge_guard_appx (
	echo AppX detection failed; continue with removal %cll_dbg%
	set "edge_guard_found=1"
)
if "%edge_guard_appx%" equ "1" (
	echo Edge AppX detected %cll_dbg%
	set "edge_guard_found=1"
)

echo [edge_guard_detect().end] found: "%edge_guard_found%" %cll_dbg%
exit /b 0

:edge_guard_check_profile
set "edge_guard_profile_path="
for /f "skip=2 tokens=2*" %%c in ('reg query "%REG_USERS_PATH%\%1" /v ProfileImagePath') do ( set "edge_guard_profile_path=%%~d" )
if not defined edge_guard_profile_path exit /b 0
call :edge_guard_check_dir "%edge_guard_profile_path%\AppData\Local\Microsoft\Edge\Application"
exit /b 0

:edge_guard_check_dir
set "edge_guard_dir_found=0"
if exist "%~1\msedge.exe" set "edge_guard_dir_found=1"
for /d %%d in ("%~1\*") do if exist "%%~d\msedge.exe" set "edge_guard_dir_found=1"
if "%edge_guard_dir_found%" equ "0" exit /b 0
echo Edge browser detected: "%~1" %cll_dbg%
set "edge_guard_found=1"
exit /b 0


REM retrieve location of user profile by user SID
REM call shortcuts removing
REM call cleanup of user registry
:user_cleanup_by_sid
echo [user_cleanup_by_sid()] "%1" %cll_dbg%
if /i "%1" equ "S-1-5-18" goto _user_cleanup_by_sid.end
if /i "%1" equ "S-1-5-19" goto _user_cleanup_by_sid.end
if /i "%1" equ "S-1-5-20" goto _user_cleanup_by_sid.end

echo accepted %cll_dbg%
set "profile_path="
for /f "skip=2 tokens=2*" %%c in ('reg query "%REG_USERS_PATH%\%1" /v ProfileImagePath') do ( set "profile_path=%%~d" )
if not defined profile_path (
	echo profile path not found %cll_dbg%
	goto _user_cleanup_by_sid.end
)
if not exist "%profile_path%\" (
	echo profile path does not exist: "%profile_path%" %cll_dbg%
	goto _user_cleanup_by_sid.end
)
rd /s /q "%profile_path%\AppData\Local\Microsoft\Edge" %cll_dbg%
call :user_lnks_remove_by_path "%profile_path%"
call :user_reg_cleanup %1 "%profile_path%"

:_user_cleanup_by_sid.end
echo [user_cleanup_by_sid().end] %cll_dbg%
exit /b 0

REM remove shortcuts from several locations of user profile
:user_lnks_remove_by_path
echo [user_lnks_remove_by_path()] "%~1" %cll_dbg%
del /f /q "%~1\Desktop\edge.lnk"
del /f /q "%~1\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\edge.lnk"
del /f /q "%~1\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\edge.lnk"
del /f /q "%~1\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\edge.lnk"
del /f /q "%~1\Desktop\Microsoft Edge.lnk"
del /f /q "%~1\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Microsoft Edge.lnk"
del /f /q "%~1\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\Microsoft Edge.lnk"
del /f /q "%~1\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Microsoft Edge.lnk"

echo [user_lnks_remove_by_path().end] %cll_dbg%
exit /b 0

REM remove some registry keys
REM arguments: user SID and user profile dir path in this exact order
:user_reg_cleanup
echo [user_reg_cleanup()] %cll_dbg%
echo   SID:  "%1" %cll_dbg%
echo   path: "%~2" %cll_dbg%

echo prepare main hive %cll_dbg%
reg query "HKU\%1" /ve
if %errorlevel% neq 0 reg load "HKU\%1" "%~2\NTUSER.DAT"
if %errorlevel% neq 0 echo main hive load fail %cll_dbg% & goto _user_reg_cleanup.sft.done
echo main hive ready %cll_dbg%

echo cleanup main hive %cll_dbg%
reg delete "HKU\%1\SOFTWARE\Microsoft\Edge" /f
reg delete "HKU\%1\SOFTWARE\Microsoft\MicrosoftEdge" /f
reg delete "HKU\%1\SOFTWARE\Microsoft\Internet Explorer\EdgeDebugActivation" /f
reg delete "HKU\%1\SOFTWARE\Microsoft\Internet Explorer\EdgeIntegration" /f
reg delete "HKU\%1\SOFTWARE\WOW6432Node\Microsoft\Edge" /f
reg delete "HKU\%1\SOFTWARE\WOW6432Node\Microsoft\MicrosoftEdge" /f

reg delete "HKU\%1\SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\microsoft-edge" /f
reg delete "HKU\%1\SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\microsoft-edge-holographic" /f
call :userchoice_cleanup %1

REM for current user require explorer restart
reg delete "HKU\%1\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Taskband" /v "FavoritesRemovedChanges" /f
reg delete "HKU\%1\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Taskband" /v "FavoritesVersion" /f
reg delete "HKU\%1\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Taskband" /v "FavoritesChanges" /f

:_user_reg_cleanup.sft.done
echo [user_reg_cleanup().sft.done] %cll_dbg%

REM see RemoveMSEdgeAll.bat for details
echo probing "SOFTWARE\Classes" %cll_dbg%
set "cls_path=%1\SOFTWARE\Classes"
reg query "HKU\%cls_path%" /ve
if %errorlevel% equ 0 goto _user_reg_cleanup.cls.ready

echo prepare classes hive %cll_dbg%
set "cls_path=%1_Classes"
reg query "HKU\%cls_path%" /ve
REM location of user classes hive can be altered by user
if %errorlevel% neq 0 reg load "HKU\%cls_path%" "%~2\AppData\Local\Microsoft\Windows\UsrClass.dat"
if %errorlevel% neq 0 echo classes hive load fail %cll_dbg% & goto _user_reg_cleanup.cls.done

:_user_reg_cleanup.cls.ready
echo classes hive ready %cll_dbg%

echo cleanup classes hive %cll_dbg%
reg delete "HKU\%cls_path%\microsoft-edge" /f
reg delete "HKU\%cls_path%\microsoft-edge-holographic" /f

:_user_reg_cleanup.cls.done
echo [user_reg_cleanup().cls.done] %cll_dbg%

echo [user_reg_cleanup().end] %cll_dbg%
exit /b 0



REM remove stale Edge UserChoice associations without overwriting another browser choice
REM arguments: user SID
:userchoice_cleanup
echo [userchoice_cleanup()] "%1" %cll_dbg%
set "userchoice_cleanup_failed=0"
for /f "tokens=*" %%k in ('reg query "HKU\%~1\SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations" /s /f "UserChoice" /k 2^>NUL ^| findstr /i /r /c:"\\UserChoice$" /c:"\\UserChoiceLatest$"') do call :userchoice_cleanup_key "%%k"
for /f "tokens=*" %%k in ('reg query "HKU\%~1\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FileExts" /s /f "UserChoice" /k 2^>NUL ^| findstr /i /r /c:"\\UserChoice$" /c:"\\UserChoiceLatest$"') do call :userchoice_cleanup_key "%%k"
if "%userchoice_cleanup_failed%" equ "1" exit /b 1
exit /b 0

:userchoice_cleanup_key
set "userchoice_progid="
for /f "tokens=1,2,*" %%a in ('reg query "%~1" /v ProgId 2^>NUL') do call :userchoice_capture_value "%%a" "%%c"
if not defined userchoice_progid for /f "tokens=1,2,*" %%a in ('reg query "%~1\ProgId" /v ProgId 2^>NUL') do call :userchoice_capture_value "%%a" "%%c"
if not defined userchoice_progid exit /b 0
if /i "%userchoice_progid:~0,6%" neq "MSEdge" exit /b 0
echo removing stale Edge UserChoice: "%~1" (%userchoice_progid%) %cll_dbg%
reg delete "%~1" /f >NUL 2>&1
if not errorlevel 1 exit /b 0
echo resetting protected UserChoice ACL: "%~1" %cll_dbg%
set "userchoice_key=%~1"
powershell -noprofile -c "$subkey = $env:userchoice_key.Substring($env:userchoice_key.IndexOf('\') + 1); $rights = [System.Security.AccessControl.RegistryRights]::ReadPermissions -bor [System.Security.AccessControl.RegistryRights]::ChangePermissions; $key = [Microsoft.Win32.Registry]::Users.OpenSubKey($subkey, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, $rights); if ($key) { $acl = $key.GetAccessControl(); $rules = @($acl.GetAccessRules($true, $false, [System.Security.Principal.NTAccount])); foreach ($rule in $rules) { if ($rule.AccessControlType -eq 'Deny' -and -not $rule.IsInherited) { [void]$acl.RemoveAccessRuleSpecific($rule) } }; $key.SetAccessControl($acl); $key.Close() }" 2>NUL
reg delete "%~1" /f
if errorlevel 1 set "userchoice_cleanup_failed=1"
exit /b 0

:userchoice_capture_value
if /i "%~1" neq "ProgId" exit /b 0
set "userchoice_progid=%~2"
exit /b 0


REM =====  PowerShell(psl) based complex functions  =====
REM see RemoveMSEdgeAll.bat for details


REM get access and delete registry keys in HKLM hive
REM keys for TakeOwn+FullControl ONLY should be in reg_HKLM_keys_acs var
REM keys that also should be deleted - in reg_HKLM_keys_del var
REM DO NOT pass keys with values at tail
REM TakeOwn+FullControl operation may fails, but removing attempt will be made anyway
:reg_HKLM_keys_access_and_delete
echo [reg_HKLM_keys_access_and_delete()] %cll_dbg%
if defined reg_HKLM_keys_acs goto _reg_HKLM_keys_access_and_delete.psl
if not defined reg_HKLM_keys_del goto _reg_HKLM_keys_access_and_delete.end
:_reg_HKLM_keys_access_and_delete.psl
echo [reg_HKLM_keys_access_and_delete().psl] %cll_dbg%
echo ;^
if ($env:reg_HKLM_keys_acs) { $key_paths_acs = $env:reg_HKLM_keys_acs.Trim().Split([string[]]"\\", [StringSplitOptions]::RemoveEmptyEntries) }^
if ($env:reg_HKLM_keys_del) { $key_paths_del = $env:reg_HKLM_keys_del.Trim().Split([string[]]"\\", [StringSplitOptions]::RemoveEmptyEntries) }^
$key_paths_acs += $key_paths_del;^
if (!$key_paths_acs) { exit }^
$user_ident = [System.Security.Principal.NTAccount]$env:UserName;^
$access_rule = [System.Security.AccessControl.RegistryAccessRule]::new($user_ident, 0xF003F, 3, 0, 0);^
$hive_HKLM = [Microsoft.Win32.Registry]::LocalMachine;^
$ntdll = Add-Type -Member '[DllImport("ntdll.dll")] public static extern int RtlAdjustPrivilege(uint p, bool e, bool t, ref bool l);' -Name NtDll -PassThru;^
$lp = 0; $tgl_rslt = $ntdll::RtlAdjustPrivilege(9, 1, 0, [ref]$lp);^
;^
if ($tgl_rslt -eq 0) {^
	"accessing"%psl_dbg%;^
	foreach ($key_path in $key_paths_acs) {^
		$key_path%psl_dbg%;^
		$key_obj = $hive_HKLM.OpenSubKey($key_path, 2, 0x80000);^
		if (!$key_obj) { "key not found"%psl_dbg%; continue };^
		^
		($acl = $key_obj.GetAccessControl()).SetOwner($user_ident);^
		$key_obj.SetAccessControl($acl);^
		$acl.AddAccessRule($access_rule);^
		$key_obj.SetAccessControl($acl);^
		$key_obj.Close();^
	}^
	$ntdll::RtlAdjustPrivilege(9, $lp, 0, [ref]$lp);^
} else { "TakeOwnership enabling failed (0x{0:x8}); attempt to remove anyway" -f $tgl_rslt%psl_dbg% }^
;"removing"%psl_dbg%;^
foreach ($key_path in $key_paths_del) { $key_path%psl_dbg%; $hive_HKLM.DeleteSubKeyTree($key_path) }^
;| powershell -noprofile - 

:_reg_HKLM_keys_access_and_delete.end
echo [reg_HKLM_keys_access_and_delete().end] %cll_dbg%
exit /b 0


REM unlock and delete all packages from the list
REM list should be in pkgs_list var
REM System.Data.SQLite.dll should be ready to use
:appx_unlock_and_delete
echo [appx_unlock_and_delete()] %cll_dbg%
if not defined pkgs_list goto _appx_unlock_and_delete.end
:_appx_unlock_and_delete.psl
echo [appx_unlock_and_delete().psl] %cll_dbg%
echo function main() {^
	$pkgs = $env:pkgs_list.Split(' ', [StringSplitOptions]::RemoveEmptyEntries);^
	if ($pkgs.Count -eq 0) { "empty packages list"%psl_dbg%; return }^
	$locked_pkgs, $pkgs = $pkgs.Where({$_[0] -eq '1'}, 'Split');^
	$locked_pkgs = $locked_pkgs.ForEach({$_.Substring(1)});^
	$pkgs = $pkgs.ForEach({$_.Substring(1)});^
	^
	if ($env:reg_SFT_paths_scn) { $reg_sft_paths_scn = $env:reg_SFT_paths_scn.Trim().Split([string[]]"\\", [StringSplitOptions]::RemoveEmptyEntries) }^
	if ($env:reg_CLS_paths_scn) { $reg_cls_paths_scn = $env:reg_CLS_paths_scn.Trim().Split([string[]]"\\", [StringSplitOptions]::RemoveEmptyEntries) }^
	if ($reg_sft_paths_scn -or $reg_cls_paths_scn) {^
		$usids_exclude = @('S-1-5-18', 'S-1-5-19', 'S-1-5-20');^
		$reg_usrs_hives = (reg query "$env:REG_USERS_PATH" /k /f "*").ForEach({$_.Substring($_.LastIndexOf('\')+1)}).Where({$_.StartsWith('S-1-') -and -not $usids_exclude.Contains($_)});^
		$reg_sft_hives = ($reg_usrs_hives.ForEach({"HKU\$_\SOFTWARE\"})) + @('HKU\.DEFAULT\SOFTWARE\', 'HKLM\SOFTWARE\');^
		$reg_cls_hives = ($reg_usrs_hives.ForEach({"HKU\$_`_Classes\"})) + @('HKU\.DEFAULT\SOFTWARE\Classes\', 'HKLM\SOFTWARE\Classes\');^
	}^
	^
	if ($locked_pkgs.Count -gt 0) {^
		Add-Type -Path $env:file_SQLite;^
		$attempts = 3; $rslt = $false;^
		while ($attempts) { --$attempts; Unlock-Packages $locked_pkgs ([ref]$rslt); if ($rslt) { break }; Start-Sleep 3 }^
		if ($rslt) { $pkgs += $locked_pkgs } else { "package(s) still locked, exclude:`n" + ($locked_pkgs -join "`n")%psl_dbg% }^
	}^
	Start-Service StateRepository -ErrorAction SilentlyContinue;^
	^
	"removing"%psl_dbg%;^
	foreach ($pkg in $pkgs) {^
		"package: $pkg`nremove"%psl_dbg%;^
		$pkg_objects = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue);^
		$pkg_obj = $pkg_objects.Where({$_.PackageFullName -eq $pkg}, 'First');^
		$pkg_family = if ($pkg_obj.Count -gt 0) { $pkg_obj[0].PackageFamilyName } else { $null };^
		if ($pkg_family -and (Get-Command Set-NonRemovableAppsPolicy -ErrorAction SilentlyContinue)) {^
			try { Set-NonRemovableAppsPolicy -Online -PackageFamilyName $pkg_family -NonRemovable 0 -ErrorAction Stop; "package policy unlocked"%psl_dbg% }^
			catch { "package policy unlock failed: $($_.Exception.Message)"%psl_dbg% }^
		}^
		Remove-AppxPackage -Package $pkg -User $env:USER_SID;^
		Remove-AppxPackage -Package $pkg -User 'S-1-5-18' -ErrorAction SilentlyContinue;^
		Remove-AppxPackage -Package $pkg -AllUsers;^
		^
		$pkg_parts = $pkg.Split('_');^
		foreach ($reg_sft_hive in $reg_sft_hives) { reg delete "$reg_sft_hive`Microsoft\UserData\UninstallTimes" /v "$($pkg_parts[0])_$($pkg_parts[4])" /f }^
		RegCleanup-Package($pkg_parts);^
		$edge_chnl_pos = $pkg_parts[0].IndexOf('.MicrosoftEdge.');^
		if ($edge_chnl_pos -ge 0) {^
			"cleanup of base package"%psl_dbg%;^
			$pkg_parts[0] = $pkg_parts[0].Substring(0, $edge_chnl_pos + 14);^
			RegCleanup-Package $pkg_parts;^
		}^
		^
		"deprovision"%psl_dbg%;^
		reg add "$env:REG_APPX_STORE\EndOfLife\$env:USER_SID\$pkg" /f;^
		reg add "$env:REG_APPX_STORE\EndOfLife\S-1-5-18\$pkg" /f;^
		reg add "$env:REG_APPX_STORE\Deprovisioned\$pkg" /f;^
	}^
}^
function Unlock-Packages($pkgs, [ref]$rslt) {^
	"[Unlock-Packages()]`nstopping services"%psl_dbg%;^
	$rslt.Value = $false;^
	Stop-Service StateRepository -Force;^
	^
	"acessing db files"%psl_dbg%;^
	takeown /f "$env:LOC_APPREPO_DB";^
	takeown /f "$env:LOC_APPREPO_DB`-shm";^
	takeown /f "$env:LOC_APPREPO_DB`-wal";^
	icacls "$env:LOC_APPREPO_DB*" /grant "$env:UserName`:F" /c;^
	^
	"unlocking"%psl_dbg%;^
	$con = [System.Data.SQLite.SQLiteConnection]::new("Data Source=$env:LOC_APPREPO_DB");^
	$con.Open();^
	$cmd = $con.CreateCommand();^
	$cmd.CommandText = "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='Package' AND name LIKE'%%AFTER%%' AND name LIKE'%%UPDATE%%'";^
	$res = $cmd.ExecuteReader();^
	$trgs = @{};^
	while ($res.Read()) { $trgs[$res.GetString(0)] = $res.GetString(1) } $res.Close();^
	^
	try {^
		foreach ($trg_name in $trgs.Keys) { $cmd.CommandText = "DROP TRIGGER $trg_name"; $cmd.ExecuteNonQuery() }^
		foreach ($pkg in $pkgs) {^
			"package: $pkg"%psl_dbg%;^
			$cmd.CommandText = "UPDATE Package SET IsInbox=0 WHERE PackageFullName='$pkg'"; $cmd.ExecuteNonQuery();^
			reg delete "$env:REG_APPX_STORE\InboxApplications\$pkg" /f;^
		}^
		foreach ($trg_query in $trgs.Values) { $cmd.CommandText = $trg_query; $cmd.ExecuteNonQuery() }^
		"unlocked"%psl_dbg%;^
		$rslt.Value = $true^
	}^
	catch { $_%psl_dbg%; "unlocking failed"%psl_dbg% }^
	^
	$con.Close();^
	"[Unlock-Packages().end]"%psl_dbg%^
}^
function RegCleanup-Package($pkg_fname_parts) {^
	"[RegCleanup-Package()]`nregistry scan"%psl_dbg%;^
	$pkg_name = $pkg_fname_parts[0] + '_';^
	$pkg_pid = '_' + $pkg_fname_parts[4];^
	$reg_pkg_keys = @();^
	foreach ($reg_sft_hive in $reg_sft_hives) {^
		foreach ($reg_sft_path in $reg_sft_paths_scn) {^
			$reg_pkg_keys += (reg query "$reg_sft_hive$reg_sft_path" /s /f $pkg_name /k).Where({$_.StartsWith('HKEY_') -and $_.Contains($pkg_pid)});^
		}^
	}^
	foreach ($reg_cls_hive in $reg_cls_hives) {^
		foreach ($reg_cls_path in $reg_cls_paths_scn) {^
			$reg_pkg_keys += (reg query "$reg_cls_hive$reg_cls_path" /s /f $pkg_name /k).Where({$_.StartsWith('HKEY_') -and $_.Contains($pkg_pid)});^
		}^
	}^
	$reg_pkg_keys += (reg query "$env:REG_APPX_STORE" /s /f $pkg_name /k).Where({$_.StartsWith('HKEY_') -and $_.Contains($pkg_pid)});^
	$reg_pkg_keys += (reg query "$env:REG32_APPX_STORE" /s /f $pkg_name /k).Where({$_.StartsWith('HKEY_') -and $_.Contains($pkg_pid)});^
	^
	"registry cleanup"%psl_dbg%;^
	foreach ($reg_pkg_key in $reg_pkg_keys) { $reg_pkg_key%psl_dbg%; reg delete $reg_pkg_key /f }^
	"[RegCleanup-Package().end]"%psl_dbg%;^
}^
main;^
;| powershell -noprofile - 

call :_appx_remove_as_system

:_appx_unlock_and_delete.end
echo [appx_unlock_and_delete().end] %cll_dbg%
exit /b 0

:_appx_remove_as_system
echo [appx_remove_as_system()] %cll_dbg%
echo function main() {^
	$pkgs = $env:pkgs_list.Split(' ', [StringSplitOptions]::RemoveEmptyEntries).ForEach({$_.Substring(1)});^
	$all_appx = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue);^
	$pkgs = $pkgs.Where({ $pkg = $_; $all_appx.Where({$_.PackageFullName -eq $pkg}, 'First').Count -gt 0 });^
	if ($pkgs.Count -eq 0) { "no staged packages remain"%psl_dbg%; return };^
	$task_id = [guid]::NewGuid().ToString('N');^
	$task_name = "RemoveMSEdgeAppx-$task_id";^
	$pkg_expr = '@(' + ($pkgs.ForEach({ "'" + $_.Replace("'", "''") + "'" }) -join ',') + ')';^
	$task_script = ('$ErrorActionPreference = ''Continue''' + [Environment]::NewLine + '$pkgs = __PKGS__' + [Environment]::NewLine + 'Start-Service StateRepository -ErrorAction SilentlyContinue; Start-Service AppXSvc -ErrorAction SilentlyContinue' + [Environment]::NewLine + 'foreach ($pkg in $pkgs) { $appx = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue); $appx = $appx.Where({$_.PackageFullName -eq $pkg}, ''First''); if ($appx.Count -eq 0) { continue }; $family = $appx[0].PackageFamilyName; if (Get-Command Set-NonRemovableAppsPolicy -ErrorAction SilentlyContinue) { Set-NonRemovableAppsPolicy -Online -PackageFamilyName $family -NonRemovable 0 -ErrorAction SilentlyContinue }; Remove-AppxPackage -Package $pkg -ErrorAction SilentlyContinue; Remove-AppxPackage -Package $pkg -AllUsers -ErrorAction SilentlyContinue }').Replace('__PKGS__', $pkg_expr);^
	$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($task_script));^
	$registered = $false;^
	try {^
		$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded";^
		$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;^
		$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1);^
		$null = Register-ScheduledTask -TaskName $task_name -Action $action -Principal $principal -Trigger $trigger -Force;^
		$registered = $true;^
		$run_started_at = (Get-Date).AddSeconds(-2);^
		Start-ScheduledTask -TaskName $task_name;^
		$started = $false;^
		$deadline = (Get-Date).AddSeconds(60);^
		while ((Get-Date) -lt $deadline) {^
			$task = Get-ScheduledTask -TaskName $task_name -ErrorAction SilentlyContinue;^
			$info = Get-ScheduledTaskInfo -TaskName $task_name -ErrorAction SilentlyContinue;^
			if ($task.State -eq 'Running') { $started = $true };^
			if ($info.LastRunTime -ge $run_started_at) { $started = $true };^
			if ($started -and $task.State -ne 'Running') { break };^
			Start-Sleep -Milliseconds 500^
		};^
		if ($started -and $task.State -ne 'Running') { "SYSTEM staged cleanup task completed; result: $($info.LastTaskResult)"%psl_dbg% } else { "SYSTEM staged cleanup task timed out"%psl_dbg% }^
	} catch { "SYSTEM staged cleanup failed: $($_.Exception.Message)"%psl_dbg% } finally {^
		if ($registered) { Stop-ScheduledTask -TaskName $task_name -ErrorAction SilentlyContinue };^
		if ($registered) { Unregister-ScheduledTask -TaskName $task_name -Confirm:$false -ErrorAction SilentlyContinue };^
	}^
	Start-Sleep -Seconds 2;^
	$all_appx = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue);^
	foreach ($pkg in $pkgs) {^
		$remaining = $all_appx.Where({$_.PackageFullName -eq $pkg});^
		if ($remaining.Count -eq 0) { "package removed: $pkg"%psl_dbg% } else { "package still present: $pkg"%psl_dbg%; foreach ($info in $remaining) { "NonRemovable: $($info.NonRemovable); PackageUserInformation: $($info.PackageUserInformation)"%psl_dbg% } }^
	}^
}^
main;^
;| powershell -noprofile -
echo [appx_remove_as_system().end] %cll_dbg%
exit /b 0

:help
echo.
echo %~nx0 - remove Microsoft Edge while preserving WebView2 Runtime.
echo.
echo Usage: %~nx0 [option]
echo.
echo Options:
echo   -guard  Check for Edge browser files or Edge AppX before continuing.
echo           Exit when Edge is not detected; intended for scheduled tasks.
echo   -userchoice  Only remove stale MSEdge UserChoice/UserChoiceLatest entries.
echo   -auto   Skip the built-in Administrator confirmation when already elevated.
echo   -help   Show this help and exit without UAC, network, or cleanup actions.
echo   -h      Alias for -help.
echo(  /?      Alias for -help.
echo.
echo Default behavior removes Edge and Edge AppX, but keeps WebView2 Runtime,
echo EdgeCore, EdgeUpdate, and shared Edge Update tasks and services.
echo Use RemoveMSEdgeAll.bat when those shared WebView2 components must be removed.
exit /b 0
