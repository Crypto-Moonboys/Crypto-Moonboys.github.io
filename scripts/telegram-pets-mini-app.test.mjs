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
const css = fs.readFileSync(new URL('../css/moonpet-mini-app.css', import.meta.url), 'utf8');

assert.match(worker, /path === '\/telegram-pets\/app\/state'.*request\.method === 'POST'/s);
assert.match(worker, /path === '\/telegram-pets\/app\/action'.*request\.method === 'POST'/s);
assert.match(worker, /verifyTelegramMiniAppInitData\(body\.init_data/);
assert.match(worker, /setChatMenuButton/);
assert.match(worker, /Chat gameplay controls are retired/);
assert.equal(resolvePetCallbackRoute('pet:feed', true), 'mini_app', 'enabled callbacks must open only the Mini App launcher');
assert.equal(resolvePetCallbackRoute('pet:feed', false), 'legacy', 'disabled callbacks must reach legacy gameplay routing');
assert.equal(resolvePetCallbackRoute('other:feed', true), 'ignore');
assert.match(worker, /resolvePetCallbackRoute\(data, env\.PET_MINI_APP_ENABLED\) === 'mini_app'/);
assert.ok(worker.indexOf("if (data.startsWith('pet:')") < worker.indexOf("const payload = data.slice(4)"), 'Mini App interception must precede legacy gameplay routing');
assert.match(worker, /issuePetMiniAppChallenge/);
assert.match(worker, /verifyPetMiniAppChallenge/);
assert.match(client, /challenge_token: encounter\.challenge_token/);
assert.match(client, /challenge_token: adventure\.challenge_token/);
assert.match(html, /<script data-cfasync="false" src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/);
assert.match(client, /launchParameter\('tgWebAppData'\)/);
assert.match(client, /await waitForTelegramContext\(\)/);
assert.match(worker, /Object\.prototype\.hasOwnProperty\.call\(PET_ARENA_MOVES, move\)/);
assert.match(worker, /FROM telegram_pet_run_rooms/);
assert.match(worker, /key: choice\.choice_id/);
assert.match(worker, /telegramId: verified\.telegramId/);
assert.match(client, /EQUIPMENT PROGRESSION/);
assert.match(client, /notification_set/);
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
assert.match(css, /repeating-linear-gradient/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /\.meter-fill \{ display: block;/);
assert.doesNotMatch(html, /maximum-scale|user-scalable/i);

console.log('telegram-pets-mini-app.test.mjs passed');
