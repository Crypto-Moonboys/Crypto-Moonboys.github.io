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
  'sendRestartRun',
  'sendChooseUpgrade',
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
  indexHtml.includes('bt-play-again-btn') && indexHtml.includes('sendRestartRun'),
  'index.html should expose Play Again and wire restartRun network intent.',
);
assert.ok(
  /id="bt-play-again-btn"[^>]*style="[^"]*display:none/.test(indexHtml) &&
  indexHtml.includes('syncNextLevelButton') &&
  indexHtml.includes('phase === "MISSION_COMPLETE"') &&
  !indexHtml.includes('phase === "RECOVERY" || phase === "MISSION_COMPLETE"') &&
  indexHtml.includes('Skip Recovery / Start Level'),
  'index.html should hide next-level control by default and gate it behind mission-complete phase only.',
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
assert.ok(
  indexHtml.includes('bt-upgrade-panel') &&
  indexHtml.includes('No upgrade choices received') &&
  indexHtml.includes('setChooseUpgradeSink') &&
  indexHtml.includes('sendChooseUpgrade') &&
  indexHtml.includes('phase !== "RECOVERY"'),
  'index.html should render upgrade choice controls, wire chooseUpgrade intent, and only show upgrade cards in RECOVERY.',
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
assert.ok(
  /const\s+hackProgress\s*=\s*Math\.min\([\s\S]*runtime\.world\.objectiveProgress/.test(mainSource) &&
  /Mission 2: Stand on the HACK TILE to charge signal \(\$\{hackProgress\}\/\$\{runtime\.world\.hackProgressTarget\}\)/.test(mainSource),
  'main.js SIGNAL_HACK HUD should use hack/objective progress, not neutralized kill count.',
);
assert.ok(
  /const\s+sharedHackProgress\s*=\s*Math\.min\([\s\S]*runtime\.world\.objectiveProgress/.test(mainSource) &&
  /const\s+killDone\s*=\s*runtime\.world\.objectiveType\s*===\s*'SIGNAL_HACK'[\s\S]*sharedHackProgress\s*>=\s*Number\(runtime\.world\.hackProgressTarget/.test(mainSource),
  'main.js SIGNAL_HACK mission completion logic should use shared world objective progress.',
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
const requestRestartRunStart = mainSource.indexOf('requestRestartRun() {');
const requestRestartRunEnd = requestRestartRunStart >= 0 ? mainSource.indexOf('getSnapshot()', requestRestartRunStart) : -1;
const requestRestartRunBody = requestRestartRunStart >= 0 && requestRestartRunEnd > requestRestartRunStart
  ? mainSource.slice(requestRestartRunStart, requestRestartRunEnd)
  : '';
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
  mainSource.includes('const PHASE_FREE_ROAM =') &&
  mainSource.includes('const PHASE_EVENT_ACTIVE =') &&
  mainSource.includes('function setWorldState(') &&
  mainSource.includes('PHASE ') &&
  mainSource.includes('EVENT ACTIVE'),
  'main.js should render shared world phase data from server state.',
);
assert.ok(
  mainSource.includes('function phaseJoinHint(') &&
  mainSource.includes('You joined during recovery. Next event soon.') &&
  mainSource.includes('Late join: event already in progress.'),
  'main.js should render phase-specific late-join guidance instead of a generic in-progress message.',
);
assert.ok(
  mainSource.includes('function formatCountdown(') &&
  mainSource.includes('Next Event: Patrol Sweep Level') &&
  mainSource.includes('starts in ${formatCountdown(phaseMsLeft)}'),
  'main.js should show next level preview and countdown during post-mission flow.',
);
assert.ok(
  drawHudBody.includes('const drawHudLine =') &&
  drawHudBody.includes('if (y > viewHeight - 12) return;'),
  'main.js should use bounded HUD row rendering for small view heights.',
);
assert.ok(
  /function\s+shouldSuppressFeedMessage\s*\(/.test(mainSource) &&
  /runtime\.world\.phase === PHASE_RECOVERY \|\| runtime\.world\.phase === PHASE_MISSION_COMPLETE/.test(mainSource) &&
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
  /runtime\.feedMeta\.lastMessage === text && now - runtime\.feedMeta\.lastAt < 5000/.test(pushFeedBody) &&
  /classWindowMs = classificationKey\.startsWith\('neutralized:'\) \|\| classificationKey\.startsWith\('downed:'\) \? 5000 : 3200/.test(pushFeedBody),
  'main.js should dedupe repeated combat feed messages for at least five seconds.',
);
assert.ok(
  mainSource.includes('function drawHackMarker()') &&
  mainSource.includes('SIGNAL CHARGING...') &&
  mainSource.includes('Hack complete - extract now.'),
  'main.js should render SIGNAL_HACK marker and clear hack-complete feedback.',
);
assert.ok(
  requestRestartRunBody.includes('runtime.restartRunSink') &&
  requestRestartRunBody.includes('Restart requested. Waiting for server...') &&
  !requestRestartRunBody.includes('runtime.mission = {'),
  'main.js should defer mission reset until server-confirmed world update.',
);
assert.ok(
  /runtime\.world\.eventLevel\s*>\s*prevLevel/.test(mainSource),
  'main.js should apply level progression reset on server-confirmed event-level increases.',
);
assert.ok(
  mainSource.includes('function resetMissionForActiveLevel()') &&
  mainSource.includes('runtime.mission.completed = false;') &&
  mainSource.includes('runtime.mission.completedAt = 0;') &&
  mainSource.includes('runtime.mission.extractionSent = false;'),
  'main.js should include a dedicated mission-state reset helper for new levels.',
);
assert.ok(
  mainSource.includes('leftCompletionWindow') &&
  mainSource.includes('prevPhase === PHASE_MISSION_COMPLETE || prevPhase === PHASE_RECOVERY') &&
  mainSource.includes('nextPhase === PHASE_FREE_ROAM || nextPhase === PHASE_WARNING || nextPhase === PHASE_EVENT_ACTIVE'),
  'main.js should reset mission state when phase exits mission-complete/recovery into active level phases.',
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
assert.ok(
  networkSource.includes('let _lastWorldEventLevel = 1;') &&
  networkSource.includes('eventLevel: _lastWorldEventLevel'),
  'network.js should preserve world eventLevel across partial system payloads.',
);

console.log('Block Topia skeleton smoke checks passed.');
