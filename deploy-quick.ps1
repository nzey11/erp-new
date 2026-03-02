#!/usr/bin/env pwsh
# Quick deployment script

Write-Host "Extracting archive..." -ForegroundColor Green
ssh -i ~/.ssh/listopt_erp_new root@83.222.24.207 "cd /var/www/listopt-erp && tar -xzf /tmp/deploy.tar.gz"

Write-Host "Removing .next cache..." -ForegroundColor Green  
ssh -i ~/.ssh/listopt_erp_new root@83.222.24.207 "cd /var/www/listopt-erp && rm -rf .next"

Write-Host "Building application..." -ForegroundColor Green
ssh -i ~/.ssh/listopt_erp_new root@83.222.24.207 "cd /var/www/listopt-erp && npm run build"

Write-Host "Restarting PM2..." -ForegroundColor Green
ssh -i ~/.ssh/listopt_erp_new root@83.222.24.207 "pm2 restart listopt-erp"

Write-Host "Cleaning up..." -ForegroundColor Green
ssh -i ~/.ssh/listopt_erp_new root@83.222.24.207 "rm /tmp/deploy.tar.gz"

Write-Host "=== DEPLOYMENT COMPLETE ===" -ForegroundColor Cyan
