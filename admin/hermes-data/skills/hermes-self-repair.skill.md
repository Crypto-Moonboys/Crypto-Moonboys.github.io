# hermes-self-repair

## When to use it
Use for Hermes owner commands that directly require hermes-self-repair outcomes.

## Files to inspect
- games/block-topia/
- server/block-topia/
- workers/moonboys-api/blocktopia/
- api/hermes-api.js
- server/hermes/

## Commands/tests to run
- npm run test:hermes-readiness
- npm test
- node --check server/hermes/openai-command-interpreter.js

## What not to touch
- Do not edit .git internals, secrets, or unrelated repos.
- Do not mutate main/master directly.

## Rollback notes
Use Hermes patch rollback or git revert/cherry-pick on sandbox branch before PR.

## Success criteria
Task implemented in sandbox worktree, tests pass, job reaches ready_for_pr, and PR metadata is generated.
