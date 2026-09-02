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
const miniAppStateSource = worker.slice(worker.indexOf('async function buildPetMiniAppState'), worker.indexOf('async function processPetMiniAppAction'));
assert.match(
  miniAppStateSource,
  /getOrCreatePetRuntimeState\(db, telegramId, getPetDayKey\(now\), activePetRewardAuthority\(petRaw\)\)/,
  'Mini App progress must load specialist tracks and aptitudes for the selected active pet',
);
assert.match(
  miniAppStateSource,
  /progress: runtime/,
  'Mini App progress payload must expose the selected pet specialist state',
);
const html = fs.readFileSync(new URL('../moonpet-game.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/moonpet-mini-app.js', import.meta.url), 'utf8');
assert.match(client, /var lifecycleRequirement = journeyLifecycle\.next_evolution \?/, 'final-form lifecycle copy must branch on whether a next evolution exists');
assert.doesNotMatch(client, /next_evolution[^\n]+LEVEL \/\/ 0\/0/, 'final-form lifecycle must never render a synthetic 0/0 requirement');
assert.match(client, /if \(!pet\.progression\)[^\n]+PROGRESSION UNAVAILABLE/, 'missing roster progression must render an explicit unavailable state');
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
function extractFunctionSource(source, name) {
  return source.match(new RegExp(`function ${name}\\(\\)\\s*\\{[\\s\\S]*?\\n  \\}`))?.[0] || '';
}

const capabilityCombatHelperSource = extractTestExport(client, 'capabilityCombatHelper');
assert.ok(capabilityCombatHelperSource, 'capability combat helper must be extractable for runtime coverage');
assert.match(capabilityCombatHelperSource, /reason: 'capability_unavailable'/, 'missing capability authority must fail closed with an explicit reason');
assert.match(capabilityCombatHelperSource, /capabilities_version[\s\S]*version !== 1[\s\S]*return fallback/, 'combat helper must require the versioned capability contract');
assert.match(capabilityCombatHelperSource, /combat\.state === 'AVAILABLE' && combat\.unlocked === true/, 'combat helper must require the authoritative AVAILABLE state and unlocked flag');
assert.doesNotMatch(capabilityCombatHelperSource, /season_slots|sanctuary|hasSlotCompletion|hasSanctuaryCompletion/, 'combat helper must not duplicate completion authority in the frontend');
let capabilityHelperState = {};
const capabilityRuntime = new Function(
  'state',
  capabilityCombatHelperSource + '; return { combatCapability, hasCombatUnlocked, systemCapability, hasSystemUnlocked, combatLockCopy };',
)(capabilityHelperState);
assert.equal(capabilityRuntime.hasCombatUnlocked(), false, 'missing capability payload must lock combat');
assert.equal(capabilityRuntime.combatCapability(capabilityHelperState).reason, 'capability_unavailable', 'missing capability payload must surface capability_unavailable');
assert.match(capabilityRuntime.combatLockCopy().title, /CAPABILITY STATE SYNCS/, 'missing capability payload must render locked copy');
capabilityHelperState = { capabilities: { combat: { state: 'AVAILABLE', unlocked: true, reason: 'combat_unlocked' } } };
assert.equal(new Function('state', capabilityCombatHelperSource + '; return combatCapability(state).reason;')(capabilityHelperState), 'capability_unavailable',
  'incomplete combat capability payload must fail closed');
capabilityHelperState = { capabilities: { combat: { state: 'LOCKED', unlocked: false, reason: 'moon_egg_must_hatch', requirements: { completed_season_pet: true } } } };
assert.equal(new Function('state', capabilityCombatHelperSource + '; return hasCombatUnlocked();')(capabilityHelperState), false,
  'locked capability payload must lock combat even when completion is present');
capabilityHelperState = { capabilities: { combat: { state: 'AVAILABLE', unlocked: true, reason: 'combat_unlocked', requirements: { completed_season_pet: true, active_pet_exists: true, active_pet_lifecycle_known: true, active_pet_hatched: true, active_pet_level: 10, arena_level_met: true } } } };
assert.equal(new Function('state', capabilityCombatHelperSource + '; return combatCapability(state).reason;')(capabilityHelperState), 'capability_unavailable',
  'available combat capability payload without active state must fail closed');
capabilityHelperState = { capabilities: { combat: { state: 'AVAILABLE', unlocked: true, active: true, reason: 'combat_unlocked', requirements: { completed_season_pet: true, active_pet_exists: true, active_pet_lifecycle_known: true, active_pet_hatched: true, active_pet_level: 10, arena_level_met: true } } } };
assert.equal(new Function('state', capabilityCombatHelperSource + '; return combatCapability(state).reason;')(capabilityHelperState), 'capability_unavailable',
  'available combat capability payload without contract version must fail closed');
capabilityHelperState = { capabilities_version: 1, capabilities: { combat: { state: 'AVAILABLE', unlocked: true, active: true, reason: 'combat_unlocked', requirements: { completed_season_pet: false, active_pet_exists: true, active_pet_lifecycle_known: true, active_pet_hatched: true, active_pet_level: 10, arena_level_met: true } } } };
assert.equal(new Function('state', capabilityCombatHelperSource + '; return hasCombatUnlocked();')(capabilityHelperState), true,
  'available capability payload must unlock combat');
capabilityHelperState.capabilities.systems = {
  arena: { state: 'LOCKED', unlocked: false, active: false, reason: 'arena_level_locked' },
  kaiju: { state: 'AVAILABLE', unlocked: true, active: true, reason: 'available' },
};
assert.equal(new Function('state', capabilityCombatHelperSource + '; return hasSystemUnlocked("arena");')(capabilityHelperState), false,
  'Arena system capability must stay locked when Arena level is unmet');
assert.equal(new Function('state', capabilityCombatHelperSource + '; return hasSystemUnlocked("kaiju");')(capabilityHelperState), true,
  'Kaiju system capability may unlock independently from Arena level');
assert.match(new Function('state', capabilityCombatHelperSource + '; return combatLockCopy(systemCapability(state, "arena").reason).title;')(capabilityHelperState), /ARENA LOCKED UNTIL LEVEL 10/,
  'Arena system lock copy must expose the level gate');

const actionAvailabilitySource = extractTestExport(client, 'actionAvailability');
const countdownComponentSource = extractTestExport(client, 'countdownComponent');
assert.ok(countdownComponentSource, 'shared countdown component must be extractable for runtime coverage');
assert.ok(actionAvailabilitySource, 'action availability helper must be extractable for runtime coverage');
const actionAvailabilityRuntime = new Function(
  'option',
  `function number(value) { return Number(value || 0).toLocaleString('en-US'); }
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
  });
}
var serverClockOffsetMs = 0;
var state = option && option.state || null;
${countdownComponentSource}
${actionAvailabilitySource}
function button(label, action, payload, options) {
  options = actionCooldownButtonOptions(action, options);
  var disabled = options && options.disabled;
  var detail = shouldShowAvailability(options)
    ? '<small>' + availabilityDetailMarkup(options) + '</small>'
    : '';
  return '<button class="terminal-button' + (options && options.danger ? ' danger' : '') + '" type="button" data-action="' + escapeHtml(action) + '" data-payload="' + escapeHtml(JSON.stringify(payload || {})) + '"' + (disabled ? ' disabled' : '') + '>' + escapeHtml(label) + detail + '</button>';
}
return { cooldownDisplay, availabilityLabel, availabilityDetail, shouldShowAvailability, cooldownMetadata, activityClaimButtonOptions, button, cooldownRemainingSeconds, cooldownExpiresAt, formatCountdownSeconds, countdownText, countdownMarkup, actionCooldownButtonOptions, setOffset: function (value) { serverClockOffsetMs = value; }, setState: function (value) { state = value; } };`,
)({});
assert.equal(actionAvailabilityRuntime.availabilityDetail({ detail: 'CARE ACTION' }), 'Ready now // CARE ACTION',
  'available action buttons must not show locked copy');
assert.doesNotMatch(actionAvailabilityRuntime.button('FEED', 'feed'), /Ready now|<small>/,
  'ordinary enabled buttons with no detail must not render noisy Ready now copy');
assert.match(actionAvailabilityRuntime.button('BUY', 'buy', {}, { disabled: true, resourceRequired: true }), /NOT ENOUGH RESOURCE/,
  'resource-gated buttons must keep explicit not-enough-resource copy');
assert.match(actionAvailabilityRuntime.button('WAIT', 'wait', {}, { cooldown: { retry_after_seconds: 720 } }), /Available in 12m/,
  'cooldown buttons must keep existing-state cooldown copy');
assert.match(actionAvailabilityRuntime.button('ARENA', 'arena_start', {}, { disabled: true, futureExpansion: true }), /FUTURE EXPANSION/,
  'future expansion buttons must keep future expansion copy');
assert.match(actionAvailabilityRuntime.button('LOCKED ACTION', 'locked', {}, { disabled: true }), /LOCKED/,
  'generic disabled buttons must keep locked copy');
const soldButton = actionAvailabilityRuntime.button('BUY', 'buy', {}, { disabled: true, statusLabel: 'SOLD', detail: 'Offer closed' });
assert.match(soldButton, /SOLD/,
  'sold buttons must show the already-complete status label');
assert.doesNotMatch(soldButton, /LOCKED/,
  'sold buttons must not fall back to locked copy');
const equippedButton = actionAvailabilityRuntime.button('EQUIP', 'buy', {}, { disabled: true, statusLabel: 'EQUIPPED', detail: 'Power suit' });
assert.match(equippedButton, /EQUIPPED/,
  'equipped buttons must show the already-current status label');
assert.doesNotMatch(equippedButton, /LOCKED/,
  'equipped buttons must not fall back to locked copy');
const ownedButton = actionAvailabilityRuntime.button('STYLE', 'cosmetic_unlock', {}, { disabled: true, statusLabel: 'OWNED', detail: 'x1 // 100 MOON GOLD' });
assert.match(ownedButton, /OWNED/,
  'owned buttons must show the already-owned status label');
assert.doesNotMatch(ownedButton, /LOCKED/,
  'owned buttons must not fall back to locked copy');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true }), 'LOCKED',
  'disabled actions without richer authority metadata must show locked copy');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, statusLabel: 'SOLD' }), 'SOLD',
  'status labels must override generic disabled copy');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, resourceRequired: true }), 'NOT ENOUGH RESOURCE',
  'resource-gated buttons must distinguish not-enough-resource state');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, activePetRequired: true }), 'ACTIVE PET REQUIRED',
  'active-pet gates must distinguish active pet required state');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, eggRequired: true }), 'EGG / INCUBATION REQUIRED',
  'egg/incubation gates must distinguish hatch/incubation state');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, authoritySyncing: true }), 'AUTHORITY SYNCING',
  'authority-syncing buttons must not fake availability');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true, authoritySyncing: true }), 'AUTHORITY SYNCING',
  'authority-syncing labels must outrank future-expansion labels when both apply');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true, activePetRequired: true }), 'ACTIVE PET REQUIRED',
  'active-pet gates must outrank future-expansion labels');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true, eggRequired: true }), 'EGG / INCUBATION REQUIRED',
  'egg/incubation gates must outrank future-expansion labels');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true, activePetRequired: true, eggRequired: true }), 'EGG / INCUBATION REQUIRED',
  'egg/incubation gates must outrank active-pet gates when both apply');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true, activePetRequired: true }), 'ACTIVE PET REQUIRED',
  'active-pet gates must remain explicit without egg/incubation gating');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true, resourceRequired: true }), 'NOT ENOUGH RESOURCE',
  'resource gates must outrank future-expansion labels');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true, cooldown: { retry_after_seconds: 720 } }), 'Available in 12m 00s',
  'cooldown labels must outrank future-expansion labels');
assert.equal(actionAvailabilityRuntime.availabilityLabel({ disabled: true, futureExpansion: true }), 'FUTURE EXPANSION',
  'future expansion copy must not imply live gameplay');
assert.equal(actionAvailabilityRuntime.cooldownDisplay({ retry_after_seconds: 720 }), 'Available in 12m 00s',
  'cooldown display must use existing retry_after_seconds safely');
assert.equal(actionAvailabilityRuntime.cooldownDisplay({ retry_after_seconds: 90000 }), 'Available in 1d 01h 00m',
  'long cooldown display must use an accurate countdown instead of vague UTC copy');
assert.equal(actionAvailabilityRuntime.formatCountdownSeconds(3661), '1h 01m 01s',
  'countdown formatter must preserve seconds for action timers');
const realNow = Date.now();
actionAvailabilityRuntime.setOffset(Date.parse('2026-08-22T12:00:00.000Z') - realNow);
assert.equal(actionAvailabilityRuntime.cooldownRemainingSeconds({ expires_at: '2026-08-22T12:05:00.000Z' }, Date.parse('2026-08-22T12:00:00.000Z')), 300,
  'expires_at countdowns must be computed from the server snapshot clock');
assert.equal(actionAvailabilityRuntime.countdownText({ expires_at: '2026-08-22T12:05:00.000Z' }, 'Reset in '), 'Reset in 5m 00s',
  'clock drift correction must make live countdown labels server-authoritative');
assert.match(actionAvailabilityRuntime.countdownMarkup({ expires_at: '2026-08-22T12:05:00.000Z' }, 'Reset in '), /data-cooldown-expires-at="2026-08-22T12:05:00\.000Z"/,
  'countdown markup must carry expiry metadata for live DOM ticking');
assert.match(actionAvailabilityRuntime.countdownMarkup({ seconds: 90 }, 'Available in '), /data-cooldown-expires-at="2026-08-22T12:01:30\.\d{3}Z"/,
  'legacy seconds-only timers must normalize to expires_at so DOM ticking continues after initial render');
assert.match(actionAvailabilityRuntime.countdownMarkup({ cooldown_ms_remaining: 90000 }, 'Available in '), /data-cooldown-expires-at="2026-08-22T12:01:30\.\d{3}Z"/,
  'legacy millisecond timers must normalize to expires_at so DOM ticking continues after initial render');
assert.match(actionAvailabilityRuntime.countdownMarkup({ remaining_seconds: 30 }, 'Ready <img src=x onerror=alert(1)> '), /data-cooldown-expires-at="2026-08-22T12:00:30\.000Z"/,
  'remaining_seconds-only timers must be normalized to expires_at for DOM ticking');
assert.match(actionAvailabilityRuntime.countdownMarkup({ remaining_seconds: 30 }, 'Ready <img src=x onerror=alert(1)> '), /Ready &lt;img src=x onerror=alert\(1\)&gt; 30s/,
  'countdown prefix must be HTML-encoded before entering markup');
assert.doesNotMatch(actionAvailabilityRuntime.countdownMarkup({ remaining_seconds: 30 }, 'Ready <img src=x onerror=alert(1)> '), /<img/i,
  'countdown prefix must be escaped before entering markup');
const maliciousExpiresMarkup = actionAvailabilityRuntime.countdownMarkup({
  expires_at: '2026-08-22T12:05:00.000Z&quot; autofocus onfocus=alert(1) x=&quot;',
  remaining_seconds: 45,
}, 'Reset "soon" <script>alert(1)</script> ');
assert.match(maliciousExpiresMarkup, /data-cooldown-expires-at="2026-08-22T12:00:45\.\d{3}Z"/,
  'malicious expires_at values must not be trusted when they fail timestamp parsing');
assert.doesNotMatch(maliciousExpiresMarkup, /autofocus|onfocus|<script/i,
  'malicious countdown expires_at and prefix values must be escaped or discarded');
const simultaneousCooldownButton = actionAvailabilityRuntime.button('ATTACK USED TODAY', 'seasonal_boss', {}, {
  disabled: true,
  statusLabel: 'USED TODAY',
  cooldown: { expires_at: '2026-08-22T12:05:00.000Z', remaining_seconds: 300 },
});
assert.match(simultaneousCooldownButton, /Reset in|Available in 5m 00s/,
  'disabled cooldown buttons must render a live timer even when status copy is present');
assert.match(actionAvailabilityRuntime.button('CLAIM', 'activity_claim', {}, actionAvailabilityRuntime.activityClaimButtonOptions({ ready: false, retry_after_seconds: 720 })), /Available in 12m/,
  'real timed-activity claim button options must render existing-state cooldown metadata');
const productionActivityClaim = actionAvailabilityRuntime.button('CLAIM', 'activity_claim', {}, actionAvailabilityRuntime.activityClaimButtonOptions({ ready: false, detail: 'Claim ready in 11m.' }));
assert.match(productionActivityClaim, /WAITING/,
  'production-shaped timed-activity claim buttons must show waiting status from detail when no cooldown field is serialized');
assert.match(productionActivityClaim, /Claim ready in 11m\./,
  'production-shaped timed-activity claim buttons must preserve server detail copy');
assert.doesNotMatch(productionActivityClaim, /LOCKED/,
  'production-shaped timed-activity claim buttons must not degrade in-progress activity to locked copy');
assert.doesNotMatch(actionAvailabilityRuntime.button('CLAIM', 'activity_claim', {}, actionAvailabilityRuntime.activityClaimButtonOptions({ ready: true, detail: 'Claim ready now.' })), /WAITING|IN PROGRESS|disabled/,
  'ready timed-activity claim buttons must not render disabled waiting labels');
assert.match(actionAvailabilityRuntime.button('CLAIM', 'activity_claim', {}, actionAvailabilityRuntime.activityClaimButtonOptions({ ready: false })), /LOCKED/,
  'timed-activity claim buttons without cooldown metadata must not fake availability');
assert.match(actionAvailabilityRuntime.button('CLAIM', 'activity_claim', {}, actionAvailabilityRuntime.activityClaimButtonOptions({ ready: false, retry_after_seconds: 0 })), /LOCKED/,
  'timed-activity claim buttons must ignore cooldown metadata that resolves to Ready now');
const acceptAnyRankCurrent = actionAvailabilityRuntime.button('ACCEPT ANY RANK', 'arena_matchmake', { accept_any_rank: true }, { disabled: true, statusLabel: 'CURRENT' });
assert.match(acceptAnyRankCurrent, /CURRENT/,
  'ACCEPT ANY RANK current state must show current status');
assert.doesNotMatch(acceptAnyRankCurrent, /LOCKED/,
  'ACCEPT ANY RANK current state must not render locked copy');
const seasonalUsedToday = actionAvailabilityRuntime.button('ATTACK USED TODAY', 'seasonal_boss', {}, { disabled: true, statusLabel: 'USED TODAY' });
assert.match(seasonalUsedToday, /USED TODAY/,
  'seasonal attack used-today state must show used-today status');
assert.doesNotMatch(seasonalUsedToday, /LOCKED/,
  'seasonal attack used-today state must not render locked copy');
const defeatedBossButton = actionAvailabilityRuntime.button('STRIKE', 'weekly_boss', { move: 'strike' }, { disabled: true, statusLabel: 'DEFEATED', cooldown: null });
assert.match(defeatedBossButton, /DEFEATED/,
  'defeated boss buttons must render defeated status copy');
assert.doesNotMatch(defeatedBossButton, /Available in|data-cooldown-expires-at/,
  'defeated bosses must not render false availability cooldown timers');
actionAvailabilityRuntime.setOffset(Date.parse('2026-08-22T12:00:00.000Z') - Date.now());
actionAvailabilityRuntime.setState({
  cooldowns: {
    entries: [{ key: 'action:work', expires_at: '2026-08-22T12:01:00.000Z', remaining_seconds: 60 }],
  },
});
const actionCooldownButton = actionAvailabilityRuntime.button('WORK SHIFT', 'work', {}, {});
assert.match(actionCooldownButton, /disabled/,
  'action-level cooldown entries must disable matching action controls');
assert.match(actionCooldownButton, /Available in 1m 00s/,
  'action-level cooldown entries must render a live countdown on matching action controls');
actionAvailabilityRuntime.setState({
  cooldowns: {
    entries: [{ key: 'action:work', expires_at: '2026-08-22T11:59:00.000Z', remaining_seconds: 0 }],
  },
});
assert.doesNotMatch(actionAvailabilityRuntime.button('WORK SHIFT', 'work', {}, {}), /disabled|Available in/,
  'expired action-level cooldown entries must not keep controls disabled');

const cooldownRefreshSource = extractTestExport(client, 'cooldownRefresh');
assert.ok(cooldownRefreshSource, 'cooldown refresh helper must be extractable for debounce coverage');
const actionCooldownMergeSource = extractTestExport(client, 'actionCooldownMerge');
assert.ok(actionCooldownMergeSource, 'action cooldown merge helper must be extractable for action-result cooldown coverage');
const actionCooldownMergeRuntime = new Function(
  countdownComponentSource + `
var serverClockOffsetMs = Date.parse('2026-08-22T12:00:00.000Z') - Date.now();
function words(value) { return String(value || '').replaceAll('_', ' ').replace(/\\b\\w/g, function (letter) { return letter.toUpperCase(); }); }
${actionCooldownMergeSource}
return { mergeActionResultCooldown: mergeActionResultCooldown };`,
)();
const mergedActionCooldownState = actionCooldownMergeRuntime.mergeActionResultCooldown(
  { server_time: '2026-08-22T12:00:00.000Z', cooldowns: { entries: [] } },
  { accepted: false, reason: 'cooldown', cooldown: { retry_after_seconds: 90, server_time: '2026-08-22T12:00:00.000Z' } },
  'work',
);
assert.equal(mergedActionCooldownState.cooldowns.entries[0].key, 'action:work',
  'rejected action cooldown must be merged into Mini App state cooldowns');
assert.match(mergedActionCooldownState.cooldowns.entries[0].expires_at, /^2026-08-22T12:01:30\.\d{3}Z$/,
  'rejected action cooldown must normalize retry_after_seconds to expires_at for ticking');
const cooldownRefreshRuntime = new Function(
  countdownComponentSource + `
var state = null;
var cooldownRefreshTimer = 0;
var cooldownRefreshInFlight = false;
var lastCooldownRefreshKey = '';
var serverClockOffsetMs = Date.parse('2026-08-22T12:00:00.000Z') - Date.now();
var busy = false;
var noticesBusy = false;
var generation = 0;
var postCalls = 0;
var renderCalls = 0;
var scheduled = [];
var cleared = [];
var screen = { scrollTop: 0 };
var window = {
  clearTimeout: function (id) { if (id) cleared.push(id); },
  setTimeout: function (fn, delay) { scheduled.push({ fn: fn, delay: delay }); return scheduled.length; },
};
function beginStateRequest() { generation += 1; return generation; }
function setStateSnapshot(nextState) { state = nextState; return true; }
function render() { renderCalls += 1; }
function tell() {}
async function showPendingNotices() {}
async function post() {
  postCalls += 1;
  await new Promise(function (resolve) { setTimeout(resolve, 5); });
  return { state: { adopted: true, cooldowns: { next_expires_at: '2026-08-22T12:10:00.000Z', entries: [{ expires_at: '2026-08-22T12:10:00.000Z', remaining_seconds: 600 }] } } };
}
${cooldownRefreshSource}
return {
  setState: function (next) { state = next; },
  setBusy: function (next) { busy = next; },
  setNoticesBusy: function (next) { noticesBusy = next; },
  scheduleCooldownRefresh: scheduleCooldownRefresh,
  refreshExpiredCooldownState: refreshExpiredCooldownState,
  nextCooldownDelayMs: nextCooldownDelayMs,
  stats: function () { return { postCalls: postCalls, renderCalls: renderCalls, scheduled: scheduled.slice(), cleared: cleared.slice() }; },
};`,
)();
cooldownRefreshRuntime.setState({
  adopted: true,
  cooldowns: { next_expires_at: '2026-08-22T12:00:10.000Z', entries: [
    { expires_at: '2026-08-22T12:00:10.000Z', remaining_seconds: 10 },
    { expires_at: '2026-08-22T12:00:10.000Z', remaining_seconds: 10 },
  ] },
});
cooldownRefreshRuntime.scheduleCooldownRefresh();
cooldownRefreshRuntime.scheduleCooldownRefresh();
assert.equal(cooldownRefreshRuntime.stats().scheduled.length, 2,
  'scheduling may replace a pending expiry timer');
assert.equal(cooldownRefreshRuntime.stats().cleared.length, 1,
  'cooldown expiry refresh must debounce by clearing the previous timer');
await Promise.all([
  cooldownRefreshRuntime.refreshExpiredCooldownState(),
  cooldownRefreshRuntime.refreshExpiredCooldownState(),
]);
assert.equal(cooldownRefreshRuntime.stats().postCalls, 1,
  'concurrent expiry refresh attempts must collapse to one state refresh');
assert.equal(cooldownRefreshRuntime.stats().renderCalls, 1,
  'one expiry refresh should render exactly once');
cooldownRefreshRuntime.setState({
  adopted: true,
  cooldowns: { next_expires_at: '2026-08-22T12:00:10.000Z', entries: [
    { expires_at: '2026-08-22T12:00:10.000Z', remaining_seconds: 0 },
  ] },
});
await cooldownRefreshRuntime.refreshExpiredCooldownState();
assert.ok(cooldownRefreshRuntime.stats().scheduled.some((entry) => entry.delay === 1000),
  'same-key expired refreshes must retry later instead of being silently dropped');
cooldownRefreshRuntime.setState({
  adopted: true,
  cooldowns: { next_expires_at: '2026-08-22T11:59:59.000Z', entries: [
    { expires_at: '2026-08-22T11:59:59.000Z', remaining_seconds: 0 },
  ] },
});
cooldownRefreshRuntime.setBusy(true);
cooldownRefreshRuntime.refreshExpiredCooldownState();
assert.ok(cooldownRefreshRuntime.stats().scheduled.some((entry) => entry.delay === 1000),
  'busy cooldown expiry refreshes must retry later instead of being dropped');
cooldownRefreshRuntime.setBusy(false);

const dailyJourneyMarkupSource = extractTestExport(client, 'dailyJourneyMarkup');
assert.ok(dailyJourneyMarkupSource, 'Daily Journey markup helper must be extractable for runtime coverage');
const dailyJourneyRuntime = new Function(
  'dailyAuthority',
  'completedMissions',
  'guidance',
  'growth',
  'stateValue',
  `function number(value) { return Number(value || 0).toLocaleString('en-US'); }
function escapeHtml(value) { return String(value == null ? '' : value); }
function words(value) { return String(value == null ? '' : value).replace(/_/g, ' ').toUpperCase(); }
function meter(label, percent) { return '<meter>' + label + ':' + percent + '</meter>'; }
${dailyJourneyMarkupSource}; return dailyJourneyMarkup(dailyAuthority, completedMissions, guidance, growth, stateValue);`,
);
assert.match(dailyJourneyRuntime({}, 2, {}, {}), /DAILY JOURNEY \/\/ SYNCING/,
  'missing Daily Journey authority must render a syncing state');
assert.doesNotMatch(dailyJourneyRuntime({}, 2, {}, {}), /\d+\/0 OBJECTIVES/,
  'missing Daily Journey authority must not render an X/0 objective counter');
assert.match(dailyJourneyRuntime({ completed_objectives: 2, required_objectives: 3 }, 0, {}, {}), /DAILY JOURNEY \/\/ 2\/3 OBJECTIVES/,
  'complete Daily Journey authority must still render objective progress');
assert.match(dailyJourneyRuntime({ completed_objectives: 2, required_objectives: 3 }, 0, {}, {}, { lifecycle: { phase: 'young' } }), /DAILY JOURNEY \/\/ 2\/3 OBJECTIVES/,
  'hatched young pet must still render normal Daily Journey progress when authority is available');
assert.match(dailyJourneyRuntime({ completed_objectives: 2, required_objectives: 3 }, 0, {}, {}), /NEXT \/\/ Daily Journey: 2\/3 complete - finish 1 more daily objective for Growth Mark eligibility/,
  'incomplete Daily Journey must guide the next eligible objective count from authority');
assert.match(dailyJourneyRuntime({ completed_objectives: 3, required_objectives: 3, growth_mark_awarded: true, reason: 'daily_journey_qualified' }, 0, {}, {}), /GROWTH MARK ALREADY SETTLED/,
  'settled Daily Journey Growth Mark state must use settled copy');
assert.match(dailyJourneyRuntime({ reason: 'active_pet_required', required_objectives: 0, completed_objectives: 0 }, 0, {}, {}), /Journey progress starts after you have a hatched active Moonpet/,
  'Daily Journey must guide players without an active seasonal pet');
const noActivePetDailyMarkup = dailyJourneyRuntime({ reason: 'active_pet_required', required_objectives: 0, completed_objectives: 0 }, 0, {}, {});
assert.match(noActivePetDailyMarkup, /NEXT \/\/ Initialise, incubate, or hatch your Moonpet before Daily Journey progress starts\./,
  'Daily Journey active-pet-required NEXT copy must be distinct and actionable');
assert.equal((noActivePetDailyMarkup.match(/Journey progress starts after you have a hatched active Moonpet/g) || []).length, 1,
  'Daily Journey active-pet-required markup must not duplicate the same guidance sentence');
const adoptedEggDailyMarkup = dailyJourneyRuntime({
  completed_objectives: 0,
  required_objectives: 3,
  reason: 'daily_journey_in_progress',
}, 0, {}, {}, { lifecycle: { phase: 'egg' } });
assert.match(adoptedEggDailyMarkup, /DAILY JOURNEY \/\/ HATCH REQUIRED/,
  'adopted egg Daily Journey must render hatch-required locked copy');
assert.match(adoptedEggDailyMarkup, /NEXT \/\/ Incubate or HATCH MOONPET before Daily Journey progress starts\./,
  'adopted egg Daily Journey must guide incubation or hatch before progress');
assert.doesNotMatch(adoptedEggDailyMarkup, /0\/3 OBJECTIVES|Growth Mark awarded|Growth Mark eligibility|Daily clear progress|qualify/i,
  'adopted egg Daily Journey must not render objective progress, Growth Mark, Daily clear, or qualification copy');

const weeklyJourneyMarkupSource = extractTestExport(client, 'weeklyJourneyMarkup');
assert.ok(weeklyJourneyMarkupSource, 'Weekly Journey markup helper must be extractable for runtime coverage');
const weeklyJourneyRuntime = new Function(
  'weeklyAuthority',
  'weeklyCapability',
  'stateValue',
  `function number(value) { return Number(value || 0).toLocaleString('en-US'); }
function escapeHtml(value) { return String(value == null ? '' : value); }
function words(value) { return String(value == null ? '' : value).replace(/_/g, ' ').toUpperCase(); }
function meter(label, percent) { return '<meter>' + label + ':' + percent + '</meter>'; }
${weeklyJourneyMarkupSource}; return weeklyJourneyMarkup(weeklyAuthority, weeklyCapability, stateValue);`,
);
const zeroWeeklyMarkup = weeklyJourneyRuntime({
  state: 'AVAILABLE',
  qualification_week: 2,
  week_reset_at: '2026-08-24T00:00:00.000Z',
  completed_objectives: 0,
  required_objectives: 5,
  reason: 'weekly_journey_in_progress',
  objectives: [
    { objective_id: 'weekly_care', progress: 0, target: 5, completed: false },
    { objective_id: 'weekly_training', progress: 0, target: 3, completed: false },
    { objective_id: 'weekly_run', progress: 0, target: 3, completed: false },
    { objective_id: 'weekly_boss_attempt', progress: 0, target: 1, completed: false },
    { objective_id: 'weekly_check_in', progress: 0, target: 2, completed: false },
  ],
}, {});
assert.match(zeroWeeklyMarkup, /WEEKLY JOURNEY \/\/ 0\/5 OBJECTIVES/, 'Weekly Journey must render 0/5 when live authority is available');
assert.match(zeroWeeklyMarkup, /Weekly care actions \/\/ 0\/5 \/\/ INCOMPLETE/, 'Weekly Journey must show clear objective names and incomplete state');
assert.match(zeroWeeklyMarkup, /RESET 2026-08-24T00:00:00.000Z/, 'Weekly Journey must render reset timing when authority provides it');
assert.match(weeklyJourneyRuntime({
  state: 'AVAILABLE',
  qualification_week: 2,
  completed_objectives: 0,
  required_objectives: 5,
  reason: 'weekly_journey_in_progress',
  objectives: [],
}, {}, { lifecycle: { phase: 'young' } }), /WEEKLY JOURNEY \/\/ 0\/5 OBJECTIVES/,
  'hatched young pet must still render normal Weekly Journey progress when authority is available');
const adoptedEggWeeklyMarkup = weeklyJourneyRuntime({
  state: 'AVAILABLE',
  completed_objectives: 0,
  required_objectives: 5,
  reason: 'weekly_journey_in_progress',
  objectives: [
    { objective_id: 'weekly_care', progress: 0, target: 5, completed: false },
    { objective_id: 'weekly_training', progress: 0, target: 3, completed: false },
  ],
}, {}, { lifecycle: { phase: 'egg' } });
assert.match(adoptedEggWeeklyMarkup, /WEEKLY JOURNEY \/\/ HATCH REQUIRED/,
  'adopted egg Weekly Journey must render hatch-required locked copy');
assert.match(adoptedEggWeeklyMarkup, /NEXT \/\/ Incubate or HATCH MOONPET before Weekly Journey progress starts\./,
  'adopted egg Weekly Journey must guide incubation or hatch before progress');
assert.match(adoptedEggWeeklyMarkup, /No Daily or Weekly objective progress is shown until you have an active hatched seasonal Moonpet\./,
  'adopted egg Weekly Journey must keep active hatched seasonal Moonpet detail');
assert.doesNotMatch(adoptedEggWeeklyMarkup, /0\/5 OBJECTIVES|Weekly Crest ready|Weekly Crest already settled|Weekly care actions|qualification|qualify/i,
  'adopted egg Weekly Journey must not render objective progress, Crest, objective list, or qualification copy');
assert.doesNotMatch(adoptedEggDailyMarkup + adoptedEggWeeklyMarkup, /Growth Mark awarded|Weekly Crest ready|0\/3|0\/5|qualify/i,
  'adopted egg Journey panel copy must not mention fake awards, objective counters, or qualification copy');
assert.match(weeklyJourneyRuntime({
  state: 'AVAILABLE',
  completed_objectives: 0,
  required_objectives: 5,
  objectives: [],
}, { completed_objectives: 4, required_objectives: 5 }), /WEEKLY JOURNEY \/\/ 0\/5 OBJECTIVES/,
  'Weekly Journey must preserve authoritative zero completed objectives over nonzero capability fallback');
const emptyObjectiveWeeklyMarkup = weeklyJourneyRuntime({
  state: 'AVAILABLE',
  completed_objectives: 0,
  required_objectives: 5,
  objectives: [],
}, {});
assert.match(emptyObjectiveWeeklyMarkup, /REMAINING \/\/ Waiting for server-confirmed objectives/,
  'incomplete Weekly Journey with no objective list must wait for server-confirmed objectives');
assert.doesNotMatch(emptyObjectiveWeeklyMarkup, /REMAINING \/\/ No remaining weekly objectives/,
  'incomplete Weekly Journey with no objective list must not look complete');
const partialWeeklyMarkup = weeklyJourneyRuntime({
  state: 'AVAILABLE',
  qualification_week: 2,
  completed_objectives: 2,
  required_objectives: 5,
  reason: 'weekly_journey_in_progress',
  objectives: [
    { objective_id: 'weekly_care', progress: 5, target: 5, completed: true },
    { objective_id: 'weekly_training', progress: 1, target: 3, completed: false },
    { objective_id: 'weekly_run', progress: 3, target: 3, completed: true },
  ],
}, {});
assert.match(partialWeeklyMarkup, /WEEKLY JOURNEY \/\/ 2\/5 OBJECTIVES/, 'Weekly Journey must render partial progress');
assert.match(partialWeeklyMarkup, /Weekly training sessions \/\/ 1\/3 \/\/ INCOMPLETE/, 'Weekly Journey must keep incomplete partial objectives visible');
assert.match(partialWeeklyMarkup, /NEXT \/\/ Weekly Journey: 2\/5 complete - remaining: Weekly training sessions/,
  'Weekly Journey must show next-action guidance from remaining authoritative objectives');
assert.match(partialWeeklyMarkup, /REMAINING \/\/ Weekly training sessions/,
  'Weekly Journey must clearly list remaining objectives');
const completeWeeklyMarkup = weeklyJourneyRuntime({
  state: 'AVAILABLE',
  qualification_week: 2,
  completed_objectives: 5,
  required_objectives: 5,
  reason: 'weekly_journey_ready',
  weekly_crest_awarded: false,
  objectives: [],
}, {});
assert.match(completeWeeklyMarkup, /WEEKLY JOURNEY \/\/ 5\/5 OBJECTIVES/, 'Weekly Journey must render complete progress');
assert.match(completeWeeklyMarkup, /WEEKLY CREST READY FOR SERVER SETTLEMENT/, 'complete but unsettled Weekly Journey must not fake an awarded Crest');
assert.match(completeWeeklyMarkup, /Weekly Journey complete - Weekly Crest is ready for server settlement/,
  'complete but unsettled Weekly Journey must guide server settlement without claim language');
const authoritativeFalseCrestMarkup = weeklyJourneyRuntime({
  state: 'AVAILABLE',
  completed_objectives: 5,
  required_objectives: 5,
  weekly_crest_awarded: false,
  duplicate_blocked: false,
  objectives: [],
}, { weekly_crest_awarded: true, duplicate_blocked: true });
assert.match(authoritativeFalseCrestMarkup, /WEEKLY CREST READY FOR SERVER SETTLEMENT/,
  'Weekly Journey must preserve authoritative false Crest booleans over stale capability true values');
assert.doesNotMatch(authoritativeFalseCrestMarkup, /WEEKLY CREST ALREADY SETTLED|DUPLICATE WEEKLY CREST BLOCKED/,
  'stale capability Crest booleans must not override explicit authority false values');
const settledWeeklyMarkup = weeklyJourneyRuntime({
  state: 'AVAILABLE',
  qualification_week: 2,
  completed_objectives: 5,
  required_objectives: 5,
  reason: 'weekly_journey_qualified',
  weekly_crest_awarded: true,
  objectives: [],
}, {});
assert.match(settledWeeklyMarkup, /WEEKLY CREST ALREADY SETTLED/, 'already-settled Weekly Crest must not appear claimable again');
assert.match(settledWeeklyMarkup, /Weekly Crest already settled - keep daily routines moving until next reset/,
  'settled Weekly Crest state must guide routine play until reset');
const failedWeeklyMarkup = weeklyJourneyRuntime({
  state: 'LOCKED',
  reason: 'weekly_journey_authority_syncing',
  completed_objectives: 0,
  required_objectives: 5,
}, {});
assert.match(failedWeeklyMarkup, /WEEKLY JOURNEY \/\/ SYNCING/, 'authority failure must render syncing copy');
assert.doesNotMatch(failedWeeklyMarkup, /WEEKLY JOURNEY \/\/ 0\/5 OBJECTIVES/, 'authority failure must not show fake available 0/5 progress');
const noActivePetWeeklyMarkup = weeklyJourneyRuntime({
  state: 'LOCKED',
  reason: 'active_pet_required',
  completed_objectives: 0,
  required_objectives: 5,
}, {});
assert.match(noActivePetWeeklyMarkup, /WEEKLY JOURNEY \/\/ ACTIVE PET REQUIRED/, 'no active pet state must be clear and safe');
assert.match(noActivePetWeeklyMarkup, /Journey progress starts after you have a hatched active Moonpet/,
  'Weekly Journey must guide players without an active seasonal pet');
assert.match(noActivePetWeeklyMarkup, /NEXT \/\/ Initialise, incubate, hatch, or select an active seasonal Moonpet before Weekly Journey progress starts\./,
  'Weekly Journey active-pet-required NEXT copy must be distinct and actionable');
assert.equal((noActivePetWeeklyMarkup.match(/Journey progress starts after you have a hatched active Moonpet/g) || []).length, 1,
  'Weekly Journey active-pet-required markup must not duplicate the same guidance sentence');
assert.match(noActivePetWeeklyMarkup, /No Daily or Weekly objective progress is shown until you have an active hatched seasonal Moonpet\./,
  'Weekly Journey active-pet-required detail must name the active hatched seasonal Moonpet requirement');
const comingSoonWeeklyMarkup = weeklyJourneyRuntime({
  state: 'COMING_SOON',
  completed_objectives: 0,
  required_objectives: 5,
}, {});
assert.match(comingSoonWeeklyMarkup, /WEEKLY JOURNEY \/\/ PLANNED EXPANSION/,
  'COMING_SOON Weekly Journey must render planned expansion title');
assert.match(comingSoonWeeklyMarkup, /NEXT \/\/ Weekly Journey is planned expansion\./,
  'COMING_SOON Weekly Journey guidance must use planned expansion copy');
assert.doesNotMatch(comingSoonWeeklyMarkup, /authority is syncing/i,
  'COMING_SOON Weekly Journey must not say authority is syncing');
assert.doesNotMatch(comingSoonWeeklyMarkup, /Complete objectives to qualify/,
  'COMING_SOON Weekly Journey must not ask players to complete objectives');

const nextGuidanceSource = extractTestExport(client, 'nextGuidance');
assert.ok(nextGuidanceSource, 'NEXT guidance helpers must be extractable for runtime coverage');
function nextGuidanceRuntime(stateValue) {
  return new Function(
    'state',
    `function number(value) { return Number(value || 0).toLocaleString('en-US'); }
function escapeHtml(value) { return String(value == null ? '' : value); }
function words(value) { return String(value == null ? '' : value).replace(/_/g, ' ').toUpperCase(); }
function meter(label, percent) { return '<meter>' + label + ':' + percent + '</meter>'; }
function panel(title, body, panelId) { return '<section' + (panelId ? ' data-panel="' + panelId + '"' : '') + '><h2>' + title + '</h2>' + body + '</section>'; }
function button(label, action, payload, options) { return '<button data-action="' + action + '">' + label + '</button>'; }
${nextGuidanceSource}; return { homeNextLine, profileNextLine, exploreNextLine, firstSessionExploreMarkup };`,
  )(stateValue);
}
assert.equal(nextGuidanceRuntime({
  adopted: false,
  pet: null,
}).homeNextLine(), 'Initialise a Moon Egg to begin.',
  'unadopted Home guidance must point to Moon Egg initialisation');
assert.equal(nextGuidanceRuntime({
  adopted: false,
  pet: null,
}).profileNextLine(), 'Initialise a Moon Egg to begin.',
  'unadopted Profile guidance must say initialise first instead of missing progression');
const unadoptedExploreMarkup = nextGuidanceRuntime({
  adopted: false,
  pet: null,
  weekly_journey: { objectives: [] },
}).firstSessionExploreMarkup();
assert.match(unadoptedExploreMarkup, /Initialise a Moon Egg before district routes, bosses, Arena, Kaiju, or pet work open/,
  'unadopted Explore guidance must explain initialisation before active pet work');
assert.doesNotMatch(unadoptedExploreMarkup, /START MOON RUN|DAILY RUN|Complete Weekly boss attempt|Restore energy|Start a Moon Run/,
  'unadopted Explore guidance must not recommend Moon Run, energy restore, boss, Arena, Kaiju, or active pet work');
assert.doesNotMatch(unadoptedExploreMarkup, /FIND PLAYER BATTLE|ENTER SOLO ARENA|FIND KAIJU PLAYER|START SOLO KAIJU/,
  'unadopted first-session Explore guidance must not expose Arena or Kaiju entry actions');
assert.doesNotMatch(unadoptedExploreMarkup, /Growth Mark|Weekly Crest|Daily Journey:|Weekly Journey:|0\/[35] OBJECTIVES/,
  'unadopted first-session Explore guidance must not fake Daily or Weekly progress');
['districts', 'moon-run', 'weekly-boss', 'story-chains', 'seasonal-boss', 'arena', 'kaiju'].forEach((panelId) => {
  assert.match(unadoptedExploreMarkup, new RegExp(`data-panel="${panelId}"`),
    `unadopted first-session Explore markup must preserve ${panelId} jump target`);
});
const unavailableSlotGuidance = nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', pet_name: 'Luna' },
  season_slots: { unavailable: true, slots: [] },
  lifecycle: { phase: 'adult' },
}).profileNextLine();
assert.equal(unavailableSlotGuidance, 'Season slot authority is syncing. Active Moonpet guidance will refresh when server authority is available.',
  'adopted state with unavailable season-slot authority must show syncing guidance');
assert.notEqual(unavailableSlotGuidance, 'Pick an active seasonal Moonpet before journey progress starts.',
  'unavailable season-slot authority must not be confused with a genuinely empty active slot');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', pet_name: 'Luna' },
  season_slots: { slots: [{ pet_id: 'pet-a', active: true }] },
  lifecycle: { phase: 'egg' },
  active_pet_progression: { lifecycle: { evolution_ready: false } },
}).profileNextLine(), 'Incubate your Moon Egg until the hatch signal is ready.',
  'authoritative state lifecycle phase must keep egg guidance even when progression lifecycle lacks phase');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', pet_name: 'Moon Egg' },
  lifecycle: { phase: 'egg', incubation: { ready: false, progress: 4, target: 12 } },
}).homeNextLine(), 'Incubate with care signals until the hatch signal is ready.',
  'egg Home guidance must explain incubation signals');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', pet_name: 'Moon Egg' },
  lifecycle: { phase: 'egg', incubation: { ready: true, progress: 12, target: 12 } },
}).homeNextLine(), 'HATCH MOONPET to wake your first companion.',
  'hatch-ready Home guidance must point directly to HATCH MOONPET');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', pet_name: 'Moon Egg' },
  lifecycle: { phase: 'egg', incubation: { ready: true, progress: 12, target: 12 } },
}).profileNextLine(), 'HATCH MOONPET to wake your first companion.',
  'hatch-ready Profile NEXT guidance must point directly to HATCH MOONPET');
const eggExploreRuntime = nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', energy: 12 },
  lifecycle: { phase: 'egg', incubation: { ready: false, progress: 5, target: 12 } },
  weekly_journey: { objectives: [{ objective_id: 'weekly_boss_attempt', progress: 0, target: 1, completed: false }] },
  guidance: { weekly_boss: { available: true } },
});
assert.equal(eggExploreRuntime.exploreNextLine(), 'Incubate or HATCH MOONPET before Explore actions open.',
  'egg Explore NEXT guidance must prefer hatch/incubation over combat or Moon Run');
const eggExploreMarkup = eggExploreRuntime.firstSessionExploreMarkup();
assert.match(eggExploreMarkup, /Journey progress starts after hatching, when server authority can bind objectives to the active pet/,
  'egg Explore guidance must explain Journey progress starts after hatching');
assert.doesNotMatch(eggExploreMarkup, /START MOON RUN|DAILY RUN|Complete Weekly boss attempt|Restore energy|Start a Moon Run/,
  'egg Explore guidance must not recommend Moon Run, boss, or energy actions');
assert.doesNotMatch(eggExploreMarkup, /FIND PLAYER BATTLE|ENTER SOLO ARENA|FIND KAIJU PLAYER|START SOLO KAIJU/,
  'egg first-session Explore guidance must not expose Arena or Kaiju entry actions');
assert.doesNotMatch(eggExploreMarkup, /Growth Mark|Weekly Crest|Daily Journey:|Weekly Journey:|0\/[35] OBJECTIVES/,
  'egg first-session Explore guidance must not fake Daily or Weekly progress');
['districts', 'moon-run', 'weekly-boss', 'story-chains', 'seasonal-boss', 'arena', 'kaiju'].forEach((panelId) => {
  assert.match(eggExploreMarkup, new RegExp(`data-panel="${panelId}"`),
    `egg first-session Explore markup must preserve ${panelId} jump target`);
});
assert.match(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', energy: 12 },
  lifecycle: { phase: 'egg', incubation: { ready: false, progress: 5, target: 12 } },
  arena: { battle_id: 'arena-1' },
}).firstSessionExploreMarkup(), /FORFEIT MATCH/,
  'egg Explore markup must preserve stale Arena active-match cleanup');
assert.match(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', energy: 12 },
  lifecycle: { phase: 'egg', incubation: { ready: false, progress: 5, target: 12 } },
  arena_queue: { position: 1 },
}).firstSessionExploreMarkup(), /CANCEL QUEUE/,
  'egg Explore markup must preserve stale Arena queue cleanup');
assert.match(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', energy: 12 },
  lifecycle: { phase: 'egg', incubation: { ready: false, progress: 5, target: 12 } },
  kaiju: { match: { match_id: 'kaiju-1', mode: 'solo' } },
}).firstSessionExploreMarkup(), /CANCEL MATCH/,
  'egg Explore markup must preserve stale Kaiju solo-match cleanup');
assert.match(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', energy: 12 },
  lifecycle: { phase: 'egg', incubation: { ready: false, progress: 5, target: 12 } },
  kaiju: { queue: { position: 1 } },
}).firstSessionExploreMarkup(), /CANCEL QUEUE/,
  'egg Explore markup must preserve stale Kaiju queue cleanup');
assert.equal(nextGuidanceRuntime({
  adopted: false,
  pet: null,
  weekly_journey: { objectives: [] },
}).exploreNextLine(), 'Initialise a Moon Egg to begin.',
  'unadopted players with no pet must be guided to initialise before energy recovery');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  lifecycle: { phase: 'young' },
  guidance: { weekly_boss: { available: true } },
  pet: { energy: 12 },
  weekly_journey: { objectives: [{ objective_id: 'weekly_boss_attempt', progress: 0, target: 1, completed: false }] },
}).exploreNextLine(), 'Complete Weekly boss attempt to progress Weekly Journey.',
  'available incomplete Weekly boss objective must recommend the boss attempt');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  lifecycle: { phase: 'young' },
  guidance: { weekly_boss: { available: false } },
  pet: { energy: 12 },
  weekly_journey: { objectives: [{ objective_id: 'weekly_boss_attempt', progress: 0, target: 1, completed: false }] },
}).exploreNextLine(), 'Build level and energy before the Weekly boss attempt.',
  'unavailable incomplete Weekly boss objective must not recommend a blocked boss attempt');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  lifecycle: { phase: 'young' },
  pet: { energy: 12 },
  weekly_journey: { objectives: [] },
}).exploreNextLine(), 'Start a Moon Run or pick an available Explore action.',
  'sufficient energy with no active run may recommend a Moon Run');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  lifecycle: { phase: 'young' },
  pet: { energy: 3 },
  weekly_journey: { objectives: [] },
}).exploreNextLine(), 'Restore energy before starting a Moon Run.',
  'low energy with no active run must not recommend a Moon Run');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', level: 1, pet_xp: 0, energy: 20 },
  lifecycle: { phase: 'young' },
  season_slots: { slots: [{ pet_id: 'pet-a', active: true, pet: { progression: { lifecycle: { evolution_ready: false }, growth_marks: { earned: 0 }, weekly_crests: { earned: 0 } } } }] },
  daily_journey: { completed_objectives: 0 },
  weekly_journey: { completed_objectives: 0 },
}).profileNextLine(), 'Start with first care, then follow the first server-authoritative Journey objective when it appears.',
  'newly hatched Profile guidance must move into first care and authority-backed Journey action');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', level: 3, pet_xp: 120, energy: 20 },
  lifecycle: { phase: 'young' },
  season_slots: { slots: [{ pet_id: 'pet-a', active: true, pet: { progression: { lifecycle: { evolution_ready: false }, growth_marks: { earned: 0 }, weekly_crests: { earned: 0 } } } }] },
  daily_journey: { completed_objectives: 0 },
  weekly_journey: { completed_objectives: 0 },
}).profileNextLine(), 'Keep the active seasonal Moonpet moving through Daily and Weekly Journey objectives.',
  'established young pet guidance must keep general Daily/Weekly Journey copy');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', level: 8, pet_xp: 600, energy: 20 },
  lifecycle: { phase: 'adult' },
  season_slots: { slots: [{ pet_id: 'pet-a', active: true, pet: { progression: { lifecycle: { evolution_ready: false }, growth_marks: { earned: 1 }, weekly_crests: { earned: 0 } } } }] },
}).profileNextLine(), 'Keep the active seasonal Moonpet moving through Daily and Weekly Journey objectives.',
  'adult pet guidance must keep general Daily/Weekly Journey copy');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', level: 12, pet_xp: 1000, energy: 20 },
  lifecycle: { phase: 'rare' },
  season_slots: { slots: [{ pet_id: 'pet-a', active: true, pet: { progression: { lifecycle: { evolution_ready: false }, growth_marks: { earned: 2 }, weekly_crests: { earned: 1 } } } }] },
}).profileNextLine(), 'Keep the active seasonal Moonpet moving through Daily and Weekly Journey objectives.',
  'rare pet guidance must keep general Daily/Weekly Journey copy');
assert.equal(nextGuidanceRuntime({
  adopted: true,
  pet: { pet_id: 'pet-a', level: 1, pet_xp: 0, energy: 20 },
  lifecycle: { phase: 'young', evolution_ready: true },
  season_slots: { slots: [{ pet_id: 'pet-a', active: true, pet: { progression: { lifecycle: { evolution_ready: false }, growth_marks: { earned: 0 }, weekly_crests: { earned: 0 } } } }] },
}).profileNextLine(), 'Evolve your active Moonpet when you are ready.',
  'evolution-ready guidance must win over first-care copy');

const journeyActionProgressSource = extractTestExport(client, 'journeyActionProgress');
assert.ok(journeyActionProgressSource, 'Journey action progress helper must be extractable for runtime coverage');
const journeyActionProgressRuntime = new Function(
  'beforeState',
  'afterState',
  'result',
  `function number(value) { return Number(value || 0).toLocaleString('en-US'); }
function words(value) { return String(value == null ? '' : value).replace(/_/g, ' ').toUpperCase(); }
${weeklyJourneyMarkupSource}
${journeyActionProgressSource}; return journeyActionProgressLines(beforeState, afterState, result);`,
);
assert.deepEqual(journeyActionProgressRuntime({
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 1, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-a', season_key: 's1', qualification_week: 2, completed_objectives: 1, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 1, target: 5 }] },
}, {
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 2, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-a', season_key: 's1', qualification_week: 2, completed_objectives: 1, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 2, target: 5 }] },
}, { accepted: true }), [
  'Daily Journey +1 objective (2/3).',
  'Weekly care actions 2/5.',
], 'accepted action feedback must display server-confirmed journey progress context');
assert.deepEqual(journeyActionProgressRuntime({
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 1, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-a', season_key: 's1', qualification_week: 2, completed_objectives: 1, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 1, target: 5 }] },
}, {
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 2, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-a', season_key: 's1', qualification_week: 2, completed_objectives: 1, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 2, target: 5 }] },
}, { accepted: false }), [], 'rejected actions must not display journey success or progress context');
assert.deepEqual(journeyActionProgressRuntime({
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 1, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-a', season_key: 's1', qualification_week: 2, completed_objectives: 1, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 1, target: 5 }] },
}, {
  pet: { pet_id: 'pet-b' },
  daily_journey: { pet_id: 'pet-b', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 3, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-b', season_key: 's1', qualification_week: 2, completed_objectives: 4, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 5, target: 5 }] },
}, { accepted: true }), [], 'switching active pets must not report the newly active pet existing journey counters as progress');
assert.deepEqual(journeyActionProgressRuntime({
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-19', completed_objectives: 1, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-a', season_key: 's1', qualification_week: 1, completed_objectives: 1, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 1, target: 5 }] },
}, {
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 3, required_objectives: 3 },
  weekly_journey: { pet_id: 'pet-a', season_key: 's1', qualification_week: 2, completed_objectives: 4, required_objectives: 5, objectives: [{ objective_id: 'weekly_care', progress: 5, target: 5 }] },
}, { accepted: true }), [], 'changed Daily or Weekly journey periods must not report carried-over counters as new progress');
assert.deepEqual(journeyActionProgressRuntime({}, {
  weekly_journey: { state: 'LOCKED', reason: 'weekly_journey_authority_syncing', completed_objectives: 0, required_objectives: 5, objectives: [] },
}, { accepted: true }), [], 'authority-unavailable state must not fake journey progress in action feedback');

const actionResultFeedbackSource = extractTestExport(client, 'actionResultFeedback');
assert.ok(actionResultFeedbackSource, 'action result feedback helper must be extractable for runtime coverage');
const actionResultFeedbackRuntime = new Function(
  'result',
  'beforeState',
  'afterState',
  `function number(value) { return Number(value || 0).toLocaleString('en-US'); }
function words(value) { return String(value == null ? '' : value).replace(/_/g, ' ').replace(/\\b\\w/g, (letter) => letter.toUpperCase()); }
${weeklyJourneyMarkupSource}
${journeyActionProgressSource}
${actionResultFeedbackSource}; return { resultMessage: resultMessage(result, beforeState, afterState), actionFeedback: actionFeedback(result, beforeState, afterState) };`,
);
const blockedResultFeedback = actionResultFeedbackRuntime({
  accepted: false,
  reason: 'moon_egg_must_hatch',
  pet_xp_awarded: 99,
  rewards: { moon_gold: 50 },
  daily_journey: { accepted: true },
}, {
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 1, required_objectives: 3 },
}, {
  pet: { pet_id: 'pet-a' },
  daily_journey: { pet_id: 'pet-a', season_key: 's1', utc_day: '2026-08-20', completed_objectives: 2, required_objectives: 3 },
});
assert.match(blockedResultFeedback.resultMessage, /ACTION BLOCKED - hatch your Moonpet first\./,
  'blocked action result must show useful reason copy');
assert.doesNotMatch(blockedResultFeedback.resultMessage, /Daily Journey|GROWTH MARK|\+99|\+50/,
  'rejected action result must not show journey progress or reward language');
assert.deepEqual(blockedResultFeedback.actionFeedback.lines, ['ACTION BLOCKED', 'hatch your Moonpet first.'],
  'blocked canvas feedback must keep reason-only copy');
const blockedWithoutReason = actionResultFeedbackRuntime({ accepted: false }, {}, {});
assert.equal(blockedWithoutReason.resultMessage, 'ACTION BLOCKED',
  'rejected action without reason must not render a dangling hyphen');
assert.deepEqual(blockedWithoutReason.actionFeedback.lines, ['ACTION BLOCKED'],
  'rejected action without reason must not add a blank canvas feedback line');
const duplicateWithoutReason = actionResultFeedbackRuntime({ accepted: false, duplicate: true }, {}, {});
assert.equal(duplicateWithoutReason.resultMessage, 'ACTION BLOCKED // Duplicate blocked by authority.',
  'rejected duplicate without reason must still show duplicate terminal copy');
assert.deepEqual(duplicateWithoutReason.actionFeedback.lines, ['ACTION BLOCKED', 'DUPLICATE BLOCKED'],
  'rejected duplicate without reason must still show duplicate canvas copy');
const acceptedWithoutReason = actionResultFeedbackRuntime({
  accepted: true,
  result_copy: 'Moonpet settled in.',
  rewards: { moon_gold: 25 },
}, {}, {}).resultMessage;
assert.match(acceptedWithoutReason, /ACTION ACCEPTED/,
  'accepted action result must keep accepted copy');
assert.match(acceptedWithoutReason, /Moonpet settled in\./,
  'accepted action result without reason must keep result copy');
assert.match(acceptedWithoutReason, /\+25 Moon Gold/,
  'accepted action result without reason must keep reward copy');
assert.doesNotMatch(acceptedWithoutReason, /ACTION ACCEPTED \/\/\s*\/\//,
  'accepted action result without reason must not render an empty reason separator');
assert.match(actionResultFeedbackRuntime({ accepted: false, reason: 'cooldown' }, {}, {}).resultMessage, /ACTION BLOCKED - wait for cooldown\./,
  'cooldown rejection copy must be plain language');
assert.match(actionResultFeedbackRuntime({ accepted: false, reason: 'insufficient_gold' }, {}, {}).resultMessage, /ACTION BLOCKED - not enough Moon Gold\./,
  'Moon Gold rejection copy must be plain language');
const petCurrencyBlock = actionResultFeedbackRuntime({ accepted: false, reason: 'not_enough_pet_currency' }, {}, {}).resultMessage;
assert.match(petCurrencyBlock, /ACTION BLOCKED - not enough required currency\./,
  'generic pet-currency rejection copy must be currency-neutral');
assert.doesNotMatch(petCurrencyBlock, /Moon Gold/,
  'generic pet-currency rejection copy must not mention Moon Gold');
assert.match(actionResultFeedbackRuntime({ accepted: false, reason: 'insufficient_crystals' }, {}, {}).resultMessage, /ACTION BLOCKED - not enough Moon Crystals\./,
  'Moon Crystal rejection copy must remain specific');
assert.match(actionResultFeedbackRuntime({ accepted: false, reason: 'insufficient_style' }, {}, {}).resultMessage, /ACTION BLOCKED - not enough Style Tokens\./,
  'Style Token rejection copy must remain specific');
assert.match(actionResultFeedbackRuntime({ accepted: false, reason: 'weekly_journey_authority_syncing' }, {}, {}).resultMessage, /ACTION BLOCKED - Weekly Journey authority syncing\./,
  'authority-syncing rejection copy must be plain language');
const unadoptedBlock = actionResultFeedbackRuntime({ accepted: false, reason: 'pet_not_adopted' }, {}, {}).resultMessage;
assert.match(unadoptedBlock, /ACTION BLOCKED - initialise your Moonpet first\./,
  'unadopted rejection copy must tell players to initialise first');
assert.doesNotMatch(unadoptedBlock, /hatch your Moonpet first/,
  'unadopted rejection copy must not tell players to hatch before they have a Moonpet');
const completedSeasonBlock = actionResultFeedbackRuntime({ accepted: false, reason: 'completed_season_pet_required' }, {}, {}).resultMessage;
assert.match(completedSeasonBlock, /ACTION BLOCKED - completed Season pet required\./,
  'completed-season rejection copy must name the completed pet requirement');
assert.doesNotMatch(completedSeasonBlock, /active seasonal Moonpet required/,
  'completed-season rejection copy must not be confused with active-pet gating');

// Keep every executable client-source test on marker boundaries so merges and
// Windows checkouts cannot reintroduce indentation/newline-sensitive regexes.
const TEST_EXPORT_NAMES = [
  'seasonTiming', 'callsignDraft', 'capabilityCombatHelper', 'actionAvailability', 'dailyJourneyMarkup', 'weeklyJourneyMarkup', 'nextGuidance', 'journeyActionProgress', 'actionResultFeedback', 'stateRequestGate', 'phase4PresenceDirector',
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
  { petId: dirtySamePetDraft.petId, petName: dirtySamePetDraft.petName, value: dirtySamePetDraft.value, dirty: dirtySamePetDraft.dirty, focused: dirtySamePetDraft.focused },
  { petId: 'pet-a', petName: 'Server A', value: 'Local A', dirty: true, focused: true },
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

draftState.pet = { pet_id: 'pet-a', pet_name: 'Server A switched' };
mountedCallsignInput = callsignInput('Server A switched');
draftDocument.activeElement = null;
draftHelpers.restoreEditableState({ ...dirtySamePetDraft, focused: false });
assert.equal(mountedCallsignInput.value, 'Server A switched', 'a blurred draft must not overwrite a newer canonical callsign for the same pet');

draftState.pet = { pet_id: 'pet-a', pet_name: 'Server A' };
mountedCallsignInput = callsignInput('Server A');
draftHelpers.restoreEditableState({ ...dirtySamePetDraft, focused: false });
assert.equal(mountedCallsignInput.value, 'Local A', 'a blurred dirty draft must still survive rerenders while the canonical callsign is unchanged');

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
assert.doesNotMatch(client, /tell\('WEEKLY JOURNEY AUTHORITY REFRESHED\.'\)/, 'Weekly Journey refresh copy must not be emitted as a dead toast before result copy');
assert.doesNotMatch(client, /Weekly Journey authority refreshed/, 'action feedback must describe confirmed journey progress instead of generic refresh state');
assert.match(client, /var message = resultMessage\(data\.result, stateBeforeAction, nextState\);\s*tell\(message, data\.result && data\.result\.accepted \? '' : 'danger'\);/,
  'action result messages must receive before and after authoritative state snapshots');
assert.match(client, /presentResultFeedback\(data\.result, stateBeforeAction, nextState\)/,
  'canvas result feedback must receive before and after authoritative state snapshots');
assert.match(client, /ACTIVE PET \/\/ SLOT/, 'active pet identity and slot state must be visible');
assert.match(client, /DAILY JOURNEY \/\/ GROWTH MARK/, 'Daily Journey Growth Mark state must be visible');
assert.match(client, /function weeklyJourneyMarkup\(weeklyAuthority, weeklyCapability, stateValue\)/, 'Weekly Journey must render from server authority and lifecycle phase');
assert.match(client, /WEEKLY JOURNEY \/\/ LIVE/, 'Weekly Journey must present live progress when authority is available');
assert.match(client, /WEEKLY JOURNEY \/\/ SYNCING/, 'Weekly Journey must fail closed while authority is unavailable');
assert.match(client, /var waitingTitle = weeklyState === 'COMING_SOON'[\s\S]*'WEEKLY JOURNEY \/\/ PLANNED EXPANSION'[\s\S]*'WEEKLY JOURNEY \/\/ SYNCING'/,
  'Weekly Journey panel title must show syncing for locked authority and planned expansion only for explicit COMING_SOON');
assert.match(client, /var waitingCopy = weeklyState === 'COMING_SOON'[\s\S]*Weekly Journey is planned expansion\.[\s\S]*Weekly Journey authority is syncing\./,
  'Weekly Journey panel body copy must keep COMING_SOON planned copy separate from syncing authority copy');
assert.match(client, /WEEKLY CREST ALREADY SETTLED|DUPLICATE WEEKLY CREST BLOCKED|WEEKLY CREST READY FOR SERVER SETTLEMENT/, 'Weekly Journey live UI must surface Crest settlement states');
assert.doesNotMatch(client, /Growth Mark[^'\n]*(?:claim|claimable)|Weekly Crest[^'\n]*(?:claim|claimable)/i,
  'Journey reward copy must avoid claim language when no claim action exists');
assert.doesNotMatch(client, /Gameplay integration not active yet\./, 'Weekly Journey must no longer use inactive integration copy');
assert.match(client, /Personality develops through play/, 'traits-still-forming fallback must use current-beta-safe copy');
assert.match(client, /function combatLockCopy\(reasonOverride\)[\s\S]*reasonOverride \|\| combatCapability\(state\)\.reason[\s\S]*moon_egg_must_hatch[\s\S]*COMBAT LOCKED UNTIL YOUR ACTIVE MOONPET HATCHES/, 'Arena and Kaiju locked panels must render worker combat authority reasons instead of only completed-season copy');
assert.match(client, /function combatLockedButtonOptions\(entryDetail\)[\s\S]*disabled: true[\s\S]*futureExpansion: true[\s\S]*eggRequired: entryDetail\.indexOf\('HATCHED'\) >= 0[\s\S]*activePetRequired: entryDetail\.indexOf\('ACTIVE'\) >= 0[\s\S]*authoritySyncing: entryDetail\.indexOf\('SYNC'\) >= 0/,
  'Arena and Kaiju locked buttons must share the same future-expansion availability options');
const renderExploreSource = client.slice(client.indexOf('  function renderExplore()'), client.indexOf('  function renderWork()', client.indexOf('  function renderExplore()')));
assert.match(renderExploreSource, /button\('ACCEPT ANY RANK'[\s\S]*statusLabel: arenaQueue\.accept_any_rank \? 'CURRENT' : ''/,
  'ACCEPT ANY RANK current queue state must use an explicit CURRENT status label');
assert.match(renderExploreSource, /var seasonalDefeated = Boolean\(seasonal\.defeated_at\);[\s\S]*seasonalDefeated \? 'SEASONAL BOSS DEFEATED'[\s\S]*seasonalDefeated \? 'DEFEATED'/,
  'seasonal defeated state must take precedence over used-today button copy');
assert.match(renderExploreSource, /var bossStatusLabel = boss\.defeated \? 'DEFEATED' : boss\.attempt_used \? 'USED TODAY' : ''/,
  'weekly boss defeated state must take precedence over used-today button copy');
assert.match(renderExploreSource, /cooldown: seasonalDefeated \? null : seasonal\.cooldown/,
  'seasonal defeated state must suppress stale cooldown metadata in the UI');
assert.match(renderExploreSource, /cooldown: boss\.defeated \? null : boss\.cooldown/,
  'weekly boss defeated state must suppress stale cooldown metadata in the UI');
const arenaLockIndex = renderExploreSource.indexOf("if (!hasSystemUnlocked('arena'))");
const arenaStateIndex = renderExploreSource.indexOf('var arena = state.arena;');
const arenaQueueIndex = renderExploreSource.indexOf('var arenaQueue = state.arena_queue;');
const arenaResultIndex = renderExploreSource.indexOf('var arenaResult = state.arena_result;');
assert.ok(arenaStateIndex !== -1 && arenaQueueIndex !== -1 && arenaResultIndex !== -1 && arenaLockIndex !== -1, 'Arena lock and stale-state cleanup inputs must be explicit');
assert.match(renderExploreSource, /if \(!hasSystemUnlocked\('arena'\)\) \{[\s\S]*var arenaLock = combatLockCopy\(systemCapability\(state, 'arena'\)\.reason\)[\s\S]*var arenaEntryOptions = combatLockedButtonOptions\(arenaLock\.entryDetail\)[\s\S]*button\('FORFEIT MATCH', 'arena_forfeit'[\s\S]*button\('CANCEL QUEUE', 'arena_queue_cancel'[\s\S]*arena_matchmake'[\s\S]*arenaEntryOptions[\s\S]*arena_start'[\s\S]*arenaEntryOptions[\s\S]*\} else \{[\s\S]*if \(arena\)[\s\S]*\} else if \(arenaQueue\)[\s\S]*arenaResult/, 'Arena queue, match, result, and entry controls must be behind Arena capability gating while stale cleanup remains available');
const kaijuLockIndex = renderExploreSource.indexOf("if (!hasSystemUnlocked('kaiju'))", arenaLockIndex + 1);
const kaijuStateIndex = renderExploreSource.indexOf('var kaiju = state.kaiju || {};');
const kaijuMatchIndex = renderExploreSource.indexOf('var kaijuMatch = kaiju.match;');
const kaijuQueueIndex = renderExploreSource.indexOf('var kaijuQueue = kaiju.queue;');
assert.ok(kaijuStateIndex !== -1 && kaijuMatchIndex !== -1 && kaijuQueueIndex !== -1 && kaijuLockIndex !== -1, 'Kaiju lock and stale-state cleanup inputs must be explicit');
assert.match(renderExploreSource, /var kaijuSoloCleanup = kaijuMatch && kaijuMatch\.mode !== 'group' && !kaijuMatch\.player2_telegram_id/,
  'locked Kaiju UI must expose match cleanup only for owned solo stale matches');
assert.match(renderExploreSource, /kaijuSoloCleanup[\s\S]*button\('CANCEL MATCH', 'kaiju_match_cancel'/,
  'locked Kaiju UI must show Cancel Match for solo stale cleanup');
assert.match(renderExploreSource, /kaijuMatch && !kaijuSoloCleanup[\s\S]*MULTIPLAYER MATCH CLEANUP USES NORMAL EXPIRY \/ FORFEIT RESOLUTION/,
  'locked Kaiju UI must explain multiplayer cleanup instead of showing blind cancellation');
assert.match(renderExploreSource, /if \(!hasSystemUnlocked\('kaiju'\)\) \{[\s\S]*var kaijuLock = combatLockCopy\(systemCapability\(state, 'kaiju'\)\.reason\)[\s\S]*var kaijuEntryOptions = combatLockedButtonOptions\(kaijuLock\.entryDetail\)[\s\S]*button\('CANCEL QUEUE', 'kaiju_queue_cancel'[\s\S]*kaiju_matchmake'[\s\S]*kaijuEntryOptions[\s\S]*kaiju_start'[\s\S]*kaijuEntryOptions[\s\S]*\} else \{[\s\S]*kaijuBody = kaijuMatch[\s\S]*: kaijuQueue[\s\S]*kaiju\.result/,
  'Kaiju queue, match, result, and entry controls must be behind Kaiju capability gating while stale solo cleanup remains available');
assert.match(client, /Requires current beta combat authority\./, 'current combat lock copy must remain explicit');
assert.match(client, /var capabilitySystems = state\.capabilities_version === 1 && state\.capabilities && state\.capabilities\.systems[\s\S]*: \{\}/, 'future-system directory must consume the versioned worker systems capability map');
assert.match(client, /Object\.keys\(futureSystemTitles\)\.map[\s\S]*var system = capabilitySystems\[key\] \|\| \{\}[\s\S]*status: \['LOCKED', 'COMING_SOON', 'AVAILABLE'\]\.includes\(status\) \? status : 'COMING_SOON'/, 'future-system directory must fail closed to COMING_SOON from the systems capability map');
assert.match(client, /futureSystemRows[\s\S]*\.filter\(function[^)]*\)[\s\S]*key !== 'sanctuary'[\s\S]*key !== 'prestige'/, 'roadmap rows must exclude sanctuary and prestige which have dedicated future-season panels');
assert.match(client, /futureSystemRows[\s\S]*\[ROADMAP\][\s\S]*system\.title \|\| system\.key \|\| 'Future System'/,
  'future-system roadmap rows must uniformly label all items as ROADMAP');
assert.match(client, /function futureSystemPanelCopy\(system\)[\s\S]*COMING_SOON[\s\S]*FUTURE EXPANSION CONTENT\.[\s\S]*AVAILABLE[\s\S]*LOCKED\./, 'future-system panels must render from the shared LOCKED/COMING_SOON/AVAILABLE model');
assert.match(client, /var sanctuarySystem = futureSystemByKey\('sanctuary'\)[\s\S]*var sanctuaryPanel = futureSystemPanelCopy\(sanctuarySystem\)/, 'Sanctuary panel must consume shared future-system status only');
assert.match(client, /panel\('PRESTIGE \/\/ FUTURE SEASON', futureSystemPanelCopy\(futureSystemByKey\('prestige', 'COMING_SOON'\)\)/, 'Prestige panel must be labelled as future season content');
assert.match(client, /var featureRows = \(guidance\.features \|\| \[\]\)\.map[\s\S]*var available = feature\.available === true/, 'Mini App feature directory must render worker-authoritative availability without duplicating combat logic');
assert.doesNotMatch(client, /futureLocked = \/kaiju\|arena\|prestige/, 'Mini App feature directory must not re-derive future-system lock state in the frontend');
assert.doesNotMatch(client, /state\.player_capabilities|state\.has_completed_season_pet|state\.combat_unlocked|state\.combat_eligibility|state\.future_systems/, 'Mini App client must consume the single worker capabilities object');
assert.doesNotMatch(client, /state\.sanctuary|sanctuaryRows/, 'Mini App client must not render inactive Sanctuary state as live gameplay');
assert.match(worker, /daily_journey: journeySummary\?\.daily/, 'Mini App state must serialize Daily Journey authority summaries');
assert.match(worker, /weekly_journey: isPetMiniAppWeeklyJourneySummaryLive\(journeySummary\?\.weekly\) \? \{[\s\S]*state: PET_MINI_APP_FUTURE_SYSTEM_STATUS\.AVAILABLE[\s\S]*\.\.\.journeySummary\.weekly/, 'Mini App state must serialize live Weekly Journey authority summaries only when pet-bound authority exists');
assert.match(worker, /capabilities: buildPetMiniAppCapabilities\(combatEligibility, journeySummary\?\.weekly \|\| null\)/, 'Mini App state must serialize capability authority from the worker');
assert.match(worker, /pet: null,[\s\S]*capabilities_version: 1,[\s\S]*capabilities: buildPetMiniAppCapabilities/, 'unadopted Mini App state must serialize the top-level capability contract version');
assert.match(worker, /season_slots: seasonSlots,[\s\S]*capabilities_version: 1,[\s\S]*capabilities: buildPetMiniAppCapabilities\(combatEligibility, journeySummary\?\.weekly \|\| null\)/, 'adopted Mini App state must serialize the top-level capability contract version');
assert.match(worker, /combat: \{[\s\S]*state: combatEligibility\.combat_unlocked === true[\s\S]*unlocked: combatEligibility\.combat_unlocked === true[\s\S]*requirements: \{[\s\S]*completed_season_pet:[\s\S]*active_pet_hatched:/, 'capabilities must expose one nested combat authority object');
assert.doesNotMatch(worker, /\n\s+has_completed_season_pet: combatEligibility\.has_completed_season_pet,/, 'Mini App state must not serialize duplicate top-level completed-season authority');
assert.doesNotMatch(worker, /\n\s+combat_unlocked: combatEligibility\.combat_unlocked,/, 'Mini App state must not serialize duplicate top-level combat authority');
assert.doesNotMatch(worker, /\n\s+combat_eligibility: combatEligibility,/, 'Mini App state must not serialize duplicate top-level combat eligibility authority');
assert.doesNotMatch(worker, /\n\s+future_systems: buildPetMiniAppFutureSystemState\(combatEligibility\),/, 'Mini App state must keep future-system authority inside capabilities');
assert.doesNotMatch(worker, /\n\s+sanctuary,/, 'Mini App state must not serialize inactive Sanctuary rows as live gameplay');
assert.match(worker, /path === '\/telegram-pets\/app\/sanctuary'[\s\S]*const combatEligibility = await getPetMiniAppCombatEligibility\(env\.DB, verified\.telegramId\)[\s\S]*reason: 'feature_not_available'[\s\S]*capabilities_version: 1[\s\S]*capabilities: buildPetMiniAppCapabilities\(combatEligibility\)/,
  'Mini App Sanctuary endpoint must return unavailable with real worker capability authority');
assert.doesNotMatch(worker, /path === '\/telegram-pets\/app\/sanctuary'[\s\S]*buildPetMiniAppCapabilities\(\{ has_completed_season_pet: false, combat_unlocked: false, reason: 'feature_not_available' \}\)/,
  'Mini App Sanctuary endpoint must not fabricate missing completed-season authority for unavailable responses');
assert.doesNotMatch(worker, /listSanctuaryPetsPrivate/, 'Mini App server must not expose private Sanctuary gameplay rows while Sanctuary is future content');
assert.match(worker, /async function getPetMiniAppCombatEligibility/, 'Mini App worker must centralize current beta combat eligibility');
assert.match(worker, /function buildPetMiniAppFutureSystemState\(combatEligibility = \{\}\)/, 'Mini App worker must centralize future-system display state');
assert.match(worker, /const systems = \{[\s\S]*\.\.\.systemByKey[\s\S]*weekly_journey: weeklyJourneyCapability[\s\S]*\}/, 'Mini App capability contract must expose all future systems through one systems map');
for (const key of ['breeding', 'traits', 'sanctuary', 'lineage', 'fusion', 'arena', 'kaiju', 'prestige']) {
  assert.match(worker, new RegExp(`${key}: systemByKey\\.${key}`), `${key} compatibility capability must come from the centralized system map`);
}
assert.match(worker, /future_systems: futureSystems/, 'Mini App capabilities must serialize future-system authority inside the single capability object');
assert.match(worker, /active: system\.status === PET_MINI_APP_FUTURE_SYSTEM_STATUS\.AVAILABLE/, 'future-system capabilities must expose inactive systems as status-only active=false');
assert.match(worker, /weeklyJourneyLive \? \{[\s\S]*state: PET_MINI_APP_FUTURE_SYSTEM_STATUS\.AVAILABLE[\s\S]*active: true/, 'Weekly Journey capability must become active when authority summary exists');
assert.match(worker, /reason: 'weekly_journey_authority_syncing'[\s\S]*objectives: \[\]/, 'Weekly Journey capability must fail closed while authority is unavailable');
assert.match(worker, /PET_MINI_APP_FUTURE_SYSTEM_STATUS[\s\S]*LOCKED[\s\S]*COMING_SOON[\s\S]*AVAILABLE/, 'future-system authority must use one LOCKED/COMING_SOON/AVAILABLE status model');
assert.match(worker, /active_pet_lifecycle_known: Boolean\(activeLifecycle\)/, 'combat eligibility must expose missing lifecycle data');
assert.match(worker, /!activeLifecycle \? 'moonpet_lifecycle_required'/, 'missing lifecycle data must fail closed for combat');
assert.match(worker, /features: getPetGuidanceFeatures\(level, combatEligibility\)/, 'guidance feature availability must consume shared combat authority');
assert.match(worker, /kaiju_cards'[\s\S]*available: level >= 1 && kaijuUnlocked/, 'Kaiju guidance feature must require current Kaiju unlock');
assert.match(worker, /pet_arena'[\s\S]*available: level >= PET_ARENA_MIN_LEVEL && arenaUnlocked/, 'Arena guidance feature must require current Arena unlock');
assert.match(worker, /key: 'prestige'[\s\S]*available: false[\s\S]*Future expansion content\. Not available yet\./, 'Prestige guidance feature must remain permanently unavailable in this PR');
assert.doesNotMatch(worker, /const liveNext = liveSystems\.prestige\.ready/, 'Mini App recommendations must not suggest Prestige while the feature is unavailable');
assert.doesNotMatch(worker, /action: 'prestige', destination: 'profile'/, 'Mini App recommendations must not expose Prestige actions');
assert.doesNotMatch(client, /button\('ASCEND PRESTIGE'/, 'Prestige must render status-only without an action-looking CTA');
assert.doesNotMatch(worker, /return 'prestige'/, 'Prestige must not be reachable as a recommended/deep-link focus while unavailable');
assert.match(worker, /\['guidance_ack', 'notification_set', 'arena_queue_cancel', 'kaiju_queue_cancel', 'kaiju_match_cancel'\]/, 'Kaiju stale match cleanup must not receive post-action reaction side effects');
assert.doesNotMatch(client, /dailyRequired = [^;\n]+: 3/, 'Daily Journey UI must not hardcode fallback objective requirements');
assert.match(client, /weekly_crest_awarded/, 'Weekly Journey live UI must read settled Crest state from authority');
assert.match(client, /DUPLICATE WEEKLY CREST BLOCKED/, 'Weekly Journey live UI must expose duplicate Crest state from authority');
assert.match(client, /WEEKLY CREST ALREADY SETTLED/, 'Weekly Journey live UI must expose settled Crest state from authority');
assert.match(worker, /required_objectives: DAILY_JOURNEY_REQUIRED_OBJECTIVES/, 'Daily Journey Mini App summary must use the authority constant for required objectives');
assert.match(worker, /dailyCompleted >= DAILY_JOURNEY_REQUIRED_OBJECTIVES/, 'Daily Journey Mini App readiness must use the authority constant');
assert.match(worker, /required_objectives: WEEKLY_JOURNEY_REQUIRED_OBJECTIVES/, 'Weekly Journey Mini App summary must use the authority constant for required objectives');
assert.match(worker, /weeklyCompleted >= WEEKLY_JOURNEY_REQUIRED_OBJECTIVES/, 'Weekly Journey Mini App readiness must use the authority constant');
assert.doesNotMatch(worker, /required_objectives: 3|required_objectives: 5|dailyCompleted >= 3|weeklyCompleted >= 5/, 'Mini App Journey summaries must not hardcode authority thresholds');
assert.match(worker, /countPetMiniAppCompletedDailyJourneyObjectives/, 'Mini App Daily Journey summary must use target-aware aggregation');
assert.match(worker, /SELECT challenge_id, SUM\(progress_value\) AS additive_progress, MAX\(progress_value\) AS max_progress[\s\S]*GROUP BY challenge_id/, 'Mini App Daily Journey summary must aggregate progress by objective');
assert.doesNotMatch(worker, /COUNT\(DISTINCT challenge_id\) AS completed_objectives[\s\S]*telegram_pet_daily_journey_objectives/, 'Mini App Daily Journey summary must not count raw accepted evidence rows as completed objectives');
assert.match(worker, /countPetMiniAppCompletedWeeklyJourneyObjectives/, 'Mini App Weekly Journey summary must use target-aware aggregation');
assert.match(worker, /SELECT objective_id, SUM\(progress_value\) AS additive_progress, MAX\(progress_value\) AS max_progress[\s\S]*GROUP BY objective_id/, 'Mini App Weekly Journey summary must aggregate progress by objective');
assert.doesNotMatch(worker, /COUNT\(DISTINCT objective_id\) AS completed_objectives[\s\S]*telegram_pet_weekly_journey_objectives/, 'Mini App Weekly Journey summary must not count raw accepted evidence rows as completed objectives');
assert.match(worker, /dailyAcceptedReceipt[\s\S]*status='accepted' AND growth_mark_id IS NOT NULL[\s\S]*growth_mark_awarded: Boolean\(dailyAcceptedReceipt\?\.growth_mark_id\)/, 'Daily Journey summary must derive awarded state from any accepted receipt');
assert.match(worker, /weeklyAcceptedReceipt[\s\S]*status='accepted' AND crest_id IS NOT NULL[\s\S]*weekly_crest_awarded: Boolean\(weeklyAcceptedReceipt\?\.crest_id\)/, 'Weekly Journey summary must derive awarded state from any accepted receipt');
assert.match(worker, /dailyReceipt\?\.reason === 'daily_journey_growth_mark_duplicate'/, 'Daily Journey summary must track duplicate state separately from awarded state');
assert.match(worker, /weeklyReceipt\?\.reason === 'weekly_journey_crest_duplicate'/, 'Weekly Journey summary must track duplicate state separately from awarded state');
const miniAppActionSource = worker.slice(worker.indexOf('async function processPetMiniAppAction'), worker.indexOf('function serializePetMiniAppActionResult'));
const futureCombatGateIndex = miniAppActionSource.indexOf('PET_MINI_APP_FUTURE_COMBAT_ACTIONS.has(action)');
assert.ok(futureCombatGateIndex !== -1, 'Mini App action handler must gate future combat actions server-side');
assert.match(worker, /SELECT 1 AS completed\s+FROM telegram_pet_season_completions\s+WHERE telegram_id=\?\s+LIMIT 1/, 'server-side completed-season authority must accept any completion row for the user');
assert.doesNotMatch(worker, /hasCompletedPetMiniAppSeasonPet[\s\S]{0,500}season_key=\?/, 'server-side completed-season authority must not restrict eligibility to the current season');
const futureCombatGateSource = worker.slice(worker.indexOf('const PET_MINI_APP_FUTURE_COMBAT_ACTIONS'), worker.indexOf('const PET_MINI_APP_COMBAT_CLEANUP_ACTIONS'));
for (const action of ['arena_start', 'arena_matchmake', 'arena_ready', 'arena_move', 'kaiju_start', 'kaiju_matchmake', 'kaiju_card']) {
  assert.ok(worker.includes(`'${action}'`), `future combat action gate must name ${action}`);
  assert.ok(futureCombatGateIndex < miniAppActionSource.indexOf(`action === '${action}'`), `${action} must be locked before dispatch`);
}
for (const cleanupAction of ['arena_queue_cancel', 'arena_forfeit', 'kaiju_queue_cancel', 'kaiju_match_cancel']) {
  assert.doesNotMatch(futureCombatGateSource, new RegExp(`'${cleanupAction}'`), `${cleanupAction} must remain outside the combat entry gate`);
}
assert.match(miniAppActionSource, /getPetMiniAppCombatEligibility\(db, telegramId, lifecycle\)/, 'server-side future combat lock must use shared combat eligibility authority');
assert.match(miniAppActionSource, /const reason = action\.startsWith\('arena_'\)[\s\S]*combatEligibility\.arena_reason[\s\S]*combatEligibility\.kaiju_reason/, 'server-side combat lock must return per-system eligibility reasons');
const prestigeGateIndex = miniAppActionSource.indexOf("if (action === 'prestige')");
assert.ok(prestigeGateIndex !== -1, 'Mini App prestige action must have an explicit feature lock');
assert.match(miniAppActionSource, /if \(action === 'prestige'\) return \{ accepted: false, reason: 'feature_not_available' \}/, 'locked Prestige must remain unavailable before mutation authority runs');
assert.doesNotMatch(miniAppActionSource, /processPetPrestige/, 'Mini App action handler must not call Prestige mutation while the feature is unavailable');
assert.match(miniAppActionSource, /if \(action === 'kaiju_match_cancel'\) return cancelPetKaijuMiniAppMatch\(db, telegramId, body\.match_id\)/, 'Mini App must expose owned stale Kaiju match cleanup');
assert.match(worker, /WHERE match_id=\? AND chat_id LIKE 'mini:kaiju:%' AND mode='solo' AND status IN \('open','selecting'\)\s+AND player1_telegram_id=\? AND player2_telegram_id IS NULL/,
  'Kaiju stale match cleanup must not allow participants to cancel active multiplayer matches');
const kaijuCancelSource = worker.slice(worker.indexOf('async function cancelPetKaijuMiniAppMatch'), worker.indexOf('async function awardPetKaijuPlayerResult'));
assert.doesNotMatch(kaijuCancelSource, /getPetMiniAppCombatEligibility|combat_unlocked|kaiju_match_cancel_unavailable/,
  'Kaiju stale match cleanup authority must depend on owned solo match state, not combat eligibility');
assert.match(worker, /const \[journeySummary, hydratedKaiju\] = await Promise\.all\(\[[\s\S]*buildPetMiniAppJourneySummary[\s\S]*ensurePetKaijuMatchCategory/, 'Mini App state loading must hydrate journey summary and Kaiju category in parallel');

assert.match(worker, /path === '\/telegram-pets\/app\/state'.*request\.method === 'POST'/s);
assert.match(worker, /path === '\/telegram-pets\/app\/action'.*request\.method === 'POST'/s);
assert.match(worker, /verifyTelegramMiniAppInitData\(body\.init_data/);
assert.match(worker, /const MOONPET_MINI_APP_URL = `\$\{SITE_URL\}\/moonpet-game\.html\?v=20260814-moonpet-aaa-pass`/);
assert.match(worker, /const TELEGRAM_GAMES_MENU_URL = `\$\{SITE_URL\}\/games\/telegram\/\?v=20260902-games-shell-v5`/);
assert.match(worker, /const TELEGRAM_GAMES_MENU_TEXT = 'Games'/);
assert.match(worker, /function petMiniAppLaunchUrl/);
assert.match(worker, /const url = petMiniAppLaunchUrl\(screen, normalizedFocus\)/);
assert.match(worker, /setChatMenuButton/);
const menuButtonSource = worker.slice(worker.indexOf('async function setDefaultTelegramGamesMenuButton'), worker.indexOf('function petMiniAppLaunchUrl'));
assert.match(menuButtonSource, /menu_button: \{ type: 'web_app', text: TELEGRAM_GAMES_MENU_TEXT, web_app: \{ url: TELEGRAM_GAMES_MENU_URL \} \}/,
  'default Telegram chat menu must open the shared Games hub');
assert.doesNotMatch(menuButtonSource, /Moonpet OS|MOONPET_MINI_APP_URL/,
  'default Telegram chat menu must not be overwritten back to Moonpet OS');
assert.doesNotMatch(menuButtonSource, /`\$\{SITE_URL\}\/games\/`/,
  'default Telegram chat menu must not point at the public full web arcade page');
const petLauncherSource = worker.slice(worker.indexOf('async function cmdPetMiniAppLauncher'), worker.indexOf('// ── GK command implementations'));
assert.match(petLauncherSource, /setDefaultTelegramGamesMenuButton\(botToken, telegramId\)/,
  'Moonpet-specific launches must keep the global Telegram menu on Games');
const commandDispatchSource = worker.slice(worker.indexOf('const cmdBase  = rawCmd'), worker.indexOf('switch (cmdBase)'));
const rolloutRefreshIndex = commandDispatchSource.indexOf("if (String(chatType) === 'private' && telegramId)");
assert.ok(rolloutRefreshIndex !== -1, 'private Telegram commands must refresh the default Games menu before dispatch');
assert.match(commandDispatchSource, /await setDefaultTelegramGamesMenuButton\(tok, telegramId\);/,
  'private Telegram command menu refresh must use the shared Games menu helper');
assert.ok(
  rolloutRefreshIndex < commandDispatchSource.indexOf("if (env.PET_MINI_APP_ENABLED === 'true'"),
  'private Telegram command menu refresh must not depend on Moonpet-specific launcher commands',
);
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
assert.match(html, /\/css\/moonpet-mini-app\.css\?v=20260820-action-guidance-polish/);
assert.match(html, /role="button" aria-label="Interact with your animated Moonpet"/);
assert.match(client, /data-utility="guide">HOW TO PLAY/);
const guideMarkupSource = extractFunctionSource(client, 'guideMarkup');
assert.ok(guideMarkupSource, 'guideMarkup helper must be extractable');
const renderGuideMarkup = new Function('hasCombatUnlocked', `${guideMarkupSource}; return guideMarkup();`);
const unlockedGuideMarkup = renderGuideMarkup(() => true);
const lockedGuideMarkup = renderGuideMarkup(() => false);
assert.match(unlockedGuideMarkup, /Arena and Kaiju are part of the current build\. Arena still needs a level 10 active Moonpet\./,
  'the in-app guide must describe unlocked Arena/Kaiju copy according to shared combat capability');
assert.match(lockedGuideMarkup, /Arena and Kaiju are current-build systems\. Kaiju requires a hatched active Moonpet, and Arena requires a hatched active Moonpet plus level 10\./,
  'the in-app guide must describe locked Arena/Kaiju copy according to shared combat capability');
for (const [label, pattern] of [
  ['Pet', /PET|Pet/],
  ['Care', /care/i],
  ['Daily Journey', /Daily Journey/],
  ['Weekly Journey', /Weekly Journey/],
  ['Jobs', /jobs/i],
  ['Runs', /Moon Run|RUN/i],
  ['Equipment', /equipment/i],
  ['Arena', /Arena/],
  ['Kaiju', /Kaiju/],
  ['Progression', /evolution and season rewards|progression/i],
]) {
  assert.match(lockedGuideMarkup, pattern, `guideMarkup must include current-build vocabulary for ${label}`);
}
const roadmapStepBody = lockedGuideMarkup.match(/<strong>6 \/\/ IDENTITY AND ROADMAP<\/strong>([\s\S]*?)<\/div>/)?.[1] || '';
assert.ok(roadmapStepBody, 'guideMarkup must include the identity and roadmap step');
assert.match(roadmapStepBody, /remain coming soon/, 'future systems must be marked as coming soon');
const guideOutsideRoadmap = lockedGuideMarkup.replace(roadmapStepBody, '');
for (const futureSystem of ['Advanced Traits', 'Breeding', 'Lineage', 'Fusion', 'Sanctuary', 'Prestige']) {
  assert.ok(roadmapStepBody.includes(futureSystem), `guide roadmap step must list ${futureSystem}`);
  assert.ok(!guideOutsideRoadmap.includes(futureSystem), `guideMarkup must only mention ${futureSystem} in the coming-soon roadmap step`);
}
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
assert.match(html, /\/js\/moonpet-mini-app\.js\?v=20260820-first-session-onboarding/);
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
assert.match(client, /return stage >= 5 \? selected\.legendary : selected\.normal/, 'only stage 5 receives the Legendary palette');
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
assert.match(client, /function actionFeedback\(result, beforeState, afterState\)/);
assert.match(client, /function resultRewardMap\(result\)/);
assert.match(client, /applied && \(applied\.rewardsApplied \|\| applied\.rewards_applied\)/);
assert.match(client, /var reward = resultRewardMap\(result\)/);
assert.equal([...client.matchAll(/var reward = resultRewardMap\(result\)/g)].length, 2, 'terminal and canvas feedback must share reward normalization');
assert.match(client, /presentResultFeedback\(data\.result, stateBeforeAction, nextState\)/);
assert.match(client, /await showPendingNotices\(\);\s*animateAction\(action, Boolean\(data\.result && data\.result\.accepted\), 2800, payload\);\s*if \(!startLifecycleCeremony\(plannedCeremony\)\) presentResultFeedback\(data\.result, stateBeforeAction, nextState\)/s);
assert.doesNotMatch(client, /presentResultFeedback\(data\.result(?:, stateBeforeAction, nextState)?\);\s*render\(\);\s*await typeBoot/s, 'feedback timer must not run behind the boot overlay');
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
assert.doesNotMatch(client, /function snapshotHasCompletedSeasonPet\(snapshot\)/, 'client must not keep a duplicate completed-season snapshot helper');
const snapshotCombatHelperSource = client.slice(client.indexOf('function snapshotHasCombatUnlocked'), client.indexOf('function updateCombatPresentation'));
assert.match(snapshotCombatHelperSource, /combatCapability\(snapshot\)[\s\S]*combat\.state === 'AVAILABLE' && combat\.unlocked === true/, 'combat snapshot helper must consume the shared fail-closed capability accessor');
assert.match(snapshotCombatHelperSource, /function snapshotHasSystemUnlocked\(snapshot, key\)[\s\S]*hasSystemUnlocked\(key, snapshot\)/, 'combat presentation must support per-system capability gates');
assert.match(client, /snapshot === combatSnapshot && activeScreen === combatScreen/);
assert.match(client, /var arena = snapshot\.arena/);
assert.match(client, /arena && snapshotHasSystemUnlocked\(snapshot, 'arena'\) && arena\.status !== 'completed'/, 'Arena combat presentation must respect Arena capability gating');
assert.match(client, /COMBAT_PRESENTATION_FRAME\.mode = 'arena'/);
assert.match(client, /arena\.player_hp/);
assert.match(client, /arena\.opponent_hp/);
assert.match(client, /arena\.player_special/);
assert.match(client, /arena\.opponent_special/);
assert.match(client, /'ROUND ' \+ Number\(arena\.current_round \|\| 1\) \+ '\/' \+ Number\(arena\.max_rounds \|\| 5\) \+ ' LIVE'/);
assert.match(client, /var kaiju = snapshot\.kaiju && snapshot\.kaiju\.match/);
assert.match(client, /kaiju && snapshotHasSystemUnlocked\(snapshot, 'kaiju'\) && kaiju\.status !== 'completed'/, 'Kaiju combat presentation must respect Kaiju capability gating');
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
  capabilityCombatHelperSource + combatDirectorSource + '; return { update: updateCombatPresentation, screen: function (value) { activeScreen = value; } };',
)(
  runtimeCombatFrame,
  'explore',
  null,
  '',
  () => '#61f5ff',
);
assert.doesNotThrow(() => combatRuntime.update({
  adopted: true,
  arena: { status: 'active', player_hp: 74, opponent_hp: 38 },
  kaiju: { match: { status: 'selecting', mode: 'solo', own_card_locked: false, opponent_card_locked: false } },
}), 'Phase 5 combat director must tolerate stale future-system state for early Season 1 users');
assert.equal(runtimeCombatFrame.active, false, 'early Season 1 users must not see stale Arena or Kaiju combat presentation');
assert.doesNotThrow(() => combatRuntime.update({
  adopted: true,
  capabilities_version: 1,
  capabilities: {
    combat: { state: 'AVAILABLE', unlocked: true, active: true, requirements: { completed_season_pet: false, active_pet_exists: true, active_pet_lifecycle_known: true, active_pet_hatched: true, active_pet_level: 10, arena_level_met: true } },
    systems: { arena: { state: 'AVAILABLE', unlocked: true, active: true }, kaiju: { state: 'AVAILABLE', unlocked: true, active: true } },
  },
  arena: { status: 'active', player_hp: 74, opponent_hp: 38 },
}), 'Phase 5 combat director must recognize worker combat authority');
assert.equal(runtimeCombatFrame.mode, 'arena', 'worker combat authority must satisfy Arena combat presentation gating');
assert.doesNotThrow(() => combatRuntime.update({
  adopted: true,
  capabilities_version: 1,
  capabilities: {
    combat: { state: 'AVAILABLE', unlocked: true, active: true, requirements: { completed_season_pet: false, active_pet_exists: true, active_pet_lifecycle_known: true, active_pet_hatched: true, active_pet_level: 10, arena_level_met: true } },
    systems: { arena: { state: 'AVAILABLE', unlocked: true, active: true }, kaiju: { state: 'AVAILABLE', unlocked: true, active: true } },
  },
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
  capabilities_version: 1,
  capabilities: {
    combat: { state: 'AVAILABLE', unlocked: true, active: true, requirements: { completed_season_pet: false, active_pet_exists: true, active_pet_lifecycle_known: true, active_pet_hatched: true, active_pet_level: 1, arena_level_met: false } },
    systems: { arena: { state: 'LOCKED', unlocked: false, active: false, reason: 'arena_level_locked' }, kaiju: { state: 'AVAILABLE', unlocked: true, active: true } },
  },
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
assert.match(client, /var guidance = state\.guidance \|\| \{\};\s*var identity = guidance\.identity \|\| \{\};/, 'CORE profile must read identity from the selected-pet guidance payload');
assert.match(client, /var achievements = state\.guidance && state\.guidance\.achievements \|\| \[\];/, 'TASK achievements must read the selected-pet guidance achievement payload');
assert.match(client, /var evolution = guidance\.evolution;/, 'CORE evolution panel must read selected-pet evolution guidance');
assert.match(client, /var traits = \(guidance\.personalities \|\| \[\]\)/, 'CORE personality panel must read selected-pet personality guidance');
assert.match(client, /var memory = identity\.memories \|\| \{\};/, 'CORE memory archive must read selected-pet memories');
assert.match(client, /identity\.boss_victories/, 'CORE memory archive must render boss history from the selected-pet identity payload');
assert.match(client, /BOSS \/\/ '\s*\+\s*words\(boss\.boss_id\)\s*\+\s*' x'/, 'boss history display must use selected-pet boss victory rows');
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
assert.match(client, /await typeBoot\(\['EXEC '[\s\S]*?await showPendingNotices\(\);[\s\S]*?if \(!startLifecycleCeremony\(plannedCeremony\)\) presentResultFeedback\(data\.result, stateBeforeAction, nextState\);/);
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
  pet: { species: 'neon_raccoon', evolution_stage: 5, stage: 'Legendary Moon Guardian' },
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
assert.match(html, /20260820-first-session-onboarding/);
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
