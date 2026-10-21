# My Moonboy PR 2 — Signed Resource Tracker

## Scope
PR 1 added signed MoonPet Saved Status claim-source adapters. PR 2 adds the first **source-authoritative owner resource ledger** to the My Moonboy tracking page.

This is strictly read-only. No currency awarding, conversion, spending, claim action, purchase, XP mutation, new D1 schema or new game mechanics are introduced.

## Verified authorities
| Display | Authoritative D1 source | Scope |
| --- | --- | --- |
| Lifetime Arcade XP | `arcade_progression_state.arcade_xp_total` | Existing account lifetime metric |
| Spendable Arcade XP | `arcade_xp_wallets.arcade_xp_spendable` | Account spendable; **never equal or inferred from lifetime** |
| Selected Pet XP | Current signed owner/selected MoonPet roster | Pet-specific; existing metric |
| Moon Gold | `telegram_pet_profiles.moon_gold` | Owner account |
| Moon Crystals | `telegram_pet_profiles.moon_crystals` | Owner account |
| Style Tokens | `telegram_pet_profiles.style_tokens` | Owner account |

The new `owner.economy` object is included only in the private `POST /player/action-plan` response after Telegram identity verification. Wallet reads are owner-bound, and the read-only D1 statement/deadline budget applies.

MoonPet profile balances are withheld unless the owner has an **awarded wallet reconciliation marker** and no pending recovery marker. Even numerically valid legacy balances are not authoritative before reconciliation; no mutating repair occurs in this read-only endpoint. After an offline event, failed refresh or other stale-plan invalidation, the UI hides all previously confirmed balances until a fresh signed read succeeds.

Null and `unavailable`/ `live_empty` are intentional: missing rows, missing table migration, invalid balances, offline states or D1 read failures are **not zero balances**. `arcade_xp_earned = arcade_xp_spendable + arcade_xp_spent` is checked before displaying a signed Arcade spendable balance. Player-owned wallet values are not stored in localStorage, URLs or analytics; the UI clears on logout/account switch.

## Deferred to subsequent focused PRs
Community XP total, faction/Wiki credit attribution, BlockTopia XP/Gems, all-time spend vs earning breakdown, token accounting outside the MoonPet profile, trend history and economic action recommendations require separate authoritative read contracts. They remain labelled not supplied rather than reconstructed from unrelated activity, client balances or unverified logs.

## Tests and rollout
Run the full existing Worker/API and Visual suites, including new signed-owner/balance/failure and responsive browser logout/unknown-balance regressions. Source type and amounts need signed-account comparison with canonical MoonPet and Arcade balances before GK release acceptance.

- D1 migration: **No**
- Worker deploy after merge: **Yes** — `node scripts/deploy-worker-with-provenance.mjs moonboys-api` on clean updated `main`
- GitHub Pages: **Yes** — My Moonboy read-only tracking UI.
- VPS restart: **No**
- Telegram bot/claims payout: **No change**

**HOLD merge until current-head CI, review and explicit GK approval.**
