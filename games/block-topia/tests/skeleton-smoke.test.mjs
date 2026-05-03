/**
 * Skeleton smoke test for the Block Topia 2-player isometric skeleton.
 *
 * Validates:
 * - network.js exports the expected public API
 * - network.js does NOT contain any old Block Topia system handlers
 * - index.html wires Colyseus and connectMultiplayer
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const networkPath = path.resolve(here, '../network.js');
const indexPath = path.resolve(here, '../index.html');
const mainPath = path.resolve(here, '../main.js');

const networkSource = await fs.readFile(networkPath, 'utf8');
const indexHtml = await fs.readFile(indexPath, 'utf8');
const mainSource = await fs.readFile(mainPath, 'utf8');

// ---------------------------------------------------------------------------
// 1. Required exports
// ---------------------------------------------------------------------------
const REQUIRED_EXPORTS = [
  'connectMultiplayer',
  'sendMovement',
  'isConnected',
  'getRoom',
  'reconnectMultiplayer',
];

for (const name of REQUIRED_EXPORTS) {
  assert.ok(
    networkSource.includes(`export`) && networkSource.includes(name),
    `network.js must export '${name}'.`,
  );
}

// ---------------------------------------------------------------------------
// 2. Banned old-system handlers / senders
// ---------------------------------------------------------------------------
const BANNED_IDENTIFIERS = [
  'questCompleted',
  'samPhaseChanged',
  'districtCaptureChanged',
  'nodeInterferenceChanged',
  'districtControlStateChanged',
  'playerWarImpact',
  'duelRequested',
  'duelStarted',
  'duelActionSubmitted',
  'duelResolved',
  'duelEnded',
  'operationStarted',
  'operationResult',
  'covertState',
  'sendNodeInterference',
  'sendWarAction',
  'sendCovertPressureSync',
  'sendDeployOperative',
];

for (const id of BANNED_IDENTIFIERS) {
  assert.equal(
    networkSource.includes(id),
    false,
    `network.js must NOT contain old handler '${id}'. Strip old Block Topia systems.`,
  );
}

// ---------------------------------------------------------------------------
// 3. index.html wires Colyseus + connectMultiplayer
// ---------------------------------------------------------------------------
assert.ok(
  indexHtml.includes('colyseus'),
  'index.html must load the Colyseus client library.',
);
assert.ok(
  indexHtml.includes('connectMultiplayer'),
  'index.html must call connectMultiplayer.',
);
assert.ok(
  indexHtml.includes('bt-help-toggle'),
  'index.html should expose help panel collapse toggle.',
);
assert.ok(
  indexHtml.includes('setupHelpPanel'),
  'index.html should initialize persisted help panel behavior.',
);
assert.ok(
  indexHtml.includes('function safeGetStorage(') && indexHtml.includes('function safeSetStorage('),
  'index.html should guard localStorage access via safe helpers.',
);
assert.ok(
  indexHtml.includes('aria-controls="bt-controls-panel-body"'),
  'index.html help toggle should have aria-controls for panel body.',
);
assert.ok(
  indexHtml.includes('panelBody.hidden = collapsed'),
  'index.html should synchronize hidden state with collapsed help panel state.',
);
assert.equal(
  mainSource.includes('Arrow/WASD move | Click tile move | Space attack'),
  false,
  'main.js must not render old top-right controls hint text that overlaps the global badge.',
);
assert.ok(
  mainSource.includes('Mission 1: Survive ${surviveTotalSec}s') &&
  mainSource.includes('Mission 2: Neutralize ${runtime.mission.requiredKills} NPCs'),
  'main.js should derive mission HUD text from mission config values.',
);
const drawHudStart = mainSource.indexOf('function drawHud(');
const drawHudEnd = mainSource.indexOf('function drawFeedback(');
const drawHudBody = drawHudStart >= 0 && drawHudEnd > drawHudStart
  ? mainSource.slice(drawHudStart, drawHudEnd)
  : '';
assert.ok(
  drawHudBody.includes('const surviveTotalSec = Math.ceil(runtime.mission.surviveMs / 1000);'),
  'drawHud must define surviveTotalSec in its own scope before mission HUD text uses it.',
);
assert.ok(
  mainSource.includes('Extraction unlocked') && mainSource.includes('MISSION COMPLETE'),
  'main.js should include extraction unlock and mission complete feedback states.',
);
const localPlayerFnStart = mainSource.indexOf('function setLocalPlayer(');
const localPlayerFnEnd = mainSource.indexOf('function setRemotePlayer(');
const localPlayerFnBody = localPlayerFnStart >= 0 && localPlayerFnEnd > localPlayerFnStart
  ? mainSource.slice(localPlayerFnStart, localPlayerFnEnd)
  : '';
assert.equal(
  localPlayerFnBody.includes('ensureMissionStart('),
  false,
  'main.js should not start mission from setLocalPlayer.',
);
assert.ok(
  /setInputEnabled\(enabled\)\s*{[\s\S]*if \(runtime\.inputEnabled\) ensureMissionStart\(\);/.test(mainSource),
  'main.js should start mission through setInputEnabled(true).',
);
assert.ok(
  /const survivalDone = elapsed >= runtime\.mission\.surviveMs;[\s\S]*if \(!runtime\.mission\.extractionUnlocked && survivalDone && killDone\)/.test(mainSource),
  'main.js should unlock extraction only after both survival and kill objectives are done.',
);

console.log('Block Topia skeleton smoke checks passed.');
