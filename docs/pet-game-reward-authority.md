# Moonpet Reward Authority and Receipts

**Status:** Canonical security and support contract. Existing protected reward paths and seasonal slot unlocks are **LIVE**; Sanctuary, catch-up, and Fusion rewards remain **IN DEVELOPMENT** or **FUTURE** as identified in the seasonal model.

## Authority boundary

The Cloudflare Worker/server is authoritative. A client may request an eligible action and display the result, but it cannot self-award or finalize:

- Pet XP or Arcade XP;
- Moon Gold, Moon Crystals, Style Tokens, materials, inventory, or cosmetics;
- Growth Marks or Weekly Crests;
- Pet 2/Pet 3 slot unlocks;
- Sanctuary or Legendary completion status; or
- breeding/Fusion outcomes or rewards.

The server must validate identity, the participating `pet_id`, eligibility, caps, balances, season windows, and idempotency before committing an important outcome. Client state, local storage, UI flags, or repeated callbacks are never proof of a reward.

For Season 1 rewards, `pet_id` identifies the participating Moonpet and owns Pet XP/stat deltas only. Moon Gold, Moon Crystals, Style Tokens, materials, inventory, cosmetics, and spendable Arcade XP are account-owned. Until a dedicated wallet table is introduced, the `telegram_pet_profiles` compatibility row is the account wallet authority for Moon Gold, Moon Crystals, and Style Tokens; `telegram_pet_instances` wallet columns are not authoritative per-pet balances.

## D1 receipt history

Every important reward or unlock must be recorded in D1 with receipt-style history. A receipt should make the outcome auditable with a stable receipt/idempotency key, player and applicable `pet_id`, event type, season/window, amount or unlock, timestamp, status, and enough source context to explain the decision without trusting a client claim.

Retries must return or reconcile the original outcome rather than award it twice. Receipts must support these player and helper surfaces when implemented:

- a player-visible Arcade XP ledger showing earned and spent entries;
- a slot-unlock receipt for each Arcade XP unlock; and
- a limited helper/debug receipt view for diagnosing settlement or display problems.

This is receipt-based community support, not “failed purchase” administration. There is no money or crypto purchase to recover. If a player reports an issue, group/community helpers can use authoritative receipt history to identify an accepted, rejected, pending, duplicated, or already-settled game action without inventing progression.

## Deferred implementation

This documentation-only change does not modify the live slot-unlock API, Arcade XP spending route, or slot UI, and it does not implement Rested XP, Crest recovery, breeding/Fusion, or an admin dashboard. Future changes require separate reviewed PRs and must preserve this authority boundary.
