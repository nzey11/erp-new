# Qoder Diagnostic Script
# This script checks Qoder installation and helps find issues

Write-Host "=== Qoder Diagnostics ===" -ForegroundColor Cyan
Write-Host ""

# Set UTF-8 encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Check Qoder path
$qoderBasePath = "$env:LOCALAPPDATA\Programs\Qoder"
$qoderExePath = "$qoderBasePath\resources\app\resources\bin\x86_64_windows\Qoder.exe"
$qoderProgramFilesPath = "C:\Program Files\Qoder\Qoder.exe"

Write-Host "1. Checking directories:" -ForegroundColor Yellow
Write-Host "   AppData directory: $qoderBasePath"
if (Test-Path $qoderBasePath) {
    Write-Host "   [OK] AppData directory exists" -ForegroundColor Green
} else {
    Write-Host "   [WARNING] AppData directory NOT found" -ForegroundColor Yellow
}

Write-Host "   Program Files directory: C:\Program Files\Qoder"
if (Test-Path "C:\Program Files\Qoder") {
    Write-Host "   [OK] Program Files directory exists" -ForegroundColor Green
} else {
    Write-Host "   [WARNING] Program Files directory NOT found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2. Checking executable files:" -ForegroundColor Yellow

# Check AppData location
Write-Host "   AppData path: $qoderExePath"
if (Test-Path $qoderExePath) {
    Write-Host "   [OK] Found in AppData" -ForegroundColor Green
    $foundExePath = $qoderExePath
} else {
    Write-Host "   [NOT FOUND] Not in AppData" -ForegroundColor Yellow
}

# Check Program Files location
Write-Host "   Program Files path: $qoderProgramFilesPath"
if (Test-Path $qoderProgramFilesPath) {
    Write-Host "   [OK] Found in Program Files" -ForegroundColor Green
    $foundExePath = $qoderProgramFilesPath
} else {
    Write-Host "   [NOT FOUND] Not in Program Files" -ForegroundColor Yellow
}

# Try to run if found
if ($foundExePath) {
    $fileInfo = Get-Item $foundExePath
    Write-Host ""
    Write-Host "   Using: $foundExePath" -ForegroundColor Cyan
    Write-Host "   File size: $($fileInfo.Length) bytes"
    Write-Host "   Last modified: $($fileInfo.LastWriteTime)"
    
    Write-Host ""
    Write-Host "3. Trying to run Qoder.exe --version:" -ForegroundColor Yellow
    try {
        $version = & $foundExePath --version 2>&1
        Write-Host "   [OK] Successfully launched" -ForegroundColor Green
        Write-Host "   Version: $version"
    } catch {
        Write-Host "   [ERROR] Launch failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "   [ERROR] Qoder.exe not found in any location" -ForegroundColor Red
    Write-Host "   Recommendation: Reinstall Qoder from official website" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "4. Checking configuration files:" -ForegroundColor Yellow
$configPath = "$qoderBasePath\resources\app\resources\cache"
if (Test-Path $configPath) {
    Write-Host "   [OK] Cache directory found" -ForegroundColor Green
    Write-Host "   Contents:"
    Get-ChildItem $configPath | ForEach-Object {
        Write-Host "     - $($_.Name)"
    }
} else {
    Write-Host "   [ERROR] Cache directory not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "5. Checking network connection:" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://api2.qoder.sh/algo/api/v1/ping" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   [OK] Qoder API connection successful" -ForegroundColor Green
    }
} catch {
    Write-Host "   [ERROR] API connection failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "6. System information:" -ForegroundColor Yellow
Write-Host "   Username: $env:USERNAME"
Write-Host "   Home directory: $env:USERPROFILE"
Write-Host "   PowerShell version: $($PSVersionTable.PSVersion)"
Write-Host "   Output encoding: $([Console]::OutputEncoding.EncodingName)"

Write-Host ""
Write-Host "=== Diagnostics Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If problems persist, send this output to support: contact@qoder.com" -ForegroundColor Yellow
