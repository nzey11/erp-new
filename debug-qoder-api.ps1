# Debug Qoder API Connection
# This script helps diagnose Quest Mode errors

Write-Host "=== Qoder API Debug ===" -ForegroundColor Cyan
Write-Host ""

# Read token
$tokenPath = "$env:LOCALAPPDATA\Programs\Qoder\resources\app\resources\cache\machine_token.json"
if (Test-Path $tokenPath) {
    $tokenData = Get-Content $tokenPath | ConvertFrom-Json
    $token = $tokenData.token
    Write-Host "[1] Token found" -ForegroundColor Green
    Write-Host "    Token type: $($tokenData.type)" -ForegroundColor White
    Write-Host "    Token (first 20 chars): $($token.Substring(0, 20))..." -ForegroundColor White
} else {
    Write-Host "[ERROR] Token not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2] Testing different API endpoints..." -ForegroundColor Yellow
Write-Host ""

# Test endpoints
$endpoints = @(
    "https://api2.qoder.sh/algo/api/v1/ping",
    "https://api2.qoder.sh/algo/api/v1/user/info",
    "https://api2.qoder.sh/algo/api/v1/user/credit",
    "https://api2.qoder.sh/quest/api/v1/health",
    "https://api2.qoder.sh/quest/api/v1/task/list"
)

foreach ($endpoint in $endpoints) {
    Write-Host "Testing: $endpoint" -ForegroundColor Cyan
    
    try {
        $headers = @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }
        
        $response = Invoke-WebRequest -Uri $endpoint -Headers $headers -Method GET -UseBasicParsing -ErrorAction Stop
        Write-Host "  Status: $($response.StatusCode) OK" -ForegroundColor Green
        Write-Host "  Response: $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))..." -ForegroundColor White
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.Value__
        Write-Host "  Status: $statusCode ERROR" -ForegroundColor Red
        
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "  Error: $responseBody" -ForegroundColor Yellow
        } else {
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
}

Write-Host ""
Write-Host "[3] Checking cache files..." -ForegroundColor Yellow
$cacheDir = "$env:LOCALAPPDATA\Programs\Qoder\resources\app\resources\cache"

$files = @("app-config.json", "cache.json", "client.json", "credit", "id")
foreach ($file in $files) {
    $filePath = Join-Path $cacheDir $file
    if (Test-Path $filePath) {
        $size = (Get-Item $filePath).Length
        Write-Host "  $file - EXISTS ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "  $file - MISSING" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[4] Current region setting..." -ForegroundColor Yellow
$cacheJson = Get-Content "$cacheDir\cache.json" | ConvertFrom-Json
Write-Host "  Region: $($cacheJson.regionEnv)" -ForegroundColor White

Write-Host ""
Write-Host "=== Debug Complete ===" -ForegroundColor Cyan
Write-Host ""
