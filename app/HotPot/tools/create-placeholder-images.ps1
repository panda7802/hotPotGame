Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\assets\resources\ingredients'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

# 按食材名称与配色绘制本地占位图片。
function New-IngredientPlaceholder {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string]$Index,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$BackgroundColor,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$AccentColor
    )

    $bitmap = New-Object System.Drawing.Bitmap 256, 192
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $smoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.SmoothingMode = $smoothingMode
    $renderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.TextRenderingHint = $renderingHint
    $graphics.Clear($BackgroundColor)

    $panelColor = [System.Drawing.Color]::FromArgb(245, 255, 247, 226)
    $panelBrush = New-Object System.Drawing.SolidBrush $panelColor
    $accentPen = New-Object System.Drawing.Pen $AccentColor, 8
    $accentPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
    $graphics.FillRectangle($panelBrush, 10, 10, 236, 172)
    $graphics.DrawRectangle($accentPen, 10, 10, 236, 172)

    $fontStyle = [System.Drawing.FontStyle]::Bold
    $fontUnit = [System.Drawing.GraphicsUnit]::Pixel
    $titleFont = [System.Drawing.Font]::new(
        'Microsoft YaHei', 30, $fontStyle, $fontUnit
    )
    $indexFont = [System.Drawing.Font]::new(
        'Microsoft YaHei', 42, $fontStyle, $fontUnit
    )
    $titleColor = [System.Drawing.Color]::FromArgb(255, 100, 59, 43)
    $titleBrush = New-Object System.Drawing.SolidBrush $titleColor
    $indexBrush = New-Object System.Drawing.SolidBrush $AccentColor
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $center.LineAlignment = [System.Drawing.StringAlignment]::Center

    $title = [string]([char[]](0x56FE, 0x7247, 0x5360, 0x4F4D))
    $titleRect = [System.Drawing.RectangleF]::new(18, 34, 220, 52)
    $indexRect = [System.Drawing.RectangleF]::new(18, 88, 220, 66)
    $graphics.DrawString($title, $titleFont, $titleBrush, $titleRect, $center)
    $graphics.DrawString($Index, $indexFont, $indexBrush, $indexRect, $center)

    $target = Join-Path $outputDirectory $FileName
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Jpeg)

    $center.Dispose()
    $indexBrush.Dispose()
    $titleBrush.Dispose()
    $indexFont.Dispose()
    $titleFont.Dispose()
    $accentPen.Dispose()
    $panelBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

New-IngredientPlaceholder -FileName 'beef.jpg' -Index '01' `
    -BackgroundColor ([System.Drawing.Color]::FromArgb(255, 211, 87, 73)) `
    -AccentColor ([System.Drawing.Color]::FromArgb(255, 157, 49, 44))

New-IngredientPlaceholder -FileName 'shrimp.jpg' -Index '02' `
    -BackgroundColor ([System.Drawing.Color]::FromArgb(255, 255, 153, 105)) `
    -AccentColor ([System.Drawing.Color]::FromArgb(255, 211, 84, 62))

New-IngredientPlaceholder -FileName 'vegetable.jpg' -Index '03' `
    -BackgroundColor ([System.Drawing.Color]::FromArgb(255, 121, 185, 102)) `
    -AccentColor ([System.Drawing.Color]::FromArgb(255, 54, 135, 68))

New-IngredientPlaceholder -FileName 'mushroom.jpg' -Index '04' `
    -BackgroundColor ([System.Drawing.Color]::FromArgb(255, 198, 154, 114)) `
    -AccentColor ([System.Drawing.Color]::FromArgb(255, 139, 101, 78))

New-IngredientPlaceholder -FileName 'corn.jpg' -Index '05' `
    -BackgroundColor ([System.Drawing.Color]::FromArgb(255, 242, 201, 76)) `
    -AccentColor ([System.Drawing.Color]::FromArgb(255, 191, 130, 31))

New-IngredientPlaceholder -FileName 'fish.jpg' -Index '06' `
    -BackgroundColor ([System.Drawing.Color]::FromArgb(255, 121, 184, 209)) `
    -AccentColor ([System.Drawing.Color]::FromArgb(255, 66, 127, 158))

Write-Host "Created JPG placeholders in $outputDirectory"
