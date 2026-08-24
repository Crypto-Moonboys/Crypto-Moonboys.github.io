# NBG London Graffiti Run Runtime Discovery

## Purpose

Track the connection between generated PixelLab assets and the live game runtime.

## Current status

The PixelLab pipeline is prepared. Runtime replacement paths must be confirmed against the active game implementation before generated files replace placeholders.

## Required checks

- Locate current player sprite preload path.
- Locate enemy asset preload paths.
- Locate tileset/background loading paths.
- Confirm animation keys used by runtime.
- Confirm collision dimensions remain unchanged.

## Replacement rule

Generated assets replace art only. Game logic, physics, scoring, collisions and progression systems should not be changed unless required by asset dimensions.

## Verification

Before merging production assets:

- PNG validation passed.
- Transparency verified.
- Frame dimensions verified.
- Animation names verified.
- Runtime preload paths verified.
