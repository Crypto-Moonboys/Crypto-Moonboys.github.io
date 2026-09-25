const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'moonpet-frame-anchors.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'moonpet-side-scroller-approved-assets.json'), 'utf8'));
const fields = Object.fromEntries(rig.anchor_fields.map((field, index) => [field, index]));
const roles = (registry.assets || []).filter((asset) => asset.approved && asset.promoted).map((asset) => asset.role);
const errors = [];
const warnings = [];

function fail(condition, message) {
  if (!condition) errors.push(message);
}

function value(anchor, field) {
  return anchor[fields[field]];
}

function rootRelative(frame, anchorName) {
  const anchor = frame.anchors[anchorName];
  const root = frame.anchors.root;
  return [value(anchor, 'x') - value(root, 'x'), value(anchor, 'y') - value(root, 'y')];
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

const continuityLimits = {
  head_center: 0.18,
  head_top: 0.18,
  visor_center: 0.2,
  chest_center: 0.18,
  back_center: 0.2,
  hand_left: 0.18,
  hand_right: 0.18,
  foot_left: 0.18,
  foot_right: 0.18
};
const maxContinuity = Object.fromEntries(Object.keys(continuityLimits).map((anchor) => [anchor, 0]));
const uprightSizeRoles = new Set([
  'side_front_point',
  'side_front_wave',
  'side_front_victory',
  'side_front_dance',
  'side_idle',
  'side_walk',
  'side_run',
  'side_jump'
]);

for (const role of roles) {
  const roleRig = rig.roles[role];
  if (!roleRig) continue;
  const normalizedHeights = [];
  for (let index = 0; index < roleRig.frames.length; index += 1) {
    const frame = roleRig.frames[index];
    const anchors = frame.anchors;
    const rootY = value(anchors.root, 'y');
    const headTopY = value(anchors.head_top, 'y');
    const headCenterY = value(anchors.head_center, 'y');
    const chestY = value(anchors.chest_center, 'y');
    normalizedHeights.push((rootY - headTopY) * roleRig.normalization.scale);

    for (const [anchorName, anchor] of Object.entries(anchors)) {
      const x = value(anchor, 'x');
      const y = value(anchor, 'y');
      const scale = value(anchor, 'scale');
      fail(x >= -0.08 && x <= 1.08, `${role} frame ${index}: ${anchorName} x escaped the frame envelope`);
      fail(y >= -0.08 && y <= 1.08, `${role} frame ${index}: ${anchorName} y escaped the frame envelope`);
      fail(scale >= 0 && scale <= 1, `${role} frame ${index}: ${anchorName} scale is invalid`);
    }
    fail(headTopY <= headCenterY, `${role} frame ${index}: head_top is below head_center`);
    fail(headCenterY < rootY, `${role} frame ${index}: head_center is below root`);
    fail(chestY > headTopY && chestY < rootY + 0.03, `${role} frame ${index}: chest_center left the torso envelope`);
    fail(value(anchors.foot_left, 'y') <= rootY + 0.03, `${role} frame ${index}: foot_left is below root`);
    fail(value(anchors.foot_right, 'y') <= rootY + 0.03, `${role} frame ${index}: foot_right is below root`);
    if (value(anchors.visor_center, 'visible')) {
      fail(value(anchors.visor_left, 'x') <= value(anchors.visor_center, 'x'), `${role} frame ${index}: visor_left crossed visor_center`);
      fail(value(anchors.visor_center, 'x') <= value(anchors.visor_right, 'x'), `${role} frame ${index}: visor_right crossed visor_center`);
      fail(value(anchors.visor_center, 'y') >= headTopY - 0.02 && value(anchors.visor_center, 'y') <= chestY, `${role} frame ${index}: visor_center left the head envelope`);
    }
    if (frame.orientation === 'rear') {
      fail(value(anchors.visor_center, 'visible') === false, `${role} frame ${index}: rear visor must be hidden`);
      fail(value(anchors.visor_center, 'occluded') === true, `${role} frame ${index}: rear visor must be occluded`);
    }

    if (index > 0) {
      for (const [anchorName, limit] of Object.entries(continuityLimits)) {
        const previousFrame = roleRig.frames[index - 1];
        const previousAnchor = previousFrame.anchors[anchorName];
        const currentAnchor = frame.anchors[anchorName];
        if (value(previousAnchor, 'visible') !== value(currentAnchor, 'visible')) continue;
        const jump = distance(rootRelative(previousFrame, anchorName), rootRelative(frame, anchorName));
        maxContinuity[anchorName] = Math.max(maxContinuity[anchorName], jump);
        fail(jump <= limit, `${role} frame ${index}: ${anchorName} jumped ${jump.toFixed(3)} (limit ${limit})`);
      }
    }
  }
  const medianHeight = normalizedHeights.slice().sort((a, b) => a - b)[Math.floor(normalizedHeights.length / 2)];
  if (uprightSizeRoles.has(role)) {
    fail(medianHeight >= 0.68 && medianHeight <= 0.76, `${role}: normalized Moonbot height ${medianHeight.toFixed(3)} is inconsistent`);
  }
  const heightSpread = Math.max(...normalizedHeights) - Math.min(...normalizedHeights);
  if (heightSpread > 0.12) warnings.push(`${role}: intentional animation height spread ${heightSpread.toFixed(3)} requires visual review`);
}

const turnFrames = rig.roles.side_turn?.frames || [];
for (let index = 1; index < turnFrames.length; index += 1) {
  const previous = turnFrames[index - 1].facing;
  const current = turnFrames[index].facing;
  fail(Math.abs(current - previous) <= 1, `side_turn frame ${index}: facing jumped directly across orientations`);
}

if (errors.length) {
  console.error(`Moonbot frame anchor quality audit failed (${errors.length}):`);
  errors.slice(0, 60).forEach((error) => console.error(`- ${error}`));
  if (errors.length > 60) console.error(`- ... ${errors.length - 60} additional errors`);
  process.exitCode = 1;
} else {
  const continuity = Object.entries(maxContinuity).map(([anchor, jump]) => `${anchor}=${jump.toFixed(3)}`).join(', ');
  console.log(`Moonbot frame anchor quality audit passed: ${roles.length} roles, ${roles.length * 25} frames.`);
  console.log(`Maximum root-relative adjacent movement: ${continuity}`);
  warnings.forEach((warning) => console.log(`Review note: ${warning}`));
}
