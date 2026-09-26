# Moonpet gameplay wiring audit — 27 September 2026

Base: merged PR #1323, `0c99ca2f77a9d4f92f305cec6ad056473c9ee450`.
At the start of this audit the public Worker still reported
`b43bbbc4ebb94acbab82ee660277d1b83d0fc11a`, deployed at
`2026-09-26T22:27:55.791Z`. A merged frontend does not deploy the Worker or
apply D1 migration 076. Continuing Contracts therefore still needed the
deployment steps from the previous PR.

## Confirmed findings and fixes

| Finding | Change |
| --- | --- |
| Daily Run selected from ten modifiers, but six effects were never used by the daily engine and Glass Cannon's equal bonuses cancelled out | New runs select only Fast Enemies, Low Energy or Lucky Run, all of which change the actual clear probability. Conditions and exact effects are visible |
| Safe and bold daily choices received identical score; several differently named options had identical mechanics | All nine multi-choice Moon Alley rooms now have authored safe, balanced and bold approaches with different odds and scores |
| Daily choices showed labels without their chance or score | Preview and resolution use the same calculation; the UI shows clear chance, score on success and the failure consequence |
| No build decisions existed within an official Daily Run | Optional Guardian, Striker or Scavenger tactics after rooms 3 and 6; choices persist and change later odds/score |
| A losing concurrent room request returned its own proposed outcome instead of the stored winner | Read the persisted room outcome after a lost update; do not report a fabricated win or use its score |
| A room could resolve with a build read before another tab selected a tactic | Atomically compare the tactic count, room position and active run status when saving a v2 outcome; stale calculations require refresh |
| Legacy run previews used the currently selected pet's equipment, while resolution used the source pet | Both now use the original run pet; the UI identifies a different source pet |
| Old runs without a source pet could not be previewed safely | Show unavailable run controls without breaking the rest of the app or attaching the run to another pet |
| Extraction was enabled before any room could be banked | Disable it until a room is cleared, with an explanation |
| Relic ownership did not tell players that passive powers were inactive | Relic Vault states the actual collectible/progression role and inactive passive powers |
| Generic care-objective copy implied every new care button counted | Specify Feed, Play, Clean or Sleep; stat-only actions retain their existing boundaries |
| Telegram deep-link focus validation omitted newer panels | Allow the existing Contracts, Practice, Play Now and Daily/Weekly objective destinations |

## What the new choices do

| Choice | Clear chance | Run score |
| --- | --- | --- |
| Safe approach | +7 percentage points | -20% |
| Balanced approach | Baseline | Baseline |
| Bold approach | -3 percentage points | +30% |
| Guardian tactic | +5 percentage points in later rooms | -10% |
| Striker tactic | +8 percentage points in combat; -3 elsewhere | +10% |
| Scavenger tactic | -5 percentage points in later rooms | +25% |

The two chosen tactics stack additively with the approach. Clear probability
remains between 5% and 99.5%. Score is rounded once after combining the
percentages. Tactics do not change Pet XP, Community XP, drops, currencies,
inventory, pet stats, daily attempt limits or existing reward caps.

Each checkpoint accepts one immutable choice. Continuing without choosing
expires that offer. Old clients can continue their rooms without a new
mandatory interaction. Closing and reopening the app preserves a choice.

## Rules and persistence

A new run stores `daily_rules_v2` in the existing modifier table before its
first room is generated. Already-generated runs keep their existing scoring,
condition and outcome rules. Resuming them does not insert a second condition
or silently activate checkpoint mechanics halfway through a run.

Checkpoint entries use unique `(run_id, modifier_id)` keys. The INSERT checks
the authenticated owner, original pet and season, official daily reservation,
current room, active status and unresolved next room. Arbitrary client effect,
score, pet or reward fields are ignored. There is no new reward path.

The room outcome records its selected tactics. The existing terminal cleanup
removes temporary modifiers. Existing run history and reward receipts remain
authoritative. This change adds no table and needs no new migration.

## Runtime boundaries checked

| System | Current behavior |
| --- | --- |
| Care / incubation | Existing lifecycle, per-action limits and stat-only Energy Drink/Dance/Cuddles remain enforced |
| Daily/Weekly Journey | Existing accepted-evidence and receipt authority retained; optional tactics are not quest evidence |
| Seven daily missions | Their existing named objectives and daily limits remain; no automatic reward or completion was added |
| Standard Moon Run | Existing 100-room engine, authored risk/cost choices, equipment and protected banking; source-pet previews corrected |
| Official Daily Run | One account/day attempt; server outcomes, visible odds, real risk/score choices and optional saved tactics |
| Continuing Contracts | Repeatable saved quest/rank loop from PR #1323; first three account/day successes reserve bounded Pet XP; no cooldown or pet-energy cost |
| Practice | Local reward-free builds and drafts; no backend progression accepted |
| Stories, districts, activities, jobs, economy, Arena and Kaiju | Existing authority/affordability/unlock/settlement regressions retained |
| Relics | Persistent collectibles; passive effects remain inactive rather than advertised as working build powers |
| Advanced traits, breeding, lineage, fusion, sanctuary and prestige | Existing future/locked classifications retained |

The continuing-play route after exhausting official dailies is Contracts or
Practice. This PR improves decision quality inside the daily attempt; it does
not turn daily rewards into an unlimited farm. Server-saved contracts still
need the previously merged Worker/schema deployment to be visible live.

## Verification

- Worker/API domain: 66 checks passed; arcade domain: 23 checks passed.
- Daily integration suite includes the existing 10,000-callback economy
  simulation plus immutable/parallel tactic choices, foreign owner and invalid
  choices, terminal/early requests, condition eligibility, legacy-run resume,
  preview/outcome agreement, all nine room approach sets, tactic/room races,
  conflicting room outcomes and original-pet equipment after switching.
- Real Worker + SQLite browser checks at 390×844 and 360×640 exercise all six
  screens, existing saved contracts, checkpoint choice, reload, visible odds,
  score settlement, empty extraction and unchanged Pet XP.
- GitHub CI remains the complete visual/static gate before merge. The local
  Mini App browser checks use the provisioned Chromium executable.

This is code, fixture and browser verification. No private production player
database was inspected or changed. It is not a claim that every live account,
season or Cloudflare binding has been exercised.

## Deployment and live check

After merge, use a clean current `main` checkout:

```sh
git pull --ff-only origin main
npm ci
npx wrangler d1 migrations list wikicoms --remote --config workers/moonboys-api/wrangler.toml
npx wrangler d1 migrations apply wikicoms --remote --config workers/moonboys-api/wrangler.toml
node scripts/deploy-worker-with-provenance.mjs moonboys-api
```

Migration 076 is a prerequisite from PR #1323, not a new migration in this
change. If it is already applied, there is no additional schema migration.
For unexpected older pending migrations, follow `docs/D1_MIGRATION_RUNBOOK.md`.
Publish the frontend through the normal GitHub Pages workflow.

Reopen Telegram. Confirm deployment-info matches main; Contracts is available
for a hatched pet; a new Daily Run shows its condition and odds; a cleared
third/sixth room offers tactics; a selected tactic survives reload; completing
the official attempt still prevents a second attempt that UTC day. An already
started pre-update run should retain its old rules.

No merge, deployment or production migration was performed for this audit.
