const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const registry = readJson('data/moonpet-side-scroller-approved-assets.json');
const rig = readJson('data/moonpet-frame-anchors.json');
const wearables = readJson('data/moonpet-wearable-traits.json');

const requiredAnchors = [
  'root',
  'head_center',
  'head_top',
  'visor_center',
  'visor_left',
  'visor_right',
  'chest_center',
  'back_center',
  'hand_left',
  'hand_right',
  'foot_left',
  'foot_right'
];
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const promotedRoles = (registry.assets || [])
  .filter((asset) => asset.approved && asset.promoted)
  .map((asset) => asset.role);
const expectedFrameCount = 25;
assert(registry.frame_anchors?.system_id === 'moonbot_frame_anchor_rig_v1', 'registry must select moonbot_frame_anchor_rig_v1');
assert(registry.runtime_role_map?.idle?.role === 'side_front_point', 'primary runtime idle must be side_front_point');
assert(rig.system_id === 'moonbot_frame_anchor_rig_v1', 'anchor data system id must match the registry');
assert(Array.isArray(rig.anchor_fields), 'anchor rig must declare packed anchor fields');
for (const field of ['x', 'y', 'scale', 'rotation', 'visible', 'occluded']) {
  assert(rig.anchor_fields?.includes(field), `anchor field ${field} is required`);
}

for (const role of promotedRoles) {
  const roleRig = rig.roles?.[role];
  assert(Boolean(roleRig), `${role}: missing anchor role`);
  if (!roleRig) continue;
  assert(Number.isFinite(roleRig.normalization?.scale) && roleRig.normalization.scale > 0, `${role}: invalid normalization scale`);
  assert(Number.isFinite(roleRig.normalization?.root_x), `${role}: invalid normalized root_x`);
  assert(Number.isFinite(roleRig.normalization?.root_y), `${role}: invalid normalized root_y`);
  assert(roleRig.frames?.length === expectedFrameCount, `${role}: expected ${expectedFrameCount} anchor frames`);
  for (let frameIndex = 0; frameIndex < (roleRig.frames || []).length; frameIndex += 1) {
    const frame = roleRig.frames[frameIndex];
    assert(['front', 'side_right', 'side_left', 'rear'].includes(frame.orientation), `${role} frame ${frameIndex}: invalid orientation`);
    assert(frame.facing === 1 || frame.facing === 0 || frame.facing === -1, `${role} frame ${frameIndex}: invalid facing`);
    for (const anchorName of requiredAnchors) {
      const packed = frame.anchors?.[anchorName];
      assert(Array.isArray(packed) && packed.length === rig.anchor_fields.length, `${role} frame ${frameIndex}: invalid ${anchorName}`);
      if (Array.isArray(packed)) {
        assert(packed.every((value, index) => index < 4 ? Number.isFinite(value) : typeof value === 'boolean'), `${role} frame ${frameIndex}: invalid ${anchorName} values`);
      }
    }
  }
}

const turnOrientations = new Set((rig.roles?.side_turn?.frames || []).map((frame) => frame.orientation));
for (const orientation of ['front', 'side_right', 'side_left', 'rear']) {
  assert(turnOrientations.has(orientation), `side_turn must cover ${orientation}`);
}

const traitList = wearables.traits || [];
const traits = Object.fromEntries(traitList.map((trait) => [trait.id, trait]));
for (const trait of traitList) {
  if (trait.use_character_anchor || trait.production_status === 'production') {
    assert(trait.visual?.pose_fits === undefined, `${trait.id}: production wearables may not own pose_fits`);
  }
}

const cap = traits.neon_borough_cap;
assert(cap?.anchor_key === 'head_top', 'Neon Borough Cap must bind to head_top');
assert(cap?.use_character_anchor === true, 'Neon Borough Cap must use character anchors');
assert(cap?.anchor_binding?.frame_tracking_owner === 'moonbot', 'Neon Borough Cap tracking owner must be moonbot');
assert(promotedRoles.every((role) => cap?.supported_roles?.includes(role)), 'Neon Borough Cap must support every promoted role');

const visor = traits.sample_visor_glasses;
assert(visor?.anchor_key === 'visor_center', 'face proof must bind to visor_center');
assert(visor?.use_character_anchor === true, 'face proof must use character anchors');

const categoryProofs = {
  sample_chest_badge: 'chest_center',
  sample_micro_jetpack: 'back_center',
  sample_wrench_prop: 'hand_right'
};
for (const [traitId, anchorName] of Object.entries(categoryProofs)) {
  const trait = traits[traitId];
  assert(trait?.anchor_key === anchorName, `${traitId} must bind to ${anchorName}`);
  assert(trait?.use_character_anchor === true, `${traitId} must use character anchors`);
  assert(trait?.visual?.pose_fits === undefined, `${traitId} may not own frame tracking`);
  assert(promotedRoles.every((role) => trait?.supported_roles?.includes(role)), `${traitId} must support every promoted role`);
}
assert(wearables.layer_render_policy?.backpack === 'behind', 'backpack layer must render behind the body');
assert(wearables.layer_render_policy?.badge === 'front', 'badge layer must render in front of the body');
assert(wearables.layer_render_policy?.glasses === 'front', 'glasses layer must render in front of the body');
assert(wearables.layer_render_policy?.hat === 'front', 'hat layer must render in front of the body');
assert(wearables.layer_render_policy?.hand_item === 'anchor_occlusion', 'hand items must follow anchor occlusion');

if (errors.length) {
  console.error(`Moonbot frame anchor check failed (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Moonbot frame anchor check passed: ${promotedRoles.length} roles, ${promotedRoles.length * expectedFrameCount} frames, ${requiredAnchors.length} anchors per frame.`);
}
