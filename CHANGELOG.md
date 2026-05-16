# Changelog

All notable changes to AgenticMail Enterprise are documented here.

## [0.5.575] - 2026-05-16

### Added — Recurring task scheduler

Agents can now be put on durable, cron-style schedules. A template task with a `recurrenceRule` fires repeatedly forever; each fire spawns a fresh queued execution row that the existing session router picks up and routes to the agent like any other task.

Use case that drove this: setting up halo (growth/devrel agent) on a recurring "growth shift" — wake three times a day on weekdays, read the latest CHANGELOG, post to X via the browser tool, engage with recent mentions, log what shipped. Previously `task_queue.scheduled_for` only supported one-shot future tasks; there was no native recurrence.

### New endpoints

```
POST   /api/engine/workforce/recurring-tasks   { agentId, title, description, recurrenceRule, recurrenceTimezone? }
GET    /api/engine/workforce/recurring-tasks   [?agentId=...]
PATCH  /api/engine/workforce/recurring-tasks/:id   { title?, description?, recurrenceRule?, recurrenceTimezone?, priority?, context?, enabled? }
DELETE /api/engine/workforce/recurring-tasks/:id
```

`recurrenceRule` is a standard 5-field cron expression (`minute hour day-of-month month day-of-week`). `recurrenceTimezone` is an IANA timezone name; defaults to UTC. Examples:

- `0 9,13,18 * * 1-5` (America/Chicago) — 9am, 1pm, 6pm on weekdays, Chicago time
- `0 8 * * 1` (Europe/London) — 8am every Monday, London time
- `*/30 * * * *` — every 30 minutes

### How it works

A row with `recurrence_rule` set is a TEMPLATE (`status='template'`) — it never executes itself. The workforce scheduler, on its 60s tick, queries for templates with `next_fire_at <= now`, clones each into a `status='queued'` execution row (`parent_task_id` links back to the template), and recomputes `next_fire_at` from the cron rule. Templates are hidden from the normal `getAgentTasks` listing so dashboard task views don't get cluttered.

The cron evaluator (`src/engine/cron.ts`) is timezone-aware via `Intl.DateTimeFormat`. DST jumps are handled by re-projecting each candidate minute through the IANA zone. A 1-hour minimum step on day-mismatch keeps it correct across UTC-offset boundaries (a naive "skip to next UTC day" would leapfrog valid local-day windows in non-UTC timezones).

### Schema (migration v33)

```sql
ALTER TABLE task_queue ADD COLUMN recurrence_rule TEXT;
ALTER TABLE task_queue ADD COLUMN recurrence_timezone TEXT;
ALTER TABLE task_queue ADD COLUMN parent_task_id TEXT;
ALTER TABLE task_queue ADD COLUMN next_fire_at TEXT;
ALTER TABLE task_queue ADD COLUMN last_fired_at TEXT;
```

### Operator action

`npm install -g @agenticmail/enterprise@latest && pm2 restart all`. The migration runs on boot. To schedule halo's growth shift today:

```bash
curl -X POST http://127.0.0.1:8080/api/engine/workforce/recurring-tasks \
  -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  -d '{
    "agentId": "<halo-id>",
    "title": "Growth shift",
    "description": "Search KB for what shipped recently. Pick one item. Post to X via browser tool. Reply to 3-5 mentions.",
    "recurrenceRule": "0 9,13,18 * * 1-5",
    "recurrenceTimezone": "America/Chicago"
  }'
```

## [0.5.574] - 2026-05-16

### Fixed — `PUT /api/engine/knowledge-bases/:id` never persisted to DB

After 0.5.573 fixed the embedding-format mismatch, search still returned 0 hits. The KB engine logged "Loaded KB 'AgenticMail Project Knowledgebase' with 53 docs" and embeddings decoded correctly, but `kb.agentIds = []` meant the search filter at `knowledge.ts:406` rejected every KB.

Re-running the PUT to set `agentIds` returned 200 with the new value echoed in the response — but the DB column stayed `[]`.

Two bugs in the same route handler:

1. **Wrong field name**: route accessed `(knowledgeBase as any).db` but the engine stores its adapter as `engineDb`. The `if ((knowledgeBase as any).db) { ... }` branch evaluated false every time → the UPDATE SQL never ran.
2. **Wrong method name**: the (never-reached) UPDATE called `db.execute(...)`, but the EngineDatabase adapter exposes `run(...)` for parameterized writes — `execute` is undefined.

Both were silenced by the surrounding `try / catch { /* in-memory only fallback */ }`. Operators got 200 OK from every PUT, dashboard-side "assign agent" appeared to succeed, and search broke silently because the persisted `agent_ids` stayed empty.

### Fix

`src/engine/knowledge-routes.ts`:
- Access the adapter as `engineDb` (the field's real name)
- Call `.run(sql, params)` (the method's real name)
- On error, log the failure instead of silently swallowing it

### Operator action

`npm install -g @agenticmail/enterprise@latest && pm2 restart all`. If your KB has `agent_ids = []` from prior PUTs that silently failed, just re-assign in the dashboard (or `curl -X PUT /api/engine/knowledge-bases/<id> -d '{"agentIds":["<agent-id>"]}'`) — this time it'll actually persist.

## [0.5.573] - 2026-05-16

### Fixed — RAG search returned 0 hits despite chunks being embedded

Continuation of the 0.5.571 / 0.5.572 RAG saga. After embeddings were generated and verified at the DB layer (1118/1118 chunks had non-NULL `embedding` columns), `knowledge_base_search` still returned `No results found` for every query.

Two bugs:

### 1. Embedding format mismatch in storage vs decode

`db-adapter.ts insertKBDocument` writes embeddings as **binary `Float32Array` buffers** (Float32 bytes packed into a SQL blob). `getKBDocuments` decoded them with `new Float32Array(c.embedding)`.

But `regenerateEmbeddings` (0.5.572) and the inline-embed in `import-manager.ts insertChunk` (also 0.5.572) wrote embeddings as **JSON-stringified number arrays** (`JSON.stringify(vec)`). When the decoder hit those strings, `new Float32Array(<utf-8 bytes>)` reinterpreted the JSON characters as IEEE-754 floats — producing garbage values, NaN-ish or wildly out-of-range. Cosine similarity against garbage = ~0, never above the 0.7 minScore threshold.

Fix: new `decodeEmbedding(val)` helper at the top of `db-adapter.ts` that detects the format. Supports:
- Float32 Buffer (legacy, original format from `addDocument` path)
- JSON string (newer, from `regenerateEmbeddings` and `import-manager`)
- Buffer-wrapping-a-JSON-string (some Postgres drivers return TEXT columns as Buffer)
- Plain `number[]` (in-memory pass-through)

Includes a sanity check: if the bytes look like Float32 but the values are out-of-range for real embeddings (|val| > 100), it falls through to string-parse.

### 2. `warnAboutMissingEmbeddings` used a PostgreSQL-only `FILTER (WHERE …)` clause

The engine adapter doesn't support FILTER syntax — fails with `syntax error at or near "FILTER"`. Replaced with portable `SUM(CASE WHEN c.embedding IS NULL THEN 1 ELSE 0 END)`.

### Operator action

`npm install -g @agenticmail/enterprise@latest && pm2 restart all` — no DB changes or re-embedding needed. The fix is purely on the read path. Existing JSON-string embeddings from 0.5.572 now decode correctly, and the startup warning runs without syntax errors.

If you still see `[knowledge] ⚠️` warnings about missing embeddings after this release, follow the `POST /api/engine/knowledge-bases/<id>/regenerate-embeddings` instruction in the log — that endpoint is now confirmed working end-to-end.

### Why FOUR releases (0.5.570 → 0.5.573) to make RAG work

- 0.5.570 — visibility into permission profiles (unrelated; surfaced separately)
- 0.5.571 — wired `dbApiKeys` into `KnowledgeBaseEngine.setApiKeys()` (which had never been called)
- 0.5.572 — taught the import-manager to actually call OpenAI during chunk insert + added the backfill endpoint + startup warning
- 0.5.573 — fixed the format mismatch between storage and decode that made every embedding read as garbage

Each release fixed one real bug. None of them alone would have produced working search.

## [0.5.572] - 2026-05-16

### Fixed — KB import path now embeds inline + new `/regenerate-embeddings` endpoint + startup warning

Three fixes for the broken RAG path that traced back to 0.5.571:

### 1. Import flow now embeds inline

`src/engine/knowledge-import/import-manager.ts insertChunk` previously wrote chunks with `embedding=NULL` and never called OpenAI. The `generateEmbeddings` method on `KnowledgeBaseEngine` was orphaned — only callable from `KnowledgeBaseEngine.addDocument` which the dashboard's "Import from GitHub / URL / SharePoint" pipeline never uses.

Now `insertChunk`:
- Calls `embedBatch([chunk.content])` against OpenAI using the API key wired into `KnowledgeBaseEngine.apiKeys` (the 0.5.571 fix)
- INSERTs the chunk row with the embedding column populated in one shot
- Falls back to writing `embedding=NULL` if the embedding call fails (better to keep the chunk content than abort the entire import) — the backfill endpoint below catches the un-embedded chunks later

Result: every new import via the dashboard now produces a fully-searchable KB. No manual scripting needed.

### 2. New endpoint: `POST /api/engine/knowledge-bases/:id/regenerate-embeddings`

For operators upgrading from 0.5.571 or earlier who already have un-embedded chunks sitting in their DB:

```bash
curl -X POST https://<your-domain>/api/engine/knowledge-bases/<kb-id>/regenerate-embeddings \
  -H "X-API-Key: <your-master-key>"
```

Response:
```json
{ "ok": true, "total": 1118, "embedded": 1118, "alreadyEmbedded": 0, "skipped": 0, "errors": 0 }
```

Runs synchronously (batches 100 chunks per OpenAI call; 1k chunks ≈ 30-60 s). Idempotent — chunks that already have embeddings are skipped. Implemented as `KnowledgeBaseEngine.regenerateEmbeddings(kbId)` and surfaced via the `/regenerate-embeddings` route.

### 3. Startup warning when a KB has chunks without embeddings

Most operators won't know they need to call the endpoint above. Enterprise now runs `warnAboutMissingEmbeddings()` 5 s after boot (after the KB list + API keys are loaded) and prints a loud log line per affected KB:

```
[knowledge] ⚠️  KB "AgenticMail Project Knowledgebase" has 1118/1118 chunks WITHOUT embeddings.
[knowledge]    Embedding provider: openai  (key present)
[knowledge]    RAG search will return 0 hits until embeddings are generated.
[knowledge]    Fix: POST /api/engine/knowledge-bases/1344a7aa-…/regenerate-embeddings
```

If the embedding provider key is missing (e.g. operator hasn't added one yet), the suggested fix changes to "add ${provider} key in Settings → Models & API Keys, then call regenerate-embeddings."

Surfaces the bug + the exact recovery command in the same place operators look when triaging — no need to know about the endpoint out-of-band.

### Why three releases (0.5.570 → 0.5.571 → 0.5.572) to fix this

- 0.5.570 added visibility into permission profiles, didn't touch knowledge
- 0.5.571 wired `dbApiKeys` → `KnowledgeBaseEngine.setApiKeys()` (which had never been called) — necessary but not sufficient
- 0.5.572 is the actual fix: the import-manager bypassed the engine's embedding code path entirely, so wiring keys to the engine didn't help. Embedding had to happen INSIDE `insertChunk` (or via a backfill pass), which is what this release does

### Files

- `src/engine/knowledge.ts` — `regenerateEmbeddings(kbId)` + `warnAboutMissingEmbeddings()`
- `src/engine/knowledge-routes.ts` — `POST /knowledge-bases/:id/regenerate-embeddings`
- `src/engine/knowledge-import/import-manager.ts` — `getEmbeddingKey()` + `embedBatch()` + `insertChunk` writes the embedding column
- `src/server.ts` — calls `warnAboutMissingEmbeddings()` 5s post-boot

### Existing operators

```bash
npm install -g @agenticmail/enterprise@latest && pm2 restart all
# Watch the enterprise log for "[knowledge] ⚠️" lines after boot.
# For each affected KB, run:
curl -X POST http://127.0.0.1:8080/api/engine/knowledge-bases/<kb-id>/regenerate-embeddings -H "X-API-Key: <master-key>"
```

## [0.5.571] - 2026-05-16

### Fixed — KnowledgeBaseEngine.setApiKeys() was never called

Operator-reported: configured OpenAI key in `Settings → Models & API Keys`, triggered a fresh GitHub import — job marked "completed", 1148 chunks created — but `knowledge_search` returned `No results found` for every query. Vector search couldn't find anything.

Root cause: `src/engine/knowledge.ts KnowledgeBaseEngine` has a public `setApiKeys(keys)` method (line 95), but **nothing in the codebase called it**. So `this.apiKeys` stayed `{}` for the entire process lifetime. When `generateEmbeddings` ran for a fresh import, line 497 (`const apiKey = this.apiKeys.openai; if (!apiKey) return;`) bailed silently and no embeddings ever got generated. Chunks were stored, but `embedding` column stayed NULL.

Result: every operator who'd ever added an OpenAI key thought RAG was working (UI showed chunks, import jobs succeeded), but the KB was effectively keyword-search only — and even that depended on `loadFromDb` populating in-memory `kb.documents[].chunks[]`. Operators reported it as "the agent doesn't read the knowledge base."

### What changed

Two places now wire `dbApiKeys` → `KnowledgeBaseEngine.setApiKeys`:

1. **`src/cli-agent.ts`** — when the per-agent process loads provider API keys from `company_settings.modelPricingConfig`, it now also calls `routes.knowledgeBase.setApiKeys(dbApiKeys)`. The 30s refresh poll repeats the call so dashboard-side key updates land without an agent restart.
2. **`src/server.ts`** — the enterprise process loads its own provider keys for `config.runtime.apiKeys`; now it also passes the decrypted map to `routes.knowledgeBase.setApiKeys()`. Logs `[knowledge] API keys wired to embedding engine: openai, ...` so operators can confirm.

### How to recover an existing un-embedded KB

`generateEmbeddings` only fires during initial chunk creation. Existing chunks created BEFORE this fix won't get embeddings just from upgrading. Two options:

- **Delete + re-import** (cleanest, ~1 min):
  ```sql
  DELETE FROM kb_chunks WHERE document_id IN (SELECT id FROM kb_documents WHERE knowledge_base_id='<kbId>');
  DELETE FROM kb_documents WHERE knowledge_base_id='<kbId>';
  ```
  Then trigger import again via the dashboard.

- **Manually call `generateEmbeddings`** via a one-off script if you have lots of chunks you don't want to re-fetch. Not exposed as an endpoint yet — TODO for 0.5.572+.

### Defensive fallback already in place

Even without embeddings, `KnowledgeBaseEngine.search()` falls back to `keywordScore` (line 294 in `knowledge.ts`) — but the default `minSimilarityScore: 0.7` is too tight for keyword search (you'd need 70% of query words present in a chunk). Worth lowering for keyword-fallback mode in a future release.

## [0.5.570] - 2026-05-16

### Added — surface the active permission profile in the engine log

Operator-reported (session continuing the local-deploy thread): "the agent is having access issue for tools or even browser even though i enabled all tools for it."

Diagnosis from the DB: their permission profile in `permission_profiles` was actually `"Customer Support Agent"` (`maxRiskLevel: medium`, `requireApproval: enabled`, narrow skills allowlist) — almost certainly applied by the dashboard's Permissions tab when the operator clicked a preset card. They thought they were ADDING permissions; they were REPLACING them.

There was no log line saying which profile was active. Operators couldn't tell the dashboard's preset had overwritten the prior "Full Access (Owner)" config. They diagnosed for an hour while halo silently rejected every tool call.

### What changed

`src/engine/skills.ts`:

1. **`setDb()` startup log** now lists every loaded permission profile with its name, max risk level, skills mode (allowlist/blocklist), skills list length, and require-approval flag. Example output:

```
[permissions] Loaded 1 permission profiles from DB
[permissions]   • agent=db38522f…  profile="Full Access (Owner)"  maxRisk=critical  skills=blocklist(0)  requireApproval=false
```

2. **`setProfile()` mid-run log** prints a one-liner when a profile is replaced (via the dashboard's preset picker or any other path):

```
[permissions] setProfile agent=db38522f…  "Full Access (Owner)" → "Customer Support Agent"  maxRisk=medium  skills=allowlist(7)  requireApproval=true
```

3. **`refreshProfiles()` diff-only log** — the 30s background refresh now detects actual changes vs the in-memory copy and logs only when something differs (so the log doesn't spam every 30 seconds with unchanged profiles). Surfaces the moment a dashboard edit lands in the running engine.

### Operator action

`npm install -g @agenticmail/enterprise@latest && pm2 restart all`. Next time tool calls get blocked, the enterprise log + halo-agent log both make it obvious which profile is in effect.

## [0.5.569] - 2026-05-16

### Fixed — three structural bugs causing agents to silently use stale config

Three related issues all surfaced during one operator session — PM2's saved env was pinning the enterprise to a pre-migration Supabase DATABASE_URL, the messaging-poller refused to dispatch to agents in the `ready` lifecycle state, and partial config updates from the dashboard were nuking unrelated fields by shallow-replace.

### 1. `start.cjs` must overwrite from `.env`, not honor PM2's stale env

The setup-wizard's generated `start.cjs` had this env-load loop:

```js
if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
```

`!process.env[m[1]]` was meant to "respect existing env vars" but in practice PM2's `dump.pm2` captures the entire env at `pm2 save` time and replays it on resurrect. If an operator changed `~/.agenticmail/.env` after a `pm2 save` (e.g. migrated their DB), the on-disk `.env` was silently ignored and the app kept using the cached env — including a dead Supabase URL.

Symptom (Windows operator): "I migrated to local Postgres, restarted enterprise, but it still says `Connected (..., pgbouncer=true)` and the local DB stays empty for new dashboard saves." The Supabase pooler hostname triggered the `db/factory.ts` Supabase auto-detect even though `.env` clearly didn't have a Supabase URL.

Fixed in `src/setup/provision.ts` — `start.cjs` generator now does `if (m) process.env[m[1]] = m[2];` (always overwrite). The on-disk `.env` is the canonical source.

### 2. `messaging-poller` rejected agents in `ready` state

`src/engine/routes.ts startMessagingPoller` filtered agents by lifecycle state:

```js
a.state === 'running' || a.state === 'draft' || a.state === 'stopped' || (a as any).status === 'active'
```

Agents in state `ready` (the natural post-restore-from-backup state, also the state right after creation before deploy) were silently filtered out → `[messaging-poller] No active agents` → Telegram/WhatsApp messages dispatched into the void.

Fixed: filter now also accepts `state === 'ready'`. The downstream dispatcher already handles connection failures gracefully if the agent isn't actually listening.

### 3. `lifecycle.hotUpdate` shallow-merge dropped sibling fields

`updateConfig` and `hotUpdate` did:

```js
const merged = { ...agent.config, ...updates };
// then deep-merge for identity / model / deployment only
```

If the dashboard sent `{permissions: {requireApproval: {enabled: false}}}` (just toggling one nested flag), the entire `permissions` object got replaced — losing `rateLimits`, `constraints`, `blockedSideEffects`, etc. Same risk for `autonomy`. And an empty `skills: []` from a misbehaved form would clear all 32 of an agent's skills.

Fixed: deep-merge now extends to `permissions` (+ its `requireApproval` sub-object) and `autonomy`. Empty `skills` / `knowledgeBases` arrays in a partial update are treated as oversights and the previous value is preserved.

### Files

- `src/setup/provision.ts` — `start.cjs` generator: drop the `!process.env[key]` guard
- `src/engine/routes.ts` — messaging-poller filter accepts `ready` state
- `src/engine/lifecycle.ts` — `updateConfig` + `hotUpdate` deep-merge `permissions` and `autonomy`; preserve `skills` and `knowledgeBases` against accidental empty-array replacement

### Existing operators

For #1: `pm2 delete enterprise && pm2 start ~/.agenticmail/start.cjs --name enterprise && pm2 save` clears the stale dump, OR re-run `npx @agenticmail/enterprise@latest setup` to regenerate `start.cjs`. After upgrading the package, the cleaner future is automatic.

For #2 and #3: just `pm2 restart enterprise` after upgrade.

## [0.5.568] - 2026-05-16

### Fixed — Provider API keys don't hot-reload in running agent processes

Operator (Windows): "I just re-updated the API key and it's saved to DB but it's not hot loading, nothing is hotloading on the window but this was working on mac."

Root cause: the agent process loads `dbApiKeys` ONCE at boot in `src/cli-agent.ts:547` from `company_settings.modelPricingConfig.providerApiKeys`. After that, it's a static object for the lifetime of the process. The enterprise process hot-reloads via its in-process `configBus.onConfigKey()` listeners — but the agent is a SEPARATE PM2 process, so it never sees those events.

Why it "worked on Mac": operators on Mac were probably running enterprise and agent in the same Node process during dev, OR they were restarting the agent after each key change without realizing it. On Windows with everything in PM2-managed separate processes, the behavior surfaced.

### What changed

`src/cli-agent.ts` — `dbApiKeys` is now refreshed every 30 seconds via a `setInterval` poll of `db.getSettings()`. The refresh uses an in-place mutation pattern (delete-then-assign) so the same object reference passed to `createAgentRuntime({ apiKeys: dbApiKeys })` is preserved — the runtime's `resolveApiKeyForProvider(provider, this.config.apiKeys, ...)` reads `apiKeys[provider]` fresh on each call, so updates land immediately without an agent restart.

30 s was chosen because:

- It's frequent enough that dashboard edits land before the next user message hits the agent (median user reaction time after toggling a setting is way longer than 30 s).
- It's cheap — a single-row `SELECT * FROM company_settings WHERE id='default'`. Postgres handles this easily.
- `setInterval(...).unref()` so it doesn't keep the event loop alive on graceful shutdown.

### What I deliberately didn't do

- **PG NOTIFY/LISTEN for real-time push** would be the proper architecture but adds a persistent connection per agent + LISTEN channel management. Polling at 30 s is the lower-risk fix; can upgrade to NOTIFY later if 30 s latency ever becomes a complaint.
- **On-error-refresh** (refresh from DB when an API call fails with "no key") would be even more responsive but adds error-handling complexity. The 30 s poll covers the common case.

### Existing operators

`npm install -g @agenticmail/enterprise@latest && pm2 restart all` — that's it. No setup re-run needed. After the upgrade, future API-key updates in `Settings → Models & API Keys` propagate to running agents within 30 seconds.

## [0.5.567] - 2026-05-16

### Fixed — Telegram/WhatsApp messages silently dropped on local deployments

Operator (Windows): "I set up Telegram for halo, sent it a message, but nothing happened." Logs showed:

```
[messaging] Telegram: long-polling for Halo (db38522f)
[messaging] Ready (telegram=polling)
[messaging] Dispatching telegram message to Halo
[messaging] Telegram typing sent to 7096812530: {"ok":true,"result":true}
[messaging] Dispatching to Halo at localhost:3100
```

Telegram polling worked, typing indicator went out, but the actual message dispatch went to `localhost:3100` while the agent was listening on `3101`. Nothing on 3100 → POST got refused → halo never saw the message → no response generated.

### Two root causes

**1. Default port mismatch.** `src/engine/agent-provisioner.ts` (the function that picks a port when a local agent is deployed) defaulted to **3101**. `src/engine/messaging-poller.ts` (the dispatcher) defaulted to **3100**. Both fell back to their independent defaults whenever `config.deployment.port` was unset — which is the common case for newly-created agents.

Fix: align provisioner default to **3100**, AND have `deployer.deployLocal` write the assigned port back into `config.deployment.port` + `config.deployment.config.local.port` so the messaging-poller reads the actual port even when multiple agents are deployed on the same box (port 3101, 3102, …).

**2. Generated wrapper's regex doesn't tolerate CRLF.** The auto-generated `agent-<slug>.cjs` wrapper had:

```js
const lines = readFileSync(envFile, 'utf8').split('\n');
for (const line of lines) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
```

The provisioner writes the env file with LF, so this worked initially. But:

- If anything downstream re-saves the file (PowerShell `Set-Content` defaults to CRLF on Windows; Notepad does the same), every line ends with `\r`.
- JavaScript's `.` doesn't match `\r`, and `$` (without `/m` flag) anchors to end-of-string. So the regex fails to match the trailing-CR line, no env var gets set, and the wrapper aborts with `[agent-wrapper] FATAL: Missing required env var: AGENTICMAIL_AGENT_ID` even though the file clearly contains it.

Fix: change the split to `.split(/\r?\n/)` in the wrapper generator. Tolerates both LF and CRLF; rest of the parser logic unchanged.

### Files

- `src/engine/agent-provisioner.ts` — default port 3101 → 3100; wrapper-generator template uses `/\\r?\\n/` for line splitting (the inline regex inside the generated wrapper string).
- `src/engine/deployer.ts deployLocal` — writes `provision.port` back into `config.deployment.port` and `config.deployment.config.local.port` immediately after provisioning, so the messaging-poller has the right value to read.

### Existing operators

Re-running `npx @agenticmail/enterprise@latest setup` regenerates the wrappers + env files cleanly. If you don't want to re-run setup, the minimal manual fix is:

1. Open `~/.agenticmail/agent-<slug>.cjs` and change the line `const lines = readFileSync(envFile, 'utf8').split('\n');` to `const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);`.
2. Edit `~/.env.<slug>` and set `PORT=3100` (or whichever port the messaging-poller is dispatching to — visible in the enterprise log as `Dispatching to <Agent> at localhost:<port>`).
3. `pm2 restart all`.

## [0.5.566] - 2026-05-16

### Fixed — Windows: website went down on screen lock / sleep

Operator-reported (Windows laptop deploy): "whenever my window computer locks screen or sleeps, the website is down." Root cause: Windows' default power plan sleeps after **5 min on AC, 3 min on DC**. Sleep suspends every process — including the Cloudflare tunnel, the enterprise server, and Postgres — so Cloudflare's edge returns 502 until the laptop wakes. Screen lock alone doesn't sleep, but the lock-then-leave-the-room pattern hits the timer.

For a server-class deployment on a laptop, the only correct setting is "never sleep" + lock-screen doesn't pause anything + the running process explicitly blocks sleep requests.

### What changed

In `src/setup/provision.ts` (local-deploy flow), Windows-only block added right before the `Live at https://...` success message:

1. **`powercfg /change standby-timeout-{ac,dc} 0`** — never sleep, on either power source. No admin required.
2. **`powercfg /change hibernate-timeout-{ac,dc} 0`** — never hibernate. No admin required.
3. **`powercfg /change disk-timeout-{ac,dc} 0`** — disk never spins down. No admin required.
4. **Lid close action set to "Do nothing"** on both AC and DC (sub-group `4f971e89-...`, setting `5ca83367-...`). No admin required.
5. **`powercfg /requestsoverride PROCESS node.exe SYSTEM EXECUTION AWAYMODE`** and same for `cloudflared.exe` — tells Windows these processes block sleep even on user-initiated "Sleep" menu actions. Requires admin; fails silently with a note printed for the operator if not elevated. The first four settings still take effect either way.

### Operator action on upgrade

`npm install -g @agenticmail/enterprise@latest && pm2 restart all` is enough for new installs. For existing operators, the setup wizard needs to re-run to apply the power settings (it's part of `provisionLocal`):

```bash
npx @agenticmail/enterprise@latest setup
```

Or apply the four `powercfg /change ... 0` commands manually (no admin):

```powershell
powercfg /change standby-timeout-ac 0; powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0; powercfg /change hibernate-timeout-dc 0
```

### Battery note

This disables sleep on DC (battery) too. If you deploy on a laptop without external power, expect the battery to drain to zero in 2-4 hours and the box to ungraciously power off. For a true 24/7 deployment, keep the laptop plugged in.

## [0.5.565] - 2026-05-16

### Fixed — last remaining Windows cmd.exe flash sources (wrappers + provision)

After 0.5.564, operators still saw cmd windows flashing on Windows. Two more sources:

1. **The `start.cjs` and `cloudflared.cjs` wrappers** (generated by the setup wizard) used `spawnSync(..., { stdio: 'inherit' })` with no `windowsHide`. When PM2's daemon process was launched from a console (which it often is during initial setup), that handle gets inherited through the wrapper to the actual server process — so the operator sees a cmd window for the running cloudflared and enterprise processes that pops back up every time they close it.
2. **`provision.ts` post-deploy `pm2 jlist` verify** (line 479) — one-shot, but still flashed during local-mode deploys.

### What changed

`src/setup/provision.ts`:
- `start.cjs` generator: added `windowsHide: true` to both spawnSync calls (the direct-bin path AND the npx fallback).
- `cloudflared.cjs` generator: added `windowsHide: true` to its spawnSync call.
- The `pm2 jlist` verify call after deploy: added `windowsHide: true` to its `execSync` options.

### Operator action for existing installs (CRITICAL — regen the wrappers)

The fix lives in the generator, so a plain `npm install -g @agenticmail/enterprise@latest && pm2 restart all` is NOT enough — your existing `~/.agenticmail/start.cjs` and `cloudflared.cjs` still have the old code without windowsHide. Two options:

- **Re-run setup** (regenerates both wrappers): `npx @agenticmail/enterprise@latest setup`
- **Or manually rewrite the wrappers** to add `windowsHide: true` to the spawnSync options in both files, then `pm2 restart all`.

## [0.5.564] - 2026-05-16

### Fixed — more cmd.exe flashes from agent-init dependency probes

0.5.563 fixed `deployer.execCommand` (the 30s `pm2 jlist` health-check loop). Process-monitoring after that release caught MORE flashes from **every agent process startup**: `cli-agent.ts ensureSystemDependencies` runs winget/choco probes, `npx playwright install chromium`, `where sox`, plus the meeting-voice tool checks `sox --help` and PowerShell `Get-AudioDevice` queries. Each `exec()` without `windowsHide:true` flashes a console window on Windows.

### What changed

Wrapped the local `exec = promisify(execCb)` in each of:
- `src/cli-agent.ts ensureSystemDependencies` (~30 callers across this function)
- `src/agent-tools/tools/google/meeting-voice.ts checkAudioDevices` (where sox, sox --help, PowerShell Get-AudioDevice)
- `src/agent-tools/tools/google/meeting-voice.ts playAudioToDevice` (sox playback shellouts)

Wrap shape: `const exec = (cmd, opts) => _exec(cmd, { ...(opts||{}), windowsHide: true })`. Single-line addition that catches every call site automatically.

### Operator action

After upgrading, both enterprise AND every agent-* PM2 process must restart (not just the enterprise daemon). Each agent process runs its own `ensureSystemDependencies` on boot, which is where the bulk of the flashes come from. `pm2 restart all` works.

## [0.5.563] - 2026-05-16

### Fixed — the REAL cause of flashing cmd.exe windows on Windows

0.5.562 fixed the `which` shellouts in capability checks, but the operator was still seeing console windows pop in and out. Process-watcher diagnostic (60-second WMI poll) caught it: **the deployer's lifecycle health-check loop runs `pm2 jlist` every 30 seconds for each deployed agent**, and `deployer.execCommand` was calling `exec()` without `windowsHide: true`.

Code path: `lifecycle.ts:1041 setInterval(...30_000)` → `deployer.getStatus(config)` → `getPm2Status()` → `execCommand("pm2 jlist")` → `exec(cmd)` → new cmd.exe + conhost.exe pair = visible flash. With one local-deployed agent (halo), that's a flash every 30s. With N agents, N flashes per 30s.

### What changed

One-line fix in `src/engine/deployer.ts execCommand()`: added `windowsHide: true` to the `execAsync` options. Every shellout from the deployer (pm2 jlist, pm2 restart, pm2 logs, docker, ssh, railway, fly, ...) now hides the window on Windows. Has no effect on macOS/Linux.

### Why 0.5.562 didn't catch it

I fixed the `which` callers because that was the loud symptom in the error log (`'which' is not recognized`). But the deployer was using `pm2` directly via `exec`, which DOES exist on Windows (so no error message in the log) but **still spawned a visible cmd.exe window** because nothing told Windows to hide it. Silent on the error log; visible on the desktop.

## [0.5.562] - 2026-05-16

### Fixed — visible cmd.exe console flashes on Windows from `which` shellouts

Operator report (Windows): "a terminal keeps starting and closing in my view." Diagnosed in the enterprise error log:

```
'which' is not recognized as an internal or external command,
operable program or batch file.
The system cannot find the path specified.
```

…repeated dozens of times a minute. Three code paths shelled out to `which X` to check whether a command was available on PATH. On Linux/Mac that's fine (silent). On Windows there's no `which` binary, so each call:

1. Spawned `cmd.exe` (briefly visible as a flashing console window).
2. Got `'which' is not recognized` on stderr.
3. Returned non-zero → caller treated it as "not installed".

The dashboard's `/system/process-managers` endpoint polls every few seconds, and `runtime/environment.ts` capability detection runs whenever an agent is scheduled — so the flashes were constant on a Windows desktop.

### What changed

- `src/runtime/environment.ts` — new `findCommandPath(cmd)` and `commandExists(cmd)` use a native PATH walk (read `process.env.PATH`, check each dir for `cmd` + `PATHEXT` on Windows). No child processes, no console flashes, faster than spawning cmd.exe anyway.
- `src/runtime/environment.ts` — `findBrowser()` no longer falls back to `execSync('which chromium ...')`; uses `findCommandPath` for the same three candidates.
- `src/runtime/environment.ts` — `hasVCam()` now returns `false` early on Windows (the `/dev/video*` glob is a Linux concept; the `ls /dev/video*` shellout was also flashing).
- `src/engine/agent-routes.ts` — `GET /system/process-managers` swapped its inline `check(cmd)` for the new `commandExists`. The `pm2 -v` call gates on `commandExists('pm2')` first and adds `windowsHide: true` to the remaining shellout so even when it DOES run, no console flashes.

### What I didn't touch

Other `which`-style callers in `cli-update.ts`, `cli-agent.ts`, and the `agent-tools/local/*` modules are one-shot commands operators run on demand, not recurring background pollers. They still use `which` for now; sweeping them is a follow-up if anyone reports flashes from those paths.

## [0.5.561] - 2026-05-16

### Fixed — `npm install -g @agenticmail/enterprise@latest` now actually takes effect on Windows

Operator report (correct, and reproducible): on Windows, running `npm install -g @agenticmail/enterprise@latest` then `pm2 restart enterprise` leaves the running process on the OLD version. Only manually wiping `%LOCALAPPDATA%\npm-cache\_npx\<hash>` and restarting forces an update.

### Root cause

The setup wizard generates `~/.agenticmail/start.cjs` with:

```js
spawnSync('npx', ['@agenticmail/enterprise', 'start'], { ... });
```

`npx @agenticmail/enterprise` (no `@latest`, no `--prefer-online`) hits npx's local cache first and reuses whatever version satisfies the bare package spec. On Windows that cache lives at `%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\@agenticmail\enterprise` and gets populated on the first install — and never refreshed thereafter, regardless of what the operator does with `npm install -g`. The global install at `%APPDATA%\npm\node_modules\@agenticmail\enterprise` updates correctly but is bypassed because PM2's wrapper always goes through npx.

Why Mac mostly seemed unaffected: depending on which Node distribution (Homebrew, nvm, system) the operator uses, npm's cache layout and PATH precedence sometimes resolve `npx @agenticmail/enterprise` to the global install via PATH rather than the npx-hash cache, so updates land. It's accidental — the same cache-reuse trap exists; it just bites less often.

### What changed

The generated `start.cjs` now has a two-tier resolution:

1. **Prefer the globally-installed bin.** Calls `npm prefix -g` to find npm's global prefix, then resolves `<prefix>\node_modules\@agenticmail\enterprise\bin\agenticmail-enterprise.cjs` (Windows) or `<prefix>/lib/node_modules/@agenticmail/enterprise/bin/agenticmail-enterprise.cjs` (Unix), and invokes it directly with `node`. Fastest, no npx involved, picks up `npm install -g` immediately on the next PM2 restart.

2. **Fallback for fresh boxes that only used `npx … setup`.** If no global install is found, calls `npx -y @agenticmail/enterprise@latest start` — both `-y` (skip the install prompt) and `@latest` (force a version-spec re-resolution) make npx hit the registry on each start instead of just reusing the cache.

This is the same fix shape we use in `@agenticmail/cli` for the auto-start service: never trust npx's cache for long-lived processes.

### Migration for existing operators

The fix lives in the generator. Operators who already have a `~/.agenticmail/start.cjs` from a previous setup run won't pick up the new code automatically — the wrapper is regenerated only by the setup wizard.

Two options:

- **Re-run setup** (heavier — also re-prompts for cloudflared, domain, etc.):
  ```bash
  npx @agenticmail/enterprise@latest setup
  ```

- **Manually replace `~/.agenticmail/start.cjs`** with the new content (see `src/setup/provision.ts` in this release for the canonical version), then `pm2 restart enterprise`.

### Files

- `src/setup/provision.ts` — replaced the 6-line `start.cjs` body with the two-tier resolver. ~50 lines, fully commented.
- `package.json` — version → 0.5.561.

## [0.5.560] - 2026-05-16

### Fixed — agent-detail tab URL now reflects the active tab

Operator report (correct): clicking a tab on the agent-detail page (Overview, Email, Tools, Channels, Autonomy, etc.) didn't update the URL. The address bar stayed at `/dashboard/agents/<id>` regardless of which tab was active. Three downstream problems:

1. **Refresh always snapped back to Overview** — `useState('overview')` was the source of truth; the URL contributed nothing on reload.
2. **Deep-links / shared links / external doc links to a specific tab were impossible** — there was no URL shape that meant "open this agent at the Channels tab".
3. **Browser back/forward buttons didn't navigate between tabs** — popstate had nothing tab-shaped to react to.

### What changed

URL contract is now `/dashboard/agents/<id>/<tab>` (and bare `/dashboard/agents/<id>` is honored as a redirect to `/overview`):

- `parseRoute()` in `src/dashboard/app.js` reads the third path segment as `agentTab` (returns `null` when absent).
- `selectedAgentTab` is now state on `App` alongside `selectedAgentId`, so the URL contract lives in exactly one place rather than in `AgentDetailPage`'s internal state.
- `setSelectedAgentId(id)` and `navigateToAgent(id)` both push `/dashboard/agents/<id>/overview` (so the URL is always tab-qualified, not bare).
- New `setSelectedAgentTab(tab)` helper pushes the new tab segment and is wired down to `AgentDetailPage` as the `onTabChange` prop.
- `popstate` handler reads `agentTab` too — browser back / forward now navigates between tabs the same way it navigates between pages.

In `src/dashboard/pages/agent-detail/index.js`:

- `useState('overview')` becomes `useState(props.agentTab || 'overview')` so deep-links land on the right tab on first paint.
- `useEffect` on `[props.agentTab]` re-syncs the local tab state when the parent's URL parsing emits a new value (e.g. operator hit browser-back).
- New `changeTab(t)` wrapper that does `setTab(t) + props.onTabChange(t)` in one place; every tab-button click + the programmatic switch inside `WhatsAppSection` now flow through it.

### What I deliberately didn't change

- **Bare `/dashboard/agents/<id>` is still accepted** on direct navigation (the bookmark won't 404). It just becomes `.../<id>/overview` once `setSelectedAgentId` runs. Strict redirect would break existing bookmarks for zero gain.
- **Unknown tab values aren't redirected away.** A URL like `/dashboard/agents/<id>/banana` will render with no tab body (because the section render is gated by `tab === '<name>'`). Could add a toast + redirect to overview, but silent fall-through matches how the rest of the dashboard treats unknown URLs.

## [0.5.453] - 2026-03-13

### Fixed
- **Daily target not persisting** — `poly_goals` table was created via fire-and-forget (unwaited async) at route registration time; if engine DB wasn't ready yet, the table was never created. Moved to `ensurePolyDB()` which is properly awaited via middleware before every polymarket route.
- **Deploy stuck after PM2 process deletion** — When PM2 process is deleted externally, agent state stayed "running" in DB, hiding the Deploy button. Fixed: Deploy/Redeploy button now shows in all non-transient states; added Reset State button for stuck states; deployer restart falls through to full deploy when process is missing; deployer stop handles "not found" gracefully.
- **Goals evaluate endpoint SQLite crash** — `CURRENT_TIMESTAMP::text` (Postgres-only cast) replaced with standard `CAST(CURRENT_TIMESTAMP AS TEXT)` for cross-DB compatibility.

## [0.5.443] - 2026-03-11

### Added
- **Trading Optimizer Suite** — 6 new high-frequency trading tools (`polymarket-optimizer` skill):
  - `poly_daily_scorecard` — Real-time P&L vs daily target, win rate, capital utilization, trading status (AHEAD/ON_TRACK/BEHIND/TARGET_HIT/STOP_TRADING)
  - `poly_momentum_scanner` — Find markets with significant price movement in real-time; replaces static search for discovering active opportunities
  - `poly_quick_edge` — One-call GO/NO-GO trade decision with edge %, Kelly size, and action (STRONG_BUY/BUY/MARGINAL/NO_TRADE/SELL); replaces 6+ separate tool calls
  - `poly_position_heatmap` — All positions ranked by urgency (CRITICAL/HIGH/MEDIUM/LOW) with specific action needed for each
  - `poly_profit_lock` — Auto-conservative mode after hitting daily target; returns adjusted position sizes and trading mode
  - `poly_capital_recycler` — Redeploy freed capital to best opportunities after position closes; keeps capital working
- **Daily Scorecard Dashboard** — New section in Polymarket Overview tab showing real-time daily P&L progress bar, target tracking, realized/unrealized P&L, trade count, win rate, and available capital
- **Daily Scorecard API** — `GET /polymarket/:agentId/daily-scorecard` endpoint returning comprehensive daily trading metrics
- **Browser Market Discovery** — Agents can browse polymarket.com to find market IDs when API returns stale results (system prompt guidance, no login required)
- **Universal Message Trimmer** — Extracted stale aging + inline truncation into standalone `message-trimmer.ts` module; applies to ALL tools (web, browser, email, polymarket) not just polymarket
- **Market Freshness Tracking** — Per-agent tracking of recently-analyzed markets with 30-min TTL; prevents agents from repeatedly analyzing the same stale markets
- **Dead Market Filtering** — Markets with all-zero prices, zero liquidity, or resolved status are automatically filtered from search/screen results
- **CLOB Rate Limit Resilience** — Gamma API fallbacks for orderbook depth, whale tracking, flow analysis, and price discovery when CLOB API is rate-limited
- **Cross-DB Date Helpers** — `dateAgo()`, `dateAgoMin()`, `dateAhead()` for watcher SQL queries; replaces PostgreSQL-specific `::timestamptz`/`INTERVAL` syntax
- **Comprehensive Topic Extraction** — `extractTopics()` expanded from 6 patterns to 25+ groups covering US/global politics, crypto, sports, AI, regulation, and more

### Fixed
- **PostgreSQL-only SQL in watcher** — Fixed 15+ queries using `::timestamptz`, `NOW()`, `INTERVAL` that failed on SQLite; all now use parameterized ISO date strings
- **PostgreSQL DDL in portfolio** — Fixed `SERIAL PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT` and `TIMESTAMPTZ` → `TEXT`
- **Dead CLOB endpoints** — Replaced 3 dead `CLOB_API/markets/` calls with working `GAMMA_API/markets?clob_token_ids=` in watcher
- **`poly_approve_trade`** — Fixed trade fetching AFTER resolution (trade disappeared); now fetches BEFORE resolving
- **`poly_place_batch_orders`** — Fixed tool that validated but never executed orders; now creates pending trades and executes in autonomous mode
- **`poly_resolution_risk` "Market not found"** — Auto-detects 0x condition IDs passed as slug parameter; added Gamma search fallback
- **`poly_quick_analysis` null values** — Added fallback data when CLOB is rate-limited instead of returning null for orderbook/regime/kelly
- **`poly_get_open_orders` / `poly_get_order`** — Fixed to check database as fallback, not just in-memory Map
- **`poly_leaderboard` / `poly_top_holders`** — Fixed dead Gamma endpoints; now uses data-api fallback
- **Proactive wake channel routing** — Uses manager's configured communication channel (telegram/whatsapp/email) instead of hardcoded values
- **Hardcoded identity in proactive wake** — Replaced hardcoded `senderName: 'Ope'` with dynamic manager info
- **Unused code cleanup** — Removed `_TradingConfig`, `PriceAlert`, `PaperPosition` interfaces, `priceAlerts`/`paperPositions`/`autoApproveRules` Maps, `getConfig()`/`checkAutoApprove()` functions, `_pricingCache` from agent-loop

## [0.5.320] - 2026-03-05

### Added
- **Microsoft 365 Integration** — 97 tools across 13 services (Outlook Mail, Calendar, OneDrive, Teams, Excel, SharePoint, OneNote, To Do, Contacts, PowerPoint, Planner, Power BI)
- **Microsoft Graph API helper** — Retry with backoff, rate-limit handling, auto-pagination, JSON batching
- **Microsoft system prompts** — 12 structured prompt files mirroring Google tools pattern
- **Task pipeline redesign** — Table/list view with status tabs, search, pagination, real-time updates via webhook
- **Client organization data isolation** — Org-bound users see only their organization's data
- **Visible roles configuration** — Parent org controls which roles client org users can see
- **Cross-platform dependency manager** — macOS, Linux, Windows support with policy-driven installation
- **Org-wide dependency policy** — Configurable from Settings > Security tab
- **PM2 production persistence** — ecosystem.config.cjs, LaunchAgent, log rotation
- **LOG_LEVEL env var** — Production log noise suppression
- **Port validation** — Checks availability before local agent deployment
- **Screen unlock** — Agents can auto-unlock machine screen
- **Per-section editing** — Independent edit buttons on Security and Permissions tabs
- **Dynamic sidebar company name** — Updates in real-time from settings
- **Tiered tool loading** — ~75% tool count reduction for messaging channels

### Fixed
- DB connection pool exhaustion (MaxClientsInSessionMode)
- Smart DB URL auto-configuration for Supabase/Neon
- Stop-impersonation logging user out
- Client org skills/roles showing all data during impersonation
- Agent UUID display in compliance reports

## [0.5.315] - 2026-03-03

### Added
- Client organization data isolation across all dashboard pages
- `allowed_roles` JSONB column for role visibility control
- Impersonation token refresh preserving org restrictions

## [0.5.313] - 2026-03-01

### Added
- Smart DB URL auto-configuration (Supabase/Neon detection)
- 7 enterprise DLP rule packs (53 rules)
- SOC 2 Type II compliance reports with HTML export
- Comprehensive README rewrite

### Fixed
- DB connection pool exhaustion
- Compliance report generation crashes

## [0.5.312] - 2026-02-28

### Added
- Transport encryption (AES-256-GCM)
- Org switchers across all dashboard pages
- DLP rule editing, enable/disable toggle, detail modal
- Journal action detail modal

### Fixed
- Double encryption with Hono wildcard middleware
- Engine sub-app body forwarding
- Org switching not reloading data
- Knowledge base auto-assign persistence
- Workforce/guardrails/audit org filtering

[0.5.443]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.443
[0.5.320]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.320
[0.5.315]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.315
[0.5.313]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.313
[0.5.312]: https://github.com/agenticmail/enterprise/releases/tag/v0.5.312
