$ErrorActionPreference = 'Stop'
$powerpoint = $null
$document = $null
$security = $null
try {
    $powerpoint = New-Object -ComObject PowerPoint.Application
    $security = $powerpoint.AutomationSecurity
    $powerpoint.AutomationSecurity = 3
    $document = $powerpoint.Presentations.Open($env:BENCHWORK_IMPORT_SOURCE, -1, 0, 0)
    if ($document.Slides.Count -gt 1000) { throw 'Too many slides' }
    $result = @()
    $width = 1600
    $height = [Math]::Max(200, [Math]::Round($width * $document.PageSetup.SlideHeight / $document.PageSetup.SlideWidth))
    foreach ($slide in $document.Slides) {
        $filename = 'slide-' + $slide.SlideIndex + '.png'
        $slide.Export((Join-Path $env:BENCHWORK_IMPORT_DEST $filename), 'PNG', $width, $height)
        $title = 'Slide ' + $slide.SlideIndex
        if ($slide.Shapes.HasTitle -eq -1) { $title = $slide.Shapes.Title.TextFrame.TextRange.Text }
        $notes = @()
        foreach ($shape in $slide.NotesPage.Shapes) {
            try {
                if ($shape.HasTextFrame -eq -1 -and $shape.PlaceholderFormat.Type -eq 2) {
                    $notes += $shape.TextFrame.TextRange.Text
                }
            } catch { }
        }
        $result += @{ title = $title; notes = ($notes -join "`n"); image = $filename }
    }
    $json = ConvertTo-Json -InputObject @($result) -Depth 4
    [IO.File]::WriteAllText((Join-Path $env:BENCHWORK_IMPORT_DEST 'slides.json'), $json, [Text.UTF8Encoding]::new($false))
} finally {
    if ($null -ne $document) { $document.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    if ($null -ne $powerpoint) {
        if ($null -ne $security) { $powerpoint.AutomationSecurity = $security }
        if ($powerpoint.Presentations.Count -eq 0) { $powerpoint.Quit() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerpoint)
    }
}
