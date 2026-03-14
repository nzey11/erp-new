# Deploy v1 — Reference

## Deploy flow

```
git push origin main
  → pre-push hook (local): lint + typecheck + unit tests
  → GitHub Actions — job: verify
      npm ci
      prisma generate + db push (test DB)
      lint (nx affected)
      unit + integration tests
      e2e tests (Playwright)
      next build          ← only place build runs
      upload artifact
  → GitHub Actions — job: deploy  (only on push to main, only if verify passes)
      download artifact
      generate release.json
      pack release.tar.gz
      scp → /tmp/release.tar.gz on VPS
      SSH deploy block:
        create releases/<id>/
        extract archive
        ln -sf shared/.env .env
        npm ci
        prisma generate
        prisma migrate deploy
        ln -sfn releases/<id> current   ← atomic switch
        pm2 reload ecosystem.config.js --update-env
        copy scripts → bin/
        cleanup old releases (keep 7, protect current + bootstrap)
  → Smoke check (separate SSH step):
      wait up to 60s for pm2 status = online
      curl http://127.0.0.1:3000/api/version
      assert releaseId matches expected
      exit 1 on any failure → CI job fails → GitHub notifies
```

**Production never runs `next build`.**

---

## GitHub Secrets required

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | VPS IP address, e.g. `83.222.24.207` |
| `DEPLOY_USER` | SSH user on the server, e.g. `root` or `deploy` |
| `DEPLOY_SSH_KEY` | Private Ed25519 SSH key (full PEM block, including `-----BEGIN`/`-----END`) |
| `NX_CLOUD_ACCESS_TOKEN` | Optional — Nx remote cache. Remove from ci.yml if not used |

Set at: `https://github.com/<org>/<repo>/settings/secrets/actions`

---

## One-time server setup

Run once before the first deploy:

```bash
# 1. Create directory structure
mkdir -p /var/www/listopt-erp/{releases,shared,bin}

# 2. Create shared .env
cp /path/to/your/.env /var/www/listopt-erp/shared/.env
chmod 600 /var/www/listopt-erp/shared/.env

# 3. Bootstrap release (copy an initial build so pm2 can start)
#    Upload release.tar.gz manually, then:
mkdir -p /var/www/listopt-erp/releases/bootstrap
tar -xzf /tmp/release.tar.gz -C /var/www/listopt-erp/releases/bootstrap
ln -sf /var/www/listopt-erp/shared/.env /var/www/listopt-erp/releases/bootstrap/.env
cd /var/www/listopt-erp/releases/bootstrap && npm ci
npx prisma generate
npx prisma migrate deploy
ln -sfn /var/www/listopt-erp/releases/bootstrap /var/www/listopt-erp/current

# 4. Start pm2
pm2 start /var/www/listopt-erp/current/ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command to enable autostart

# 5. Add deploy public key to authorized_keys
echo "ssh-ed25519 AAAA... github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

## Server directory structure

```
/var/www/listopt-erp/
├── releases/
│   ├── bootstrap/          ← initial release, never deleted
│   ├── 20260313-120000/    ← release snapshot (immutable after deploy)
│   ├── 20260314-083000/
│   └── ...                 ← up to 7 releases kept (oldest auto-deleted)
├── shared/
│   └── .env                ← symlinked into every release as .env
├── current -> releases/20260314-083000/   ← symlink, points to active release
└── bin/
    ├── deploy-release.sh   ← stable path, updated after each deploy
    └── rollback-release.sh
```

---

## Checking the current release

```bash
# On the server:
cat /var/www/listopt-erp/current/release.json

# Via HTTP:
curl http://127.0.0.1:3000/api/version

# Expected response:
# { "releaseId": "20260314-083000", "gitSha": "abc1234...", "gitRef": "refs/heads/main", "builtAt": "2026-03-14T08:30:00Z" }
```

---

## Rollback

```bash
# Auto-selects previous release:
bash /var/www/listopt-erp/bin/rollback-release.sh

# Or specify a specific release:
bash /var/www/listopt-erp/bin/rollback-release.sh 20260313-120000
```

The rollback script:
1. Shows available releases and current
2. Prompts confirmation
3. Switches `current` symlink atomically
4. Runs `pm2 reload ecosystem.config.js --update-env`
5. Runs post-rollback smoke check (pm2 online + /api/version responds)

---

## Smoke check

Run automatically after every deploy and rollback. Checks:

1. **pm2 status** — waits up to 60s (12 × 5s) for `listopt-erp` to reach `online`
2. **HTTP** — `curl http://127.0.0.1:3000/api/version` must respond
3. **releaseId** — response `releaseId` must match the deployed release ID
4. **fatal on failure** — `exit 1` + `pm2 logs` dump → CI step fails → GitHub marks deploy red

---

## VersionBadge

Component [`components/VersionBadge.tsx`](../components/VersionBadge.tsx) — rendered in the sidebar footer.

- Fetches `/api/version` on mount (client-side only)
- Displays `rel 20260314-083000 · abc1234` in monospace, low-opacity
- Hidden in dev environment (when `release.json` is absent)
- Hidden when sidebar is collapsed

---

## Deploy v1 — Acceptance Checklist

- [ ] pre-push blocks push on lint / typecheck / unit test failure
- [ ] `verify` job blocks `deploy` job on any CI failure
- [ ] release artifact is built exclusively in CI (`next build` not on server)
- [ ] production server never runs `next build`
- [ ] `current` symlink is switched only after dependencies install + migrations
- [ ] `/api/version` returns active release metadata
- [ ] smoke check fails the deployment if app is not healthy or releaseId mismatches
- [ ] rollback switches `current` and reloads pm2 with smoke check
- [ ] UI sidebar shows release badge in production
- [ ] up to 7 releases retained; `bootstrap` and `current` are never deleted

---

## Source of truth files

| File | Role |
|------|------|
| `.github/workflows/ci.yml` | Full CI/CD pipeline definition |
| `scripts/deploy-release.sh` | Manual deploy (same logic as CI SSH block) |
| `scripts/rollback-release.sh` | Manual rollback with smoke check |
| `ecosystem.config.js` | pm2 app config (`cwd: /var/www/listopt-erp/current`) |
| `app/api/version/route.ts` | Runtime version endpoint |
| `components/VersionBadge.tsx` | UI release visibility |

---

## Possible v1.1 improvements (not blocking v1)

- Incremental builds: cache `.next/cache` between CI runs to reduce build time
- Prisma migration baseline: add conditional `migrate status` check to handle P3005 on first deploy to existing DB
- Slack/Telegram notification on deploy success/failure
- Health check endpoint beyond `/api/version` (e.g. DB ping)
