[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temp = Join-Path ([IO.Path]::GetTempPath()) ('Dox Edge BAT Tests ' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
try {
    foreach ($name in 'RemoveMSEdge.bat','RemoveMSEdgeAll.bat') {
        $content = [IO.File]::ReadAllText((Join-Path $source $name))
        $labels = @([regex]::Matches($content, '(?m)^:([A-Za-z0-9_.]+)\s*$') | ForEach-Object { $_.Groups[1].Value })
        if (@($labels | Group-Object | Where-Object Count -gt 1).Count) { throw "Duplicate labels: $name" }
        $commands = [regex]::Replace($content, '(?im)^\s*(?:REM\b|::)[^\r\n]*', '')
        foreach ($match in [regex]::Matches($commands, '(?im)\b(?:goto\s+|call\s+:)([A-Za-z0-9_.]+)')) {
            if ($commands[$match.Index + $match.Length] -eq '%') { continue } # Existing architecture-specific dispatch.
            if ($match.Groups[1].Value -notin $labels -and $match.Groups[1].Value -ne 'label') { throw "Missing label: $($match.Value)" }
        }
        foreach ($match in [regex]::Matches($content, '(?m)^powershell -noprofile -c "(.*)"(?:\s.*)?$')) { [void][scriptblock]::Create($match.Groups[1].Value) }
        if ($content.Contains('resetting protected UserChoice ACL')) { throw 'Old unsafe ACL fallback remains' }
        if (-not $content.Contains('if not "%association_cleanup_failed%" equ "0" exit /b 2')) { throw 'Full run suppresses association failure' }
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $temp $name)
    }
    $stub = Join-Path $temp 'EdgeAssociations.ps1'
    '[CmdletBinding()]param([string]$Mode,[string]$UserSid); Write-Output ("HELPER_MODE="+$Mode); exit 7' | Set-Content -LiteralPath $stub -Encoding UTF8
    foreach ($name in 'RemoveMSEdge.bat','RemoveMSEdgeAll.bat') {
        foreach ($mode in @(@('-audit-associations','Audit'),@('-repair-associations','Repair'))) {
            $command = 'call "' + (Join-Path $temp $name) + '" ' + $mode[0]
            $output = & $env:ComSpec /d /c $command 2>&1 | Out-String
            if ($LASTEXITCODE -ne 7 -or -not $output.Contains('HELPER_MODE='+$mode[1])) { throw "Incorrect mode dispatch/exit status: $name $output" }
            if ($output -match 'Obtaining required files|Cleaning stale Edge|\[uac') { throw 'Maintenance mode entered uninstall preparation' }
        }
        $content = [IO.File]::ReadAllText((Join-Path $temp $name))
        $routine = [regex]::Match($content, '(?ms)^:userchoice_cleanup\r?\n.*?^exit /b %userchoice_result%').Value
        if (-not $routine) { throw 'Cannot isolate association cleanup routine' }
        $harness = Join-Path $temp 'routine-test.bat'
        $header = "@echo off`r`nsetlocal`r`nset association_cleanup_failed=0`r`ncall :userchoice_cleanup S-1-5-21-1-2-3-1001`r`nset result=%errorlevel%`r`necho FAILURE_FLAG=%association_cleanup_failed%`r`nexit /b %result%`r`n"
        [IO.File]::WriteAllText($harness, $header + $routine, [Text.Encoding]::ASCII)
        $output = & $env:ComSpec /d /c ('call "' + $harness + '"') 2>&1 | Out-String
        if ($LASTEXITCODE -ne 7 -or -not $output.Contains('HELPER_MODE=Cleanup') -or -not $output.Contains('FAILURE_FLAG=1')) { throw "Cleanup failure was lost: $name $output" }
    }
    Remove-Item -LiteralPath $stub
    foreach ($name in 'RemoveMSEdge.bat','RemoveMSEdgeAll.bat') {
        $command = 'call "' + (Join-Path $temp $name) + '" -help'
        $output = & $env:ComSpec /d /c $command 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0 -or -not $output.Contains('-repair-associations')) { throw 'Help requires a helper or omits recovery options' }
        $command = 'call "' + (Join-Path $temp $name) + '" -audit-associations'
        $output = & $env:ComSpec /d /c $command 2>&1 | Out-String
        if ($LASTEXITCODE -ne 1 -or -not $output.Contains('Missing EdgeAssociations.ps1')) { throw 'Missing helper does not fail before side effects' }
    }
    Write-Host 'PASS both BAT entry points: dispatch, exit propagation, missing helper, help, labels and syntax. No uninstall was run.'
} finally {
    $resolved = [IO.Path]::GetFullPath($temp)
    if (-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'Dox Edge BAT Tests *') { throw 'Unsafe test cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

