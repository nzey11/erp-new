# Reset Qoder Authentication and Cache
# This script clears Qoder cache and forces re-authentication

Write-Host "=== Qoder Authentication Reset ===" -ForegroundColor Cyan
Write-Host ""

$cacheDir = "$env:LOCALAPPDATA\Programs\Qoder\resources\app\resources\cache"
$roamingDir = "$env:APPDATA\Qoder"

# Check if Qoder is running
Write-Host "[1] Checking if Qoder is running..." -ForegroundColor Yellow
$qoderProcess = Get-Process -Name "Qoder" -ErrorAction SilentlyContinue

if ($qoderProcess) {
    Write-Host "    [WARNING] Qoder is currently running!" -ForegroundColor Red
    Write-Host "    Forcing Qoder to close..." -ForegroundColor Yellow
    Stop-Process -Name "Qoder" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Write-Host "    [OK] Qoder closed" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2] Backing up current configuration..." -ForegroundColor Yellow

# Create backup directory
$backupDir = "$env:USERPROFILE\Desktop\Qoder_Backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

if (Test-Path $cacheDir) {
    Copy-Item -Path "$cacheDir\*" -Destination $backupDir -Recurse -ErrorAction SilentlyContinue
    Write-Host "    [OK] Backup created at: $backupDir" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3] Clearing authentication cache..." -ForegroundColor Yellow

$filesToRemove = @(
    "$cacheDir\machine_token.json",
    "$cacheDir\credit",
    "$cacheDir\cache.json"
)

foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "    [REMOVED] $(Split-Path $file -Leaf)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[4] Creating new cache.json with global region..." -ForegroundColor Yellow

$newCache = @{
    regionEnv = "global"
    regionConfig = $null
    notificationTime = @{}
    lastWorktreeCleanupTime = 0
} | ConvertTo-Json -Depth 10

$newCache | Set-Content "$cacheDir\cache.json" -Encoding UTF8
Write-Host "    [OK] cache.json created with region: global" -ForegroundColor Green

Write-Host ""
Write-Host "[5] Clearing temporary logs..." -ForegroundColor Yellow

if (Test-Path $roamingDir) {
    Get-ChildItem "$roamingDir\logs" -Recurse -ErrorAction SilentlyContinue | 
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | 
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    [OK] Old logs cleared" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Qoder authentication reset complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start Qoder" -ForegroundColor White
Write-Host "2. You will be asked to log in again" -ForegroundColor White
Write-Host "3. After login, try Quest Mode" -ForegroundColor White
Write-Host ""
Write-Host "Backup location: $backupDir" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""
