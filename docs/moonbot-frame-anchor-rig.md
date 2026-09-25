# Moonbot Frame Anchor Rig

## Runtime Contract

The production attachment path is:

`MOONBOT FRAME -> BODY ANCHOR -> WEARABLE LOCAL OFFSET`

Animation frames own pose tracking. Wearables must not contain independent per-frame position tables.

The generated runtime registry is `data/moonpet-frame-anchors.json`. Rebuild it with:

```text
node scripts/build-moonpet-frame-anchors.js
```

Validate the committed registry and wearable ownership contract with:

```text
npm run moonpet:frame-anchors:check
```

Every promoted role has 25 frames. Each frame declares its orientation and the required anchors: `root`, `head_center`, `head_top`, `visor_center`, `visor_left`, `visor_right`, `chest_center`, `back_center`, `hand_left`, `hand_right`, `foot_left`, and `foot_right`.

Packed anchor values use the field order declared by `anchor_fields`: `x`, `y`, `scale`, `rotation`, `visible`, `occluded`. Coordinates and scale are normalized to the 256x256 source frame.

Role-level scale normalization and each frame's `root` anchor align the character to one canonical height, center, and ground baseline. Pose and limb motion within an animation remains frame-authored.

## Wearable Production Stages

1. Fit the master design on the actual `side_front_point` Moonbot.
2. Extract a transparent fitted overlay from that composite.
3. Produce the required view family: front, side-right, side-left, and rear/back where visible.
4. Preserve logos and directional graphics; never approve a backwards mirrored mark.
5. Bind the wearable to one character anchor such as `head_top` or `visor_center`.
6. Add only local `offset_x`, `offset_y`, `scale_multiplier`, or `rotation_offset` adjustments.
7. Review the wearable on complete Moonbot animation loops, including transitions and mirrored movement.
8. Approve support role-by-role. Unreviewed roles stay in `blocked_roles`.
9. Enable only reviewed roles and record approval and review notes.
10. Test the live beta on desktop and 390x844 mobile.
11. Verify `?sideSprites=0` rollback before promotion.

## View And Layer Rules

- `orientation_assets` maps `front`, `side_right`, `side_left`, and `rear` to fitted bitmap assets.
- A missing orientation asset means the wearable is intentionally hidden for that view.
- The renderer chooses the view from character-frame orientation before counter-mirroring scene movement.
- `layer`, `z_index`, and `occlusion_policy` describe draw order. Character anchors own visibility and occlusion state.
- `supported_roles`, `blocked_roles`, `approval_status`, and `review_notes` are mandatory production metadata.

## Reference Proofs

- `neon_borough_cap` binds to `head_top` and uses no wearable-owned frame tracking.
- `sample_visor_glasses` binds to `visor_center`; rear frames hide it through character anchor visibility.

No additional production wearable should be started until both proofs pass the full runtime and mobile review.
