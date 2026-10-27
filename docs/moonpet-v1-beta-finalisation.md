# MoonPet OS V1.0 — private beta finalisation, PR 1

This is an intentionally **non-public** beta. Existing MoonPet scores,
pet saves and MoonPet-only rewards can be discarded after a separately approved
fresh-start operation. That decision does not include Telegram identity,
global Arcade XP, other website progression or other games.

## Fixed gameplay scope

- One permanently owned pet per filled space; maximum three new spaces.
- Slot 1 free; delete and restart at Level 1 free.
- Slot 2 costs 500 spendable Arcade XP each purchase.
- Slot 3 costs 1,000 spendable Arcade XP each purchase.
- Adoption requires 1,000 lifetime Arcade XP without spending it.
- Six-stage, approximately 365-day progression remains. Quarterly seasons
  remain competition windows and cannot retire a pet.
- No further modes, currencies, crops, furniture ranges, breeding, fusion
  or social subsystems in the V1.0 beta finishing pass.

## PR 1 — remove dead paths, prepare safe reset

Remove the disconnected Deleted Pet History read (the panel was removed in
PR #1652). Keep authoritative deletion receipts and transactional protections.
Update the shared game guide and generated website About/How-to text to the
new paid-slot repurchase contract.

Run the read-only offline inspection command against a **local SQLite backup**:

    node scripts/moonpet-v1-beta-inventory.mjs --db /path/to/local-backup.sqlite

It reports prefixed MoonPet tables, row counts, inbound/outbound foreign keys,
triggers, possible pet references in non-MoonPet tables and excluded account/
shared-system tables. The report is NOT a safe-to-delete manifest. It always
returns ready_for_reset=false and has no apply/delete option.

### Validation

    node --test scripts/moonpet-v1-beta-inventory.test.mjs scripts/moonpet-guide.test.mjs
    node scripts/sync-moonpet-guide.mjs --check
    node --test scripts/moonpet-deletion.test.mjs scripts/moonpet-permanent-ownership.test.mjs

## Following PRs

PR 2: finish current six menus, gameplay paths, usability and performance
regressions without feature expansion.

PR 3: separately approved, backed-up, rehearsed, explicitly scoped MoonPet
beta data reset; validate FK dependencies, fresh account and all slot purchase/
deletion rules, production Worker/Pages provenance, signed Telegram clients and
controlled private beta release.

Do not clear global Arcade XP wallets, Telegram user/login tables, other
gameplay records, or shared economy/leaderboards without a distinct approval.
Do not alter old migrations or remove legacy authority without a verified
replacement. No deployment, database deletion or merge is authorised by PR 1.
Existing MoonPet production-health issue #1648 remains a release blocker.
