const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'data', 'moonpet-side-scroller-approved-assets.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'moonpet-frame-anchors.json');
const FRAME_SIZE = 256;
const CANONICAL_HEIGHT = 185;
const ANCHOR_NAMES = [
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
const FRONT_ROLES = new Set([
  'side_front_point',
  'side_front_wave',
  'side_front_victory',
  'side_front_dance'
]);

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function median(values) {
  return percentile(values, 0.5);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value) {
  return Number(value.toFixed(4));
}

function normalized(value) {
  return round(clamp(value / FRAME_SIZE, -0.25, 1.25));
}

function orientationFor(role, frameIndex) {
  if (FRONT_ROLES.has(role)) return 'front';
  if (role !== 'side_turn') return 'side_right';
  if (frameIndex <= 5) return 'side_right';
  if (frameIndex <= 12) return 'rear';
  if (frameIndex <= 16) return 'side_left';
  if (frameIndex <= 20) return 'front';
  return 'side_right';
}

function authoredHeadRotation(role, frameIndex) {
  if (role === 'side_sleep') return -35;
  if (role === 'side_celebrate') return frameIndex < 5 ? -frameIndex * 2 : -Math.min(25, 8 + (frameIndex - 4) * 3);
  if (role === 'side_front_dance') return [0, 2, 3, 2, 0, -2, -3, -2, 0, 2, 3, 2, 0, -2, -3, -2, 0, 2, 3, 2, 0, -2, -3, -2, 0][frameIndex];
  return 0;
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    const xs = [];
    const ys = [];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % width;
      const y = Math.floor(current / width);
      xs.push(x);
      ys.push(y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    if (xs.length >= 24) components.push({ xs, ys, area: xs.length });
  }
  return components;
}

function componentBounds(component) {
  const left = percentile(component.xs, 0.01);
  const right = percentile(component.xs, 0.99);
  const top = percentile(component.ys, 0.005);
  const bottom = percentile(component.ys, 0.995);
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  return { left, right, top, bottom, centerX, centerY, width: right - left, height: bottom - top };
}

function componentAngle(component) {
  const meanX = component.xs.reduce((sum, value) => sum + value, 0) / component.xs.length;
  const meanY = component.ys.reduce((sum, value) => sum + value, 0) / component.ys.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let index = 0; index < component.xs.length; index += 1) {
    const dx = component.xs[index] - meanX;
    const dy = component.ys[index] - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  let angle = 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  if (angle > 45) angle -= 90;
  if (angle < -45) angle += 90;
  return clamp(angle, -45, 45);
}

function analyzeFrame(data, sheetWidth, originX, originY) {
  const brightMask = new Uint8Array(FRAME_SIZE * FRAME_SIZE);
  const brightXs = [];
  const brightYs = [];
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const source = ((originY + y) * sheetWidth + originX + x) * 4;
      const red = data[source];
      const green = data[source + 1];
      const blue = data[source + 2];
      const alpha = data[source + 3];
      const neutralBright = alpha > 128
        && red > 118 && green > 118 && blue > 123
        && Math.max(red, green, blue) - Math.min(red, green, blue) < 105;
      if (!neutralBright) continue;
      brightMask[y * FRAME_SIZE + x] = 1;
      brightXs.push(x);
      brightYs.push(y);
    }
  }

  const components = connectedComponents(brightMask, FRAME_SIZE, FRAME_SIZE);
  const head = components
    .map((component) => ({ component, bounds: componentBounds(component) }))
    .filter(({ bounds }) => bounds.top < 145 && bounds.width > 42)
    .sort((left, right) => right.component.area - left.component.area)[0];
  const headBounds = head ? head.bounds : { left: 78, right: 178, top: 22, bottom: 122, centerX: 128, centerY: 72, width: 100, height: 100 };
  const bodyXs = [];
  const bodyYs = [];
  for (let index = 0; index < brightXs.length; index += 1) {
    if (Math.abs(brightXs[index] - headBounds.centerX) > Math.max(78, headBounds.width * 0.95)) continue;
    bodyXs.push(brightXs[index]);
    bodyYs.push(brightYs[index]);
  }
  const lowerXs = bodyXs.filter((_, index) => bodyYs[index] > headBounds.bottom - 8);
  const rootX = lowerXs.length ? percentile(lowerXs, 0.5) : headBounds.centerX;
  const rootY = bodyYs.length ? percentile(bodyYs, 0.997) : 232;
  return {
    head: headBounds,
    headAngle: head ? componentAngle(head.component) : 0,
    rootX,
    rootY,
    bodyHeight: Math.max(80, rootY - headBounds.top)
  };
}

function anchor(x, y, scale, rotation, visible = true, occluded = false) {
  return [
    normalized(x),
    normalized(y),
    round(scale / FRAME_SIZE),
    round(rotation),
    visible,
    occluded
  ];
}

function anchorsForFrame(frame, orientation) {
  const head = frame.head;
  const headWidth = head.width;
  const front = orientation === 'front';
  const rear = orientation === 'rear';
  const facingSign = orientation === 'side_left' ? -1 : 1;
  const chestY = Math.min(frame.rootY - headWidth * 0.28, head.top + headWidth * (front ? 1.03 : 0.96));
  const chestX = front ? head.centerX : head.centerX - facingSign * headWidth * 0.05;
  const visorCenterX = front ? head.centerX : head.centerX + facingSign * headWidth * 0.38;
  const visorCenterY = head.top + headWidth * (front ? 0.48 : 0.43);
  const visorWidth = rear ? 0 : headWidth * (front ? 0.7 : 0.24);
  const handSpread = headWidth * (front ? 0.4 : 0.25);
  const handY = chestY + headWidth * 0.3;
  const footSpread = headWidth * (front ? 0.2 : 0.11);
  const footY = frame.rootY - 4;
  const bodyScale = frame.bodyHeight;
  return {
    root: anchor(frame.rootX, frame.rootY, bodyScale, 0),
    head_center: anchor(head.centerX, head.centerY, headWidth, frame.headAngle),
    head_top: anchor(head.centerX, head.top, headWidth, frame.headAngle),
    visor_center: anchor(visorCenterX, visorCenterY, visorWidth, frame.headAngle, !rear, rear),
    visor_left: anchor(visorCenterX - visorWidth * 0.5, visorCenterY, visorWidth, frame.headAngle, !rear, rear),
    visor_right: anchor(visorCenterX + visorWidth * 0.5, visorCenterY, visorWidth, frame.headAngle, !rear, rear),
    chest_center: anchor(chestX, chestY, headWidth * 0.62, frame.headAngle * 0.2),
    back_center: anchor(chestX - facingSign * headWidth * (front || rear ? 0 : 0.32), chestY, headWidth * 0.58, frame.headAngle * 0.2, true, front),
    hand_left: anchor(chestX - handSpread, handY, headWidth * 0.2, frame.headAngle * 0.25, true, orientation === 'side_right'),
    hand_right: anchor(chestX + handSpread, handY, headWidth * 0.2, frame.headAngle * 0.25, true, orientation === 'side_left'),
    foot_left: anchor(frame.rootX - footSpread, footY, headWidth * 0.25, 0),
    foot_right: anchor(frame.rootX + footSpread, footY, headWidth * 0.25, 0)
  };
}

async function buildRole(asset) {
  const image = await sharp(path.join(ROOT, asset.sheet_path.replace(/^\//, '')))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rawFrames = [];
  for (let index = 0; index < 25; index += 1) {
    rawFrames.push(analyzeFrame(
      image.data,
      image.info.width,
      (index % 5) * FRAME_SIZE,
      Math.floor(index / 5) * FRAME_SIZE
    ));
  }

  const medianCenter = median(rawFrames.map((frame) => frame.head.centerX));
  const medianWidth = median(rawFrames.map((frame) => frame.head.width));
  const medianRootX = median(rawFrames.map((frame) => frame.rootX));
  const medianRootY = median(rawFrames.map((frame) => frame.rootY));
  const medianHeight = median(rawFrames.map((frame) => frame.bodyHeight));
  const frames = rawFrames.map((frame, index) => {
    if (Math.abs(frame.head.centerX - medianCenter) > 22) frame.head.centerX = medianCenter;
    if (frame.head.width < medianWidth * 0.72 || frame.head.width > medianWidth * 1.3) frame.head.width = medianWidth;
    const unstableHeight = frame.bodyHeight < medianHeight * 0.72 || frame.bodyHeight > medianHeight * 1.28;
    if (FRONT_ROLES.has(asset.role) || unstableHeight) {
      frame.head.top = frame.rootY - medianHeight;
      frame.head.centerY = frame.head.top + frame.head.width * 0.5;
      frame.head.bottom = frame.head.top + frame.head.width;
      frame.bodyHeight = medianHeight;
    }
    frame.headAngle = authoredHeadRotation(asset.role, index);
    const orientation = orientationFor(asset.role, index);
    return {
      index,
      orientation,
      facing: orientation === 'side_left' ? -1 : orientation === 'side_right' ? 1 : 0,
      anchors: anchorsForFrame(frame, orientation)
    };
  });
  return {
    sheet_path: asset.sheet_path,
    frame_count: frames.length,
    normalization: {
      scale: round(clamp(CANONICAL_HEIGHT / medianHeight, 0.62, 1.35)),
      root_x: normalized(medianRootX),
      root_y: normalized(medianRootY),
      source_height: round(medianHeight),
      review_status: 'generated_reviewed'
    },
    frames
  };
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const promoted = registry.assets.filter((asset) => asset.approved === true && asset.promoted === true && !asset.rejected);
  const roles = {};
  for (const asset of promoted) roles[asset.role] = await buildRole(asset);
  const output = {
    schema_version: 1,
    system_id: 'moonbot_frame_anchor_rig_v1',
    generated_from: 'promoted Moonbot runtime sprite sheets',
    frame_space: { width: FRAME_SIZE, height: FRAME_SIZE, origin: 'top_left', units: 'normalized_0_to_1' },
    canonical_geometry: {
      target_character_height: CANONICAL_HEIGHT,
      root_screen_x: 0.5,
      root_screen_y: 0.88,
      primary_front_idle_role: 'side_front_point'
    },
    required_anchors: ANCHOR_NAMES,
    anchor_fields: ['x', 'y', 'scale', 'rotation', 'visible', 'occluded'],
    orientation_views: ['front', 'side_right', 'side_left', 'rear'],
    roles
  };
  const serialized = JSON.stringify(output, null, 2).replace(
    /\[\n((?:\s+(?:"[^"]*"|-?\d+(?:\.\d+)?|true|false|null),?\n)+)\s*\]/g,
    (_, values) => `[${values.trim().split(/\r?\n/).map((line) => line.trim().replace(/,$/, '')).join(', ')}]`
  );
  fs.writeFileSync(OUTPUT_PATH, `${serialized}\n`);
  console.log(`Moonbot frame anchors written: ${Object.keys(roles).length} roles, ${Object.values(roles).reduce((sum, role) => sum + role.frames.length, 0)} frames`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
