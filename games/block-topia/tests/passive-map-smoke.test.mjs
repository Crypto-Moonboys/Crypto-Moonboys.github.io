import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.resolve(here, '../main.js');
const indexPath = path.resolve(here, '../index.html');
const isoRendererPath = path.resolve(here, '../render/iso-renderer.js');
const source = await fs.readFile(mainPath, 'utf8');
const indexHtml = await fs.readFile(indexPath, 'utf8');
const isoRendererSource = await fs.readFile(isoRendererPath, 'utf8');

function expectIncludes(snippet, message) {
  assert.ok(source.includes(snippet), message);
}

function expectNotIncludes(snippet, message) {
  assert.equal(source.includes(snippet), false, message);
}

function expectRegex(re, message) {
  assert.ok(re.test(source), message);
}

function expectDomNotIncludes(snippet, message) {
  assert.equal(indexHtml.includes(snippet), false, message);
}

function expectIsoIncludes(snippet, message) {
  assert.ok(isoRendererSource.includes(snippet), message);
}

function expectIsoNotIncludes(snippet, message) {
  assert.equal(isoRendererSource.includes(snippet), false, message);
}

// 1) state.controlNodes is empty after boot
expectIncludes(
  'state.controlNodes = [];',
  'Expected passive visual guard to clear state.controlNodes.',
);

// 2) state.npc.entities is empty after boot
expectIncludes(
  'state.npc.entities = [];',
  'Expected passive visual guard to clear state.npc.entities.',
);

// 3) state.signalOperations.active is empty after boot
expectIncludes(
  'state.signalOperations.active = [];',
  'Expected passive visual guard to clear state.signalOperations.active.',
);

// Ensure boot actually applies the passive guard.
expectRegex(
  /applyPassiveVisualModeGuards\(\);\s*syncCameraToPlayer\(\);/,
  'Expected boot() to invoke passive visual guard before gameplay loop.',
);

// 4) Clicking map never calls node interaction functions.
expectNotIncludes(
  'tryInteractWithClickedNode',
  'main.js must not contain node interaction click routing.',
);
expectNotIncludes(
  'sendNodeInterference',
  'main.js must not call node interaction networking.',
);
expectRegex(
  /canvas\.addEventListener\('click',[\s\S]*?if \(state\.mouse\.suppressClick\)[\s\S]*?const tile = renderer\.pickTileFromClientPoint\([\s\S]*?state\.player\.moveTarget = \{ x: tile\.col, y: tile\.row \};[\s\S]*?\}\);/,
  'Expected click handler to set only move target (no node gameplay call path).',
);

// 5) No mini-game overlay imports are used by main.js.
expectNotIncludes(
  "from './ui/node-outbreak-overlay",
  'main.js must not import node outbreak overlay.',
);
expectNotIncludes(
  "from './ui/firewall-defense-overlay",
  'main.js must not import firewall overlay.',
);
expectNotIncludes(
  "from './ui/signal-router-overlay",
  'main.js must not import signal router overlay.',
);
expectNotIncludes(
  "from './ui/circuit-connect-overlay",
  'main.js must not import circuit connect overlay.',
);

// 6) WASD/arrow movement sends movement.
expectIncludes(
  'const keyboardMovementApplied = updatePlayerMotion(state, input, dt, sendMovement);',
  'Expected keyboard motion path to pass sendMovement sender.',
);

// 7) Click movement sends movement.
expectIncludes(
  'movePlayerTowardTarget(state, dt, sendMovement);',
  'Expected click target motion path to pass sendMovement sender.',
);

// 8) Drag pan does NOT send movement.
expectRegex(
  /canvas\.addEventListener\('mousemove',[\s\S]*?if \(state\.mouse\.dragging\) \{[\s\S]*?state\.camera\.panX = state\.mouse\.cameraStartX \+ \(deltaX \/ zoom\);[\s\S]*?state\.camera\.panY = state\.mouse\.cameraStartY \+ \(deltaY \/ zoom\);[\s\S]*?return;[\s\S]*?\}\s*[\s\S]*?\}\);/,
  'Expected drag branch to pan camera and return without movement send.',
);
expectIncludes(
  'state.mouse.suppressClick = true;',
  'Expected drag release to suppress click-to-move.',
);
expectRegex(
  /canvas\.addEventListener\('click',[\s\S]*?if \(state\.mouse\.suppressClick\) \{[\s\S]*?return;[\s\S]*?\}/,
  'Expected click handler to early-return after drag suppression.',
);

// 9) Old feed / event / popup call paths are removed from main.js.
expectNotIncludes(
  'pushFeed(',
  'main.js must not call pushFeed.',
);
expectNotIncludes(
  'showToast(',
  'main.js must not call showToast.',
);
expectNotIncludes(
  'showNodeInterference(',
  'main.js must not call showNodeInterference.',
);
expectNotIncludes(
  'showDistrictCapture(',
  'main.js must not call showDistrictCapture.',
);
expectNotIncludes(
  'onFeed:',
  'main.js must not subscribe to legacy feed text events.',
);
expectNotIncludes(
  'onSamPhaseChanged',
  'main.js must not subscribe to SAM popup/event handlers.',
);
expectNotIncludes(
  'onDistrictCaptureChanged',
  'main.js must not subscribe to district capture stream handlers.',
);
expectNotIncludes(
  'onDistrictControlStateChanged',
  'main.js must not subscribe to district stream handlers.',
);

// 10) DOM does not contain old stream / feed containers.
expectDomNotIncludes(
  'id="status-line"',
  'index.html must not include the old bottom-left status/feed box.',
);
expectDomNotIncludes(
  'id="feed"',
  'index.html must not include feed containers.',
);
expectDomNotIncludes(
  'id="toast"',
  'index.html must not include toast containers.',
);
expectDomNotIncludes(
  'id="district-stream"',
  'index.html must not include district stream containers.',
);

// 11) Iso renderer map text labels are fully disabled (player name only).
expectIsoIncludes(
  'ctx.fillText(state.player.name, sx, sy - 47);',
  'iso-renderer.js should still draw the player name.',
);
expectIsoNotIncludes(
  'ctx.fillText(`${districtMeta.name}',
  'iso-renderer.js must not draw district names.',
);
expectIsoNotIncludes(
  'ctx.fillText(`${Math.round(Number(entry.control || 0))}',
  'iso-renderer.js must not draw control percentages.',
);
expectIsoNotIncludes(
  'ctx.fillText(`${theme.label}',
  'iso-renderer.js must not draw control node labels.',
);

console.log('Block Topia passive-map smoke checks passed.');
