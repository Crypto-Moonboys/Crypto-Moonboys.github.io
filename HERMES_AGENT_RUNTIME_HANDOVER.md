# Hermes Agent Runtime Handover

## Runtime intent
- Normal chat mode: read/answer only, no write side effects.
- Agent edit mode: write-capable only after explicit user instruction and required approvals.
- Admin mode: operational/runtime actions with strict confirmation and policy checks.
- NPC agent mode: restricted to NPC-scoped data/config workflows only.

## Sandbox-first requirement
All Hermes-driven editing follows:
- backup branch -> sandbox branch -> validate -> report -> GK approval -> merge.

## Safety invariants
- No direct edits to `main`/`master`.
- Server-side approval and token checks are mandatory for privileged operations.
- Maintain command allowlist and path boundary protections.
- Keep local model/runtime endpoints private unless explicitly approved and re-reviewed.

## Operator handoff checks
- Confirm active branch scope matches requested task.
- Confirm tests/smoke checks executed.
- Confirm remaining risks and manual steps are documented.
- Confirm merge is pending GK approval.
