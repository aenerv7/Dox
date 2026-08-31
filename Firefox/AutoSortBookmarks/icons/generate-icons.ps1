[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

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

    $renderSize = $Size * 4
    $tileScale = $renderSize / 96
    $glyphScale = $renderSize / 24
    $render = [System.Drawing.Bitmap]::new(
        $renderSize,
        $renderSize,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($render)

    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        $tiles = @(
            @{ X = 1; Y = 1; Width = 94; Height = 94; Radius = 20; Color = '#202124' },
            @{ X = 3; Y = 3; Width = 90; Height = 90; Radius = 18; Color = '#ffffff' },
            @{ X = 5; Y = 5; Width = 86; Height = 86; Radius = 16; Color = '#0060df' }
        )

        foreach ($tile in $tiles) {
            $path = New-RoundedRectanglePath `
                -X ($tile.X * $tileScale) `
                -Y ($tile.Y * $tileScale) `
                -Width ($tile.Width * $tileScale) `
                -Height ($tile.Height * $tileScale) `
                -Radius ($tile.Radius * $tileScale)
            $brush = [System.Drawing.SolidBrush]::new(
                [System.Drawing.ColorTranslator]::FromHtml($tile.Color)
            )
            try {
                $graphics.FillPath($brush, $path)
            }
            finally {
                $brush.Dispose()
                $path.Dispose()
            }
        }

        $pen = [System.Drawing.Pen]::new(
            [System.Drawing.Color]::White,
            2 * $glyphScale
        )
        try {
            $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
            $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

            function Point([double]$X, [double]$Y) {
                return [System.Drawing.PointF]::new(
                    [float]($X * $glyphScale),
                    [float]($Y * $glyphScale)
                )
            }

            $graphics.DrawLines($pen, [System.Drawing.PointF[]]@(
                (Point 3 16),
                (Point 7 20),
                (Point 11 16)
            ))
            $graphics.DrawLine($pen, (Point 7 20), (Point 7 4))
            $graphics.DrawLine($pen, (Point 20 8), (Point 15 8))

            $letterA = [System.Drawing.Drawing2D.GraphicsPath]::new()
            try {
                $letterA.AddLine((Point 15 10), (Point 15 6.5))
                $letterA.AddBezier(
                    (Point 15 6.5),
                    (Point 15 ([double](19 / 6))),
                    (Point 20 ([double](19 / 6))),
                    (Point 20 6.5)
                )
                $letterA.AddLine((Point 20 6.5), (Point 20 10))
                $graphics.DrawPath($pen, $letterA)
            }
            finally {
                $letterA.Dispose()
            }

            $graphics.DrawLines($pen, [System.Drawing.PointF[]]@(
                (Point 15 14),
                (Point 20 14),
                (Point 15 20),
                (Point 20 20)
            ))
        }
        finally {
            $pen.Dispose()
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

$iconDirectory = $PSScriptRoot
New-IconPng -Size 32 -OutputPath (Join-Path $iconDirectory 'icon-32.png')
New-IconPng -Size 48 -OutputPath (Join-Path $iconDirectory 'icon-48.png')
New-IconPng -Size 64 -OutputPath (Join-Path $iconDirectory 'icon-64.png')
New-IconPng -Size 96 -OutputPath (Join-Path $iconDirectory 'icon-96.png')
New-IconPng -Size 128 -OutputPath (Join-Path $iconDirectory 'icon-128.png')
