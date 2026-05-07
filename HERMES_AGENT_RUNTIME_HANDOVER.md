# Hermes Agent Runtime Handover

## Runtime Model

- Normal chat mode: read/answer only, no file writes.
- Agent edit mode: write-capable only with explicit user instruction and approval requirements.
- Admin mode: operational/runtime tasks with additional confirmation.
- NPC agent mode: NPC-only scoped workflows, no website/runtime-wide edits.

## Repo Safety

- Never mutate `main`/`master` directly.
- Use sandbox-first branching defined in `AGENT_SANDBOX_WORKFLOW.md`.
- Keep all privileged actions server-gated and approval-consumed exactly once.

## Operator Handover Checklist

- Confirm active repo targeting is correct.
- Confirm approval gates and token requirements are enforced server-side.
- Confirm command allowlist remains active.
- Confirm no secret/path traversal regressions.
- Confirm no public Ollama exposure.
