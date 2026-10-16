# #1530 PR3B — NBG London replay-unique receipts and Clout source (code-only beta)

**STATUS: DRAFT. No migration 101 applied, no Worker/Pages deployment, no feature activation, no prizes.**

Base: merged PR3A #1537 on main (089b2c950ca6d548cc567e87527458c08bbb5f2a). Coordination: #1530 cross-ecosystem Clout and #1513 Arcade scoring ownership. Preserve Moonpet 365/240/44, original NBG specialist boards and all spendable XP balances.

## 1. Audited NBG authority before PR3B

- workers/leaderboard/deployment-entry.js already invokes verifyNbgLondonReplay for signed NBG start and finish. The simulator independently determines game XP and ignores browser-declared score, coins and finish time.
- Existing migration 098 tracks server run ID, owner, start/expiry, finished timestamp and one finish token; it lacks durable per-run verified XP/replay fingerprint. Migration 099 period totals contain total_xp/run_count and separate trusted_xp/verified_run_count, but original NBG finish only writes the first pair.
- Same constant random seed is used for every run by browser and Worker. This creates a cross-session replay reuse threat even though a single server-issued session ID is already one-time.
- NBG spendable Arcade prize code is deliberately locked OFF by the literal NBG_LONDON_PRIZES_RELEASED = false and stays untouched.

## 2. Migration 101 (additive, NOT yet applied)

Migration file: workers/moonboys-api/migrations/101_nbg_london_verified_run_receipts.sql.

- Add a UNIQUE composite source (run_id,telegram_id) index, then a new nbg_london_verified_runs table with composite parent FK, original UTC finish day and timestamp, server-verified game score XP and time, replay version 1, SHA-256 of decoded replay bytes, SHA-256 of a server-physics-canonical action stream (net horizontal velocity change, final facing, actual jumps and spray triggers), ignoring timing and inert spray/jump presses or cancelling speed-capped direction inputs, and server_replay authority label.
- A UNIQUE raw hash prevents submitting the same encoded gameplay under a different run ID or account. UNIQUE effective-action hash rejects timing-only edits and ineffective button changes, including redundant spray taps, exhausted jumps and opposite-direction presses that have no net motion at the speed cap. Trusted fingerprinting also **drops simulator-inert zero-duration frames** (including the normal browser startup tick) while rejecting non-inert zero-duration frames inserted after startup, and ignores a leading run of physically no-op initial facing states even when a copied replay inserts positive-time 0.1 ms idle frames. Non-inert actions remain fingerprinted. A padded copy has a different raw hash but **the same canonical action hash**; the unchanged original game physics continue accepting ordinary gameplay. Both constraints are enforced inside the same D1 transaction as the source run claim and competition writes. No full replay or GPS coordinates are retained.
- No existing score/account/wallet rows are deleted, rewritten or backfilled. The canonical schema is mirrored. The required D1 migration verification contract, synthetic CI fixture, production manifest required list and request list include 101. Production applied/verified evidence remains explicitly PENDING.
- Applying 101 requires a separate GK-approved backup, remote preflight and migration operation. This PR has NOT applied D1 migrations.

**Limit of this security:** hashes stop exact and timing-edited duplicates but cannot prove a human played or stop a new automated script that changes control inputs. A further run-specific seeded challenge or equivalent verifier extension belongs under #1513 before enabling incentives. Do not advertise this as complete anti-bot or verified cash-prize authority.

## 3. Trusted source proof path: double disabled

Only when BOTH code release constant NBG_VERIFIED_RUN_RECEIPTS_RELEASED and Wrangler NBG_VERIFIED_RUN_RECEIPTS_ENABLED are true, plus the trusted server physics replay passes, the source handles a verified run:

- Compute two SHA-256 digests: decoded raw bytes and the **server-applied effective action stream**, with actual net movement/facing and executed jump/spray transitions rather than the raw controller bitmask. Neither digest is browser-supplied. Reject a repeated raw replay or effective action digest with HTTP 409. Trusted mode fails closed if the real physics verifier does not supply the effective-action trace. A race is still blocked by the D1 UNIQUE constraints.
- Atomically commit finished original run token, newly immutable receipt, original all-time best and all three NBG period rows. New verified entries increase trusted_xp and verified_run_count in exactly the same batch/amount as their legacy total_xp and run_count. Historical practice totals are never promoted.
- If migration 101 is missing with feature flag ON, the new path fails closed before scoring; with feature OFF the old game continues normally without querying the missing table. Failed secondary period writes must roll back the finished run and new proof.
- The old NBG public specialist board, normal replay physics and Telegram auth contract are not rewritten. No payouts, spendable Arcade XP, Community XP, Pet XP, Moon Gold or prizes are created.

The checked-in code release constant and Wrangler flag are BOTH set to false. Changing a Cloudflare variable alone cannot activate the source writer.

## 4. Hard-off non-spendable Championship adapter

The shared championship/clout-pilot.js adds an nbg_london source adapter:

- Only select from immutable migration 101 proof rows bound to original run owner, server finish token and timestamp, replay verifier version and authority. Legacy best/practice scoreboard rows NEVER become trusted Clout.
- Select one highest verified NBG game XP run per player/current earned UTC day. Compute normalized Skill rating as floor(100 * xp/(xp + 20000)), with game XP a bounded independently simulated GAME metric, **not** a spendable XP credit. Count one distinct nbg-london Variety title (5) regardless of repeated runs. Existing Clout daily Skill <= 40, Variety <= 15, total <= 100 remain intact.
- Source key is server-issued run_id and verification_kind=server_replay; D1 composite FK protects source ownership/day. Both effects and daily snapshot recalculate in one D1 batch.
- An optional post-finish background callback comes from the authenticated, signed Leaderboard Worker, reads the actual persisted verified finish again, and uses Cloudflare waitUntil instead of delaying gameplay. Fifteen-minute after-midnight grace can use the prior saved earned day while verification/recording timestamps remain actual later execution time.
- Default Wrangler settings in leaderboard: NBG_VERIFIED_RUN_RECEIPTS_ENABLED=false, CHAMPIONSHIP_CLOUT_PILOT_ENABLED=false, CHAMPIONSHIP_CLOUT_NBG_ENABLED=false. No start date is supplied. NBG source CODE release constant=false. Current moonboys-api's separate Clout/Dead Run switches remain untouched/off.

The new NBG verified-receipt fixture is anchored to a **future UTC noon**, not `Date.now()+48h` preserving the runner's current hour: two accepted runs must aggregate in one daily period regardless of CI start time. A separate explicit 23:57→00:01 UTC regression verifies that trusted game XP splits correctly into two daily period rows. Neither test changes a production UTC time boundary.

## #1539 challenge-bound replay v2 (review-only implementation)

The existing PR3B branch now contains a **hard-disabled** v2 pre-play handshake and saved game seed. In trusted mode only, authenticated `/nbg-london/run/start` generates a fresh cryptographic 32-bit challenge seed, stores `challenge_seed` and `challenge_version=2` on the original owner-linked D1 run row, and returns the challenge before browser gameplay begins. The browser's pre-start callback awaits the signed session, checks identity/generation after asynchronous calls, then sets the saved challenge seed **before the first ranked simulation tick**. v2 startup initializes the animation clock without executing an active zero-duration frame, preserving held S/X/Spray, Jump, Left and touch inputs for the first positive-time tick. Guest/legacy v1 practice is not delayed or changed while the source-code flag is false.

Browser and Worker both use the saved challenge seed for gameplay reward/hazard RNG and a seed-dependent horizontal acceleration factor, so the challenge changes the independently simulated game world and movement, rather than being a replay header or claimed client score. The Worker loads the seed from D1 and refuses v2 verification without it; migration 101 has been updated **before any application** to reserve the seed/version and accept only v2 for the immutable trusted receipt. Historical v1 source finishes never create new Championship Clout. New challenge-specific regressions are in Arcade CI.

**Security qualification:** a public seeded physics challenge prevents straightforward reuse of an old completed input stream but is not cryptographic proof of human input. Some materially modified scripts could still finish a new challenge, and a sufficiently insensitive challenge variant might permit a replay copy. Before any release lock changes, require independently demonstrated cross-challenge rejection across many saved successful v2 runs, a real browser signed challenge-to-finish canary, and #1513 human review. The v2 code remains **unreleased and unverified in production**; do not claim this security issue is fully closed on static tests alone.

### P1 remediation candidate: actual per-run movement checkpoints (NOT released)

Codex found a v2 seed-modulo collision: a completed seed `12345` replay, modified by a 0.1ms Spray prefix, also finished under seed `12382` (same acceleration variant) while independently computed rewards differed. **Acceleration/RNG changes and normalized replay hashes are not sufficient** to guarantee the old stream is invalid.

The draft now adds 32 mandatory **actual in-game LEFT/RIGHT direction checkpoints** along the 22,000px NBG course (first at world X=1,900; step 600px; last at X=20,500). Every one of the 32 saved D1 seed bits maps to exactly one required direction; at the player's **first physics crossing** of that world X, the browser records the real active control mask and the Worker **independently requires** exactly LEFT (1) or RIGHT (2), never both. A missed checkpoint fails trusted replay verification even if the player finishes with high XP; the browser HUD shows the next direction and distance and warns of missed tags. No extra XP or spendable credit is awarded by tags, and v1 legacy physics/HUD is unchanged. The real seed is persisted before simulation and never trusted from client replay JSON.

Proposed **unapplied** migration 101 additionally creates a partial UNIQUE index on `challenge_seed` for v2 sessions, ensuring an identical 32-bit direction pattern is not issued for another account/run. A random seed collision fails at signed start rather than minting a reused trust proof. Tests check every required bit, the concrete 12345/12382 collision, simultaneous-direction rejection, complete 32-gate progress and a physically completed v2 replay submitted under a different saved seed.

**Limits and human acceptance:** 32 direction tags are a substantial v2 ranked gameplay trial and may be overly demanding in practice. A replay author who can script **different** controls for a new public seed may still earn an apparently valid source receipt; this is an anti-copy requirement, **not a human-play certification**. Input timing can also be shifted across gate locations by changed acceleration, so deterministic cross-seed rejection of all imaginable independently authored input streams is not mathematically established merely by the gate-sequence model. **Never claim the P1 is fully resolved until real browser playability, copied replay mutation tests, independent Codex/security review, and explicit GK challenge-gameplay approval have passed.** The entire v2 experience, Clout and prize gates remain code-locked OFF.

## 5. Test and deployment gates

Targeted tests:
- node scripts/nbg-london-replay.test.mjs — independently computed game XP + hash differentiation/malformed input.
- node scripts/nbg-london-records.test.mjs — original replay/rank/leaderboard and prize-lock behavior unaffected.
- node scripts/nbg-london-client-auth.test.mjs — signed linked account and browser result contract unchanged.
- node --test scripts/nbg-london-verified-receipts.test.mjs — migration 098/099/101 fixture, off-by-default compatibility, missing-migration failure, score/period parity, duplicate bytes and timing-edit rejection across accounts, concurrent finish, injected atomic rollback and nonblocking callback.
- node --test scripts/championship-clout-pilot.test.mjs — NBG-only proof authority, prior practice excluded, mixed ranked games and immutable UTC day/verification timestamp.
- node scripts/verify-d1-production-migrations.test.mjs — migration 101 required-list/synthetic workflow parity.
- All latest-head repository required CI domains and independent review; zero unresolved findings before any merge.

**No deployment, SQL execution, token/secret change, flag activation, player-account smoke, cron or old competition payout in this PR.**

Future release order: GK approves merge separately; independently backup D1; approve and apply migration 101; prove remote schema/foreign keys; provenance-controlled release of both affected Workers in a separately approved canary; verify signed Telegram trusted replay + cross-account duplicate + UTC rollover + no currency deltas; only then consider a narrow source-code release flag change, Clout launch boundary and player-visible UX. No original NBG prize payout without a further explicit independent approval.

## 6. Remaining roadmap

Keep master #1530 OPEN for #1513-owned independent per-run challenge/score attestation enhancements, other scored Arcade/Block Topia adapters, PR4 daily/weekly/quarterly/annual leaderboard/Hall of Fame HUD (#903), and PR5 controlled Clout activation. Old NBG 90-day Arcade season stays distinct from Championship calendar quarter, and existing GPS Dead Run restrictions do not apply to general Clout entry.
