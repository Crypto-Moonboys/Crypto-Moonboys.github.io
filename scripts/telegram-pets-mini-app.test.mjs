import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { issuePetMiniAppChallenge, verifyPetMiniAppChallenge, verifyTelegramMiniAppInitData } from '../workers/moonboys-api/pets/mini-app-auth.js';
import { resolvePetCallbackRoute } from '../workers/moonboys-api/pets/mini-app-routing.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const encoder = new TextEncoder();
async function sign(keyBytes, value) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(value));
}
function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function buildInitData(botToken, user, authDate) {
  const fields = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAH-test-query',
    user: JSON.stringify(user),
  });
  const check = Array.from(fields.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await sign(encoder.encode('WebAppData'), botToken);
  fields.set('hash', hex(await sign(secret, check)));
  return fields.toString();
}

const token = '123456:test_bot_token';
const nowSeconds = 1_786_500_000;
const initData = await buildInitData(token, { id: 123456789, first_name: 'Pixel', username: 'pixel_runner' }, nowSeconds - 30);
const valid = await verifyTelegramMiniAppInitData(initData, token, { now_ms: nowSeconds * 1000, max_age_seconds: 3600 });
assert.equal(valid.ok, true);
assert.equal(valid.telegramId, '123456789');
assert.equal(valid.user.username, 'pixel_runner');

const tampered = initData.replace('pixel_runner', 'admin_runner');
assert.equal((await verifyTelegramMiniAppInitData(tampered, token, { now_ms: nowSeconds * 1000 })).ok, false);
const expired = await buildInitData(token, { id: 123456789 }, nowSeconds - 7200);
assert.equal((await verifyTelegramMiniAppInitData(expired, token, { now_ms: nowSeconds * 1000, max_age_seconds: 3600 })).reason, 'mini_app_auth_expired');
assert.equal((await verifyTelegramMiniAppInitData(`${initData}&user=%7B%7D`, token, { now_ms: nowSeconds * 1000 })).reason, 'mini_app_auth_duplicate_field');

// Modern Telegram clients include an Ed25519 `signature` field. It remains
// part of the bot-token HMAC data-check-string; only `hash` is excluded.
const telegramPublishedToken = '7342037359:AAHI25ES9xCOMPokpYoz-p8XVrZUdygo2J4';
const telegramPublishedInitData = 'user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%20%2B%20-%20%3F%20%5C%2F%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2F4FPEE4tmP3ATHa57u6MqTDih13LTOiMoKoLDRG4PnSA.svg%22%7D&chat_instance=8134722200314281151&chat_type=private&auth_date=1733509682&signature=TYJxVcisqbWjtodPepiJ6ghziUL94-KNpG8Pau-X7oNNLNBM72APCpi_RKiUlBvcqo5L-LAxIc3dnTzcZX_PDg&hash=a433d8f9847bd6addcc563bff7cc82c89e97ea0d90c11fe5729cae6796a36d73';
const modernSigned = await verifyTelegramMiniAppInitData(telegramPublishedInitData, telegramPublishedToken, { now_ms: 1733509702 * 1000 });
assert.equal(modernSigned.ok, true);
assert.equal(modernSigned.telegramId, '279058397');
assert.equal((await verifyTelegramMiniAppInitData(telegramPublishedInitData.replace('chat_type=private', 'chat_type=sender'), telegramPublishedToken, { now_ms: 1733509702 * 1000 })).reason, 'mini_app_auth_rejected');

const challenge = await issuePetMiniAppChallenge({ type: 'event', telegram_id: '123456789', encounter_key: 'street_cache', event_key: 'street_cache-nonce' }, token, { now_ms: nowSeconds * 1000 });
const verifiedChallenge = await verifyPetMiniAppChallenge(challenge, token, { type: 'event', telegram_id: '123456789' }, { now_ms: nowSeconds * 1000 });
assert.equal(verifiedChallenge.ok, true);
assert.equal(verifiedChallenge.payload.event_key, 'street_cache-nonce');
assert.equal((await verifyPetMiniAppChallenge(challenge, token, { type: 'event', telegram_id: '987654321' }, { now_ms: nowSeconds * 1000 })).reason, 'mini_app_challenge_mismatch');
assert.equal((await verifyPetMiniAppChallenge(challenge.slice(0, -1) + (challenge.endsWith('a') ? 'b' : 'a'), token, { type: 'event', telegram_id: '123456789' }, { now_ms: nowSeconds * 1000 })).ok, false);
assert.equal((await verifyPetMiniAppChallenge(challenge, token, { type: 'event', telegram_id: '123456789' }, { now_ms: (nowSeconds + 901) * 1000 })).reason, 'mini_app_challenge_expired');

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../moonpet-game.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
const apiConfig = fs.readFileSync(new URL('../js/api-config.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/moonpet-mini-app.css', import.meta.url), 'utf8');
const guide = fs.readFileSync(new URL('../how-to-play-crypto-moonboy-pets.html', import.meta.url), 'utf8');
const arcadeRadio = fs.readFileSync(new URL('../js/arcade/core/radio.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../workers/moonboys-api/schema.sql', import.meta.url), 'utf8');

function extractTestExport(source, name) {
  const startMarker = `// TEST-EXPORT: ${name}:start`;
  const endMarker = `// TEST-EXPORT: ${name}:end`;
  const start = source.indexOf(startMarker);
  if (start === -1) return null;
  const bodyStart = source.indexOf('\n', start + startMarker.length);
  if (bodyStart === -1) return null;
  const end = source.indexOf(endMarker, bodyStart + 1);
  if (end === -1) return null;
  return source.slice(bodyStart + 1, end);
}

const TEST_EXPORT_NAMES = [
  'seasonTiming', 'callsignDraft', 'stateRequestGate', 'phase4PresenceDirector',
  'combatDirector', 'lifecycleCeremonyStarter', 'lifecycleDirector',
];
for (const name of TEST_EXPORT_NAMES) {
  for (const newline of ['\n', '\r\n']) {
    const synthetic = [
      `  // TEST-EXPORT: ${name}:start`,
      '    function independentlyExecutable() { return true; }',
      `\t// TEST-EXPORT: ${name}:end`,
    ].join(newline);
    const extracted = extractTestExport(synthetic, name);
    assert.ok(extracted, `${name} extraction must support ${newline === '\n' ? 'LF' : 'CRLF'} and indented markers`);
    assert.equal(Function(`"use strict";${extracted}; return independentlyExecutable();`)(), true, `${name} synthetic export must remain executable`);
  }
}
assert.equal(extractTestExport('// TEST-EXPORT: sample:end\nfunction sample() {}', 'sample'), null, 'a missing start marker must fail clearly');
assert.equal(extractTestExport('// TEST-EXPORT: sample:start\nfunction sample() {}', 'sample'), null, 'a missing end marker must fail clearly');

const seasonTimingSource = extractTestExport(client, 'seasonTiming');
assert.ok(seasonTimingSource, 'seasonTiming source must remain independently testable');
const seasonTiming = Function(`"use strict";${seasonTimingSource}\nreturn seasonTiming;`)();
const callsignDraftSource = extractTestExport(client, 'callsignDraft');
assert.ok(callsignDraftSource, 'callsign draft helpers must remain independently testable');
const crlfClient = client.replace(/\r?\n/g, '\r\n');
const crlfSeasonTimingSource = extractTestExport(crlfClient, 'seasonTiming');
const crlfCallsignDraftSource = extractTestExport(crlfClient, 'callsignDraft');
assert.equal(typeof Function(`"use strict";${crlfSeasonTimingSource}\nreturn seasonTiming;`)(), 'function', 'the real seasonTiming export must execute after CRLF conversion');
assert.doesNotThrow(
  () => Function('state', 'document', `"use strict"; var renderedPetId = null; var renderedPetName = ''; ${crlfCallsignDraftSource}`),
  'the real callsignDraft export must compile after CRLF conversion',
);
for (const name of TEST_EXPORT_NAMES) {
  const source = extractTestExport(crlfClient, name);
  assert.ok(source, `the real ${name} export must remain extractable after CRLF conversion`);
  assert.doesNotThrow(() => Function(`"use strict";${source}`), `the real ${name} export must compile after CRLF conversion`);
}
const draftState = { pet: { pet_id: 'pet-a', pet_name: 'Server A' } };
let mountedCallsignInput = null;
const draftDocument = {
  activeElement: null,
  getElementById: () => mountedCallsignInput,
};
const draftHelpers = Function('state', 'document', `"use strict";
  var renderedPetId = null;
  var renderedPetName = '';
  ${callsignDraftSource}
  return {
    captureEditableState,
    restoreEditableState,
    setRenderedPet(pet) {
      renderedPetId = pet && pet.pet_id || null;
      renderedPetName = String(pet && pet.pet_name || '');
    },
  };
`)(draftState, draftDocument);
function callsignInput(value, selectionStart = 0, selectionEnd = 0) {
  return {
    value, selectionStart, selectionEnd, focused: false, selectionRestored: false,
    focus() { this.focused = true; },
    setSelectionRange(start, end) { this.selectionRestored = true; this.selectionStart = start; this.selectionEnd = end; },
  };
}

mountedCallsignInput = callsignInput('Local A', 2, 5);
draftDocument.activeElement = mountedCallsignInput;
draftHelpers.setRenderedPet(draftState.pet);
const dirtySamePetDraft = draftHelpers.captureEditableState();
assert.deepEqual(
  { petId: dirtySamePetDraft.petId, value: dirtySamePetDraft.value, dirty: dirtySamePetDraft.dirty, focused: dirtySamePetDraft.focused },
  { petId: 'pet-a', value: 'Local A', dirty: true, focused: true },
  'dirty callsign drafts must capture ownership and focus for the active pet instance',
);
draftState.pet = { pet_id: 'pet-a', pet_name: 'Server A refreshed' };
mountedCallsignInput = callsignInput('Server A refreshed');
draftHelpers.restoreEditableState(dirtySamePetDraft);
assert.equal(mountedCallsignInput.value, 'Local A', 'a dirty draft must survive a background refresh for the same pet');
assert.equal(mountedCallsignInput.selectionRestored, true, 'a same-pet dirty draft must restore its valid selection');

draftState.pet = { pet_id: 'pet-a', pet_name: 'Server A' };
mountedCallsignInput = callsignInput('Server A');
draftHelpers.setRenderedPet(draftState.pet);
const cleanDraft = draftHelpers.captureEditableState();
draftState.pet.pet_name = 'New canonical A';
mountedCallsignInput = callsignInput('New canonical A');
draftHelpers.restoreEditableState(cleanDraft);
assert.equal(mountedCallsignInput.value, 'New canonical A', 'a clean input must not overwrite a newer canonical callsign');

draftState.pet = { pet_id: 'pet-b', pet_name: 'Server B' };
mountedCallsignInput = callsignInput('Server B');
draftHelpers.restoreEditableState(dirtySamePetDraft);
assert.equal(mountedCallsignInput.value, 'Server B', 'a draft owned by Pet A must not cross an active switch to Pet B');

draftState.pet = { pet_id: 'pet-b', pet_name: 'Server Normalized B' };
mountedCallsignInput = callsignInput('Server Normalized B');
draftHelpers.restoreEditableState(null);
assert.equal(mountedCallsignInput.value, 'Server Normalized B', 'discarding an accepted rename draft must leave the server-normalized callsign visible');

const unsafeSelectionDraft = { petId: 'pet-b', value: 'Local B', dirty: true, focused: true, selectionStart: null, selectionEnd: undefined };
draftHelpers.restoreEditableState(unsafeSelectionDraft);
assert.equal(mountedCallsignInput.value, 'Local B', 'a dirty same-pet draft still restores when selection metadata is unavailable');
assert.equal(mountedCallsignInput.selectionRestored, false, 'selection restoration must be skipped unless both offsets are numbers');
draftState.pet = { pet_id: null, pet_name: 'Unidentified canonical pet' };
mountedCallsignInput = callsignInput('Unidentified canonical pet');
draftHelpers.restoreEditableState({ ...unsafeSelectionDraft, petId: null, value: 'Unowned draft' });
assert.equal(mountedCallsignInput.value, 'Unidentified canonical pet', 'a draft without an authoritative pet_id must never be restored');
mountedCallsignInput = null;
assert.equal(draftHelpers.captureEditableState(), null, 'draft capture must remain safe when the callsign input is not mounted');
assert.doesNotThrow(() => draftHelpers.restoreEditableState(unsafeSelectionDraft), 'draft restoration must remain safe when the callsign input is not mounted');
const originalDateNow = Date.now;
Date.now = () => Date.parse('2099-12-31T23:59:59.000Z');
try {
  const authoritativeTiming = seasonTiming({
    start_at: '2026-01-01T00:00:00.000Z',
    end_at: '2026-04-01T00:00:00.000Z',
    current_at: '2026-01-10T12:00:00.000Z',
  });
  assert.equal(authoritativeTiming.status, 'ACTIVE', 'server current_at must control season phase despite an incorrect client clock');
  assert.equal(authoritativeTiming.day, 10, 'server current_at must control displayed season position');
  assert.equal(authoritativeTiming.remaining, 81, 'server current_at must control displayed remaining days');
  const advancedTiming = seasonTiming({
    start_at: '2026-01-01T00:00:00.000Z',
    end_at: '2026-04-01T00:00:00.000Z',
    current_at: '2026-01-10T12:00:00.000Z',
  }, 2 * 86400000);
  assert.equal(advancedTiming.day, 12, 'monotonic elapsed time must keep an open app season position advancing');
  assert.equal(advancedTiming.remaining, 79, 'monotonic elapsed time must keep an open app remaining time advancing');
  const refreshedTiming = seasonTiming({
    start_at: '2026-01-01T00:00:00.000Z',
    end_at: '2026-04-01T00:00:00.000Z',
    current_at: '2026-01-20T00:00:00.000Z',
  }, 0);
  assert.equal(refreshedTiming.day, 20, 'a refreshed server snapshot must reset the elapsed offset from its new current_at');
  assert.equal(seasonTiming({
    start_at: '2026-02-01T00:00:00.000Z',
    end_at: '2026-05-01T00:00:00.000Z',
    current_at: '2026-01-31T23:59:59.000Z',
  }).status, 'UPCOMING', 'server current_at before start_at must control the UPCOMING state');
  assert.equal(seasonTiming({
    start_at: '2026-01-01T00:00:00.000Z',
    end_at: '2026-04-01T00:00:00.000Z',
    current_at: '2026-04-01T00:00:00.000Z',
  }).status, 'COMPLETE', 'server current_at at end_at must control the COMPLETE state');
} finally {
  Date.now = originalDateNow;
}

const stateRequestGateSource = extractTestExport(client, 'stateRequestGate');
assert.ok(stateRequestGateSource, 'state request freshness gate must remain independently testable');
const createStateRequestGate = Function(`"use strict";${stateRequestGateSource}\nreturn createStateRequestGate;`)();
const stateRequestGate = createStateRequestGate();
let renderedState = { revision: 'initial' };
let resolveRefresh;
let resolveAction;
const refreshGeneration = stateRequestGate.begin();
const staleRefresh = new Promise((resolve) => { resolveRefresh = resolve; }).then((snapshot) => {
  if (stateRequestGate.isCurrent(refreshGeneration)) renderedState = snapshot;
});
const actionGeneration = stateRequestGate.begin();
const newerAction = new Promise((resolve) => { resolveAction = resolve; }).then((snapshot) => {
  if (stateRequestGate.isCurrent(actionGeneration)) renderedState = snapshot;
});
resolveAction({ revision: 'action-result' });
await newerAction;
assert.equal(renderedState.revision, 'action-result', 'the latest action response must update rendered state');
resolveRefresh({ revision: 'stale-refresh' });
await staleRefresh;
assert.equal(renderedState.revision, 'action-result', 'an older background refresh must not overwrite a newer action result');
assert.match(client, /function setStateSnapshot\(nextState, requestGeneration\)[\s\S]*stateRequestGate\.isCurrent\(requestGeneration\)/, 'all state snapshots must pass the request freshness gate');
assert.match(client, /function runAction[\s\S]*requestGeneration = beginStateRequest\(\)[\s\S]*post\('\/telegram-pets\/app\/action'/, 'actions must invalidate state requests that began earlier');

assert.match(worker, /path === '\/telegram-pets\/app\/state'.*request\.method === 'POST'/s);
assert.match(worker, /path === '\/telegram-pets\/app\/action'.*request\.method === 'POST'/s);
assert.match(worker, /verifyTelegramMiniAppInitData\(body\.init_data/);
assert.match(worker, /const MOONPET_MINI_APP_URL = `\$\{SITE_URL\}\/moonpet-game\.html\?v=20260814-moonpet-aaa-pass`/);
assert.match(worker, /function petMiniAppLaunchUrl/);
assert.match(worker, /const url = petMiniAppLaunchUrl\(screen, normalizedFocus\)/);
assert.match(worker, /setChatMenuButton/);
assert.match(worker, /Chat gameplay controls are retired/);
assert.equal(resolvePetCallbackRoute('pet:feed', true), 'mini_app', 'enabled callbacks must open only the Mini App launcher');
assert.equal(resolvePetCallbackRoute('pet:feed', false), 'legacy', 'disabled callbacks must reach legacy gameplay routing');
assert.equal(resolvePetCallbackRoute('other:feed', true), 'ignore');
assert.match(worker, /const PET_MINI_APP_COMMANDS = new Set\(\[\s*'moonpet',/, 'literal /moonpet command must open the Mini App launcher');
assert.match(worker, /isPetMiniAppCommand\(cmdBase\)/, 'Mini App commands must be intercepted before legacy routing');
assert.ok(
  worker.indexOf("if (env.PET_MINI_APP_ENABLED === 'true'") < worker.indexOf('const legacyPetGameplayCommands'),
  'enabled Mini App routing must precede the legacy egg gate',
);
assert.match(worker, /petmissions: 'missions'/);
assert.match(worker, /petarena: 'explore'/);
assert.match(worker, /petwork: 'work'/);
assert.match(worker, /petshop: 'economy'/);
assert.match(worker, /petleaderboard: 'profile'/);
assert.match(worker, /petcoach: 'home'/);
assert.match(worker, /payload === 'menu:management'.*return 'economy'/);
// Legacy timed-activity buttons must land beside the equivalent Mini App activity controls.
assert.match(worker, /\^\(work\|activity\|job\|start:\|claim\$\|cancel\$\)/);
assert.match(worker, /petMiniAppDestinationForCallback\(data\)/);
assert.match(worker, /isPetMiniAppStartArgument\(argStr\)/);
assert.match(worker, /start=moonpet_\$\{screen\}/);
assert.match(worker, /system_key = 'equipment_upgrade'/);
// Upgrade mission credit follows completion time, not the earlier reservation timestamp.
assert.match(worker, /updated_at >= \? AND updated_at < \?/);
assert.match(worker, /equipmentUpgradeCount/);
assert.doesNotMatch(worker, /date\(created_at\) = \?/);
assert.match(worker, /counts\.district_mission/);
assert.match(client, /DAILY MISSION BUFFER \/\/ /);
assert.match(client, /meter\('DAILY CLEAR', missionPercent\)/);
assert.match(html, /id="utility-layer"/);
assert.match(html, /\/css\/moonpet-mini-app\.css\?v=20260816-season-roster-state-gate/);
assert.match(html, /role="button" aria-label="Interact with your animated Moonpet"/);
assert.match(client, /data-utility="guide">HOW TO PLAY/);
assert.match(client, /data-utility="leaderboard">LEADERBOARD/);
assert.match(client, /data-utility="sync">REFRESH/);
assert.match(client, /data-utility="audio" aria-pressed=/);
assert.match(client, /data-utility="audio"[\s\S]*data-utility="radio"/, 'radio control must sit next to audio');
assert.match(client, /data-utility="radio" aria-pressed=/);
assert.match(client, /import\('\/js\/arcade\/core\/radio\.js\?v=20260814-moonpet-aaa-pass'\)/);
assert.match(client, /new Audio\(radio\.ARCADE_RADIO_URL\)/);
assert.match(client, /arcade_radio_on/);
assert.match(client, /else if \(utility\.dataset\.utility === 'radio'\) toggleRadio\(\)/);
assert.match(client, /var radioRequestGeneration = 0/);
assert.match(client, /radioRequestedOn = Boolean\(on\)/);
assert.match(client, /setRadioEnabled\(!radioRequestedOn, true\)/);
assert.match(client, /var requestGeneration = \+\+radioRequestGeneration/);
assert.match(client, /requestGeneration !== radioRequestGeneration[\s\S]*await player\.play\(\)[\s\S]*requestGeneration !== radioRequestGeneration/);
assert.match(client, /window\.addEventListener\('pagehide'[\s\S]*radioRequestGeneration \+= 1;[\s\S]*radioPlayer\.pause\(\)/);
assert.match(client, /window\.addEventListener\('pageshow'[\s\S]*event\.persisted && radioRequestedOn[\s\S]*setRadioEnabled\(true, false\)/);
assert.doesNotMatch(client, /radioPlayer\.src = ''/, 'BFCache teardown must preserve the stream source');
assert.match(arcadeRadio, /export const ARCADE_RADIO_URL = 'https:\/\/stream\.radiojar\.com\/2qm1fc5kb'/);
assert.match(arcadeRadio, /export const ARCADE_RADIO_STORAGE_KEY = 'arcade_radio_on'/);
assert.match(client, /function playAudioCue\(kind\)/);
assert.match(client, /window\.AudioContext \|\| window\.webkitAudioContext/);
assert.match(client, /moonpet-audio/);
assert.match(client, /else if \(utility\.dataset\.utility === 'audio'\) toggleAudio\(\)/);
assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
assert.match(client, /RETRY CONNECTION/);
assert.match(client, /OPEN MOONPET OS IN TELEGRAM/);
assert.match(client, /https:\/\/t\.me\/WIKICOMSBOT\?start=moonpet/);
assert.match(css, /\.terminal-link-button/);
for (const token of ['--cyan:', '--green:', '--muted:']) assert.match(css, new RegExp(token), `${token} must be defined before combat UI uses it`);
assert.match(client, /data-panel-jump/);
assert.match(client, /data-pet-greet>SAY HELLO/);
assert.match(client, /\/telegram-pets\/app\/leaderboard/);
assert.match(client, /requestedFocus = launchParameter\('focus'\)/);
assert.match(client, /stickyInset = rail \? Math\.max\(0, rail\.getBoundingClientRect\(\)\.bottom - screenRect\.top\)/);
assert.match(client, /generation !== utilityRequestGeneration \|\| utilityLayer\.hidden \|\| activeUtility !== 'leaderboard'/);
assert.match(client, /event\.key !== 'Tab'/);
assert.match(client, /utilityLayer\.contains\(current\)/);
assert.match(worker, /path === '\/telegram-pets\/app\/leaderboard'.*request\.method === 'POST'/s);
assert.match(worker, /ROW_NUMBER\(\) OVER/);
assert.match(worker, /bind\(\.\.\.scoreBindings, limit, String\(telegramId\)\)\.all\(\);/);
assert.doesNotMatch(worker, /bind\(\.\.\.scoreBindings, limit, String\(telegramId\)\)\.all\(\)\.catch/);
assert.match(worker, /is_current:/);
assert.match(worker, /petMiniAppFocusForCommand/);
assert.match(worker, /petMiniAppFocusForCallback/);
assert.match(worker, /petcoach: 'recommended'/);
assert.match(worker, /payload === 'coach'.*return 'recommended'/);
assert.match(worker, /payload === 'details'.*return 'details'/);
assert.match(worker, /&focus=\$\{focus\}/);
assert.match(worker, /petleaderboard: 'leaderboard'/);
assert.match(worker, /resolvePetCallbackRoute\(data, env\.PET_MINI_APP_ENABLED\) === 'mini_app'/);
assert.ok(worker.indexOf("if (data.startsWith('pet:')") < worker.indexOf("const payload = data.slice(4)"), 'Mini App interception must precede legacy gameplay routing');
assert.match(worker, /issuePetMiniAppChallenge/);
assert.match(worker, /verifyPetMiniAppChallenge/);
assert.match(client, /challenge_token: encounter\.challenge_token/);
assert.match(client, /challenge_token: adventure\.challenge_token/);
assert.match(html, /<script data-cfasync="false" src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/);
assert.match(apiConfig, /PRODUCTION_BASE_URL = 'https:\/\/api\.cryptomoonboys\.com'/);
assert.match(client, /apiConfig\.BASE_URL \|\| 'https:\/\/api\.cryptomoonboys\.com'/);
assert.match(html, /\/js\/api-config\.js\?v=20260813-first-party-api/);
assert.match(html, /\/js\/moonpet-mini-app\.js\?v=20260816-season-roster-state-gate/);
// Season slot UI: timing, account/pet separation, unlock affordance, switching, and rejection copy.
assert.match(client, /function renderSeasonSlots\(\)/, 'Mini App must render a focused season-slot summary');
assert.match(client, /function render\(options\) \{\s*var editableState = options && options\.discardCallsignDraft \? null : captureEditableState\(\);[\s\S]*restoreEditableState\(editableState\);/, 'render must preserve only drafts that were not explicitly discarded');
assert.match(client, /render\(\{ discardCallsignDraft: action === 'rename' && Boolean\(data\.result && data\.result\.accepted\) \}\)/, 'an accepted rename must discard the old draft so the server-normalized callsign wins');
assert.match(callsignDraftSource, /petId: renderedPetId[\s\S]*dirty: input\.value !== renderedPetName/, 'draft capture ownership must come from the snapshot that rendered the existing DOM');
const renderSource = client.slice(client.indexOf('  function render(options)'), client.indexOf('  function resultRewardMap'));
assert.ok(renderSource.indexOf('captureEditableState()') < renderSource.indexOf('renderedPetId = state'), 'render must capture the old DOM before recording the incoming snapshot identity');
assert.ok(renderSource.indexOf('restoreEditableState(editableState)') < renderSource.indexOf('renderedPetId = state'), 'rendered snapshot identity must advance only after draft restoration is decided');
for (const [pathName, startMarker, endMarker] of [
  ['syncState', '  async function syncState()', '  function applyRequestedFocus'],
  ['passive refresh', '  async function refreshLiveState()', '  async function refreshSeasonSnapshot'],
]) {
  const pathSource = client.slice(client.indexOf(startMarker), client.indexOf(endMarker, client.indexOf(startMarker)));
  assert.match(pathSource, /setStateSnapshot\([\s\S]*render\(/, `${pathName} must render through snapshot-owned draft capture after accepting state`);
  assert.doesNotMatch(pathSource, /renderedPetId\s*=|renderedPetName\s*=/, `${pathName} must not relabel the existing DOM with incoming snapshot identity before render captures it`);
}
assert.match(client, /function seasonTiming\(season, elapsedMs\)/, 'season status must derive position from an authoritative server snapshot plus monotonic elapsed time');
assert.match(client, /Date\.parse\(season && season\.current_at/, 'season timing must consume the server timestamp');
assert.doesNotMatch(seasonTimingSource, /Date\.now\(/, 'season timing must not depend on the browser clock');
assert.match(client, /seasonSnapshotReceivedAt = performance\.now\(\)/, 'client must record snapshot receipt with a monotonic clock');
assert.match(client, /seasonTiming\(season, seasonSnapshotElapsed\(\)\)/, 'season rendering must advance from the server snapshot using monotonic elapsed time');
assert.match(client, /setInterval\(tickSeasonDisplay, 30000\)/, 'open apps must periodically advance and refresh season presentation');
assert.match(client, /visibilitychange[\s\S]*refreshSeasonSnapshot\(true\)/, 'returning to the app must refresh the authoritative season snapshot');
assert.match(client, /YEAR-END PARTIAL.*90-DAY TARGET/, 'season status must distinguish a shortened runtime season from the target cycle');
assert.match(client, /SEASON STATUS \/\/ LIVE/, 'season panel must label current runtime timing as live');
assert.match(client, /PET PROGRESSION[\s\S]*SEASON PROGRESSION/, 'season UI must separate pet-instance progression from account seasonal progression');
assert.match(client, /seasonal XP[\s\S]*tiers[\s\S]*account leaderboard status/, 'account seasonal values must not be presented as pet-instance fields');
assert.match(client, /\[1, 2, 3\]\.map/, 'slot summary must always materialize all three seasonal slots');
assert.match(client, /CURRENT ARCADE XP/, 'slot summary must display the shared Arcade XP balance');
assert.match(client, /PET 1 IS FREE \/\/ PET 2 REQUIRES 500 XP \/\/ PET 3 REQUIRES 1,000 XP/, 'slot costs must match live community XP unlock rules');
assert.match(client, /data-season-slot=/, 'each rendered slot must expose its slot number');
assert.match(client, /unlockEnabled \? button\('UNLOCK SLOT ' \+ slotNumber, 'buy_pet_slot', \{ slot_number: slotNumber \}/, 'unlock controls must use the existing authenticated slot action');
assert.match(client, /disabled: !affordable/, 'unaffordable slot unlocks must be disabled');
assert.match(client, /NEED ' \+ number\(Math\.max\(0, cost - available\)\) \+ ' MORE ARCADE XP'/, 'disabled unlocks must explain the XP shortfall');
assert.match(client, /You have earned Arcade XP from community play/, 'locked slots must explain the earned community progression model');
assert.doesNotMatch(client, /BUY SLOT|PURCHASE OFFLINE/, 'player-facing slot UI must not use payment language');
assert.match(client, /owned \? button\('SWITCH TO SLOT ' \+ slotNumber, 'switch_pet_slot', \{ pet_id: slot\.pet_id, slot_number: slotNumber \}\)/, 'owned inactive slots must dispatch switch_pet_slot');
assert.match(client, /active \? '<strong class="slot-active-marker"/, 'active slots must show a marker instead of a switch control');
assert.match(client, /function renderPetInstanceCard\(slot\)/, 'owned slots must use a reusable pet-instance card');
for (const field of ['SPECIES', 'VARIANT', 'LIFECYCLE', 'LEVEL', 'PET XP', 'HEALTH', 'ENERGY']) {
  assert.match(client, new RegExp(field), `pet-instance cards must expose ${field}`);
}
for (const reason of ['insufficient_arcade_xp', 'pet_slot_already_owned', 'pet_slot_not_switchable', 'pet_activity_active', 'pet_run_active', 'pet_arena_active', 'pet_kaiju_active', 'season_slots_unavailable']) {
  assert.match(client, new RegExp(`${reason}:`), `Mini App must explain ${reason}`);
}
assert.match(worker, /LEFT JOIN telegram_pet_instances i[\s\S]*lifecycle_species_id/, 'slot summaries must include owned pet identity details');
assert.match(worker, /pet: unlocked \? \{[\s\S]*name:[\s\S]*species:[\s\S]*variant:[\s\S]*stage:[\s\S]*level:[\s\S]*pet_xp:[\s\S]*health:[\s\S]*energy:/, 'serialized owned slots must expose complete pet-card fields');
// Season slots panel must be reachable during egg phase (slot controls cannot be hidden behind the egg early-return).
assert.match(client, /phase === 'egg'[\s\S]{1,3000}renderSeasonSlots\(\)/, 'season slot panel must render during egg phase so players can view and switch slots');
// Arcade XP zero must not be treated as missing — nullish checks are required.
assert.match(client, /arcade_xp_available != null/, 'arcade_xp_available zero must not fall back via || operator');
assert.match(client, /launchParameter\('tgWebAppData'\)/);
assert.match(client, /await waitForTelegramContext\(\)/);
assert.match(worker, /Object\.prototype\.hasOwnProperty\.call\(PET_ARENA_MOVES, move\)/);
assert.match(worker, /FROM telegram_pet_run_rooms/);
assert.match(worker, /key: choice\.choice_id/);
assert.match(worker, /telegramId: verified\.telegramId/);
assert.match(client, /EQUIPMENT PROGRESSION/);
assert.match(client, /notification_set/);
assert.match(worker, /attachPetMiniAppReaction/);
assert.match(worker, /selectMoonpetReaction\(db, telegramId, context/);
assert.match(worker, /action === 'guidance_ack'/);
assert.match(worker, /PET_MINI_APP_ARENA_LOBBY = 'mini:arena:global'/);
assert.match(worker, /action === 'arena_matchmake'/);
assert.match(worker, /action === 'arena_ready'/);
assert.match(worker, /action === 'kaiju_matchmake'/);
assert.match(client, /FIND PLAYER BATTLE/);
assert.match(client, /FIND KAIJU PLAYER/);
assert.match(client, /showPendingNotices/);
assert.match(client, /MOONPET: /);
assert.match(client, /COMPANION DETAILS/);
assert.match(client, /data-focus=/);
assert.match(client, /setInterval\(refreshLiveState, 5000\)/);
assert.match(worker, /buildPetMiniAppLaunchReplyMarkup\(alert\.destination/);
assert.doesNotMatch(worker, /Notifications: \/petnotify off\nStatus: \/pet/);
assert.match(client, /filter\(function \(item\) \{ return Number\(item\.count \|\| item\.quantity \|\| 0\) > 0;/);
assert.doesNotMatch(html, /id="moonpet-app"[^>]*aria-live/);
assert.match(worker, /return err\('mini_app_action_failed', 500\)/);

assert.doesNotMatch(html, /<img\b/i);
const gameSurfaceWithoutRequiredFavicon = html.replace(/<link\s+rel="icon"\s+type="image\/png"\s+href="\/favicon\.png">/i, '');
assert.doesNotMatch(gameSurfaceWithoutRequiredFavicon + client + css, /\.(?:jpe?g|png|gif|webp|svg)(?:[?#"'])/i);
assert.match(html, /moonpet-canvas/);
assert.match(client, /requestAnimationFrame\(frame\)/);
assert.match(client, /if \(reducedMotion\) return/);
assert.match(client, /fillRect/);
assert.doesNotMatch(client, /new Image\s*\(/);
assert.match(client, /typeBoot/);
assert.match(client, /actionAnimationFamily/);
assert.match(client, /key === 'activity_start'.*payload && payload\.activity_type/);
assert.match(client, /key === 'activity_claim'.*return 'celebrate'/);
assert.match(client, /key === 'activity_cancel'.*return 'interact'/);
assert.match(client, /animateAction\(action, true, 8000, payload\)/);
assert.match(client, /animateAction\(action, Boolean\(data\.result && data\.result\.accepted\), 2800, payload\)/);
assert.match(client, /var actionResultHoldMs = 3600/);
assert.match(client, /hold: actionResultHoldMs/);
assert.match(client, /hold: 2200/);
assert.match(client, /function createPetPalette/);
assert.match(client, /var PET_APPEARANCE_PALETTES =/);
assert.match(client, /var PET_SPECIES_PALETTES =/);
assert.match(client, /var DEFAULT_PET_PALETTE = createPetPalette/);
assert.match(client, /function petPalette/);
assert.match(client, /return stage >= 4 \? selected\.legendary : selected\.normal/);
const petPaletteSource = client.slice(client.indexOf('function petPalette'), client.indexOf('function petPose'));
assert.doesNotMatch(petPaletteSource, /var palettes|var species|\[[^\]]*,[^\]]*,[^\]]*\]/, 'per-frame palette lookup must not allocate tables or colour arrays');
assert.match(client, /function petPose/);
assert.match(client, /function drawRaccoon/);
assert.match(client, /function drawRam/);
assert.match(client, /function drawGecko/);
assert.match(client, /function drawCrab/);
assert.match(client, /function drawFox/);
assert.match(client, /function drawSnail/);
assert.match(client, /function drawDrake/);
assert.match(client, /function drawFerret/);
assert.match(client, /function drawRareMorphShell/);
assert.match(client, /Celestial Serpent/);
assert.match(client, /Crown Beast/);
assert.match(client, /Boombox Kaiju/);
assert.match(client, /Graffiti Guardian/);
assert.match(client, /function drawPetMarking/);
assert.match(client, /function drawPetEyes/);
assert.match(client, /function drawEquipmentLayers/);
assert.match(client, /equipped_outfit/);
assert.match(client, /equipped_armor/);
assert.match(client, /equipped_weapon/);
assert.match(client, /equipped_charm/);
assert.match(client, /function drawCosmeticLayers/);
assert.match(client, /profile_frame/);
assert.match(client, /victory_pose/);
assert.match(client, /run_trail/);
assert.match(client, /var WORLD_SCENES =/);
for (const scene of ['home', 'missions', 'explore', 'work', 'economy', 'profile']) {
  assert.match(client, new RegExp(scene + ": \\{ label:"), `Phase 2 must include the ${scene} world scene`);
}
assert.match(client, /MOONBLOCK ROOFTOP/);
assert.match(client, /QUEST UNDERPASS/);
assert.match(client, /NEON RUN ALLEY/);
assert.match(client, /SCRAP YARD 85/);
assert.match(client, /CHAIN MARKET/);
assert.match(client, /ALL-CITY HEIGHTS/);
assert.match(client, /function drawWorldSky/);
assert.match(client, /var driftPhase = reducedMotion \? 0 : Math\.floor\(time \/ 2400\)/);
assert.match(client, /var starSpeed = star % 3 === 0 \? 1 : 0\.35/);
assert.match(client, /\(WORLD_STAR_X\[star\] \+ driftPhase \* starSpeed\) % 320/);
assert.doesNotMatch(client, /Math\.floor\(time \/ 2400\) % 320/, 'star drift phase must remain unbounded before per-star speed is applied');
assert.match(client, /function drawWorldSkyline/);
assert.match(client, /function drawGraffitiTag/);
assert.match(client, /function drawGraffitiWall/);
assert.match(client, /function drawWorldLandmarks/);
for (const scene of ['home', 'missions', 'explore', 'work', 'economy', 'profile']) {
  assert.match(client, new RegExp("sceneKey === '" + scene + "'"), `Phase 2 must draw a distinct ${scene} landmark silhouette`);
}
assert.match(client, /drawWorldLandmarks\(activeScreen, scene\)/);
assert.match(client, /var drift = reducedMotion \? 0 : Math\.round\(Math\.sin\(time \/ 3600\) \* 4\)/);
assert.doesNotMatch(client, /Math\.floor\(time \/ 180\) % 36/, 'skyline motion must not snap at a modulo boundary');
assert.doesNotMatch(client, /drawPixelText\('₿'/, 'crypto moon mark must not depend on a platform font glyph');
assert.match(client, /interact: '#a9ff9a'/);
assert.match(client, /function drawWorldStreet/);
assert.match(client, /function drawWorldReaction/);
assert.match(client, /function drawWorldForeground/);
assert.match(client, /var WORLD_REACTION_COLORS =/);
assert.match(client, /WORLD_REACTION_COLORS\[animationMode\]/);
assert.match(client, /var worldTime = reducedMotion \? 0 : time/);
assert.match(client, /drawWorldSky\(worldTime, scene\)/);
assert.match(client, /drawWorldReaction\(worldTime, scene\)/);
assert.match(client, /drawPet\(renderTime, presence, combat\);\s*drawCombatOpponent\(worldTime, scene, combat\);\s*ctx\.restore\(\);\s*drawWorldForeground\(scene\)/s);
assert.doesNotMatch(client, /new Image\s*\(/);
assert.match(client, /function drawMoonEgg/);
assert.match(client, /drawMoonEgg\(time, active, lifecycle\.incubation\)/);
assert.match(client, /var progress = Math\.max\(0, Number\(incubation && incubation\.progress \|\| 0\)\)/);
assert.match(client, /var crack = Math\.min\(2, Math\.floor\(progress \/ target \* 3\)\)/);
assert.match(client, /function petGrowthShape/);
assert.match(client, /phase === 'young'.*scaleX: 0\.9, scaleY: 0\.76/s);
assert.match(client, /phase === 'rare'.*scaleX: 1\.22, scaleY: 1\.18/s);
assert.match(client, /ctx\.scale\(growth\.scaleX \* pose\.squashX \* combatScale \* ceremonyScale, growth\.scaleY \* pose\.squashY \* combatScale \* ceremonyScale\)/);
assert.match(client, /function petFaceOffset/);
assert.match(client, /speciesId === 'sneaker_snail' \? 18 : 0/);
assert.match(client, /ctx\.translate\(faceX, 0\)/);
assert.match(client, /mood === 'happy'.*pose\.tail = 8/s);
assert.match(client, /mood === 'hungry'.*pose\.headY = 4/s);
assert.match(client, /mood === 'hurt'.*pose\.squashX = 0\.94/s);
assert.match(client, /animationMode === 'feed'/);
assert.match(client, /animationMode === 'play'/);
assert.match(client, /animationMode === 'train'/);
assert.match(client, /animationMode === 'sleep'/);
assert.match(client, /animationMode === 'battle'/);
assert.match(client, /animationMode === 'celebrate'/);
assert.match(client, /animationMode === 'evolve'.*pose\.squashX = 1\.08/s);
assert.match(client, /function petMood/);
assert.match(client, /drawActionEffects/);
assert.match(client, /animationMode === 'battle'/);
assert.match(client, /animationMode === 'evolve'/);
assert.match(client, /bootLayer\.classList\.toggle\('is-compact'/);
assert.match(client, /target\.getBoundingClientRect\(\)\.top - screenRect\.top \+ screen\.scrollTop/);
assert.match(client, /pet\.evolution_stage == null \? NaN : Number\(pet\.evolution_stage\)/);
assert.match(client, /var renderTime = reducedMotion \? performance\.now\(\) : time/);
assert.match(client, /var active = animationUntil > renderTime/);
assert.match(client, /reducedMotionAnimationTimer = window\.setTimeout/);
assert.match(client, /drawWorld\(performance\.now\(\)\)/);
assert.match(client, /var blink = !reducedMotion && Math\.floor\(renderTime \/ 1800\)/);
assert.match(client, /hold: 1600, notice: true/);
assert.match(css, /\.boot-layer\.is-compact\.is-notice \{[^}]*max-height: none;[^}]*overflow-y: auto/s);
assert.match(css, /repeating-linear-gradient/);
assert.match(css, /grid-template-rows: auto minmax\(178px, 32dvh\) auto minmax\(0, 1fr\) auto/);
assert.match(css, /\.screen \{[^}]*overflow-y: auto/s);
assert.match(css, /\.dock \{ position: relative/);
assert.match(css, /\.boot-layer\.is-compact/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /\.meter-fill \{ display: block;/);
assert.doesNotMatch(html, /maximum-scale|user-scalable/i);


assert.match(client, /var SCREEN_ORDER = \['home', 'missions', 'explore', 'work', 'economy', 'profile'\]/);
assert.match(client, /function switchScreen\(nextScreen\)/);
assert.match(client, /sceneTransitionDirection = SCREEN_ORDER\.indexOf\(nextScreen\)/);
assert.match(client, /sceneTransitionUntil = reducedMotion \? 0 : sceneTransitionStartedAt \+ 420/);
assert.match(client, /if \(!SCREEN_ORDER\.includes\(jump\.dataset\.jump\)\)/);
assert.match(client, /tell\('ROUTE NOT FOUND\.', 'danger'\)/);
assert.match(client, /switchScreen\(jump\.dataset\.jump\)/);
assert.match(client, /switchScreen\(target\.dataset\.screen\)/);
assert.match(client, /var CAMERA_IMPACT_STRENGTH =/);
for (const family of ['feed', 'play', 'clean', 'sleep', 'train', 'battle', 'travel', 'work', 'equip', 'evolve', 'trade', 'celebrate', 'interact', 'blocked']) {
  assert.match(client, new RegExp(family + ': \\d'), `Phase 3 must define camera impact for ${family}`);
}
assert.match(client, /var CAMERA_FRAME = \{ x: 0, y: 0, zoom: 1 \}/);
assert.match(client, /function updateCameraFrame\(time\)/);
assert.match(client, /if \(reducedMotion \|\| cameraImpactUntil <= time/);
assert.match(client, /function drawActionFlash\(time, scene\)/);
assert.match(client, /if \(reducedMotion \|\| actionStartedAt <= 0 \|\| time < actionStartedAt/);
assert.match(client, /function actionFeedback\(result\)/);
assert.match(client, /function resultRewardMap\(result\)/);
assert.match(client, /applied && \(applied\.rewardsApplied \|\| applied\.rewards_applied\)/);
assert.match(client, /var reward = resultRewardMap\(result\)/);
assert.equal([...client.matchAll(/var reward = resultRewardMap\(result\)/g)].length, 2, 'terminal and canvas feedback must share reward normalization');
assert.match(client, /presentResultFeedback\(data\.result\)/);
assert.match(client, /await showPendingNotices\(\);\s*animateAction\(action, Boolean\(data\.result && data\.result\.accepted\), 2800, payload\);\s*if \(!startLifecycleCeremony\(plannedCeremony\)\) presentResultFeedback\(data\.result\)/s);
assert.doesNotMatch(client, /presentResultFeedback\(data\.result\);\s*render\(\);\s*await typeBoot/s, 'feedback timer must not run behind the boot overlay');
assert.equal([...client.matchAll(/presentResultFeedback\(/g)].length, 2, 'only the helper and real server-result call may present reward feedback');
assert.match(client, /var feedbackDuration = Math\.max\(5200, actionResultHoldMs \+ 1600\)/);
assert.match(client, /feedbackUntil = performance\.now\(\) \+ feedbackDuration/);
assert.match(client, /feedbackRedrawTimer = window\.setTimeout/);
assert.match(client, /clearResultFeedback\(true\)/);
assert.match(client, /clearResultFeedback\(false\);\s*animateAction\(action, true, 8000, payload\)/s);
assert.match(client, /reaction: compactFeedback\(result\.reaction, 24\)/);
assert.match(client, /actionStartedAt <= 0/);
assert.match(client, /function drawCinematicFeedback\(time, scene\)/);
assert.match(client, /drawPixelText\('MOONPET \/\/', 181, 86, scene\.accent, 'left'\)/);
assert.match(client, /drawPixelText\(feedbackReaction, 181, 98, '#f4ff65', 'left'\)/);
assert.doesNotMatch(client, /'MOONPET \/\/ ' \+ feedbackReaction/, 'reaction prefix and copy must render on separate fitted lines');
assert.match(client, /function drawSceneTransition\(time, scene\)/);
assert.match(client, /if \(reducedMotion \|\| sceneTransitionUntil <= time\) return/);
assert.match(client, /drawActionFlash\(renderTime, scene\);\s*drawCinematicFeedback\(renderTime, scene\);\s*drawLifecycleCeremony\(renderTime, scene\);\s*drawSceneTransition\(renderTime, scene\)/s);
assert.doesNotMatch(client, /Math\.random\(\).*feedback|feedback.*Math\.random\(\)/s, 'Phase 3 feedback must never invent random rewards');


assert.match(client, /var SCENE_COMPANION_HABITS =/);
for (const habit of ['moon_gaze', 'signal_scan', 'alley_prowl', 'scrap_tinker', 'window_shop', 'memory_glow']) {
  assert.match(client, new RegExp(habit), `Phase 4 must include scene habit ${habit}`);
}
assert.match(client, /var SPECIES_COMPANION_HABITS =/);
for (const species of ['neon_raccoon', 'bubble_ram', 'comet_gecko', 'vinyl_crab', 'lantern_fox', 'sneaker_snail', 'alley_drake', 'moon_ferret']) {
  assert.match(client, new RegExp(species + ": '[a-z_]+"), `Phase 4 must include an idle signature for ${species}`);
}
assert.match(client, /function companionIdentitySeed\(pet, lifecycle\)/);
assert.match(client, /return companionSeedValue/);
assert.match(client, /COMPANION_PRESENCE_FRAME\.slot !== slot/);
assert.match(client, /COMPANION_PRESENCE_FRAME\.screen !== activeScreen/);
assert.match(client, /function temperamentCompanionHabit\(temperament\)/);
assert.match(client, /bold\|brave\|fierce\|confident.*return 'swagger'/s);
assert.match(client, /rhythmic\|play\|wild\|chaos\|energetic.*return 'fidget'/s);
assert.match(client, /calm\|soft\|patient\|loyal.*return 'chill'/s);
assert.match(client, /social\|curious\|alert\|observant.*return 'listen'/s);
assert.match(client, /function companionNeedThought\(pet, lifecycle, fallback\)/);
assert.match(client, /Number\(pet\.health\) < 35.*I NEED PATCHING/s);
assert.match(client, /Number\(pet\.energy\) < 20.*NAP SIGNAL/s);
assert.match(client, /Number\(pet\.hunger\) > 78.*SNACK PLEASE/s);
assert.match(client, /Number\(pet\.cleanliness\) < 30.*WASH TIME/s);
assert.match(client, /Number\(pet\.happiness\) < 30.*PLAY WITH ME/s);
assert.match(client, /function updateCompanionPresence\(pet, lifecycle, time\)/);
const presenceFunctionSource = extractTestExport(client, 'phase4PresenceDirector');
assert.ok(presenceFunctionSource, 'Phase 4 presence director must be extractable for runtime smoke coverage');
const runtimePresenceFrame = { behavior: 'chill', phase: 0.72, thought: '', slot: -1, screen: '', seed: -1 };
const updatePresenceRuntime = new Function(
  'reducedMotion', 'activeScreen', 'COMPANION_PRESENCE_FRAME', 'companionIdentitySeed',
  'SCENE_COMPANION_HABITS', 'SPECIES_COMPANION_HABITS', 'temperamentCompanionHabit',
  'companionNeedThought', 'COMPANION_THOUGHTS',
  presenceFunctionSource + '; return updateCompanionPresence;'
)(
  false,
  'explore',
  runtimePresenceFrame,
  () => 12,
  { explore: 'alley_prowl' },
  { neon_raccoon: 'mask_wash' },
  () => 'listen',
  (_pet, _lifecycle, fallback) => fallback,
  { alley_prowl: 'ALLEY CHECK', mask_wash: 'MASK STAYS FRESH', listen: 'TELL ME MORE' },
);
assert.doesNotThrow(() => updatePresenceRuntime(
  { pet_name: 'Smoke', species: 'neon_raccoon', health: 100, energy: 100, hunger: 0, cleanliness: 100, happiness: 100 },
  { species_id: 'neon_raccoon', temperament: 'curious' },
  0,
), 'Phase 4 presence director must execute without unresolved render-loop identifiers');
assert.equal(runtimePresenceFrame.thought, 'ALLEY CHECK');
assert.doesNotThrow(() => updatePresenceRuntime(
  { pet_name: 'Smoke', species: 'neon_raccoon', health: 100, energy: 100, hunger: 0, cleanliness: 100, happiness: 100 },
  null,
  8000,
), 'Phase 4 species habits must fall back to pet.species when lifecycle identity is incomplete');
assert.equal(runtimePresenceFrame.behavior, 'mask_wash');
assert.equal(runtimePresenceFrame.thought, 'MASK STAYS FRESH');

assert.match(client, /var presenceTime = reducedMotion \? 0 : Math\.max\(0, time\)/);
assert.match(client, /COMPANION_PRESENCE_FRAME\.phase = reducedMotion \? 0\.72/);
assert.match(client, /function drawCompanionHabitEffects\(time, x, y, presence, color, active\)/);
assert.match(client, /var effectTime = reducedMotion \? 0 : time/);
assert.match(client, /var angle = effectTime \/ 900/);
assert.match(client, /function companionAmbienceMode\(hour\)/);
assert.match(client, /NIGHT SHIFT/);
assert.match(client, /DAWN SHIFT/);
assert.match(client, /DAY SHIFT/);
assert.match(client, /DUSK SHIFT/);
assert.match(client, /function drawUtcAmbience\(scene\)/);
assert.match(client, /if \(nextUtcHour !== utcHour\)/);
assert.match(client, /if \(reducedMotion\) drawWorld\(performance\.now\(\)\)/);
assert.match(client, /function drawCompanionPresence\(time, scene, presence\)/);
assert.match(client, /var bubbleY = 54/);
assert.match(client, /drawPixelRect\(7, bubbleY, 150, 31/);
assert.doesNotMatch(client, /drawPixelRect\(7, 18, 150, 31/, 'companion copy must remain below the DOM HUD');
assert.match(client, /if \(feedbackActive \|\| actionActive && !greetingActive\) return/);
assert.match(client, /feedbackUntil > time/);
assert.match(client, /function companionGreetingCopy\(pet, lifecycle\)/);
assert.match(client, /function greetCompanion\(\)/);
assert.match(client, /canvas\.addEventListener\('click'/);
assert.match(client, /canvasX >= 92 && canvasX <= 228 && canvasY >= 66 && canvasY <= 190/);
assert.match(client, /animateAction\('interact', true, 1400, \{ source: 'pet_tap'/);
assert.doesNotMatch(client, /greetCompanion[\s\S]{0,1200}(?:post\(|runAction\()/, 'pet taps must remain cosmetic and server-neutral');
assert.match(client, /companionGreetingTimer = window\.setTimeout/);
assert.match(client, /drawPet\(renderTime, presence, combat\)/);
assert.match(client, /if \(companionGreetingUntil > 0 && companionGreetingUntil <= time\)/);
assert.match(client, /companionGreeting = '';\s*companionGreetingUntil = 0;/s);
assert.match(client, /drawUtcAmbience\(scene\);\s*drawCombatHud\(scene, combat\);\s*if \(!combat\.active && !lifecycleCeremonyActive\(renderTime\)\) drawCompanionPresence\(renderTime, scene, presence\)/s);
assert.doesNotMatch(client, /Math\.random\(\)[^\n]*(?:presence|habit|greeting)|(?:presence|habit|greeting)[^\n]*Math\.random\(\)/i, 'living companion behavior must be deterministic');

assert.match(client, /var COMBAT_PRESENTATION_FRAME =/);
assert.match(client, /var COMBAT_RIVAL_COLORS =/);
assert.match(client, /var COMBAT_ARENA_SPECIAL_MAX = 3;/);
assert.match(worker, /const PET_ARENA_SPECIAL_COST = 3;/, 'Phase 5 special presentation must match the authoritative Arena charge cost');
assert.match(client, /function clearCombatPresentation\(\)/);
assert.match(client, /function updateCombatPresentation\(snapshot\)/);
assert.match(client, /snapshot === combatSnapshot && activeScreen === combatScreen/);
assert.match(client, /var arena = snapshot\.arena/);
assert.match(client, /COMBAT_PRESENTATION_FRAME\.mode = 'arena'/);
assert.match(client, /arena\.player_hp/);
assert.match(client, /arena\.opponent_hp/);
assert.match(client, /arena\.player_special/);
assert.match(client, /arena\.opponent_special/);
assert.match(client, /'ROUND ' \+ Number\(arena\.current_round \|\| 1\) \+ '\/' \+ Number\(arena\.max_rounds \|\| 5\) \+ ' LIVE'/);
assert.match(client, /var kaiju = snapshot\.kaiju && snapshot\.kaiju\.match/);
assert.match(client, /COMBAT_PRESENTATION_FRAME\.mode = 'kaiju'/);
assert.match(client, /kaiju\.own_card_locked/);
assert.match(client, /kaiju\.opponent_card_locked/);
assert.match(client, /var run = snapshot\.run/);
assert.match(client, /COMBAT_PRESENTATION_FRAME\.mode = 'run'/);
assert.match(client, /run\.current_room != null \? run\.current_room : run\.depth/);
assert.match(client, /function drawCombatOpponent\(time, scene, combat\)/);
assert.match(client, /function drawCombatMeter\(x, y, width, value, maximum, color, reverse\)/);
assert.match(client, /function drawCombatHud\(scene, combat\)/);
assert.match(client, /combat\.playerSpecial, COMBAT_ARENA_SPECIAL_MAX/);
assert.match(client, /combat\.opponentSpecial, COMBAT_ARENA_SPECIAL_MAX/);
assert.match(client, /'CARD \/\/ ' \+ compactFeedback\(words\(combat\.playerCardKey\), 12\)/);
assert.match(client, /drawPixelRect\(7, 54, 306, 38/);
assert.match(client, /compactFeedback\(combat\.status, 17\)/);
assert.match(client, /var y = 160 \+ pulse/);
assert.match(client, /if \(!combat \|\| !combat\.active\)/);
assert.match(client, /var pulse = reducedMotion \? 0 : Math\.round\(Math\.sin\(time \/ 260\) \* 2\)/);
assert.match(client, /var combatScale = combat && combat\.active \? 0\.78 : 1/);
assert.match(client, /combat && combat\.active \? -62 : 0/);
assert.match(client, /drawCombatHud\(scene, combat\)/);
assert.match(client, /if \(!combat\.active && !lifecycleCeremonyActive\(renderTime\)\) drawCompanionPresence/);
assert.match(client, /COMBAT_PRESENTATION_FRAME\.active \|\| lifecycleCeremonyActive\(now\)\) return;/);
assert.doesNotMatch(client, /Math\.random\(\)[^\n]*(?:combat|rival)|(?:combat|rival)[^\n]*Math\.random\(\)/i, 'Phase 5 combat presentation must remain deterministic');

const combatDirectorSource = extractTestExport(client, 'combatDirector');
assert.ok(combatDirectorSource, 'Phase 5 combat director must be extractable for runtime smoke coverage');
const runtimeCombatFrame = {
  active: false, mode: '', title: '', status: '', opponentName: '', round: 0, maxRounds: 0,
  playerValue: 0, opponentValue: 0, maxValue: 100, playerSpecial: 0, opponentSpecial: 0,
  playerCardKey: '', opponentCardKey: '', rivalColor: '#ff6d6d', source: null,
};
const combatRuntime = new Function(
  'COMBAT_PRESENTATION_FRAME', 'activeScreen', 'combatSnapshot', 'combatScreen', 'combatRivalColor',
  combatDirectorSource + '; return { update: updateCombatPresentation, screen: function (value) { activeScreen = value; } };',
)(
  runtimeCombatFrame,
  'explore',
  null,
  '',
  () => '#61f5ff',
);
assert.doesNotThrow(() => combatRuntime.update({
  adopted: true,
  arena: {
    status: 'active', mode: 'multiplayer', current_round: 3, max_rounds: 5,
    player_hp: 74, opponent_hp: 38, player_special: 2, opponent_special: 1,
    opponent: { pet_name: 'Rival Smoke' },
  },
}), 'Phase 5 Arena director must execute from server-returned battle state');
assert.equal(runtimeCombatFrame.mode, 'arena');
assert.equal(runtimeCombatFrame.playerValue, 74);
assert.equal(runtimeCombatFrame.opponentValue, 38);
assert.equal(runtimeCombatFrame.round, 3);
assert.equal(runtimeCombatFrame.maxRounds, 5);
assert.equal(runtimeCombatFrame.status, 'ROUND 3/5 LIVE');
assert.equal(runtimeCombatFrame.playerSpecial, 2);
assert.equal(runtimeCombatFrame.opponentSpecial, 1);
assert.equal(runtimeCombatFrame.rivalColor, '#61f5ff');
assert.doesNotThrow(() => combatRuntime.update({
  adopted: true,
  kaiju: { match: { status: 'selecting', mode: 'solo', own_card_locked: true, opponent_card_locked: false, own_card_key: 'neon-claw' } },
}), 'Phase 5 Kaiju director must execute from live card-lock state');
assert.equal(runtimeCombatFrame.mode, 'kaiju');
assert.equal(runtimeCombatFrame.playerValue, 1);
assert.equal(runtimeCombatFrame.opponentValue, 0);
assert.equal(runtimeCombatFrame.playerCardKey, 'neon-claw');
assert.doesNotThrow(() => combatRuntime.update({
  adopted: true,
  run: { status: 'active', daily: true, current_room: 4, max_room: 8, risk_level: 3 },
}), 'Phase 5 Moon Run director must execute from persisted run state');
assert.equal(runtimeCombatFrame.mode, 'run');
assert.equal(runtimeCombatFrame.title, 'DAILY MOON RUN');
assert.equal(runtimeCombatFrame.playerValue, 4);
assert.equal(runtimeCombatFrame.opponentValue, 4);
combatRuntime.screen('home');
combatRuntime.update({ adopted: true, arena: { status: 'active', player_hp: 10, opponent_hp: 10 } });
assert.equal(runtimeCombatFrame.active, false, 'combat presentation must remain scoped to the Explore module');


assert.match(client, /var lifecycleCeremony = null/);
assert.match(client, /function lifecycleStateSnapshot\(snapshot\)/);
assert.match(client, /function planLifecycleCeremony\(beforeState, afterState, action, result\)/);
assert.match(client, /function lifecycleCeremonyActive\(time\)/);
assert.match(client, /function startLifecycleCeremony\(ceremony\)/);
const lifecycleStartSource = extractTestExport(client, 'lifecycleCeremonyStarter');
assert.ok(lifecycleStartSource, 'Phase 6 lifecycle ceremony starter must be extractable for haptic regression coverage');
assert.doesNotMatch(lifecycleStartSource, /haptic\('success'\)/, 'accepted lifecycle actions must emit only the runAction success haptic');
assert.match(client, /function clearLifecycleCeremony\(redraw\)/);
assert.match(client, /function drawLifecycleCeremony\(time, scene\)/);
assert.match(client, /EGG SIGNAL STRENGTHENED/);
assert.match(client, /HATCH COMPLETE/);
assert.match(client, /EVOLUTION COMPLETE/);
assert.match(client, /HIDDEN MORPH REVEALED/);
assert.match(client, /after\.progress \+ '\/' \+ after\.target/);
assert.match(client, /after\.speciesName/);
assert.match(client, /after\.rareName/);
assert.match(client, /after\.stage > before\.stage/);
assert.match(client, /result\.duplicate/);
assert.match(client, /duration: 7600/);
assert.match(client, /duration: 8200/);
assert.match(client, /drawPixelRect\(7, 50, 306, 2, color\)/, 'Phase 6 ceremony copy must remain below the DOM HUD');
assert.match(client, /if \(!combat\.active && !lifecycleCeremonyActive\(renderTime\)\) drawCompanionPresence/, 'Phase 6 ceremonies must suppress overlapping thought bubbles');
assert.match(client, /mood !== 'curious' && !lifecycleCeremonyActive\(time\)/, 'Phase 6 ceremonies must suppress overlapping mood labels');
assert.match(client, /\(!combat \|\| !combat\.active\) && !lifecycleCeremonyActive\(time\)/, 'Phase 6 ceremonies must suppress overlapping identity labels');
assert.equal([...client.matchAll(/animationLabel && !lifecycleCeremonyActive\(time\)/g)].length, 2, 'Phase 6 ceremonies must suppress egg and companion action labels');
assert.match(client, /var ceremonyScale = lifecycleCeremonyActive\(time\)/);
assert.match(client, /reducedMotion \? 1\.08/);
assert.match(client, /var burst = reducedMotion \? 38/);
assert.match(client, /lifecycleCeremonyTimer = window\.setTimeout/);
assert.match(client, /if \(lifecycleCeremony !== activeCeremony\) return/);
assert.match(client, /drawCinematicFeedback\(renderTime, scene\);\s*drawLifecycleCeremony\(renderTime, scene\);/s);
assert.match(client, /await typeBoot\(\['EXEC '[\s\S]*?await showPendingNotices\(\);[\s\S]*?if \(!startLifecycleCeremony\(plannedCeremony\)\) presentResultFeedback\(data\.result\);/);
assert.match(client, /if \(lifecycleCeremonyActive\(\)\) \{\s*tell\('LIFECYCLE REVEAL IN PROGRESS\.'/s);
assert.match(client, /screen\.addEventListener\('click'[\s\S]*?if \(lifecycleCeremonyActive\(\)\)[\s\S]*?LIFECYCLE REVEAL IN PROGRESS/s);
assert.match(client, /nav\.addEventListener\('click'[\s\S]*?if \(lifecycleCeremonyActive\(\)\)[\s\S]*?LIFECYCLE REVEAL IN PROGRESS/s);
assert.match(client, /COMBAT_PRESENTATION_FRAME\.active \|\| lifecycleCeremonyActive\(now\)/);
assert.doesNotMatch(client, /Math\.random\(\)[^\n]*(?:ceremony|lifecycle)|(?:ceremony|lifecycle)[^\n]*Math\.random\(\)/i, 'Phase 6 lifecycle presentation must remain deterministic');

const lifecycleDirectorSource = extractTestExport(client, 'lifecycleDirector');
assert.ok(lifecycleDirectorSource, 'Phase 6 lifecycle director must be extractable for runtime smoke coverage');
assert.doesNotMatch(lifecycleDirectorSource, /identity_seed|rare_route_index|species odds/i, 'Phase 6 must not expose hidden lifecycle authority');
const planCeremonyRuntime = new Function(
  'words',
  lifecycleDirectorSource + '; return planLifecycleCeremony;',
)(value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()));

const eggState = {
  adopted: true,
  pet: { species: 'moon_egg', evolution_stage: 0, stage: 'Moon Egg' },
  lifecycle: { phase: 'egg', incubation: { progress: 4, target: 12 } },
};
const dormantState = { adopted: false, pet: null, lifecycle: null };
const initialEggCeremony = planCeremonyRuntime(dormantState, eggState, 'adopt', { accepted: true });
assert.equal(initialEggCeremony.kind, 'egg');
assert.equal(initialEggCeremony.title, 'MOON EGG INITIALISED');
assert.equal(initialEggCeremony.primary, 'IDENTITY SIGNAL DORMANT');
assert.equal(planCeremonyRuntime(dormantState, eggState, 'adopt', { accepted: true, duplicate: true }), null);

const strongerEggState = {
  adopted: true,
  pet: { species: 'moon_egg', evolution_stage: 0, stage: 'Moon Egg' },
  lifecycle: { phase: 'egg', incubation: { progress: 6, target: 12 } },
};
const signalCeremony = planCeremonyRuntime(eggState, strongerEggState, 'incubate', { accepted: true, care_type: 'music' });
assert.equal(signalCeremony.kind, 'signal');
assert.equal(signalCeremony.primary, '6/12');
assert.equal(signalCeremony.secondary, 'Music RESONANCE');

const youngState = {
  adopted: true,
  pet: { species: 'neon_raccoon', evolution_stage: 1, stage: 'Street Moonpet' },
  lifecycle: {
    phase: 'young', species_id: 'neon_raccoon', species_name: 'Neon Raccoon', temperament: 'bold',
    appearance: { marking: 'spray_mask' }, innate_traits: ['alley_brave', 'collector'],
    incubation: { progress: 12, target: 12 }, rare: { name: null },
  },
};
const hatchCeremony = planCeremonyRuntime(strongerEggState, youngState, 'hatch', { accepted: true, species: 'Neon Raccoon' });
assert.equal(hatchCeremony.kind, 'hatch');
assert.equal(hatchCeremony.primary, 'Neon Raccoon');
assert.equal(hatchCeremony.secondary, 'Bold TEMPERAMENT');
assert.match(hatchCeremony.detail, /Spray Mask/);
assert.match(hatchCeremony.detail, /Alley Brave/);

const adultState = {
  adopted: true,
  pet: { species: 'neon_raccoon', evolution_stage: 2, stage: 'Cyber Moonpet' },
  lifecycle: { ...youngState.lifecycle, phase: 'adult' },
};
const evolutionCeremony = planCeremonyRuntime(youngState, adultState, 'evolve', { accepted: true });
assert.equal(evolutionCeremony.kind, 'evolve');
assert.equal(evolutionCeremony.primary, 'Cyber Moonpet');

const rareState = {
  adopted: true,
  pet: { species: 'neon_raccoon', evolution_stage: 4, stage: 'Legendary Moonpet' },
  lifecycle: { ...adultState.lifecycle, phase: 'rare', rare: { name: 'Subway Phantom' } },
};
const rareCeremony = planCeremonyRuntime(adultState, rareState, 'rare_morph', { accepted: true, rare_morph: 'Subway Phantom' });
assert.equal(rareCeremony.kind, 'rare');
assert.equal(rareCeremony.primary, 'Subway Phantom');
assert.equal(planCeremonyRuntime(adultState, rareState, 'rare_morph', { accepted: true, duplicate: true }), null);
assert.equal(planCeremonyRuntime(adultState, rareState, 'rare_morph', { accepted: false }), null);

assert.match(worker, /const PET_RUN_MAX_DEPTH = 100;/);
assert.match(worker, /PET_RUN_ELITE_INTERVAL = 5/);
assert.match(worker, /PET_RUN_BOSS_INTERVAL = 10/);
assert.match(worker, /hidden_route:[\s\S]*?elite:[\s\S]*?boss:/);
assert.match(worker, /current_room = \?/);
assert.match(worker, /score = score \+ \?/);
assert.match(worker, /period === 'run_depth'/);
assert.match(client, /ENDLESS MOON RUN/);
assert.match(client, /NEXT CHECKPOINT/);
assert.match(client, /\['daily', 'weekly', 'seasonal', 'all_time', 'run_depth'\]\.includes\(period\)/);
assert.match(client, /period === 'run_depth' \? number\(entry\.pet_xp\) \+ ' ROOMS'/);
assert.match(worker, /max_depth: Math\.max\(PET_RUN_MAX_DEPTH/);
assert.match(worker, /Math\.floor\(stepIndex \/ PET_RUN_BOSS_INTERVAL\) \+ 1/);
assert.match(worker, /dailyReservation \? dailyReservation\.current_room : Number\(activeRun\.depth \|\| 0\) \+ 1/);
assert.match(worker, /if \(!pool\.length\) pool = rooms/);
assert.match(client, /'run_depth'/);
assert.match(html, /20260816-season-roster-state-gate/);
assert.match(worker, /20260814-moonpet-aaa-pass/);
assert.match(client, /function scoreMotif\(\)/, 'audio must include authored screen motifs');
assert.match(client, /function syncMoonpetScore\(\)/, 'authored score must follow audio and radio state');
assert.match(client, /renderQuality = reducedMotion/, 'canvas quality must start from device capability');
assert.match(client, /sampleFps < 42/, 'canvas quality must adapt to measured frame rate');
assert.match(client, /\/telegram-pets\/app\/performance/, 'low-end device evidence must be reported through an authenticated route');
assert.match(client, /LOADOUT SYNERGIES/, 'persistent equipment set identity must be visible');
assert.match(worker, /recordPetMiniAppPerformance/, 'performance samples must be validated server-side');
assert.match(schema, /CREATE TABLE IF NOT EXISTS telegram_pet_client_performance/, 'performance evidence needs a durable bounded schema');
assert.match(worker, /sampled_at < datetime\('now','-90 days'\)/, 'performance samples need explicit retention');
assert.match(worker, /body\.device_memory == null \|\| body\.device_memory === '' \? null/, 'unknown device memory must remain null');
assert.match(worker, /body\.hardware_concurrency == null \|\| body\.hardware_concurrency === '' \? null/, 'unknown CPU capability must remain null');
assert.match(client, /visibilitychange[\s\S]*performanceFrames = 0; performanceSlowFrames = 0; performanceStartedAt = 0; performanceLastFrameAt = 0;/, 'hidden time must not contaminate FPS samples');
assert.match(client, /if \(reducedMotion\) \{[\s\S]*reducedMotionStartedAt = performance\.now\(\);[\s\S]*render\(\);[\s\S]*sendPerformanceSample\(0, 0, reducedMotionRenderMs\);/, 'reduced-motion sessions must submit measured render duration without synthetic FPS');
assert.match(schema, /render_duration_ms REAL CHECK \(render_duration_ms > 0 AND render_duration_ms <= 10000\)/, 'static-mode render duration needs a dedicated bounded telemetry field');
assert.match(worker, /reducedMotion \? renderDurationMs == null : averageFps <= 0/, 'reduced-motion samples must validate render duration instead of requiring FPS');
assert.match(client, /setStateSnapshot\(data\.state, requestGeneration\)[\s\S]*else \{[\s\S]*performanceFrames = 0; performanceSlowFrames = 0; performanceStartedAt = 0; performanceLastFrameAt = 0;[\s\S]*render\(\);/, 'normal-motion sampling must begin after fresh authenticated game state loads');
assert.match(client, /LOW_RENDER_INTERVAL_MS = 1000 \/ 30;[\s\S]*skipLowFrame = renderQuality === 'low' && performanceLastFrameAt && time - performanceLastFrameAt < LOW_RENDER_INTERVAL_MS;[\s\S]*if \(!skipLowFrame\) \{[\s\S]*performanceFrames \+= 1;[\s\S]*drawWorld\(time\);/, 'low-tier rendering and telemetry must use a timestamp-based 30 FPS cap');
assert.match(client, /event\.persisted && radioRequestedOn/, 'BFCache restore must resume the latest requested radio state');
assert.match(worker, /getPetActiveSetEffects\(pet\)/, 'authoritative job rewards must consume active set effects');
assert.match(worker, /setEffects\.arena_attack[\s\S]*setEffects\.arena_defense[\s\S]*setEffects\.arena_dodge/, 'Arena power must consume active set effects');

assert.match(worker, /function serializePetRunRoom/, 'standard runs must serialize authored room objectives and opponents');
assert.match(worker, /output\.result_copy === undefined && result\.outcome\?\.copy/, 'run outcome copy must survive Mini App action serialization');
assert.match(worker, /PET_ROGUELITE_ROOMS\[persistedRoom\.content_id\]/, 'daily rooms must recover their authored content definition');
assert.match(worker, /persistedRoom\.boss_id \|\| persistedRoom\.enemy_id \|\| null/, 'daily room briefs must preserve the generated opponent');
assert.match(worker, /function analyzePetRunChoice/, 'run previews and outcomes must share one risk analysis');
assert.match(worker, /function serializePetRunChoicePreview/, 'run choices must expose risk, cost and reward previews');
assert.match(worker, /analysis\.gear\.risk_delta - analysis\.gear\.survival_bonus < 0/, 'gear shield preview must use the same net risk reduction as authoritative resolution');
assert.match(worker, /room\.engine_choices/, 'authored rooms must drive mechanically coherent choice pools');
assert.match(worker, /wantedType === 'boss'/, 'boss checkpoints must select boss rooms');
assert.match(worker, /wantedType === 'elite'/, 'elite checkpoints must select elite rooms');
assert.match(client, /class="run-brief"/, 'Moon Run must present an authored encounter brief');
assert.match(client, /class="run-stakes"/, 'Moon Run must explain unbanked extraction stakes');
assert.match(client, /choice\.detail/, 'Moon Run choices must render server-authored decision previews');
assert.match(client, /result\.outcome && result\.outcome\.copy/, 'authoritative run outcome copy must reach player feedback');
assert.match(css, /\.run-decisions/, 'run decision cards must remain responsive and readable');

assert.match(worker, /body\.approach_key/, 'district approach payload must reach the Worker');
assert.match(worker, /body\.choice_key/, 'story choice payload must reach the Worker');
assert.match(client, /district-decisions/, 'District Missions need a decision surface');
assert.match(client, /story-decisions/, 'Story Chains need a branching surface');
assert.match(client, /mission\.objective/, 'District Missions must render objectives');
assert.match(client, /scene\.objective/, 'Story Chains must render objectives');
assert.match(css, /\.district-mission/, 'District briefs need responsive styling');
assert.match(client, /Districts show an objective/, 'the in-app guide must explain new district decisions');
assert.match(guide, /18 authored encounters/, 'the complete guide must document district content');
assert.match(guide, /12 authored scenes/, 'the complete guide must document story content');
assert.match(guide, /100-room Standard Moon Run/, 'the complete guide must describe the current Moon Run');
assert.doesNotMatch(guide, /five-step/i, 'the complete guide must not describe the retired five-step run');

assert.match(worker, /const PET_ARENA_MOVE_GUIDE/, 'Arena must expose one server-owned tactical move guide');
assert.match(worker, /moves: buildPetArenaMovePreviews/, 'Arena state must serialize readable move previews');
assert.match(worker, /const moveDefinition = PET_ARENA_MOVE_GUIDE\[move\]/, 'Arena resolution and previews must share one move definition');
assert.match(worker, /ensurePetKaijuMatchCategory\(db, kaiju\)/, 'pre-deployment Kaiju matches must receive a visible category before selection');
assert.match(worker, /ACTIVE CATEGORY:/, 'legacy Telegram Kaiju controls must expose the active category');
assert.match(worker, /opponent_intent: mode === 'solo' && battle\.status === 'active'/, 'only solo Arena may reveal a deterministic opponent intent');
assert.match(worker, /last_round: orientPetArenaLastRound/, 'Arena recaps must orient moves to the current player');
assert.match(client, /CRT TELEGRAPH/, 'solo Arena must render the opponent telegraph');
assert.match(client, /RIVAL INTENT \/\/ HIDDEN/, 'PvP Arena must explicitly preserve sealed intent');
assert.match(client, /class="button-grid arena-decisions"/, 'Arena decisions need a readable tactical card grid');
assert.match(worker, /player1_telegram_id, category_key, roll/, 'Kaiju category must be persisted when the match is created');
assert.match(worker, /category_key: category\?\.key \|\| null/, 'Kaiju category must be visible before card lock');
assert.match(worker, /serializePetKaijuCardPreview\(card, hydratedKaiju\?\.category_key\)/, 'Kaiju cards must include the hydrated active-category score');
assert.match(client, /BATTLE CATEGORY/, 'Kaiju must state what the current duel values');
assert.match(client, /ACTIVE ' \+ active/, 'Kaiju cards must emphasize their active score');
assert.match(css, /\.combat-intent/, 'combat intelligence panels need responsive styling');
assert.match(guide, /Player-vs-player intent always stays hidden/, 'the complete guide must document Arena fairness');
assert.match(guide, /before either card locks/, 'the complete guide must explain informed Kaiju drafting');
console.log('telegram-pets-mini-app.test.mjs passed');
