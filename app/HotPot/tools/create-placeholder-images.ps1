Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\assets\resources\ingredients'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function New-IngredientPlaceholder {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string]$Index,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$BackgroundColor,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$AccentColor
    )

    $bitmap = New-Object System.Drawing.Bitmap 256, 192
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear($BackgroundColor)

    $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 255, 247, 226))
    $accentPen = New-Object System.Drawing.Pen $AccentColor, 8
    $accentPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Inset
    $graphics.FillRectangle($panelBrush, 10, 10, 236, 172)
    $graphics.DrawRectangle($accentPen, 10, 10, 236, 172)

    $titleFont = New-Object System.Drawing.Font 'Microsoft YaHei', 30, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $indexFont = New-Object System.Drawing.Font 'Microsoft YaHei', 42, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 100, 59, 43))
    $indexBrush = New-Object System.Drawing.SolidBrush $AccentColor
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $center.LineAlignment = [System.Drawing.StringAlignment]::Center

    $title = [string]([char[]](0x56FE, 0x7247, 0x5360, 0x4F4D))
    $graphics.DrawString($title, $titleFont, $titleBrush, (New-Object System.Drawing.RectangleF 18, 34, 220, 52), $center)
    $graphics.DrawString($Index, $indexFont, $indexBrush, (New-Object System.Drawing.RectangleF 18, 88, 220, 66), $center)

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
