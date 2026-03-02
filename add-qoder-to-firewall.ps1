# Add Qoder.exe to Windows Firewall Whitelist
# Based on official Qoder troubleshooting guide

Write-Host "=== Add Qoder to Windows Firewall ===" -ForegroundColor Cyan
Write-Host ""

$qoderExe = "C:\Program Files\Qoder\Qoder.exe"

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Right-click PowerShell -> Run as Administrator" -ForegroundColor Cyan
    exit 1
}

Write-Host "[1] Checking if Qoder.exe exists..." -ForegroundColor Yellow
if (Test-Path $qoderExe) {
    Write-Host "    [OK] Found: $qoderExe" -ForegroundColor Green
} else {
    Write-Host "    [ERROR] Not found: $qoderExe" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2] Adding Qoder.exe to Windows Firewall..." -ForegroundColor Yellow

try {
    # Add inbound rule
    New-NetFirewallRule -DisplayName "Qoder - Inbound" `
                        -Direction Inbound `
                        -Program $qoderExe `
                        -Action Allow `
                        -Profile Any `
                        -ErrorAction Stop | Out-Null
    
    Write-Host "    [OK] Inbound rule added" -ForegroundColor Green
    
    # Add outbound rule
    New-NetFirewallRule -DisplayName "Qoder - Outbound" `
                        -Direction Outbound `
                        -Program $qoderExe `
                        -Action Allow `
                        -Profile Any `
                        -ErrorAction Stop | Out-Null
    
    Write-Host "    [OK] Outbound rule added" -ForegroundColor Green
    
} catch {
    if ($_.Exception.Message -match "already exists") {
        Write-Host "    [INFO] Firewall rules already exist" -ForegroundColor Yellow
        
        # Remove existing rules
        Write-Host ""
        Write-Host "[3] Removing old rules and recreating..." -ForegroundColor Yellow
        
        Remove-NetFirewallRule -DisplayName "Qoder - Inbound" -ErrorAction SilentlyContinue
        Remove-NetFirewallRule -DisplayName "Qoder - Outbound" -ErrorAction SilentlyContinue
        
        # Recreate
        New-NetFirewallRule -DisplayName "Qoder - Inbound" `
                            -Direction Inbound `
                            -Program $qoderExe `
                            -Action Allow `
                            -Profile Any | Out-Null
        
        New-NetFirewallRule -DisplayName "Qoder - Outbound" `
                            -Direction Outbound `
                            -Program $qoderExe `
                            -Action Allow `
                            -Profile Any | Out-Null
        
        Write-Host "    [OK] Rules recreated" -ForegroundColor Green
    } else {
        Write-Host "    [ERROR] Failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "[4] Verifying firewall rules..." -ForegroundColor Yellow
$rules = Get-NetFirewallRule -DisplayName "Qoder*" | Select-Object DisplayName, Direction, Action, Enabled

if ($rules) {
    $rules | Format-Table -AutoSize
    Write-Host "    [OK] Firewall rules verified" -ForegroundColor Green
} else {
    Write-Host "    [WARNING] Could not verify rules" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Qoder added to Windows Firewall!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart Qoder" -ForegroundColor White
Write-Host "2. Try Quest Mode again" -ForegroundColor White
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""
