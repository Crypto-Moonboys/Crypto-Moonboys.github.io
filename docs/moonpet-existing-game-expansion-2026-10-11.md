# MoonPet existing-game expansion — H06/H14/H22/H29/H30/H31/H34/H35/H38/H41/H43

## Scope and source of truth

This main-based replacement PR implements selected H-numbered feedback in issue #1478 after #1485 was squash-merged. It replaces the obsolete stacked #1486 branch; it is not split across two pending review PRs. No interactive house, casino/lottery, mining game, clan, garden, gym, nightclub or pet-arcade runtime is added. The current permanent-pet, original-pet reward attribution, one-year evolution, account cooldown, source receipt and XP limits are unchanged. Existing daily missions and core Journeys still use their own rules.

### Content retained from merged PR #1485

- Four new gated Adventure settings and one additional risk/reward option, **Help The Crew**, use the existing server-owned Adventure outcomes, energy/currency previews, one-choice settlement and shared cooldown. No extra attempts or independent reward ledger.
- Twelve optional daily bonus challenge templates; three chosen deterministically each UTC day in a separate board. The original ten-template pool and four existing daily bounty positions do not change, so an open daily page cannot silently change its claim keys. Source events come from accepted server actions; new claims use the same `pet_bounty` authority.
- Real cooked consumables (pizza, burger and vegetables) use the same account inventory and signed `use_item` action. Three recipes use only existing materials. Each meal has different changes to hunger, energy and happiness. Bag use cannot generate another `Feed` mission event.
- Five **local-only** pet emote controls and periodic tap-to-laugh cycle. Neither buttons nor animation triggers create backend actions, XP, currency, special-care counts or Radio streams.

### Additive economy and customisation in this main-based replacement

- **Weekly Bounty Blocks:** ten additional templates; three active per UTC ISO week, independent from the pet's creation-based Weekly Journey and independent from Monday Weekly Boss settlement. Account-owned server event counts, per-week receipt keys `weekly:YYYY-W##:<bounty_key>`, and earned-currency-only claims. Expiring unclaimed weekly challenges never grant a free retroactive payout. Duplicate confirmations cannot pay twice. Historical daily bounties are unchanged.
- **Food Shop:** five additive bundle offers in a separate visible panel; fixed menu, one purchase of each offer per UTC day using existing `pet_market` purchase and inventory-capacity settlement. Original Moon Market's twelve-offer pool and four rotating offers remain identical. No external token/real-money purchases.
- **Style Lab:** four new cosmetic ownership keys and actual canvas-only visuals alongside the three working original cosmetics. Styles are non-repeatable account purchases, free per-pet equip/removal; they do not modify rarity, trait assignment, stats, original identities or gender.
- **GraffPUNKS Radio requests:** the signed Mini App form accepts 4–160 characters, one saved request per Telegram account and UTC day. Existing `telegram_pet_system_events` table (migration 074) holds `system_key='radio_request'` rows with `pet_id=''`, `action_key='submission'`, `status='completed'` and `period_key=YYYY-MM-DD`; its unique account-day key prevents races and second submissions, and a repeat confirms the first saved result. The original private-only rule is superseded: only a new submission with the explicit group-sharing checkbox selected receives a pending delivery marker and is forwarded by the Worker, which sends request text but no account or pet IDs. Group members can read that text. Unchecked submissions and requests saved before 2026-10-12 stay private and are not forwarded retroactively. Polling runs every five minutes and processes at most five pending requests per check; delivery may take longer with a backlog or transport retry. Group review does not mean the request has been read or aired. Migration **093_moonpet_radio_group_delivery_index.sql** adds only the targeted pending-queue index; apply and verify it before deploying the scheduled Worker change. No new D1 table is created for Radio requests. The expanded Style Lab does require migration **091_moonpet_style_catalog_expansion.sql** to widen the CHECK constraint on per-pet loadouts while retaining every saved row, source pet and enabled selection. It must be applied and verified **before** the seven-style Worker/Pages release.

## Radio host queue: operational retrieval

Only a trusted operator with production D1 access should inspect the private host queue using a read that omits submitter and pet IDs, such as:

```sql
SELECT created_at, period_key AS utc_day,
  json_extract(payload_json,'$.message') AS request_message
FROM telegram_pet_system_events
WHERE system_key='radio_request' AND action_key='submission' AND status='completed'
ORDER BY created_at DESC LIMIT 50;
```

Do not publish `telegram_id`, request text or associated pet IDs to the public site, dashboards, logs, or GitHub. For submissions with explicit group consent, only the configured Telegram group receives the request text; its members can read it, but no submitter or pet ID is sent. Moderate personally identifying and abusive content. Group delivery is for DJ review only and does not control playback or guarantee an on-air selection. No scraping, ChatGPT training, token payment or spam-like relaying is permitted.

## Moon Run pricing — explicit decision

**Do not automatically introduce the proposed 75 Moon Gold entry fee.** The Standard Moon Run already uses pet needs/energy, loot banking and a failure-loss risk, while the separate official Daily Run has its own account attempt and quest credit. With 12 bonus daily bounties, 10 weekly templates and expanded item sinks, imposing 75 Gold on every standard run without modelling players' earnings would risk locking casual players out of qualifying journeys. The current mandatory entry fee remains **0 Moon Gold**, subject to the game's existing energy and consumable economics. This is a deliberate no-change decision, not an unimplemented fee bug.

If GK later wants a fee, request a separate economic simulation showing three player cohorts (new/casual/heavy) over 7/30/90 days, earned and spent Gold, run losses/retries, equipment costs, mission gating, old-player balances, and second-pet ownership. Include one clearly approved target (Standard only, Daily only, or optional premium route), never apply fees to both by implication.

## Release and validation gates

- This is a replacement review on current main after #1485 was squash-merged. CI, code review, D1 migration validation and GK approval remain required; no automatic production deployment or migration is performed by a PR.
- First apply and verify migration 091 against a backed-up production D1 database from approved main. Its only schema change is rebuilding the existing style loadout table with four additional allowed cosmetic keys; preserve all pre-existing rows. Then deploy Worker from the same freshly fetched main, and release matching Pages/Telegram assets for Adventure, meals, bounties and Radio. Confirm `/deployment-info`, migration ledger, source ownership, and versioned Mini App/Play Options/Guide. No VPS restart is required.
- Exercise actual SQLite-backed reward/market style and state fixtures, duplicate click, competing clients, UTC day/week boundary, unavailable D1, old-pet switch/deletion, Stage 0 egg, inventory capacity and capped bonuses. Art/panels at 360, 390 and 1280px, reduced-motion and signed Telegram clients are required; PR CI alone is not production sign-off.
- Do not expose identifiers/message content in test reports, screenshots or GitHub comments. For the Radio queue, the end-to-end success condition is a saved private record plus host-retrieval capability—not audible playback.
