# NBG London Graffiti Run - Build Consolidation

## Current decision

Architecture expansion is paused. Development moves to integration, asset production, and runtime validation.

## Completed

- Level 1 runtime structure
- player pipeline
- world pipeline
- entity pipeline
- entity-collision scaffolding (not full tile collision)
- HUD framework
- asset manifests

## Not yet complete

- Complete tile/ground collision integration
- Verified browser launch dependency chain
- Import approved PNG artwork
- Connect real sprites
- Run browser test
- Fix runtime errors
- Add enemy behaviour polish
- Add leaderboard backend
- Polish gameplay

## Next implementation order

1. Fix runtime launch dependencies
2. Complete tile/ground collision integration
3. Import approved PNG artwork
4. Connect real sprites
5. Run browser test
6. Fix runtime errors
7. Add missing gameplay systems
8. Polish gameplay

## Rule

Do not add new bridge layers unless a real runtime error requires one.

## Authority

This document is the current build priority list. Update other game documentation if implementation order changes.