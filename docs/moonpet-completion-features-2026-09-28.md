# Moonpet daily completion and season finale — 28 September 2026

Based on main `8769e4008f13169e95de4fc23e07ddaf0dfd0aa9`.
These additions were requested after the audit identified that the seven daily
checklist goals had no combined payout and season completion had no extra boss.
They require the migration and deployment below; this document does not claim
that production has already been updated.

## Player behavior

| Feature | Rule |
| --- | --- |
| Daily 7/7 bonus | One earned bonus per account/UTC day: up to 25 Pet XP, 50 Gold, 1 Style |
| Saved checklist | Feed, Train, full Feed/Play/Clean set, Trade, Buy/Upgrade, Adventure route, Bank 50 Gold; no new mandatory goals |
| Claim later | Earned complete days remain after midnight; first claim freezes the selected hatched pet |
| Finale unlock | Final evolution + 60 distinct-day Marks + 10 distinct-week Crests, or already completed season pet |
| Signal Sovereign | Striker, Guardian, Tactician; previewed attacks, Guard/charge, Surge and limited repair kits |
| Battle resources | Separate HP and kits; no pet energy/stat costs, free retry after defeat |
| Victory | Saved Finale Victor achievement; once per pet/season: up to 100 Pet XP, 200 Gold, 5 Style |
| Existing completion | Preserved, including earlier-season pets; boss victory is an additional challenge |
| Practice | Local, reward-free; links directly to server-saved Continuing Contracts |

The existing 1200 daily Pet XP cap applies to both payouts. Neither grants
Community XP, Growth Marks, Weekly Crests, specialist bonuses, official-run
credit, real tokens or money. No existing daily/weekly/season threshold changes.

## Persistence and authority

Migration 077 adds two tables. Daily checklist bits are latched by accepted
action receipts, completed equipment upgrades and account wallet changes in
the same database transaction. Bank credit survives spending even if no state
refresh occurs between earning and spending. A state read also imports today's
existing receipts and any currently held 50 Gold at rollout/day rollover.
The migration does not fabricate unobserved historical bank balances.

Daily reward uniqueness is account/day. The first claim captures an owned,
hatched active pet. Its assignment survives a failed payout; switching to an egg
cannot redirect the reward. Unclaimed complete days do not expire. The list is
chronological, so an old pending claim does not hide later claims.

Finale battles are pet/owner/season records. Server builds determine initial
stats and every move; no client HP, damage, completion or reward value is used.
Optimistic revision checks prevent simultaneous clicks and stale responses from
advancing the same turn twice. Revisions continue increasing after defeat and
retry. Victory saves before payout and remains claimable after interruptions,
pet changes and season rollover. Won fights cannot reset to farm another reward.

Reward authorization is rechecked inside the existing atomic reward batch,
including full instance/slot ownership. Fixed keys and fixed payout values
protect retries. An acknowledgement failure after a successful ledger write
can be repaired without paying twice. Existing completion markers are never
changed by these features. Finale Victor is projected from the saved victory
into the selected pet's achievement archive and the finale record.

The shared leaderboard receives only actual capped Pet XP. Daily/weekly ranks
use settlement windows, seasonal ranks use the original earning season and
all-time includes retained pets. Public activity has readable daily-bonus and
finale-victory text with the earning pet. No new score projection is introduced.

## Verification

The focused SQLite suite exercises accepted versus pending evidence, spending,
concurrent claims, midnight, pet changes, payout and acknowledgement failures,
fixed reward amounts, XP caps, equipment credit, real qualification, preserved
completion, archived pets, battle previews, losing/retrying, stale/overlapping
turns, leaderboard agreement, migration reapplication and partial rollout.

Mobile browser coverage exercises the real claim/action/state handlers at
390×844 and 360×640: claim daily 7/7, see a locked finale, unlock/start it, lose,
retry with another build, reload a saved turn, win, recover an interrupted
reward and use the Practice-to-Contracts link. Existing progression tests retain
their 180-statement warm-state and 600-statement backlog budgets. Final full
suite results are recorded in the PR. Production player data was not mutated.

## Deploy after merge

GitHub Pages updates the frontend. The Worker URL and asset tokens are bumped
so reopening the Mini App loads the matching release. Before deploying the
Worker, apply only the new, additive migration to the existing production DB:

```cmd
cd /d E:\GitHub\Crypto-Moonboys.github.io
git switch main
git pull --ff-only origin main
npm ci
cd workers\moonboys-api
npx wrangler d1 execute wikicoms --remote --file=migrations/077_moonpet_completion_rewards.sql
cd ..\..
node scripts/deploy-worker-with-provenance.mjs moonboys-api
git rev-parse HEAD
curl.exe --ssl-no-revoke https://moonboys-api.sercullen.workers.dev/health
curl.exe --ssl-no-revoke https://moonboys-api.sercullen.workers.dev/deployment-info
```

The deployment commit must match the pulled HEAD. No VPS restart is needed.
Do not replay historical reset migrations. Migration 077 is additive and safe
to re-run. Missing new tables leave these additions visibly unavailable while
the existing checklist remains usable; ordinary database failures are not
treated as an empty or completed finale.

Reopen the Mini App and check MISSIONS → Daily 7/7 Bonus and Season Finale,
PROFILE → Open Season Finale, and EXPLORE → Practice → Play Contracts for
Progression. Qualified test/real pets can enter the finale; do not alter a
production pet's qualification evidence merely to test the unlock.
