#!/bin/bash
# Manual rollback script — switches current to a previous release
#
# Usage:
#   bash /var/www/listopt-erp/bin/rollback-release.sh            — auto-selects previous
#   bash /var/www/listopt-erp/bin/rollback-release.sh 20260313-195300  — specific release

set -euo pipefail

BASE=/var/www/listopt-erp
RELEASES_DIR=$BASE/releases
CURRENT_LINK=$BASE/current

# ── Show current state ────────────────────────────────────────────────────────
CURRENT=$(readlink -f "$CURRENT_LINK" 2>/dev/null || echo "")
CURRENT_ID=$(basename "$CURRENT" 2>/dev/null || echo "none")

echo "==> Current release: $CURRENT_ID"
echo ""
echo "Available releases (newest first):"
ls -dt "$RELEASES_DIR"/*/ 2>/dev/null | while read -r d; do
    ID=$(basename "$d")
    if [[ "$ID" == "$CURRENT_ID" ]]; then
        echo "  * $ID  ← current"
    else
        echo "    $ID"
    fi
done
echo ""

# ── Determine target release ──────────────────────────────────────────────────
if [[ -n "${1:-}" ]]; then
    TARGET_ID="$1"
    TARGET_DIR="$RELEASES_DIR/$TARGET_ID"
    if [[ ! -d "$TARGET_DIR" ]]; then
        echo "ERROR: Release '$TARGET_ID' not found in $RELEASES_DIR"
        exit 1
    fi
else
    # Auto-select the previous release (skip current)
    TARGET_DIR=$(ls -dt "$RELEASES_DIR"/*/ 2>/dev/null | grep -v "/$CURRENT_ID/" | head -n 1)
    TARGET_DIR="${TARGET_DIR%/}"
    TARGET_ID=$(basename "$TARGET_DIR")

    if [[ -z "${TARGET_DIR:-}" ]]; then
        echo "ERROR: No previous release found. Cannot rollback."
        exit 1
    fi
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
echo "==> Target rollback release: $TARGET_ID"
read -rp "Confirm rollback? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Rollback cancelled."
    exit 0
fi

# ── Switch symlink ────────────────────────────────────────────────────────────
echo "==> Switching current symlink to $TARGET_ID"
ln -sfn "$TARGET_DIR" "$CURRENT_LINK"

# ── Reload pm2 ────────────────────────────────────────────────────────────────
echo "==> Reloading pm2"
pm2 reload "$CURRENT_LINK/ecosystem.config.js" --update-env

# ── Post-rollback smoke check ──────────────────────────────────────────
echo "==> Smoke check: waiting for app to come online after rollback..."
STATUS=""
for i in $(seq 1 12); do
    STATUS=$(pm2 list --no-color 2>/dev/null | grep listopt-erp | grep -o 'online\|stopped\|errored' | head -1 || echo "unknown")
    if [[ "$STATUS" == "online" ]]; then break; fi
    echo "  Attempt $i/12: status=$STATUS, waiting 5s..."
    sleep 5
done

if [[ "$STATUS" != "online" ]]; then
    echo "ERROR: App did not come online after rollback (status: $STATUS)"
    pm2 logs listopt-erp --lines 50 --nostream
    exit 1
fi

RESPONSE=$(curl -sf http://127.0.0.1:3000/api/version 2>/dev/null || echo "")
if [[ -z "$RESPONSE" ]]; then
    echo "ERROR: /api/version did not respond after rollback"
    pm2 logs listopt-erp --lines 30 --nostream
    exit 1
fi

ACTIVE_ID=$(echo "$RESPONSE" | grep -o '"releaseId":"[^"]*"' | cut -d'"' -f4 || echo "")
if [[ -z "$ACTIVE_ID" || "$ACTIVE_ID" == "unknown" ]]; then
    echo "ERROR: /api/version returned unknown releaseId after rollback"
    pm2 logs listopt-erp --lines 30 --nostream
    exit 1
fi

echo "==> Rollback smoke check passed"
echo "==> Active releaseId: $ACTIVE_ID"

echo ""
echo "==> Rollback complete. Now running: $TARGET_ID"
pm2 list
