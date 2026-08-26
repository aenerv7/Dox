# ============================================================================
# make-icon.ps1 - Generate src\Launcher.ico from the official DSH favicon.
# Source: deepseek-ai/deepseek-harness, apps/web/public/favicon.svg
# The exact whale path is rendered in DeepSeek's official brand blue (#4D6BFE).
# ============================================================================
param(
    [string]$SourceFile = (Join-Path (Split-Path -Parent $PSScriptRoot) "src\DeepSeekHarness.svg"),
    [string]$OutFile = (Join-Path (Split-Path -Parent $PSScriptRoot) "src\Launcher.ico")
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

function Draw-IconPng([int]$size, [string]$pathData, [double[]]$viewBox) {
    $geometry = [System.Windows.Media.Geometry]::Parse($pathData)
    $transform = [System.Windows.Media.MatrixTransform]::new(
        [System.Windows.Media.Matrix]::new(
            $size / $viewBox[2], 0, 0, $size / $viewBox[3],
            -$viewBox[0] * $size / $viewBox[2],
            -$viewBox[1] * $size / $viewBox[3]
        )
    )

    $visual = [System.Windows.Media.DrawingVisual]::new()
    $context = $visual.RenderOpen()
    $brush = [System.Windows.Media.SolidColorBrush]::new(
        [System.Windows.Media.ColorConverter]::ConvertFromString('#4D6BFE')
    )
    $context.PushTransform($transform)
    $context.DrawGeometry($brush, $null, $geometry)
    $context.Pop()
    $context.Close()

    $bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new(
        $size, $size, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32
    )
    $bitmap.Render($visual)
    $encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $stream = [System.IO.MemoryStream]::new()
    $encoder.Save($stream)
    $png = $stream.ToArray()
    $stream.Dispose()
    return ,$png
}

if (-not (Test-Path -LiteralPath $SourceFile)) {
    throw "Official icon source not found: $SourceFile"
}

[xml]$svg = Get-Content -LiteralPath $SourceFile -Raw
$root = $svg.DocumentElement
$viewBox = @($root.viewBox -split '\s+' | ForEach-Object { [double]$_ })
if ($viewBox.Count -ne 4) { throw "Invalid SVG viewBox in $SourceFile" }

$path = $root.SelectSingleNode("*[local-name()='path']")
if (-not $path -or -not $path.d) { throw "SVG path not found in $SourceFile" }

$sizes = 16, 20, 24, 32, 48, 64, 256
$images = foreach ($size in $sizes) {
    ,@($size, (Draw-IconPng $size $path.d $viewBox))
}

# Assemble a Vista-compatible ICO containing PNG-compressed entries.
$count = $images.Count
$offset = 6 + 16 * $count
$stream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$count)
foreach ($image in $images) {
    $size = $image[0]
    $data = $image[1]
    $dimension = if ($size -ge 256) { 0 } else { $size }
    $writer.Write([Byte]$dimension)
    $writer.Write([Byte]$dimension)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$data.Length)
    $writer.Write([UInt32]$offset)
    $offset += $data.Length
}
foreach ($image in $images) { $writer.Write($image[1]) }
$writer.Flush()
$ico = $stream.ToArray()
$writer.Dispose()
$stream.Dispose()

$directory = Split-Path -Parent $OutFile
if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
[System.IO.File]::WriteAllBytes($OutFile, $ico)
Write-Host "Generated $OutFile ($($ico.Length) bytes, $count sizes)"
