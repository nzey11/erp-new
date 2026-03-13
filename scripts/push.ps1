#!/usr/bin/env pwsh
# Quick push to origin/main
# Usage:
#   npm run push                    — prompts for commit message
#   npm run push -- "fix: my msg"  — uses provided message

param(
    [string]$Message = ""
)

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

# ── Git user (set once, cached in global config) ─────────────────────────────
$currentName  = git config user.name  2>$null
$currentEmail = git config user.email 2>$null

if (-not $currentName) {
    git config --global user.name "nzey11"
    Write-Host "  git user.name set to 'nzey11'" -ForegroundColor DarkGray
}
if (-not $currentEmail) {
    git config --global user.email "nzey11@users.noreply.github.com"
    Write-Host "  git user.email set to placeholder" -ForegroundColor DarkGray
}

# ── Status check ─────────────────────────────────────────────────────────────
$status = git status --porcelain
if (-not $status) {
    Write-Host "Nothing to commit — working tree clean." -ForegroundColor Yellow
    exit 0
}

# ── Commit message ───────────────────────────────────────────────────────────
if (-not $Message) {
    Write-Host ""
    Write-Host "Changed files:" -ForegroundColor Cyan
    git status --short
    Write-Host ""
    $Message = Read-Host "Commit message (Enter = auto)"
}

if (-not $Message) {
    $date    = Get-Date -Format "yyyy-MM-dd HH:mm"
    $branch  = git rev-parse --abbrev-ref HEAD 2>$null
    $Message = "chore: update $branch $date"
}

# ── Stage all + commit ────────────────────────────────────────────────────────
Write-Host ""
Write-Host ">> git add ." -ForegroundColor DarkGray
git add .

Write-Host ">> git commit: $Message" -ForegroundColor DarkGray
git commit -m $Message

# ── Push → pre-push hook runs automatically (lint + typecheck + unit tests) ──
Write-Host ""
Write-Host ">> git push origin main  (pre-push hook will run check:fast)" -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "Done. GitHub Actions will handle integration/e2e/build/deploy." -ForegroundColor Green
