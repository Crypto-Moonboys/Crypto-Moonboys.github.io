# GitHub Issues Wiring Audit - 2026-07-05

## Scope

Audited the current GitHub issue list for `Crypto-Moonboys/Crypto-Moonboys.github.io` after PR #929 merged, then checked the merged `main` code from a fresh branch.

## Current open issues

### #903 - Production HUD + Navigation Hub (FINAL STABLE ARCHITECTURE)

Status in GitHub: open.

Current code status: implemented in merged code.

Evidence:

- `js/site-shell.js` owns the global nav links:
  - HOME -> `/index.html`
  - WIKI -> `/search.html`
  - GAMES -> `/games/`
  - BATTLE CHAMBER -> `/community.html`
  - SWARMSY -> `/swarmsy.html`
  - SYSTEM HUB -> `/dashboard.html`
- `js/site-shell.js` validates `#global-nav` completeness at runtime.
- The recovery observer repairs missing, moved, or incomplete nav.
- `scripts/site-shell-parity-audit.mjs` checks the required nav contract and scans non-exempt public HTML pages.
- Latest local audit result: `node scripts/site-shell-parity-audit.mjs` passed with 0 failures and confirmed all 390 non-exempt public HTML pages load `/js/site-shell.js`.

Recommendation:

- No more wiring is needed for #903 based on the current static/runtime contract checks.
- The GitHub issue can be closed after live-site visual confirmation if desired.

## Recently closed issues reviewed

### #909 - Unify site UI to SWARMSY layout and remove global side panels

Status in GitHub: closed.

Current code status: no active follow-up from the issue tracker.

Evidence:

- `site-shell-parity-audit` confirms no normal shell route opts into `page-has-right-panel`.
- `shouldShowRightPanel()` returns false.
- Inline live stats remain on `/games/`, `/games/leaderboard.html`, and `/community.html`.
- Required top nav links remain present.

### #843, #833, #831, #829 - WUF/WAXCASH table and Daily Missions follow-ups

Status in GitHub: closed.

Current code status: not reopened by the issue tracker.

Recommendation:

- Do not expand this XP/manual PR into WAX Worker/API changes.
- Re-audit those separately only if a new live WUF/WAX issue is opened.

### #852 - Verified Telegram wiki comments hotfix

Status in GitHub: closed.

Current code status: not part of the active issue set.

Recommendation:

- No action in this PR.

### #558 - Hermes OG admin console overlay

Status in GitHub: closed.

Current code status: not part of the active issue set.

Recommendation:

- No action in this PR.

## XP / How To Play follow-up

The active copy gap was not an open GitHub issue, but the public onboarding pages needed alignment with the current Arcade XP system.

Updated copy now states:

- Score is leaderboard ranking only.
- Arcade XP is server-accepted progression after Telegram sync.
- Unlinked runs can stay browser-local/pending until `/gklink`.
- Local roguelite clout/previews are not final XP authority.
- Server dedupe, caps, and anti-farm checks decide final Arcade XP awards.
- Block Topia multiplayer requires Telegram-linked identity and the Arcade XP gate, currently 50 Arcade XP.

Added guard:

- `scripts/how-to-play-xp-copy.test.mjs`

This prevents public onboarding copy from drifting back into "score equals XP" or vague old XP language.
