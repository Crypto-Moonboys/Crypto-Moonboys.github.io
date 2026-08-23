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

## Pending integration work

- Complete tile/ground collision integration
- Verify demo launch dependency chain
- Import approved PNG artwork
- Connect real sprites
- Run browser test
- Fix runtime errors
- Add enemy behaviour polish
- Add leaderboard backend
- Polish gameplay

## Rule

Do not add new bridge layers unless a real runtime error requires one.

## Authority

This document is the current build priority list. Update other game documentation if implementation order changes.
