# Telegram Hard-Gate Runtime Implementation Plan

This branch intentionally starts with the runtime contract and failing acceptance checks. The implementation must now make those checks pass without weakening existing server authority.

## Required implementation order

1. Add a shared direct-route competitive Arcade gate in `js/identity-gate.js`.
2. Run the gate before active game bootstrap logic initializes.
3. Require both `/gklink` completion and fresh signed Telegram auth.
4. Remove any local pending competitive run queue or later-flush path.
5. Ensure `submitScore()` fails closed and never manufactures guest names.
6. Ensure leaderboard writes reject missing/expired auth server-side.
7. Ensure leaderboard reads contain Telegram-linked identities only.
8. Add regression coverage for every active game route and direct URL entry.
9. Preserve the 5000 Arcade XP Block Topia gate.
10. Run full CI, Worker tests, and live verification before merge.

## Merge rule

Do not mark the PR ready until the new runtime contract test passes and the full repository test suite remains green.
