# NBG London Graffiti Run - Build Consolidation

## Current decision

Architecture expansion is paused. Development moves to integration, asset production, and runtime fixes.

## Completed

- Level 1 runtime structure
- player pipeline
- world pipeline
- entity pipeline
- entity-collision scaffolding (not full tile collision)
- HUD framework
- asset manifests

## Not yet complete

- tile/ground collision integration
- verified browser launch flow
- real PNG asset import
- complete gameplay test pass

## Next implementation order

1. Fix runtime launch dependencies
2. Import approved PNG artwork
3. Connect real sprites
4. Run browser test
5. Fix runtime errors
6. Add missing gameplay systems (tile collision, enemy behaviour, leaderboard backend)
7. Polish gameplay

## Rule

Do not add new bridge layers unless a real runtime error requires one.
