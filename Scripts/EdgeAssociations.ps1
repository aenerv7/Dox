[CmdletBinding()]
param(
    [ValidateSet('Audit', 'Repair', 'Cleanup')][string]$Mode = 'Audit',
    [string]$UserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
    [string]$BackupDirectory,
    [string[]]$LegacyLog,
    [string]$ReportPath
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($BackupDirectory)) {
    $BackupDirectory = Join-Path -Path $PSScriptRoot -ChildPath 'RemoveMSEdge-backups'
}
if ($null -eq $LegacyLog -or $LegacyLog.Count -eq 0) {
    $LegacyLog = @(
        (Join-Path -Path $PSScriptRoot -ChildPath 'RemoveMSEdge_dbg.log'),
        (Join-Path -Path $PSScriptRoot -ChildPath 'RemoveMSEdgeAll_dbg.log')
    )
}

function Get-EdgeKeyAcl($Key) {
    if ($PSVersionTable.PSEdition -eq 'Core') { return [Microsoft.Win32.RegistryAclExtensions]::GetAccessControl($Key) }
    return $Key.GetAccessControl()
}

function Set-EdgeKeyAcl($Key, $Acl) {
    if ($PSVersionTable.PSEdition -eq 'Core') { [Microsoft.Win32.RegistryAclExtensions]::SetAccessControl($Key, $Acl) }
    else { $Key.SetAccessControl($Acl) }
}

function Get-EdgeAccessSddl($Acl) {
    return $Acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
}

function Get-EdgeLegacyChoicePaths([string[]]$Logs, [string]$Sid) {
    # Logs are evidence only. Only exact, known file-association child paths are
    # accepted; no commands or arbitrary registry paths can come from a log.
    $pattern = '(?im)^resetting protected UserChoice ACL: "HKEY_USERS\\' + [regex]::Escape($Sid) + '\\(SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\[^\\\r\n"]+\\UserChoice)"[ \t\r]*$'
    $paths = @()
    foreach ($log in $Logs) {
        if (-not [IO.File]::Exists($log)) { continue }
        foreach ($match in [regex]::Matches([IO.File]::ReadAllText($log), $pattern)) { $paths += $match.Groups[1].Value }
    }
    return @($paths | Sort-Object -Unique)
}

function Test-EdgeLegacyParentAcl($Acl, [string]$Sid) {
    # Exact observed damage signature, not a general-purpose ACL reset.
    $signature = 'D:P(A;CI;KR;;;WD)(A;CI;KR;;;RC)(A;CI;KA;;;SY)(A;CI;KA;;;BA)(A;CI;KR;;;AC)(A;CI;KR;;;S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-3232135806-4053264122-3456934681)'
    # Windows may retain AUTO_INHERITED on an otherwise identical protected DACL.
    $access = (Get-EdgeAccessSddl $Acl) -replace '^D:PAI', 'D:P'
    return $Acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $Sid -and $access -eq $signature
}

function Test-EdgeInheritedWriteSource($Acl, [string]$Sid) {
    $fullControl = $false
    foreach ($rule in $Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Deny') { return $false }
        if ($rule.IdentityReference.Value -eq $Sid -and
            ($rule.RegistryRights -band [Security.AccessControl.RegistryRights]::FullControl) -eq [Security.AccessControl.RegistryRights]::FullControl -and
            ($rule.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ContainerInherit) -ne 0 -and
            $rule.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None) { $fullControl = $true }
    }
    return $fullControl
}

function Get-EdgeChoiceState($Key) {
    $direct = [string]$Key.GetValue('ProgId', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $hash = [string]$Key.GetValue('Hash', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $nested = ''; $nestedHash = ''
    $child = $Key.OpenSubKey('ProgId')
    if ($child) {
        try {
            $nested = [string]$child.GetValue('ProgId', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            $nestedHash = [string]$child.GetValue('Hash', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        } finally { $child.Dispose() }
    }
    return [pscustomobject]@{ Direct = $direct; Nested = $nested; Hash = $hash; NestedHash = $nestedHash }
}

function Get-EdgeHandlerState($UserRoot, $MachineClasses, [string]$ProgId) {
    # Never evaluate shell commands or search for arbitrary programs on PATH.
    if ($ProgId -notmatch '^MSEdge[A-Za-z0-9._-]*$') { return 'Unknown' }
    $command = $null
    foreach ($source in @(@($UserRoot, 'Software\Classes\'), @($MachineClasses, ''))) {
        if ($null -eq $source[0]) { continue }
        $key = $source[0].OpenSubKey($source[1] + $ProgId + '\shell\open\command')
        if ($key) {
            try {
                if ($key.GetValueNames() -contains 'DelegateExecute') { return 'Unknown' }
                $command = [string]$key.GetValue('', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            } finally { $key.Dispose() }
            if (-not [string]::IsNullOrWhiteSpace($command)) { break }
        }
    }
    if ([string]::IsNullOrWhiteSpace($command)) { return 'Missing' }
    # An expanded environment variable could belong to a different (offline) user.
    if ($command -match '^\s*"([A-Za-z]:\\[^"\r\n]+\.exe)"(?:\s|$)') { $exe = $Matches[1] }
    elseif ($command -match '^\s*([A-Za-z]:\\[^\s"\r\n]+\.exe)(?:\s|$)') { $exe = $Matches[1] }
    else { return 'Unknown' }
    if ($exe.Contains('%')) { return 'Unknown' }
    try {
        $item = Get-Item -LiteralPath $exe -ErrorAction Stop
        if ($item.PSIsContainer) { return 'Unknown' }
        return 'Installed'
    } catch [System.Management.Automation.ItemNotFoundException] { return 'Missing' }
    catch { return 'Unknown' }
}

function Save-EdgeAssociationBackup([string]$Directory, [string]$Sid, [string]$Path, [string]$Action, $State) {
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($Directory))
    $file = Join-Path $Directory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.json')
    $record = [ordered]@{ Version = 1; Utc = [DateTime]::UtcNow.ToString('o'); UserSid = $Sid; Path = $Path; Action = $Action; Before = $State }
    $json = $record | ConvertTo-Json -Depth 10
    $stream = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    return $file
}

function Repair-EdgeAssociationParent($UserRoot, [string]$Path, [string]$Sid, $ParentAcl, [string]$Directory) {
    $rights = [Security.AccessControl.RegistryRights]::ReadPermissions -bor [Security.AccessControl.RegistryRights]::ChangePermissions
    $key = $UserRoot.OpenSubKey($Path, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, $rights)
    if (-not $key) { throw "Association disappeared: $Path" }
    try {
        $before = Get-EdgeKeyAcl $key
        if (-not (Test-EdgeLegacyParentAcl $before $Sid)) { throw "ACL changed since inspection; leaving $Path unchanged" }
        if (-not (Test-EdgeInheritedWriteSource $ParentAcl $Sid)) { throw "Parent has no safe inheritable user permissions: $Path" }
        $sddl = Get-EdgeAccessSddl $before
        $backup = Save-EdgeAssociationBackup $Directory $Sid $Path 'RestoreParentInheritance' @{ AccessSddl = $sddl }
        $replacement = [Security.AccessControl.RegistrySecurity]::new()
        $replacement.SetSecurityDescriptorSddlForm((Get-EdgeAccessSddl $ParentAcl), [Security.AccessControl.AccessControlSections]::Access)
        $replacement.SetAccessRuleProtection($false, $false)
        try {
            Set-EdgeKeyAcl $key $replacement
            $after = Get-EdgeKeyAcl $key
            if ($after.AreAccessRulesProtected -or -not (Test-EdgeInheritedWriteSource $after $Sid)) { throw 'ACL verification failed' }
        } catch {
            $failure = $_
            $rollback = [Security.AccessControl.RegistrySecurity]::new()
            $rollback.SetSecurityDescriptorSddlForm($sddl, [Security.AccessControl.AccessControlSections]::Access)
            try { Set-EdgeKeyAcl $key $rollback }
            catch { throw "Repair AND rollback failed for $Path. Backup: $backup. $failure ; $_" }
            throw "Repair failed; original permissions restored for $Path. $failure"
        }
        return $backup
    } finally { $key.Dispose() }
}

function Remove-EdgeUnhashedChoice($UserRoot, [string]$Path, [string]$Sid, $Expected, [string]$Directory) {
    # One value deletion is atomic. Never DeleteSubKeyTree: a protected nested
    # choice could otherwise be only partially deleted. Never alter a DACL here.
    $key = $UserRoot.OpenSubKey($Path)
    if (-not $key) { throw "Choice disappeared: $Path" }
    try {
        $current = Get-EdgeChoiceState $key
        if (($current | ConvertTo-Json -Compress) -cne ($Expected | ConvertTo-Json -Compress)) { throw "Choice changed: $Path" }
        if ($current.Hash -or $current.NestedHash -or ($current.Direct -and $current.Nested) -or
            (($current.Direct + $current.Nested) -notmatch '^MSEdge[A-Za-z0-9._-]*$')) { throw "Not an unprotected Edge choice: $Path" }
        $target = if ($current.Direct) { $Path } else { $Path + '\ProgId' }
        $backup = Save-EdgeAssociationBackup $Directory $Sid $Path 'RemoveUnhashedEdgeProgId' $current
        $writer = $UserRoot.OpenSubKey($target, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, [Security.AccessControl.RegistryRights]::SetValue)
        if (-not $writer) { throw "Choice disappeared: $target" }
        try {
            # Re-read both locations and hashes after obtaining the write handle.
            $last = Get-EdgeChoiceState $key
            if (($last | ConvertTo-Json -Compress) -cne ($Expected | ConvertTo-Json -Compress)) { throw "Choice changed before removal: $Path" }
            $writer.DeleteValue('ProgId', $false)
        } finally { $writer.Dispose() }
        return $backup
    } finally { $key.Dispose() }
}

function Invoke-EdgeAssociationMaintenance($UserRoot, $MachineClasses, [string]$Sid, [string]$Action, [string]$Directory, [string[]]$LegacyChoicePaths = @()) {
    $findings = [Collections.Generic.List[object]]::new()
    $scannedParents = 0; $scannedChoices = 0
    $scopes = @('Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts', 'Software\Microsoft\Windows\Shell\Associations\UrlAssociations')
    foreach ($scope in $scopes) {
        $root = $null
        try {
            $root = $UserRoot.OpenSubKey($scope)
            if (-not $root) { continue }
            $parentAcl = Get-EdgeKeyAcl $root
            foreach ($name in $root.GetSubKeyNames()) {
                $path = $scope + '\' + $name
                try {
                    $entry = $UserRoot.OpenSubKey($path)
                    if (-not $entry) { continue }
                    $scannedParents++
                    try {
                        $acl = Get-EdgeKeyAcl $entry
                        if (Test-EdgeLegacyParentAcl $acl $Sid) {
                            $status = 'NeedsParentRepair'; $backup = $null
                            if ($Action -eq 'Repair') {
                                $backup = Repair-EdgeAssociationParent $UserRoot $path $Sid $parentAcl $Directory
                                $status = 'ParentRepaired'
                            }
                            $findings.Add([pscustomobject]@{ Path = $path; Status = $status; Backup = $backup })
                        } elseif ($acl.AreAccessRulesProtected -or -not (Test-EdgeInheritedWriteSource $acl $Sid)) {
                            $findings.Add([pscustomobject]@{ Path = $path; Status = 'ReviewCustomParentAcl'; Detail = 'No automatic changes to unrecognized permissions.' })
                        }
                        foreach ($choiceName in @('UserChoice', 'UserChoiceLatest')) {
                            $choicePath = $path + '\' + $choiceName
                            $choice = $entry.OpenSubKey($choiceName)
                            if (-not $choice) { continue }
                            $scannedChoices++
                            try {
                                $state = Get-EdgeChoiceState $choice
                                # Missing standard denial can be an old cleanup residue,
                                # but without an original ACL it cannot be reconstructed safely.
                                # URL UserChoice ACLs differ from file associations;
                                # missing denial alone is not proof of damaged permissions.
                                if ($LegacyChoicePaths -contains $choicePath -and $choiceName -eq 'UserChoice' -and $state.Hash -and $state.Direct) {
                                    $choiceAcl = Get-EdgeKeyAcl $choice
                                    $deny = @($choiceAcl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]) | Where-Object {
                                        $_.IdentityReference.Value -eq $Sid -and $_.AccessControlType -eq 'Deny' -and
                                        ($_.RegistryRights -band [Security.AccessControl.RegistryRights]::SetValue) -ne 0
                                    })
                                    if ($deny.Count -eq 0) { $findings.Add([pscustomobject]@{ Path = $choicePath; Status = 'ReviewLegacyChoiceAcl'; Detail = 'Old log records an ACL edit attempt on this file choice; user SetValue denial is absent. Original ACL needed; selection preserved.' }) }
                                }
                            } finally { $choice.Dispose() }
                            $ids = @(@($state.Direct, $state.Nested) | Where-Object { $_ })
                            if (@($ids | Where-Object { $_ -match '^MSEdge' }).Count -eq 0) { continue }
                            if (@($ids).Count -ne 1) { $findings.Add([pscustomobject]@{Path=$choicePath; Status='AmbiguousChoice'}); continue }
                            $handler = Get-EdgeHandlerState $UserRoot $MachineClasses $ids[0]
                            if ($handler -eq 'Installed') { continue }
                            $status = if ($handler -eq 'Unknown') { 'UnknownHandler' } elseif ($state.Hash -or $state.NestedHash) { 'ProtectedChoice' } else { 'StaleUnhashedChoice' }
                            $backup = $null
                            if ($Action -eq 'Cleanup' -and $status -eq 'StaleUnhashedChoice') {
                                $backup = Remove-EdgeUnhashedChoice $UserRoot $choicePath $Sid $state $Directory
                                $status = 'ChoiceRemoved'
                            }
                            $findings.Add([pscustomobject]@{ Path=$choicePath; Status=$status; ProgId=$ids[0]; Backup=$backup })
                        }
                    } finally { $entry.Dispose() }
                } catch { $findings.Add([pscustomobject]@{ Path=$path; Status='Error'; Detail=$_.Exception.Message }) }
            }
        } catch { $findings.Add([pscustomobject]@{ Path=$scope; Status='Error'; Detail=$_.Exception.Message }) }
        finally { if ($root) { $root.Dispose() } }
    }
    $errors = @($findings | Where-Object Status -eq 'Error').Count
    $pending = @($findings | Where-Object { $_.Status -notin @('Error','ParentRepaired','ChoiceRemoved') }).Count
    $code = if ($errors) { 1 } elseif ($pending) { 2 } else { 0 }
    return [pscustomobject]@{ UserSid=$Sid; Mode=$Action; ScannedParents=$scannedParents; ScannedChoices=$scannedChoices; Errors=$errors; Pending=$pending; ExitCode=$code; Findings=@($findings.ToArray()) }
}

if ($MyInvocation.InvocationName -ne '.') {
    $user = $null; $machine = $null
    try {
        if ($UserSid -notmatch '^(S-1-\d+(?:-\d+)+|\.DEFAULT)$') { throw 'Invalid user SID' }
        $user = [Microsoft.Win32.Registry]::Users.OpenSubKey($UserSid)
        if (-not $user) { throw "User hive is not loaded: $UserSid" }
        $machine = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('Software\Classes')
        $legacyPaths = @(Get-EdgeLegacyChoicePaths $LegacyLog $UserSid)
        $result = Invoke-EdgeAssociationMaintenance $user $machine $UserSid $Mode $BackupDirectory $legacyPaths
        foreach ($finding in $result.Findings) { Write-Host ($finding | ConvertTo-Json -Compress) }
        Write-Host "Associations: parents=$($result.ScannedParents), choices=$($result.ScannedChoices), errors=$($result.Errors), pending=$($result.Pending), exit=$($result.ExitCode). Protected choices require Windows Default Apps; no protection is disabled."
        if ($ReportPath) { $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
        exit $result.ExitCode
    } catch {
        $failure = $_.Exception.Message
        Write-Host "Association maintenance failed: $failure"
        if ($ReportPath) { @{UserSid=$UserSid; Mode=$Mode; Errors=1; ExitCode=1; Error=$failure} | ConvertTo-Json | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
        exit 1
    }
    finally { if ($user) { $user.Dispose() }; if ($machine) { $machine.Dispose() } }
}
