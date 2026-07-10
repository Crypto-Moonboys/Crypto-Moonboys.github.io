# Telegram Hard-Gate Runtime Contract

## Purpose

Make deployed Arcade behaviour match the public Crypto Moonboys canon.

## Required runtime behaviour

- A fresh, fully linked Telegram identity is required before entering any competitive Arcade game.
- Direct game URLs must fail closed when Telegram identity is missing, incomplete, expired, or cannot be restored.
- Unlinked users may view public information pages, but cannot start or control a competitive run.
- No unlinked score is submitted, saved, cached, queued, ranked, or calculated for later progression.
- No unlinked Arcade XP is earned, retained, projected as awarded, or restored later.
- No anonymous, guest, hidden, device-local, or fallback competitive leaderboard exists.
- Every competitive leaderboard row must resolve to a Telegram-linked identity.
- Authentication must remain valid while grinding. Expired or invalid auth must stop further competitive submissions and require reauthentication.
- Block Topia remains gated by linked identity plus 5000 server-accepted Arcade XP.

## Implementation scope

Audit and update the shared identity, Arcade, score submission, leaderboard, retention, local-cache, and game bootstrap paths. Do not rely on copy-only enforcement.

Primary areas to audit:

- `js/identity-gate.js`
- `js/leaderboard-client.js`
- `js/arcade-sync.js`
- `js/arcade-meta-system.js`
- `js/arcade-retention-engine.js`
- `js/arcade/core/`
- all active game bootstrap files under `js/arcade/games/`
- `games/leaderboard.html` and its scripts
- leaderboard Worker write/read validation
- Moonboys API Arcade XP sync routes

## Required tests

- Guest cannot start an Arcade run.
- Telegram-authenticated but not `/gklink`-activated user cannot start a competitive run.
- Expired Telegram auth cannot start or continue competitive submissions.
- Direct navigation to each active game route is blocked before gameplay initialization.
- Unlinked score submission returns a hard rejection and creates no local pending record.
- No local queue can later flush an unlinked run after linking.
- Leaderboard writes reject missing or invalid Telegram auth.
- Leaderboard reads never expose anonymous/guest fallback identities.
- Linked, fresh-auth users can play, submit accepted scores, earn server-backed XP, and appear on leaderboards.
- Block Topia remains locked below 5000 Arcade XP and available at or above 5000 XP.

## Non-goals

- Do not redesign the homepage.
- Do not change the 5000 XP gate.
- Do not change faction canon or creator-track copy.
- Do not introduce a second leaderboard or a local fallback leaderboard.
