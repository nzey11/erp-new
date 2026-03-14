#!/bin/bash
# Manual release deploy script — run on the production server
# Use when you need to deploy manually without GitHub Actions
#
# Prerequisites:
#   - /tmp/release.tar.gz must exist (upload it manually via scp)
#
# Usage:
#   bash /var/www/listopt-erp/bin/deploy-release.sh

set -euo pipefail

BASE=/var/www/listopt-erp
SHARED_DIR=$BASE/shared
BIN_DIR=$BASE/bin

# ── Read canonical RELEASE_ID from archive (matches release.json built in CI) ─
# Allows passing RELEASE_ID from outside (e.g. CI env); falls back to archive.
if [[ -z "${RELEASE_ID:-}" ]]; then
    RELEASE_ID=$(tar -xzOf /tmp/release.tar.gz ./release.json 2>/dev/null \
      | grep -o '"releaseId":"[^"]*"' | cut -d'"' -f4 || echo "")
fi
# Final fallback: use current timestamp
if [[ -z "${RELEASE_ID:-}" ]]; then
    RELEASE_ID=$(date -u +%Y%m%d-%H%M%S)
    echo "  Note: could not read releaseId from archive — using timestamp: $RELEASE_ID"
fi

RELEASE_DIR=$BASE/releases/$RELEASE_ID
echo "==> Starting manual deploy: $RELEASE_ID"

# ── Validate prerequisites ────────────────────────────────────────────────────
if [[ ! -f /tmp/release.tar.gz ]]; then
    echo "ERROR: /tmp/release.tar.gz not found."
    echo "Upload it first:"
    echo "  scp release.tar.gz user@server:/tmp/release.tar.gz"
    exit 1
fi

if [[ ! -f "$SHARED_DIR/.env" ]]; then
    echo "ERROR: $SHARED_DIR/.env not found."
    echo "Create it before first deploy:"
    echo "  mkdir -p $SHARED_DIR && cp /path/to/your/.env $SHARED_DIR/.env"
    exit 1
fi

# ── Create release directory ──────────────────────────────────────────────────
echo "==> Creating release directory: $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# ── Extract archive ───────────────────────────────────────────────────────────
echo "==> Extracting archive"
tar -xzf /tmp/release.tar.gz -C "$RELEASE_DIR"

# ── Link shared .env ──────────────────────────────────────────────────────────
echo "==> Linking shared .env"
ln -sf "$SHARED_DIR/.env" "$RELEASE_DIR/.env"

# ── Install dependencies ──────────────────────────────────────────────────────
# Full install (not --omit=dev) because prisma CLI is needed for migrate/generate.
# prisma is now in dependencies, but full install is safer.
echo "==> Installing dependencies"
cd "$RELEASE_DIR"
npm ci

# ── Prisma ────────────────────────────────────────────────────────────────────
echo "==> Generating Prisma client"
npx prisma generate

echo "==> Running migrations"
npx prisma migrate deploy

# ── Switch symlink (atomic — old release stays untouched until this point) ────
echo "==> Switching current symlink"
ln -sfn "$RELEASE_DIR" "$BASE/current"

# ── Reload pm2 ────────────────────────────────────────────────────────────────
echo "==> Reloading pm2"
pm2 reload "$BASE/current/ecosystem.config.js" --update-env

# ── Persist deployment scripts to stable bin/ location ───────────────────────
# bin/ is outside releases so scripts survive across deploys and rollbacks
echo "==> Installing deployment scripts to $BIN_DIR"
mkdir -p "$BIN_DIR"
cp "$RELEASE_DIR/scripts/deploy-release.sh"  "$BIN_DIR/deploy-release.sh"
cp "$RELEASE_DIR/scripts/rollback-release.sh" "$BIN_DIR/rollback-release.sh"
chmod +x "$BIN_DIR/"*.sh

# ── Cleanup ───────────────────────────────────────────────────────────────────
echo "==> Cleaning old releases (keep last 7, protect current + bootstrap)"
CURRENT_REAL=$(readlink -f "$BASE/current" 2>/dev/null | sed 's:/$::')
find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d \
  | xargs -I{} basename {} \
  | grep -v '^bootstrap$' \
  | sort -r \
  | tail -n +8 \
  | xargs -I{} echo "$BASE/releases/{}" \
  | grep -v "^${CURRENT_REAL}$" \
  | xargs -r rm -rf

rm -f /tmp/release.tar.gz

# ── Smoke check ───────────────────────────────────────────────────────────────
echo "==> Smoke check: waiting for app to come online..."
STATUS=""
for i in $(seq 1 12); do
    STATUS=$(pm2 list --no-color 2>/dev/null | grep listopt-erp | grep -o 'online\|stopped\|errored' | head -1 || echo "unknown")
    if [[ "$STATUS" == "online" ]]; then break; fi
    echo "  Attempt $i/12: status=$STATUS, waiting 5s..."
    sleep 5
done

if [[ "$STATUS" != "online" ]]; then
    echo "ERROR: App did not come online after 60s"
    pm2 logs listopt-erp --lines 50 --nostream
    exit 1
fi

RESPONSE=$(curl -sf http://127.0.0.1:3000/api/version 2>/dev/null || echo "")
if [[ -z "$RESPONSE" ]]; then
    echo "ERROR: /api/version did not respond"
    pm2 logs listopt-erp --lines 30 --nostream
    exit 1
fi

ACTIVE_ID=$(echo "$RESPONSE" | grep -o '"releaseId":"[^"]*"' | cut -d'"' -f4 || echo "")

if [[ -z "$ACTIVE_ID" || "$ACTIVE_ID" == "unknown" ]]; then
    echo "ERROR: /api/version returned unknown or empty releaseId"
    pm2 logs listopt-erp --lines 30 --nostream
    exit 1
fi

if [[ "$ACTIVE_ID" != "$RELEASE_ID" ]]; then
    echo "ERROR: releaseId mismatch"
    echo "Active:   $ACTIVE_ID"
    echo "Expected: $RELEASE_ID"
    pm2 logs listopt-erp --lines 30 --nostream
    exit 1
fi

echo ""
echo "==> Deploy complete  : $RELEASE_ID"
echo "==> Active releaseId : $ACTIVE_ID"
pm2 list
