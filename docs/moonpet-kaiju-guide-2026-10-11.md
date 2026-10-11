# MoonPet Kaiju newcomer guidance

Roadmap [#1478](https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/issues/1478), B2 / H32. Baseline `5acec0a44b1a6758352311f793288fc03682a737`, including merged daily mission indicators from #1479.

## Verified gap and behavior

The active Kaiju category and each card's projected active value already existed.
The panel also displayed unrelated “BEST” stats without an adjacent worked
example. The update reuses those category/card projections and the same action
buttons; it adds no new game mode.

An expandable three-step guide explains solo vs player matchmaking, the one
category that counts, irreversible card locking and the sealed rival. An
explicit Speed 9 vs Speed 7 example is reading only: it has no action button,
payout or API request. It says solo CRT is a real match and explains the existing
6/5/4 energy settlement costs and original-pet recovery.

The same helper text appears in EXPLORE, in-game How to Play and the generated
public guide. Newcomer help opens before a first match; existing panel memory
preserves the user's expanded/collapsed choice through redraws in that session.
This is not an account-wide tutorial-completion flag.

Every choice names the active category and value. All highest values in the
shown hand get a visible border and HIGHEST IN YOUR HAND text in the button's
accessible name. Equal leaders are all highlighted. Only finite numeric values
with the current category's label qualify. A missing category or mismatched
projection gets no leader marker. The label explicitly avoids promising a win;
the rival's card remains sealed. Locked cards and uncertain-response disabling
continue to use existing controls.

## Validation and release

Passed locally: 84 action-guidance tests; 15 shared-guide/mission tests;
Mini App, player-loop, public-sync and multi-bot art checks; full Worker/SQLite
browser flows at 360/390px and tab readiness at 1280px; public/in-game guide
keyboard, focus and overflow checks at 360/390/1280px. The 390px Kaiju help and
card screenshots were inspected. The retired-feature surface check passes.


The action-guidance suite covers all six categories against existing card data,
Attack ties, unchanged match/card payloads, no snapshot mutation, malformed and
missing projections, zero values, locked cards, refresh suppression, escaping,
shared help text and preserved expansion preferences. Existing browser tests
exercise the real Worker/SQLite match-start path, keyboard-only help toggling
with zero action requests, preserved collapse after match start, projected
leader agreement, outcome-cost accessibility and mobile panel overflow.

Pages frontend release only. No Worker deploy, D1 migration, economy, ownership,
reward ledger, new asset download or extra polling is required. Four frontend
asset URLs are versioned `20261011-kaiju-guide-v1`; existing launcher URLs still
load the page. Rollback is a frontend revert with no saved-data rollback.

Signed production Telegram gameplay is not verified in this batch. After release,
check EXPLORE's Kaiju help and match choices on Android/iOS/Desktop: compare the
current category, lock once, wait for resolution, and confirm result/recovery
retains its original pet. H17 radio, H25 Moon Alley and H26 jobs remain unverified
reports, not fixes delivered by this guidance batch. Roadmap #1478 remains open.
