# Moonpet Post-Hardening Verification Checklist

Use this checklist for regression verification only. It does not change deployment policy, migration policy, or gameplay scope.

## 1) Worker deployment check

- [ ] Confirm Worker deploy status is healthy with the existing deploy readiness audit (`node scripts/worker-deploy-readiness-audit.mjs`).
- [ ] Confirm no production deployment rules were changed in this PR.

## 2) D1 migration confirmation

- [ ] Confirm the current migration chain applies cleanly in test/audit runs.
- [ ] Confirm no new production migration enforcement policy or deployment gate was introduced.

## 3) Mini App loading

- [ ] Load the Mini App and confirm the selected pet profile renders.
- [ ] Confirm account-owned wallet/material/inventory panels still render shared balances.

## 4) Active pet switching

- [ ] Switch from Pet A to Pet B and confirm in-progress/source-scoped rewards stay bound to the original source pet.
- [ ] Confirm Pet XP does not move from Pet A to Pet B because of active-slot changes.

## 5) Gameplay smoke testing

- [ ] Run a Daily Journey flow and verify Growth Mark ownership stays on the qualifying pet.
- [ ] Run a Weekly Journey flow and verify Weekly Crest ownership stays on the qualifying pet.
- [ ] Run a Daily Run flow and verify run authority stays on the reserved run pet.
- [ ] Run district/event-chain/seasonal-boss reward paths and verify source pet ownership is preserved.

## 6) Authority verification

- [ ] Run `node scripts/verify-moonpet-identity-authority.mjs` and confirm `STATUS: PASS`.
- [ ] Review audit output for missing `pet_id`, missing `season_key`, invalid ownership references, stale authority links, and ownership-boundary drift.
