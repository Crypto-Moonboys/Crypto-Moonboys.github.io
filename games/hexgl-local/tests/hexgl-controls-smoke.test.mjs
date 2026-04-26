/**
 * HexGL Controls Smoke Test
 *
 * Validates (via source analysis):
 * 1. WASD key bindings are present in ShipControls.js
 * 2. A (65) and D (68) set both trigger AND steer-left/steer-right
 * 3. launch.js uses pointer:fine guard to avoid defaulting to touch on desktop
 * 4. launch.js has undefined-safe fallback in the settings display function
 * 5. The wrapper iframe has tabindex set for reliable keyboard focus
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

const shipControlsSrc = await fs.readFile(
  path.resolve(here, '../bkcore/hexgl/ShipControls.js'), 'utf8');
const launchSrc = await fs.readFile(
  path.resolve(here, '../launch.js'), 'utf8');
const wrapperHtml = await fs.readFile(
  path.resolve(root, 'games/hexgl-monster-max/index.html'), 'utf8');

// ---------------------------------------------------------------------------
// 1. W key (87) maps to forward
// ---------------------------------------------------------------------------
assert.ok(
  shipControlsSrc.includes('case 87:') && shipControlsSrc.includes('key.forward = true'),
  'ShipControls.js must map W (87) to key.forward = true'
);

// ---------------------------------------------------------------------------
// 2. S key (83) maps to backward
// ---------------------------------------------------------------------------
assert.ok(
  shipControlsSrc.includes('case 83:') && shipControlsSrc.includes('key.backward = true'),
  'ShipControls.js must map S (83) to key.backward = true'
);

// ---------------------------------------------------------------------------
// 3. A key (65) sets BOTH ltrigger AND left (steer + drift)
// ---------------------------------------------------------------------------
const aKeyBlock = shipControlsSrc.match(/case 65:[\s\S]*?break;/);
assert.ok(
  aKeyBlock && aKeyBlock[0].includes('key.ltrigger'),
  'ShipControls.js case 65 (A) must set key.ltrigger'
);
assert.ok(
  aKeyBlock && aKeyBlock[0].includes('key.left'),
  'ShipControls.js case 65 (A) must also set key.left for WASD steer-left'
);

// ---------------------------------------------------------------------------
// 4. D key (68) sets BOTH rtrigger AND right (steer + drift)
// ---------------------------------------------------------------------------
const dKeyBlock = shipControlsSrc.match(/case 68:[\s\S]*?break;/);
assert.ok(
  dKeyBlock && dKeyBlock[0].includes('key.rtrigger'),
  'ShipControls.js case 68 (D) must set key.rtrigger'
);
assert.ok(
  dKeyBlock && dKeyBlock[0].includes('key.right'),
  'ShipControls.js case 68 (D) must also set key.right for WASD steer-right'
);

// ---------------------------------------------------------------------------
// 5. launch.js guards touch-default with pointer:fine so keyboard is preferred
//    on desktops that also have a touchscreen
// ---------------------------------------------------------------------------
assert.ok(
  launchSrc.includes('pointer: fine') || launchSrc.includes("pointer:fine"),
  'launch.js must use a pointer:fine media query to avoid defaulting to touch on desktops'
);

// ---------------------------------------------------------------------------
// 6. launch.js has undefined-safe fallback for settings display (no raw
//    a[1][a[3]] that could be undefined)
// ---------------------------------------------------------------------------
assert.ok(
  launchSrc.includes('_label !== undefined') || launchSrc.includes('_label != null'),
  'launch.js must guard against undefined settings labels'
);

// ---------------------------------------------------------------------------
// 7. Wrapper iframe has tabindex for reliable programmatic focus
// ---------------------------------------------------------------------------
assert.ok(
  wrapperHtml.includes('tabindex="-1"') || wrapperHtml.includes("tabindex='-1'"),
  'hexgl-monster-max/index.html iframe must carry tabindex="-1" for reliable focus'
);

console.log('HexGL controls smoke checks passed ✓');
