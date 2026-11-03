Add-Type -AssemblyName System.Drawing
$labelOutput = Join-Path $PSScriptRoot '../test-results/label-calibration'
[System.IO.Directory]::CreateDirectory($labelOutput) | Out-Null
$labelDpi = 203 / 25.4
$labelWidth = [int][Math]::Round(50 * $labelDpi)
$labelHeight = [int][Math]::Round(30 * $labelDpi)
$labelBitmap = [System.Drawing.Bitmap]::new($labelWidth, $labelHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$labelGraphics = [System.Drawing.Graphics]::FromImage($labelBitmap)
try {
    $labelGraphics.Clear([System.Drawing.Color]::White)
    $labelGraphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
    $labelFont = [System.Drawing.Font]::new('Segoe UI', 19, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $labelSmallFont = [System.Drawing.Font]::new('Segoe UI', 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $labelPen = [System.Drawing.Pen]::new([System.Drawing.Color]::Black, 1)
    foreach ($labelIndex in @(0,1)) {
        $labelY = [int][Math]::Round(($labelIndex * 15 - 0.75) * $labelDpi)
        $labelGraphics.DrawRectangle($labelPen, 12, $labelY + 12, $labelWidth - 24, [int][Math]::Round(15 * $labelDpi) - 24)
        $labelGraphics.DrawString('BENCHWORK', $labelFont, [System.Drawing.Brushes]::Black, 26, $labelY + 25)
        $labelGraphics.DrawString("Test $([char](65+$labelIndex))2 - 50 x 15 mm", $labelSmallFont, [System.Drawing.Brushes]::Black, 26, $labelY + 58)
    }
    $labelBitmap.Save((Join-Path $labelOutput 'calibration.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $labelBitmap.Save((Join-Path $labelOutput 'calibration.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $labelFont.Dispose(); $labelSmallFont.Dispose(); $labelPen.Dispose()
} finally { $labelGraphics.Dispose(); $labelBitmap.Dispose() }
