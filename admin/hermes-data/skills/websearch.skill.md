# websearch

## When to use it
Use this skill when owner prompts explicitly require websearch outcomes.

## Files/tools needed
- server/hermes/
- api/hermes-api.js
- js/hermes-chat.js
- admin/hermes-data/

## Commands/tests
- npm run test:hermes-readiness
- node scripts/hermes-agent-readiness-audit.mjs

## Success criteria
Hermes produces real tool-connected output (patch preview/tool action/job state), not generic advice.

## Rollback notes
Revert the sandbox branch changes or use Hermes patch rollback before PR creation.
