# Current MoonPet UI polish — 11 October 2026

Baseline: merged `main` at `18a0d9f009e6d7a38643407b992a0dfda3b27491` (PR #1483). Scope: the eight existing-build UI items selected by GK from issue #1478. No new-phase gameplay is included.

## Reconciliation and changes

| Note | Current behavior and this change | Verification |
| --- | --- | --- |
| H01 care/vitals | Care Console already contained actions without duplicate meters. Vital Systems remains separate and collapsible. Its inverted Hunger meter is now correctly labelled Fullness, with an accessible 0–100 value and an explanation that higher is better. | Actual Home renderer and phone-layout checks; no meters inside Care Console. |
| H18 help bar | The guide dialog already had dismissal and focus return. Its Close button was only 36px high; it now has a 44px minimum height and 64px minimum width. It remains visible when the guide content scrolls. | Browser checks open long guidance, scroll to the bottom, and close with the button, Escape and the backdrop. |
| H19 hide text | Existing disclosure headings remain the collapse controls. The new confirmed-choice response also collapses and has a Dismiss Result button; dismissal changes presentation only. | Collapse state survives menu navigation and save refresh; dismissal issues no gameplay action. |
| H22 existing adventure outcomes | Every current Adventure/Street Event branch exposes its server-provided odds, reward ranges and costs in separate labelled rows. The latest confirmed choice stays readable in that pet’s panel for this visit, including outcome copy and reported costs. | All six existing encounter families, every option/branch, plus a real SQLite-backed adventure response. |
| H23 recommended routes | Fully unaffordable Adventures and upgrades without an unlocked, affordable current quote are omitted from recommendations. A route opens its original panel and marks it SELECTED ROUTE; the marker survives redraws. Conditional-cost routes remain selectable. | Recommendation gate regressions and browser navigation/refresh without gameplay writes. |
| H28 reward/cost colour | Reward rows are green and cost/shortfall rows amber, always accompanied by explicit labels. Readable facts are part of each button’s accessible description. Locked controls keep full text opacity. | Real rendering, escaped content and accessible-description tests; phone wrapping checks. |
| H40 duplicate of H28 | Uses the same formatting work; no separate gameplay system. | Same checks as H28. |
| H44 shop unlocks | Shop cards show Unlock Level, the selected pet’s level, full price and exact resource shortfalls. Ready, locked, owned/free-switch and equipped states remain distinct. Market stock/storage, crafting capacity and current upgrade quotes remain authoritative gates. | Real renderer state cases, all 12 existing Market templates and all 17 permanent gear cards in the Worker-backed browser fixture. |

## Authority and limits

The frontend consumes existing projections and action responses. Worker code, API request bodies, authentication, receipts, prices, reward caps, outcome rolls, ownership, timers and migrations are unchanged. Rendering, opening a route, reading help and dismissing a result never submit a gameplay action.

The confirmed-choice display holds one latest response in memory, associated with its original pet. Another pet cannot inherit it. A duplicate acknowledgement shows no new gains or repeat costs. Rejected/unconfirmed responses do not create a completion display. Menu navigation and save refresh retain it; a full app reload clears this temporary presentation. Existing saved-event recovery remains the persistent authority, rather than this display becoming an additional ledger.

Fullness is only the presentation of `100 - hunger`; Feed effects and stored hunger are unchanged. Cost/reward previews still follow caps, scaling and stat limits. Missing resources are explanations derived from the current balances, not permission to spend.

## Release

GitHub Pages only. Changed CSS, Mini App, Play Options and shared guide assets use `20261011-ui-v1`. Existing bot and website launch URLs continue to load the page and its newly versioned assets. No Worker deployment, D1 migration, VPS restart or bot restart is required by this PR.

After merging, verify the intended asset tokens and these interactions in genuine Telegram Android/iOS/Desktop sessions. Local browser fixtures exercise actual Worker handlers and SQLite but are not signed-client production evidence. The user reported deploying PR #1483; this UI PR does not independently establish that production release or private migration state.

## Validation record

Local commands and final results are recorded in the PR. Browser screenshots cover phone outcome cards and all permanent Shop cards; help dismissal and touch targets are exercised at both 360×640 and 390×844. Existing all-menu status checks additionally cover 1280×900. New assertions extend the already registered visual CI suite; no browser test is left outside visual change scope.
