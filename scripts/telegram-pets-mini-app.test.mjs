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

assert.match(worker, /path === '\/telegram-pets\/app\/state'.*request\.method === 'POST'/s);
assert.match(worker, /path === '\/telegram-pets\/app\/action'.*request\.method === 'POST'/s);
assert.match(worker, /verifyTelegramMiniAppInitData\(body\.init_data/);
assert.match(worker, /const MOONPET_MINI_APP_URL = `\$\{SITE_URL\}\/moonpet-game\.html\?v=20260813-phase4-living-companion`/);
assert.match(worker, /const url = MOONPET_MINI_APP_URL/);
assert.match(worker, /`\$\{MOONPET_MINI_APP_URL\}#screen=\$\{screen\}`/);
assert.match(worker, /setChatMenuButton/);
assert.match(worker, /Chat gameplay controls are retired/);
assert.equal(resolvePetCallbackRoute('pet:feed', true), 'mini_app', 'enabled callbacks must open only the Mini App launcher');
assert.equal(resolvePetCallbackRoute('pet:feed', false), 'legacy', 'disabled callbacks must reach legacy gameplay routing');
assert.equal(resolvePetCallbackRoute('other:feed', true), 'ignore');
assert.match(worker, /const PET_MINI_APP_COMMANDS = new Set\(\[\s*'moonpet',/, 'literal /moonpet command must open the Mini App launcher');
assert.match(worker, /isPetMiniAppCommand\(cmdBase\)/, 'Mini App commands must be intercepted before legacy routing');
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
assert.match(html, /\/js\/moonpet-mini-app\.js\?v=20260813-phase4-living-companion/);
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
assert.match(client, /drawPet\(renderTime, presence\);\s*ctx\.restore\(\);\s*drawWorldForeground\(scene\)/s);
assert.doesNotMatch(client, /new Image\s*\(/);
assert.match(client, /function drawMoonEgg/);
assert.match(client, /drawMoonEgg\(time, active, lifecycle\.incubation\)/);
assert.match(client, /var progress = Math\.max\(0, Number\(incubation && incubation\.progress \|\| 0\)\)/);
assert.match(client, /var crack = Math\.min\(2, Math\.floor\(progress \/ target \* 3\)\)/);
assert.match(client, /function petGrowthShape/);
assert.match(client, /phase === 'young'.*scaleX: 0\.9, scaleY: 0\.76/s);
assert.match(client, /phase === 'rare'.*scaleX: 1\.22, scaleY: 1\.18/s);
assert.match(client, /ctx\.scale\(growth\.scaleX \* pose\.squashX, growth\.scaleY \* pose\.squashY\)/);
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
assert.match(client, /target\.getBoundingClientRect\(\)\.top - screen\.getBoundingClientRect\(\)\.top \+ screen\.scrollTop/);
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
assert.equal((client.match(/var reward = resultRewardMap\(result\)/g) || []).length, 2, 'terminal and canvas feedback must share reward normalization');
assert.match(client, /presentResultFeedback\(data\.result\)/);
assert.match(client, /await showPendingNotices\(\);\s*animateAction\(action, Boolean\(data\.result && data\.result\.accepted\), 2800, payload\);\s*presentResultFeedback\(data\.result\)/s);
assert.doesNotMatch(client, /presentResultFeedback\(data\.result\);\s*render\(\);\s*await typeBoot/s, 'feedback timer must not run behind the boot overlay');
assert.equal((client.match(/presentResultFeedback\(/g) || []).length, 2, 'only the helper and real server-result call may present reward feedback');
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
assert.match(client, /drawActionFlash\(renderTime, scene\);\s*drawCinematicFeedback\(renderTime, scene\);\s*drawSceneTransition\(renderTime, scene\)/s);
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
assert.match(client, /function companionNeedThought\(pet, lifecycle, fallback\)/);
assert.match(client, /Number\(pet\.health\) < 35.*I NEED PATCHING/s);
assert.match(client, /Number\(pet\.energy\) < 20.*NAP SIGNAL/s);
assert.match(client, /Number\(pet\.hunger\) > 78.*SNACK PLEASE/s);
assert.match(client, /Number\(pet\.cleanliness\) < 30.*WASH TIME/s);
assert.match(client, /Number\(pet\.happiness\) < 30.*PLAY WITH ME/s);
assert.match(client, /function updateCompanionPresence\(pet, lifecycle, time\)/);
const presenceFunctionMatch = client.match(/  function updateCompanionPresence\(pet, lifecycle, time\) \{[\s\S]*?\n  \}\n\n  function drawPixelText/);
assert.ok(presenceFunctionMatch, 'Phase 4 presence director must be extractable for runtime smoke coverage');
const presenceFunctionSource = presenceFunctionMatch[0].replace(/\n\n  function drawPixelText$/, '');
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
assert.match(client, /function drawCompanionPresence\(time, scene, presence\)/);
assert.match(client, /if \(feedbackActive \|\| actionActive && !greetingActive\) return/);
assert.match(client, /feedbackUntil > time/);
assert.match(client, /function companionGreetingCopy\(pet, lifecycle\)/);
assert.match(client, /function greetCompanion\(\)/);
assert.match(client, /canvas\.addEventListener\('click'/);
assert.match(client, /canvasX >= 92 && canvasX <= 228 && canvasY >= 66 && canvasY <= 190/);
assert.match(client, /animateAction\('interact', true, 1400, \{ source: 'pet_tap'/);
assert.doesNotMatch(client, /greetCompanion[\s\S]{0,1200}(?:post\(|runAction\()/, 'pet taps must remain cosmetic and server-neutral');
assert.match(client, /companionGreetingTimer = window\.setTimeout/);
assert.match(client, /drawPet\(renderTime, presence\)/);
assert.match(client, /if \(companionGreetingUntil > 0 && companionGreetingUntil <= time\)/);
assert.match(client, /companionGreeting = '';\s*companionGreetingUntil = 0;/s);
assert.match(client, /drawUtcAmbience\(scene\);\s*drawCompanionPresence\(renderTime, scene, presence\)/s);
assert.doesNotMatch(client, /Math\.random\(\)[^\n]*(?:presence|habit|greeting)|(?:presence|habit|greeting)[^\n]*Math\.random\(\)/i, 'living companion behavior must be deterministic');

console.log('telegram-pets-mini-app.test.mjs passed');
