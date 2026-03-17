#!/bin/sh
set -e

echo "=== Starting development container ==="

# Generate Prisma client
echo ">>> Generating Prisma client..."
npx prisma generate

# Push schema changes
echo ">>> Pushing schema changes..."
npx prisma db push --accept-data-loss

# Check if admin user exists, if not seed
echo ">>> Checking if database needs seeding..."

# Use node to check user count (more reliable than prisma db execute)
USER_COUNT=$(node -e "
const { PrismaClient } = require('./lib/generated/prisma/client');
const prisma = new PrismaClient();
prisma.user.count().then(c => { console.log(c); prisma.\$disconnect(); });
" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo ">>> No users found, running seed..."
  npx prisma db seed
else
  echo ">>> Users exist ($USER_COUNT), skipping seed."
fi

# Clean .next cache
rm -rf /app/.next

# Start dev server
echo ">>> Starting Next.js dev server..."
exec npm run dev
