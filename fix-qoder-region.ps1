# Fix Qoder Region Settings
# This script changes Qoder region from CN to Global

Write-Host "=== Qoder Region Fix ===" -ForegroundColor Cyan
Write-Host ""

$cacheJsonPath = "$env:LOCALAPPDATA\Programs\Qoder\resources\app\resources\cache\cache.json"

if (Test-Path $cacheJsonPath) {
    Write-Host "[1] Reading current configuration..." -ForegroundColor Yellow
    $config = Get-Content $cacheJsonPath | ConvertFrom-Json
    
    Write-Host "    Current region: $($config.regionEnv)" -ForegroundColor White
    
    if ($config.regionEnv -eq "cn") {
        Write-Host ""
        Write-Host "[2] Changing region from 'cn' to 'global'..." -ForegroundColor Yellow
        
        # Change region
        $config.regionEnv = "global"
        
        # Save to file
        $config | ConvertTo-Json -Depth 10 | Set-Content $cacheJsonPath -Encoding UTF8
        
        Write-Host "    [OK] Region changed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "[3] New configuration:" -ForegroundColor Yellow
        Get-Content $cacheJsonPath
        Write-Host ""
        Write-Host "========================" -ForegroundColor Cyan
        Write-Host "[SUCCESS] Region fixed!" -ForegroundColor Green
        Write-Host "Please RESTART Qoder for changes to take effect." -ForegroundColor Yellow
        Write-Host "========================" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "[INFO] Region is already set to: $($config.regionEnv)" -ForegroundColor Green
        Write-Host "       No changes needed." -ForegroundColor Green
    }
} else {
    Write-Host "[ERROR] cache.json not found at: $cacheJsonPath" -ForegroundColor Red
    Write-Host "        Please check your Qoder installation." -ForegroundColor Red
}

Write-Host ""
