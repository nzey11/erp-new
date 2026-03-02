# Force Qoder to refresh credit information
Write-Host "=== Force Qoder Refresh ===" -ForegroundColor Cyan
Write-Host ""

# Stop Qoder
Write-Host "[1] Stopping Qoder..." -ForegroundColor Yellow
Stop-Process -Name "Qoder" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "    [OK] Qoder stopped" -ForegroundColor Green

# Remove credit file to force refresh
$creditFile = "$env:LOCALAPPDATA\Programs\Qoder\resources\app\resources\cache\credit"
if (Test-Path $creditFile) {
    Remove-Item $creditFile -Force
    Write-Host "[2] Credit file removed" -ForegroundColor Yellow
} else {
    Write-Host "[2] Credit file already missing" -ForegroundColor Yellow
}

# Restart Qoder
Write-Host ""
Write-Host "[3] Starting Qoder..." -ForegroundColor Yellow
Start-Process "C:\Program Files\Qoder\Qoder.exe"
Start-Sleep -Seconds 3
Write-Host "    [OK] Qoder started" -ForegroundColor Green

Write-Host ""
Write-Host "========================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Qoder refreshed!" -ForegroundColor Green
Write-Host "Wait a few seconds and try Quest Mode again." -ForegroundColor Yellow
Write-Host "========================" -ForegroundColor Cyan
