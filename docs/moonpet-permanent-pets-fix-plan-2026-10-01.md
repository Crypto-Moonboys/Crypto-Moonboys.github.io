# Permanent Moonpets: audit and implementation plan

Date: 2026-10-01. Audited repository commit: `f0d338ffc53ee16f50e1bf8de7323a6a1ec2fecf`.

Status: proposed implementation, not deployed behavior. This document supersedes the earlier annual archive proposal for future development; the live game still uses calendar-season ownership. Existing live documentation must only be changed to claim permanent pets when the implementation ships.

## Product rules supplied by GK

- Pets never expire, reset, retire or move out of play automatically. This includes final-form pets.
- Anyone can join at any time. Each pet's progression starts with its own adoption, not a global season date.
- Three occupied pet spaces maximum for now. The earlier six-space proposal is superseded.
- Six lifecycle stages: approximately one week as an egg, three weeks in the next stage, then four increasingly demanding stages across roughly the following eleven months. Regular play targets about a year; there is no deadline or penalty for taking longer.
- First adoption requires 1,000 lifetime, server-verified website Arcade XP. This is eligibility, not an XP debit. Spending earned XP later must not revoke eligibility or existing pets.
- Extra pet spaces cost increasing amounts of spendable Arcade XP. Preserve previous purchases.
- Retain linked website/Telegram login, current gameplay, daily and weekly quests, seasonal competitions, equipment, Contracts, runs, bosses, Arena and Kaiju. Website Arcade remains a separate source of play and eligibility.
- Only the owner choosing Delete ends a pet's playable life. Show a confirmation identifying the pet and what will be lost.
- Keep earned rewards, account wallet balances, purchase history and settlement evidence safe during migration and deletion.

## Findings in the current source

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Calendar-quarter pet cycles | `pets/season-authority.js`: quarter-based key, start and end dates | October 1 changed the ownership namespace after only a few weeks of beta |
| Automatic starter replacement | `worker.js`: `ensurePetStarterSeasonSlot`, `preparePetMiniAppState` | A changed season creates a fresh egg and advances the active pointer |
| Roster hides earlier pets | `buildPetSeasonSlotSummary`, `buildPetSeasonSlotCoreSummary`: current `season.key` filter | Old pets and purchased slots are not shown as current ownership |
| Purchases are seasonal | `buyPetSeasonSlot`: season-qualified IDs, debit and allocation keys | A new quarter does not preserve the player's usable extra spaces |
| Three-space limit already exists | `PET_SEASON_MAX_SLOTS = 3`; client renders slots 1, 2, 3 | The requested capacity does not require adding more slots |
| Entry/cost rules differ | First `adopt` creates a pet without a 1,000-XP check; extra costs are 500 and 1,000 | Eligibility needs server enforcement and extra costs need a new configuration |
| Six forms already exist | `pets/content/evolutions.json`: stages 0 through 5 | Keep the existing form/art structure; UI can label them 1 through 6 |
| Short progression assumptions | Evolution minimum ages 14, 28, 49, 64 and 78 days; completion requires 60 Marks and 10 Crests | Changing the season calendar alone cannot deliver year-long progression |
| Two egg/evolution clocks | `species-lifecycle.js`: earliest hatch 7 days, guaranteed hatch 14; first evolution requires age 14 | Reconcile hatching and first-form evolution so the intended seven-day transition is consistent |
| Weekly evidence is bounded | `getPetSeasonWeek` clamps to 13; Crest validation accepts only weeks 1–13; SQL checks also bound qualification weeks | Lifetime weekly progress needs new week identity and schema handling, not just larger JS numbers |
| Sanctuary can replace completed pets | `pets/sanctuary.js`: archive statements and successor allocation | Remove automatic retirement/replacement in addition to calendar rollover |
| Linked login foundation is present | Client `restoreBrowserAuth` calls `MOONBOYS_IDENTITY.restoreLinkedTelegramAuth`; API verifies signed auth | Reuse verified identity; do not trust a local Telegram ID or unsigned website state |

This is a moderate backend/data change with bounded UI changes, not a game rewrite. Current saves and pending rewards are the highest-risk part. An ownership fix is needed before balancing changes.

## Separate ownership, growth and competitions

1. **Permanent ownership:** stable pet ID, verified owner, permanent space, allocation/purchase receipt and deletion state. No dependency on the current calendar-season key.
2. **Lifetime growth:** adoption timestamp, XP, stage, equipment, identity, Marks, qualifying weeks and completion record. Completion unlocks recognition/content; it does not retire the pet or replace it.
3. **Competitions:** UTC day/week/season keys still identify event windows, leaderboards, allowances and unique claims. Competition rollover never changes the pet roster, age, stage or owned spaces.

Retain existing pet IDs and their legacy `season_key` as provenance where required by saved runs and receipts. Add a permanent ownership mapping rather than renaming IDs or globally stripping season guards. Historical source ownership and current competition windows need different validations.

## Six-stage pacing proposal

These are balancing targets for a regular player, not expiry dates or a promise that waiting alone completes a pet. A missed day or week never becomes a permanently missing requirement.

| Display stage | Existing form | Approximate time in stage | Typical total age at its end |
| --- | --- | --- | --- |
| 1 | Secret Bot / egg | 7 days | 7 days |
| 2 | Street Moonpet | 21 days | 28 days |
| 3 | Cyber Moonpet | 42 days | 70 days |
| 4 | Elite Moonpet | 70 days | 140 days |
| 5 | Moon Guardian | 100 days | 240 days |
| 6 | Legendary Moon Guardian | 125 days of final mastery | About 365 days |

Stage 6 starts around month eight and has mastery progression before full completion around a year; this does not add a seventh form. A completed pet remains playable and can continue existing training tracks and competitions. Do not silently invent infinite visible levels beyond the current caps; expose capped tracks honestly and decide additional mastery separately if needed.

The seven-day egg transition should require the current care interaction rules and offer recovery for inactive players. Reconcile the current fourteen-day fallback and evolution gate. Stage 2 should retain meaningful care/training play across its next three weeks.

Later stages should combine earned Pet XP, active-day evidence, qualifying weekly objectives and varied current activities. Age alone is insufficient. Do not simply impose a 365-day wait on an otherwise completed pet. Tune a lower bound against speed-running while allowing normal variation around the target. Existing final forms and earned evolution stages must never be downgraded.

Use active-day and week requirements rather than streaks requiring perfect attendance. Aggregate legitimate progress for the same pet across competition seasons. A pet adopted in December must face the same progression path as one adopted in January.

Before choosing numeric thresholds, extend the current progression simulation to regular, light, highly active and returning users over at least 18 months. Include daily reward caps, material supply, shared wallet resources, boss availability, three-pet switching and legacy achievement evidence. A proposed regular-player completion range is roughly 10–14 months; lighter play may take longer indefinitely. This range is a balancing recommendation, not a confirmed live guarantee.

## Arcade eligibility and space pricing proposal

| Space | Proposed rule | Status |
| --- | --- | --- |
| 1 | Unlock at 1,000 lifetime verified Arcade XP; no debit | User rule |
| 2 | One-time 2,000 spendable Arcade XP debit | Proposed price |
| 3 | One-time 4,000 spendable Arcade XP debit | Proposed price |

The second and third prices are a recommendation for increasing costs, not already-approved numeric requirements. Keep prices in one authoritative configuration, returned by the API and rendered by the client.

Purchased space remains owned after deletion. Replacing its pet should not repurchase the space. Replacement adoption needs a fresh pet ID and must not repay first-adoption, first-purchase or account onboarding rewards. If replacement itself is to cost XP, define that separately; do not silently add another charge.

Enforce first-adoption eligibility in every mutation/creation path, including Telegram commands, Mini App actions and legacy/bootstrap helpers. A read-only state request must not seed an ineligible new pet. Existing adopters retain access and existing extra-space purchases remain valid regardless of the new prices. Concurrent purchases must debit once and never create a fourth occupied space.

Reuse the currently verified linked login: automatic resume works when the website link/session is valid, while an expired or missing link presents one clear reconnect path. Linking and the XP threshold are independent checks. Do not imply that linking alone grants adoption or that browser credentials automatically transfer into an unrelated Telegram browser session.

## Delete behavior

- Provide Delete on each owned pet card, with the pet identity and a second explicit confirmation. No deletion is performed as part of this audit.
- Verify signed owner, pet ID and roster revision at the server. Reject foreign, deleted or stale requests; a repeated successful deletion must be idempotent.
- Block deletion during an active activity, run, Contract or unresolved combat session and while earned rewards require recovery. Provide the route to finish, abandon or recover first. Check all systems; the current switch guard is not a complete deletion checklist.
- Mark the pet non-playable and free its occupied space atomically. Keep historical rows, purchase receipts, reward ledger and leaderboard history. Historical deleted pets do not count toward the three occupied spaces.
- Do not refund spent space XP or delete the shared account wallet. Move the active pointer to another owned pet, or show an empty-space adoption state if none remain. Do not silently create a replacement egg.
- Never reuse a deleted pet ID. Repeated delete/adopt cycles must not multiply account rewards, daily bonuses or slot purchase credit.

## Existing beta pets and safe migration

The source explains why old pets are hidden; it does not prove any specific player's production records are intact. Production D1 inspection is required before claiming recovery is complete.

1. Export/backup the database and inventory ownership, instances, lifecycle, purchase debits, Sanctuary records and unsettled rewards by owner and original pet ID. Record count and balance checks before writing.
2. Rehearse a versioned migration on a copy. Build permanent space entitlements from proven original ownership/purchases; preserve original timestamps, XP, stages, traits, equipment and materials.
3. Restore the old beta pets to selectable ownership without cloning them or replaying rewards. Reconcile mirrored profile data from the correct active instance, never a freshly created egg.
4. Detect automatic rollover eggs, duplicates and owners with more than three surviving candidates. Do not choose by latest timestamp or automatically delete a newly trained egg. Preserve all records and flag ambiguous cases for an explicit recovery decision; normal adoption remains capped at three.
5. Preserve proven existing space purchases at their original price. Do not charge again or merge distinct pets into one slot silently.
6. Reconcile saved rewards and historical completion evidence before switching validators. Historical awarded receipts must stay idempotent after a competition rollover or deletion.
7. Apply the ownership migration and compatible Worker change together under an explicit deployment plan. Keep a rollback path that does not re-enable quarterly replacement on recovered accounts.

No annual reset, first-archive date or beta carryover expiry is part of the new model.

## Implementation sequence and affected surfaces

| Step | Deliverable | Primary files/systems |
| --- | --- | --- |
| 1 | Permanent owner/space mapping, safe migration, restored roster, remove automatic replacement | New D1 migration; `schema.sql`; `worker.js` starter/prepare/roster/switch/purchase functions; `pets/sanctuary.js` callers |
| 2 | Lifetime progression and unbounded recurring week identity; preserve competition resets | `pets/season-completion.js`; `pets/content/evolutions.json`; `pets/species-lifecycle.js`; weekly journey schema/queries and reward authorization |
| 3 | 1,000-XP eligibility, configured extra-space pricing, verified login acceptance checks | Adoption/creation paths, Arcade wallet writes, signed auth, `js/moonpet-mini-app.js` |
| 4 | Confirmed owner deletion, safe replacement, pending-work/reward protections | API action handler, atomic roster mutation, pet cards and confirmation UI |
| 5 | Runtime-backed copy and full deployment rehearsal | In-app Guide/Profile, public how-to/wiki/leaderboard, source-of-truth docs, generated publishing indexes, regression and browser suites |

Audit each reward/action validator that currently conflates a pet's original season with the current competition season. Preserve auth, debit atomicity, reward receipts, caps and source-pet attribution. Do not remove season predicates by broad search-and-replace.

## Acceptance tests before release

- September 30 → October 1, December 31 → January 1 and leap-year boundaries leave pet IDs, roster, active pet, XP, stages and purchases unchanged. No new egg is created by the date change.
- Weekly/daily/seasonal competitions and caps reset as intended while lifetime progress continues across their boundaries.
- Seven-day egg and subsequent three-week stage transition agree across hatch, evolution, art and UI. Progression fixtures exercise all six forms and final mastery without auto-Sanctuary movement.
- Late joiners and users returning after months keep every earned milestone and can still qualify; week 14, week 53 and later years remain valid.
- At 999 lifetime Arcade XP first adoption fails without writes; at 1,000 it is eligible. Spent Arcade XP, Community XP and client-supplied numbers cannot bypass the gate. Existing adopters are grandfathered.
- Website-linked and Telegram-signed sessions resolve to the same verified owner and restore the correct pets; invalid, expired and foreign credentials fail safely.
- Concurrent extra-space purchases debit once, preserve entitlements, enforce increasing configured costs and cannot create a fourth occupied pet.
- Delete covers active/non-active/last pet, stale/foreign requests, double clicks, multiple devices, pending settlements and every active-session type. Replacement IDs and reward keys are fresh and account rewards cannot be farmed.
- Migration preserves proven beta pets, identity seeds, timestamps, progression, balances, purchase and reward history. Rerun is idempotent; ambiguous recovery never silently discards a pet.
- Existing Contracts, relic snapshots, Moon Runs, daily runs, bosses, Arena, Kaiju and cosmetics continue to work; no retired Practice implementation is reintroduced.
- Run the appropriate Worker, public-surface, migration, simulation and browser suites plus publishing regeneration/parity checks. Production recovery requires its own recorded data evidence.

## Decisions and limits

The product direction is settled: permanent pets, three spaces, six forms, no expiry, current activities retained. Exact extra-space prices, later-stage progression thresholds and replacement charges are proposals requiring balancing; do not describe them as live settings. The ninth identity is outside this fix until its identity/art is supplied; retain the eight currently supported identities.

This audit and plan do not alter runtime code, execute a migration, restore a production account, delete a pet, merge a PR or deploy a Worker.
