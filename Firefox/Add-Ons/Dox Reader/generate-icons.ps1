# generate-icons.ps1 - Regenerate the Dox Reader toolbar/store PNG icons.
#
# public/icons/icon.svg is the design source. AMO only accepts a raster image
# for the add-on listing icon, so the manifest must point at PNGs. Run this
# script after editing the SVG and commit the regenerated files:
#
#   pwsh -File generate-icons.ps1
#
# Geometry below mirrors public/icons/icon.svg one-to-one (96x96 viewBox) so the
# PNGs and the SVG stay identical by construction.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot 'public/icons'

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-IconPng {
    param(
        [int]$Size,
        [string]$OutputPath
    )

    # Render at 4x and downsample, so the rounded corners and curves stay smooth.
    $renderSize = $Size * 4
    $scale = $renderSize / 96.0
    $render = [System.Drawing.Bitmap]::new(
        $renderSize,
        $renderSize,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($render)

    function F([double]$Value) {
        return [float]($Value * $scale)
    }

    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        function Fill-Shape {
            param(
                [System.Drawing.Drawing2D.GraphicsPath]$Path,
                [string]$Color
            )

            $brush = [System.Drawing.SolidBrush]::new(
                [System.Drawing.ColorTranslator]::FromHtml($Color)
            )
            try {
                $graphics.FillPath($brush, $Path)
            }
            finally {
                $brush.Dispose()
            }
        }

        # <rect width="96" height="96" rx="18" fill="#191c1d"/>
        $background = New-RoundedRectanglePath `
            -X 0 -Y 0 -Width (F 96) -Height (F 96) -Radius (F 18)
        try {
            Fill-Shape -Path $background -Color '#191c1d'
        }
        finally {
            $background.Dispose()
        }

        # M24 25h25c13 0 23 10 23 23v23H47c-13 0-23-10-23-23V25Z  (fill #f4f6f3)
        $page = [System.Drawing.Drawing2D.GraphicsPath]::new()
        try {
            $page.AddLine((F 24), (F 25), (F 49), (F 25))
            $page.AddBezier((F 49), (F 25), (F 62), (F 25), (F 72), (F 35), (F 72), (F 48))
            $page.AddLine((F 72), (F 48), (F 72), (F 71))
            $page.AddLine((F 72), (F 71), (F 47), (F 71))
            $page.AddBezier((F 47), (F 71), (F 34), (F 71), (F 24), (F 61), (F 24), (F 48))
            $page.AddLine((F 24), (F 48), (F 24), (F 25))
            $page.CloseFigure()
            Fill-Shape -Path $page -Color '#f4f6f3'
        }
        finally {
            $page.Dispose()
        }

        # M36 39h13c6 0 11 5 11 11v9H47c-6 0-11-5-11-11v-9Z  (fill #e0524d)
        $article = [System.Drawing.Drawing2D.GraphicsPath]::new()
        try {
            $article.AddLine((F 36), (F 39), (F 49), (F 39))
            $article.AddBezier((F 49), (F 39), (F 55), (F 39), (F 60), (F 44), (F 60), (F 50))
            $article.AddLine((F 60), (F 50), (F 60), (F 59))
            $article.AddLine((F 60), (F 59), (F 47), (F 59))
            $article.AddBezier((F 47), (F 59), (F 41), (F 59), (F 36), (F 54), (F 36), (F 48))
            $article.AddLine((F 36), (F 48), (F 36), (F 39))
            $article.CloseFigure()
            Fill-Shape -Path $article -Color '#e0524d'
        }
        finally {
            $article.Dispose()
        }

        # <circle cx="65" cy="31" r="7" fill="#eab94c"/>
        $dot = [System.Drawing.Drawing2D.GraphicsPath]::new()
        try {
            $dot.AddEllipse((F 58), (F 24), (F 14), (F 14))
            Fill-Shape -Path $dot -Color '#eab94c'
        }
        finally {
            $dot.Dispose()
        }

        $output = [System.Drawing.Bitmap]::new(
            $Size,
            $Size,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
        $outputGraphics = [System.Drawing.Graphics]::FromImage($output)
        try {
            $outputGraphics.Clear([System.Drawing.Color]::Transparent)
            $outputGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $outputGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $outputGraphics.DrawImage($render, 0, 0, $Size, $Size)
            $output.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $outputGraphics.Dispose()
            $output.Dispose()
        }
    }
    finally {
        $graphics.Dispose()
        $render.Dispose()
    }
}

foreach ($size in 32, 48, 64, 96, 128) {
    $path = Join-Path $outputDirectory "icon-$size.png"
    New-IconPng -Size $size -OutputPath $path
    Write-Host "wrote $path"
}
