# Agent Sandbox Workflow

Main branch is sacred. Sandbox branch is the warzone. Production only changes after GK says yes.

## Mandatory Flow Before Every Task

1. Create backup snapshot branch from current working state.
2. Create sandbox working branch (one or more if parallel swarm tracks are needed).
3. Apply aggressive edits only inside sandbox branches.
4. Deploy/test a sandbox URL or local preview equivalent.
5. Report changed files, tests, visual results, and remaining issues.
6. Never auto-merge or auto-push into `main`/`master`.
7. GK performs final merge approval manually.

## Branch Naming

- Backup: `codex/backup-<task>-<timestamp>`
- Sandbox: `codex/sandbox-<task>-<timestamp>`

## Required Handover Artifact

Each sandbox PR must include:

- Backup branch name
- Sandbox branch name
- Change summary
- Validation summary
- Known risks/issues
- Explicit merge hold awaiting GK approval
