# My Moonboy PR 3 — Canonical Community XP

## Scope

Follow-up to merged PR #1592. Display the authenticated account's **Community XP** on /my-moonboy.html, without confusing it with Arcade lifetime/spendable XP, Pet XP, Championship Clout, or faction XP.

## Source contract

Community XP credits are atomically written by `workers/moonboys-api/community-xp-awards.js` to `telegram_users.xp`; legacy `telegram_xp_log` and `telegram_community_xp_awards` are audit/receipt authorities, not two balances to sum. The existing signed-owner identity SELECT now includes `xp` without adding another D1 query, and exposes a safe, nonnegative integer as `owner.community_xp` only inside the authenticated no-store `POST /player/action-plan` response.

Missing, invalid and unavailable values are `null`, displayed as **Not confirmed**, not zero. The frontend hides even previously signed Community XP on stale/offline state and wipes it on logout/account switch. No localStorage, URL, public endpoint or mutation. Existing source claims, progression and rewards unchanged.

## Tests

- Signed API fixture asserts `telegram_users.xp` authority and rejects negative totals; existing <=80 statement budget remains.
- Browser test on 390px checks signed display, offline invalidation, fresh read recovery and logout purge.
- Existing CI Worker/API, Visual, Wiki, Arcade and WAX gates still apply.

## Deployment

After green exact-head CI, reviewer sign-off and explicit GK approval:
- GitHub Pages publish for My Moonboy frontend.
- Deploy `moonboys-api` using the provenance wrapper on clean updated `main`.
- No D1 migration, Telegram bot change or VPS restart.
- Compare real signed Community XP to the Telegram account's canonical XP and inspect guest/other-user privacy before accepting release.

**Hold merge and deployment until QA and GK approval.**
