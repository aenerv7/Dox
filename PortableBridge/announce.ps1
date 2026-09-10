[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('firefox', 'chrome')][string]$Browser,
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$Profile,
    [string]$ProfileDirectory = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$browserPath = [IO.Path]::GetFullPath($Executable)
$profilePath = [IO.Path]::GetFullPath($Profile)
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value.ToUpperInvariant()
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sid)) }
finally { $sha.Dispose() }
$identity = -join ($hash[0..11] | ForEach-Object { $_.ToString('x2') })
$deadline = [DateTime]::UtcNow.AddSeconds(60)

do {
    $pipe = [IO.Pipes.NamedPipeClientStream]::new('.', "PortableBridge-Control-$identity",
        [IO.Pipes.PipeDirection]::InOut, [IO.Pipes.PipeOptions]::Asynchronous)
    $writer = $null
    try {
        $pipe.Connect(5000)
        $writer = [IO.BinaryWriter]::new($pipe, [Text.Encoding]::UTF8, $true)
        $writer.Write('announce-v3')
        $writer.Write($Browser.ToLowerInvariant())
        $writer.Write($browserPath)
        $writer.Write($profilePath)
        $writer.Write($ProfileDirectory)
        $writer.Flush()
        $response = New-Object byte[] 4
        $offset = 0
        while ($offset -lt 4) {
            $remaining = [int][Math]::Max(1, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)
            $read = $pipe.ReadAsync($response, $offset, 4 - $offset)
            if (-not $read.Wait($remaining)) { throw 'Bridge announcement timed out.' }
            if ($read.Result -eq 0) { throw 'Bridge closed the connection without a complete response.' }
            $offset += $read.Result
        }
        $result = [BitConverter]::ToInt32($response, 0)
    }
    finally {
        if ($null -ne $writer) { $writer.Dispose() }
        $pipe.Dispose()
    }
    if ($result -eq 0) { return }
    if ($result -ne 75) { throw "Bridge rejected the $Browser session (code $result)." }
    Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)
throw 'The previous portable session did not finish cleaning within 60 seconds.'
