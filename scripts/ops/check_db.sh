#!/bin/bash
echo "=== Login test ==="
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  -w '\nHTTP_STATUS:%{http_code}\n'

echo ""
echo "=== PM2 logs (last 10) ==="
pm2 logs listopt-erp --lines 10 --nostream 2>&1 | tail -15
