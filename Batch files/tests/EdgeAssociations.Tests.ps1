[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\EdgeAssociations.ps1')
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$testPath = 'Software\Dox.EdgeAssociations.Tests\' + [guid]::NewGuid().ToString('N')
$testRoot = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($testPath)
$temp = Join-Path ([IO.Path]::GetTempPath()) ('Dox.EdgeAssociations.Tests-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
$scope = 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts'
$passed = 0

function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function New-Case([string]$Name) {
    $root = $testRoot.CreateSubKey($Name)
    $key = $root.CreateSubKey($scope); $key.Dispose()
    return $root
}
function New-Choice($Root, [string]$Name, [string]$ProgId, [string]$Hash = '', [switch]$Nested) {
    $path = $scope + '\' + $Name + '\' + $(if ($Nested) { 'UserChoiceLatest' } else { 'UserChoice' })
    $key = $Root.CreateSubKey($path)
    try {
        if ($Hash) { $key.SetValue('Hash', $Hash) }
        if ($Nested) { $child = $key.CreateSubKey('ProgId'); try { $child.SetValue('ProgId', $ProgId) } finally { $child.Dispose() } }
        else { $key.SetValue('ProgId', $ProgId) }
    } finally { $key.Dispose() }
    return $path
}
function Read-Choice($Root, [string]$Path) {
    $key = $Root.OpenSubKey($Path)
    try { return Get-EdgeChoiceState $key } finally { $key.Dispose() }
}
function Access-Sddl($Root, [string]$Path) {
    $key = $Root.OpenSubKey($Path)
    try { return Get-EdgeAccessSddl (Get-EdgeKeyAcl $key) } finally { $key.Dispose() }
}
function Set-LegacyAcl($Root, [string]$Path) {
    $key = $Root.OpenSubKey($Path, $true)
    try {
        $acl = [Security.AccessControl.RegistrySecurity]::new()
        $acl.SetSecurityDescriptorSddlForm('D:P(A;CI;KR;;;WD)(A;CI;KR;;;RC)(A;CI;KA;;;SY)(A;CI;KA;;;BA)(A;CI;KR;;;AC)(A;CI;KR;;;S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-3232135806-4053264122-3456934681)', [Security.AccessControl.AccessControlSections]::Access)
        Set-EdgeKeyAcl $key $acl
    } finally { $key.Dispose() }
}
function Check([string]$Name, [scriptblock]$Body) {
    $root = New-Case $Name
    try { & $Body $root; $script:passed++; Write-Host "PASS $Name" }
    finally { $root.Dispose() }
}

try {
    Check 'direct-unhashed' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $before = Access-Sddl $r $p
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert ($result.ExitCode -eq 0) ($result | ConvertTo-Json -Depth 5)
        Assert (-not (Read-Choice $r $p).Direct) 'Stale value was not removed'
        Assert ((Access-Sddl $r $p) -ceq $before) 'Cleanup altered the ACL'
        Assert (Test-Path -LiteralPath $result.Findings[0].Backup) 'Missing backup'
    }
    Check 'nested-unhashed' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM' -Nested
        $before = Access-Sddl $r $p
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert ($result.ExitCode -eq 0) 'Nested cleanup failed'
        Assert (-not (Read-Choice $r $p).Nested) 'Nested value remains'
        Assert ((Access-Sddl $r $p) -ceq $before) 'Nested ACL changed'
    }
    Check 'protected-and-other-browser' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM' 'original-hash' -Nested
        $other = New-Choice $r '.htm' 'FirefoxHTML-Example' 'other-hash'
        $before = Access-Sddl $r $p
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert (@($result.Findings | Where-Object Status -eq ProtectedChoice).Count -eq 1) 'Protected choice not reported'
        Assert ((Read-Choice $r $p).Nested -eq 'MSEdgeHTM') 'Protected choice modified'
        Assert ((Read-Choice $r $p).Hash -eq 'original-hash') 'Hash modified'
        Assert ((Read-Choice $r $other).Direct -eq 'FirefoxHTML-Example') 'Other browser modified'
        Assert ((Access-Sddl $r $p) -ceq $before) 'Protected ACL modified'
    }
    Check 'conflicting-progids' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $key = $r.CreateSubKey($p + '\ProgId'); $key.SetValue('ProgId', 'FirefoxHTML-Example'); $key.Dispose()
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert (@($result.Findings | Where-Object Status -eq AmbiguousChoice).Count -eq 1) 'Conflict not reported'
        Assert ((Read-Choice $r $p).Direct -eq 'MSEdgeHTM') 'Conflicting choice removed'
    }
    Check 'installed-edge' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $key = $r.CreateSubKey('Software\Classes\MSEdgeHTM\shell\open\command')
        $key.SetValue('', '"' + [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName + '" "%1"'); $key.Dispose()
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert ($result.ExitCode -eq 0) ($result | ConvertTo-Json -Depth 5)
        Assert ((Read-Choice $r $p).Direct -eq 'MSEdgeHTM') 'Installed handler removed'
    }
    Check 'unknown-handler' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $key = $r.CreateSubKey('Software\Classes\MSEdgeHTM\shell\open\command'); $key.SetValue('', '%LOCALAPPDATA%\Edge\msedge.exe'); $key.Dispose()
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert (@($result.Findings | Where-Object Status -eq UnknownHandler).Count -eq 1) 'Uncertain handler not preserved'
        Assert ((Read-Choice $r $p).Direct -eq 'MSEdgeHTM') 'Uncertain handler removed'
    }
    Check 'missing-executable' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $key = $r.CreateSubKey('Software\Classes\MSEdgeHTM\shell\open\command')
        $key.SetValue('', '"' + (Join-Path $temp 'absent.exe') + '" "%1"'); $key.Dispose()
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert ($result.ExitCode -eq 0 -and -not (Read-Choice $r $p).Direct) 'Proven missing executable not cleaned'
    }
    Check 'legacy-acl-evidence-and-protocols' { param($r)
        $p = New-Choice $r '.html' 'FirefoxHTML-Example' 'hash'
        $urlPath = 'Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice'
        $key = $r.CreateSubKey($urlPath); $key.SetValue('ProgId', 'FirefoxURL-Example'); $key.SetValue('Hash','hash'); $key.Dispose()
        $log = Join-Path $temp 'legacy.log'
        [IO.File]::WriteAllLines($log, @(
            ('resetting protected UserChoice ACL: "HKEY_USERS\' + $sid + '\' + $p + '" '),
            ('resetting protected UserChoice ACL: "HKEY_USERS\' + $sid + '\' + $urlPath + '" '),
            ('resetting protected UserChoice ACL: "HKEY_USERS\' + $sid + '\Software\Unrelated\UserChoice" ')
        ))
        $evidence = @(Get-EdgeLegacyChoicePaths @($log) $sid)
        Assert ($evidence.Count -eq 1 -and $evidence[0] -eq $p) 'Legacy log accepted out-of-scope paths'
        $without = Invoke-EdgeAssociationMaintenance $r $null $sid Audit $temp
        Assert ($without.ExitCode -eq 0) 'Normal permissions falsely flagged without evidence'
        $before = Access-Sddl $r $p
        $with = Invoke-EdgeAssociationMaintenance $r $null $sid Repair $temp $evidence
        Assert (@($with.Findings | Where-Object Status -eq ReviewLegacyChoiceAcl).Count -eq 1) 'Old file ACL attempt not reported'
        Assert ((Access-Sddl $r $p) -ceq $before) 'Unknown historical ACL guessed during repair'
    }
    Check 'denied-write-no-acl-changes' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $key = $r.OpenSubKey($p, $true)
        $acl = Get-EdgeKeyAcl $key
        $acl.AddAccessRule([Security.AccessControl.RegistryAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid), [Security.AccessControl.RegistryRights]::SetValue, [Security.AccessControl.AccessControlType]::Deny))
        Set-EdgeKeyAcl $key $acl; $key.Dispose()
        $before = Access-Sddl $r $p
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
        Assert ($result.Errors -eq 1) 'Denied deletion must be surfaced'
        Assert ((Read-Choice $r $p).Direct -eq 'MSEdgeHTM') 'Denied choice removed'
        Assert ((Access-Sddl $r $p) -ceq $before) 'Denial removed by cleanup'
    }
    Check 'backup-failure' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $blocker = Join-Path $temp 'not-a-directory'; [IO.File]::WriteAllText($blocker, 'test')
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $blocker
        Assert ($result.Errors -eq 1) 'Backup failure not surfaced'
        Assert ((Read-Choice $r $p).Direct -eq 'MSEdgeHTM') 'Changed choice without backup'
    }
    Check 'audit-and-repair-legacy-parent' { param($r)
        $p = New-Choice $r '.html' 'FirefoxHTML-Example' 'preserve-hash' -Nested
        $parent = $scope + '\.html'; Set-LegacyAcl $r $parent
        $before = Access-Sddl $r $parent
        $audit = Invoke-EdgeAssociationMaintenance $r $null $sid Audit $temp
        Assert (@($audit.Findings | Where-Object Status -eq NeedsParentRepair).Count -eq 1) (($audit | ConvertTo-Json -Depth 5) + ' ACL=' + $before)
        Assert ((Access-Sddl $r $parent) -ceq $before) 'Audit mutated permissions'
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Repair $temp
        Assert (@($result.Findings | Where-Object Status -eq ParentRepaired).Count -eq 1) ($result | ConvertTo-Json -Depth 5)
        Assert ((Read-Choice $r $p).Nested -eq 'FirefoxHTML-Example') 'Repair changed browser'
        Assert ((Read-Choice $r $p).Hash -eq 'preserve-hash') 'Repair changed hash'
        $writable = $r.OpenSubKey($parent, $true); Assert ($null -ne $writable) 'Parent still read-only'; $writable.Dispose()
        $again = Invoke-EdgeAssociationMaintenance $r $null $sid Repair $temp
        Assert (@($again.Findings | Where-Object Status -eq ParentRepaired).Count -eq 0) 'Repair not idempotent'
    }
    Check 'custom-acl-preserved' { param($r)
        $p = New-Choice $r '.html' 'FirefoxHTML-Example'
        $parent = $scope + '\.html'; $key = $r.OpenSubKey($parent, $true)
        $acl = Get-EdgeKeyAcl $key; $acl.SetAccessRuleProtection($true, $true); Set-EdgeKeyAcl $key $acl; $key.Dispose()
        $before = Access-Sddl $r $parent
        $result = Invoke-EdgeAssociationMaintenance $r $null $sid Repair $temp
        Assert (@($result.Findings | Where-Object Status -eq ReviewCustomParentAcl).Count -eq 1) 'Custom permissions not flagged'
        Assert ((Access-Sddl $r $parent) -ceq $before) 'Custom ACL overwritten'
    }
    Check 'repair-rolls-back-on-failure' { param($r)
        [void](New-Choice $r '.html' 'FirefoxHTML-Example')
        $parent = $scope + '\.html'; Set-LegacyAcl $r $parent
        $before = Access-Sddl $r $parent
        $original = ${function:Set-EdgeKeyAcl}
        $script:setCount = 0
        try {
            function global:Set-EdgeKeyAcl($Key, $Acl) {
                & $original $Key $Acl
                $script:setCount++
                if ($script:setCount -eq 1) { throw 'Injected verification failure' }
            }
            $result = Invoke-EdgeAssociationMaintenance $r $null $sid Repair $temp
            Assert ($result.Errors -eq 1) 'Repair failure not surfaced'
            Assert ((Access-Sddl $r $parent) -ceq $before) 'Original ACL not restored'
        } finally { Set-Item Function:global:Set-EdgeKeyAcl $original }
    }
    Check 'choice-changed-during-backup' { param($r)
        $p = New-Choice $r '.html' 'MSEdgeHTM'
        $originalBackup = ${function:Save-EdgeAssociationBackup}
        try {
            function global:Save-EdgeAssociationBackup($Directory, $Sid, $Path, $Action, $State) {
                $file = & $originalBackup $Directory $Sid $Path $Action $State
                $key = $r.OpenSubKey($p, $true); $key.SetValue('ProgId','FirefoxHTML-NewChoice'); $key.Dispose()
                return $file
            }
            $result = Invoke-EdgeAssociationMaintenance $r $null $sid Cleanup $temp
            Assert ($result.Errors -eq 1) 'Concurrent selection change not detected'
            Assert ((Read-Choice $r $p).Direct -eq 'FirefoxHTML-NewChoice') 'New choice overwritten'
        } finally { Set-Item Function:global:Save-EdgeAssociationBackup $originalBackup }
    }
    Write-Host "$passed isolated registry tests passed."
} catch {
    Write-Host ($_ | Out-String)
    throw
} finally {
    # Only the random test subtree created above is removed, never production associations.
    if ($testPath -notmatch '^Software\\Dox\.EdgeAssociations\.Tests\\[a-f0-9]{32}$') { throw 'Unsafe test cleanup path' }
    $cleanupAcl = [Security.AccessControl.RegistrySecurity]::new()
    $cleanupAcl.SetSecurityDescriptorSddlForm((Get-EdgeAccessSddl (Get-EdgeKeyAcl $testRoot)), [Security.AccessControl.AccessControlSections]::Access)
    function Reset-TestAcl([string]$Path) {
        $rights = [Security.AccessControl.RegistryRights]::ReadKey -bor [Security.AccessControl.RegistryRights]::ChangePermissions
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($Path, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, $rights)
        if (-not $key) { return }
        try {
            $copy = [Security.AccessControl.RegistrySecurity]::new()
            $copy.SetSecurityDescriptorSddlForm((Get-EdgeAccessSddl $cleanupAcl), [Security.AccessControl.AccessControlSections]::Access)
            Set-EdgeKeyAcl $key $copy
            foreach ($child in $key.GetSubKeyNames()) { Reset-TestAcl ($Path + '\' + $child) }
        } finally { $key.Dispose() }
    }
    Reset-TestAcl $testPath
    $testRoot.Dispose()
    [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($testPath, $false)
    $resolved = [IO.Path]::GetFullPath($temp)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'Dox.EdgeAssociations.Tests-*') { throw 'Unsafe temporary cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
