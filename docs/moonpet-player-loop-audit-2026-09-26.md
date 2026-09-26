# Moonpet player loop audit — 26 September 2026

Base: `2d9433e0378b10c6958ede018feb31cbc427cc70` on `main`.

## Conclusion

The Mini App has substantially more gameplay than care buttons, but navigation,
daily-run presentation and waiting-state options obscure it. Existing rewarded
content is mostly bounded daily activity, not unlimited quest progression.
This change fixes verified wiring/presentation defects and adds a replayable
practice roguelite with no connection to rewards. It does not declare every
live player save or Cloudflare production binding verified.

## Confirmed defects fixed

| Finding | Change |
| --- | --- |
| Egg API permits Energy Drink, Dance and Cuddles, but the egg HOME branch omits the controls | Render all three actions with the same authoritative cooldown handling as hatched pets; explicitly distinguish them from incubation signal |
| Generic `mission`/`season` matches precede district/seasonal-boss routes; trade and training lack reliable destinations | Shared ordered navigation map resolves screen and panel together |
| Seven daily missions render as text without a path to their activity | Add direct route buttons to unfinished missions |
| Daily Journey exposes only its aggregate count | Return each of five objectives with description, target and progress from pet/owner/season/day-scoped accepted evidence; render direct routes |
| Daily Run uses endless-run title, checkpoint and unbanked-reward copy | Distinguish official daily mode, correct one-based room display while preserving its zero-based request index, and explain its settlement rules |
| Daily Run remains an apparently fresh entry button after an attempt is over | Expose account/day attempt status, original pet, terminal score/depth and UTC reset; disable another attempt, fail closed if summary unavailable |
| District reward percentages floor fractional multipliers before converting to percent | Convert the raw numeric multiplier first; safe/bold previews retain their intended values |
| Long mobile panel content can enlarge the shell's implicit grid column and be clipped | Constrain the shell column with `minmax(0, 1fr)` and make the screen shrinkable; verify actual panel bounds at 360 and 390 pixels |
| Restaging unchanged EGGYONE sheets erases prior visual approval and breaks CI | Restore approval from the preceding approved manifest after verifying the intervening commit changed only metadata; preserve future approval only when PNG bytes, atlas bytes and playback/source metadata are unchanged |

## Added player choices

- Play Now on HOME, MISSIONS and EXPLORE routes players to eligible runs,
  available stories/districts/bosses, goals and bounties. It never auto-submits
  a gameplay action or pretends a navigation link is a guaranteed reward.
- Practice Roguelite is available after adoption, including eggs. Three builds
  (Scout, Bruiser, Scavenger), three local goals, twelve rooms, safe/bold/search/
  rest choices, explicit odds and stakes, six possible upgrades, drafts after
  rooms 3/6/9, and voluntary extraction provide decisions between cooldowns.
- Practice saves its current run and personal best in this browser, keyed by
  pet ID, retaining at most three saved pets. A reload resumes; switching pets
  isolates the record. Unavailable storage leaves an explicit session-only
  notice. These local records can be edited and are not competitive.
- Practice grants no XP, gold, crystals, style, items, quest credit, Growth
  Marks, Weekly Crests, achievements or leaderboard scores. It never calls a
  gameplay endpoint. Leaving and returning carries no practice penalty.

## Existing wiring and limits

| Player surface | Authority / status | Repeatability |
| --- | --- | --- |
| Adoption, incubation, reveal, care, three new care actions | Mini App dispatcher → lifecycle / care authority | Incubation and care keep their existing timers/caps; new stat-only actions are separate from Daily Journey care evidence |
| Daily missions / Daily Journey / Weekly Journey | Accepted server events; per-pet journey evidence and duplicate-safe receipts | UTC daily / qualification-week goals; not endless missions |
| Standard Moon Run | Legacy 100-room engine, authored risk choices, owned source pet and protected banking | Repeatable subject to energy and reward caps |
| Official Daily Moon Run | Persisted shared-seed room engine, challenge and boss authority | One account/day attempt; no second attempt from pet switching |
| Districts / stories | Authored decisions, mastery and protected system-event settlement | One district attempt / one step per story chain each UTC day; unchanged |
| Jobs / timed activities | Job gates, energy, specialist requirements and claim/cancel authority | Existing cooldowns and timers remain |
| Bounties / expeditions / market | Server evidence, attempt/stock limits and authoritative wallet | Bounded daily goals/offers; no local credits |
| Shop / bag / crafting / equipment / cosmetics | Item/material/wallet authority and affordability gates | Existing costs and progression gates remain |
| Weekly boss / seasonal raid | Persisted attempts and protected reward settlement | Existing level, energy and daily limits remain |
| Arena / Kaiju | Versioned capability gates plus battle/card handlers | Hatched pet; Arena also requires level 10; reward caps remain |
| Identity / evolution / seasons / slots / leaderboards / alerts | Existing pet/account ownership and server capability rules | No progression or unlock rules relaxed |
| Advanced Traits / Breeding / Lineage / Fusion / Sanctuary / Prestige | Future/locked classification | Remain unavailable; no fake playable buttons added |
| Seven-game arcade | Shared accepted-score, signed-auth, pending-sync and local preview contract | Existing competitive XP authority remains separate from local practice |

The two existing run engines are not interchangeable. Daily mode uses the
foundation's persisted rooms and seeded modifier; standard mode uses its own
authored choices and bank. Persistent relic ownership does not prove every
catalogued relic effect is active. This PR adds build drafting only to practice,
not silently to either rewarded engine.

## Verification

- Worker API domain: 65 checks passed, covering authentication, care, runs,
  reward caps, duplicate/concurrent settlement, ownership, pet switches,
  lifecycle, journeys, equipment, economy, combat and deployment readiness.
- Arcade domain: 23 checks passed, including seven-game roguelite protections,
  shared leaderboard path and signed progression rules.
- New regression: 31 literal action buttons checked against the dispatcher;
  navigation collisions, egg controls and script ordering checked; 900 seeded
  practice runs exercised all three builds, drafts, clear/failure/extraction,
  immutable input, stale turns and corrupt saved state. This is an engine
  simulation, not a retention study or an exhaustive production-user audit.
- SQLite-backed official-run summary tests cover another pet, another owner,
  open-run conflict, terminal status and UTC reset. Journey parity tests check
  the per-objective progress matches the aggregate's evidence.
- Browser test: actual Mini App JavaScript and all six screens at 390×844 and
  360×640, using local SQLite-backed Worker fixtures. Covers egg controls,
  practice save/reload/pet isolation, no practice gameplay POSTs, Daily Run
  title/room/request index, objective navigation and mobile panel bounds.
- EGGYONE promotion/refresh/local-front-fight tests exercise unchanged approval
  retention and rejection of changed bytes, playback and unapproved assets.

No production users, D1 records, deployed Workers or main-branch files were
mutated during the audit. Authenticated real-device acceptance remains a
post-deployment step.

## Rollout

Merge through a new PR after its checks pass. Publish the static frontend and
deploy `moonboys-api` from the merged current main using
`node scripts/deploy-worker-with-provenance.mjs moonboys-api`. No new migration
is added or required by this change; existing production migrations must
already be installed. The new frontend fails closed on official Daily Run
entry until the new summary is available from the Worker.

Then reopen the Telegram Mini App and verify an egg's three care actions,
an unfinished mission route, a used Daily Run and a practice run. Existing
story/day caps intentionally remain; expanding rewarded story chapters or
district contracts later needs server-scoped reservation design and economy
simulation, not removing cooldown checks.
