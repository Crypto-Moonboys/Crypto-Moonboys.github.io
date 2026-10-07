# Moonpet player guidance audit — 7 October 2026

## Audited baseline and branches

GitHub main and the local fetched main both resolved to `bcd71915d464df3195464cd5a330e1ae7db16819` (PR #1453). No AGENTS.md was present in the workspace. Existing audit documents were context only; current client and Worker behavior determined the player copy.

- Backup: `backup/moonpet-guidance-20261007`, at that unchanged main commit.
- Implementation: `sandbox/moonpet-guidance-20261007`, based on the same commit.

## Surfaces and links

| Surface | Audit result / change |
| --- | --- |
| `/how-to-play-crypto-moonboy-pets.html` | Replaced command-oriented and accumulated implementation notes with ordered current-build instructions. Kept hero, approved art gallery, site shell and live mission hook. Added topic anchors and About link. |
| `/wiki/crypto-moonboy-pets.html` | Website About, entry, incubation, ownership and controls use the shared copy. Kept article shell, approved art, Play And Track cards and Related Wiki Paths. Removed obsolete startup commands and development promises. |
| In-game Profile help / unauthenticated entry | Updated How to Play and added About in the existing utility dialog. Topics expand independently, with keyboard navigation, close/focus return and scroll reset. Both are readable before signing in. |
| In-game guide → website / About → website / guide ↔ About | Existing complete-guide action retained; About links to the wiki overview. All destinations remain public read-only routes. |
| `/crypto-moonboy-pets-leaderboard.html` | Corrected seasonal score provenance to the earning competition quarter, including retained pets. Kept the factual historical-score reconciliation limitation while removing the obsolete beta label. |
| `/games/telegram/index.html` and Worker `MOONPET_MINI_APP_URL` | Versioned game launch updated to `20261007-guidance-v1`. |
| `/games/index.html`, `/community.html`, `js/crypto-moonboy-pets.js`, wiki search/index and relationship graphs | Existing Moonpet entry/guide/wiki/leaderboard links and live summary hooks inspected; targets remain valid. No gameplay instructions needed changing in those links. Unrelated game/beta copy is outside scope. |

`js/moonpet-guide.js` is the common source for website and in-game How to Play/About. `node scripts/sync-moonpet-guide.mjs` pre-renders public HTML for indexing and JavaScript-free reading; `--check` detects copy drift. Both the wiki and Worker CI domains run the numerical/copy contracts; visual CI runs the new help browser test. The wiki content inventory was regenerated; the rewrite-audit report was unchanged.

## Authoritative rule checks

| Rule | Current implementation |
| --- | --- |
| First pet | `pets/entry-requirement.js`: 1,000 **lifetime** Arcade XP; no debit; existing owners retain access. Adoption initializes the egg. |
| Incubation / hatch | `pets/species-lifecycle.js`: four silent care choices, +2 signal, target 12, at least three types, eight accepted actions per pet/UTC day; hatch after seven full incubation days with engagement or fourteen days without it. HATCH BOT is still an explicit action. Accepted incubation care can grant one daily Mark. |
| Identity / progression | `pets/content/evolutions.json`, `moonpet-identity.js`, `season-completion.js`: ordered Stages 0–5, identity name at Stage 3, minimum ages 7/28/84/182/365 days plus exact level, Mark, Crest, Alley King, relic and consumed-material gates. Legendary requires final evolution, 240 distinct-day Marks and 44 distinct-week Crests. |
| Spaces / deletion | Worker slot helpers and `pets/deletion.js`: new-purchase limit three across seasons; extra spaces cost 500/1,000 spendable Arcade XP; historical excess rosters retained. Confirmed deletion archives the old pet and starts a fresh egg in its owned space, with account assets/history preserved and pending-work blockers enforced. |
| Care | Worker `PET_ACTIONS` and `PET_SPECIAL_ACTION_POLICIES`: all published base stat/reward deltas checked; normal per-action cooldown 45 seconds; Train requires 18 energy. Care Energy Drink 28 energy, 600 seconds, 3/day; Dance 18 happiness and Cuddles 8 happiness, 300 seconds, 5/day each. Those three are stat-only. Bag Energy Drink is separately consumed for 22 energy and up to 6 Pet XP. |
| Missions / Journey | Daily seven-mission checklist and explicit 7/7 claim are separate from Daily Journey's any-three-of-five threshold. Weekly Journey needs all five (5 care, 3 training, 3 run finishes, 1 weekly boss attempt, 2 caches). Mark/Crest credit remains source-pet scoped. |
| Work / exploration | Instant jobs have no energy debit and a 45-second account job cooldown. Background claims: five-minute minimum, training two-hour cap, other activities eight-hour cap, active expiry cap +24 hours. Adventure entry gates 18/26/34 energy and 30-minute cooldown are distinct from outcome cost. Districts cost 10; raids cost 12/18; expeditions cost 12/18/24. |
| Combat / runs | Arena hatch + level 10, no energy debit but condition matters. Kaiju hatch gate, result energy 6/5/4 win/draw/loss even after reward tapering. Weekly Boss hatch + level 5, 12 energy, one account attack/day plus the bounded per-pet participation route. Daily Run, Contracts and Finale use separate route/battle resources without pet energy debit. Standard run choices apply their displayed outcome costs. |
| Persistence / periods / recovery | `ownership-period.js`, lifetime progression, leaderboard and settlement helpers: pets, purchased spaces and lifetime development persist. Daily/weekly/quarterly competition and account caps are separate. Saved activities, decisions, run endings and rewards retain their original authority and accounting rules. |
| Radio / Inspire | Client radio and Dance controller: connection-aware ~3.6-second accepted pose, automatic stop, manual Radio override, error fallback and independent Audio/generated score controls. Inspire sends legacy `care_type: 'music'` for +2 silent incubation/rhythm-affinity signal; it never requests Radio. |

## Implementation differences that must remain visible

1. **Hatch presentation versus formal evolution:** `botArtEvolutionStage()` clamps a hatched pet's display to at least Stage-1 WTFBOI, but hatching does not insert the formal `street_moonpet` evolution. PROFILE may still show Stage 0 until its gates are met and Evolve is confirmed. The guide explains this instead of implying hatching awards Stage 1 or reveals the canonical name.
2. **Journey week versus competition week:** new pets use adoption-date UTC seven-day Journey windows; retained pets can preserve the legacy-quarter clock. Competition weeks and the Weekly Boss reset on Monday. The guide directs players to the pet's displayed Journey boundary rather than inventing a common reset.
3. **Historical scores:** unreconciled retained XP/reward history can make an old weekly score exceed retained all-time XP. The leaderboard continues to disclose that limitation. No score repair or data reset is included.

No requirement for an automatic pet reset, replacement or retirement conflicts with current main: those automatic behaviors are absent. Planned Breeding, Lineage, Fusion, Sanctuary and Prestige upgrades are excluded from all changed player guidance.

## Validation and review gate

Validation results are also recorded in the PR. Browser checks use the real client, local static serving, SQLite-backed Worker fixtures and local/native audio fixtures; they do not mutate production accounts. Screenshots are saved locally under `output/moonpet-guide/` at 360, 390 and 1280 pixels. Signed-in game flows cover 360×640 and 390×844.

| Check | Result |
| --- | --- |
| Shared guidance contracts | All seven tests pass: website/game parity, entry/slots/incubation, every evolution gate, care effects/limits, objectives/caps/tier rewards, activity/combat values and excluded promises. |
| Generated content and syntax | Shared-copy `--check`, wiki content-state `--check`, JavaScript syntax checks and `git diff --check` pass. |
| Website and in-game help browser | Pass at 360, 390 and 1280 pixels: sections, anchors, modal cross-navigation, scrolling, keyboard topics, focus trap/return, no overflow or JavaScript errors, and no player-state requests from signed-out help. |
| Signed-in Mini App browser | Both mobile sizes pass the real SQLite-backed player loop, including guide/About navigation, care, seven-mission claims, objectives, saved rewards, Contracts, raids, Finale, spaces and deletion. |
| Native radio / public surfaces | Dance/radio browser checks and public Moonpet synchronization pass; Community XP chart checks also pass. |
| Worker API CI | Every configured command passed across the initial run and resumed checks. The first run stopped at a missing preinstalled `smol-toml`; installing the already-declared 1.9.0 dependency into a temporary directory allowed readiness and all remaining checks to pass. No dependency manifest/lockfile changed. |
| Wiki CI | Protected-prose approval gate blocks the full runner; all 35 other configured commands pass when run individually. |
| Broader visual CI | Moonpet/browser checks pass. The unrelated avatar browser cannot launch because the workspace lacks Playwright's managed `chromium_headless_shell-1217` binary; its asset checks pass. Remaining static visual checks pass with the shell-artifact qualification below. |

The shell parity audit initially counted the pre-existing ignored `public-site/wiki/components/header.html` build partial as a public page. With that generated directory temporarily moved outside the scan, the unchanged shell audit passes with zero warnings/failures. The directory was restored; no shell/audit workaround is part of this PR. This is an artifact-scanning limitation, not a changed Moonpet page failure.

The repository marks this wiki article as protected prose. `scripts/audit-manual-content-preservation.mjs:435` states: “A maintainer must apply the canon-prose-change-approved PR label; automated/default writes remain rejected.” Accordingly, `npm run ci:wiki` is blocked at that governance gate until maintainer review applies the label. No approval environment variable or self-applied approval label was used. Remaining wiki checks were run individually and passed.

Production deployment provenance and a real Telegram session were not revalidated remotely; this is a current-main implementation audit with browser/Worker fixtures. No merge, deployment, production reward claim or database change was performed.

## Exact deployment requirements after review and merge

1. A maintainer reviews the protected wiki prose, applies `canon-prose-change-approved`, and reruns the wiki checks. Merge only through the normal reviewed process.
2. The main-branch `.github/workflows/pages.yml` pipeline publishes the website. Its `prepare-pages-artifact.mjs` includes root HTML, `wiki/`, `games/`, `js/` and `css/`: publish the changed pages, `js/moonpet-guide.js`, the Mini App runtime and CSS together. The CSS, guide JS, client JS, Telegram launcher and Worker launch URL all use `20261007-guidance-v1`. Do not publish a new HTML shell without its guide module.
3. Redeploy **only `moonboys-api`** from the clean merged main checkout using the approved provenance wrapper:

   ```sh
   git fetch origin main
   git switch main
   git pull --ff-only origin main
   node scripts/deploy-worker-with-provenance.mjs moonboys-api
   ```

   This picks up the updated Telegram game URL. The existing `workers/moonboys-api/wrangler.toml` uses `deployment-entry.js`; keep its existing bindings, secrets and `PET_MINI_APP_ENABLED=true`. **No new D1 migration, database reset, new secret, feature-flag change, bot-menu reconfiguration, leaderboard Worker or anti-cheat Worker deployment is required.** This PR does not remedy any pre-existing deployment/schema mismatch.
4. After publishing, verify the two public pages and leaderboard, the new JS/CSS URLs, and both help dialogs in Telegram. Confirm `/deployment-info` reports the intended merged commit, then record release evidence through the existing production provenance workflow described in `docs/worker-deployment-provenance.md`. Reopen the versioned game link to avoid a retained WebView document; normal cache propagation may still take time.
