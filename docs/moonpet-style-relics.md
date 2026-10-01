# Equipped styles and relic routes

This document covers the surviving Style Lab and Contract relic effects from
PR #1380. Practice is retired by PR #1408. The faction-read fix is unchanged.

## Style Lab

Existing account unlocks now have per-pet equip/remove controls, with no charge.
The Worker checks active-pet and unlock ownership at the write, not just the UI.
Purchases stay in the existing shop path; an owned style needs no repurchase.

| Style | Visible effect |
| --- | --- |
| Profile Frame | Cyan/purple canvas frame |
| Victory Pose | Existing bot victory pose while idle; action and sleep poses take priority |
| Run Trail | Pixel trail behind the bot on Explore; stationary with reduced motion |

Cosmetics grant no stats or XP. Selection persists across refreshes/devices and
is isolated per pet. An unavailable style read disables switching until refresh.

## Relics

All ten owned relics now have explicit route adaptations in **new Contract runs**. Their effects do not apply to Standard Moon Run or Daily Run.
Those modes retain their separate rules. Old saved Contracts retain their old
rules; acquiring a new relic affects the next run, not an in-progress snapshot.
Relic reads must succeed before creating a run. IDs use canonical rules; stored
`effects_json` is not trusted as a source of arbitrary bonuses.

| Relic | Route effect |
| --- | --- |
| Bitcoin Heart | +10 starting route HP |
| Moon Battery | +8 starting route HP |
| Infinite Spray Can | +15 percentage points on graffiti-room choices |
| Hacker Lens | Hidden non-boss route: 95% clear, 12 salvage, 8 failure damage |
| Neon Boots | Supply rest heals one extra route HP |
| Golden Sticker | Successful search has a 3% chance of 30 extra route salvage |
| Ghost Tag | Converts the first non-boss failed encounter to a clear per run |
| Cyber Collar | +10 percentage points on bold/combat routes |
| Chain Shield | 10% less failure damage, resulting damage rounded up |
| Lucky Coin | +10 percentage points on non-boss searches |

Normal modified route chances cap at 98%; Ghost Tag's one-use protection is
explained separately. Previews and resolution share the same choice calculation.
Route HP, salvage and supplies never credit pet vital stats, gold or inventory.

## Deployment and validation

Migration 079 creates per-pet style loadouts and preserves existing player unlocks.
Its filename is retained for migration-ledger compatibility. It does not create
retired game tables. Existing production tables and reward history are preserved.

The style and relic regression suite covers per-pet ownership, stale/foreign pets,
read failures, free equip/remove, all ten relic mechanics, contract snapshots and
idempotent style schema setup. Browser checks cover the three visible cosmetics.

## Retirement release blocker

Before merging/deploying the retirement, inspect the production D1 database for
completed Practice rewards that have no awarded receipt:

```sql
SELECT COUNT(*) AS pending_rewards
FROM telegram_pet_practice p
WHERE p.status = 'completed' AND p.reward_xp = 10 AND p.reward_settled = 0
  AND NOT EXISTS (
    SELECT 1 FROM telegram_pet_reward_claims c
    WHERE c.telegram_id = p.telegram_id AND c.pet_id = p.pet_id
      AND c.source = 'pet_practice' AND c.idempotency_key = p.run_id
      AND c.status = 'awarded'
  );
```

This is a read-only check against the existing production table. Fresh installs
have no retired table. An awarded receipt already proves payment even if the
old run's settlement marker was not updated. If unpaid rows exist, keep this PR
blocked and recover them through the currently deployed authenticated claim
path before retirement. Do not reset rewards, fabricate receipts, or restore the
retired game code. Record production evidence and account for runs completing
between the audit and deployment; a one-off zero count alone is not proof that
all obligations are settled. Production access is needed to clear this blocker.
