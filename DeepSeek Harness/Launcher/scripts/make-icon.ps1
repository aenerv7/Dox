# ============================================================================
# make-icon.ps1 — 生成托盘图标 src\Launcher.ico
# 深色圆角方块 + 白色电源符号（表示“启动/停止”），PNG 压缩多尺寸 ICO
# ============================================================================
param(
    [string]$OutFile = (Join-Path (Split-Path -Parent $PSScriptRoot) "src\Launcher.ico")
)

Add-Type -AssemblyName System.Drawing

function Draw-IconPng([int]$size) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 32.0

    # 圆角方块背景
    $pad  = 1.0 * $scale
    $r    = 8.0 * $scale
    $d    = $r * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($pad, $pad, $d, $d, 180, 90)
    $path.AddArc($size - $pad - $d, $pad, $d, $d, 270, 90)
    $path.AddArc($size - $pad - $d, $size - $pad - $d, $d, $d, 0, 90)
    $path.AddArc($pad, $size - $pad - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $bg = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 30, 41, 59))
    $g.FillPath($bg, $path)

    # 白色电源符号
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, [Math]::Max(2.0, 2.6 * $scale))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $cx = $size / 2.0
    $cy = $size / 2.0 - 1.0 * $scale
    $rad = 8.4 * $scale
    $arc = [System.Drawing.RectangleF]::new($cx - $rad, $cy - $rad, 2 * $rad, 2 * $rad)
    $g.DrawArc($pen, $arc, 135, 270)
    $g.DrawLine($pen, $cx, $cy - 2.6 * $scale, $cx, $cy + 5.4 * $scale)

    $pen.Dispose(); $bg.Dispose(); $path.Dispose(); $g.Dispose()

    $ms = [System.IO.MemoryStream]::new()
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $png = $ms.ToArray()
    $ms.Dispose(); $bmp.Dispose()
    return ,$png
}

$sizes = 16, 20, 24, 32, 48, 64, 256
$imgs = @()
foreach ($s in $sizes) {
    $imgs += ,@($s, (Draw-IconPng $s))
}

# ---- 组装 ICO 容器（PNG 条目，Vista+ 支持）----
$count  = $imgs.Count
$offset = 6 + 16 * $count
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)                       # reserved
$bw.Write([UInt16]1)                       # type = icon
$bw.Write([UInt16]$count)
foreach ($img in $imgs) {
    $s = $img[0]; $data = $img[1]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([Byte]$dim)                  # width
    $bw.Write([Byte]$dim)                  # height
    $bw.Write([Byte]0)                     # palette
    $bw.Write([Byte]0)                     # reserved
    $bw.Write([UInt16]1)                   # planes
    $bw.Write([UInt16]32)                  # bpp
    $bw.Write([UInt32]$data.Length)        # bytes in resource
    $bw.Write([UInt32]$offset)             # offset
    $offset += $data.Length
}
foreach ($img in $imgs) { $bw.Write($img[1]) }
$bw.Flush()
$ico = $ms.ToArray()
$bw.Dispose(); $ms.Dispose()

$dir = Split-Path -Parent $OutFile
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllBytes($OutFile, $ico)
Write-Host "已生成 $OutFile（$($ico.Length) 字节，$count 个尺寸）"
