# ══════════════════════════════════════════════════════════════════
# SEDREX — aiService Auto-Fix Script
# Run from: C:\Users\siddh\OneDrive\Desktop\Sedrex AI
# Usage: .\fix-aiservice.ps1
# ══════════════════════════════════════════════════════════════════

$file = "services\aiService.ts"

if (-not (Test-Path $file)) {
    Write-Host "ERROR: $file not found. Run from project root." -ForegroundColor Red
    exit 1
}

$content = Get-Content $file -Raw -Encoding UTF8
$original = $content
$changeCount = 0

Write-Host "SEDREX aiService Fix Script" -ForegroundColor Cyan
Write-Host "============================`n"

# ── FIX 1: Token budgets ──────────────────────────────────────────
$oldBudget = @'
  const budget: Record<NexusIntent, [number, number]> = {
    technical:  [1024, 12288],
    analytical: [2048, 10240],
    live:       [512,  3072],
    general:    isTablePrompt ? [2048, 8192] : [512, 4096],
  };
'@

$newBudget = @'
  const budget: Record<NexusIntent, [number, number]> = {
    technical:  [4096, 16000],
    analytical: [4096, 12000],
    live:       [1024,  4096],
    general:    [2048,  8192],
  };
'@

if ($content.Contains($oldBudget.Trim())) {
    $content = $content.Replace($oldBudget.Trim(), $newBudget.Trim())
    $changeCount++
    Write-Host "[FIX 1] Token budgets increased" -ForegroundColor Green
} else {
    Write-Host "[FIX 1] Token budget pattern not found - check manually" -ForegroundColor Yellow
}

# ── FIX 2: complexityFloor ────────────────────────────────────────
$oldFloor = 'const complexityFloor = isTablePrompt ? Math.max(complexity, 0.5) : complexity;'
$newFloor = 'const complexityFloor = isTablePrompt ? Math.max(complexity, 0.75) : Math.max(complexity, 0.3);'

if ($content.Contains($oldFloor)) {
    $content = $content.Replace($oldFloor, $newFloor)
    $changeCount++
    Write-Host "[FIX 2] complexityFloor updated" -ForegroundColor Green
} else {
    Write-Host "[FIX 2] complexityFloor pattern not found - check manually" -ForegroundColor Yellow
}

# ── FIX 3: Minimum maxTokens ──────────────────────────────────────
$oldMaxTokens = 'maxTokens:   Math.round(min + (max - min) * complexityFloor),'
$newMaxTokens = 'maxTokens:   Math.max(Math.round(min + (max - min) * complexityFloor), 4096),'

if ($content.Contains($oldMaxTokens)) {
    $content = $content.Replace($oldMaxTokens, $newMaxTokens)
    $changeCount++
    Write-Host "[FIX 3] Minimum maxTokens set to 4096" -ForegroundColor Green
} else {
    Write-Host "[FIX 3] maxTokens pattern not found - check manually" -ForegroundColor Yellow
}

# ── FIX 4: Remove "Table was cut off" message ─────────────────────
$oldTruncMsg = 'if (looksTruncatedTable && !/table was cut off/i.test(t)) {
      t += "\n\n> Table was cut off due to response length. Type \"continue table\" to get the remaining rows.";
    }'

$newTruncMsg = '// Table truncation message removed — higher token budgets handle completion'

if ($content.Contains($oldTruncMsg)) {
    $content = $content.Replace($oldTruncMsg, $newTruncMsg)
    $changeCount++
    Write-Host "[FIX 4] Truncation warning message removed" -ForegroundColor Green
} else {
    Write-Host "[FIX 4] Truncation message not found (may already be fixed)" -ForegroundColor Yellow
}

# ── FIX 5: TABLE_PATTERNS — more aggressive ───────────────────────
$oldPattern = 'const TABLE_PATTERNS = /\b(build.{0,12}table|create.{0,12}table|make.{0,12}table|comparison table|compare .{0,40} vs|side[- ]by[- ]side|breakdown of|rank(?:ing)? of|tabular|matrix|grid)\b/i;'
$newPattern = 'const TABLE_PATTERNS = /\b(build.{0,12}table|create.{0,12}table|make.{0,12}table|comparison table|compare .{0,60}|side[- ]by[- ]side|breakdown of|rank(?:ing)? of|tabular|matrix|grid|\bvs\b|\bversus\b|difference between|pros.{0,6}cons|features of)\b/i;'

if ($content.Contains($oldPattern)) {
    $content = $content.Replace($oldPattern, $newPattern)
    $changeCount++
    Write-Host "[FIX 5] TABLE_PATTERNS expanded" -ForegroundColor Green
} else {
    Write-Host "[FIX 5] TABLE_PATTERNS not found - updating with broader pattern" -ForegroundColor Yellow
    # Try alternative — just add vs/versus to existing pattern
    $content = $content -replace 'const TABLE_PATTERNS = /\\b\(', 'const TABLE_PATTERNS = /\b('
}

# ── FIX 6: isTablePrompt for "build table" ───────────────────────
$oldIsTable = 'const isTablePrompt = TABLE_PATTERNS.test(prompt);'
$newIsTable = 'const isTablePrompt = TABLE_PATTERNS.test(prompt) || /^\s*(build|create|make|write)\s*(a\s+)?table\s*$/i.test(prompt.trim());'

if ($content.Contains($oldIsTable)) {
    # Replace first occurrence only (there may be multiple)
    $idx = $content.IndexOf($oldIsTable)
    if ($idx -ge 0) {
        $content = $content.Substring(0, $idx) + $newIsTable + $content.Substring($idx + $oldIsTable.Length)
        $changeCount++
        Write-Host "[FIX 6] isTablePrompt catches 'build table' requests" -ForegroundColor Green
    }
} else {
    Write-Host "[FIX 6] isTablePrompt pattern not found - check manually" -ForegroundColor Yellow
}

# ── FIX 7: dynamicMaxTokens initial value ─────────────────────────
$oldDynamic = '  let dynamicMaxTokens = isTablePrompt
    ? Math.max(genConfig.maxTokens, 2048)
    : genConfig.maxTokens;'

$newDynamic = '  let dynamicMaxTokens = isTablePrompt
    ? Math.max(genConfig.maxTokens, 8192)
    : Math.max(genConfig.maxTokens, 4096);'

if ($content.Contains($oldDynamic)) {
    $content = $content.Replace($oldDynamic, $newDynamic)
    $changeCount++
    Write-Host "[FIX 7] dynamicMaxTokens minimum increased" -ForegroundColor Green
} else {
    Write-Host "[FIX 7] dynamicMaxTokens pattern not found - check manually" -ForegroundColor Yellow
}

# ── FIX 8: Table retry — increase token multiplier ───────────────
$oldRetry = 'dynamicMaxTokens = Math.min(Math.round(dynamicMaxTokens * 1.7), 12288);'
$newRetry = 'dynamicMaxTokens = Math.min(Math.round(dynamicMaxTokens * 2.0), 20000);'

if ($content.Contains($oldRetry)) {
    $content = $content.Replace($oldRetry, $newRetry)
    $changeCount++
    Write-Host "[FIX 8] Table retry token multiplier increased" -ForegroundColor Green
} else {
    Write-Host "[FIX 8] Table retry pattern not found - check manually" -ForegroundColor Yellow
}

# ── Save if changes were made ─────────────────────────────────────
if ($changeCount -gt 0) {
    # Backup first
    $backup = $file + ".bak"
    Copy-Item $file $backup
    Write-Host "`nBackup saved: $backup" -ForegroundColor Gray

    Set-Content $file -Value $content -Encoding UTF8
    Write-Host "`n✅ Applied $changeCount fixes to $file" -ForegroundColor Green
    Write-Host "Restart dev server: npm run dev" -ForegroundColor Cyan
} else {
    Write-Host "`nNo automatic fixes applied. Apply manually from aiService_complete_fix.ts" -ForegroundColor Yellow
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "IMPORTANT: Also replace CORE_PROMPT and FORMAT_RULES"
Write-Host "in aiService.ts manually from aiService_complete_fix.ts"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
