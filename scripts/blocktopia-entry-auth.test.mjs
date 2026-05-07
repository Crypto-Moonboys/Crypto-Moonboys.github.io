/**
 * Protection checks for Block Topia Telegram/XP entry auth wiring.
 * These source-level checks guard the Colyseus room join boundary that has
 * previously failed as `telegram_required` when valid linked users entered.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFile(path.join(ROOT, rel), 'utf8');

function assertContains(source, needle, message) {
  assert.ok(source.includes(needle), `${message}: expected ${needle}`);
}

function assertOrdered(source, needles, message) {
  let cursor = -1;
  for (const needle of needles) {
    const next = source.indexOf(needle, cursor + 1);
    assert.ok(next > cursor, `${message}: expected ${needle} after previous join/auth step`);
    cursor = next;
  }
}

const indexHtml = await read('games/block-topia/index.html');
const network = await read('games/block-topia/network.js');
const room = await read('server/block-topia/src/rooms/MinimalCityRoom.js');
const main = await read('games/block-topia/main.js');

// Gate: Block Topia entry must require Telegram link and resolve a signed auth payload.
assertContains(indexHtml, 'identity.isTelegramLinked()', 'Block Topia gate must check Telegram link state');
assertContains(indexHtml, 'resolveBlockTopiaTelegramAuth(identity)', 'Block Topia gate must resolve signed Telegram auth before launch');
assertContains(indexHtml, 'identity.getSignedTelegramAuth()', 'Block Topia gate must prefer cached signed Telegram auth');
assertContains(indexHtml, 'identity.restoreLinkedTelegramAuth({ force: true })', 'Block Topia gate must restore expired/missing signed Telegram auth');
assertContains(indexHtml, 'telegramAuth.hash', 'Block Topia gate must require signed auth hash');
assertContains(indexHtml, 'telegramAuth.auth_date', 'Block Topia gate must require signed auth date');
assertContains(indexHtml, 'fetchProgressionForGate(telegramAuth)', 'Block Topia gate must verify XP using signed Telegram auth');
assertContains(indexHtml, 'BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP', 'Block Topia gate must keep required Arcade XP threshold');
assertOrdered(
  indexHtml,
  ['identity.isTelegramLinked()', 'resolveBlockTopiaTelegramAuth(identity)', 'fetchProgressionForGate(telegramAuth)', 'await mountAndConnect(telegramAuth, arcadeXpTotal)', 'connectMultiplayer({', 'telegramAuth,'],
  'Block Topia linked auth + XP gate must run before Colyseus join',
);

// Client join payload: connectMultiplayer must receive auth and pass the exact key expected by the room.
assertContains(network, 'telegramAuth = null', 'connectMultiplayer() must accept telegramAuth');
assertContains(network, '_reconnectOptions = { playerName, roomId, telegramAuth', 'reconnect options must retain telegramAuth');
assertContains(network, 'telegram_auth: telegramAuth', 'Colyseus join options must include telegram_auth');
assertOrdered(
  network,
  ['telegramAuth = null', '_reconnectOptions = { playerName, roomId, telegramAuth', 'joinCityOnly(client, roomId, { name: playerName, telegram_auth: telegramAuth })'],
  'network.js must carry telegramAuth into join options',
);

// Server room authority: MinimalCityRoom must validate the same key and reject missing/invalid/low-XP auth cleanly.
assertContains(room, 'validateMultiplayerEntry(options)', 'onJoin must validate multiplayer entry before adding player');
assertContains(room, 'options.telegram_auth', 'server must validate telegram_auth join option');
assertContains(room, "reason: 'telegram_required'", 'missing Telegram auth must be rejected as telegram_required');
assertContains(room, "reason: 'auth_invalid'", 'invalid or expired Telegram auth must be rejected as auth_invalid');
assertContains(room, "reason: 'xp_required'", 'low-XP Telegram-linked users must be rejected as xp_required');
assertContains(room, 'body: JSON.stringify({ telegram_auth: telegramAuth })', 'server must verify progression using same Telegram auth payload');
assertOrdered(
  room,
  ['async onJoin(client, options = {})', 'const validation = await validateMultiplayerEntry(options)', 'if (!validation.ok)', 'throw new Error(validation.reason)', 'this.state.players.push(player)'],
  'MinimalCityRoom must reject before joining invalid users and join valid users afterward',
);

// Main remains the runtime shell, not the auth source; auth must stay in index/network/room boundary.
assertContains(main, 'function setConnectionStatus(status = {})', 'Block Topia main must still expose connection status updates after join');


function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(match, `expected to find function ${name}`);
  const start = match.index;
  const signatureEnd = source.indexOf(') {', start);
  assert.ok(signatureEnd > start, `expected signature for function ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1).replace(/^export\s+/, '');
  }
  throw new Error(`unterminated function ${name}`);
}

let currentFetch = async () => ({ ok: false, json: async () => ({}) });
const makeValidatedEntryHarness = new Function('callFetch', `
  const BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP = 50;
  const PROGRESSION_FETCH_TIMEOUT_MS = 1000;
  const fetch = (...args) => callFetch(...args);
  function resolveApiBase() { return 'https://moonboys-api.test'; }
  ${extractFunction(room, 'normalizeAuthPayload')}
  ${extractFunction(room, 'validateMultiplayerEntry')}
  return { validateMultiplayerEntry, normalizeAuthPayload };
`);
const { validateMultiplayerEntry } = makeValidatedEntryHarness((...args) => currentFetch(...args));
const validAuth = { id: '123', auth_date: Math.floor(Date.now() / 1000), hash: 'signed' };
let requestedBody = null;
currentFetch = async (_url, options = {}) => {
  requestedBody = JSON.parse(String(options.body || '{}'));
  return { ok: true, json: async () => ({ ok: true, progression: { arcade_xp_total: 50 } }) };
};
assert.deepEqual(await validateMultiplayerEntry({ telegram_auth: validAuth }), { ok: true }, 'Telegram-linked user with required XP should enter Block Topia');
assert.deepEqual(requestedBody.telegram_auth, validAuth, 'server progression check must receive the expected Telegram auth payload');

assert.deepEqual(await validateMultiplayerEntry({}), { ok: false, reason: 'telegram_required' }, 'missing Telegram auth should reject with telegram_required');

currentFetch = async () => ({ ok: false, json: async () => ({ ok: false, error: 'auth_invalid' }) });
assert.deepEqual(await validateMultiplayerEntry({ telegram_auth: validAuth }), { ok: false, reason: 'auth_invalid' }, 'expired/invalid auth should reject cleanly');

currentFetch = async () => ({ ok: true, json: async () => ({ ok: true, progression: { arcade_xp_total: 0 } }) });
assert.deepEqual(await validateMultiplayerEntry({ telegram_auth: validAuth }), { ok: false, reason: 'xp_required' }, 'Telegram-linked users below required Arcade XP should stay gated');

console.log('Block Topia entry auth protection checks passed.');
