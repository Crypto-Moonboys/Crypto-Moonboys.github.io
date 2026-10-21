# My Moonboy PR 1 — MoonPet Saved Status claim parity

**Parent:** #1576. **Scope:** signed read-only projection and checklist of five previously Saved Status-only claim classes. **No economy, reward settlement, migration, or source-game write changes.**

## Implementation and truth limits

| Saved Status class | New source key | Signed Action Plan truth | Claim badge? |
| --- | --- | --- | --- |
| Daily Cache | `moonpet.daily-cache` | An accepted `daily_chest` event proves the cache was opened. No event is **not** evidence that today's cache is eligible. | No readiness badge |
| Season-tier reward | `moonpet.season-tier-claims` | Account season XP, tier acknowledgement, source-specific pending/awarded receipt, current/historical season and owned pet roster are read together. Unlocked, unclaimed tiers can be claim-ready only when evidence is complete. | Yes, when fully proven |
| Finale reward | `moonpet.finale-claim` | Won + defeated saved Finale, original pet and retained season slot, and unique payout receipt. Pending or inconsistent acknowledgement is blocked. | Yes, when fully proven |
| Extra daily bounty | `moonpet.extra-bounty-claims` | Accepted event counts for the rotating bonus board are **advisory progress only**. The source economy board still owns exact claim eligibility, payout identity and pending recovery. | No |
| Weekly bounty block | `moonpet.weekly-bounty-claims` | Accepted event counts for the rotating ISO-week board are **advisory progress only**. Seasonal boss-attempt source proof and settlement are not reconstructed. | No |

This is **not** a claim that all five have exact payout parity. The last three remain explicit source limitations until the original source can expose reliable, signed eligibility and receipt keys. Do not promote their preview rows into claim-ready states.

## Read/identity guarantees

- The existing `POST /player/action-plan` verifies the website session before the projection; client-supplied owner/pet selectors are rejected. All added queries bind the verified owner.
- Only SELECT statements are issued through the existing read-only D1 facade, with shared query count and deadline. No claim/award action is invoked.
- Finale tasks use opaque original-pet refs; no Telegram ID, raw pet ID, reward claim key or authentication proof is returned.
- Missing or failed source reads must not be interpreted as zero/claimed. Source failure is reconciled to `sync_unavailable` by the existing action-plan normalizer.
- Historical season-tier claims are bounded; a full page of season/acknowledgement/receipt rows blocks readiness rather than treating unseen payouts as absent.
- All five keys are registered in the runtime registry, reviewed design inventory, parity map and private checklist. The checklist retains three **readiness limitations** rather than five false missing-source rows.

## Test/QA requirements

- `node --test scripts/player-action-plan-saved-claims.test.mjs` — owner binding, claimed cache event, tier/finale ready and paid, pending/disputed settlement, original-pet mismatch, no-pet case, bonus/weekly preview-only and source failures.
- `node --test scripts/player-action-plan-api.test.mjs` — signed API, schema SQL compilation, query budget, private response, 33/33 registered source keys.
- `node --test scripts/player-action-sync-parity.test.mjs` and `node scripts/my-moonboy-mission-guide.test.mjs` — checklist/parity and no fake claim badges.
- Normal CI Worker/API, Wiki, Arcade, WAX and Visual jobs; verify signed 0/1/3-pet and historical seasons against real MoonPet Saved Status before GK approval.

## Release / approval

**Worker deployment required:** Yes, the signed API has new read-only source adapters. **D1 migration:** No. **Pages:** Yes, the private checklist and guide change. **Economy change:** No.

Do not merge/deploy until CI and review are green, the owner has approved, and any migration/Worker provenance assumptions have been checked. Record production signed parity evidence and rollback route. The separate master progression issue remains open for resource balances, Wiki/faction receipts, full specialist progression and final cross-page verification.
