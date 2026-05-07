# Agent Editing Rules

Main branch is sacred.
Sandbox branch is the warzone.
Production only changes after GK says yes.

## Global Rules

- Do not push directly to `main`/`master`.
- Create backup and sandbox branches first.
- Keep destructive actions approval-gated.
- Provide file/action plan before edits when possible.
- Report tests and unresolved risks in every PR.

## Scope Protection

- Do not modify arcade/game/worker/Block Topia runtime unless explicitly required.
- Preserve Telegram link, leaderboard, XP, and auth flows.
- Never expose secrets, keys, `.env`, or `.git` internals.

## Release Rule

No production deployment without explicit GK sign-off after sandbox validation.
