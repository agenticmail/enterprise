# CLAUDE.md — Enterprise Repository Rules

## CRITICAL: This is a DEDICATED REPO

**Repo:** `github.com/agenticmail/enterprise`  
**Origin:** `https://github.com/agenticmail/enterprise.git`

### DO NOT:
- Push code from the monorepo (`agentic-mail/packages/enterprise`) directly — sync first
- Force push to `main`
- Commit `node_modules/`, `dist/`, `.env`, `*.db`, `*.sqlite` files
- Change the git remote origin
- Merge code from other packages into this repo

### DO:
- Work in this directory for enterprise-specific changes
- Run `npm run build` before committing to verify compilation
- Run `node live-test.mjs` to verify 33+ E2E tests pass
- Update `README.md` when changing API endpoints or features
- Update `CHANGELOG.md` for every version bump

### Sync Process (monorepo → dedicated repo)
If changes were made in `agentic-mail/packages/enterprise/`:
```bash
rsync -av --delete \
  --exclude='node_modules' --exclude='dist' --exclude='.git' --exclude='*.db' --exclude='*.sqlite' \
  ../agentic-mail/packages/enterprise/ .
```

### Key Files
- `src/dashboard/index.html` — Single-file React dashboard (entire UI)
- `src/server.ts` — Hono server entry point
- `src/auth/routes.ts` — Authentication (cookies + JWT)
- `src/admin/routes.ts` — Admin API endpoints
- `src/engine/routes.ts` — Engine API endpoints
- `live-test.mjs` — E2E test runner (33 tests)
- `test-integration.mjs` — Integration tests (94 tests)

### Current Version
Check `package.json` for current version. Published to npm as `@agenticmail/enterprise`.
