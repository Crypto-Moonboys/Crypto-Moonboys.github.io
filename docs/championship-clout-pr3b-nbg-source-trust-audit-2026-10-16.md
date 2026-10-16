# #1530 PR3B — NBG London source-trust boundary (audit-only merge)

**Release status: AUDIT / NO NEW SCORING AUTHORITY / NO TRUSTED NBG CLOUT / NO DEPLOYMENT OR D1 CHANGE.**

Related: #1530 Community Clout Championship, #1513 Arcade score ownership, #1539 unresolved challenge security, earlier merged Dead Run PR3A #1537, and the audited draft PR #1538.

## Verified source facts

NBG London already issues a signed Telegram-owner session at \`/nbg-london/run/start\` and independently replays recorded gameplay at \`/nbg-london/run/finish\` using \`workers/leaderboard/nbg-london-replay.js\`. The server computes game XP/time and does **not** accept a browser-declared score as its source. This protects the existing specialist leaderboard against simple client XP forgery, but **does not make a run replay-unique across sessions**.

Migration 098 stores the source run ID, owner, expiry and one finish token, without a durable per-run server-proof score and replay challenge. Migration 099 stores both \`total_xp/run_count\` for the existing gameplay ledger and independently defined \`trusted_xp/verified_run_count\`. A nonzero legacy total is **not equivalent** to source evidence for Championship Clout. The existing prize release remains locked at \`NBG_LONDON_PRIZES_RELEASED=false\`. Clout's verified source registry does not contain NBG.

The current v1 random seed is predictable and same across runs. A completed valid input sequence can be copied, its otherwise inconsequential frame timing/spray masks edited, and resubmitted under a newly signed run without creating genuinely fresh player gameplay. Signed Telegram identity and one-time finish tokens do not prevent that cross-session replay attack.

## PR3B merge contract

This intentionally limited merge adds only an audit document and Arcade CI regressions confirming the existing trust boundary. It does **not** add a v2 gameplay challenge, receipt writer, D1 migration 101, NBG Clout adapter, trusted/period XP promotion, gameplay controls, UI changes, or any new Worker flag. It does not overwrite or backfill player source totals, Moonpet 365/240/44, Community XP, Arcade XP, Dead Run or faction economies.

**PR #1538 history cleanup:** The previous 83-commit experimental patch stack was snapshotted at Git branch \`backup/issue-1538-pre-cleanup-20261016\` before replacing the review branch with one new main-based commit. That experimental branch contains proposed migration 101, replay fingerprints, a seed-based v2 game and a 32-direction-checkpoint experiment. **None of its v2 implementation or proposed migration is part of this audit merge.** Its known P1 vulnerabilities are retained as evidence for #1539, not hidden or treated as fixed.

## Security blocker — #1539 stays OPEN

Codex reproduced successful replays accepted across different challenge seeds even after the v2 movement-seed and 32 direction-gate experiments. A gate sampled after seed-dependent physics may read different input frames in two sessions. Public challenge metadata alone is not human-input attestation. **Do not revive either v2 design simply because a static test or CI turns green.**

A later independent PR must prove a physically playable challenge where replay A **cannot** be reused under B by trivial prefix, direction, frame splitting or physics-timing tricks; separately validate real signed browser sessions, account switches, source owner, UTC finish day, legacy cached clients and mobile keyboard/touch starts. Require source proof and atomic immutable per-run evidence before adding NBG as a Clout Skill/Variety source. Human review and explicit GK approval remain necessary for changes to ranked gameplay, prize eligibility and any release unlock. Newly scripted gameplay can still be automated: don't advertise human proof without substantiation.

## Test / operations checklist

- \`node scripts/nbg-london-replay.test.mjs\` — existing real physics verification, tampered client XP and finish constraints.
- \`node scripts/nbg-london-records.test.mjs\` — existing signed identity/run/period/prize restrictions.
- \`node scripts/nbg-london-client-auth.test.mjs\` — unchanged linked-account start/finish ownership.
- \`node --test scripts/nbg-london-source-trust-gate.test.mjs\` — migration 098/099 proof distinction; baseline source and Clout firewall.
- \`npm run ci:arcade\` and all other required latest-head checks must pass.

**GitHub merge is code-only.** No D1 migration should be applied, no Worker/Pages deployed, no runtime scoring toggles changed, and no NBG prizes/Clout activated by this audited PR. Master #1530 and challenge blocker #1539 remain open. PR4/PR5 are not delivered.
