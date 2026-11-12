# R2 / Worker / Backend — Environment Conventions

This document is the **canonical reference** for all Cloudflare R2 and Worker environment
variable and secret names used across the Crypto Moonboys backend.

Do **not** invent alternate names. Do **not** use hashed or dynamic object keys.
Do **not** change storage prefixes once they are live.

---

## Locked philosophy

All R2 and Worker code must resolve configuration exclusively from the names listed here.
Any future Worker, script, or CI job that reads or writes R2 storage, manages player memory,
handles quests, updates leaderboards, or ingests wiki-change data **must** reference these
exact identifiers.

---

## Secrets

These are injected as GitHub Actions secrets or Cloudflare Worker secrets. Never hard-code
them in source files.

| Secret name | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier for API calls and Wrangler |
| `CLOUDFLARE_API_TOKEN` | API token with R2 and Workers permissions |
| `CLOUDFLARE_D1_READ_TOKEN` | GitHub Actions token with Account / D1 / Read for production migration evidence only |
| `CLOUDFLARE_R2_BUCKET` | Name of the R2 bucket used by all services |
| `R2_ENDPOINT_URL` | S3-compatible endpoint URL for the R2 bucket |
| `R2_ACCESS_KEY_ID` | S3-compatible access key ID for R2 |
| `R2_SECRET_ACCESS_KEY` | S3-compatible secret access key for R2 |
| `R2_PUBLIC_BASE_URL` | Public base URL for serving R2 objects (no trailing slash) |

---

## D1 production evidence credential setup

The manual `.github/workflows/d1-production-migration-verify.yml` workflow reads
`CLOUDFLARE_D1_READ_TOKEN` and maps it to Wrangler's standard
`CLOUDFLARE_API_TOKEN` environment variable inside the job. It does not fall back
to the shared `CLOUDFLARE_API_TOKEN` repository secret. A missing dedicated secret
stops verification before any query.

1. In repository **Settings → Secrets and variables → Actions**, add
   `CLOUDFLARE_D1_READ_TOKEN` with the working `github-d1-evidence` token.
   This token needs only **Account → D1 → Read**, scoped to the account containing
   `wikicoms`. If its value was not saved, create another dedicated read token;
   GitHub cannot reveal an existing secret value.
2. Keep `CLOUDFLARE_ACCOUNT_ID` set to that database's account ID.
3. The repository currently has no other tracked workflow reference to the shared
   `CLOUDFLARE_API_TOKEN` after this change. If that secret was overwritten with
   the D1 read token and its original value was not saved, no replacement is needed
   for current tracked workflows. Keep the secret in place; review permissions
   before assigning it to any future deployment workflow.
4. After this workflow change is merged, manually run **D1 Production Migration
   Verify** on `main`. Confirm both jobs pass and the
   `d1-production-migration-evidence` artifact is uploaded.

These are GitHub Actions credential changes. No Worker deployment or D1 migration
is required. Existing deployed services do not take credentials from a repository
secret at runtime. Reverting the workflow change would make verification depend
on the shared token again, including its D1 permissions.

---

## Variables

These are non-secret configuration values. They are committed as environment defaults
(e.g. in `wrangler.toml` `[vars]`, GitHub Actions `env:`, or Worker constants) and must
not be overridden per-object or generated dynamically.

| Variable name | Default value | Purpose |
|---|---|---|
| `R2_MEMORY_PREFIX` | `rpg-memory` | R2 key prefix for all player-memory objects |
| `R2_QUEST_BANK_PREFIX` | `quest-bank` | R2 key prefix for all quest-bank objects |
| `R2_LEADERBOARD_PREFIX` | `leaderboards` | R2 key prefix for all leaderboard objects |
| `R2_WIKI_INDEX_PREFIX` | `wiki-change-index` | R2 key prefix for wiki-change intake objects |
| `MAZE_SEASON_LENGTH_DAYS` | `90` | Duration of one Block Topia Quest Maze season in days |
| `MAZE_YEARLY_RESET_UTC` | `12:00` | UTC time of the annual maze reset |

---

## Storage layout

All R2 object keys are **deterministic** and composed from the locked prefixes above.
No hashed, timestamped, or randomly generated key segments are permitted.

Canonical path patterns (examples — extend these, never replace them):

```
rpg-memory/{player_id}.json
quest-bank/{quest_id}.json
leaderboards/{season_id}.json
wiki-change-index/{change_id}.json
```

Keys must:
- Begin with the exact prefix defined above (no trailing slash on the prefix itself)
- Use `/` as the path separator
- Use only lowercase alphanumeric characters, hyphens, and dots after the prefix

---

## Rules

1. **No alternate names.** If a Worker reads `CF_ACCOUNT_ID` instead of
   `CLOUDFLARE_ACCOUNT_ID`, that is a defect.
2. **No dynamic prefixes.** Prefixes are compile-time constants — never constructed from
   user input, timestamps, or hashes.
3. **No prefix changes after first write.** Once an object has been written under a prefix
   it must be read back using that same prefix forever. Migration requires an explicit,
   tracked rename operation.
4. **Secrets never in source.** All values in the Secrets table above must come from the
   secret store, never from committed files.
5. **Variables committed, not secret.** All values in the Variables table are non-sensitive
   and should be committed to `wrangler.toml` `[vars]` or the equivalent config file so
   they are auditable.

---

## Related docs

- `docs/ranking-rules.md` — wiki search ranking rules
