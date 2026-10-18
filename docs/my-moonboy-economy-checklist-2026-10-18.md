# My Moonboy full mission checklist and economy guide — #1552 follow-up

**Baseline:** `main` `9b355aea381ae224b664457c9084b506e30d1434` (PR1–PR6 merged)  
**Scope:** static guide/checklist presentation, discovery links, regression tests. No Worker/API or D1 mutation, no gameplay/economy edits.

## User-facing contract

The My Moonboy page now presents two separately labelled experiences:

1. **Public economy guide:** 19 auditable resource types explain how eligible source-accepted actions can increase, spend or risk score/XP/wallet resources. All text is guidance about existing source rules, never an actual signed balance, purchase quote or proof that a reward has been paid. The guide also lists all **15** current MoonPet economy routes from `PET_ECONOMY_ROUTES`.
2. **Private complete checklist:** a read-only view of all **28** registered `ACTION_PLAN_SOURCE_REGISTRY` source categories, with each currently loaded owner's task rows, source status and progress. A tick is allowed only where `status=complete|claimed`, `source_health=live`, `evidence.kind=server_receipt`, and `evidence.verified_completion=true`. A read-only projection, client mirror, absent source, partial pagination, stale cache, or preview **cannot** tick a goal. It never writes `completed` or triggers a game claim.

Five **saved-only MoonPet claim classes** from `data/player-action-sync-claim-parity.v1.json` are explicitly included as **unknown** with a direct original-game Saved Status link: `daily_cache`, `season_tier_claims`, `finale_claim`, `extra_bounty_claim`, and `weekly_bounty_claim`. Their authenticated per-owner status has **not** been added to `POST /player/action-plan`; inventing their readiness or quietly treating no record as claimed would be worse than an explicit source fallback. The original MoonPet OS remains canonical. A later reviewed Worker adapter may bring each class into the same signed projection with source/receipt proof.

### Wiki engagement coverage — Engage, Signal, Cite and related interactions

The original API/mission system has three distinct Wiki missions on an eligible article, not one generic "Wiki XP" click:

- **Engage** — submit a meaningful comment using `/comments`. A guest/email-only comment may be accepted for moderation without earning a linked-player reward. Only a signed/linked Telegram account with source-owned completion receipt is eligible for its defined Wiki XP; repeat comments do not automatically re-pay Engage. Comment moderation/publishing and XP receipt state are distinct.
- **Signal** — like an article via `/likes` with authenticated, linked identity. Saved page likes are deduplicated; a visible Like counter does not prove personal daily mission or payout.
- **Cite** — vote on an **existing** source/citation using `/citation-votes`, not merely add a new reference or click a citation link. Source-scoped votes and daily Wiki mission receipts are separate recorded facts.
- **Comment up/down voting** — supported `POST /comments/:id/vote` action, but **not independently proven XP-earning** in the current Wiki mission contract.
- **Citation submission/editing** — editorial action; does **not** independently demonstrate the Cite mission receipt or a paid reward.
- **Reading, sharing and bookmarking** — useful participation, but no accepted per-click or per-view XP/Clout ledger is established in the audited Action Plan.

The Worker stores `wiki_mission_completions` by **page, mission_id, UTC mission window and owner**, while `POST /player/action-plan` currently reads only `COUNT(*)` for that owner/day. The page therefore shows **all six** Wiki action categories with exact action instructions, but their per-page/per-mission statuses remain **"Individual status not projected"** even when an aggregate accepted receipt count exists. An aggregate count of three cannot confirm Engage, Signal and Cite each occurred. Source-proven Wiki rewards remain distinct from Championship Clout.

The pre-existing Wiki comment information card was advertising unconditional fixed values (Comment = 10 XP, Like = 5 XP, Citation = 15 XP). That is not a reliable reflection of the Worker receipt path (its test fixture verifies a like can settle 10 XP). The PR replaces those hard-coded claims with **source-defined accepted-mission** copy, without changing payouts. Operational verification still needs the live Worker, migration 029 and a real signed session.

The same comments panel also had hard-coded illustrative "Top Contributors" accounts and XP figures substituted whenever live contributor rows were absent. The page now reports **verified contributor rankings unavailable** on an absent/empty feed instead of fabricating competitive scores. This is a display-truth fix only; no leaderboard API or score ledger is changed.

The legacy Wiki template fallback also used a hard-coded **25% Battle Heat** when comments were unavailable and a synthetic comments-count multiplier when they loaded, although it never fetched article likes or citation votes. That panel now shows only the confirmed **public comments count** (or unavailable), explicitly excluding likes and citation vote totals. It no longer labels an invented percentage as live engagement. No mission evidence, payout or Worker action was changed.

### Source categories and money/points separation

- **Arcade XP** is lifetime achievement and a separate spendable wallet. First-pet qualification requires 1,000 lifetime Arcade XP without debit; pet 2/pet 3 spend 500/1,000 spendable Arcade XP. Do not equate score, unaccepted attempts or tokens with XP.
- **Community XP** is distinct from game XP. Verified Telegram `/daily` gives 20 Community XP on its source-owned, receipt-backed UTC-day settlement.
- **Pet XP, Specialist XP, Account Season XP, Growth Marks and Weekly Crests** have separate ownership/period rules. Permanent MoonPet progress never disappears on UTC/quarter rollovers. Explicit 7/7 claim awards 25 Pet XP, 50 Moon Gold and 1 Style Token under the existing game authority.
- **Moon Gold, Moon Crystals, Style Tokens and crafting materials** have different server-owned earning/sink rules (bounties, jobs, contracts, rewards, market, gear, materials, crafting). The guide contains no balance, guaranteed drop, speculative amount or payout guarantee. A Standard Moon Run does **not** have an automatic 75 Gold entry fee; risk concerns energy and unbanked loot, and trades may be risky.
- **Block Topia XP and Gems** are game-specific, NOT Moon Crystals or Arcade lifetime XP. Block Topia XP can drain over time and pay entry/skip/gameplay costs plus a validated mini-game loss penalty. Eligible game wins have server-defined *chance*, not guarantee, of a Gem drop; upgrade spending uses Gems. Current tier/cost/chance must be read from Block Topia at time of action.
- **Faction contribution/Clout** is separate from **Championship Clout**. Championship Clout is a separately gated, non-spendable receipt-only pilot: browser progress is never proof of an award.

## Accuracy / privacy / navigation guarantees

- The new `js/my-moonboy-mission-guide.js` exposes **only immutable public rules**. No owner ID, task body, credentials, balances or pet data are stored in a global, localStorage, query parameter or public data file. The private controller passes owner tasks straight to `renderChecklist()`; logout/account switch synchronously removes checklist DOM alongside the original dashboard state.
- Every registered category renders even when zero rows have loaded. Its wording says **unknown**, not done/failed. Continuation pagination raises a warning rather than a false 100% checklist. Accepted receipt ticks are hidden when offline/stale.
- Native `details/summary` make the large source registry navigable on mobile. Open disclosures and summary keyboard focus survive background signed reads. User strings are escaped before insertion. Links open the original game; no checkbox, energy spend, reward or claim action is available in the checklist.
- Homepage, Games, Community, Telegram Incubator and general How to Play now link directly to My Moonboy, so guests see a sign-in route and linked users see their own tasks.

## CI and verification

- `node --test scripts/my-moonboy-mission-guide.test.mjs`: exact 28-source parity, five claim gaps, 15 economy loops, source marker guards, unverified status, stale privacy and discovery.
- Extended `scripts/my-moonboy-browser.test.mjs`: guest visibility with zero private requests, 360/390px layout, signed task/source coverage, and synchronous logout DOM purge.
- Registered the new unit suite in `ci-visual` and `ci-worker-api` so both frontend and Worker source drift can fail review.

**Do not claim this PR completes signed production QA.** The earlier #1552 AC-01 to AC-15 evidence remains pending; current deployed Worker SHA and remote D1 evidence require independent validation. This change needs only GitHub Pages publishing after a reviewed merge; no Worker deploy, D1 migration or VPS restart.

### Next source improvements outside this static-scope PR

- Individual receipt-backed `/player/action-plan` adapters for the five Saved Status-only claim classes, if GK wants one dashboard to show **real** per-owner readiness for them. Do this only with canonical D1 authority/accepted settlements and tests, not by loading the full mutating `/telegram-pets/app/state` from the website.
- A dedicated Block Topia owner-level read adapter for actual Gems/XP and its source-specific loss events, gated by signed session and deployed runtime proof. Until then the guide provides real rules and links, **not** balances.
