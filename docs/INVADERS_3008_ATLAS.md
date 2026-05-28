# Invaders 3008 Presentation Mode

Invaders 3008 now uses **primitive-only runtime rendering** for gameplay visuals.

## Why

Runtime contact-sheet slicing was causing cramped, inconsistent visuals and artefacts from production panels. To preserve gameplay behavior while fixing presentation quality, all runtime atlas draws were removed.

## Current runtime rule

- `js/arcade/games/invaders/render-system.js` must not import or use runtime sheet/atlas crop paths.
- Player, enemies, bosses, bullets, pickups, mini-enemies, and lives render through coherent primitive paths.
- If clean transparent runtime sprites are introduced in the future, they must be production-safe standalone assets (no labels/panels/background hacks), and classes without safe assets must remain on full primitive fallback.

## Non-goals

This presentation change does not alter gameplay sizing, hitboxes, timing, bullets, wave logic, score, HP, movement, or fullscreen shell behavior.
