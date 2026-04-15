# Block Topia Visual Asset Pipeline

This document locks the visual asset pipeline to ensure the world evolves with a consistent graffiti–cyberpunk identity and to prevent art assets from drifting stylistically over time.

## Art Direction
### Core Style
- Graffiti meets cyberpunk urban decay
- Neon lighting and high-contrast color accents
- Hand-painted textures combined with stylized geometric shapes
- Slightly exaggerated proportions for readability in an isometric view

### Visual Influences
- Street art culture and stencil graffiti
- Cyberpunk cityscapes
- Isometric social worlds
- Underground club and rave aesthetics

### Color Palette
| Role | Example Colors |
|------|----------------|
| Base environment | #071022, #1f6f50 |
| Neon accents | #ff3355, #5ef2ff, #8dff6a, #7936ff |
| Highlight | #ffd84d |
| SAM / threat | #ff2222 |

## Asset Categories
### 1. Characters
- Player avatars (modular customization)
- NPCs (Wardens, Liberators, Archivists, DJs, civilians)
- Mega NPC (SAM) with multiple phases

### 2. Environment Props
- Graffiti walls
- Neon towers and antennas
- Market booths and kiosks
- Gates and barricades
- Rooftop structures
- Street furniture (benches, lights, bins)

### 3. District Landmarks
Each district should have at least one unique landmark to anchor player memory.

| District | Landmark Example |
|---------|------------------|
| Central Plaza | Neon broadcast tower |
| Graffiti Ward | Massive mural wall |
| Signal Heights | Communication antenna array |
| Null Yard | Corrupted server monolith |

### 4. Effects (VFX)
- Neon glow pulses
- Holographic signage
- Particle sprays for graffiti interactions
- Distortion effects for SAM presence
- Party mode lighting waves

### 5. UI Elements
- HUD panels
- Quest icons
- Interaction prompts
- Faction symbols
- XP and progression indicators

## Technical Specifications
### File Formats
| Asset Type | Format |
|-----------|--------|
| Static sprites | PNG (with transparency) |
| Sprite sheets | PNG |
| Vector icons | SVG |
| Animations | PNG sequences or sprite sheets |
| Audio (future) | OGG / MP3 |

### Resolution Guidelines
- Base tile: 128x64 pixels (isometric diamond)
- Characters: 128x128 pixels
- Large props: 256x256 or higher
- UI icons: 64x64 pixels

### Naming Conventions
```
category_type_variant_state.png
```
Examples:
- character_warden_idle.png
- prop_graffiti_wall_01.png
- landmark_signal_tower.png
- effect_sam_distortion.png
- ui_quest_icon.png

## Folder Structure
All visual assets should live under the following structure:

```txt
assets/block-topia/
  characters/
    players/
    npcs/
    sam/
  props/
  landmarks/
  effects/
  ui/
  tiles/
```

## Asset Manifest
To keep asset loading deterministic, a manifest file should be maintained.

### Example: `assets/block-topia/asset-manifest.json`
```json
{
  "characters": {
    "warden": "assets/block-topia/characters/npcs/character_warden_idle.png",
    "liberator": "assets/block-topia/characters/npcs/character_liberator_idle.png",
    "archivist": "assets/block-topia/characters/npcs/character_archivist_idle.png"
  },
  "props": {
    "graffiti_wall": "assets/block-topia/props/prop_graffiti_wall_01.png",
    "signal_tower": "assets/block-topia/landmarks/landmark_signal_tower.png"
  },
  "effects": {
    "sam_distortion": "assets/block-topia/effects/effect_sam_distortion.png"
  },
  "ui": {
    "quest_icon": "assets/block-topia/ui/ui_quest_icon.svg"
  }
}
```

## Workflow for Artists
1. Concept art aligned with the graffiti–cyberpunk theme.
2. Approval against this document before production.
3. Export assets using the naming conventions.
4. Add assets to the correct folder structure.
5. Update `asset-manifest.json` with new entries.
6. Verify rendering in the client before merging to `main`.

## Integration into the Client
The frontend should load assets via the manifest to avoid hardcoded paths.

### Example Loader Snippet
```javascript
async function loadAssetManifest() {
  const response = await fetch('/assets/block-topia/asset-manifest.json');
  return response.json();
}
```

## Versioning and Iteration
- Use semantic versioning for major visual changes.
- Avoid replacing assets in-place without updating the manifest version.
- Maintain backward compatibility where possible to prevent broken references.

## Quality Checklist
Before merging new assets:
- Consistent color palette and lighting
- Correct isometric perspective
- Transparent backgrounds where required
- Optimized file sizes for web delivery
- Proper naming and manifest updates

## Exit Condition for This Phase
The visual asset pipeline is considered established when:
- The `assets/block-topia/` directory exists.
- At least one character, prop, landmark, and UI asset are integrated.
- The client loads assets through `asset-manifest.json`.
- Artists can contribute new assets without ambiguity or stylistic drift.
