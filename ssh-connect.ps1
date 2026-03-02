# SSH Connection Script for New Server
$keyPath = "$env:USERPROFILE\.ssh\listopt_erp_new"
$server = "root@83.222.24.207"

Write-Host "Connecting to $server..." -ForegroundColor Cyan

# Test connection and get server info
ssh -i $keyPath -o StrictHostKeyChecking=no $server "echo 'SSH connection successful!'; echo ''; echo 'System Info:'; uname -a; echo ''; echo 'OS Release:'; cat /etc/os-release; echo ''; echo 'Disk Space:'; df -h /"
