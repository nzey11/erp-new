#!/bin/bash
# Server Setup Script for ListOpt ERP
# Ubuntu 24.04 LTS

set -e

echo "======================================"
echo "ListOpt ERP Server Setup"
echo "======================================"
echo ""

# Update system
echo "[1/7] Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20.x
echo "[2/7] Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install PostgreSQL
echo "[3/7] Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

echo "PostgreSQL version: $(psql --version)"

# Install PM2 globally
echo "[4/7] Installing PM2..."
npm install -g pm2

# Install Nginx
echo "[5/7] Installing Nginx..."
apt install -y nginx

# Start and enable Nginx
systemctl start nginx
systemctl enable nginx

# Create application directory
echo "[6/7] Creating application directory..."
mkdir -p /var/www/listopt-erp
chown -R $USER:$USER /var/www/listopt-erp

# Setup PostgreSQL database
echo "[7/7] Setting up PostgreSQL database..."
sudo -u postgres psql <<EOF
CREATE DATABASE listopt_erp;
CREATE USER listopt_user WITH ENCRYPTED PASSWORD 'change_me_in_production';
GRANT ALL PRIVILEGES ON DATABASE listopt_erp TO listopt_user;
ALTER DATABASE listopt_erp OWNER TO listopt_user;
\q
EOF

echo ""
echo "======================================"
echo "Server setup completed!"
echo "======================================"
echo ""
echo "Installed software:"
echo "- Node.js: $(node --version)"
echo "- NPM: $(npm --version)"
echo "- PostgreSQL: $(psql --version | head -n1)"
echo "- PM2: $(pm2 --version)"
echo "- Nginx: $(nginx -v 2>&1)"
echo ""
echo "Database created:"
echo "- Name: listopt_erp"
echo "- User: listopt_user"
echo "- Password: change_me_in_production"
echo ""
echo "Application directory: /var/www/listopt-erp"
echo ""
echo "Next steps:"
echo "1. Update database password in .env file"
echo "2. Deploy your application"
echo "3. Configure Nginx"
echo ""
