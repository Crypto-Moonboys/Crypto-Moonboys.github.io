# Hermes & NPC Creation/Admin Agent Audit Report

**Audit Date:** 2026-05-07
**Branch:** copilot/audit-hermes-npc-creation-admin-agents
**Auditor:** Copilot Cloud Agent (automated audit, no functional changes)
**Scope:** Hermes runtime, admin console, webcrawl agent, swarm controls, sandbox workflow, NPC creation/admin agent systems

---

## 1. Executive Summary

The Hermes runtime is a solid, layered system with meaningful security controls: approval gating, token-gated privileged actions, path traversal blocking, main/master push protections, SSRF guards in the webcrawl agent, and NPC role restrictions are all correctly implemented.

However, several **critical and high-risk issues** exist that must be resolved before production use:

1. **`express` is not installed** — All 30 integration tests in `hermes-bridge.test.js` and `hermes-repo-targeting.test.js` crash with `Cannot find module 'express'`. The full integration test suite cannot run.
2. **`api/brain-api.js` has a hardcoded stale path** — `REPO_ROOT = "/root/Crypto-Moonboys.github.io"` (should be `/home/moonboys/Crypto-Moonboys.github.io` per deployment spec).
3. **`api/brain-api.js` uses wildcard CORS (`app.use(cors())`)** — This exposes the NPC brain admin API to any origin.
4. **`api/brain-api.js` `commit-backup` endpoint pushes directly to `main`** without branch guards, without approval gating, and without checking the current branch. This can overwrite production directly.
5. **NPC creation writes directly to `/root/npc-brain/npcs/`** — Hardcoded absolute path, bypasses Hermes path safety framework entirely, no approval, no rollback.
6. **`command-runner.js` passes full `process.env`** to spawned processes, including all secrets.

---

## 2. Critical Blockers

### C-1: `express` dependency not installed — 30 integration tests fail
- **File:** `package.json`, `api/hermes-api.js`
- **Detail:** `express@^5.2.1` is listed in `package.json` `dependencies` but `node_modules` is absent in the CI/sandbox environment used for testing. `hermes-bridge.test.js` (22 tests) and `hermes-repo-targeting.test.js` (8 tests) all fail with `Cannot find module 'express'`. `npm install` must be run before the server-integration tests can execute.
- **Impact:** No integration test coverage for the HTTP API layer, approval flows, NPC role denial, git push block, CORS tests, etc.
- **Required fix:** Run `npm install` as part of the test setup or CI workflow. Confirm `express` and `cors` are installed before running bridge/repo-targeting tests.

### C-2: `api/brain-api.js` hardcoded stale path `/root/Crypto-Moonboys.github.io`
- **File:** `api/brain-api.js`, line 143
- **Detail:** `const REPO_ROOT = "/root/Crypto-Moonboys.github.io";` — This path is incorrect. The documented live repo path is `/home/moonboys/Crypto-Moonboys.github.io`. If the server runs as a different user or on a different layout, all git operations in brain-api will silently fail or target the wrong directory.
- **Also at line 193:** `const npcSource = "/root/npc-brain/npcs";` — Hardcoded `/root` paths for NPC source data.
- **Also at line 499+:** NPC creation writes to `/root/npc-brain/npcs/${id}.json` — All hardcoded absolute paths.
- **Additional:** `BRAIN_BACKUP_DIR` is derived from `REPO_ROOT`, so the backup path is also stale.
- **Required fix:** Replace all `/root/Crypto-Moonboys.github.io` and `/root/npc-brain/` references with env-var-driven paths (e.g., `process.env.HERMES_REPO_ROOT`, `process.env.NPC_BRAIN_ROOT`).

### C-3: `api/brain-api.js` `commit-backup` endpoint — unrestricted `git push` to current branch
- **File:** `api/brain-api.js`, lines 248–284
- **Detail:** The `/api/brain/commit-backup` endpoint:
  - Runs `git add -A admin/brain-data/`, `git commit -m <message>`, and `git push` with no branch check.
  - The push calls `runRepoGit(["push"])` — no `--dry-run`, no branch guard, no approval gate, no admin-mode check beyond the basic `BRAIN_ADMIN_TOKEN`.
  - If the current branch is `main`/`master`, this will push directly to production.
  - No approval workflow (unlike Hermes's `approval-gate.js` system).
  - Commit message is caller-controlled (attacker with token can craft any commit message).
- **Required fix:** Add `git branch --show-current` check; block push if on `main`/`master`. Add approval gate or at minimum require explicit `confirmMainBranchPush=true` flag. Align with Hermes `git-operator.js` push policy.

---

## 3. High-Risk Issues

### H-1: `api/brain-api.js` uses wildcard CORS
- **File:** `api/brain-api.js`, line 9: `app.use(cors())`
- **Detail:** This applies `Access-Control-Allow-Origin: *` to all responses, including admin routes that return system info (`/api/brain/status` — hostname, memory, uptime; `/api/brain/advisor` — repo path, branch, last commit; `/api/brain/health-summary` — all checks). While the admin token protects write operations, CORS wildcard still allows any origin to attempt requests, and any XSS on any origin could forward the token.
- **Contrast:** `api/hermes-api.js` correctly uses an explicit allowlist (`ALLOWED_ORIGINS`).
- **Required fix:** Restrict to the same `ALLOWED_ORIGINS` allowlist used by `hermes-api.js`, or at minimum origin-restrict to the admin domain.

### H-2: NPC creation writes to absolute hardcoded live paths — no approval, no rollback
- **File:** `api/brain-api.js`, lines 499–555
- **Detail:** `/api/brain/create-npc` directly calls `fs.writeFileSync("/root/npc-brain/npcs/${id}.json", ...)` and `fs.writeFileSync("/root/npc-brain/knowledge/wiki/npcs/${id}.md", ...)`. This:
  - Bypasses the Hermes `patch-engine.js` rollback infrastructure.
  - Bypasses the `approval-gate.js` workflow.
  - Has no dry-run or preview mode.
  - Has no rollback capability (the file is created, pm2 restarts immediately).
  - The `id` is slugified but the path construction is `"/root/npc-brain/npcs/" + id + ".json"` — while slugification removes `..` and slashes, this is still writing outside the Hermes-controlled repo boundary.
- **Required fix:** Either route NPC creation through Hermes's patch-engine with rollback, or add explicit approval gate + dry-run. At minimum, path-validate the target directories against expected boundaries.

### H-3: `command-runner.js` passes full `process.env` to child processes
- **File:** `server/hermes/command-runner.js`, line 43: `env: process.env`
- **Detail:** All environment variables — including `HERMES_EDIT_TOKEN`, `OPENAI_API_KEY`, `BRAIN_ADMIN_TOKEN`, and any other server secrets — are forwarded to every spawned subprocess. If `npm test` or `node --check` produce any output that includes env vars (unlikely but possible with some node scripts), or if a future allowed command is `node <script>` that reads `process.env`, secrets could leak into stdout/stderr.
- **Required fix:** Pass only a minimal, curated env subset to child processes: `{ PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: process.env.NODE_ENV }`.

### H-4: `api/brain-api.js` backup/restore routes write/delete from hardcoded absolute paths without safety checks
- **File:** `api/brain-api.js`, lines 193–230 (`/api/brain/backup`), 232–245 (`/api/brain/restore`)
- **Detail:**
  - Backup: `fs.rmSync(BRAIN_BACKUP_DIR, { recursive: true, force: true })` — unconditionally deletes the entire backup directory on every backup run. If `BRAIN_BACKUP_DIR` resolves incorrectly due to stale `REPO_ROOT`, this could delete the wrong directory.
  - Restore: `fs.rmSync(npcTarget, { recursive: true, force: true })` on `/root/npc-brain/npcs` and `/root/npc-brain/knowledge` — unconditionally deletes live NPC data and knowledge before copying. If the backup is missing or corrupted, this results in permanent data loss.
  - No pre-flight validation of backup integrity before destructive deletion.
  - Calls `pm2("restart", "npc-brain")` immediately after restore — no confirmation, no dry-run.
- **Required fix:** Add backup integrity validation before delete. Add explicit confirmation flag. Add rollback path for restore failure.

### H-5: `BRAIN_ADMIN_TOKEN` has insecure default fallback
- **File:** `api/brain-api.js`, line 14: `process.env.BRAIN_ADMIN_TOKEN || "CHANGE_ME_BRAIN_ADMIN_TOKEN"`
- **Detail:** If `BRAIN_ADMIN_TOKEN` is not set, the server runs with a well-known default token `CHANGE_ME_BRAIN_ADMIN_TOKEN`. Although the health-summary check detects this and flags it, a misconfigured deployment would still accept requests with this known value until an operator notices the warning in the health check UI.
- **Required fix:** If `BRAIN_ADMIN_TOKEN` is the default string, the server should refuse to start (throw at startup), not just return a 500 on requests. This aligns with how `HERMES_EDIT_TOKEN` is handled — if missing, `assertServerToken()` throws.

---

## 4. Medium Issues

### M-1: `approval-gate.js` is in-memory only — no persistence, lost on restart
- **File:** `server/hermes/approval-gate.js`
- **Detail:** All pending and decided approvals live in `const pending = new Map()` and `const decided = new Map()`. A server restart or crash clears all pending approvals. Any approval created by the admin UI before a restart is silently lost, causing the corresponding privileged action to fail with "Approved token not found." There is no audit log of approvals.
- **Severity:** Medium — inconvenient and confusing, not a security risk (lost approvals cannot be forged).
- **Recommended fix:** Persist approvals to disk (e.g., `HERMES_DATA_ROOT/approval-queue.json`) with a TTL expiry.

### M-2: `tool-router.js` — ambiguous regex for `read` command could match unintended prompts
- **File:** `server/hermes/tool-router.js`, line 39
- **Detail:** `/read\s+[^\n]+/iu` matches any prompt containing "read" anywhere. For example, "I have already read the docs" would trigger a `file/read` action with path "the docs". This could cause confusing error messages for conversational prompts.
- **Recommended fix:** Tighten the regex to require "read" at the start of the prompt or after a specific prefix like "read file".

### M-3: `task-planner.js` — `audit` keyword routes to `test_agent` which has no `canEditRepo`
- **File:** `server/hermes/task-planner.js`, line 6
- **Detail:** The regex `/(test|smoke|regression|audit)/u` routes audit tasks to `test_agent`. This is correct for read-only audit flows. However, the task planner is used only in `/api/hermes/task/plan` and is not yet integrated into the main conversation-runtime routing. The `task/plan` route exists but the resulting role from the planner is not fed back into privileged action execution — it's purely advisory.
- **Impact:** No actual security risk. The planner output is only informational; actual execution still goes through `executeAction` with explicit role from the request body.
- **Recommended fix (low priority):** Document that task planning is advisory only. Consider whether the planner role should be enforced as a default role when none is specified.

### M-4: `webcrawl-agent.js` `gpt-5.4-mini` model name may be stale
- **File:** `server/hermes/webcrawl-agent.js`, line 236
- **Detail:** Default webcrawl model is `process.env.HERMES_WEB_MODEL || "gpt-5.4-mini"`. OpenAI model naming conventions change frequently. If `gpt-5.4-mini` is not a valid model, web search silently fails with API error. The `unavailableResult` logic only checks for missing `OPENAI_API_KEY`, not for model errors.
- **Recommended fix:** Log and surface model errors explicitly rather than silently returning a generic failure.

### M-5: `the-brain.html` — two versions exist (`the-brain.html` and `the-brain-new.html`)
- **File:** `admin/the-brain.html`, `admin/the-brain-new.html`
- **Detail:** Two admin HTML files exist for THE BRAIN. It is unclear which is the canonical active version and which is a draft or stale copy. Dead admin UI files can be confusing and introduce drift.
- **Recommended fix:** Confirm which file is production-active. If `the-brain-new.html` is a draft, add a comment or rename. If it's superseded, delete it.

### M-6: `space-agent.html` exists in admin but is undocumented
- **File:** `admin/space-agent.html`
- **Detail:** A fourth admin HTML file `space-agent.html` exists in the `admin/` directory but is not referenced in the audit scope docs and was not covered in `HERMES_AGENT_RUNTIME_HANDOVER.md`. Its purpose, backend integration, and security posture are unknown from this audit.
- **Recommended fix:** Audit `admin/space-agent.html` in a follow-up. Confirm whether it has backend API calls, whether those are authenticated, and what actions it exposes.

### M-7: `watcher_agent` role is defined but has no actual implementation
- **File:** `server/hermes/swarm-registry.js`, `server/hermes/agent-runtime.js`
- **Detail:** `watcher_agent` is listed in the swarm with capabilities `["logs", "failures", "healing_proposals"]` and in `ROLE_RULES` with `canRunCommands: true`. However, there is no corresponding tool, prompt, or backend logic for log watching, failure detection, or healing proposals. The UI (`hermes-chat.html`) exposes the `watcher_agent` role selector — but sending a request as `watcher_agent` just falls through to standard chat/tool flows.
- **Recommended fix:** Either implement the watcher agent's log-watching and healing-proposal tools, or mark it as `planned: true` in the registry and hide it from the role selector until implemented.

---

## 5. Low-Risk Cleanup

### L-1: BOM characters (UTF-8 BOM `﻿`) at the start of several server files
- **Files:** `api/hermes-api.js`, `server/hermes/action-schema.js`, `server/hermes/agent-runtime.js`, `server/hermes/approval-gate.js`, `server/hermes/chat-proxy.js`, `server/hermes/conversation-runtime.js`, `server/hermes/file-service.js`, `server/hermes/git-operator.js`, `server/hermes/memory-store.js`, `server/hermes/orchestrator.js`, `server/hermes/patch-engine.js`, `server/hermes/path-utils.js`, `server/hermes/repo-indexer.js`, `server/hermes/swarm-registry.js`, `server/hermes/task-planner.js`, `server/hermes/tool-executor.js`, `server/hermes/tool-router.js`, and the permission model doc.
- **Detail:** These files begin with the UTF-8 BOM `\uFEFF` (visible as `﻿` in view). This causes `package.json` JSON parse to fail with `JSONDecodeError: Unexpected UTF-8 BOM`. It does not break Node.js CommonJS `require()` (Node strips the BOM) but may affect JSON parsers, editors, and text-processing scripts. The `package.json` itself has a BOM which breaks Python's `json.load()`.
- **Recommended fix:** Strip BOMs from all JS and JSON files. Use `UTF-8 without BOM` encoding.

### L-2: `executePrivilegedActionRoute` is a thin wrapper that adds no additional logic
- **File:** `api/hermes-api.js`, lines 81–83
- **Detail:** `executePrivilegedActionRoute` simply calls `executeActionRoute`. The name implies extra privilege checking, but the function body is identical to `executeActionRoute`. This could mislead future developers into thinking privileged checks happen at the route level when they actually happen in `tool-executor.js`.
- **Recommended fix:** Either remove the wrapper and use `executeActionRoute` directly, or add a route-level check (e.g., presence of `x-hermes-edit-token` header) to `executePrivilegedActionRoute` to make it truly distinct.

### L-3: `readOpContext` does not validate that role is a known role
- **File:** `api/hermes-api.js`, line 50–58
- **Detail:** `role` is read from `req.body?.role` and passed directly. Unknown roles fall through to `getRolePolicy` which returns `ROLE_RULES.main_hermes` as fallback. While this is safe (an unknown role gets full main_hermes permissions, not zero permissions), it could be confusing — a typo in role name silently upgrades to `main_hermes`.
- **Recommended fix:** Warn or reject unknown roles at the API boundary rather than silently falling back.

### L-4: `repo-indexer.js` not audited for symlink traversal
- **File:** `server/hermes/repo-indexer.js`
- **Detail:** The recursive indexer uses `IGNORE_DIRS` to skip `.git`, `node_modules`, etc. It is not confirmed whether symlinks inside the repo root could be followed to traverse outside the boundary. `assertAllowedPath` in `path-utils.js` checks `path.relative` starts with `..`, but `readdirSync` with `withFileTypes` does not follow symlinks by default — this is likely safe but should be verified.

### L-5: `command-runner.js` — `pm2 status` and `pm2 list` in ALLOWED_COMMANDS require pm2 to be globally installed
- **File:** `server/hermes/command-runner.js`, lines 16–17
- **Detail:** `pm2` commands are allowed but pm2 is a process manager typically installed globally on the server. If pm2 is not installed, these commands fail silently with exit code 126. No meaningful error is surfaced to the admin UI beyond "Command failed."
- **Recommended fix:** Surface the actual stderr in the command result summary when exit code is 126 (spawn failure, command not found).

---

## 6. Missing Features

### F-1: No task state or task history persistence
- **Detail:** The Hermes runtime has no persistent task queue, task state, or task history. Every conversation is stateless. If the agent starts a multi-step task (e.g., "create branch → apply patch → commit → push"), there is no mechanism to track progress, resume after failure, or review what was done. The `memory-store.js` has `workflows: []` in its schema but this is never populated automatically.
- **Recommended fix:** Add task-state tracking to `memory-store.js` with task ID, status (planned/in-progress/done/failed), and steps completed.

### F-2: No cleanup lifecycle or sandbox branch cleanup tooling
- **Detail:** `AGENT_SANDBOX_WORKFLOW.md` specifies sandbox branches must be cleaned up, but:
  - There is no backend endpoint to list, archive, or delete sandbox branches.
  - The sandbox cleanup buttons in `hermes-chat.html` (`sandboxListLeftovers`, `sandboxPreviewCleanup`, `sandboxCleanupSession`, `sandboxDeleteFailed`) all fire prompt strings via the `bind()` helper — these are routed through the conversation runtime to Ollama as text prompts, not actual git branch listing/deletion tools.
  - There is no `git/branch-list` action in `action-schema.js` or `tool-executor.js`.
- **Recommended fix:** Add `git/branch-list` and `git/branch-delete` (sandboxed-only, blocked on `main`/`master`) to the action schema and executor, with appropriate approval gating.

### F-3: No NPC admin UI in Hermes console
- **Detail:** NPC creation/management is handled entirely in `admin/the-brain.html` via `api/brain-api.js`. The Hermes admin console (`admin/hermes-chat.html`) has a `npc_agent` role selector but:
  - There are no Hermes tools for NPC creation, listing, editing, or deletion.
  - NPC agents in the swarm registry have `restricted: true` but there is no Hermes-native tool to interact with NPC data.
  - The only NPC admin surface is `the-brain.html`, which is completely separate from the Hermes governance model (no approval gating, no rollback, separate auth).
- **Recommended fix:** Either (a) route NPC admin through Hermes with proper approval gating, or (b) document explicitly that NPC admin is handled by THE BRAIN admin, with a note in the Hermes UI that NPC tools live at `admin/the-brain.html`.

### F-4: No Hermes-native NPC data tools (list NPCs, read NPC config, edit NPC config via patch-engine)
- **Detail:** The `npc_agent` role in Hermes has `pathPrefixes: ["admin/brain-data", "admin/the-brain", "api/brain-api.js"]` — it can read/write these files via the Hermes patch-engine. However, no tool in `tool-executor.js` or `action-schema.js` is NPC-specific. A Hermes `npc_agent` using file/read or patch/apply would need to manually know NPC file paths. There is no `npc/list`, `npc/create`, or `npc/edit` action.
- **Recommended fix:** Add NPC-specific read/write actions scoped to `admin/brain-data/npcs/` with proper approval gating.

### F-5: No "Start Here" wizard backend integration
- **Detail:** `admin/hermes-chat.html` has a "Start Here" wizard section (lines 335–354 in the HTML). This wizard fires prompts via the `bind()` helper to the chat endpoint. However, the wizard prompts are plain text and depend on Ollama being available to respond. If Ollama is offline (which is expected in GitHub Pages/CI environments), the wizard returns `503 Ollama is offline` — not a guided setup experience.
- **Recommended fix:** Wire the Start Here steps to real tool actions (e.g., `git/status` for "Check repo state", `repos/active` for "Confirm active repo"), not just free-text Ollama prompts.

---

## 7. Dead / Fake UI Controls

The following UI controls in `admin/hermes-chat.html` send **plain-text chat prompts** to the Hermes `/api/hermes/chat` endpoint rather than invoking real structured tool actions. Their behavior depends entirely on Ollama being available and the prompt-to-action router matching the text. If Ollama is offline or the router doesn't match, the buttons appear to "do something" but produce no real action.

| Button ID | Prompt sent | Real tool? |
|---|---|---|
| `sandboxListLeftovers` | "List sandbox leftovers only. Do not delete anything yet." | NO — falls through to Ollama |
| `sandboxPreviewCleanup` | "Preview sandbox cleanup plan..." | NO — falls through to Ollama |
| `sandboxCleanupSession` | "Cleanup sandbox session leftovers only after showing the cleanup plan..." | NO — no `git/branch-list` tool exists |
| `sandboxDeleteFailed` | "Delete failed sandbox data only after explicit approval..." | NO — no delete tool exists |

**Note:** The sandbox buttons are not completely fake — if Ollama is online, the LLM may generate a reasonable description of what cleanup would look like. But no actual git operations are performed. These buttons are misleadingly labeled in a "Sandbox Cleanup" section that implies real cleanup.

**Start Here wizard buttons** (lines 340–354 in hermes-chat.html):
- "Confirm Runtime Root" → prompt: "Show active repo" → routes to `REPO_SHOW_ACTIVE` ✅ REAL
- "Check Git Status" → prompt: "git status" → routes to `GIT_STATUS` ✅ REAL
- "List Repo Files" → prompt: "List the top-level repo directories." → routes to `FILE_LIST` ✅ REAL
- "Rebuild Index" → prompt: "Rebuild index" → routes to `INDEX_REBUILD` ✅ REAL
- "View Memory" → prompt: "View memory" → routes to `MEMORY_VIEW` ✅ REAL
- "Check Swarm" → prompt: "swarm status" → routes to `SWARM_VIEW` ✅ REAL

**Runtime Ops buttons** (lines 357–363):
- "Git Status" → routes to `GIT_STATUS` ✅ REAL
- "Git Diff" → routes to `GIT_DIFF` ✅ REAL
- "Rebuild Index" → routes to `INDEX_REBUILD` ✅ REAL
- "Run Tests" → routes to `COMMAND_RUN npm test` (privileged, requires approval) ✅ REAL (requires tokens)
- "PM2 Status" → routes to `COMMAND_RUN pm2 status` (privileged) ✅ REAL (requires tokens)

**Webcrawl Agent buttons** (lines 374–385): All route to real `webcrawl/*` actions ✅ REAL (require `OPENAI_API_KEY`)

---

## 8. Security Review

| # | Issue | Severity | Status |
|---|---|---|---|
| S-1 | `brain-api.js` wildcard CORS | HIGH | ❌ Not fixed (out of audit scope) |
| S-2 | `brain-api.js` `commit-backup` pushes to current branch without branch guard | CRITICAL | ❌ Not fixed |
| S-3 | NPC creation writes to `/root/...` paths without approval/rollback | HIGH | ❌ Not fixed |
| S-4 | `command-runner.js` passes full `process.env` to subprocesses | HIGH | ❌ Not fixed |
| S-5 | `BRAIN_ADMIN_TOKEN` has known fallback default | HIGH | ❌ Not fixed |
| S-6 | Hermes approval gate is in-memory — lost on restart | MEDIUM | ❌ Not fixed |
| S-7 | `approvalToken` (HERMES_EDIT_TOKEN) is entered in admin UI browser field | LOW | Acceptable — password input type, HTTPS-only |
| S-8 | SSRF: webcrawl agent has DNS resolution + private IP block | PASS | ✅ Implemented |
| S-9 | Path traversal: `path-utils.js` `normalizeRepoPath` blocks `..` and absolute paths | PASS | ✅ Implemented |
| S-10 | Deny list for `.env`, `.pem`, `.key`, `.git`, `secrets/` in `config.js` | PASS | ✅ Implemented |
| S-11 | Direct main/master push block in `git-operator.js` | PASS | ✅ Implemented |
| S-12 | Approval token is one-time-use (`consumeApproved` deletes after use) | PASS | ✅ Implemented |
| S-13 | Token mismatch (approval session + action type checked) | PASS | ✅ Implemented |
| S-14 | NPC agent path restriction in `agent-runtime.js` | PASS | ✅ Implemented |
| S-15 | Ollama hardcoded to `127.0.0.1` (not configurable externally) | PASS | ✅ Correct |
| S-16 | CORS allowlist in `hermes-api.js` (explicit origins, not wildcard) | PASS | ✅ Correct |
| S-17 | `x-powered-by` header disabled | PASS | ✅ Correct |
| S-18 | Webcrawl redirect loop to private IP blocked | PASS | ✅ Implemented |
| S-19 | Command allowlist in `command-runner.js` (no shell injection) | PASS | ✅ Implemented — `shell: false` |
| S-20 | Repo clone restricted to GitHub HTTPS only | PASS | ✅ Implemented |

---

## 9. Runtime / Deployment Review

| # | Item | Status | Notes |
|---|---|---|---|
| R-1 | `HERMES_REPO_ROOT` env var controls active repo root | ✅ | Falls back to `git rev-parse --show-toplevel` |
| R-2 | `brain-api.js` uses hardcoded `/root/Crypto-Moonboys.github.io` | ❌ | Must use env var; deployed path is `/home/moonboys/Crypto-Moonboys.github.io` |
| R-3 | PM2 process name assumptions | ❌ RISK | `command-runner.js` allows `pm2 status` and `pm2 list` but `brain-api.js` uses `pm2 restart npc-brain` — PM2 app names are assumed, not verified |
| R-4 | `api/hermes-api.js` listens on `127.0.0.1:3012` | ✅ | Localhost-only by default |
| R-5 | `api/brain-api.js` listens on all interfaces (port 3001) | ❌ RISK | No bind address specified — `app.listen(PORT, ...)` without IP binds to `0.0.0.0`. Should bind to `127.0.0.1` like hermes-api. |
| R-6 | Missing `OPENAI_API_KEY` gracefully degrades webcrawl | ✅ | Returns `unavailable` result, does not crash |
| R-7 | Missing `HERMES_EDIT_TOKEN` blocks all privileged actions | ✅ | `assertServerToken` throws if not set |
| R-8 | Missing `BRAIN_ADMIN_TOKEN` uses insecure default | ❌ | Should throw at startup (see H-5) |
| R-9 | `express` not installed in CI environment | ❌ CRITICAL | 30 integration tests fail (see C-1) |
| R-10 | Ollama availability: chat falls back gracefully to 503 | ✅ | Proper error message returned |
| R-11 | `MAX_COMMAND_TIMEOUT_MS = 120000` (2 min) | ✅ | Reasonable upper bound |
| R-12 | `MAX_READ_BYTES = 512 * 1024` (512 KB) | ✅ | Reasonable file read cap |
| R-13 | `webcrawl-agent.js` fetch size limited to 250KB | ✅ | Correct |
| R-14 | `brain-api.js` listens on `0.0.0.0:3001` | ❌ | See R-5 |
| R-15 | Hermes data root defaults to `admin/hermes-data` relative to cwd | ⚠️ | Fine for single-process deployment; could collide if multiple Hermes instances run from different cwds |

---

## 10. NPC Agent Review

### NPC Agent Permissions (Hermes)

The `npc_agent` role is correctly restricted in `agent-runtime.js`:
```
npc_agent: {
  canEditRepo: false,
  canRunCommands: false,
  canManageNpc: true,
  canUseGit: false,
  pathPrefixes: ["admin/brain-data", "admin/the-brain", "api/brain-api.js"]
}
```

**Test coverage confirms:** The `npc_agent` cannot edit `index.html` (path restriction test passes). It cannot run commands (capability restriction test passes). These restrictions are enforced in `agent-runtime.js` and checked in `tool-executor.js`.

### NPC Agent Gaps

| # | Gap | Risk |
|---|---|---|
| N-1 | NPC creation in `brain-api.js` bypasses Hermes approval/rollback | HIGH |
| N-2 | NPC data lives at `/root/npc-brain/npcs/` (absolute, hardcoded) | HIGH |
| N-3 | No Hermes-native `npc/list`, `npc/create`, `npc/edit` actions | MEDIUM |
| N-4 | `watcher_agent` role defined but has no implementation | LOW |
| N-5 | `npc_agent` path prefix includes `api/brain-api.js` — this means an npc_agent could read the brain API source code directly | LOW (read-only, no canEditRepo) |
| N-6 | No dedicated NPC admin UI inside Hermes console | MEDIUM |
| N-7 | THE BRAIN admin and Hermes admin are separate auth systems — risk of confusion about which system is authoritative | MEDIUM |

### NPC Isolation Assessment

**Can NPC agents accidentally affect the public website or runtime?**

Via Hermes tools: **NO** — the `npc_agent` role cannot:
- Edit arbitrary repo files (pathPrefixes restriction blocks it)
- Run shell commands
- Use git (push/commit/branch)

Via `brain-api.js` (separate system): **PARTIALLY YES**:
- The `commit-backup` endpoint will `git push` to whatever branch is currently checked out, including `main`
- NPC creation could restart the `npc-brain` PM2 process, affecting live NPC chat
- The restore endpoint overwrites live NPC data without confirmation

**Summary:** The Hermes-layer NPC restrictions are well-enforced. The `brain-api.js` layer has weaker governance.

---

## 11. Recommended Fix Order

**P0 — Fix before any production use:**
1. Run `npm install` in CI/deployment — 30 tests currently fail
2. Replace hardcoded `/root/Crypto-Moonboys.github.io` and `/root/npc-brain/` in `brain-api.js` with env-var-driven paths
3. Add branch guard to `brain-api.js` `commit-backup` — block push if on `main`/`master`

**P1 — Fix before next sprint:**
4. Restrict `brain-api.js` CORS to explicit origin allowlist (align with `hermes-api.js`)
5. Make `brain-api.js` bind to `127.0.0.1` not `0.0.0.0`
6. Route NPC creation through approval gate (or add explicit preview/approve flow)
7. Replace full `process.env` pass-through in `command-runner.js` with minimal env subset
8. Make startup fail if `BRAIN_ADMIN_TOKEN` is the default value

**P2 — Fix in next iteration:**
9. Strip BOM from all server JS files
10. Persist `approval-gate.js` to disk with TTL
11. Implement `git/branch-list` action for real sandbox cleanup
12. Add task state tracking to `memory-store.js`
13. Implement or mark-as-planned the `watcher_agent` role
14. Tighten `tool-router.js` `read` regex to avoid false positives
15. Clarify `executePrivilegedActionRoute` vs `executeActionRoute` naming

**P3 — Documentation and UX cleanup:**
16. Determine canonical `the-brain.html` vs `the-brain-new.html`
17. Audit `admin/space-agent.html`
18. Add comment to sandbox cleanup buttons that they are prompt-based, not direct git tools
19. Add NPC admin link from Hermes console to THE BRAIN

---

## 12. Exact Files Inspected

| File | Role |
|---|---|
| `admin/hermes-chat.html` | Hermes admin console UI |
| `admin/the-brain.html` | NPC admin UI |
| `admin/the-brain-new.html` | NPC admin UI (alt/draft version) |
| `admin/space-agent.html` | Unknown admin page (not audited deeply) |
| `admin/brain-data/npcs/bitcoin-kid.json` | Sample NPC data file |
| `api/hermes-api.js` | Hermes HTTP API routes |
| `api/brain-api.js` | NPC/Brain admin HTTP API |
| `js/hermes-chat.js` | Hermes admin UI JavaScript |
| `server/hermes/action-schema.js` | Action type definitions |
| `server/hermes/tool-router.js` | Prompt-to-action routing |
| `server/hermes/tool-executor.js` | Action dispatch and privilege checks |
| `server/hermes/conversation-runtime.js` | Conversation/chat orchestration |
| `server/hermes/approval-gate.js` | Approval queue (in-memory) |
| `server/hermes/command-runner.js` | Sandboxed command execution |
| `server/hermes/patch-engine.js` | File patch preview/apply/rollback |
| `server/hermes/git-operator.js` | Guarded git operations |
| `server/hermes/repo-registry.js` | Repo registry (multi-repo support) |
| `server/hermes/swarm-registry.js` | Agent roster |
| `server/hermes/memory-store.js` | Persistent memory (JSON file) |
| `server/hermes/webcrawl-agent.js` | Web crawl/search/SSRF-guarded agent |
| `server/hermes/agent-runtime.js` | Role policies and NPC path restrictions |
| `server/hermes/chat-proxy.js` | Ollama proxy with model allowlist |
| `server/hermes/config.js` | Config, deny patterns, path constants |
| `server/hermes/path-utils.js` | Path traversal protection |
| `server/hermes/file-service.js` | Safe file list/read/search |
| `server/hermes/orchestrator.js` | Tool orchestration entry point |
| `server/hermes/task-planner.js` | Task-to-role classification |
| `tests/hermes-chat-proxy.test.js` | Chat proxy unit tests |
| `tests/hermes-runtime.test.js` | Runtime unit tests |
| `tests/hermes-bridge.test.js` | Integration tests (HTTP) |
| `tests/hermes-repo-targeting.test.js` | Repo-targeting integration tests |
| `tests/hermes-webcrawl.test.js` | Webcrawl unit/integration tests |
| `AGENT_SANDBOX_WORKFLOW.md` | Sandbox governance doc |
| `AGENT_EDITING_RULES.md` | Agent editing rules doc |
| `HERMES_AGENT_RUNTIME_HANDOVER.md` | Runtime handover doc |
| `docs/hermes-npc-permission-model.md` | NPC permission model doc |
| `docs/hermes-sovereign-runtime.md` | Hermes runtime architecture doc |

---

## 13. Tests / Checks Run

### `npm test`
Runs: `hermes-chat-proxy.test.js` → `hermes-runtime.test.js` → `hermes-bridge.test.js` → `hermes-repo-targeting.test.js` → `hermes-webcrawl.test.js` → `scripts/smoke-test.js` → `scripts/site-shell-parity-audit.mjs`

### `node --check` (syntax validation)
All Hermes runtime files pass syntax check cleanly.

### Grep checks performed
- Hardcoded stale paths: `/root/Crypto-Moonboys.github.io` — **FOUND** in `api/brain-api.js`
- Hardcoded stale paths: `/home/moonboys/Crypto-Moonboys.github.io` — not found in source
- Hardcoded stale paths: `/opt/space-agent` — found only in `docs/space-agent-protected-access-runbook.md` (documentation, not code)
- Exposed secrets/tokens: `CHANGE_ME_BRAIN_ADMIN_TOKEN` — found in `api/brain-api.js` (default fallback)
- Wildcard CORS: `cors()` call — **FOUND** in `api/brain-api.js`
- Direct main/master push: `git push` without branch guard — **FOUND** in `api/brain-api.js` commit-backup
- Unsafe shell: `shell: true` — not found
- Unsafe shell: `exec(` — only safe `execFile` and regex `.exec()` found

---

## 14. Pass / Fail Status

| Category | Status | Notes |
|---|---|---|
| `node --check` all hermes files | ✅ PASS | All JS syntax valid |
| `hermes-chat-proxy.test.js` (8 tests) | ✅ PASS | All 8 pass |
| `hermes-runtime.test.js` (9 tests) | ✅ PASS | All 9 pass |
| `hermes-bridge.test.js` (22 tests) | ❌ FAIL | All 22 fail — `express` not installed |
| `hermes-repo-targeting.test.js` (8 tests) | ❌ FAIL | All 8 fail — `express` not installed |
| `hermes-webcrawl.test.js` (6 tests) | ✅ PASS | All 6 pass |
| `scripts/smoke-test.js` | ✅ PASS | |
| `scripts/site-shell-parity-audit.mjs` | ✅ PASS | 0 failures, 0 warnings |
| Stale path grep (`/root/Crypto-Moonboys`) | ❌ FAIL | Found in `api/brain-api.js:143` |
| Stale path grep (`/home/moonboys`) | ✅ PASS | Not found in code |
| Stale path grep (`/opt/space-agent`) | ✅ PASS | Docs only, not code |
| Wildcard CORS check | ❌ FAIL | Found in `api/brain-api.js:9` |
| Main/master push guard | ✅ PASS (hermes) / ❌ FAIL (brain-api) | hermes-api guarded; brain-api unguarded |
| Secret/token exposure check | ✅ PASS | No secrets in source; `CHANGE_ME` default is documented risk |
| NPC agent path restriction | ✅ PASS | Tested and enforced |
| SSRF guard (webcrawl) | ✅ PASS | Private IP + localhost blocked |
| Path traversal guard | ✅ PASS | `..` and absolute paths rejected |

**Overall: 10 PASS, 5 FAIL (4 of which are the single root cause of `express` not installed + 1 brain-api path/CORS/push issues)**
