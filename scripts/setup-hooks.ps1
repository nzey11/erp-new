#!/usr/bin/env pwsh
# Variant B: Install plain git pre-push hook (no Husky required)
# Run once per machine: pwsh scripts/setup-hooks.ps1

$hookPath = ".git\hooks\pre-push"
$hookContent = @'
#!/bin/sh
# pre-push hook — fast local gate before push
# Blocks push if lint / typecheck / unit tests fail

echo "[pre-push] Running check:fast (lint + typecheck + unit tests)..."
npm run check:fast
if [ $? -ne 0 ]; then
  echo ""
  echo "[pre-push] check:fast FAILED. Push blocked."
  echo "Fix the errors above and try again."
  exit 1
fi
echo "[pre-push] All checks passed. Proceeding with push."
'@

Set-Content -Path $hookPath -Value $hookContent -Encoding UTF8 -NoNewline

# Make executable (needed on Unix; harmless on Windows)
if ($IsLinux -or $IsMacOS) {
    chmod +x $hookPath
}

Write-Host "pre-push hook installed at $hookPath" -ForegroundColor Green
Write-Host "It will run 'npm run check:fast' before every git push." -ForegroundColor Cyan
