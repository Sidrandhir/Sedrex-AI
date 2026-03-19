# SEDREX Rebrand Script - Fixed
# Run: .\rebrand-to-sedrex.ps1

Write-Host "SEDREX Rebrand Starting..." -ForegroundColor Yellow

$files = Get-ChildItem -Recurse -Include "*.ts","*.tsx","*.css","*.html","*.json","*.md" |
  Where-Object { $_.FullName -notmatch "node_modules|dist|\.git|package-lock" }

$replacements = @(
  @{ From = "nexus_theme";           To = "sedrex_theme" },
  @{ From = "nexus_user_settings";   To = "sedrex_user_settings" },
  @{ From = "nexus_survey_done";     To = "sedrex_survey_done" },
  @{ From = "nexus_onboarding_done"; To = "sedrex_onboarding_done" },
  @{ From = "nexus_survey_shown";    To = "sedrex_survey_shown" },
  @{ From = "Nexus AI";              To = "SEDREX" },
  @{ From = "NEXUS AI";              To = "SEDREX" },
  @{ From = "Nexus is handling";     To = "SEDREX is handling" },
  @{ From = "Nexus is in safe mode"; To = "SEDREX is in safe mode" },
  @{ From = "Nexus is receiving";    To = "SEDREX is receiving" },
  @{ From = "I am Nexus AI";         To = "I am SEDREX" },
  @{ From = "You are Nexus AI";      To = "You are SEDREX" },
  @{ From = "Nexus understands";     To = "SEDREX understands" },
  @{ From = "[Nexus]";               To = "[SEDREX]" },
  @{ From = "#10a37f";               To = "#c9a84c" },
  @{ From = "#10b981";               To = "#c9a84c" },
  @{ From = "#059669";               To = "#8a6820" },
  @{ From = "nexus-logo.png";        To = "sedrex-logo.png" },
  @{ From = "nexus-logo-modern.svg"; To = "sedrex-logo.svg" },
  @{ From = "NexusLogo";             To = "SedrexLogo" },
  @{ From = "copy-of-nexus-ai";      To = "sedrex" },
  @{ From = "Nexus Logo";            To = "SEDREX" }
)

$totalChanges = 0

foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) { continue }
  $original = $content
  foreach ($r in $replacements) {
    $content = $content -replace [regex]::Escape($r.From), $r.To
  }
  if ($content -ne $original) {
    Set-Content $file.FullName $content -NoNewline
    $totalChanges++
    Write-Host "  OK: $($file.Name)" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Done! Files updated: $totalChanges" -ForegroundColor Cyan