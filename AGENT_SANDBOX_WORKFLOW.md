# Agent Sandbox Workflow

Main branch is sacred.
Sandbox branch is the warzone.
Production only changes after GK says yes.

## Required sequence before every new task
1. Create a backup snapshot branch from current state.
2. Create one or more sandbox working branches.
3. Do all high-risk/aggressive edits only inside sandbox branches.
4. Validate via sandbox deploy or equivalent isolated preview.
5. Report changed files, tests, visual results, and remaining issues.
6. Never auto-merge or auto-push directly to `main`/`master`.
7. GK manually approves final merge.

## Branch naming convention
- Backup: `codex/backup-<task>-<timestamp>`
- Sandbox: `codex/sandbox-<task>-<timestamp>`

## PR handover checklist
- backup branch name
- sandbox branch name
- scope summary
- test/validation summary
- known issues
- explicit statement that GK approval is required before production merge
