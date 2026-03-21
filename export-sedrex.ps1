# SEDREX - Export All Source Files
# Save as export-sedrex.ps1 in your Sedrex AI folder
# Run: .\export-sedrex.ps1

$root   = "C:\Users\siddh\OneDrive\Desktop\Sedrex AI"
$output = "$root\sedrex-export.txt"
$div    = "=" * 80

$skipDirs = @("node_modules","dist",".git",".temp")
$skipFiles = @("package-lock.json","build.log")

$files = Get-ChildItem -Path $root -Recurse -File |
  Where-Object {
    $ext  = $_.Extension.ToLower()
    $name = $_.Name
    $path = $_.FullName

    $goodExt = $ext -in @(".tsx",".ts",".css",".sql",".toml",".md",".html",".js")
    $badDir  = $false
    $badFile = $name -in $skipFiles

    foreach ($s in $skipDirs) {
      if ($path -like "*\$s\*") { $badDir = $true; break }
    }

    $goodExt -and -not $badDir -and -not $badFile
  } | Sort-Object FullName

$total = $files.Count
Write-Host "Found $total files..." -ForegroundColor Cyan

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("SEDREX AI - FULL SOURCE EXPORT")
$lines.Add("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("Total files: $total")
$lines.Add($div)

$i = 0
foreach ($file in $files) {
    $i++
    $rel = $file.FullName.Substring($root.Length).TrimStart("\")
    Write-Host "[$i/$total] $rel" -ForegroundColor Gray

    $lines.Add("")
    $lines.Add($div)
    $lines.Add("FILE: $rel")
    $lines.Add("MODIFIED: $($file.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))  SIZE: $($file.Length) bytes")
    $lines.Add($div)
    $lines.Add("")

    try {
        $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
        $lines.Add($content)
    } catch {
        $lines.Add("ERROR READING FILE")
    }
}

$lines.Add("")
$lines.Add($div)
$lines.Add("END OF EXPORT - $total files total")
$lines.Add($div)

[System.IO.File]::WriteAllLines($output, $lines, [System.Text.Encoding]::UTF8)

$size = [math]::Round((Get-Item $output).Length / 1MB, 2)
Write-Host ""
Write-Host "Done! Exported $total files to sedrex-export.txt ($size MB)" -ForegroundColor Green
Write-Host "File: $output" -ForegroundColor Yellow