# Agent Editing Rules

Main branch is sacred.
Sandbox branch is the warzone.
Production only changes after GK says yes.

## Global enforcement
- Never push direct edits to `main` or `master`.
- Always create backup + sandbox branches first.
- Keep destructive operations gated by explicit approvals.
- Present intended file/action plan before edits where possible.
- Include tests + unresolved risks in every PR handoff.

## Scope boundaries
- Do not modify unrelated runtime systems outside requested scope.
- Preserve existing auth, leaderboard, Telegram, and core gameplay behavior unless explicitly requested.
- Never expose secrets, keys, `.env`, or private credentials.

## Release control
No production deployment and no final merge without explicit GK confirmation.
