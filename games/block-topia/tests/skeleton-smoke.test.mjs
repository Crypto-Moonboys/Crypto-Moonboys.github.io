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
  'sendExtract',
  'sendReady',
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
assert.ok(
  indexHtml.includes('const readySent = api.signalReady?.() === true;') &&
  indexHtml.includes('if (!readySent) {') &&
  indexHtml.includes('api.setInputEnabled?.(true);') &&
  indexHtml.includes('setReadySink(() => sendReady())'),
  'index.html start flow should send ready/startRun before gameplay starts.',
);
assert.equal(
  mainSource.includes('Arrow/WASD move | Click tile move | Space attack'),
  false,
  'main.js must not render old top-right controls hint text that overlaps the global badge.',
);
assert.ok(
  /Mission 1:\s*Survive \$\{surviveTotalSec\}s/.test(mainSource) &&
  /Neutralize \$\{runtime\.mission\.requiredKills\} NPCs/.test(mainSource),
  'main.js should derive mission HUD text from mission config values.',
);
function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) return '';
  const openBrace = source.indexOf('{', start);
  if (openBrace < 0) return '';

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

const drawHudBody = extractFunctionSource(mainSource, 'drawHud');
const tryAttackBody = extractFunctionSource(mainSource, 'tryAttack');
const pushFeedBody = extractFunctionSource(mainSource, 'pushFeed');
assert.ok(
  /const\s+surviveTotalSec\s*=\s*Math\.ceil\s*\(\s*runtime\.mission\.surviveMs\s*\/\s*1000\s*\)\s*;/.test(drawHudBody),
  'drawHud must define surviveTotalSec in its own scope before mission HUD text uses it.',
);
assert.ok(
  mainSource.includes('Extraction unlocked') && mainSource.includes('MISSION COMPLETE'),
  'main.js should include extraction unlock and mission complete feedback states.',
);
assert.ok(
  mainSource.includes('WAITING TO START - Press Start / Continue to enter the city'),
  'main.js should show a clear pre-start waiting HUD state.',
);
assert.ok(
  /function\s+shouldSuppressFeedMessage\s*\(/.test(mainSource) &&
  /normalized\.includes\('neutralized npc_'\)/.test(mainSource) &&
  /normalized\.includes\('was downed by npc_'\)/.test(mainSource) &&
  /normalized\.includes\('hit'\)/.test(mainSource),
  'main.js should suppress post-completion combat feed messages.',
);
assert.ok(
  /if\s*\(\s*runtime\.mission\.completed\s*\)\s*{[\s\S]*pushFeedback\(\s*MISSION_COMPLETE_MSG\s*,\s*MISSION_COMPLETE_TOAST_MS/.test(tryAttackBody) &&
  /if\s*\(\s*runtime\.mission\.completed\s*\)\s*{[\s\S]*return;/.test(tryAttackBody),
  'main.js should lock out local attack attempts after mission completion.',
);
assert.ok(
  /if\s*\(\s*runtime\.mission\.completed\s*\)\s*{[\s\S]*trySendExtractIntent\(\);/.test(tryAttackBody),
  'main.js should send extract intent when mission is already complete.',
);
assert.ok(
  /if\s*\(\s*shouldSuppressFeedMessage\s*\(\s*text\s*\)\s*\)\s*return;/.test(pushFeedBody),
  'main.js should suppress neutralized/downed combat feed spam after mission completion.',
);
assert.ok(
  mainSource.includes('drawMissionCompleteBanner') &&
  mainSource.includes('Run summary: Kills') &&
  mainSource.includes('const MISSION_COMPLETE_MSG =') &&
  mainSource.includes('const MISSION_COMPLETE_TOAST_MS =') &&
  mainSource.includes('const MISSION_COMPLETE_TOAST_THROTTLE_MS =') &&
  mainSource.includes('setExtractSink(fn)') &&
  mainSource.includes('setReadySink(fn)') &&
  mainSource.includes('signalReady()') &&
  mainSource.includes('readyRequested') &&
  mainSource.includes('shouldSuppressFeedMessage(message)'),
  'main.js should render a clear mission-complete banner and run summary.',
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
