(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var apiConfig = window.MOONBOYS_API || {};
  var apiBase = typeof apiConfig.getApiBase === 'function' ? apiConfig.getApiBase({ mode: 'write' }) : apiConfig.BASE_URL;
  apiBase = apiBase ? String(apiBase).replace(/\/$/, '') : '';
  var initData = '';
  var telegramAuth = null;
  var authenticationFailure = false;
  var state = null;
  var renderedPetId = null;
  var renderedPetName = '';
  var botArtModeEnabled = moonpetBotArtRequested();
  var botArtRendererReady = false;
  var botArtRendererState = null;
  var botArtFallbackLogged = false;
  var botArtSelectionGeneration = 0;
  var backgroundArtState = { mode: 'retro_space_loop', loop_ms: 20000, source: 'canvas' };
  var petBackgroundImage = null;
  var petBackgroundReady = false;
  window.MOONPET_USE_BOT_ART = botArtModeEnabled;
  var seasonSnapshotReceivedAt = 0;
  var lastSeasonServerRefreshAt = 0;
  var seasonRefreshBusy = false;
  var seasonRefreshPending = false;
  var seasonRefreshRetryAt = 0;
  var stateRequestGate = createStateRequestGate();
  var serverClockOffsetMs = 0;
  var cooldownRefreshTimer = 0;
  var cooldownRefreshInFlight = false;
  var cooldownRefreshFailures = 0;
  var passiveRefreshInFlight = false;
  var lastCooldownRefreshKey = '';
  var SCREEN_ORDER = ['home', 'missions', 'explore', 'work', 'economy', 'profile'];
  var requestedScreen = launchParameter('screen');
  var requestedFocus = launchParameter('focus');
  var activeScreen = SCREEN_ORDER.includes(requestedScreen) ? requestedScreen : 'home';
  var requestedFocusScreen = activeScreen;
  var busy = false;
  var playOptionsLoadPromise = null;
  var petActionRefreshRequired = false;
  var fastActionStateDirty = false;
  var fastActionStateRefreshTimer = 0;
  var fastActionStateRefreshInFlight = false;
  var fastActionStateRefreshFailures = 0;
  var fastActionStateRefreshRetryAt = 0;
  var FAST_ACTION_STATE_MAX_AUTO_RETRIES = 3;
  var fullStateHydrationPromise = null;
  var fullStateHydrationFailures = 0;
  var fullStateHydrationRetryTimer = 0;
  var fullStateHydrationRetryDelayMs = 0;
  var FULL_STATE_HYDRATION_MAX_AUTO_RETRIES = 3;
  var FAST_ACTION_RESPONSE_ACTIONS = new Set(['feed', 'play', 'clean', 'sleep', 'train', 'energy_drink', 'dance', 'cuddles']);
  var typingToken = 0;
  var animationMode = 'idle';
  var animationUntil = 0;
  var actionSequence = 0;
  var reducedMotionAnimationTimer = 0;
  var hatchArtTransitionUntil = 0;
  var hatchArtTransitionTimer = 0;
  var hatchStageOnePreloadPromise = null;
  var hatchArtTransitionGeneration = 0;
  var actionStartedAt = 0;
  var sleepLatched = false;
  var SLEEP_LATCH_STORAGE_KEY = 'moonpet-botty-sleep-latch-v1';
  var stageZeroBackgroundImage = null;
  var stageZeroBackgroundReady = false;
  var STAGE_ZERO_BACKGROUND_URL = '/games/assets/BITTY BACKGROUND.jpg';
  var lifecycleCeremony = null;
  var lifecycleCeremonyStartedAt = 0;
  var lifecycleCeremonyUntil = 0;
  var lifecycleCeremonyTimer = 0;
  var companionTapSequence = 0;
  var noticesBusy = false;
  var lastPassiveRefreshAt = 0;
  var reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var audioContext = null;
  var audioEnabled = readAudioPreference();
  var scoreTimer = 0;
  var scoreStep = 0;
  var radioPlayer = document.getElementById('moonpet-radio');
  var radioEnabled = false;
  var radioRequestedOn = readRadioPreference();
  var radioRequestGeneration = 0;
  var radioRetryNeedsLoad = false;
  var radioNeedsGesture = false;
  var deviceMemory = Number(navigator.deviceMemory || 0);
  var hardwareConcurrency = Number(navigator.hardwareConcurrency || 0);
  var renderQuality = reducedMotion || deviceMemory && deviceMemory <= 2 || hardwareConcurrency && hardwareConcurrency <= 2 ? 'low'
    : deviceMemory && deviceMemory <= 4 || hardwareConcurrency && hardwareConcurrency <= 4 ? 'medium' : 'high';
  var LOW_RENDER_INTERVAL_MS = 1000 / 30;
  var performanceFrames = 0;
  var performanceSlowFrames = 0;
  var performanceStartedAt = 0;
  var performanceLastFrameAt = 0;
  var performanceSent = false;
  var reducedMotionRenderMs = 0;

  var app = document.getElementById('moonpet-app');
  var canvas = document.getElementById('moonpet-canvas');
  var ctx = canvas.getContext('2d', { alpha: false });
  var hud = document.getElementById('hud');
  var canvasTools = document.getElementById('canvas-tools');
  var screen = document.getElementById('screen');
  var nav = document.getElementById('nav');
  var output = document.getElementById('terminal-output');
  var outputText = document.createElement('span');
  outputText.className = 'terminal-output-text';
  outputText.textContent = 'READY.';
  output.replaceChildren(outputText);
  var bootLayer = document.getElementById('boot-layer');
  var bootText = document.getElementById('boot-text');
  var utilityLayer = document.getElementById('utility-layer');
  var utilityTitle = document.getElementById('utility-title');
  var utilityContent = document.getElementById('utility-content');
  var utilityReturnFocus = null;
  var activeUtility = '';
  var utilityRequestGeneration = 0;

  function currentPetSleepKey(snapshot) {
    var pet = snapshot && snapshot.pet || {};
    var activeSlot = snapshot && snapshot.season_slots && Array.isArray(snapshot.season_slots.slots)
      ? snapshot.season_slots.slots.find(function (slot) { return slot && slot.active; }) || {} : {};
    var lifecycle = snapshot && snapshot.lifecycle || {};
    var seasonKey = snapshot && snapshot.season && (snapshot.season.key || snapshot.season.season_key)
      || snapshot && snapshot.season_key || activeSlot.season_key || 'current';
    return String(pet.pet_id || pet.id || activeSlot.pet_id || (lifecycle.phase === 'egg' ? 'stage0:' + seasonKey : ''));
  }

  function readSleepLatch(snapshot) {
    var petKey = currentPetSleepKey(snapshot);
    if (!petKey) return false;
    try {
      var saved = JSON.parse(window.localStorage.getItem(SLEEP_LATCH_STORAGE_KEY) || '{}');
      return saved && saved[petKey] === true;
    } catch (_) {
      return false;
    }
  }

  function setSleepLatch(value, snapshot) {
    var latched = Boolean(value);
    var petKey = currentPetSleepKey(snapshot || state);
    if (petKey === currentPetSleepKey(state)) sleepLatched = latched;
    if (!petKey) return latched;
    try {
      var saved = JSON.parse(window.localStorage.getItem(SLEEP_LATCH_STORAGE_KEY) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
      if (latched) saved[petKey] = true;
      else delete saved[petKey];
      window.localStorage.setItem(SLEEP_LATCH_STORAGE_KEY, JSON.stringify(saved));
    } catch (_) {}
    return latched;
  }

  function launchParameter(name) {
    var locations = [String(window.location.hash || '').replace(/^#/, ''), String(window.location.search || '').replace(/^\?/, '')];
    for (var index = 0; index < locations.length; index += 1) {
      if (!locations[index]) continue;
      var value = new URLSearchParams(locations[index]).get(name);
      if (value) return String(value);
    }
    return '';
  }

  function moonpetBotArtRequested() {
    var override = launchParameter('botArt') || launchParameter('bottySprites');
    if (override === '0' || override === 'false') return false;
    if (window.MOONPET_USE_BOT_ART === false) return false;
    return true;
  }

  // TEST-EXPORT: botArtEvolutionStage:start
  function botArtEvolutionStage(snapshot) {
    var lifecycle = snapshot && snapshot.lifecycle || {};
    var pet = snapshot && snapshot.pet || {};
    if (String(lifecycle.phase || '').toLowerCase() === 'egg') return 0;
    var rawEvolutionStage = pet.evolution_stage;
    if (rawEvolutionStage == null) rawEvolutionStage = lifecycle.evolution_stage;
    if (rawEvolutionStage == null) rawEvolutionStage = lifecycle.stage;
    var evolutionStage = Number(rawEvolutionStage);
    if (!Number.isFinite(evolutionStage)) return 1;
    return Math.max(1, Math.min(5, Math.floor(evolutionStage)));
  }
  // TEST-EXPORT: botArtEvolutionStage:end

  // TEST-EXPORT: resolveMoonpetDisplayName:start
  var MOONPET_CANONICAL_NAMES = Object.freeze({
    vinyl_crab: 'BOTTY', neon_raccoon: 'F1 EDDY', bubble_ram: 'JAKE THE SNAKE', comet_gecko: 'TUBBY',
    lantern_fox: 'RED ALERT', sneaker_snail: 'THE TING', alley_drake: 'TATTOO JOHN', moon_ferret: 'TIN BOB'
  });
  var MOONPET_IDENTITY_REVEAL_STAGE = 3;

  function resolveMoonpetDisplayName(lifecycle, identity) {
    lifecycle = lifecycle || {};
    identity = identity || {};
    var currentStage = identity.current_stage || {};
    var rawStage = lifecycle.evolution_stage;
    if (rawStage == null) rawStage = identity.evolution_stage;
    if (rawStage == null) rawStage = currentStage.stage;
    var stage = Math.max(0, Number(rawStage) || 0);
    if (stage < 3) return 'UNKNOWN';
    var speciesId = String(lifecycle.art_identity_id || lifecycle.species_id || identity.art_identity_id || identity.species_id || '').trim();
    var candidate = String(lifecycle.display_name || lifecycle.species_name || identity.display_name || '').trim();
    return MOONPET_CANONICAL_NAMES[speciesId] || (Object.values(MOONPET_CANONICAL_NAMES).includes(candidate) ? candidate : 'UNKNOWN');
  }
  // TEST-EXPORT: resolveMoonpetDisplayName:end
  window.resolveMoonpetDisplayName = resolveMoonpetDisplayName;

  // TEST-EXPORT: botArtIdentity:start
  function botArtIdentity(snapshot) {
    var lifecycle = snapshot && snapshot.lifecycle || {};
    var pet = snapshot && snapshot.pet || {};
    var evolutionStage = botArtEvolutionStage(snapshot);
    var identityRevealed = evolutionStage >= MOONPET_IDENTITY_REVEAL_STAGE;
    return {
      speciesId: evolutionStage >= 2 ? String(lifecycle.art_identity_id || pet.art_identity_id || lifecycle.species_id || pet.species || '') : '',
      speciesName: identityRevealed ? String(resolveMoonpetDisplayName(lifecycle, snapshot && snapshot.guidance && snapshot.guidance.identity)) : '',
      evolutionStage: evolutionStage
    };
  }
  // TEST-EXPORT: botArtIdentity:end

  async function selectBotArtForState(snapshot) {
    if (!botArtModeEnabled || !window.MoonpetBotArtRenderer) return false;
    var generation = ++botArtSelectionGeneration;
    botArtRendererReady = false;
    var selection = await window.MoonpetBotArtRenderer.selectMoonpetBot(botArtIdentity(snapshot));
    if (generation !== botArtSelectionGeneration) return false;
    botArtRendererState = selection;
    botArtRendererReady = Boolean(botArtRendererState && botArtRendererState.ready);
    botArtFallbackLogged = false;
    if (state) drawWorld(performance.now());
    return botArtRendererReady;
  }

  async function initBotArtMode() {
    if (!botArtModeEnabled) {
      console.info('[Moonpet] bot art mode disabled');
      return false;
    }
    console.info('[Moonpet] multi-bot art mode enabled');
    try {
      if (!window.MoonpetBotArtRenderer) throw new Error('MoonpetBotArtRenderer unavailable');
      botArtRendererState = await window.MoonpetBotArtRenderer.initMoonpetBotArtRenderer(botArtIdentity(state));
      botArtRendererReady = Boolean(botArtRendererState && botArtRendererState.ready);
      if (!botArtRendererReady) {
        console.info('[Moonpet] bot art safe loading state used', botArtRendererState);
      }
      return botArtRendererReady;
    } catch (error) {
      botArtRendererReady = false;
      botArtRendererState = { reason: error.message, errors: [error.message] };
      console.info('[Moonpet] bot art safe loading state used', botArtRendererState);
      return false;
    }
  }

  function freshInheritedTelegramInitData(raw) {
    var value = String(raw || '');
    if (!value) return '';
    try {
      var authDate = Number(new URLSearchParams(value).get('auth_date'));
      var age = Math.floor(Date.now() / 1000) - authDate;
      // This is only a freshness filter for inherited launch data. The Worker
      // still verifies the signature before loading or mutating any player save.
      return Number.isSafeInteger(authDate) && authDate > 0 && age >= -300 && age <= 3600 ? value : '';
    } catch (_) { return ''; }
  }

  function refreshTelegramContext() {
    tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : tg;
    initData = String(tg && tg.initData || '') || freshInheritedTelegramInitData(launchParameter('tgWebAppData'));
    return Boolean(initData);
  }

  async function waitForTelegramContext() {
    if (refreshTelegramContext()) return true;
    for (var attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(function (resolve) { setTimeout(resolve, 50); });
      if (refreshTelegramContext()) return true;
    }
    return false;
  }

  function syncViewportHeight() {
    var telegramHeight = Number(tg && (tg.viewportHeight || tg.viewportStableHeight) || 0);
    var visualHeight = Number(window.visualViewport && window.visualViewport.height || 0);
    var height = Math.round(telegramHeight || visualHeight || window.innerHeight || document.documentElement.clientHeight || 0);
    if (height > 240) document.documentElement.style.setProperty('--moonpet-viewport-height', height + 'px');
  }

  function bindViewportSizing() {
    syncViewportHeight();
    window.addEventListener('resize', syncViewportHeight, { passive: true });
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', syncViewportHeight, { passive: true });
    }
    try { if (tg && tg.onEvent) tg.onEvent('viewportChanged', syncViewportHeight); } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function words(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function moonpetStageLabel(lifecycle, pet) {
    lifecycle = lifecycle || {};
    pet = pet || {};
    var phase = String(lifecycle.phase || '').toLowerCase();
    var stage = String(pet.stage || '').toLowerCase();
    if (phase === 'egg' || stage === 'egg' || stage === 'moon_egg' || stage === 'secret_bot') return 'Secret Bot';
    return words(pet.stage || lifecycle.phase || 'companion');
  }

  function number(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-GB');
  }

  // TEST-EXPORT: countdownComponent:start
  function serverNowMs() {
    return Date.now() + serverClockOffsetMs;
  }

  function cooldownRemainingSeconds(source, nowMs) {
    source = source || {};
    var sourceNowMs = Date.parse(source.server_time || '');
    nowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Number.isFinite(sourceNowMs) ? sourceNowMs : serverNowMs();
    var expiresAt = Date.parse(source.expires_at || source.cooldown_until || source.available_at || source.retry_at || '');
    if (Number.isFinite(expiresAt)) return Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
    var explicit = Number(source.remaining_seconds);
    if (Number.isFinite(explicit) && explicit > 0) return Math.ceil(explicit);
    var retry = Number(source.retry_after_seconds != null ? source.retry_after_seconds : source.cooldown_seconds != null ? source.cooldown_seconds : source.seconds);
    if (Number.isFinite(retry) && retry > 0) return Math.ceil(retry);
    var ms = Number(source.cooldown_ms_remaining != null ? source.cooldown_ms_remaining : source.ms_remaining);
    return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
  }

  function cooldownExpiresAt(source, nowMs) {
    source = source || {};
    var sourceNowMs = Date.parse(source.server_time || '');
    nowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Number.isFinite(sourceNowMs) ? sourceNowMs : serverNowMs();
    var expires = Date.parse(source.expires_at || source.cooldown_until || source.available_at || source.retry_at || '');
    if (Number.isFinite(expires)) return new Date(expires).toISOString();
    var remaining = cooldownRemainingSeconds(source, nowMs);
    return remaining > 0 ? new Date(Math.floor(nowMs / 1000) * 1000 + remaining * 1000).toISOString() : '';
  }

  function formatCountdownSeconds(seconds) {
    var remaining = Math.max(0, Math.ceil(Number(seconds) || 0));
    var days = Math.floor(remaining / 86400);
    remaining -= days * 86400;
    var hours = Math.floor(remaining / 3600);
    remaining -= hours * 3600;
    var minutes = Math.floor(remaining / 60);
    var secs = remaining - minutes * 60;
    if (days > 0) return days + 'd ' + String(hours).padStart(2, '0') + 'h ' + String(minutes).padStart(2, '0') + 'm';
    if (hours > 0) return hours + 'h ' + String(minutes).padStart(2, '0') + 'm ' + String(secs).padStart(2, '0') + 's';
    if (minutes > 0) return minutes + 'm ' + String(secs).padStart(2, '0') + 's';
    return secs + 's';
  }

  function countdownText(source, prefix) {
    var remaining = cooldownRemainingSeconds(source, serverNowMs());
    return remaining > 0 ? (prefix || 'Available in ') + formatCountdownSeconds(remaining) : 'Ready now';
  }

  function countdownMarkup(source, prefix) {
    source = source || {};
    var nowMs = serverNowMs();
    var expiresAt = cooldownExpiresAt(source, nowMs);
    var remaining = cooldownRemainingSeconds(expiresAt ? { expires_at: expiresAt } : source, nowMs);
    if (remaining <= 0) return 'Ready now';
    return '<span class="cooldown-countdown" data-cooldown-expires-at="' + escapeHtml(expiresAt) + '" data-cooldown-prefix="' + escapeHtml(prefix || 'Available in ') + '">' + escapeHtml((prefix || 'Available in ') + formatCountdownSeconds(remaining)) + '</span>';
  }
  // TEST-EXPORT: countdownComponent:end

  function readAudioPreference() {
    try { return window.localStorage.getItem('moonpet-audio') !== 'off'; } catch (_) { return true; }
  }

  function readRadioPreference() {
    // Legacy arcade_radio_on=false also recorded playback failures, not just user choices.
    try { return window.localStorage.getItem('moonpet-radio-preference') !== 'off'; } catch (_) { return true; }
  }

  function saveRadioPreference(on) {
    try { window.localStorage.setItem('moonpet-radio-preference', on ? 'on' : 'off'); } catch (_) {}
    try { window.localStorage.setItem('arcade_radio_on', on ? 'true' : 'false'); } catch (_) {}
  }

  // TEST-EXPORT: radioPlayback:start
  function radioPlaybackFailed(error, announce) {
    radioRequestedOn = false;
    radioEnabled = false;
    radioNeedsGesture = Boolean(error && error.name === 'NotAllowedError');
    radioRetryNeedsLoad = !radioNeedsGesture;
    syncMoonpetScore();
    renderCanvasTools();
    var code = Number(radioPlayer && radioPlayer.error && radioPlayer.error.code || error && error.code || 0);
    var reason = ({ 1: 'INTERRUPTED', 2: 'NETWORK', 3: 'DECODE', 4: 'FORMAT' })[code];
    if (announce !== false) tell(radioNeedsGesture
      ? 'RADIO NEEDS A TAP. TAP THE RADIO ICON TO PLAY.'
      : 'RADIO CONNECTION LOST' + (reason ? ' [' + reason + ' / ' + code + ']' : '') + '. TAP THE RADIO ICON TO RECONNECT.', 'danger');
  }

  async function setRadioEnabled(on, announce) {
    radioRequestedOn = Boolean(on);
    radioNeedsGesture = false;
    var requestGeneration = ++radioRequestGeneration;
    if (!on) {
      if (radioPlayer) radioPlayer.pause();
      radioEnabled = false;
      saveRadioPreference(false);
      syncMoonpetScore();
      renderCanvasTools();
      if (announce !== false) tell('GRAFFPUNKS RADIO OFFLINE.');
      return false;
    }
    try {
      radioEnabled = false;
      var player = radioPlayer;
      player.volume = 0.5;
      // Reset a failed stream inside this tap, then call play before any await.
      // iOS/WebViews can lose media permission across an async module load.
      if (radioRetryNeedsLoad || player.error) player.load();
      var playback = player.play();
      syncMoonpetScore();
      renderCanvasTools();
      await playback;
      if (requestGeneration !== radioRequestGeneration) {
        if (!radioRequestedOn) player.pause();
        return false;
      }
      radioEnabled = true;
      radioRetryNeedsLoad = false;
      saveRadioPreference(true);
      syncMoonpetScore();
      renderCanvasTools();
      if (announce !== false) tell('GRAFFPUNKS RADIO LIVE.');
      return true;
    } catch (error) {
      if (requestGeneration !== radioRequestGeneration) return false;
      radioPlaybackFailed(error, announce);
      return false;
    }
  }

  function toggleRadio() {
    var playback = setRadioEnabled(!radioRequestedOn, true);
    haptic('light');
    return playback;
  }
  function resumeRadioOnGesture(event) {
    if (!radioNeedsGesture || radioRequestedOn || radioEnabled || !state || document.hidden || !event.isTrusted) return;
    if (event.type === 'keydown' && (event.repeat || !['Enter', ' '].includes(event.key))) return;
    // The Radio button owns its toggle; Audio should not unexpectedly start radio.
    if (event.target && event.target.closest && event.target.closest('[data-utility="radio"], [data-utility="audio"]')) return;
    setRadioEnabled(true, false);
  }

  function bindRadioGestureResume() {
    document.addEventListener('click', resumeRadioOnGesture, true);
    document.addEventListener('keydown', resumeRadioOnGesture, true);
  }
  // TEST-EXPORT: radioPlayback:end

  bindRadioGestureResume();

  radioPlayer.addEventListener('error', function () {
    // A pending play promise handles its own failure. This covers later dropouts.
    if (radioEnabled && radioRequestedOn && radioPlayer.error) {
      radioRequestGeneration += 1;
      radioPlaybackFailed(radioPlayer.error, true);
    }
  });

  function ensureAudio() {
    if (!audioEnabled) return null;
    if (!audioContext) {
      if (navigator.userActivation && !navigator.userActivation.isActive) return null;
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      try { audioContext = new AudioContextClass(); } catch (_) { return null; }
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(function () {});
    return audioContext;
  }

  function playAudioCue(kind) {
    var audio = ensureAudio();
    if (!audio || audio.state === 'closed') return;
    var cues = {
      light: [240, 0.025, 'square'], medium: [320, 0.045, 'square'],
      success: [520, 0.12, 'triangle'], error: [110, 0.16, 'sawtooth'],
    };
    var cue = cues[kind] || cues.light;
    var now = audio.currentTime;
    var oscillator = audio.createOscillator();
    var gain = audio.createGain();
    oscillator.type = cue[2];
    oscillator.frequency.setValueAtTime(cue[0], now);
    if (kind === 'success') oscillator.frequency.exponentialRampToValueAtTime(780, now + cue[1]);
    if (kind === 'error') oscillator.frequency.exponentialRampToValueAtTime(72, now + cue[1]);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'light' ? 0.018 : 0.035, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cue[1]);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + cue[1] + 0.01);
  }

  function scoreMotif() {
    var motifs = {
      home: [110, 165, 220, 165, 130, 196, 247, 196], missions: [130, 196, 261, 196, 146, 220, 293, 220],
      explore: [98, 147, 196, 294, 110, 165, 220, 330], work: [123, 185, 247, 185, 138, 207, 277, 207],
      economy: [147, 220, 294, 440, 165, 247, 330, 494], profile: [165, 247, 330, 247, 185, 277, 370, 277],
    };
    return motifs[activeScreen] || motifs.home;
  }

  function playScoreStep() {
    if (!audioEnabled || radioRequestedOn || document.hidden) return;
    var audio = ensureAudio();
    if (!audio || audio.state === 'closed') return;
    var motif = scoreMotif();
    var frequency = motif[scoreStep % motif.length];
    var now = audio.currentTime;
    var oscillator = audio.createOscillator();
    var bass = audio.createOscillator();
    var gain = audio.createGain();
    oscillator.type = scoreStep % 4 ? 'triangle' : 'square'; oscillator.frequency.setValueAtTime(frequency, now);
    bass.type = 'sine'; bass.frequency.setValueAtTime(frequency / 2, now);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.012, now + 0.018); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    oscillator.connect(gain); bass.connect(gain); gain.connect(audio.destination);
    oscillator.start(now); bass.start(now); oscillator.stop(now + 0.35); bass.stop(now + 0.35);
    scoreStep += 1;
  }

  function syncMoonpetScore() {
    window.clearInterval(scoreTimer); scoreTimer = 0;
    if (!audioEnabled || radioRequestedOn) return;
    playScoreStep();
    scoreTimer = window.setInterval(playScoreStep, 520);
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    try { window.localStorage.setItem('moonpet-audio', audioEnabled ? 'on' : 'off'); } catch (_) {}
    if (audioEnabled) playAudioCue('success');
    syncMoonpetScore();
    renderCanvasTools();
    tell('AUDIO ' + (audioEnabled ? 'ONLINE.' : 'MUTED.'));
  }

  function haptic(kind) {
    playAudioCue(kind);
    if (audioEnabled && !scoreTimer && !radioRequestedOn) syncMoonpetScore();
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === 'success' || kind === 'error') tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.impactOccurred(kind || 'light');
    } catch (_) {}
  }

  function authBody() {
    if (initData) return { init_data: initData };
    if (telegramAuth) return { telegram_auth: telegramAuth };
    return {};
  }

  async function restoreBrowserAuth() {
    if (initData || !window.MOONBOYS_IDENTITY || typeof window.MOONBOYS_IDENTITY.restoreLinkedTelegramAuth !== 'function') return;
    try {
      var restored = await window.MOONBOYS_IDENTITY.restoreLinkedTelegramAuth();
      telegramAuth = restored && restored.ok ? restored.telegram_auth : null;
    } catch (_) { telegramAuth = null; }
  }

  // TEST-EXPORT: apiRequest:start
  async function post(path, payload, options) {
    if (!apiBase) throw new Error('API ENDPOINT DISABLED FOR THIS CONTEXT');
    if (authenticationFailure) {
      var expiredError = new Error('TELEGRAM SESSION EXPIRED. OPEN A FRESH SESSION FROM @WIKICOMSBOT.');
      expiredError.status = 401;
      throw expiredError;
    }
    var controller = new AbortController();
    var timeoutError = new Error('REQUEST TIMED OUT. TAP REFRESH TO READ YOUR SAVE.');
    timeoutError.code = 'request_timeout';
    var timeoutMs = path === '/telegram-pets/app/state' && payload && payload.mode === 'live' ? 30000 : 60000;
    var requestTimer;
    var cancelRequest;
    var signal = options && options.signal;
    var cancelled = new Promise(function (_, reject) {
      cancelRequest = function () {
        var error = new Error('BACKGROUND STATE REQUEST SUPERSEDED');
        error.code = 'request_superseded';
        reject(error);
        controller.abort();
      };
      if (signal) {
        if (signal.aborted) cancelRequest();
        else signal.addEventListener('abort', cancelRequest, { once: true });
      }
    });
    var deadline = new Promise(function (_, reject) {
      requestTimer = setTimeout(function () {
        reject(timeoutError);
        controller.abort();
      }, timeoutMs);
    });
    try {
      // The deadline covers fetch, body reads and all read-only retries. Racing
      // it also releases callers' guards if a transport ignores cancellation.
      return await Promise.race([deadline, cancelled, (async function () {
        // State is safe to retry after a transient D1 read failure. Mutations
        // must never replay automatically after an unconfirmed response.
        var stateAttempts = path === '/telegram-pets/app/state' ? 3 : 1;
        for (var attempt = 0; attempt < stateAttempts; attempt += 1) {
          if (controller.signal.aborted) throw timeoutError;
          var response = await fetch(apiBase + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({}, authBody(), payload || {})),
            signal: controller.signal,
          });
          if (controller.signal.aborted) throw timeoutError;
          var data = await response.json().catch(function () { return {}; });
          if (controller.signal.aborted) throw timeoutError;
          var retryableStateFailure = response.status === 503 && data.error === 'mini_app_state_failed' && attempt + 1 < stateAttempts;
          if (retryableStateFailure) {
            await new Promise(function (resolve) { setTimeout(resolve, attempt ? 700 : 250); });
            continue;
          }
          if (!response.ok && response.status !== 409) {
            var requestError = new Error(data.error || 'NETWORK HANDSHAKE FAILED');
            requestError.status = response.status;
            requestError.retryAfterSeconds = Math.max(0, Number(data.retry_after_seconds || 0));
            if (response.status === 401) {
              authenticationFailure = true;
              petActionRefreshRequired = true;
              if (state) render();
            }
            throw requestError;
          }
          return data;
        }
        throw new Error('mini_app_state_failed');
      }())]);
    } finally {
      clearTimeout(requestTimer);
      if (signal) signal.removeEventListener('abort', cancelRequest);
    }
  }
  // TEST-EXPORT: apiRequest:end

  async function typeBoot(lines, options) {
    var token = ++typingToken;
    var content = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join('\n');
    var reduced = reducedMotion;
    bootLayer.classList.toggle('is-compact', Boolean(state) && !(options && options.full));
    bootLayer.classList.toggle('is-notice', Boolean(options && options.notice));
    bootLayer.scrollTop = 0;
    bootLayer.classList.remove('is-hidden');
    bootText.textContent = '';
    var speed = reduced ? 0 : Number(options && options.speed || 7);
    for (var index = 0; index < content.length; index += 1) {
      if (token !== typingToken) return;
      bootText.textContent += content[index];
      if (speed && (content[index] === '\n' || index % 2 === 0)) await new Promise(function (resolve) { setTimeout(resolve, speed); });
    }
    await new Promise(function (resolve) { setTimeout(resolve, reduced ? 10 : Number(options && options.hold || 280)); });
    if (token === typingToken) bootLayer.classList.add('is-hidden');
  }

  // TEST-EXPORT: statusOutput:start
  function uniqueStatusMessage(message) {
    var seen = {};
    return String(message || 'READY.').split(/\s*\/\/\s*/).filter(function (part) {
      var key = part.replace(/\s+/g, ' ').trim().toUpperCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    }).join(' // ');
  }

  function syncStatusScroll() {
    output.classList.remove('is-scrolling');
    output.style.removeProperty('--status-scroll-duration');
    requestAnimationFrame(function () {
      var availableWidth = Math.max(1, output.clientWidth - 24);
      if (outputText.scrollWidth <= availableWidth) return;
      var duration = Math.max(10, Math.min(32, outputText.scrollWidth / 22));
      output.style.setProperty('--status-scroll-duration', duration.toFixed(2) + 's');
      output.classList.add('is-scrolling');
    });
  }

  function tell(message, tone) {
    var nextTone = tone || '';
    var nextMessage = uniqueStatusMessage(message);
    if (output.dataset.tone === nextTone && outputText.textContent === nextMessage) return false;
    output.dataset.tone = nextTone;
    outputText.textContent = nextMessage;
    syncStatusScroll();
    return true;
  }
  // TEST-EXPORT: statusOutput:end

  // TEST-EXPORT: actionAvailability:start
  function cooldownDisplay(source) {
    return countdownText(source, 'Available in ');
  }

  function availabilityLabel(options) {
    options = options || {};
    if (options.statusLabel) return String(options.statusLabel);
    if (options.authoritySyncing) return 'AUTHORITY SYNCING';
    if (options.eggRequired) return 'EGG / INCUBATION REQUIRED';
    if (options.activePetRequired) return 'ACTIVE PET REQUIRED';
    if (options.resourceRequired) return 'NOT ENOUGH RESOURCE';
    if (options.cooldown) return cooldownDisplay(options.cooldown);
    if (options.disabled) return 'LOCKED';
    return 'Ready now';
  }

  function availabilityDetailMarkup(options) {
    options = options || {};
    var label = options.cooldown ? (options.statusLabel ? escapeHtml(options.statusLabel) + ' // ' : '') + countdownMarkup(options.cooldown, 'Available in ') : escapeHtml(availabilityLabel(options));
    var detail = options.detail ? String(options.detail) : '';
    return detail ? label + ' // ' + escapeHtml(detail) : label;
  }

  function shouldShowAvailability(options) {
    options = options || {};
    return Boolean(
      options.detail
      || options.disabled
      || options.authoritySyncing
      || options.activePetRequired
      || options.eggRequired
      || options.resourceRequired
      || options.cooldown
    );
  }

  function cooldownMetadata(source) {
    source = source || {};
    var hasCooldownField = source.retry_after_seconds != null
      || source.seconds != null
      || source.cooldown_ms_remaining != null
      || source.ms_remaining != null
      || source.cooldown_until
      || source.available_at
      || source.retry_at
      || source.expires_at
      || source.remaining_seconds != null;
    return hasCooldownField && cooldownDisplay(source) !== 'Ready now' ? source : null;
  }

  function activityClaimButtonOptions(activity) {
    activity = activity || {};
    var cooldown = !activity.ready ? cooldownMetadata(activity) : null;
    var waitingDetail = !activity.ready && !cooldown && activity.detail ? String(activity.detail) : '';
    return { disabled: !activity.ready, cooldown: cooldown, statusLabel: waitingDetail ? 'WAITING' : '', detail: waitingDetail };
  }

  function actionCooldownEntry(action) {
    var key = 'action:' + String(action || '');
    var entries = Array.isArray(state && state.cooldowns && state.cooldowns.entries) ? state.cooldowns.entries : [];
    var entry = entries.find(function (candidate) { return candidate && candidate.key === key; }) || null;
    if (!entry) return null;
    return cooldownRemainingSeconds(entry) > 0 ? entry : null;
  }

  function actionCooldownButtonOptions(action, options) {
    options = options || {};
    if (options.cooldown && cooldownRemainingSeconds(options.cooldown) > 0) return options;
    var actionCooldown = actionCooldownEntry(action);
    if (!actionCooldown) return options;
    return Object.assign({}, options, {
      disabled: true,
      cooldown: actionCooldown,
      statusLabel: '',
    });
  }
  function careActionButtonOptions(action, options) {
    var activity = state && state.guidance && state.guidance.activity;
    if (['sleep', 'train'].includes(action) && activity && activity.status === 'active') return Object.assign({}, options, {
      disabled: true, cooldown: null, statusLabel: 'ACTIVITY RUNNING',
      detail: 'Review your background activity in Work before using Sleep or Train. Other care and Contracts remain available.',
    });
    if (action === 'train' && state && state.pet && Number(state.pet.energy) < 18) return Object.assign({}, options, {
      disabled: true, resourceRequired: true, detail: 'Requires 18 energy. Use care or review a recovery activity.',
    });
    return options;
  }
  // TEST-EXPORT: actionAvailability:end

  // TEST-EXPORT: playOptionsRecovery:start
  function playOptionsReady() {
    return Boolean(window.MoonpetPlayOptions && typeof window.MoonpetPlayOptions.runAvailability === 'function');
  }

  function reloadPlayOptions() {
    if (playOptionsReady()) return Promise.resolve();
    if (playOptionsLoadPromise) return playOptionsLoadPromise;
    playOptionsLoadPromise = new Promise(function (resolve, reject) {
      var original = document.querySelector('script[src*="/js/moonpet-play-options.js"]');
      if (!original) { reject(new Error('RUN CONTROLS UNAVAILABLE. REOPEN THE APP TO RETRY.')); return; }
      var script = document.createElement('script');
      var timeout = window.setTimeout(function () { finish(false); }, 8000);
      function finish(loaded) {
        window.clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (!loaded || !playOptionsReady()) {
          script.remove();
          reject(new Error('RUN CONTROLS UNAVAILABLE. TAP REFRESH TO RETRY.'));
        } else resolve();
      }
      var source = new URL(original.src, window.location.href);
      source.searchParams.set('moonpet_retry', Date.now());
      script.src = source.href;
      script.setAttribute('data-cfasync', 'false');
      script.onload = function () { finish(true); };
      script.onerror = function () { finish(false); };
      document.head.appendChild(script);
    }).finally(function () { playOptionsLoadPromise = null; });
    return playOptionsLoadPromise;
  }
  // TEST-EXPORT: playOptionsRecovery:end

  function button(label, action, payload, options) {
    // One cached, local description per live action; no additional fetch or timer.
    if (!button.guidance) button.guidance = {
      "adopt": [
            "Create your first Secret Bot once Arcade entry is unlocked. Your Arcade XP is kept.",
            "progress"
      ],
      "incubate": [
            "Add the selected care signal to your egg. Mix care types to prepare its breakout.",
            "care"
      ],
      "hatch": [
            "Start EGGYONE breakout when its signal is ready. Its identity stays hidden until Stage 3.",
            "progress"
      ],
      "feed": [
            "Reduce hunger and restore some energy so your pet is ready for more activities.",
            "care"
      ],
      "play": [
            "Spend some energy to raise happiness and earn capped care rewards.",
            "care"
      ],
      "clean": [
            "Raise cleanliness to keep your pet in good condition; this uses a little energy.",
            "care"
      ],
      "sleep": [
            "Restore energy now so your pet can keep playing. This is separate from timed Sleep in Work.",
            "care"
      ],
      "train": [
            "Spend energy to earn training rewards and build your pet’s progression.",
            "spend"
      ],
      "energy_drink": [
            "Restore energy without using a bag item. This Care action awards no XP.",
            "care"
      ],
      "dance": [
            "Raise happiness with a dance. This Care action awards no XP or incubation signal.",
            "care"
      ],
      "cuddles": [
            "Raise happiness with affection. This Care action awards no XP or incubation signal.",
            "care"
      ],
      "daily_chest": [
            "Collect today’s Daily Cache once per account. Check the displayed rewards and XP allowance.",
            "claim"
      ],
      "buy_pet_slot": [
            "Spend the displayed Arcade XP to unlock this permanent space and create its egg.",
            "spend"
      ],
      "switch_pet_slot": [
            "Make this saved pet active for care and new activities. Its existing progress is kept.",
            "manage"
      ],
      "delete_pet_slot": [
            "Permanently delete this pet after confirmation. Its training is lost; the owned space and account reward history stay.",
            "risk"
      ],
      "contract_start": [
            "Start this quest using your selected build, difficulty and route length. No pet energy cost; earn Contract rank.",
            "progress"
      ],
      "contract_step": [
            "Commit this saved quest choice. Compare its effect on route health, supplies and your goal before choosing.",
            "choice"
      ],
      "contract_claim": [
            "Finish delivery of a saved Contract XP bonus to its original pet. No new quest is needed.",
            "claim"
      ],
      "daily_completion_claim": [
            "Collect a saved daily 7/7 bonus. Complete and claim the daily missions to qualify.",
            "claim"
      ],
      "finale_start": [
            "Start the finale with this build when its requirements are met. Battle health is separate from pet energy.",
            "combat"
      ],
      "finale_retry": [
            "Retry the finale with this build after a failed attempt. No pet energy cost.",
            "combat"
      ],
      "finale_step": [
            "Choose the next finale move. Compare damage, defense and kit use to survive the saved battle.",
            "choice"
      ],
      "finale_claim": [
            "Collect the reward from your saved finale victory. You do not need to fight again.",
            "claim"
      ],
      "event_recover": [
            "Finish the original saved Street Event for the pet that started it. No new choice or attempt.",
            "claim"
      ],
      "event_close": [
            "Give up this unverifiable old event after confirmation. No reward or refund; its original history is kept.",
            "risk"
      ],
      "random_event": [
            "Commit this Street Event choice. Review its costs, possible reward and setback before choosing.",
            "choice"
      ],
      "adventure": [
            "Take this adventure route. Compare the entry requirement, costs and risk before committing.",
            "choice"
      ],
      "run_start": [
            "Begin a repeatable Moon Run. Clear rooms, then extract to bank rewards before a failed room loses the bag.",
            "spend"
      ],
      "daily_run_start": [
            "Use your one official attempt for this UTC day. Cleared rooms count toward Daily Journey objectives.",
            "spend"
      ],
      "run_step": [
            "Resolve the next saved room with this choice. Compare clear chance, costs and failure damage first.",
            "choice"
      ],
      "daily_run_tactic": [
            "Choose this checkpoint tactic for the rest of your official run. Compare its bonuses and trade-offs.",
            "choice"
      ],
      "run_extract": [
            "End this saved run now. Check the displayed payout and whether this ends today’s official attempt.",
            "risk"
      ],
      "arena_matchmake": [
            "Join player matchmaking for an Arena battle. You can leave the queue before a match starts.",
            "combat"
      ],
      "arena_start": [
            "Start an Arena battle against the CRT rival. Choose one move at a time to win the battle.",
            "combat"
      ],
      "arena_ready": [
            "Confirm you are ready to start this player match. The battle begins when both players are ready.",
            "combat"
      ],
      "arena_move": [
            "Lock your move for this round. Balance damage, stamina and defense before committing.",
            "choice"
      ],
      "arena_forfeit": [
            "Concede this active Arena battle. This ends your fight instead of preserving it for later.",
            "risk"
      ],
      "arena_queue_cancel": [
            "Leave Arena matchmaking before a battle starts. Rejoin later when you want to play.",
            "manage"
      ],
      "kaiju_matchmake": [
            "Join player matchmaking for Kaiju cards. Compare your cards once the match category appears.",
            "combat"
      ],
      "kaiju_start": [
            "Start a Kaiju card match against the CRT rival. Play for the strongest active category.",
            "combat"
      ],
      "kaiju_card": [
            "Lock this card for the active category. Compare ACTIVE values; your rival’s card stays hidden.",
            "choice"
      ],
      "kaiju_queue_cancel": [
            "Leave Kaiju matchmaking before a match starts. You can join again later.",
            "manage"
      ],
      "kaiju_match_cancel": [
            "Cancel this eligible solo Kaiju match instead of submitting a card.",
            "manage"
      ],
      "district_mission": [
            "Take this district approach to build mastery and earn capped rewards. Compare the cost and setback risk.",
            "choice"
      ],
      "event_chain": [
            "Save this choice in the current story. Compare its listed reward and bonus before committing.",
            "choice"
      ],
      "seasonal_boss": [
            "Make this raid attack. Review energy, damage and cooldowns to work toward the saved boss reward.",
            "combat"
      ],
      "seasonal_boss_claim": [
            "Collect a saved raid reward for its original pet. No second attack or energy payment.",
            "claim"
      ],
      "weekly_boss": [
            "Make this weekly boss attack. Compare its cost and damage to work toward the displayed victory reward.",
            "combat"
      ],
      "weekly_boss_claim": [
            "Collect the reward from a saved weekly boss victory. No second fight is needed.",
            "claim"
      ],
      "work": [
            "Do this job now for its displayed base rewards. Check level, specialist requirements and cooldown.",
            "progress"
      ],
      "activity_start": [
            "Start one background activity. It continues while you play or close the app; return here to claim it.",
            "progress"
      ],
      "activity_claim": [
            "Collect this activity’s saved reward and end its timer. Waiting longer can change rewards until the duration cap.",
            "claim"
      ],
      "activity_cancel": [
            "End this background activity without collecting its rewards. Start another activity after it closes.",
            "risk"
      ],
      "bounty_claim": [
            "Collect this completed daily bounty’s listed rewards. Progress is shared across your account.",
            "claim"
      ],
      "market_buy": [
            "Spend the displayed currency on this whole bundle. Check the contents and storage space before buying.",
            "spend"
      ],
      "buy": [
            "Buy this permanent equipment with the displayed currency. Equip it to use its bonuses.",
            "spend"
      ],
      "equip": [
            "Equip this owned item on your selected pet for its bonuses. Switching is free and keeps mastery.",
            "manage"
      ],
      "use_item": [
            "Consume one bag item now for its listed effect. Check the description before spending it.",
            "spend"
      ],
      "expedition": [
            "Spend the listed energy and one shared daily attempt for a possible find. Compare destinations first.",
            "spend"
      ],
      "gear_upgrade": [
            "Spend the quoted resources to improve this item. Its higher level strengthens its equipment bonus.",
            "spend"
      ],
      "craft": [
            "Spend the listed ingredients to make the displayed item. Check output space, then use it from your bag.",
            "spend"
      ],
      "cosmetic_unlock": [
            "Spend the displayed resources to unlock this style. Equip it in Style Lab to use its appearance.",
            "spend"
      ],
      "style_equip": [
            "Change your selected pet’s visible style for free. Owned style unlocks remain available.",
            "manage"
      ],
      "trade": [
            "Risk the displayed Moon Gold stake for a random profit or loss. A loss spends your stake.",
            "risk"
      ],
      "notification_set": [
            "Choose whether Moonpet can send you Telegram reminders. This does not change your pet’s progress.",
            "manage"
      ],
      "evolve": [
            "Advance to the next lifetime stage once the listed age and progression requirements are met.",
            "progress"
      ],
      "season_claim": [
            "Collect this unlocked competition tier’s reward. Your pet’s lifetime progress continues separately.",
            "claim"
      ],
      "rare_morph": [
            "Answer the unlocked rare signal to transform your pet. The route opens from its saved traits and history.",
            "progress"
      ],
      "rename": [
            "Save the callsign entered above for this pet. Its canonical identity and progression stay separate.",
            "manage"
      ]
};
    options = careActionButtonOptions(action, actionCooldownButtonOptions(action, options));
    if (['run_start', 'daily_run_start', 'run_step', 'run_extract', 'daily_run_tactic'].includes(action) && !playOptionsReady()) {
      options = Object.assign({}, options, { disabled: true, cooldown: null, statusLabel: 'REFRESH REQUIRED', detail: 'Run controls unavailable. Tap Refresh to retry.' });
    }
    if (action === 'adopt' && !(state && state.entry_requirement && state.entry_requirement.eligible === true)) {
      options = Object.assign({}, options, { disabled: true, statusLabel: 'ARCADE XP REQUIRED' });
    }
    var accountActions = ['adopt', 'guidance_ack', 'notification_set', 'season_slots', 'buy_pet_slot', 'switch_pet_slot', 'delete_pet_slot', 'arena_queue_cancel', 'arena_forfeit', 'kaiju_queue_cancel', 'kaiju_match_cancel'];
    var eggActions = accountActions.concat(['incubate', 'hatch', 'energy_drink', 'dance', 'cuddles', 'bounty_claim', 'season_claim', 'weekly_boss_claim', 'contract_claim', 'style_equip', 'seasonal_boss_claim', 'daily_completion_claim', 'finale_start', 'finale_retry', 'finale_step', 'finale_claim', 'event_recover', 'event_close']);
    if (state && state.lifecycle && state.lifecycle.phase === 'egg' && !eggActions.includes(action)) {
      options = Object.assign({}, options, { disabled: true, cooldown: null, statusLabel: 'HATCH REQUIRED' });
    } else if (state && state.adopted === false && !accountActions.includes(action)) {
      options = Object.assign({}, options, { disabled: true, cooldown: null, statusLabel: 'ADOPT A PET FIRST' });
    }
    if (petActionRefreshRequired) {
      options = Object.assign({}, options, { disabled: true, statusLabel: 'REFRESH REQUIRED' });
    }
    var disabled = options && options.disabled;
    var help = button.guidance[action] || ['Review the displayed requirements and effect before committing this action.', 'choice'];
    var purpose = help[0];
    var kind = help[1];
    if (action === 'contract_step' && payload && payload.choice === 'abandon') {
      purpose = 'Abandon this quest with no points or XP. Closing the app instead keeps it saved.';
      kind = 'risk';
    }
    if (action === 'run_extract' && state && state.guidance && state.guidance.active_run && state.guidance.active_run.settlement_pending) {
      purpose = 'Finish delivery of the saved boss result. No new room, fight or daily attempt.';
      kind = 'claim';
    }
    if (action === 'activity_claim' && state && state.guidance && state.guidance.activity && state.guidance.activity.recovery_pending) purpose = 'Finish this saved activity claim without paying twice. Its original reward stays bound to its source pet.';
    if (action === 'arena_matchmake' && payload && payload.accept_any_rank) purpose = 'Widen matchmaking to any rank. Your next rival can be stronger than a normal rank match.';
    if (action === 'notification_set') purpose = payload && payload.enabled
      ? 'Allow Moonpet Telegram reminders so you can return to ready activities. Pet progress is unchanged.'
      : 'Stop Moonpet Telegram reminders. Your saved pet and background activities keep progressing.';
    if (action === 'activity_start' && payload) {
      var activityPurpose = { sleep: 'Recover stats in the background', train: 'Build training rewards in the background', work: 'Earn work rewards in the background', explore: 'Gather exploration finds in the background' };
      if (activityPurpose[payload.activity_type]) purpose = activityPurpose[payload.activity_type] + '. Compare duration previews; return here to claim and end the timer.';
    }
    var badge = disabled ? 'UNAVAILABLE' : kind === 'claim' ? 'CLAIM READY' : kind === 'risk' ? 'REVIEW RISK' : kind === 'spend' ? 'CHECK COST' : kind === 'choice' ? 'COMMIT CHOICE' : 'READY';
    var descriptionId = 'moonpet-action-description-' + (button.descriptionCount = (button.descriptionCount || 0) + 1);
    var detail = shouldShowAvailability(options)
      ? '<small class="button-requirements" id="' + descriptionId + '-requirements">' + availabilityDetailMarkup(options) + '</small>'
      : '';
    var describedBy = descriptionId + '-purpose' + (detail ? ' ' + descriptionId + '-requirements' : '');
    return '<button class="terminal-button action-button action-' + kind + (kind === 'risk' ? ' danger' : '') + '" type="button" data-action="' + escapeHtml(action) + '" data-payload="' + escapeHtml(JSON.stringify(payload || {})) + '" aria-label="' + escapeHtml(label) + '" aria-description="' + escapeHtml(purpose) + '" aria-describedby="' + describedBy + '"' + (disabled ? ' disabled' : '') + '>' + escapeHtml(label) + '<span class="button-state">' + badge + '</span><span class="button-purpose" id="' + descriptionId + '-purpose">' + escapeHtml(purpose) + '</span>' + detail + '</button>';
  }

  var panelOpenState = Object.create(null);
  var panelDescriptions = {
    recommended: ['✦', 'Your next three routes, ranked from the current save.'],
    'play-now': ['▶', 'Browse more activities, goals and ways to play.'],
    'active-pet': ['◉', 'Your active companion, stage and growth progress.'],
    incubation: ['◉', 'Build your egg’s signal for breakout. Identity reveals at Stage 3.'],
    vitals: ['♥', 'Check health, energy, hunger, fun and cleanliness.'],
    care: ['♥', 'Feed, play, rest, train and collect Daily Cache.'],
    details: ['◉', 'Companion stats, personality and equipped items.'],
    'pet-spaces': ['◈', 'Choose your active pet or unlock another permanent space.'],
    'season-slots': ['◈', 'Track lifetime progression and calendar competition progress.'],
    contracts: ['↻', 'Saved quests with builds, bosses and repeatable play.'],
    'daily-journey': ['☀', 'Complete daily goals to earn a Growth Mark.'],
    'daily-objectives': ['☀', 'Track care and official Daily Run objectives.'],
    'weekly-journey': ['▦', 'Complete the listed weekly objectives to earn a Crest.'],
    'daily-completion': ['★', 'Check and collect your daily 7/7 bonus.'],
    missions: ['☷', 'Today’s missions, progress and qualifying routes.'],
    achievements: ['★', 'View milestones and unlocked achievements.'],
    districts: ['⌖', 'Choose district routes and clear mastery bosses.'],
    'moon-run': ['☾', 'Start or resume a run; survive, extract or face the boss.'],
    adventure: ['⌖', 'Choose an adventure and compare risks and rewards.'],
    'street-event': ['⚡', 'Make a street choice with visible costs and outcomes.'],
    'weekly-boss': ['⚔', 'Fight the weekly boss or recover saved rewards.'],
    'story-chains': ['☷', 'Continue your stories and choose what happens next.'],
    'seasonal-boss': ['⚔', 'Plan a raid attack and collect earned boss rewards.'],
    arena: ['⚔', 'Join matchmaking or return to your Arena battle.'],
    kaiju: ['◆', 'Choose cards, join a match or manage your queue.'],
    'timed-activity': ['◷', 'Start background work; review, continue or claim it.'],
    jobs: ['⚒', 'Compare job requirements, cooldowns and base rewards.'],
    equipment: ['⚒', 'Inspect mastery and choose equipment upgrades.'],
    'equipment-sets': ['◈', 'Compare gear combinations and their set bonuses.'],
    materials: ['◇', 'See your materials and where to find more.'],
    crafting: ['⚒', 'Track a recipe and choose when to spend materials.'],
    relics: ['◆', 'Inspect your collected relics and progression uses.'],
    bounties: ['◎', 'Track four daily targets and claim completed rewards.'],
    expedition: ['⌖', 'Compare destinations, entry costs and possible finds.'],
    market: ['◇', 'Review today’s bundles before spending game currency.'],
    shop: ['◇', 'Browse permanent gear and check purchase costs.'],
    'style-lab': ['✧', 'Unlock and equip visible cosmetic styles. Switching is free.'],
    inventory: ['▣', 'Inspect your bag and choose items to use.'],
    trade: ['⇄', 'Review Moon Gold stakes and the risk of a loss.'],
    'how-to-play': ['?', 'A guide to care, quests, runs, bosses and rewards.'],
    memories: ['☷', 'Revisit your companion’s history and milestones.'],
    callsign: ['✎', 'Check naming eligibility and change your callsign.'],
    'season-finale': ['⚑', 'Unlock the final boss, choose a build and claim victory.'],
    'finale-link': ['⚑', 'Open the season finale and its saved rewards.'],
    evolution: ['✦', 'Check requirements and evolve when you are ready.'],
    'rare-morph': ['✧', 'Inspect your hidden signal and morph eligibility.'],
    faction: ['⚑', 'View your faction and its gameplay perk.'],
    tracks: ['▥', 'Follow specialist XP and progression.'],
    features: ['▦', 'Check which playable features are open or locked.'],
    alerts: ['◌', 'Choose which game notifications you receive.'],
    season: ['★', 'Track season XP and collect unlocked tier rewards.'],
    leaderboard: ['♜', 'See current season rankings and the full leaderboard.'],
  };

  function panel(name, body, panelId, description) {
    var key = [state && state.pet && state.pet.pet_id || 'account', activeScreen, panelId || name.split(' //')[0]].join(':');
    var copy = panelDescriptions[panelId] || (/IDENTITY/.test(name) ? ['◉', 'Your companion’s identity and personality.']
      : /APTITUDES/.test(name) ? ['▥', 'Compare your companion’s natural strengths.']
      : /DORMANT/.test(name) ? ['◉', 'Initialise your first Secret Bot.'] : ['◈', 'Open to view details and available options.']);
    if (panelId === 'care' && state && state.lifecycle && state.lifecycle.phase === 'egg') copy = ['♥', 'Energy Drink, Dance and Cuddles; stat-only care.'];
    var expanded = Object.prototype.hasOwnProperty.call(panelOpenState, key) ? panelOpenState[key] : panelId === 'telegram-auth' || panelId === 'pet-spaces' || panelId === 'recommended' && activeScreen === 'home' || /DORMANT/.test(name);
    return '<details class="panel" data-panel-key="' + escapeHtml(key) + '"' + (panelId ? ' data-panel="' + escapeHtml(panelId) + '"' : '') + (expanded ? ' open' : '') + '><summary class="panel-summary"><span class="panel-icon" aria-hidden="true">' + copy[0] + '</span><span class="panel-caption"><span class="panel-title">' + escapeHtml(name) + '</span><span class="panel-description">' + escapeHtml(description || copy[1]) + '</span></span><span class="panel-chevron" aria-hidden="true">⌄</span></summary><div class="panel-body">' + body + '</div></details>';
  }

  function rememberPanels() {
    screen.querySelectorAll('details[data-panel-key]').forEach(function (entry) { panelOpenState[entry.dataset.panelKey] = entry.open; });
  }

  function meter(label, value, invert) {
    var amount = Math.max(0, Math.min(100, Number(value) || 0));
    if (invert) amount = 100 - amount;
    return '<div class="meter"><span>' + escapeHtml(label) + '</span><span class="meter-track"><span class="meter-fill" style="width:' + amount + '%"></span></span><strong>' + Math.floor(amount) + '</strong></div>';
  }

  function renderCanvasTools() {
    canvasTools.hidden = !state;
    var audioButton = canvasTools.querySelector('[data-utility="audio"]');
    var radioButton = canvasTools.querySelector('[data-utility="radio"]');
    audioButton.setAttribute('aria-pressed', String(audioEnabled));
    audioButton.setAttribute('aria-label', audioEnabled ? 'Mute game audio' : 'Enable game audio');
    audioButton.title = audioButton.getAttribute('aria-label');
    radioButton.setAttribute('aria-pressed', String(radioRequestedOn));
    radioButton.setAttribute('aria-busy', String(radioRequestedOn && !radioEnabled));
    radioButton.setAttribute('aria-label', radioRequestedOn ? 'Stop GraffPUNKS Radio' : 'Play GraffPUNKS Radio');
    radioButton.title = radioButton.getAttribute('aria-label');
  }

  function closeUtility() {
    activeUtility = '';
    utilityRequestGeneration += 1;
    utilityLayer.hidden = true;
    utilityContent.innerHTML = '';
    var returnTarget = utilityReturnFocus && utilityReturnFocus.isConnected
      ? utilityReturnFocus
      : nav.querySelector('[aria-current="page"]') || canvas;
    utilityReturnFocus = null;
    if (returnTarget && typeof returnTarget.focus === 'function') returnTarget.focus({ preventScroll: true });
  }

  function openExternalGuide() {
    var url = 'https://cryptomoonboys.com/how-to-play-crypto-moonboy-pets.html';
    try {
      if (tg && typeof tg.openLink === 'function') tg.openLink(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) { window.location.href = url; }
  }

  // TEST-EXPORT: guideMarkup:start
  function guideMarkup() {
    var combatGuideCopy = hasCombatUnlocked()
      ? 'Arena and Kaiju are part of the current build. Arena still needs a level 10 active Moonpet.'
      : 'Arena and Kaiju are current-build systems. Kaiju requires a hatched active Moonpet, and Arena requires a hatched active Moonpet plus level 10.';
    return '<div class="guide-step"><strong>1 // WAKE THE SECRET BOT</strong>Initialise EGGYONE, then use at least three kinds of care. Its assigned identity remains UNKNOWN through Stages 0, 1 and 2.</div>' +
      '<div class="guide-step"><strong>2 // PLAY THE CURRENT BUILD</strong>HOME handles care and Play Now. MISSIONS holds contracts, Daily Journey, Weekly Journey and the Season Finale. EXPLORE contains runs, districts and combat. WORK handles jobs and timers; ECONOMY holds gear and crafting; PROFILE holds identity, season rewards, ranks and this guide.</div>' +
      '<div class="guide-step"><strong>3 // KEEP NEEDS STABLE</strong>Feed, play, clean and rest. Check energy, hunger and cooldowns before training or starting a demanding route. A timed activity can lock some actions until you claim or cancel it. Care and daily routines build Pet XP, specialist XP, personality, aptitudes and equipment mastery. Use Play Now to find an available route while care cools down.</div>' +
      '<div class="guide-step"><strong>4 // FOLLOW THE ROUTE</strong>HOME recommends the next move. In MISSIONS, complete the official daily objectives to earn a Growth Mark at the displayed target. Finish every Weekly Journey objective to earn a Weekly Crest. Keep claiming completed missions, achievements and the Daily Cache; the all-missions daily bonus is a separate claim. Daily resets use UTC. Each panel shows its own reset and requirements.</div>' +
      '<div class="guide-step"><strong>5 // BUILD YOUR LOADOUT</strong>ECONOMY contains equipment, materials, bounties, market offers, inventory and upgrades. Equip an item to use its bonus; eligible actions build mastery. Set a crafting goal, follow its material routes and craft or use the result. Check storage space before buying a bundle. Districts show an objective, opponent and route before you commit. ' + combatGuideCopy + ' Moon Run reaches 100 rooms—extract to bank unbanked rewards.</div>' +
      '<div class="guide-step"><strong>6 // IDENTITY AND PROGRESSION</strong>The canonical identity name is revealed when server-authoritative Stage 3 begins. PROFILE tracks evolution and season rewards. Growth Marks, Weekly Crests and the displayed pet-age requirements advance your lifetime Journey. Pet level and evolution are separate; use the live requirements shown for your selected pet.</div>' +
      '<div class="guide-step"><strong>CANVAS CONTROLS</strong>The cyan speaker toggles game audio, the purple radio plays or stops GraffPUNKS Radio, and the amber arrows refresh your live save. They sit at the top right of the canvas. Radio starts from your tap; tap it again to stop, or retry after a connection error. Reduced-motion mode keeps the buttons steady.</div>' +
      '<div class="guide-step"><strong>CURRENCIES</strong>Pet XP raises level. Moon Gold buys common upgrades. Gems unlock premium routes. Style unlocks cosmetics. Energy powers demanding actions.</div>' +
      '<div class="guide-step"><strong>CONTINUING CONTRACTS</strong>After hatching, open MISSIONS or Play Now. Pick a quest, build, difficulty and route length. Standard routes have six rooms and two upgrade drafts; long routes have ten rooms and four drafts. Later rooms get harder, and long routes have higher targets. Complete the whole route to earn rank. New quests continue without cooldowns or pet energy costs. The first three successful contracts per account each UTC day qualify for up to 20 Pet XP each, within your normal XP cap, for either length. Every choice is saved online. Contract rank is separate from pet level, Daily Journey and leaderboards.</div>' +
      '<div class="guide-step"><strong>DAILY RUN TACTICS</strong>New official attempts show clear chance and score for each approach. Safe routes trade score for better odds; bold routes offer more score at higher risk. After rooms 3 and 6, choose Guardian, Striker or Scavenger, or continue without an upgrade. Tactics change later odds and run score only. One official attempt per account each UTC day still applies. Reach the final room and defeat its boss to finish. Extracting ends that day’s attempt early. If a saved ending needs settlement, use FINISH SAVED DAILY RUN to recover it without spending a new attempt.</div>' +
      '<div class="guide-step"><strong>BOSSES AND SEASON FINALE</strong>EXPLORE holds the weekly boss and seasonal raid; read the current requirements, choose an approach and claim any saved victory reward. In MISSIONS, the Season Finale unlocks when your pet meets the final evolution, Growth Mark and Weekly Crest requirements shown. Pick a build, read the boss intent, then Strike, Guard or use your special options. The battle saves between turns, uses separate battle health and supplies, and allows free retries after defeat. Win and claim its reward once per pet per competition quarter. Earlier saved fights and rewards remain recoverable; lifetime progress and repeatable contracts continue.</div>' +
      '<div class="guide-step"><strong>SAVES, PETS AND RANKS</strong>Each pet keeps its own progression and loadout. Switching pets does not reset account-wide cooldowns or official daily attempts. Saved runs and rewards stay with their source pet. Use Refresh after a connection interruption. PROFILE opens daily, weekly, seasonal, all-time and run-depth leaderboards; contract rank is separate from Pet XP ranks.</div>' +
      '<div class="button-grid one"><button type="button" class="terminal-button" data-open-full-guide>OPEN COMPLETE WEBSITE GUIDE<span class="button-purpose">Open the website guide for more detail on progression and activities.</span></button></div>';
  }
  // TEST-EXPORT: guideMarkup:end

  function leaderboardRowsMarkup(entries, self, period) {
    var rows = (entries || []).map(function (entry) {
      var form = entry.phase === 'rare' ? entry.rare_morph_name : entry.display_name || 'UNKNOWN';
      var metric = period === 'run_depth' ? number(entry.pet_xp) + ' ROOMS' : number(entry.pet_xp) + ' XP';
      return '<div class="leader-row' + (entry.is_current ? ' is-current' : '') + '"><strong>#' + number(entry.rank) + ' ' + escapeHtml(entry.pet_name || 'MOONPET') + (entry.is_current ? ' // YOU' : '') + '</strong><div class="line">' + escapeHtml(words(form || 'moonpet')) + ' // LVL ' + number(entry.level) + ' // ' + metric + '</div></div>';
    }).join('');
    var selfOutside = self && !(entries || []).some(function (entry) { return entry.is_current; })
      ? '<div class="line muted">YOUR POSITION</div>' + leaderboardRowsMarkup([Object.assign({}, self, { is_current: true })], null, period)
      : '';
    return rows + selfOutside || '<div class="line muted">NO RANKED MOONPETS IN THIS PERIOD.</div>';
  }

  async function loadLeaderboard(period) {
    var selected = ['daily', 'weekly', 'seasonal', 'all_time', 'run_depth'].includes(period) ? period : 'seasonal';
    var generation = ++utilityRequestGeneration;
    utilityTitle.textContent = 'MOONPET LEADERBOARD';
    utilityContent.innerHTML = '<div class="line">LOADING ' + escapeHtml(words(selected)) + ' RANKS...</div>';
    try {
      var data = await post('/telegram-pets/app/leaderboard', { period: selected, limit: 25 });
      if (generation !== utilityRequestGeneration || utilityLayer.hidden || activeUtility !== 'leaderboard') return;
      var tabs = ['daily', 'weekly', 'seasonal', 'all_time', 'run_depth'].map(function (key) {
        return '<button type="button" class="period-button" data-leaderboard-period="' + key + '" aria-pressed="' + (key === selected ? 'true' : 'false') + '">' + escapeHtml(words(key)) + '</button>';
      }).join('');
      utilityContent.innerHTML = '<div class="line muted">Choose a period to compare Pet XP, or Run Depth to compare the deepest rooms. Viewing ranks spends nothing.</div><div class="period-tabs">' + tabs + '</div><div class="line muted">' + (selected === 'run_depth' ? 'DEEPEST ROOM RANKS' : 'PET XP RANKS') + ' // ' + escapeHtml(words(data.period || selected)) + '</div>' + leaderboardRowsMarkup(data.entries, data.self, selected);
    } catch (error) {
      if (generation !== utilityRequestGeneration || utilityLayer.hidden || activeUtility !== 'leaderboard') return;
      utilityContent.innerHTML = '<div class="connection-fault">RANKING LINK FAILED // ' + escapeHtml(error.message || 'CONNECTION FAILED') + '</div><div class="button-grid one"><button type="button" class="terminal-button" data-leaderboard-period="' + selected + '">RETRY LEADERBOARD<span class="button-purpose">Read competition ranks again without changing your saved pet.</span></button></div>';
    }
  }

  function openUtility(kind) {
    if (utilityLayer.hidden && document.activeElement instanceof HTMLElement) utilityReturnFocus = document.activeElement;
    activeUtility = kind;
    utilityRequestGeneration += 1;
    utilityLayer.hidden = false;
    if (kind === 'guide') {
      utilityTitle.textContent = 'HOW TO PLAY MOONPET OS';
      utilityContent.innerHTML = guideMarkup();
    } else {
      loadLeaderboard('seasonal');
    }
    var close = utilityLayer.querySelector('[data-utility-close]');
    if (close) close.focus({ preventScroll: true });
  }

  async function syncState() {
    if (busy) return;
    if (authenticationFailure) {
      tell('TELEGRAM SESSION EXPIRED. OPEN A FRESH SESSION FROM @WIKICOMSBOT.', 'danger');
      return;
    }
    busy = true;
    tell('REFRESHING LIVE SAVE...');
    try {
      // Retry the required asset without replaying a saved gameplay action.
      var dependencyError = null;
      if (!playOptionsReady()) {
        try { await reloadPlayOptions(); } catch (error) { dependencyError = error; }
      }
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state', stateRefreshPayload(state, activeScreen));
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      fastActionStateDirty = false;
      render();
      tell(dependencyError ? 'LIVE SAVE REFRESHED. RUN CONTROLS UNAVAILABLE. TAP REFRESH TO RETRY.' : 'LIVE SAVE REFRESHED.', dependencyError ? 'danger' : '');
      haptic('success');
    } catch (error) {
      tell(error.message || 'REFRESH FAILED', 'danger');
      haptic('error');
    } finally { busy = false; }
  }

  function applyRequestedFocus() {
    if (!requestedFocus || requestedFocusScreen !== activeScreen) return;
    if (stateNeedsScreenHydration(state, activeScreen)) return;
    var focus = requestedFocus;
    requestedFocus = '';
    if (focus === 'leaderboard') openUtility('leaderboard');
    else scrollToPanel(focus);
  }

  function renderHud() {
    if (!state || !state.pet) { hud.innerHTML = ''; return; }
    var pet = state.pet;
    hud.innerHTML = [
      ['LVL', pet.level], ['GOLD', number(pet.moon_gold)], ['GEMS', number(pet.moon_crystals)],
    ].map(function (item) { return '<div class="hud-chip"><strong>' + item[0] + '</strong> ' + escapeHtml(item[1]) + '</div>'; }).join('');
  }

  // TEST-EXPORT: nextGuidance:start
  function activeSeasonSlot() {
    var slots = state && state.season_slots && Array.isArray(state.season_slots.slots) ? state.season_slots.slots : [];
    return slots.find(function (slot) { return slot.active; }) || {};
  }

  function activePetProgression() {
    var slot = activeSeasonSlot();
    return slot.pet && slot.pet.progression || {};
  }

  function firstSessionPhase() {
    var lifecycle = state && state.lifecycle || {};
    var phase = String(lifecycle.phase || '').toLowerCase();
    if (!state || !state.adopted || !state.pet) return 'unadopted';
    if (phase === 'egg') return 'egg';
    return '';
  }

  // TEST-EXPORT: capabilityCombatHelper:start
  function combatCapability(source) {
    var fallback = {
      state: 'LOCKED',
      unlocked: false,
      reason: 'capability_unavailable',
      requirements: {
        completed_season_pet: false,
        active_pet_exists: false,
        active_pet_lifecycle_known: false,
        active_pet_hatched: false,
        active_pet_level: 0,
        arena_level_met: false,
      },
    };
    var version = Number(source && (source.capabilities_version || source.capabilities && source.capabilities.capabilities_version) || 0);
    if (version !== 1) return fallback;
    var combat = source && source.capabilities && source.capabilities.combat;
    var requirements = combat && combat.requirements;
    if (!combat || !requirements || typeof requirements !== 'object') return fallback;
    var completeRequirements = [
      'completed_season_pet',
      'active_pet_exists',
      'active_pet_lifecycle_known',
      'active_pet_hatched',
      'arena_level_met',
    ].every(function (key) { return typeof requirements[key] === 'boolean'; });
    if (!completeRequirements || typeof requirements.active_pet_level !== 'number') return fallback;
    var stateLabel = String(combat.state || '').toUpperCase();
    var requirementReady = requirements.active_pet_exists === true
      && requirements.active_pet_lifecycle_known === true
      && requirements.active_pet_hatched === true;
    if (typeof combat.active !== 'boolean') return fallback;
    if (stateLabel !== 'AVAILABLE' || combat.unlocked !== true || combat.active !== true || !requirementReady) {
      return {
        state: 'LOCKED',
        unlocked: false,
        active: false,
        reason: combat.reason || 'capability_unavailable',
        requirements: requirements,
      };
    }
    return {
      state: 'AVAILABLE',
      unlocked: true,
      active: combat.active === true,
      reason: combat.reason || 'combat_unlocked',
      requirements: requirements,
    };
  }

  function hasCombatUnlocked() {
    var combat = combatCapability(state);
    return combat.state === 'AVAILABLE' && combat.unlocked === true;
  }

  function systemCapability(source, key) {
    var version = Number(source && (source.capabilities_version || source.capabilities && source.capabilities.capabilities_version) || 0);
    var systems = source && source.capabilities && source.capabilities.systems;
    var system = systems && systems[key];
    if (version !== 1 || !system || typeof system !== 'object') return { state: 'LOCKED', unlocked: false, active: false, reason: 'capability_unavailable' };
    var stateLabel = String(system.state || '').toUpperCase();
    return {
      state: stateLabel === 'AVAILABLE' ? 'AVAILABLE' : 'LOCKED',
      unlocked: system.unlocked === true,
      active: system.active === true,
      reason: system.reason || 'capability_unavailable',
      message: system.message || '',
    };
  }

  function hasSystemUnlocked(key, source) {
    var system = systemCapability(source || state, key);
    return system.state === 'AVAILABLE' && system.unlocked === true && system.active === true;
  }

  function combatLockCopy(reasonOverride) {
    var reason = reasonOverride || combatCapability(state).reason;
    if (reason === 'moon_egg_must_hatch') {
      return {
        title: 'COMBAT LOCKED UNTIL YOUR ACTIVE MOONPET HATCHES.',
        detail: 'Requires a hatched active Moonpet.',
        entryDetail: 'REQUIRES HATCHED ACTIVE MOONPET',
      };
    }
    if (reason === 'pet_not_adopted') {
      return {
        title: 'COMBAT LOCKED UNTIL YOU ADOPT A MOONPET.',
        detail: 'Requires an adopted active Moonpet.',
        entryDetail: 'REQUIRES ACTIVE MOONPET',
      };
    }
    if (reason === 'moonpet_lifecycle_required') {
      return {
        title: 'COMBAT LOCKED UNTIL YOUR MOONPET STATE SYNCS.',
        detail: 'Requires synced lifecycle authority before combat can unlock.',
        entryDetail: 'REQUIRES SYNCED MOONPET',
      };
    }
    if (reason === 'arena_level_locked') {
      return {
        title: 'ARENA LOCKED UNTIL LEVEL 10.',
        detail: 'Kaiju can run after hatch; Pet Arena needs a level 10 active Moonpet.',
        entryDetail: 'REQUIRES LEVEL 10',
      };
    }
    if (reason === 'capability_unavailable') {
      return {
        title: 'COMBAT LOCKED UNTIL CAPABILITY STATE SYNCS.',
        detail: 'Requires worker capability authority before combat can unlock.',
        entryDetail: 'REQUIRES CAPABILITY SYNC',
      };
    }
    return {
      title: 'COMBAT LOCKED.',
      detail: 'Requires current beta combat authority.',
      entryDetail: 'REQUIRES CURRENT COMBAT AUTHORITY',
    };
  }

  function combatLockedButtonOptions(entryDetail) {
    entryDetail = String(entryDetail || '');
    return {
      disabled: true,
      eggRequired: entryDetail.indexOf('HATCHED') >= 0,
      activePetRequired: entryDetail.indexOf('ACTIVE') >= 0,
      authoritySyncing: entryDetail.indexOf('SYNC') >= 0,
      detail: entryDetail,
    };
  }
  // TEST-EXPORT: capabilityCombatHelper:end

  // TEST-EXPORT: dailyJourneyMarkup:start
  function dailyJourneyNextAction(dailyAuthority, completedMissions, guidance, stateValue) {
    dailyAuthority = dailyAuthority || {};
    guidance = guidance || {};
    var lifecyclePhase = String(stateValue && stateValue.lifecycle && stateValue.lifecycle.phase || '').toLowerCase();
    if (lifecyclePhase === 'egg') return 'Incubate or HATCH MOONPET before Daily Journey progress starts.';
    var dailyCompleted = dailyAuthority.completed_objectives != null ? Number(dailyAuthority.completed_objectives) : completedMissions;
    var dailyRequired = Math.max(0, Number(dailyAuthority.required_objectives) || 0);
    var reason = String(dailyAuthority.reason || '').toLowerCase();
    if (reason === 'active_pet_required') return 'Journey progress starts after you have a hatched active Moonpet.';
    if (dailyRequired <= 0) return 'Daily Journey authority is syncing. Progress display will refresh when server authority is available.';
    if (dailyAuthority.growth_mark_awarded) return 'Growth Mark already settled for today.';
    if (dailyAuthority.duplicate_blocked) return 'Growth Mark duplicate blocked for today.';
    if (dailyCompleted >= dailyRequired) return 'Daily Journey complete - Growth Mark eligibility is ready for server settlement.';
    var remaining = Math.max(0, dailyRequired - dailyCompleted);
    return 'Daily Journey: ' + number(dailyCompleted) + '/' + number(dailyRequired) + ' complete - finish ' + number(remaining) + ' more daily objective' + (remaining === 1 ? '' : 's') + ' for Growth Mark eligibility.';
  }

  function dailyJourneyMarkup(dailyAuthority, completedMissions, guidance, growth, stateValue) {
    dailyAuthority = dailyAuthority || {};
    guidance = guidance || {};
    growth = growth || {};
    var lifecyclePhase = String(stateValue && stateValue.lifecycle && stateValue.lifecycle.phase || '').toLowerCase();
    var eggJourneyLocked = lifecyclePhase === 'egg';
    var dailyCompleted = dailyAuthority.completed_objectives != null ? Number(dailyAuthority.completed_objectives) : completedMissions;
    var dailyRequired = Math.max(0, Number(dailyAuthority.required_objectives) || 0);
    var dailyAuthorityReady = Number.isFinite(dailyRequired) && dailyRequired > 0;
    var dailyReason = String(dailyAuthority.reason || '').toLowerCase();
    var recoveryNotice = dailyAuthority.recovery && dailyAuthority.recovery.status === 'audit_required'
      ? '<div class="line muted">CARE HISTORY // Some saved care receipts have no verified pet. Their history is preserved for review; they do not add Journey progress.</div>' : '';
    if (eggJourneyLocked) {
      return '<div class="line locked">DAILY JOURNEY // HATCH REQUIRED</div>' +
        '<div class="line muted">Journey progress starts after HATCH MOONPET creates an active companion.</div>' +
        '<div class="line muted">NEXT // Incubate or HATCH MOONPET before Daily Journey progress starts.</div>' + recoveryNotice;
    }
    if (dailyReason === 'active_pet_required') {
      return '<div class="line locked">DAILY JOURNEY // ACTIVE PET REQUIRED</div>' +
        '<div class="line muted">Journey progress starts after you have a hatched active Moonpet.</div>' +
        '<div class="line muted">NEXT // Initialise, incubate, or hatch your Moonpet before Daily Journey progress starts.</div>' + recoveryNotice;
    }
    var dailyPercent = dailyRequired > 0 ? Math.round(Math.min(dailyRequired, dailyCompleted) / dailyRequired * 100) : 0;
    var dailyReset = dailyAuthority.cooldown ? ' // RESET ' + countdownMarkup(dailyAuthority.cooldown, 'in ') : '';
    var dailyStatus = dailyAuthority.growth_mark_awarded ? 'GROWTH MARK ALREADY SETTLED'
      : dailyAuthority.duplicate_blocked ? 'DUPLICATE GROWTH MARK BLOCKED'
        : dailyRequired > 0 && dailyCompleted >= dailyRequired ? 'GROWTH MARK ELIGIBLE' : 'COMPLETE DAILY OBJECTIVES TO QUALIFY';
    return dailyAuthorityReady
      ? '<div class="line complete">DAILY JOURNEY // ' + number(dailyCompleted) + '/' + number(dailyRequired) + ' OBJECTIVES</div>' +
        '<div class="line muted">TODAY ' + escapeHtml(dailyAuthority.utc_day || guidance.day_key || 'UTC') + dailyReset + ' // Growth Mark eligibility comes from completed daily objectives and server-side receipts.</div>' +
        meter('GROWTH MARK', dailyPercent) +
        '<div class="line muted">' + dailyStatus + ' // ' + escapeHtml(words(dailyAuthority.reason || 'daily journey in progress')) + '</div>' +
        '<div class="line muted">NEXT // ' + escapeHtml(dailyJourneyNextAction(dailyAuthority, completedMissions, guidance, stateValue)) + '</div>' +
        '<div class="line muted">Growth Marks // ' + number(growth.earned) + '/' + number(growth.required) + ' earned by this pet over its lifetime. Duplicate Growth Marks for the same UTC day are blocked by authority.</div>' + recoveryNotice
      : '<div class="line locked">DAILY JOURNEY // SYNCING</div><div class="line muted">' + escapeHtml(dailyJourneyNextAction(dailyAuthority, completedMissions, guidance, stateValue)) + '</div>' + recoveryNotice;
  }
  // TEST-EXPORT: dailyJourneyMarkup:end

  // TEST-EXPORT: weeklyJourneyMarkup:start
  function weeklyObjectiveLabel(objective) {
    return objective.name || objective.title || ({
      weekly_care: 'Weekly care actions',
      weekly_training: 'Weekly training sessions',
      weekly_run: 'Moon Run finishes',
      weekly_boss_attempt: 'Weekly boss attempt',
      weekly_check_in: 'Daily chest check-ins',
    })[String(objective.objective_id || '')] || words(objective.objective_id || 'weekly objective');
  }

  function weeklyRemainingLabels(objectives) {
    return (objectives || []).filter(function (objective) {
      var progress = Math.max(0, Number(objective.progress) || 0);
      var target = Math.max(1, Number(objective.target) || 1);
      return !(objective.completed || progress >= target);
    }).map(weeklyObjectiveLabel);
  }

  function weeklyJourneyNextAction(weeklyAuthority, weeklyCapability, stateValue) {
    weeklyAuthority = weeklyAuthority || {};
    weeklyCapability = weeklyCapability || {};
    var lifecyclePhase = String(stateValue && stateValue.lifecycle && stateValue.lifecycle.phase || '').toLowerCase();
    if (lifecyclePhase === 'egg') return 'Incubate or HATCH MOONPET before Weekly Journey progress starts.';
    var weeklyState = String(weeklyAuthority.state || weeklyCapability.state || 'LOCKED').toUpperCase();
    var weeklyReason = String(weeklyAuthority.reason || weeklyCapability.reason || '').toLowerCase();
    var weeklyRequired = Math.max(0, Number(weeklyAuthority.required_objectives != null ? weeklyAuthority.required_objectives : weeklyCapability.required_objectives) || 0);
    var weeklyCompleted = Math.max(0, Number(weeklyAuthority.completed_objectives != null ? weeklyAuthority.completed_objectives : weeklyCapability.completed_objectives) || 0);
    var objectives = Array.isArray(weeklyAuthority.objectives) ? weeklyAuthority.objectives
      : Array.isArray(weeklyCapability.objectives) ? weeklyCapability.objectives : [];
    if (weeklyReason === 'active_pet_required') return 'Initialise, incubate, hatch, or select an active Moonpet before Weekly Journey progress starts.';
    if (weeklyState !== 'AVAILABLE' || weeklyRequired <= 0) return 'Weekly Journey authority is syncing. Progress display will refresh when server authority is available.';
    var weeklyCrestAwarded = weeklyAuthority.weekly_crest_awarded != null
      ? Boolean(weeklyAuthority.weekly_crest_awarded)
      : Boolean(weeklyCapability.weekly_crest_awarded);
    var weeklyDuplicateBlocked = weeklyAuthority.duplicate_blocked != null
      ? Boolean(weeklyAuthority.duplicate_blocked)
      : Boolean(weeklyCapability.duplicate_blocked);
    if (weeklyCrestAwarded) return 'Weekly Crest already settled - keep daily routines moving until next reset.';
    if (weeklyDuplicateBlocked) return 'Weekly Crest duplicate blocked for this week.';
    if (weeklyCompleted >= weeklyRequired) return 'Weekly Journey complete - Weekly Crest is ready for server settlement.';
    var remaining = weeklyRemainingLabels(objectives);
    return 'Weekly Journey: ' + number(weeklyCompleted) + '/' + number(weeklyRequired) + ' complete - remaining: ' + (remaining.length ? remaining.join(', ') : 'server-confirmed objectives') + '.';
  }

  function weeklyJourneyMarkup(weeklyAuthority, weeklyCapability, stateValue) {
    weeklyAuthority = weeklyAuthority || {};
    weeklyCapability = weeklyCapability || {};
    var lifecyclePhase = String(stateValue && stateValue.lifecycle && stateValue.lifecycle.phase || '').toLowerCase();
    var eggJourneyLocked = lifecyclePhase === 'egg';
    var weeklyState = String(weeklyAuthority.state || weeklyCapability.state || 'LOCKED').toUpperCase();
    var weeklyReason = String(weeklyAuthority.reason || weeklyCapability.reason || '').toLowerCase();
    var weeklyRequired = Math.max(0, Number(
      weeklyAuthority.required_objectives != null
        ? weeklyAuthority.required_objectives
        : weeklyCapability.required_objectives
    ) || 0);
    var weeklyCompleted = Math.max(0, Number(
      weeklyAuthority.completed_objectives != null
        ? weeklyAuthority.completed_objectives
        : weeklyCapability.completed_objectives
    ) || 0);
    var weeklyReady = weeklyState === 'AVAILABLE' && weeklyRequired > 0;
    if (eggJourneyLocked) {
      return '<div class="line locked">WEEKLY JOURNEY // HATCH REQUIRED</div>' +
        '<div class="line muted">Weekly Journey progress starts after HATCH MOONPET creates an active companion.</div>' +
        '<div class="line muted">NEXT // Incubate or HATCH MOONPET before Weekly Journey progress starts.</div>' +
        '<div class="line muted">No Daily or Weekly objective progress is shown until you have an active hatched Moonpet.</div>';
    }
    if (!weeklyReady) {
      var waitingTitle = weeklyReason === 'active_pet_required' ? 'WEEKLY JOURNEY // ACTIVE PET REQUIRED' : 'WEEKLY JOURNEY // SYNCING';
      var waitingCopy = weeklyReason === 'active_pet_required'
          ? 'Journey progress starts after you have a hatched active Moonpet.'
          : (weeklyCapability.message || weeklyAuthority.reason || 'Weekly Journey authority is syncing. Progress display will refresh when server authority is available.');
      var waitingDetail = weeklyReason === 'active_pet_required'
          ? 'No Daily or Weekly objective progress is shown until you have an active hatched Moonpet.'
          : 'Complete objectives to qualify for server settlement once authority returns objective evidence.';
      return '<div class="line locked">' + waitingTitle + '</div>' +
        '<div class="line muted">' + escapeHtml(waitingCopy) + '</div>' +
        '<div class="line muted">NEXT // ' + escapeHtml(weeklyJourneyNextAction(weeklyAuthority, weeklyCapability, stateValue)) + '</div>' +
        '<div class="line muted">' + waitingDetail + '</div>';
    }
    var objectives = Array.isArray(weeklyAuthority.objectives) ? weeklyAuthority.objectives
      : Array.isArray(weeklyCapability.objectives) ? weeklyCapability.objectives : [];
    var weeklyPercent = Math.round(Math.min(weeklyRequired, weeklyCompleted) / weeklyRequired * 100);
    var resetAt = weeklyAuthority.week_reset_at || weeklyCapability.week_reset_at || '';
    var resetCopy = (weeklyAuthority.cooldown || weeklyCapability.cooldown)
      ? ' // RESET ' + countdownMarkup(weeklyAuthority.cooldown || weeklyCapability.cooldown, 'in ')
      : resetAt ? ' // RESET ' + escapeHtml(resetAt) : '';
    var weeklyCrestAwarded = weeklyAuthority.weekly_crest_awarded != null
      ? Boolean(weeklyAuthority.weekly_crest_awarded)
      : Boolean(weeklyCapability.weekly_crest_awarded);
    var weeklyDuplicateBlocked = weeklyAuthority.duplicate_blocked != null
      ? Boolean(weeklyAuthority.duplicate_blocked)
      : Boolean(weeklyCapability.duplicate_blocked);
    var crestStatus = weeklyCrestAwarded ? 'WEEKLY CREST ALREADY SETTLED'
      : weeklyDuplicateBlocked ? 'DUPLICATE WEEKLY CREST BLOCKED'
        : weeklyCompleted >= weeklyRequired ? 'WEEKLY CREST READY FOR SERVER SETTLEMENT' : 'COMPLETE WEEKLY OBJECTIVES TO QUALIFY';
    var objectiveRows = objectives.map(function (objective) {
      var progress = Math.max(0, Number(objective.progress) || 0);
      var target = Math.max(1, Number(objective.target) || 1);
      var complete = objective.completed || progress >= target;
      var label = weeklyObjectiveLabel(objective);
      return '<div class="line ' + (complete ? 'complete' : '') + '">' + (complete ? '[OK] ' : '[  ] ') +
        escapeHtml(label) + ' // ' + number(Math.min(progress, target)) + '/' + number(target) + ' // ' + (complete ? 'COMPLETE' : 'INCOMPLETE') + '</div>' + (complete ? '' : objectiveRouteButton(objective.objective_id));
    }).join('') || '<div class="line muted">NO WEEKLY OBJECTIVE EVIDENCE YET.</div>';
    var remaining = weeklyRemainingLabels(objectives);
    var remainingCopy = remaining.length ? remaining.join(', ')
      : weeklyCompleted >= weeklyRequired ? 'No remaining weekly objectives.' : 'Waiting for server-confirmed objectives.';
    return '<div class="line complete">WEEKLY JOURNEY // ' + number(weeklyCompleted) + '/' + number(weeklyRequired) + ' OBJECTIVES</div>' +
      '<div class="line muted">QUALIFICATION WEEK ' + number(weeklyAuthority.qualification_week || weeklyCapability.qualification_week || 1) + resetCopy + ' // Server-authoritative source events only.</div>' +
      meter('WEEKLY CREST', weeklyPercent) +
      '<div class="line muted">' + crestStatus + ' // ' + escapeHtml(words(weeklyAuthority.reason || weeklyCapability.reason || 'weekly journey in progress')) + '</div>' +
      '<div class="line muted">NEXT // ' + escapeHtml(weeklyJourneyNextAction(weeklyAuthority, weeklyCapability, stateValue)) + '</div>' +
      '<div class="line muted">REMAINING // ' + escapeHtml(remainingCopy) + '</div>' +
      objectiveRows;
  }
  // TEST-EXPORT: weeklyJourneyMarkup:end

  function activePetSummary() {
    if (!state || !state.pet) return '';
    var pet = state.pet;
    if (!activePetProgression().lifecycle) {
      var coreSlot = activeSeasonSlot();
      return panel('ACTIVE PET // SLOT ' + number(coreSlot.slot_number || 1),
        '<div class="season-identity"><strong>' + escapeHtml(resolveMoonpetDisplayName(state.lifecycle || {}, state.guidance && state.guidance.identity)) + '</strong><span>LIFETIME PROGRESSION</span></div>' +
        '<div class="season-status-grid"><div><span>STAGE</span><strong>' + escapeHtml(moonpetStageLabel(state.lifecycle || {}, pet)) + '</strong></div><div><span>LEVEL</span><strong>' + number(pet.level) + '</strong></div><div><span>HEALTH</span><strong>' + number(pet.health) + '</strong></div><div><span>ENERGY</span><strong>' + number(pet.energy) + '</strong></div></div>' +
        '<div class="line muted">MISSION, GROWTH MARK AND WEEKLY CREST DETAIL LOADS ONLY WHEN YOU OPEN A GAME MODULE.</div>', 'active-pet');
    }
    var slot = activeSeasonSlot();
    var progression = activePetProgression();
    var lifecycle = progression.lifecycle || {};
    var growth = progression.growth_marks || {};
    var crests = progression.weekly_crests || {};
    var status = progression.season_complete ? 'COMPLETED ADULT PET'
      : lifecycle.evolution_ready ? 'ELIGIBLE TO EVOLVE' : 'KEEP DAILY AND WEEKLY ROUTINES MOVING';
    return panel('ACTIVE PET // SLOT ' + number(slot.slot_number || 1),
      '<div class="season-identity"><strong>' + escapeHtml(resolveMoonpetDisplayName(state.lifecycle, state.guidance && state.guidance.identity)) + '</strong><span>LIFETIME PROGRESSION</span></div>' +
      '<div class="season-status-grid"><div><span>STAGE</span><strong>' + escapeHtml(moonpetStageLabel(lifecycle, pet)) + '</strong></div><div><span>LEVEL</span><strong>' + number(pet.level) + '</strong></div><div><span>GROWTH MARKS</span><strong>' + number(growth.earned) + '/' + number(growth.required) + '</strong></div><div><span>WEEKLY CRESTS</span><strong>' + number(crests.earned) + '/' + number(crests.required) + '</strong></div></div>' +
      '<div class="line complete">' + status + '</div><div class="line muted">NEXT // ' + escapeHtml(profileNextLine()) + '</div><div class="line muted">Pet XP, Growth Marks and Weekly Crests last for the pet’s lifetime. Competition seasons refresh separately. Switching slots changes which pet earns progress.</div>', 'active-pet');
  }

  function profileNextLine() {
    var seasonSlots = state && state.season_slots || {};
    var slot = activeSeasonSlot();
    var progression = activePetProgression();
    var authoritativeLifecycle = state && state.lifecycle || {};
    var progressionLifecycle = progression.lifecycle || {};
    var phase = String(authoritativeLifecycle.phase || progressionLifecycle.phase || '').toLowerCase();
    var evolutionReady = Boolean(authoritativeLifecycle.evolution_ready || progressionLifecycle.evolution_ready);
    if (!state || !state.adopted || !state.pet) return homeNextLine();
    if (phase === 'egg') return authoritativeLifecycle.incubation && authoritativeLifecycle.incubation.ready ? 'REVEAL BOT to wake your first companion.' : incubationTimingDetail(authoritativeLifecycle.incubation) || 'Care for your Secret Bot until the breakout signal is ready.';
    if (seasonSlots.unavailable) return 'Season slot authority is syncing. Active Moonpet guidance will refresh when server authority is available.';
    if (!slot.pet_id) return 'Pick an active Moonpet before journey progress starts.';
    if (evolutionReady) return 'Evolve your active Moonpet when you are ready.';
    if (isNewlyHatchedFirstSessionPet(phase, progression)) return 'Start with first care, then follow the first server-authoritative Journey objective when it appears.';
    return 'Keep the active Moonpet moving through Daily and Weekly Journey objectives.';
  }

  function isNewlyHatchedFirstSessionPet(phase, progression) {
    var pet = state && state.pet || {};
    var lifecyclePhase = String(phase || pet.stage || '').toLowerCase();
    if (lifecyclePhase !== 'young') return false;
    var level = Math.max(0, Number(pet.level) || 0);
    var petXp = Math.max(0, Number(pet.pet_xp) || 0);
    if (level > 1 || petXp > 0) return false;
    progression = progression || {};
    var growth = progression.growth_marks || {};
    var crests = progression.weekly_crests || {};
    var daily = state && state.daily_journey || {};
    var weekly = state && state.weekly_journey || {};
    return Math.max(0, Number(growth.earned) || 0) === 0
      && Math.max(0, Number(crests.earned) || 0) === 0
      && Math.max(0, Number(daily.completed_objectives) || 0) === 0
      && Math.max(0, Number(weekly.completed_objectives) || 0) === 0;
  }

  function incubationTimingDetail(incubation) {
    incubation = incubation || {};
    var timing = [incubation.age_days, incubation.earliest_hatch_days, incubation.guaranteed_hatch_days];
    if (timing.some(function (value) { return value == null || !Number.isFinite(Number(value)) || Number(value) < 0; })) return '';
    return 'Age ' + Number(incubation.age_days) + ' days. Earliest reveal: day ' + Number(incubation.earliest_hatch_days) + ' with a full signal and at least three care types; guaranteed reveal: day ' + Number(incubation.guaranteed_hatch_days) + '.';
  }

  function homeNextLine(next) {
    var lifecycle = state && state.lifecycle || {};
    var incubation = lifecycle.incubation || {};
    if (!state || !state.adopted) return state && state.next && state.next.detail || 'Checking your Arcade XP entry requirement.';
    if (lifecycle.phase === 'egg') {
      return incubation.ready ? 'REVEAL BOT to wake your first companion.' : incubationTimingDetail(incubation) || 'Build care signals until the breakout signal is ready.';
    }
    return next && next.title ? String(next.title) : 'Keep needs stable and follow the recommended route.';
  }

  function exploreNextLine() {
    var firstSession = firstSessionPhase();
    if (firstSession === 'unadopted') return homeNextLine();
    var boss = state && state.guidance && state.guidance.weekly_boss || {};
    if ((boss.pending_rewards || []).length) return 'Recover your saved Weekly Boss reward. No energy or new attack needed.';
    if (firstSession === 'egg') return 'Care for or REVEAL BOT before Explore actions open.';
    if (state && state.run) return 'Resolve the visible Moon Run room or extract to bank rewards.';
    var weekly = state && state.weekly_journey || {};
    var objectives = Array.isArray(weekly.objectives) ? weekly.objectives : [];
    var bossObjective = objectives.find(function (objective) { return String(objective.objective_id || '') === 'weekly_boss_attempt'; });
    if (bossObjective && !bossObjective.completed && Number(bossObjective.progress || 0) < Number(bossObjective.target || 1)) {
      if (boss.participation_available) return 'Complete this pet’s Weekly Boss participation challenge for its Weekly Journey.';
      return boss.available ? 'Complete Weekly boss attempt to progress Weekly Journey.' : 'Build level and energy before the Weekly boss attempt.';
    }
    var energy = Number(state && state.pet && state.pet.energy);
    if (Number.isFinite(energy) && energy < 12) return 'Restore energy before starting a Moon Run.';
    return 'Start a Moon Run or pick an available Explore action.';
  }

  function savedWeeklyBossButtons(boss) {
    return (boss.pending_rewards || []).map(function (claim) {
      return button('RECOVER WEEKLY REWARD // ' + claim.title, 'weekly_boss_claim', { pet_id: claim.pet_id, boss_id: claim.boss_id, week_key: claim.week_key }, {
        detail: claim.week_key + ' // ' + valueText(claim.reward) + ' // No energy or new attempt. Keeps the original pet’s victory.' });
    }).join('');
  }

  function savedRaidButtons(seasonal) {
    return (seasonal.pending_rewards || []).map(function (claim) {
      return button('CLAIM SAVED RAID REWARD // ' + claim.title, 'seasonal_boss_claim', { pet_id: claim.pet_id, boss_key: claim.boss_key, season_instance: claim.season_instance }, { detail: 'Recover this defeated boss reward. No energy or new attempt; older rotations remain claimable.' });
    }).join('');
  }

  function firstSessionExploreMarkup() {
    var phase = firstSessionPhase();
    if (!phase) return '';
    var nextLine = exploreNextLine();
    var weeklyClaims = savedWeeklyBossButtons(state && state.guidance && state.guidance.weekly_boss || {});
    var raidClaims = savedRaidButtons(state && state.live_systems && state.live_systems.seasonal_boss || {});
    var arena = state && state.arena;
    var arenaQueue = state && state.arena_queue;
    var kaiju = state && state.kaiju || {};
    var kaijuMatch = kaiju.match;
    var kaijuQueue = kaiju.queue;
    var arenaCleanup = arena
      ? button('FORFEIT MATCH', 'arena_forfeit', { battle_id: arena.battle_id }, { danger: true })
      : arenaQueue ? button('CANCEL QUEUE', 'arena_queue_cancel', {}, { danger: true }) : '';
    var kaijuSoloCleanup = kaijuMatch && kaijuMatch.mode !== 'group' && !kaijuMatch.player2_telegram_id;
    var kaijuCleanup = kaijuSoloCleanup
      ? button('CANCEL MATCH', 'kaiju_match_cancel', { match_id: kaijuMatch.match_id }, { danger: true })
      : kaijuQueue ? button('CANCEL QUEUE', 'kaiju_queue_cancel', {}, { danger: true }) : '';
    var copy = phase === 'unadopted'
      ? {
        district: 'Initialise a Secret Bot before district routes, bosses, Arena, Kaiju, or pet work open.',
        run: 'Moon Run opens after you have a hatched active Moonpet.',
        journey: 'Journey progress starts after you have a hatched active Moonpet.',
      }
      : {
        district: 'Your Secret Bot is still forming. Care for it before district routes, bosses, Arena, Kaiju, or pet work open.',
        run: 'Moon Run opens after REVEAL BOT creates an active companion.',
        journey: 'Journey progress starts after the reveal, when server authority can bind objectives to the active pet.',
      };
    var arenaBody = '<div class="line locked">ACTIVE HATCHED MOONPET REQUIRED.</div><div class="line muted">' + escapeHtml(copy.district) + '</div>' +
      (arenaCleanup ? '<div class="line muted">STALE ARENA STATE DETECTED. CLEANUP IS AVAILABLE.</div><div class="button-grid one">' + arenaCleanup + '</div>' : '');
    var kaijuBody = '<div class="line locked">ACTIVE HATCHED MOONPET REQUIRED.</div><div class="line muted">' + escapeHtml(copy.district) + '</div>' +
      (kaijuCleanup ? '<div class="line muted">STALE KAIJU STATE DETECTED. CLEANUP IS AVAILABLE.</div><div class="button-grid one">' + kaijuCleanup + '</div>' : '') +
      (kaijuMatch && !kaijuSoloCleanup ? '<div class="line muted">MULTIPLAYER MATCH CLEANUP USES NORMAL EXPIRY / FORFEIT RESOLUTION.</div>' : '');
    return panel('DISTRICT NETWORK', '<div class="line muted">NEXT // ' + escapeHtml(nextLine) + '</div><div class="line muted">' + escapeHtml(copy.district) + '</div>', 'districts') +
      panel('MOON RUN', '<div class="line muted">NEXT // ' + escapeHtml(nextLine) + '</div><div class="line muted">' + escapeHtml(copy.run) + '</div>', 'moon-run') +
      panel('PET ADVENTURE', '<div class="line muted">' + escapeHtml(copy.journey) + '</div>', 'adventure') +
      panel('STREET EVENT', '<div class="line muted">' + escapeHtml(copy.journey) + '</div>', 'street-event') +
      panel(weeklyClaims ? 'SAVED WEEKLY BOSS REWARDS' : 'WEEKLY BOSS // LOCKED', '<div class="line muted">' + escapeHtml(copy.journey) + '</div><div class="button-grid one">' + weeklyClaims + '</div>', 'weekly-boss') +
      panel('STREET STORY CHAINS', '<div class="line muted">' + escapeHtml(copy.journey) + '</div>', 'story-chains') +
      panel('SEASONAL RAID', '<div class="line muted">' + escapeHtml(copy.journey) + '</div><div class="button-grid one">' + raidClaims + '</div>', 'seasonal-boss') +
      panel('PET ARENA', arenaBody, 'arena') +
      panel('KAIJU CODE CARDS', kaijuBody, 'kaiju');
  }
  // TEST-EXPORT: nextGuidance:end

  function renderHome() {
    if (!state.adopted) {
      var entry = state.entry_requirement || {};
      var entryReady = entry.eligible === true;
      var entryCopy = entry.required_arcade_xp != null
        ? number(entry.arcade_xp_lifetime) + ' / ' + number(entry.required_arcade_xp) + ' LIFETIME ARCADE XP // ' + (entryReady ? 'ENTRY UNLOCKED' : number(entry.remaining_arcade_xp) + ' XP TO GO')
        : 'CHECKING ARCADE XP';
      return panel('DORMANT SECRET BOT', '<div class="line">NO COMPANION RECORD FOUND.</div><div class="line complete">' + entryCopy + '</div><div class="line muted">NEXT // ' + escapeHtml(homeNextLine()) + '</div><div class="line muted">First-pet entry keeps your Arcade XP. Use the same Telegram account on the website and here.</div><div class="button-grid one">' + button('INITIALISE MOONPET', 'adopt', {}, { disabled: !entryReady }) + '<a class="terminal-button" href="/games/" target="_blank" rel="noopener">PLAY WEBSITE ARCADE</a></div>', 'entry');
    }
    var pet = state.pet;
    var dailyCache = state.guidance && state.guidance.daily_cache || {};
    var lifecycle = state.lifecycle || {};
    var incubation = lifecycle.incubation || {};
    if (lifecycle.phase === 'egg') {
      var signals = incubation.signals || {};
      return '<div class="ticker"><span>SECRET BOT // SIGNAL ' + number(incubation.progress) + '/' + number(incubation.target) + ' // IDENTITY FORMING //</span></div>' +
        panel('SECRET BOT CHAMBER', '<div class="line complete">THE SECRET BOT REMEMBERS HOW YOU TREAT IT.</div><div class="line muted">NEXT // ' + escapeHtml(homeNextLine()) + '</div><div class="line muted">Use at least three types of care. Your pattern shapes the reveal; no species odds are exposed.</div>' + meter('BREAKOUT SIGNAL', Number(incubation.progress || 0) / Math.max(1, Number(incubation.target || 12)) * 100) + '<div class="line">WARM ' + number(signals.warm) + ' // TALK ' + number(signals.talk) + ' // MUSIC ' + number(signals.music) + ' // REST ' + number(signals.rest) + '</div><div class="button-grid">' + button('WARM BOT', 'incubate', { care_type: 'warm' }) + button('TALK TO BOT', 'incubate', { care_type: 'talk' }) + button('PLAY A BEAT', 'incubate', { care_type: 'music' }) + button('LET IT REST', 'incubate', { care_type: 'rest' }) + '</div><div class="button-grid one">' + button('REVEAL BOT', 'hatch', {}, { disabled: !incubation.ready, statusLabel: incubation.ready ? '' : 'REVEAL NOT READY' }) + '</div><div class="line muted">DAILY SIGNALS ' + number(incubation.actions_today) + '/' + number(incubation.daily_cap) + '</div>', 'incubation') +
        panel('SECRET BOT ACTIONS', '<div class="button-grid">' + button('ENERGY DRINK', 'energy_drink') + button('DANCE', 'dance') + button('CUDDLES', 'cuddles') + '</div><div class="line muted">Stat-only care. Does not advance incubation or award XP.</div>', 'care') +
        renderPlayNow() + renderSeasonSlots();
    }
    var equipped = ['food', 'toy', 'outfit', 'armor', 'weapon', 'charm'].map(function (slot) {
      return '<div class="line"><strong>' + slot.toUpperCase() + '</strong> // ' + escapeHtml(words(pet['equipped_' + slot] || (slot === 'food' ? 'basic food' : slot === 'toy' ? 'basic toy' : 'none equipped'))) + '</div>';
    }).join('');
    var displayName = resolveMoonpetDisplayName(lifecycle, state.guidance && state.guidance.identity);
    return '<div class="ticker"><span>MOONPET OS // ' + escapeHtml(displayName) + ' // ' + escapeHtml(moonpetStageLabel(lifecycle, pet)) + ' // STREAK ' + number(pet.streak_days) + ' DAYS //</span></div>' +
      activePetSummary() +
      renderPlayNow() +
      panel('VITAL SYSTEMS', meter('HEALTH', pet.health) + meter('ENERGY', pet.energy) + meter('HUNGER', pet.hunger, true) + meter('FUN', pet.happiness) + meter('CLEAN', pet.cleanliness), 'vitals') +
      panel('CARE CONSOLE', '<div class="button-grid">' +
        button('FEED', 'feed') + button('PLAY', 'play') + button('CLEAN', 'clean') + button('SLEEP', 'sleep') + button('TRAIN', 'train') +
        button('ENERGY DRINK', 'energy_drink') + button('DANCE', 'dance') + button('CUDDLES', 'cuddles') +
        button('DAILY CACHE', 'daily_chest', {}, { disabled: dailyCache.available !== true, statusLabel: dailyCache.claimed ? 'CLAIMED TODAY' : dailyCache.available ? '' : 'SYNCING', cooldown: dailyCache.claimed ? dailyCache.cooldown : null,
          detail: dailyCache.claimed ? number(dailyCache.receipt && dailyCache.receipt.pet_xp_awarded) + ' PET XP COLLECTED // One cache per account / UTC day.' : dailyCache.available ? '40 MOON GOLD + 2 STYLE // UP TO ' + number(dailyCache.available_pet_xp) + ' PET XP WITH TODAY’S CAP.' : 'Waiting for cache status.' }) + '<button class="terminal-button" type="button" data-pet-greet>SAY HELLO<span class="button-purpose">Wave to your pet. This is an animation, with no XP or stat change.</span></button>' +
      '</div>' + (state.guidance && state.guidance.activity && state.guidance.activity.status === 'active' ? '<div class="button-grid one">' + routeButton('REVIEW BACKGROUND ACTIVITY', { screen: 'work', focus: 'timed-activity' }, 'Sleep and Train unlock when the activity ends. Feed, Play, Clean and Contracts remain available.') + '</div>' : '') + (dailyCache.claimed && state.contracts && state.contracts.available ? '<div class="button-grid one">' + routeButton('CONTINUE WITH CONTRACTS', { screen: 'missions', focus: 'contracts' }, 'Your cache is collected. Saved quests keep going without energy or cooldowns.') + '</div>' : ''), 'care') +
      renderSeasonSlots() +
      panel('COMPANION DETAILS', '<div class="line complete">' + escapeHtml(displayName) + ' // ' + escapeHtml(moonpetStageLabel(lifecycle, pet)) + '</div><div class="line">LEVEL ' + number(pet.level) + ' // ' + number(pet.pet_xp) + ' XP // ' + number(pet.style_tokens) + ' STYLE // ' + number(pet.streak_days) + '-DAY STREAK</div><div class="line muted">' + escapeHtml(words(lifecycle.temperament || 'forming')) + ' TEMPERAMENT // ' + escapeHtml(words(lifecycle.appearance && lifecycle.appearance.marking || 'moon mark')) + '</div>' + equipped, 'details');
  }

  // TEST-EXPORT: stateRequestGate:start
  function createStateRequestGate() {
    var generation = 0;
    var backgroundRequest = null;
    return {
      setBackgroundRequest: function (controller) { backgroundRequest = controller; },
      clearBackgroundRequest: function (controller) {
        if (backgroundRequest === controller) backgroundRequest = null;
      },
      begin: function () {
        if (backgroundRequest) backgroundRequest.abort();
        backgroundRequest = null;
        generation += 1;
        return generation;
      },
      isCurrent: function (candidate) {
        return candidate === generation;
      },
    };
  }
  // TEST-EXPORT: stateRequestGate:end

  function beginStateRequest() {
    return stateRequestGate.begin();
  }

  // TEST-EXPORT: coreStateHydration:start
  function stateNeedsFullHydration(snapshot) {
    return Boolean(snapshot && snapshot.hydration && snapshot.hydration.full === false);
  }

  function stateNeedsScreenHydration(snapshot, screenKey) {
    if (!stateNeedsFullHydration(snapshot) || screenKey === 'home') return false;
    return !(snapshot.hydration.modules || []).includes(screenKey);
  }

  function stateRefreshPayload(snapshot, screenKey) {
    if (screenKey === 'missions' && stateNeedsFullHydration(snapshot)) return { mode: 'missions' };
    if (screenKey && screenKey !== 'home') return {};
    return stateNeedsFullHydration(snapshot) ? { mode: 'core' } : {};
  }

  // Warm every tab after core Home is usable. One full projection is shared
  // across tabs; newer actions/reads cancel this speculative request.
  function queueBackgroundStateHydration(attempt) {
    if (Number(attempt || 0) >= 20 || !state || !state.adopted || !stateNeedsFullHydration(state) || authenticationFailure
      || fullStateHydrationPromise || fullStateHydrationRetryTimer || fullStateHydrationFailures) return;
    fullStateHydrationRetryTimer = window.setTimeout(function () {
      fullStateHydrationRetryTimer = 0;
      if (!stateNeedsFullHydration(state) || authenticationFailure) return;
      if (busy || noticesBusy || passiveRefreshInFlight || cooldownRefreshInFlight || seasonRefreshBusy || fastActionStateRefreshInFlight || fastActionStateDirty) {
        queueBackgroundStateHydration(Number(attempt || 0) + 1);
        return;
      }
      hydrateFullState(activeScreen, { background: true });
    }, 250);
  }

  function queueActiveScreenHydration(delayMs) {
    if (!stateNeedsScreenHydration(state, activeScreen) || fullStateHydrationPromise || fullStateHydrationRetryTimer
      || fullStateHydrationFailures >= FULL_STATE_HYDRATION_MAX_AUTO_RETRIES) return;
    fullStateHydrationRetryTimer = window.setTimeout(function () {
      fullStateHydrationRetryTimer = 0;
      if (authenticationFailure || !stateNeedsScreenHydration(state, activeScreen)) return;
      // The installing action/read must finish before the next generation starts.
      if (busy || noticesBusy || passiveRefreshInFlight || cooldownRefreshInFlight || seasonRefreshBusy || fastActionStateRefreshInFlight) {
        queueActiveScreenHydration(500);
        return;
      }
      hydrateFullState(activeScreen);
    }, Math.max(0, Number(delayMs || 0)));
  }

  async function hydrateFullState(reason, options) {
    var background = Boolean(options && options.background);
    if (background ? !stateNeedsFullHydration(state) : !stateNeedsScreenHydration(state, reason || activeScreen)) return state;
    if (fullStateHydrationPromise) return fullStateHydrationPromise;
    window.clearTimeout(fullStateHydrationRetryTimer);
    fullStateHydrationRetryTimer = 0;
    var manualRetry = Boolean(options && options.manual);
    if (manualRetry) {
      fullStateHydrationFailures = 0;
      fullStateHydrationRetryDelayMs = 0;
    }
    fullStateHydrationPromise = (async function () {
      if (!background) tell('LOADING ' + words(reason || activeScreen) + ' MODULE...');
      var requestGeneration = beginStateRequest();
      var warmupController = background ? new AbortController() : null;
      if (warmupController) stateRequestGate.setBackgroundRequest(warmupController);
      try {
        var data = await post('/telegram-pets/app/state', !background && reason === 'missions' ? { mode: 'missions' } : {},
          warmupController ? { signal: warmupController.signal } : undefined);
        if (!setStateSnapshot(data.state, requestGeneration)) return null;
        fastActionStateDirty = false;
        fullStateHydrationFailures = 0;
        fullStateHydrationRetryDelayMs = 0;
        var scrollTop = screen.scrollTop;
        render();
        screen.scrollTop = scrollTop;
        if (!background) await showPendingNotices();
        applyRequestedFocus();
        return state;
      } catch (error) {
        if (background && (!stateRequestGate.isCurrent(requestGeneration) || error.code === 'request_superseded')) return null;
        fullStateHydrationFailures += 1;
        var retryAfter = Math.max(0, Number(error && error.retryAfterSeconds || 0) * 1000);
        fullStateHydrationRetryDelayMs = retryAfter || Math.min(8000, 750 * Math.pow(2, Math.max(0, fullStateHydrationFailures - 1)));
        if (!background || activeScreen !== 'home') tell(error.message || 'MODULE STATE FAILED', 'danger');
        render();
        return null;
      } finally {
        if (warmupController) stateRequestGate.clearBackgroundRequest(warmupController);
        fullStateHydrationPromise = null;
        var retryableScreen = stateNeedsScreenHydration(state, activeScreen);
        if (retryableScreen && fullStateHydrationFailures < FULL_STATE_HYDRATION_MAX_AUTO_RETRIES) {
          queueActiveScreenHydration(fullStateHydrationRetryDelayMs);
        } else if (retryableScreen) {
          // The catch rendered while this request was still in flight. Show
          // the manual retry only after that request has finished and stopped.
          render();
        }
      }
    }());
    return fullStateHydrationPromise;
  }

  // TEST-EXPORT: coreStateHydration:end

  function setStateSnapshot(nextState, requestGeneration, options) {
    if (authenticationFailure || !nextState || !stateRequestGate.isCurrent(requestGeneration)) return false;
    var serverTime = Date.parse(nextState.server_time || nextState.cooldowns && nextState.cooldowns.server_time || '');
    if (Number.isFinite(serverTime)) serverClockOffsetMs = serverTime - Date.now();
    state = nextState;
    petActionRefreshRequired = false;
    fastActionStateDirty = false;
    fastActionStateRefreshFailures = 0;
    fastActionStateRefreshRetryAt = 0;
    sleepLatched = readSleepLatch(state);
    if (!(options && options.deferBotArtSelection) && !hatchArtTransitionActive()) {
      selectBotArtForState(state).catch(function (error) {
        console.info('[Moonpet] bot art selection failed', error);
      });
    }
    seasonSnapshotReceivedAt = performance.now();
    lastSeasonServerRefreshAt = seasonSnapshotReceivedAt;
    cooldownRefreshFailures = 0;
    scheduleCooldownRefresh();
    if (nextState.hydration && nextState.hydration.full === false) queueActiveScreenHydration();
    return true;
  }

  // TEST-EXPORT: cooldownRefresh:start
  function collectCooldownEntries(snapshot) {
    var entries = [];
    if (Array.isArray(snapshot && snapshot.cooldowns && snapshot.cooldowns.entries)) {
      entries = entries.concat(snapshot.cooldowns.entries);
    }
    ['daily_journey', 'weekly_journey'].forEach(function (key) {
      if (snapshot && snapshot[key] && snapshot[key].cooldown) entries.push(snapshot[key].cooldown);
    });
    var activity = snapshot && snapshot.guidance && snapshot.guidance.activity;
    if (activity && activity.cooldown) entries.push(activity.cooldown);
    var weeklyBoss = snapshot && snapshot.guidance && snapshot.guidance.weekly_boss;
    if (weeklyBoss && !weeklyBoss.defeated && weeklyBoss.cooldown) entries.push(weeklyBoss.cooldown);
    var live = snapshot && snapshot.live_systems || {};
    if (live.seasonal_boss && !live.seasonal_boss.defeated_at && live.seasonal_boss.cooldown) entries.push(live.seasonal_boss.cooldown);
    (snapshot && snapshot.regions || []).forEach(function (region) { if (region && region.cooldown) entries.push(region.cooldown); });
    (live.chains || []).forEach(function (chain) { if (chain && chain.cooldown) entries.push(chain.cooldown); });
    return entries;
  }

  function nextCooldownDelayMs(snapshot) {
    var nowMs = serverNowMs();
    var soonest = collectCooldownEntries(snapshot).reduce(function (best, entry) {
      var expires = Date.parse(entry && entry.expires_at || '');
      if (!Number.isFinite(expires)) return best;
      if (expires <= nowMs) return 250;
      return Math.min(best, expires - nowMs);
    }, Infinity);
    return Number.isFinite(soonest) ? Math.max(250, soonest + 250) : 0;
  }

  function scheduleCooldownRefresh(delayOverrideMs) {
    window.clearTimeout(cooldownRefreshTimer);
    cooldownRefreshTimer = 0;
    var override = Number(delayOverrideMs);
    if (cooldownRefreshFailures >= 3 && !(override > 0)) return;
    var delay = Number.isFinite(override) && override > 0 ? Math.ceil(override) : nextCooldownDelayMs(state);
    if (!delay) return;
    cooldownRefreshTimer = window.setTimeout(function () {
      cooldownRefreshTimer = 0;
      refreshExpiredCooldownState();
    }, Math.min(delay, 2147483647));
  }

  async function refreshExpiredCooldownState() {
    if (!state || !state.adopted || cooldownRefreshFailures >= 3) return;
    if (busy || noticesBusy || cooldownRefreshInFlight || passiveRefreshInFlight || fastActionStateRefreshInFlight || seasonRefreshBusy || fullStateHydrationPromise) {
      scheduleCooldownRefresh(1000);
      return;
    }
    var refreshKey = state && state.cooldowns && state.cooldowns.next_expires_at || collectCooldownEntries(state).map(function (entry) { return entry && entry.expires_at || ''; }).sort()[0] || '';
    if (refreshKey && refreshKey === lastCooldownRefreshKey) {
      scheduleCooldownRefresh(1000);
      return;
    }
    cooldownRefreshInFlight = true;
    if (refreshKey) lastCooldownRefreshKey = refreshKey;
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state', stateRefreshPayload(state, activeScreen));
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      var scrollTop = screen.scrollTop;
      render();
      screen.scrollTop = scrollTop;
      tell('COOLDOWN EXPIRED. STATE REFRESHED.');
      if (!stateNeedsFullHydration(state)) await showPendingNotices();
    } catch (error) {
      if (refreshKey && refreshKey === lastCooldownRefreshKey) lastCooldownRefreshKey = '';
      cooldownRefreshFailures += 1;
      if (cooldownRefreshFailures < 3) {
        var backoff = Math.min(30000, 2000 * Math.pow(2, cooldownRefreshFailures - 1));
        var retryAfter = Math.max(0, Number(error && error.retryAfterSeconds || 0) * 1000);
        scheduleCooldownRefresh(Math.max(retryAfter, backoff + Math.floor(Math.random() * backoff * 0.2)));
      } else {
        tell('COOLDOWN SYNC PAUSED. TAP REFRESH TO RETRY.', 'danger');
      }
    } finally {
      cooldownRefreshInFlight = false;
    }
  }

  function tickCooldownDom() {
    var nodes = document.querySelectorAll('[data-cooldown-expires-at]');
    nodes.forEach(function (node) {
      var text = countdownText({ expires_at: node.getAttribute('data-cooldown-expires-at') }, node.getAttribute('data-cooldown-prefix') || 'Available in ');
      node.textContent = text;
    });
  }
  // TEST-EXPORT: cooldownRefresh:end

  // TEST-EXPORT: actionCooldownMerge:start
  function mergeActionResultCooldown(nextState, result, action) {
    if (!nextState || !result) return nextState;
    var source = result.cooldown || result;
    var expiresAt = cooldownExpiresAt(source);
    if (!expiresAt) return nextState;
    var remaining = cooldownRemainingSeconds({ expires_at: expiresAt });
    if (remaining <= 0) return nextState;
    var output = Object.assign({}, nextState);
    var cooldowns = Object.assign({}, output.cooldowns || {});
    var entries = Array.isArray(cooldowns.entries) ? cooldowns.entries.slice() : [];
    var key = 'action:' + String(action || result.action || result.reason || 'cooldown');
    var entry = {
      key: key,
      label: words(action || result.action || result.reason || 'Action') + ' cooldown',
      kind: 'action',
      expires_at: expiresAt,
      remaining_seconds: remaining,
      server_time: result.server_time || source.server_time || output.server_time || cooldowns.server_time || null,
    };
    entries = entries.filter(function (item) { return item && item.key !== key; });
    entries.push(entry);
    entries.sort(function (left, right) { return Date.parse(left.expires_at) - Date.parse(right.expires_at) || String(left.key).localeCompare(String(right.key)); });
    cooldowns.entries = entries;
    cooldowns.next_expires_at = entries[0] && entries[0].expires_at || cooldowns.next_expires_at || null;
    cooldowns.server_time = cooldowns.server_time || output.server_time || entry.server_time || null;
    output.cooldowns = cooldowns;
    return output;
  }
  // TEST-EXPORT: actionCooldownMerge:end

  // TEST-EXPORT: fastActionResponse:start
  function shouldUseFastActionResponse(action) {
    return FAST_ACTION_RESPONSE_ACTIONS.has(String(action || '').toLowerCase());
  }

  function patchFastActionState(snapshot, result, action) {
    if (!snapshot || !result) return snapshot;
    var next = Object.assign({}, snapshot);
    if (result.pet) {
      next.pet = Object.assign({}, snapshot.pet || {}, result.pet);
      if (snapshot.season_slots && Array.isArray(snapshot.season_slots.slots)) {
        next.season_slots = Object.assign({}, snapshot.season_slots, {
          slots: snapshot.season_slots.slots.map(function (slot) {
            if (!slot || !slot.active || !slot.pet) return slot;
            return Object.assign({}, slot, { pet: Object.assign({}, slot.pet, result.pet) });
          }),
        });
      }
    }
    if (result.lifecycle) next.lifecycle = Object.assign({}, snapshot.lifecycle || {}, result.lifecycle);
    if (result.season_slots) next.season_slots = result.season_slots;
    if (result.capabilities) {
      next.capabilities = result.capabilities;
      if (result.capabilities_version != null) next.capabilities_version = result.capabilities_version;
    }
    next = mergeActionResultCooldown(next, result, action);
    return next;
  }

  function scheduleFastActionStateRefresh(delayMs) {
    fastActionStateDirty = true;
    window.clearTimeout(fastActionStateRefreshTimer);
    fastActionStateRefreshTimer = 0;
    if (fastActionStateRefreshFailures >= FAST_ACTION_STATE_MAX_AUTO_RETRIES) {
      tell('CARE SYNC PAUSED. TAP REFRESH TO READ YOUR SAVE.', 'danger');
      return;
    }
    var delay = Math.max(0, Number(delayMs == null ? 4000 : delayMs) || 0, fastActionStateRefreshRetryAt - Date.now());
    fastActionStateRefreshTimer = window.setTimeout(refreshFastActionState, delay);
  }

  async function refreshFastActionState() {
    window.clearTimeout(fastActionStateRefreshTimer);
    fastActionStateRefreshTimer = 0;
    if (!fastActionStateDirty || fastActionStateRefreshInFlight || fastActionStateRefreshFailures >= FAST_ACTION_STATE_MAX_AUTO_RETRIES) return;
    if (Date.now() < fastActionStateRefreshRetryAt) {
      scheduleFastActionStateRefresh(0);
      return;
    }
    if (fullStateHydrationPromise) {
      scheduleFastActionStateRefresh(750);
      return;
    }
    if (busy || noticesBusy || passiveRefreshInFlight || cooldownRefreshInFlight || seasonRefreshBusy) {
      scheduleFastActionStateRefresh(500);
      return;
    }
    fastActionStateRefreshInFlight = true;
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state', stateRefreshPayload(state, activeScreen));
      if (!data.state) throw new Error('CARE STATE UNAVAILABLE');
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      fastActionStateDirty = false;
      fastActionStateRefreshFailures = 0;
      fastActionStateRefreshRetryAt = 0;
      var scrollTop = screen.scrollTop;
      render();
      screen.scrollTop = scrollTop;
      if (!stateNeedsFullHydration(state)) await showPendingNotices();
    } catch (error) {
      if (!stateRequestGate.isCurrent(requestGeneration)) return;
      fastActionStateRefreshFailures += 1;
      var backoff = Math.min(30000, 2000 * Math.pow(2, fastActionStateRefreshFailures - 1));
      var retryAfter = Math.max(0, Number(error && error.retryAfterSeconds || 0) * 1000);
      var retryDelay = Math.max(retryAfter, backoff + Math.floor(Math.random() * backoff * 0.2));
      fastActionStateRefreshRetryAt = Date.now() + retryDelay;
      scheduleFastActionStateRefresh(retryDelay);
    } finally {
      fastActionStateRefreshInFlight = false;
      if (fastActionStateDirty && !fastActionStateRefreshTimer && fastActionStateRefreshFailures < FAST_ACTION_STATE_MAX_AUTO_RETRIES) scheduleFastActionStateRefresh(1000);
    }
  }
  // TEST-EXPORT: fastActionResponse:end

  function seasonSnapshotElapsed() {
    return seasonSnapshotReceivedAt > 0 ? Math.max(0, performance.now() - seasonSnapshotReceivedAt) : 0;
  }

  // TEST-EXPORT: seasonTiming:start
  function seasonTiming(season, elapsedMs) {
    var start = Date.parse(season && season.start_at || '');
    var end = Date.parse(season && season.end_at || '');
    var serverCurrent = Date.parse(season && season.current_at || '');
    var current = serverCurrent + Math.max(0, Number(elapsedMs) || 0);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(current) || end <= start) {
      return { status: 'UNAVAILABLE', day: 0, totalDays: 0, remaining: 0, partial: false, percent: 0 };
    }
    var dayMs = 86400000;
    var totalDays = Math.max(1, Math.ceil((end - start) / dayMs));
    var active = current >= start && current < end;
    var day = current < start ? 0 : Math.min(totalDays, Math.floor((Math.min(current, end - 1) - start) / dayMs) + 1);
    return {
      status: current < start ? 'UPCOMING' : active ? 'ACTIVE' : 'COMPLETE',
      day: day,
      totalDays: totalDays,
      remaining: active ? Math.max(0, Math.ceil((end - current) / dayMs)) : 0,
      partial: totalDays < 90,
      percent: Math.round(day / totalDays * 100),
    };
  }
  // TEST-EXPORT: seasonTiming:end

  function renderPetInstanceCard(slot) {
    var pet = slot.pet || {};
    if (!pet.progression) return '<div class="pet-instance-card" data-pet-id="' + escapeHtml(slot.pet_id || '') + '"><div class="pet-instance-heading"><strong>' + escapeHtml(pet.display_name || 'UNKNOWN') + '</strong>' + (slot.active ? '<span>◆ ACTIVE</span>' : '<span>OWNED</span>') + '</div><div class="pet-instance-grid"><div><span>LIFECYCLE</span><strong>' + escapeHtml(moonpetStageLabel({}, pet)) + '</strong></div><div><span>LEVEL</span><strong>' + number(pet.level || 1) + '</strong></div><div><span>PET XP</span><strong>' + number(pet.pet_xp) + '</strong></div></div><div class="line muted"><strong>PROGRESSION UNAVAILABLE</strong></div></div>';
    var progression = pet.progression || {};
    var lifecycle = progression.lifecycle || {};
    var growth = progression.growth_marks || {};
    var crests = progression.weekly_crests || {};
    var completion = progression.lifetime_complete || progression.season_complete
      ? '<div class="line complete"><strong>LIFETIME JOURNEY COMPLETE</strong></div>'
      : progression.legendary ? '<div class="line complete"><strong>LEGENDARY</strong> // JOURNEY STILL INCOMPLETE</div>'
        : '<div class="line muted"><strong>ROAD TO LEGENDARY</strong></div>';
    var variant = pet.variant ? '<div><span>VARIANT</span><strong>' + escapeHtml(words(pet.variant)) + '</strong></div>' : '';
    return '<div class="pet-instance-card" data-pet-id="' + escapeHtml(slot.pet_id || '') + '">' +
      '<div class="pet-instance-heading"><strong>' + escapeHtml(pet.display_name || 'UNKNOWN') + '</strong>' + (slot.active ? '<span>◆ ACTIVE</span>' : '<span>OWNED</span>') + '</div>' +
      '<div class="pet-instance-grid"><div><span>IDENTITY</span><strong>' + escapeHtml(pet.display_name || 'UNKNOWN') + '</strong></div>' + variant +
      '<div><span>LIFECYCLE</span><strong>' + escapeHtml(moonpetStageLabel({}, pet)) + '</strong></div><div><span>LEVEL</span><strong>' + number(pet.level || 1) + '</strong></div>' +
      '<div><span>PET XP</span><strong>' + number(pet.pet_xp) + '</strong></div><div><span>HEALTH</span><strong>' + number(pet.health) + '</strong></div>' +
      '<div><span>STAGE</span><strong>' + number(lifecycle.current_stage || 1) + '/' + number(lifecycle.total_stages || 6) + '</strong></div><div><span>GROWTH</span><strong>' + number(growth.earned) + '/' + number(growth.required) + '</strong></div>' +
      '<div><span>CRESTS</span><strong>' + number(crests.earned) + '/' + number(crests.required) + '</strong></div><div><span>ENERGY</span><strong>' + number(pet.energy) + '</strong></div><div><span>HUNGER</span><strong>' + number(pet.hunger) + '</strong></div>' +
      '<div><span>FUN</span><strong>' + number(pet.happiness) + '</strong></div><div><span>CLEAN</span><strong>' + number(pet.cleanliness) + '</strong></div></div>' + completion + '</div>';
  }

  function renderPetSpaces(summary) {
    summary = summary || {};
    var provided = Array.isArray(summary.slots) ? summary.slots : [];
    var byNumber = {};
    provided.forEach(function (slot) { byNumber[Number(slot.slot_number)] = slot; });
    var available = Number(summary.arcade_xp_available != null ? summary.arcade_xp_available : (provided[0] && provided[0].arcade_xp_available != null ? provided[0].arcade_xp_available : 0));
    var rows = Array.from({ length: Math.max(3, provided.length) }, function (_, index) { return index + 1; }).map(function (slotNumber) {
      var slot = byNumber[slotNumber] || { slot_number: slotNumber, unlocked: false, purchase_enabled: false };
      var owned = Boolean(slot.unlocked);
      var active = Boolean(slot.active);
      var selectable = owned && slot.selectable === true;
      var cost = Number(slot.unlock_cost_arcade_xp || 0);
      var unlockEnabled = !owned && Boolean(slot.purchase_enabled);
      var affordable = unlockEnabled && Boolean(slot.affordable);
      var status = active ? 'ACTIVE' : owned ? selectable ? 'OWNED' : 'OWNED // RECOVERY REQUIRED' : 'LOCKED';
      var details = owned && !selectable ? '<div class="line muted">OWNED SPACE PRESERVED // Saved pet is unavailable. Recovery is required before play.</div>' : owned ? renderPetInstanceCard(slot)
        : '<div class="slot-unlock-copy"><strong>ARCADE XP UNLOCK</strong><span>Spendable Arcade XP unlocks an additional permanent pet space.</span><span>CURRENT ARCADE XP // ' + number(available) + ' / ' + number(cost) + ' REQUIRED</span></div>';
      var control = active ? '<strong class="slot-active-marker" aria-label="Active pet">◆ ACTIVE</strong>'
        : owned ? selectable ? button('SWITCH TO SLOT ' + slotNumber, 'switch_pet_slot', { pet_id: slot.pet_id, slot_number: slotNumber }) : '<div class="line locked">PET UNAVAILABLE // ' + escapeHtml(words(slot.selection_disabled_reason || 'pet recovery required')) + '</div>'
          : unlockEnabled ? button('UNLOCK SLOT ' + slotNumber, 'buy_pet_slot', { slot_number: slotNumber }, {
            disabled: !affordable,
            resourceRequired: !affordable,
            detail: affordable ? 'SPEND ' + number(cost) + ' ARCADE XP' : 'NEED ' + number(Math.max(0, cost - available)) + ' MORE ARCADE XP',
          }) : '<div class="line muted">UNLOCK UNAVAILABLE // ' + escapeHtml(words(slot.purchase_disabled_reason || summary.purchase_disabled_reason || 'season slots unavailable')) + '</div>';
      if (selectable) control += button('DELETE PET', 'delete_pet_slot', { pet_id: slot.pet_id, pet_label: 'PET ' + slotNumber + ' // ' + (slot.pet && slot.pet.display_name || 'MOONPET') }, { danger: true, detail: 'CONFIRM BEFORE DELETION // NEW EGG IN THIS OWNED SPACE // REWARD HISTORY KEPT' });
      return '<article class="season-slot ' + (active ? 'is-active' : owned ? 'is-owned' : 'is-locked') + '" data-season-slot="' + slotNumber + '">' +
        '<header><strong>PET ' + slotNumber + ' // SLOT ' + slotNumber + '</strong><span>' + status + '</span></header>' + details + '<div class="slot-control">' + control + '</div></article>';
    }).join('');
    return panel('PET SPACES',
      '<div class="line">Switch between your saved pets. Each keeps its own XP and progression.</div>' +
      (summary.recovery_over_capacity ? '<div class="line locked">RECOVERED PETS EXCEED THREE SPACES // All saves are retained. New purchases are blocked; ownership needs review.</div>' : '') +
      '<div class="season-slot-balance"><strong>CURRENT ARCADE XP</strong><span>' + number(available) + '</span></div>' +
      '<div class="line muted">NEW PLAYER ENTRY // 1,000 LIFETIME ARCADE XP, KEPT // PET 1 IS FREE // PET 2 COSTS 500 SPENDABLE XP // PET 3 COSTS 1,000 SPENDABLE XP</div><div class="season-slot-grid">' + rows + '</div>' +
      (Array.isArray(summary.deleted_pet_history) && summary.deleted_pet_history.length ? '<div class="line muted"><strong>DELETED PET HISTORY // LATEST 20</strong><br>Account rewards stay yours. Saved pets below cannot return to play.</div>' + summary.deleted_pet_history.map(function (entry) {
        return '<div class="line muted">DELETED PET // ' + number(entry.pet_xp) + ' SAVED PET XP // ' + number(entry.awarded_receipts) + ' AWARDED REWARD RECEIPTS // ' + escapeHtml(entry.deleted_at) + '</div>';
      }).join('') : ''), 'pet-spaces');
  }

  function renderSeasonSlots() {
    var summary = state.season_slots || {};
    var petSpaces = renderPetSpaces(summary);
    var season = summary.competition_season || summary.season || {};
    var timing = seasonTiming(season, seasonSnapshotElapsed());
    if (summary.hydrated === false || stateNeedsFullHydration(state)) {
      var providedCore = Array.isArray(summary.slots) ? summary.slots : [];
      var activeCore = providedCore.find(function (slot) { return slot && slot.active; }) || {};
      var timingCore = timing.status === 'UNAVAILABLE'
        ? '<div class="line muted">RUNTIME SEASON TIMING UNAVAILABLE.</div>'
        : '<div class="season-status-grid"><div><span>PHASE</span><strong>' + timing.status + '</strong></div><div><span>POSITION</span><strong>DAY ' + number(timing.day) + ' / ' + number(timing.totalDays) + '</strong></div><div><span>REMAINING</span><strong>' + countdownMarkup({ expires_at: season.end_at }, '') + '</strong></div><div><span>ACTIVE SLOT</span><strong>' + number(activeCore.slot_number || 1) + '</strong></div></div>' + meter('SEASON', timing.percent);
      return petSpaces + panel('COMPETITION SEASON // CORE',
        '<div class="season-identity"><strong>SEASON ' + number(season.season_number || 1) + ' // ' + escapeHtml(season.key || 'CURRENT') + '</strong><span>LIGHTWEIGHT HOME SNAPSHOT</span></div>' +
        timingCore +
        '<div class="line muted">Detailed pet progression, Growth Marks, Weekly Crests and season reward tiers load when you open Missions or Profile.</div>' +
        '<div class="season-slot-balance"><strong>CURRENT ARCADE XP</strong><span>' + number(summary.arcade_xp_available || 0) + '</span></div>' +
        '<div class="button-grid">' + routeButton('LOAD MISSIONS', { screen: 'missions', focus: 'daily-journey' }, 'Load Journey progress.') + routeButton('LOAD PROFILE', { screen: 'profile', focus: 'season-slots' }, 'Load full pet-slot progression.') + '</div>', 'season-slots');
    }
    var accountSeason = state.guidance && state.guidance.season || {};
    var tiers = Array.isArray(accountSeason.tiers) ? accountSeason.tiers : [];
    var unlockedTiers = tiers.filter(function (tier) { return tier.unlocked || tier.claimed_at; }).length;
    var provided = Array.isArray(summary.slots) ? summary.slots : [];
    var activeSlot = provided.find(function (slot) { return slot.active; }) || {};
    var journey = activeSlot.pet && activeSlot.pet.progression || {};
    var journeyLifecycle = journey.lifecycle || {};
    var journeyGrowth = journey.growth_marks || {};
    var journeyCrests = journey.weekly_crests || {};
    var nextEvolution = journeyLifecycle.next_evolution || {};
    var levelRequirement = journeyLifecycle.requirements && journeyLifecycle.requirements.pet_level || {};
    var lifetime = activeSlot.pet && activeSlot.pet.lifetime_progression || {};
    var journeyStatus = journey.lifetime_complete || journey.season_complete ? 'LIFETIME JOURNEY COMPLETE'
      : journey.legendary ? 'LEGENDARY // JOURNEY STILL INCOMPLETE' : 'ROAD TO LEGENDARY';
    var lifecycleRequirement = journeyLifecycle.next_evolution ? 'LEVEL // ' + number(levelRequirement.current) + '/' + number(levelRequirement.required) + ' // EVOLUTION READY ' + (journeyLifecycle.evolution_ready ? 'YES' : 'NO // ' + words(journeyLifecycle.authority_reason || 'requirements not met')) : 'FINAL FORM REACHED';
    var journeyPanel = journey.pet_id ? '<div class="progression-split"><div><strong>LIFECYCLE // STAGE ' + number(journeyLifecycle.current_stage) + '/' + number(journeyLifecycle.total_stages) + '</strong><span>NEXT // ' + escapeHtml(nextEvolution.name || 'FINAL FORM REACHED') + '</span><span>' + lifecycleRequirement + '</span></div><div><strong>LIFETIME PET JOURNEY // WEEK ' + (lifetime.current_week == null ? '?' : number(lifetime.current_week)) + '</strong><span>GROWTH MARKS // ' + number(journeyGrowth.earned) + '/' + number(journeyGrowth.required) + '</span><span>WEEKLY CRESTS // ' + number(journeyCrests.earned) + '/' + number(journeyCrests.required) + '</span><span>' + journeyStatus + '</span></div></div>' : '<div class="line muted"><strong>PROGRESSION UNAVAILABLE</strong></div>';
    var timingCopy = timing.status === 'UNAVAILABLE'
      ? '<div class="line muted">RUNTIME SEASON TIMING UNAVAILABLE.</div>'
      : '<div class="season-status-grid"><div><span>PHASE</span><strong>' + timing.status + '</strong></div><div><span>POSITION</span><strong>DAY ' + number(timing.day) + ' / ' + number(timing.totalDays) + '</strong></div><div><span>REMAINING</span><strong>' + countdownMarkup({ expires_at: season.end_at }, '') + '</strong></div><div><span>CYCLE</span><strong>' + 'CALENDAR QUARTER' + '</strong></div></div>' + meter('SEASON', timing.percent);
    return petSpaces + panel('COMPETITION SEASON // LIVE',
      '<div class="season-identity"><strong>SEASON ' + number(season.season_number || 1) + ' // ' + escapeHtml(season.key || 'CURRENT') + '</strong><span>SERVER-AUTHORITATIVE CALENDAR</span></div>' + timingCopy +
      journeyPanel + '<div class="progression-split"><div><strong>PET PROGRESSION</strong><span>Identity // stats // lifecycle // Pet XP stay with each pet instance.</span></div><div><strong>ACCOUNT SEASON XP</strong><span>' + number(accountSeason.xp) + ' XP across your pets for this season // ' + number(unlockedTiers) + '/' + number(tiers.length) + ' tiers // shared seasonal rank</span></div></div>' +
      '<div class="line muted">NEXT // ' + escapeHtml(profileNextLine()) + '</div>' +
      '<div class="line complete">PETS AND PURCHASED SPACES DO NOT RESET WITH COMPETITION SEASONS.</div>', 'season-slots');
  }

  function routeButton(label, route, detail) {
    var destinations = { home: 'Care for your pet, build egg signals and choose a pet.', missions: 'Play saved quests, complete goals and collect earned rewards.', explore: 'Compare routes, run rooms and battle choices before starting.', work: 'Choose jobs or background timers and collect their rewards.', economy: 'Compare gear, item effects and costs before spending resources.', profile: 'Switch pets and review lifetime progression, identity and competition rewards.' };
    var purpose = detail || destinations[route.screen] || 'Review this activity and its requirements before starting.';
    return '<button class="terminal-button route-button" type="button" data-jump="' + escapeHtml(route.screen) + '" data-focus="' + escapeHtml(route.focus) + '" aria-label="' + escapeHtml(label) + '" aria-description="Opens a menu without spending resources. ' + escapeHtml(purpose) + '">' + escapeHtml(label) + '<span class="button-state">OPEN ' + escapeHtml(String(route.screen || 'MENU').toUpperCase()) + ' // NO COST</span><span class="button-purpose">' + escapeHtml(purpose) + '</span></button>';
  }

  function objectiveRouteButton(key) {
    if (!window.MoonpetPlayOptions) return '';
    var routes = window.MoonpetPlayOptions.objectiveRoutes(key, state);
    if (state && state.lifecycle && state.lifecycle.phase === 'egg') routes = [{ title: 'OPEN INCUBATION', screen: 'home', focus: 'incubation' }];
    var controls = routes.map(function (route) { return routeButton(route.title, route, route.detail); });
    return '<div class="button-grid one">' + controls[0] + '</div>' + (controls.length > 1 ? '<details><summary class="line">OTHER QUALIFYING ROUTES</summary><div class="button-grid">' + controls.slice(1).join('') + '</div></details>' : '');
  }

  function dailyObjectiveMarkup() {
    var objectives = state && state.daily_journey && state.daily_journey.objectives;
    if (!Array.isArray(objectives) || !objectives.length) return '<div class="line muted">Objective details unavailable. Refresh after the Worker update.</div>';
    return '<div class="line muted">These are the server-tracked Growth Mark goals, separate from the seven daily missions. Official run goals do not count contracts or endless runs.</div>' + objectives.map(function (goal) {
      return '<div class="line ' + (goal.completed ? 'complete' : '') + '">' + (goal.completed ? '[OK] ' : '[ ] ') + escapeHtml(goal.description || words(goal.challenge_id)) + ' // ' + number(goal.progress) + '/' + number(goal.target) + '</div>' + (goal.completed ? '' : objectiveRouteButton(goal.challenge_id));
    }).join('');
  }

  function renderRecommended() {
    if (stateNeedsFullHydration(state)) {
      var coreRoutes = [
        { title: 'MISSIONS', screen: 'missions', focus: 'missions', detail: 'Work on goals, play saved Contracts and collect earned mission rewards.' },
        { title: 'EXPLORE', screen: 'explore', focus: 'moon-run', detail: 'Choose runs, district routes, boss fights or player battles.' },
        { title: 'WORK', screen: 'work', focus: 'timed-activity', detail: 'Compare jobs or start, review and claim background activities.' },
      ];
      return panel('RECOMMENDED NEXT', '<div class="line muted">Choose a route below. Home care is ready while the other menus prepare.</div><div class="button-grid one">' + coreRoutes.map(function (route) { return routeButton(route.title, route, route.detail); }).join('') + '</div>', 'recommended');
    }
    if (!window.MoonpetPlayOptions || !window.MoonpetPlayOptions.recommendations) return '';
    var choices = window.MoonpetPlayOptions.recommendations(state, { crafting_goal: selectedCraftingGoal() });
    if (!choices.length) return '';
    var controls = choices.map(function (choice, index) {
      return routeButton((index + 1) + '. ' + choice.title, choice, choice.detail);
    });
    var moreKey = [state && state.pet && state.pet.pet_id || 'account', activeScreen, 'recommended-more'].join(':');
    var more = controls.length > 3 ? '<details class="more-recommendations" data-panel-key="' + escapeHtml(moreKey) + '"' + (panelOpenState[moreKey] ? ' open' : '') + '><summary class="panel-summary"><span class="panel-icon" aria-hidden="true">＋</span><span class="panel-caption"><span class="panel-title">MORE RECOMMENDED OPTIONS // ' + (controls.length - 3) + '</span><span class="panel-description">More routes, optional upgrades and goals to review.</span></span><span class="panel-chevron" aria-hidden="true">⌄</span></summary><div class="button-grid one">' + controls.slice(3).join('') + '</div></details>' : '';
    return panel('RECOMMENDED NEXT', '<div class="button-grid one">' + controls.slice(0, 3).join('') + '</div>' + more, 'recommended', 'Next: ' + choices[0].title);
  }

  function renderPlayNow() {
    if (stateNeedsFullHydration(state)) {
      var routes = [
        { title: 'MISSIONS', screen: 'missions', focus: 'missions' },
        { title: 'EXPLORE', screen: 'explore', focus: 'moon-run' },
        { title: 'WORK', screen: 'work', focus: 'timed-activity' },
        { title: 'ECONOMY', screen: 'economy', focus: 'shop' },
        { title: 'PROFILE', screen: 'profile', focus: 'pet-spaces' },
      ];
      return panel('PLAY NOW // CHOOSE A MENU', '<div class="line muted">Choose what you want to do next. Opening a menu spends nothing; review its actions before starting.</div><div class="button-grid">' + routes.map(function (route) { return routeButton(route.title, route); }).join('') + '</div>', 'play-now');
    }
    if (!window.MoonpetPlayOptions) return '';
    var choices = window.MoonpetPlayOptions.options(state, { crafting_goal: selectedCraftingGoal() });
    if (!choices.length) return '';
    return panel('PLAY NOW // YOUR CHOICE', '<div class="line muted">Pick a route. Rewarded actions keep their normal gates and limits. Progress is saved—you can leave and return.</div><div class="button-grid">' + choices.map(function (choice) { return routeButton(choice.title, choice, choice.detail); }).join('') + '</div>', 'play-now');
  }

  var craftingGoalMemory = Object.create(null);
  var craftingGoalStorageAvailable = true;
  function selectedCraftingGoal() {
    var petId = state && state.pet && state.pet.pet_id;
    if (!petId) return '';
    if (!Object.prototype.hasOwnProperty.call(craftingGoalMemory, petId)) {
      try { craftingGoalMemory[petId] = window.localStorage.getItem('moonpet-crafting-goal:' + petId) || ''; }
      catch (_) { craftingGoalStorageAvailable = false; craftingGoalMemory[petId] = ''; }
    }
    var selected = craftingGoalMemory[petId];
    return (state.live_systems && state.live_systems.crafting || []).some(function (recipe) { return recipe.key === selected; }) ? selected : '';
  }

  function craftingGoalMarkup() {
    if (!window.MoonpetPlayOptions || !window.MoonpetPlayOptions.craftingGoal) return '';
    var selected = selectedCraftingGoal();
    var recipes = state.live_systems && state.live_systems.crafting || [];
    var body = '<label class="line" for="crafting-goal">CHOOSE A CRAFTING GOAL</label><select id="crafting-goal"><option value="">NO TRACKED GOAL</option>' + recipes.map(function (recipe) {
      return '<option value="' + escapeHtml(recipe.key) + '"' + (recipe.key === selected ? ' selected' : '') + '>' + escapeHtml(recipe.title) + ' // LEVEL ' + number(recipe.min_level) + '</option>';
    }).join('') + '</select><div class="line muted">Track supplies for this pet on this device. Change or clear the goal any time. Choosing a goal spends nothing and adds no quest reward.</div>';
    if (!craftingGoalStorageAvailable) body += '<div class="line muted">Device storage unavailable; this goal is kept for this session only.</div>';
    var plan = window.MoonpetPlayOptions.craftingGoal(state, selected);
    if (!plan) return body;
    body += '<div class="line signal">' + escapeHtml(plan.recipe.title) + ' // ' + (plan.ready ? 'READY TO CRAFT' : plan.output_full ? 'OUTPUT STACK FULL' : !plan.recipe.unlocked ? 'REQUIRES LEVEL ' + number(plan.recipe.min_level) : 'GATHER SUPPLIES') + '</div>';
    body += plan.ingredients.map(function (material) {
      return '<div class="line ' + (material.missing ? '' : 'complete') + '">' + escapeHtml(material.title) + ' // HAVE ' + number(material.owned) + ' / NEED ' + number(material.required) + (material.missing ? ' // MISSING ' + number(material.missing) : ' // READY') + '</div>';
    }).join('');
    body += '<div class="line muted">BAG // ' + number(plan.output_count) + ' ' + escapeHtml(words(plan.recipe.output.item_key)) + '. Crafting makes ' + number(plan.recipe.output.quantity) + '.</div>';
    if (plan.output_count) body += '<div class="button-grid one">' + routeButton('REVIEW ITEMS IN BAG', { screen: 'economy', focus: 'inventory' }, 'Review the item before choosing whether to use it.') + '</div>';
    if (plan.routes.length) body += '<div class="button-grid">' + plan.routes.map(function (target) { return routeButton(target.title, target, target.detail); }).join('') + '</div>';
    else if (plan.missing.length) body += '<div class="line muted">No matching district, expedition or affordable market option is available in this snapshot. Check the material sources below or continue a Contract while routes reset.</div>';
    body += '<div class="button-grid">' + routeButton('CHECK MATERIAL SOURCES', { screen: 'economy', focus: 'materials' }) + (state.contracts && state.contracts.available ? routeButton('CONTINUE CONTRACTS', { screen: 'missions', focus: 'contracts' }, 'Saved quests without pet energy costs or cooldowns. Contracts do not award crafting materials.') : '') + '</div>';
    return body;
  }

  function renderContracts() {
    var board = state && state.contracts;
    var savedBonuses = (board && board.pending_rewards || []).map(function (pending) {
      return '<div class="line">SAVED BONUS' + (pending.slot_number ? ' // SLOT ' + number(pending.slot_number) : '') + (pending.reward_day ? ' // ' + escapeHtml(pending.reward_day) : '') + '</div><div class="button-grid one">' + button('RETRY SAVED XP BONUS', 'contract_claim', { pet_id: pending.pet_id || board.pet_id, contract_id: pending.contract_id }, { detail: 'Credits the pet that completed this contract, including earlier seasons. No new run or energy cost. Normal Pet XP caps still apply.' }) + '</div>';
    }).join('');
    if (!board || !board.available) return panel('CONTINUING CONTRACTS', savedBonuses + '<div class="line muted">' + (state && state.lifecycle && state.lifecycle.phase === 'egg' ? 'Hatch your Secret Bot to start new contracts.' : 'Contracts are syncing. Refresh once the game update is complete.') + '</div>', 'contracts');
    var run = board.run;
    var body = '<div class="line complete">CONTRACT RANK ' + number(board.rank) + ' // ' + number(board.completed) + ' COMPLETED</div><div class="line">' + number(board.rank_points) + ' RANK POINTS // NEXT RANK ' + number(board.next_rank_at) + '</div>' +
      '<div class="line muted">Play as many contracts as you like. No pet energy cost or cooldown. Route health and salvage belong to this contract; salvage becomes rank points, not Moon Gold. Saved after every choice; leave and resume anytime.</div>' +
      '<div class="line">DAILY BONUS SLOTS ' + number(board.bonus_remaining) + '/' + number(board.bonus_limit) + ' // UP TO ' + number(board.bonus_xp) + ' PET XP PER SUCCESS</div><div class="line muted">Bonus slots are shared across your pets and reset at 00:00 UTC. Your normal Pet XP cap still applies. Contract rank keeps growing after bonuses run out. No Growth Marks, Weekly Crests or official Daily Run credit.</div>';
    body += savedBonuses;
    if (run) body += (run.relics || []).map(function (relic) { return '<div class="line muted">◆ ' + escapeHtml(relic.title + ': ' + relic.detail) + '</div>'; }).join('');
    if (board.collection) body += '<div class="line complete">ROUTE COLLECTION // ' + number(board.collection.cleared_routes) + '/' + number(board.collection.total_routes) + ' CLEARED // ' + number(board.collection.unlocked_routes) + ' UNLOCKED</div><div class="line muted">Clear each goal with each build at each tier and route length. These saved records keep progressing after daily bonuses. No extra rewards for the checklist.</div>';
    if (run) {
      body += '<div class="line complete">' + escapeHtml(run.title) + ' // ' + escapeHtml(words(run.status)) + '</div><div class="line">' + escapeHtml(run.build_title) + ' // TIER ' + number(run.tier) + ' // ROOMS ' + number(run.depth) + '/' + number(run.max_depth) + '</div>' +
        '<div class="line">ROUTE HP ' + number(run.health) + '/' + number(run.max_health) + ' // SUPPLIES ' + number(run.supplies) + ' // SALVAGE ' + number(run.salvage) + '</div><div class="line muted">' + escapeHtml(run.objective) + '</div><div class="line">GOAL ' + number(run.progress) + '/' + number(run.target) + '</div><div class="line signal">' + escapeHtml(run.last) + '</div>';
      if (run.boss) body += '<div class="line signal" data-contract-boss>FINAL BOSS // ' + escapeHtml(run.boss.title) + ' // ' + (run.boss.result ? run.boss.result.cleared ? 'ROUTE CLEARED' : 'ROUTE MISSED' : 'ROOM ' + number(run.max_depth)) + '</div><div class="line muted">' + escapeHtml(run.boss.detail) + ' ' + (run.boss.active ? 'Choose a boss tactic below. A failed tactic ends the contract with no rank or XP. Supply rest is unavailable; preparation remains optional.' : 'Complete your main goal and clear the final boss route to earn rank. No separate boss reward.') + '</div>';
      if (run.perks.length) body += '<div class="line">UPGRADES // ' + escapeHtml(run.perks.map(function (perk) { return perk.title; }).join(' + ')) + '</div>';
      if (run.side_goal) body += '<div class="line ' + (run.side_goal.earned ? 'complete' : '') + '">SIDE OBJECTIVE // ' + escapeHtml(run.side_goal.title) + ' // ' + number(run.side_goal.progress) + '/' + number(run.side_goal.target) + (run.side_goal.earned ? ' // +' + number(run.side_goal.rank_points) + ' RANK INCLUDED' : '') + '</div><div class="line muted">' + escapeHtml(run.side_goal.detail) + ' Main contract must also succeed. Rank only; no extra XP.</div>';
      if (run.status === 'completed') body += '<div class="line complete">+' + number(run.rank_points) + ' RANK POINTS // ' + number(run.xp_awarded) + ' PET XP' + (run.reward_pending ? ' // BONUS DELIVERY PENDING' : '') + '</div>';
    }
    if (run && run.status === 'active') {
      if (run.field_result) body += '<div class="line muted" data-contract-field-result>LAST FIELD DECISION // AFTER ROOM ' + number(run.field_result.checkpoint) + ' // ' + escapeHtml(run.field_result.title) + ' // ' + escapeHtml(run.field_result.detail) + '</div>';
      if (run.field_encounter) body += '<div data-contract-field><div class="line signal">OPTIONAL FIELD ENCOUNTER // ' + escapeHtml(run.field_encounter.title) + '</div><div class="line muted">' + escapeHtml(run.field_encounter.detail) + ' Choose once at this checkpoint, leave, or take a route to skip. No room advance. Only contract HP, supplies and salvage change; spending them can reduce goal progress and final rank. No pet energy, items, currency or extra XP.</div><div class="button-grid">' + run.field_encounter.choices.map(function (choice) {
        return button(choice.title, 'contract_step', { pet_id: board.pet_id, contract_id: run.contract_id, revision: run.revision, choice: choice.key }, { disabled: Boolean(choice.disabled), detail: choice.detail });
      }).join('') + '</div></div>';
      if (run.path) body += '<div class="line complete">PATH // ' + escapeHtml(run.path.title) + ' // ' + number(run.path.remaining) + ' ROOMS LEFT</div><div class="line muted">' + escapeHtml(run.path.detail) + ' Effects are included below. Rest also uses a room of this path.</div>';
      if (run.path_choices && run.path_choices.length) body += '<div class="line signal">OPTIONAL CHECKPOINT PATH</div><div class="line muted">Plan the next two rooms. Choose once here, or take a route now to stay on course. No room advance or resource cost. Clear chances stay between 30% and 98%.</div><div class="button-grid">' + run.path_choices.map(function (choice) {
        return button(choice.title, 'contract_step', { pet_id: board.pet_id, contract_id: run.contract_id, revision: run.revision, choice: choice.key }, { detail: choice.detail });
      }).join('') + '</div>';
      if (run.preparation) body += '<div class="line complete">' + (run.preparation === 'prepare_scout' ? 'SCOUT AHEAD READY // This room’s route odds include the bonus.' : 'FIELD PATCH APPLIED // Route health restored.') + '</div>';
      if (run.preparations && run.preparations.length) body += '<div class="line signal">OPTIONAL ROOM PREPARATION</div><div class="line muted">Choose up to one before taking a route. You can skip preparation. Only contract resources are spent; no pet energy or currency.</div><div class="button-grid">' + run.preparations.map(function (choice) {
        return button(choice.title, 'contract_step', { pet_id: board.pet_id, contract_id: run.contract_id, revision: run.revision, choice: choice.key }, { disabled: Boolean(choice.disabled), detail: choice.detail });
      }).join('') + '</div>';
      body += '<div class="line"><strong>' + escapeHtml(run.room.title) + '</strong></div><div class="line muted">' + escapeHtml(run.room.detail) + '</div>' + (run.room.effect ? '<div class="line signal">' + escapeHtml(run.room.effect) + '</div><div class="line muted">Room effects are included below. pp means percentage points; clear chance is capped at 98%.</div>' : '') + '<div class="button-grid">' + run.choices.map(function (choice) {
        return button(choice.title, 'contract_step', { pet_id: board.pet_id, contract_id: run.contract_id, revision: run.revision, choice: choice.key }, { disabled: Boolean(choice.disabled), detail: (choice.upgrade ? 'DRAFT CHOICE // ' : choice.key === 'rest' ? 'RECOVER // ' : choice.odds + '% CLEAR // +' + choice.salvage + ' SALVAGE // FAILURE -' + choice.damage + ' HP // ') + choice.detail });
      }).join('') + '</div>';
      if (run.draft_actions && run.draft_actions.length) body += '<div class="line signal">OPTIONAL DRAFT REDRAW</div><div class="button-grid one">' + run.draft_actions.map(function (choice) {
        return button(choice.title, 'contract_step', { pet_id: board.pet_id, contract_id: run.contract_id, revision: run.revision, choice: choice.key }, { disabled: Boolean(choice.disabled), detail: choice.detail });
      }).join('') + '</div>';
      body += '<div class="button-grid one">' + button('ABANDON CONTRACT', 'contract_step', { pet_id: board.pet_id, contract_id: run.contract_id, revision: run.revision, choice: 'abandon' }, { danger: true, detail: 'Ends this contract with no points or XP. Closing the app instead preserves it.' }) + '</div>';
    } else {
      if (board.formats && board.formats.length) body += '<label class="line">ROUTE LENGTH <select id="contract-format" aria-label="Contract route length">' + board.formats.map(function (format) { return '<option value="' + escapeHtml(format.key) + '"' + (run && run.format === format.key ? ' selected' : '') + '>' + escapeHtml(format.title + ' // ' + format.rooms + ' ROOMS') + '</option>'; }).join('') + '</select></label>' + board.formats.map(function (format) { return '<div class="line muted">' + escapeHtml(format.title + ' // ' + format.detail) + '</div>'; }).join('');
      body += '<label class="line">BUILD <select id="contract-build" aria-label="Contract build">' + board.builds.map(function (build) { return '<option value="' + escapeHtml(build.key) + '"' + (run && run.build === build.key ? ' selected' : '') + '>' + escapeHtml(build.title + ' — ' + build.detail) + '</option>'; }).join('') + '</select></label><label class="line">DIFFICULTY <select id="contract-tier" aria-label="Contract difficulty">';
      for (var tier = 1; tier <= board.max_tier; tier++) body += '<option value="' + tier + '"' + (run && run.tier === tier ? ' selected' : '') + '>TIER ' + tier + ' — ' + tier + '× RANK POINTS</option>';
      body += '</select></label>';
      if (board.side_goals && board.side_goals.length) body += '<label class="line">OPTIONAL SIDE OBJECTIVE <select id="contract-side-goal" aria-label="Contract side objective">' + board.side_goals.map(function (goal) { return '<option value="' + escapeHtml(goal.key) + '"' + (run && run.side_goal && run.side_goal.key === goal.key ? ' selected' : '') + '>' + escapeHtml(goal.title + ' — ' + goal.detail) + '</option>'; }).join('') + '</select></label><div class="line muted">Complete both goals for +' + number(board.side_rank) + ' × tier extra Contract Rank. No extra XP or currency. Missing the side objective does not fail the main contract.</div>';
      if (run) body += '<div class="line muted">Your last route length, build, tier and side objective are selected. Keep them or change your next setup.</div>';
      body += '<div class="line muted">' + (board.max_tier < 3 ? number((board.max_tier === 1 ? 5 : 15) - board.completed) + ' MORE COMPLETIONS TO TIER ' + number(board.max_tier + 1) + '. ' : 'ALL DIFFICULTY TIERS UNLOCKED. ') + 'Choose your next quest. Each goal shows the target for both route lengths:</div><div class="button-grid">' + board.offers.map(function (offer) {
        var objectives = offer.objectives ? offer.objectives.map(function (goal) { return goal.format_title + ': ' + goal.detail; }).join(' // ') : offer.detail;
        return button(offer.title, 'contract_start', { pet_id: board.pet_id, sequence: board.next_sequence, goal: offer.key }, { detail: objectives + (offer.boss ? ' // FINAL BOSS: ' + offer.boss : '') + ' // ' + number(offer.completed) + ' COMPLETED // BEST ' + number(offer.best_rank_points) + ' RANK POINTS ACROSS FORMATS' });
      }).join('') + '</div>';
      if (board.collection) {
        if (board.collection.next_route) body += '<div class="button-grid one">' + contractSetupButton('CHOOSE AN UNCLEARED ROUTE', board.collection.next_route) + '</div>';
        body += '<details><summary class="line">VIEW ALL ROUTE RECORDS</summary>' + board.builds.map(function (build) {
          return '<div class="line signal">' + escapeHtml(build.title) + '</div><div class="button-grid">' + board.collection.records.filter(function (record) { return record.build === build.key; }).map(function (record) {
            return contractSetupButton(record.completed ? 'REPLAY ROUTE' : 'CHOOSE ROUTE', record);
          }).join('') + '</div>';
        }).join('') + '</details>';
      }
    }
    return panel('CONTINUING CONTRACTS // ALWAYS ANOTHER QUEST', body, 'contracts');
  }

  function contractSetupButton(label, record) {
    return '<button class="terminal-button" type="button" data-contract-setup="' + escapeHtml(JSON.stringify({ build: record.build, tier: record.tier, goal: record.goal, format: record.format || 'standard' })) + '"' + (record.unlocked ? '' : ' disabled') + '>' + escapeHtml(label) + '<span class="button-purpose">Choose this saved setup, then tap a quest to start. Selecting a setup spends nothing.</span><small>' + escapeHtml(record.title + ' // ' + record.build_title + ' // TIER ' + record.tier + ' // ' + (record.format_title || 'STANDARD ROUTE')) + '<br>' + (record.unlocked ? number(record.completed) + ' CLEARS // BEST ' + number(record.best_rank_points) + ' RANK' : 'LOCKED // COMPLETE ' + (record.tier === 2 ? '5' : '15') + ' CONTRACTS') + '</small></button>';
  }

  function renderDailyCompletion() {
    var bonus = state.guidance && state.guidance.daily_completion;
    if (!bonus || bonus.available === false) return panel('DAILY 7/7 BONUS', '<div class="line muted">Daily bonuses are temporarily unavailable. Your existing checklist remains playable.</div>', 'daily-completion');
    var body = '<div class="line">Complete all seven daily missions: up to ' + number(bonus.rewards.pet_xp) + ' Pet XP, ' + number(bonus.rewards.moon_gold) + ' Gold and ' + number(bonus.rewards.style_tokens) + ' Style.</div>' +
      '<div class="line muted">One bonus per account / UTC day. Earned progress stays complete after spending gold. Unclaimed bonuses stay saved. Pet XP uses your normal daily cap.</div>';
    body += '<div class="line ' + (bonus.claimed ? 'complete' : '') + '">' + (bonus.claimed ? 'TODAY’S BONUS CLAIMED' : bonus.ready ? 'TODAY // 7/7 COMPLETE' : 'TODAY // FINISH THE CHECKLIST BELOW') + '</div>';
    body += '<div class="button-grid one">' + (bonus.pending || []).map(function (claim) {
      var needsHatch = !claim.pet_id && (!state.lifecycle || state.lifecycle.phase === 'egg');
      return button('CLAIM 7/7 BONUS // ' + claim.utc_day, 'daily_completion_claim', { utc_day: claim.utc_day, pet_id: claim.pet_id || state.pet.pet_id }, {
        disabled: needsHatch, statusLabel: needsHatch ? 'HATCH REQUIRED' : '',
        detail: claim.pet_id ? 'Saved for the original claim pet. No new mission or energy cost.' : 'Pet XP goes to your selected hatched pet. The target is saved when you claim.',
      });
    }).join('') + '</div>';
    return panel('DAILY 7/7 BONUS', body, 'daily-completion');
  }

  function renderSeasonFinales() {
    var board = state.season_finales;
    if (!board) return '';
    if (board.available === false) return panel('SEASON FINALE', '<div class="line muted">Finale battles are temporarily unavailable. Your season progress is unchanged.</div>', 'season-finale');
    var body = '<div class="line muted">Saved battle. Free retries. Battle HP and kits are separate from pet resources.</div>';
    body += (board.pets || []).map(function (pet) {
      var payload = { pet_id: pet.pet_id, season_key: pet.season_key, competition_season_key: pet.competition_season_key, revision: pet.revision };
      var section = '<div class="line signal">' + escapeHtml(pet.competition_season_key) + ' // SLOT ' + number(pet.slot_number) + (state.pet.pet_id === pet.pet_id ? ' // SELECTED PET' : ' // SAVED PET') + '</div>';
      if (!pet.eligible && pet.status === 'not_started') return section + '<div class="line muted">LOCKED // Requires final evolution, ' + number(board.requirements.required_growth_marks) + ' daily Marks and ' + number(board.requirements.required_weekly_crests) + ' weekly Crests.</div>';
      if (pet.state) section += '<div class="line">ATTEMPT ' + number(pet.attempt) + ' // ROUND ' + number(pet.state.round) + ' // ' + escapeHtml(words(pet.state.build)) + '</div>' +
        meter('BATTLE HP', pet.state.health / pet.state.max_health * 100) + meter('BOSS HP', pet.state.boss_health / pet.state.boss_max_health * 100) +
        '<div class="line">YOU ' + number(pet.state.health) + '/' + number(pet.state.max_health) + ' // BOSS ' + number(pet.state.boss_health) + '/' + number(pet.state.boss_max_health) + ' // CHARGE ' + number(pet.state.charge) + ' // KITS ' + number(pet.state.supplies) + '</div><div class="line">' + escapeHtml(pet.state.last) + '</div>';
      if (pet.status === 'won') return section + '<div class="line complete">FINALE VICTOR // ACHIEVEMENT SAVED</div>' + (pet.claimed
        ? '<div class="line complete">VICTORY REWARD CLAIMED</div>'
        : '<div class="button-grid one">' + button('CLAIM FINALE REWARD', 'finale_claim', payload, { detail: 'Your victory is saved. Retry this claim without fighting again.' }) + '</div>');
      if (pet.playable === false) return section + '<div class="line muted">DELETED PET // SAVED BATTLE HISTORY. This pet cannot resume play.</div>';
      if (pet.status === 'active') return section + '<div class="combat-intent"><strong>NEXT // ' + escapeHtml(pet.intent.title) + (pet.intent.enraged ? ' // ENRAGED' : '') + '</strong><span>' + number(pet.intent.damage) + ' base incoming damage. ' + (pet.intent.multiplier > 1 ? 'Strike and Surge deal double damage this turn.' : 'Guard reduces damage and builds charge.') + '</span></div><div class="button-grid">' + pet.choices.map(function (choice) {
        return button(choice.title, 'finale_step', Object.assign({}, payload, { move: choice.key }), { disabled: choice.disabled, detail: choice.detail });
      }).join('') + '</div>';
      return section + '<div class="button-grid">' + board.builds.map(function (build) {
        return button((pet.status === 'failed' ? 'RETRY // ' : 'START // ') + build.title, pet.status === 'failed' ? 'finale_retry' : 'finale_start', Object.assign({}, payload, { build: build.key }), { detail: build.detail + ' No pet energy cost.' });
      }).join('') + '</div>';
    }).join('');
    body += '<div class="line muted">First victory: Finale Victor achievement, up to ' + number(board.reward.pet_xp) + ' Pet XP, ' + number(board.reward.moon_gold) + ' Gold and ' + number(board.reward.style_tokens) + ' Style. One reward per pet / competition quarter; normal daily XP cap. Earlier saved battles and unclaimed victories stay recoverable. This additional challenge preserves existing season-completion status. Completed owned pets can also enter.</div>';
    if (state.contracts && state.contracts.available) body += '<div class="button-grid one">' + routeButton('CONTINUE WITH CONTRACTS', { screen: 'missions', focus: 'contracts' }, 'Repeatable routes with rank and limited daily Pet XP bonuses.') + '</div>';
    return panel('SEASON FINALE // ' + board.title, body, 'season-finale');
  }

  function renderMissions() {
    var guidance = state.guidance || {};
    var missions = state.guidance && state.guidance.missions || [];
    var completedMissions = missions.filter(function (mission) { return mission.completed; }).length;
    var missionPercent = missions.length ? Math.round(completedMissions / missions.length * 100) : 0;
    var rows = missions.map(function (mission) {
      var steps = (mission.steps || []).map(function (step) { return (step.completed ? '[OK] ' : '[ ] ') + step.title; }).join(' // ');
      return '<div class="line ' + (mission.completed ? 'complete' : '') + '">' + (mission.completed ? '[OK] ' : '[  ] ') + escapeHtml(mission.title) + '</div>' + (mission.detail ? '<div class="line muted">' + escapeHtml(mission.detail) + '</div>' : '') + (steps ? '<div class="line muted">' + escapeHtml(steps) + '</div>' : '') + (mission.completed ? '' : objectiveRouteButton(mission.key));
    }).join('') || '<div class="line muted">NO MISSION DATA.</div>';
    var achievements = state.guidance && state.guidance.achievements || [];
    var unlockedCount = achievements.filter(function (entry) { return entry.unlocked_at; }).length;
    var achievementRows = achievements.map(function (entry) {
      return '<div class="line ' + (entry.unlocked_at ? 'complete' : '') + '">' + (entry.unlocked_at ? '[UNLOCKED] ' : '[LOCKED] ') + escapeHtml(entry.title) + ' ' + number(Math.min(entry.progress, entry.target)) + '/' + number(entry.target) + '</div><div class="line muted">' + escapeHtml(entry.description || '') + '</div>';
    }).join('');
    var progression = activePetProgression();
    var growth = progression.growth_marks || {};
    var dailyAuthority = state.daily_journey || {};
    var dailyJourney = dailyJourneyMarkup(dailyAuthority, completedMissions, guidance, growth, state);
    var weeklyCapability = state.capabilities && state.capabilities.weekly_journey || {};
    var weeklyAuthority = state.weekly_journey || {};
    var lifecyclePhase = String(state && state.lifecycle && state.lifecycle.phase || '').toLowerCase();
    var eggJourneyLocked = lifecyclePhase === 'egg';
    var weeklyState = String(weeklyAuthority.state || weeklyCapability.state || 'LOCKED').toUpperCase();
    var weeklyTitle = eggJourneyLocked
      ? 'WEEKLY JOURNEY // HATCH REQUIRED'
      : weeklyState === 'AVAILABLE'
      ? 'WEEKLY JOURNEY // LIVE'
      : 'WEEKLY JOURNEY // SYNCING';
    var weeklyJourney = weeklyJourneyMarkup(weeklyAuthority, weeklyCapability, state);
    return activePetSummary() +
      renderPlayNow() +
      renderContracts() +
      panel('DAILY JOURNEY // GROWTH MARK', dailyJourney, 'daily-journey') +
      panel('OFFICIAL DAILY OBJECTIVES', dailyObjectiveMarkup(), 'daily-objectives') +
      panel(weeklyTitle, weeklyJourney, 'weekly-journey') +
      renderDailyCompletion() +
      panel('DAILY MISSION BUFFER // ' + number(completedMissions) + '/' + number(missions.length), '<div class="line muted">NEXT // ' + escapeHtml(dailyJourneyNextAction(dailyAuthority, completedMissions, guidance, state)) + '</div><div class="line muted">DAY ' + escapeHtml(guidance.day_key || 'UTC') + ' // WEEK ' + escapeHtml(guidance.week_key || 'UTC') + '</div>' + meter('DAILY CLEAR', missionPercent) + rows, 'missions') +
      renderSeasonFinales() +
      panel('ACHIEVEMENT ARCHIVE // ' + number(unlockedCount) + '/' + number(achievements.length), achievementRows || '<div class="line muted">EMPTY ARCHIVE.</div>', 'achievements');
  }

  function renderExplore() {
    var savedEvents = (state.pending_street_events || []).map(function (entry) {
      return entry.recoverable ? button('RECOVER SAVED EVENT', 'event_recover', { event_id: entry.event_id }, { detail: 'Recovers the original outcome for the pet that started it.' })
        : '<div class="line muted">SAVED EVENT NEEDS REVIEW // Its original outcome could not be verified. Your saved history is preserved.</div>'
          + (entry.close_available ? button('CLOSE OLD EVENT', 'event_close', { event_id: entry.event_id }, { danger: true,
            detail: 'Closes this unverified event without claiming a reward. History, balances and the old reward slot are kept.' }) : '');
    }).join('');
    var firstSessionExplore = firstSessionExploreMarkup();
    if (firstSessionExplore) return renderPlayNow() + firstSessionExplore
      + (savedEvents ? panel('SAVED STREET EVENTS', savedEvents, 'saved-street-events') : '');
    var guidance = state.guidance || {};
    var encounter = state.encounter;
    var eventButtons = encounter ? encounter.choices.map(function (choice) {
      return button(choice.label, 'random_event', { choice: choice.key, challenge_token: encounter.challenge_token }, { disabled: choice.preview && choice.preview.available === false, resourceRequired: choice.preview && choice.preview.available === false, detail: choice.preview && choice.preview.detail || '' });
    }).join('') : '';
    var adventure = state.adventure;
    var adventureButtons = adventure ? adventure.choices.map(function (choice) {
      return button(choice.label, 'adventure', { adventure_key: choice.key, challenge_token: adventure.challenge_token }, { disabled: adventure.available === false || choice.preview && choice.preview.available === false, resourceRequired: choice.preview && choice.preview.available === false, cooldown: adventure.cooldown, detail: (adventure.minimum_energy ? 'ENTRY REQUIRES ' + number(adventure.minimum_energy) + ' ENERGY // ' : '') + (choice.preview && choice.preview.detail || '') });
    }).join('') : '';
    var boss = guidance.weekly_boss || {};
    var run = state.run;
    var runBody;
    if (run) {
      var runRoom = run.room || {};
      var playableRun = playOptionsReady() ? window.MoonpetPlayOptions.runAvailability(state) : { step: false, extract: false };
      var opponent = runRoom.opponent || {};
      var unbankedSummary = number(run.unbanked_pet_xp) + ' XP // ' + number(run.unbanked_moon_gold) + ' GOLD // ' + number(run.unbanked_moon_crystals) + ' GEMS // ' + number(run.unbanked_style_tokens) + ' STYLE';
      var roomBrief = '<div class="run-brief"><div class="line complete">ROOM SIGNAL // ' + escapeHtml(words(runRoom.title || run.checkpoint || 'street')) + '</div>' +
        (runRoom.description ? '<div class="line">' + escapeHtml(runRoom.description) + '</div>' : '') +
        (runRoom.objective ? '<div class="line muted">OBJECTIVE // ' + escapeHtml(runRoom.objective) + '</div>' : '') +
        (opponent.name ? '<div class="run-opponent"><strong>' + escapeHtml(opponent.name) + '</strong> // ' + escapeHtml(words(opponent.role || 'enemy')) + ' // THREAT ' + number(runRoom.threat) + '/5' + (opponent.intro ? '<small>' + escapeHtml(opponent.intro) + '</small>' : '') + '</div>' : '') +
        meter('THREAT', number(runRoom.threat) * 20) + '</div>';
      var runDecisionButtons = (run.choices || []).map(function (choice) {
        return button(choice.label, 'run_step', { run_id: run.run_id, choice_key: choice.key, expected_step_index: run.expected_step_index }, { disabled: !playableRun.step || choice.available === false, resourceRequired: run.source_available !== false && (!playableRun.step || choice.available === false), detail: !playableRun.step ? run.source_available === false ? 'Saved run pet unavailable.' : 'Your original run pet needs energy before another room. Recover that pet, or extract if a room is already cleared.' : choice.detail || words(choice.type) });
      }).join('');
      var tactical = run.tactics || {};
      var tacticCopy = (tactical.conditions || []).concat(tactical.selected || []).map(function (item) {
        return '<div class="line signal">' + escapeHtml(item.title) + '</div><div class="line muted">' + escapeHtml(item.detail) + '</div>';
      }).join('');
      if (tactical.rules_version === 1) tacticCopy += '<div class="line muted">This saved run uses earlier rules. Checkpoint tactics begin with your next official attempt.</div>';
      if (tactical.offers && tactical.offers.length) tacticCopy += '<div class="line complete">CHECKPOINT TACTIC // CHOOSE ONE</div><div class="line muted">Applies to the remaining rooms. Choices stack at rooms 3 and 6. Run score only: no extra XP, currency or drops. You may continue without a tactic; the offer then expires.</div><div class="button-grid">' + tactical.offers.map(function (offer) {
        return button(offer.title, 'daily_run_tactic', { run_id: run.run_id, checkpoint: tactical.checkpoint, tactic_id: offer.key }, { detail: offer.detail });
      }).join('') + '</div>';
      var runPetCopy = run.source_pet && !run.source_pet.active ? '<div class="line signal">RUN BELONGS TO ' + escapeHtml(run.source_pet.callsign || 'YOUR ORIGINAL RUN PET') + ' // ENERGY ' + number(run.source_pet.energy) + '</div><div class="line muted">Choices and rewards use this saved pet, even while another pet is selected.</div>' : '';
      if (run.source_available === false) runPetCopy = '<div class="line locked">This saved run has no available source pet. Contact support to recover it. Other game panels remain available.</div>';
      else if (run.settlement_pending) runPetCopy += '<div class="line complete">FINAL BOSS ROOM SAVED</div><div class="line muted">Reward delivery or completion is pending. Refresh or finish below to retry the saved result without another fight.</div>';
      else if (!playOptionsReady()) runPetCopy += '<div class="line locked">Your run is saved. Run controls are unavailable. Tap Refresh to retry loading them.</div>';
      else if (!playableRun.step) runPetCopy += '<div class="line locked">Your original run pet has no energy for another room. ' + (playableRun.extract ? 'Extract below to bank this run, or recover that pet first.' : 'Recover that pet to continue. Contracts remain available while you wait.') + '</div>';
      runBody = '<div class="line complete">' + (run.daily ? 'OFFICIAL DAILY MOON RUN' : 'ENDLESS MOON RUN // DISTRICT TIER ' + number(run.difficulty)) + '</div><div class="line">ROOM ' + number(run.settlement_pending ? run.max_room : Number(run.current_room != null ? run.current_room : run.depth || 0) + 1) + '/' + number(run.max_room || run.max_depth) + ' // SCORE ' + number(run.score) + (run.daily ? '' : ' // NEXT CHECKPOINT ' + number(run.next_checkpoint)) + '</div>' +
        runPetCopy + roomBrief + tacticCopy +
        (run.settlement_pending ? '<div class="run-stakes"><strong>FINAL RESULT SAVED</strong> <span>Finish delivery of the saved boss reward and completion. No second fight, extra room or new daily attempt.</span></div>' : run.daily ? '<div class="run-stakes"><strong>ONE OFFICIAL ATTEMPT / UTC DAY</strong><span>Choices change run score and clear chance; they do not buy items, heal or spend pet currency. Room progress counts toward Daily Journey. Extraction ends this attempt; it does not bank the endless-run XP bag. Boss drops settle separately through the server.</span></div>' : '<div class="run-stakes"><strong>UNBANKED // ' + escapeHtml(unbankedSummary) + '</strong><span>EXTRACT TO SECURE IT. A FAILED ROOM LOSES THE BAG.</span></div>') +
        '<div class="button-grid run-decisions">' + runDecisionButtons +
        button(run.settlement_pending ? 'FINISH SAVED DAILY RUN' : run.daily ? 'EXTRACT DAILY RUN' : 'EXTRACT & BANK', 'run_extract', { run_id: run.run_id }, { disabled: !playableRun.extract, danger: !run.settlement_pending, detail: run.settlement_pending ? 'Retry saved boss rewards and completion. No new attempt or room.' : run.source_available === false ? 'Saved run pet unavailable.' : !playableRun.extract ? 'Clear one room before extracting.' : run.daily ? 'End the official attempt. You cannot restart it today.' : 'END RUN AND SECURE ' + unbankedSummary }) + '</div>';
    } else {
      var dailyRun = state.daily_run || {};
      var dailyUsed = dailyRun.attempted === true;
      runBody = '<div class="line">NO ACTIVE RUN.</div>' + (!playOptionsReady() ? '<div class="line locked">Run controls unavailable. Tap Refresh to retry.</div>' : '') + '<div class="button-grid">' + button('START MOON RUN', 'run_start', {}, { disabled: Number(state.pet && state.pet.energy) < 12, resourceRequired: Number(state.pet && state.pet.energy) < 12, detail: '12 energy required to enter. Repeatable; rewards capped.' }) + button('DAILY RUN', 'daily_run_start', {}, { disabled: dailyRun.available !== true, statusLabel: dailyUsed ? 'ATTEMPT USED' : dailyRun.available ? '' : 'UNAVAILABLE', cooldown: dailyUsed ? dailyRun.cooldown : null, detail: dailyUsed ? words(dailyRun.status) + ' // Depth ' + number(dailyRun.depth) + ' // Score ' + number(dailyRun.score) : 'One official attempt per account / UTC day.' }) + '</div>';
    }
    var arena = state.arena;
    var arenaQueue = state.arena_queue;
    var arenaResult = state.arena_result;
    var arenaBody;
    if (!hasSystemUnlocked('arena')) {
      var arenaLock = combatLockCopy(systemCapability(state, 'arena').reason);
      var arenaEntryOptions = combatLockedButtonOptions(arenaLock.entryDetail);
      var arenaCleanup = arena
        ? button('FORFEIT MATCH', 'arena_forfeit', { battle_id: arena.battle_id }, { danger: true })
        : arenaQueue ? button('CANCEL QUEUE', 'arena_queue_cancel', {}, { danger: true }) : '';
      arenaBody = '<div class="line locked">' + escapeHtml(arenaLock.title) + '</div><div class="line muted">' + escapeHtml(arenaLock.detail) + '</div>' +
        (arenaCleanup ? '<div class="line muted">STALE ARENA STATE DETECTED. CLEANUP IS AVAILABLE.</div>' : '') +
        '<div class="button-grid">' + arenaCleanup + button('FIND PLAYER BATTLE', 'arena_matchmake', {}, arenaEntryOptions) + button('ENTER SOLO ARENA', 'arena_start', {}, arenaEntryOptions) + '</div>';
    } else {
      if (arena) {
        var specialCost = number(arena.special_cost || 3);
        var arenaHeader = '<div class="combat-intel"><div class="line complete">' + escapeHtml(arena.mode === 'multiplayer' ? 'PLAYER VS PLAYER' : 'PLAYER VS CRT') + ' // ' + escapeHtml(arena.opponent && arena.opponent.pet_name || 'RIVAL') + '</div><div class="line">ROUND ' + number(arena.current_round) + '/' + number(arena.max_rounds) + ' // HP ' + number(arena.player_hp) + ' : ' + number(arena.opponent_hp) + '</div><div class="line signal">SPECIAL ' + number(arena.player_special) + '/' + specialCost + (number(arena.player_special) >= specialCost ? ' // READY' : ' // BUILD CHARGE') + '</div></div>';
        var intent = arena.opponent_intent
          ? '<div class="combat-intent"><strong>CRT TELEGRAPH // ' + escapeHtml(arena.opponent_intent.label) + '</strong><span>' + escapeHtml(arena.opponent_intent.detail) + '</span></div>'
          : arena.mode === 'multiplayer' && arena.status === 'active'
            ? '<div class="combat-intent is-hidden"><strong>RIVAL INTENT // HIDDEN</strong><span>PvP choices stay sealed until both players lock.</span></div>'
            : '';
        var recap = arena.last_round
          ? '<div class="combat-recap"><strong>ROUND ' + number(arena.last_round.round) + ' RECAP</strong><span>YOU // ' + escapeHtml(arena.last_round.player_log || words(arena.last_round.player_move)) + '</span><span>RIVAL // ' + escapeHtml(arena.last_round.opponent_log || words(arena.last_round.opponent_move)) + '</span></div>'
          : '';
        var arenaMoves = (arena.moves || []).map(function (move) {
          var stats = move.base_damage ? number(move.accuracy) + '% BASE ACC // ' + number(move.base_damage) + ' BASE DMG' : escapeHtml(words(move.role));
          var counter = move.counter_label ? ' // COUNTER ' + escapeHtml(move.counter_label) : '';
          var lock = move.available ? '' : ' // NEED ' + number(move.requirement) + ' CHARGE';
          return button(move.label, 'arena_move', { battle_id: arena.battle_id, expected_round: arena.current_round, move: move.key }, {
            disabled: !move.available,
            detail: stats + counter + lock + ' // ' + move.detail,
          });
        }).join('');
        arenaBody = arenaHeader + intent + recap + (arena.status === 'readying'
          ? '<div class="line muted">' + (arena.ready ? 'YOU ARE READY. WAITING FOR RIVAL.' : 'MATCH FOUND. LOCK IN WHEN READY.') + '</div><div class="button-grid">' + button('READY', 'arena_ready', { battle_id: arena.battle_id }, { disabled: arena.ready, statusLabel: arena.ready ? 'READY' : '' }) + button('FORFEIT MATCH', 'arena_forfeit', { battle_id: arena.battle_id }, { danger: true }) + '</div>'
          : (arena.own_move_locked ? '<div class="line signal">YOUR MOVE LOCKED. ' + (arena.mode === 'multiplayer' ? 'WAITING FOR RIVAL.' : 'WAITING FOR ROUND RESOLUTION.') + '</div>' : '<div class="button-grid arena-decisions">' + arenaMoves + '</div>') + '<div class="button-grid one">' + button('FORFEIT BATTLE', 'arena_forfeit', { battle_id: arena.battle_id }, { danger: true }) + '</div>');
      } else if (arenaQueue) {
        arenaBody = '<div class="line">MATCHMAKING QUEUE // POSITION ' + number(arenaQueue.position) + ' // ' + escapeHtml(words(arenaQueue.rank_bucket)) + '</div><div class="button-grid">' +
          button('ACCEPT ANY RANK', 'arena_matchmake', { accept_any_rank: true }, { disabled: arenaQueue.accept_any_rank, statusLabel: arenaQueue.accept_any_rank ? 'CURRENT' : '' }) + button('CANCEL QUEUE', 'arena_queue_cancel', {}, { danger: true }) + '</div>';
      } else {
        arenaBody = (arenaResult ? '<div class="line complete">LAST RESULT // ' + escapeHtml(words(arenaResult.outcome || arenaResult.result)) + ' // ' + escapeHtml(arenaResult.opponent && arenaResult.opponent.pet_name || 'RIVAL') + '</div>' : '') + '<div class="line muted">RANKED PLAYER MATCHMAKING OR SOLO BATTLES.</div><div class="button-grid">' + button('FIND PLAYER BATTLE', 'arena_matchmake') + button('ENTER SOLO ARENA', 'arena_start') + '</div>';
      }
    }
    var kaiju = state.kaiju || {};
    var kaijuMatch = kaiju.match;
    var kaijuQueue = kaiju.queue;
    var kaijuBody;
    if (!hasSystemUnlocked('kaiju')) {
      var kaijuLock = combatLockCopy(systemCapability(state, 'kaiju').reason);
      var kaijuEntryOptions = combatLockedButtonOptions(kaijuLock.entryDetail);
      var kaijuSoloCleanup = kaijuMatch && kaijuMatch.mode !== 'group' && !kaijuMatch.player2_telegram_id;
      var kaijuCleanup = kaijuSoloCleanup
        ? button('CANCEL MATCH', 'kaiju_match_cancel', { match_id: kaijuMatch.match_id }, { danger: true })
        : kaijuQueue ? button('CANCEL QUEUE', 'kaiju_queue_cancel', {}, { danger: true }) : '';
      kaijuBody = '<div class="line locked">' + escapeHtml(kaijuLock.title) + '</div><div class="line muted">' + escapeHtml(kaijuLock.detail) + '</div>' +
        (kaijuCleanup ? '<div class="line muted">STALE KAIJU STATE DETECTED. CLEANUP IS AVAILABLE.</div>' : '') +
        (kaijuMatch && !kaijuSoloCleanup ? '<div class="line muted">MULTIPLAYER MATCH CLEANUP USES NORMAL EXPIRY / FORFEIT RESOLUTION.</div>' : '') +
        '<div class="button-grid">' + kaijuCleanup + button('FIND KAIJU PLAYER', 'kaiju_matchmake', {}, kaijuEntryOptions) + button('START SOLO KAIJU', 'kaiju_start', {}, kaijuEntryOptions) + '</div>';
    } else {
      kaijuBody = kaijuMatch
        ? '<div class="combat-intel"><div class="line">' + escapeHtml(kaijuMatch.mode === 'group' ? 'PLAYER VS PLAYER' : 'PLAYER VS CRT') + ' // TABLE ' + escapeHtml(kaijuMatch.match_id) + '</div><div class="line signal">BATTLE CATEGORY // ' + escapeHtml(kaijuMatch.category ? kaijuMatch.category.name + ' [' + kaijuMatch.category.label + ']' : 'ARMING') + '</div><div class="line muted">PICK THE CARD WITH THE STRONGEST ACTIVE CATEGORY. THE RIVAL CARD STAYS SEALED.</div></div><div class="line muted">' + (kaijuMatch.own_card_locked ? 'YOUR CARD LOCKED. ' : 'SELECT A CODE CARD. ') + (kaijuMatch.opponent_card_locked ? 'RIVAL LOCKED.' : 'WAITING ON RIVAL.') + '</div>' + (kaijuMatch.own_card_locked ? '' : '<div class="button-grid kaiju-decisions">' + (kaiju.cards || []).map(function (card) {
          var leaders = (card.strongest || []).map(function (entry) { return entry.label + ' ' + entry.value; }).join(' // ');
          var active = card.active_stat ? card.active_stat + ' ' + number(card.active_value) : 'CATEGORY PENDING';
          return button(card.name + (card.active_value != null ? ' // ' + number(card.active_value) : ''), 'kaiju_card', { match_id: kaijuMatch.match_id, card_key: card.id }, { detail: 'ACTIVE ' + active + ' // BEST ' + leaders });
        }).join('') + '</div>')
        : kaijuQueue
          ? '<div class="line">KAIJU MATCHMAKING // POSITION ' + number(kaijuQueue.position) + '</div><div class="button-grid one">' + button('CANCEL QUEUE', 'kaiju_queue_cancel', {}, { danger: true }) + '</div>'
          : (kaiju.result ? '<div class="combat-recap"><strong>LAST KAIJU RESULT // ' + escapeHtml(words(kaiju.result.outcome || kaiju.result.result)) + '</strong><span>CATEGORY // ' + escapeHtml(kaiju.result.category ? kaiju.result.category.name : words(kaiju.result.category_key)) + '</span>' + (kaiju.result.score ? '<span>SCORE // ' + number(kaiju.result.score.player) + ' : ' + number(kaiju.result.score.opponent) + '</span>' : '') + '</div>' : '') + '<div class="line">PLAYER MATCHMAKING OR SOLO CRT BATTLES.</div><div class="button-grid">' + button('FIND KAIJU PLAYER', 'kaiju_matchmake') + button('START SOLO KAIJU', 'kaiju_start') + '</div>';
    }
    var regions = (state.regions || []).map(function (region) {
      var mission = region.mission || {};
      var opponent = mission.opponent || {};
      var decisions = (mission.choices || []).map(function (choice) {
        return button(choice.label, 'district_mission', { region_key: region.key, approach_key: choice.key }, {
          disabled: !region.available || Number(state.pet.energy) < 10,
          detail: (region.settling ? 'SETTLEMENT IN PROGRESS // ' : '') + '10 ENERGY // ' + number(choice.success_percent) + '% CLEAR // +' + number(choice.mastery_success) + ' MASTERY // ' + number(Math.round(Number(choice.reward_multiplier) * 100)) + '% REWARD // ' + choice.detail,
        });
      }).join('');
      if (region.pending_choice_key) decisions = button('RESUME SAVED DISTRICT CHOICE', 'district_mission', { region_key: region.key, approach_key: region.pending_choice_key }, { disabled: !region.available || !region.retry_energy_charged && Number(state.pet.energy) < 10, detail: region.retry_energy_charged ? 'Energy already paid. Resume the original decision and reward.' : '10 energy. Resume the original decision.' });
      var brief = mission.title
        ? '<div class="district-mission"><div class="line signal"><strong>' + escapeHtml(mission.title) + '</strong> // THREAT ' + number(mission.threat) + '/5' + (mission.boss ? ' // BOSS CHECKPOINT' : '') + '</div><div class="line">' + escapeHtml(mission.intro) + '</div><div class="line muted">OBJECTIVE // ' + escapeHtml(mission.objective) + '</div>' + (mission.material_reward ? '<div class="line muted">MATERIAL ON CLEAR // ' + escapeHtml(words(mission.material_reward)) + ' // 1 on a clear, 3 when a boss checkpoint is defeated. Setbacks give none; reward caps apply.</div>' : '') + (opponent.name ? '<div class="run-opponent"><strong>' + escapeHtml(opponent.name) + '</strong> // ' + escapeHtml(words(opponent.role)) + '<small>' + escapeHtml(opponent.intro || '') + '</small></div>' : '') + '</div>'
        : '';
      return '<div class="region-entry ' + (region.playable ? 'complete' : 'locked') + '"><div class="line"><strong>' + escapeHtml(region.title) + '</strong> // ' + escapeHtml(region.used_today ? 'COMPLETE TODAY' : region.playable ? 'ONLINE' : region.status.toUpperCase()) + '</div><div class="line muted">' + escapeHtml(region.strapline) + '</div><div class="line">' + escapeHtml(region.lore) + '</div><div class="line">MASTERY ' + number(region.mastery_xp) + ' // BOSS: ' + escapeHtml(words(region.boss)) + ' // FOCUS: ' + escapeHtml(region.focus.map(words).join(' + ')) + '</div>' + brief + (region.lock_reason ? '<div class="line locked">LOCK: ' + escapeHtml(region.lock_reason) + '</div>' : region.used_today ? '<div class="line complete">DISTRICT PLAY COMPLETE TODAY // RESET ' + countdownMarkup(region.cooldown, 'in ') + '</div>' : '<div class="button-grid district-decisions">' + decisions + '</div>') + '</div>';
    }).join('');
    var live = state.live_systems || {};
    var chains = (live.chains || []).map(function (chain) {
      var scene = chain.scene || {};
      var decisions = (scene.choices || []).map(function (choice) {
        var bonus = valueText(choice.reward_bonus);
        return button(choice.label, 'event_chain', { chain_key: chain.key, choice_key: choice.key }, { disabled: !chain.available, detail: (chain.settling ? 'SETTLEMENT IN PROGRESS // ' : '') + choice.detail + (bonus === 'FREE' ? '' : ' // BONUS ' + bonus) });
      }).join('');
      if (chain.pending_choice_key) decisions = button('RESUME SAVED STORY CHOICE', 'event_chain', { chain_key: chain.key, choice_key: chain.pending_choice_key }, { disabled: !chain.available, detail: 'Finish the original choice. Its reward cannot be duplicated.' });
      return '<div class="story-scene"><div class="line signal"><strong>' + escapeHtml(chain.title || words(chain.key)) + '</strong> // STEP ' + number(chain.step_index + 1) + '/' + number(chain.steps.length) + '</div><div class="line"><strong>' + escapeHtml(scene.title || words(chain.current_step)) + '</strong></div><div class="line">' + escapeHtml(scene.intro || '') + '</div><div class="line muted">OBJECTIVE // ' + escapeHtml(scene.objective || '') + '</div>' + (chain.used_today ? '<div class="line complete">STORY CHOICE LOCKED IN TODAY // RESET ' + countdownMarkup(chain.cooldown, 'in ') + '</div>' : '<div class="button-grid story-decisions">' + decisions + '</div>') + '</div>';
    }).join('');
    var seasonal = live.seasonal_boss || {};
    var seasonalDefeated = Boolean(seasonal.defeated_at);
    var seasonalStatusLabel = seasonalDefeated ? 'DEFEATED' : seasonal.attempted_today ? 'USED TODAY' : '';
    var raidChoices = seasonal.choices || [{ key: 'strike', label: 'STEADY STRIKE', energy: 18, chance: 100, detail: 'Original raid attack.' }];
    var raidButtons = raidChoices.filter(function (choice) { return !seasonal.pending_move || choice.key === seasonal.pending_move; }).map(function (choice) {
      var paid = seasonal.pending_move && seasonal.retry_energy_charged;
      var detail = seasonal.pending_move ? 'Resume the original attack. ' + (paid ? 'Energy already paid.' : number(choice.energy) + ' energy.') : number(choice.energy) + ' ENERGY // ' + (choice.damage != null ? number(choice.chance) + '%: ' + number(choice.damage) + ' DAMAGE' + (choice.chance < 100 ? ' // SETBACK: ' + number(choice.setback_damage) + ' DAMAGE' : '') + ' // ' : '') + choice.detail;
      if (seasonal.settling) detail = 'SETTLEMENT IN PROGRESS // ' + detail;
      if (Number(state.pet.level) < Number(seasonal.min_level)) detail = 'REQUIRES LEVEL ' + number(seasonal.min_level) + ' // ' + detail;
      return button(seasonal.pending_move ? 'RESUME SAVED RAID ATTACK' : choice.label, 'seasonal_boss', { pet_id: state.pet.pet_id, move: choice.key }, { disabled: !seasonal.available || !paid && Number(state.pet.energy) < choice.energy, statusLabel: seasonalStatusLabel, cooldown: seasonalDefeated ? null : seasonal.cooldown, detail: detail });
    }).join('');
    var raidClaims = savedRaidButtons(seasonal);
    var seasonalBody = '<div class="line">' + escapeHtml(words(seasonal.title || 'offline')) + ' // ' + number(seasonal.damage) + '/' + number(seasonal.hp) + ' DAMAGE // PHASE ' + number(seasonal.phase || 1) + '/' + number(seasonal.phases) + '</div><div class="line muted">WEAKNESS ' + escapeHtml(words(seasonal.weakness)) + ' // REWARD ' + escapeHtml(words(seasonal.reward)) + '</div><div class="line muted">One attack per pet / UTC day. Counter attacks change this hit’s damage; they do not apply ongoing Arena status effects.</div><div class="button-grid">' + raidButtons + raidClaims + '</div>';
    var bossReward = valueText(boss.reward);
    var participationChallenge = boss.defeated && !boss.participation_completed;
    var bossStatusLabel = participationChallenge ? (Number(state.pet.level) < 5 ? 'LEVEL 5 REQUIRED' : Number(state.pet.energy) < 12 ? '12 ENERGY REQUIRED' : '') : boss.defeated ? 'DEFEATED' : boss.attempt_used ? 'USED TODAY' : Number(state.pet.level) < 5 ? 'LEVEL 5 REQUIRED' : Number(state.pet.energy) < 12 ? '12 ENERGY REQUIRED' : '';
    var weeklyChoices = (boss.choices || ['strike', 'outsmart', 'endure'].map(function (key) { return { key: key, title: key.toUpperCase(), energy: 12 }; })).map(function (choice) {
      var detail = number(choice.energy) + ' ENERGY';
      if (choice.minimum_damage != null) detail += ' // ' + number(choice.minimum_damage) + '–' + number(choice.maximum_damage) + (participationChallenge ? ' CHALLENGE SCORE' : ' DAMAGE') + (choice.weakness_bonus ? ' // WEAKNESS +' + number(choice.weakness_bonus) + ' INCLUDED' : '') + (choice.personality_bonus ? ' // PERSONALITY +' + number(choice.personality_bonus) + ' INCLUDED' : '');
      if (participationChallenge) detail += ' // THIS PET’S WEEKLY JOURNEY ATTEMPT ONLY. NO EXTRA VICTORY PAYOUT.';
      return button((participationChallenge ? 'CHALLENGE // ' : '') + choice.title, 'weekly_boss', { move: choice.key, pet_id: state.pet.pet_id }, { disabled: !boss.available, statusLabel: bossStatusLabel, cooldown: boss.defeated ? null : boss.cooldown, detail: detail });
    }).join('');
    var weeklyClaims = savedWeeklyBossButtons(boss);
    var bossBody = '<div class="line">' + (participationChallenge ? 'TARGET DEFEATED. COMPLETE THIS PET’S PARTICIPATION CHALLENGE.' : boss.defeated ? 'TARGET DEFEATED. THIS PET’S ATTEMPT IS RECORDED.' : boss.attempt_used ? 'DAILY ATTEMPT USED.' : 'SELECT AN ATTACK ROUTINE.') + '</div>' +
      (weeklyClaims ? '<div class="button-grid one">' + weeklyClaims + '</div>' : '') +
      (boss.recovery_history || []).map(function (entry) {
        return '<div class="line signal">EARLIER VICTORY RECOVERED // ' + escapeHtml(entry.week_key) + '</div><div class="line muted">The original equipment bonuses could not be verified. Base progress is recovered; current equipment was not used.</div>';
      }).join('') +
      '<div class="line muted">HP ' + number(boss.remaining_hp) + '/' + number(boss.hp) + ' // DAMAGE ' + number(boss.damage) + ' // ATTEMPTS ' + number(boss.attempts) + '/' + number(boss.max_attempts || 7) + '</div>' +
      '<div class="line muted">WEAKNESS ' + escapeHtml(words(boss.weakness || 'unknown')) + ' // REWARD ' + escapeHtml(bossReward) + '</div>' +
      '<div class="line muted">Level 5 after hatching. All moves cost 12 energy and share one account attempt per UTC day. Damage ranges include the listed bonuses; Endure does not heal or apply a defensive buff.</div>' +
      '<div class="line muted">After the shared victory, a pet missing its own attempt this Journey week can choose a 12-energy participation challenge. This records only its weekly attempt, with no extra victory reward or boss-win credit. Other Crest requirements still apply.</div>' +
      '<div class="button-grid one">' + weeklyChoices + '</div>' +
      (boss.last_attempt ? '<div class="line complete">TODAY’S SAVED ATTACK // ' + escapeHtml(words(boss.last_attempt.action)) + ' // ' + number(boss.last_attempt.damage) + ' DAMAGE</div>' : '') +
      (boss.defeated ? '<div class="line">' + (boss.reward_claimed ? 'VICTORY REWARD COLLECTED.' : 'VICTORY RECORDED. CHECK SAVED REWARDS.') + '</div>' : '') +
      (boss.rotation_cooldown ? '<div class="line muted">NEXT WEEKLY BOSS ' + countdownMarkup(boss.rotation_cooldown, 'in ') + '</div>' : '') +
      '<div class="button-grid">' + (state.contracts && state.contracts.available ? routeButton('CONTINUE WITH CONTRACTS', { screen: 'missions', focus: 'contracts' }, 'Saved quests without pet energy costs or cooldowns.') : '') + '</div>';
    return renderPlayNow() + panel('DISTRICT NETWORK', '<div class="line muted">NEXT // ' + escapeHtml(exploreNextLine()) + '</div>' + regions, 'districts') + panel('MOON RUN', '<div class="line muted">NEXT // ' + escapeHtml(exploreNextLine()) + '</div>' + runBody, 'moon-run') +
      panel(adventure ? adventure.title : 'PET ADVENTURE', '<div class="line">' + escapeHtml(adventure ? adventure.intro : 'NO ADVENTURE SIGNAL.') + '</div><div class="line muted">One adventure every 30 minutes. Entry energy is a requirement; actual costs depend on the outcome below. Base rewards remain subject to caps. Hunger costs increase hunger.</div><div class="button-grid">' + adventureButtons + '</div>', 'adventure') +
      panel(encounter ? encounter.title : 'STREET EVENT', '<div class="line">' + escapeHtml(encounter ? encounter.intro : 'NO EVENT SIGNAL.') + '</div><div class="line muted">Compare both outcomes before choosing. Base rewards are reduced by repeated-play scaling and daily caps; stat changes stop at their limits. Hunger costs increase hunger.</div><div class="button-grid">' + eventButtons + '</div><div class="button-grid one">' + savedEvents + '</div>', 'street-event') +
      panel('WEEKLY BOSS // ' + (boss.title || 'LOCKED'), '<div class="line muted">NEXT // ' + escapeHtml(exploreNextLine()) + '</div>' + bossBody, 'weekly-boss') +
      panel('STREET STORY CHAINS', chains || '<div class="line muted">NO CHAIN SIGNAL.</div>', 'story-chains') + panel('SEASONAL RAID', seasonalBody, 'seasonal-boss') +
      panel('PET ARENA', arenaBody, 'arena') + panel('KAIJU CODE CARDS', kaijuBody, 'kaiju');
  }

  function renderWork() {
    var guidance = state.guidance || {};
    var jobs = guidance.jobs || state.jobs || [];
    var jobsHtml = jobs.map(function (job) {
      var specialistGate = job.required_track ? ' // ' + words(job.required_track).toUpperCase() + ' ' + number(job.current_xp) + '/' + number(job.required_xp) : '';
      var jobRewards = valueText({ pet_xp: job.pet_xp, moon_gold: job.moon_gold, moon_crystals: job.moon_crystals, style_tokens: job.style_tokens });
      return button(job.title, 'work', { job_key: job.key }, { disabled: job.available === false, cooldown: job.cooldown, detail: 'LVL ' + job.min_level + ' // STAGE ' + number(job.min_evolution_stage) + specialistGate + ' // BASE REWARD ' + jobRewards + ' // ' + (job.lore || '') });
    }).join('');
    var activity = guidance.activity;
    var activityHtml = activity ? '' : '<div class="line muted">Choose recovery, training, work or exploration. One activity at a time; it continues while you play other routes or close the app. Claiming ends it. Base previews are subject to reward caps and stat limits; hunger increases are costs.</div>';
    if (activity) {
      activityHtml += '<div class="line">' + (activity.recovery_pending ? 'SAVED CLAIM: ' : 'ACTIVE: ') + escapeHtml(words(activity.activity_type)) + ' // ' + (activity.ready ? escapeHtml(activity.detail) : countdownMarkup(activity.cooldown || activity, 'Claim ready in ')) + '</div>';
      activityHtml += '<div class="button-grid">' + button(activity.recovery_pending ? 'RECOVER SAVED REWARD' : 'CLAIM NOW', 'activity_claim', { session_id: activity.id }, activityClaimButtonOptions(activity)) + (activity.recovery_pending ? '' : button('CANCEL ACTIVITY', 'activity_cancel', { session_id: activity.id }, { danger: true, detail: 'Ends this activity without its rewards.' })) + '</div>';
      if (activity.preview) activityHtml += '<div class="line complete">' + (activity.recovery_pending ? 'SAVED CLAIM PREVIEW' : 'CLAIM PREVIEW AT LAST SYNC') + ' // ' + escapeHtml(activityPreviewText(activity.preview)) + '</div>';
      activityHtml += '<div class="line muted">Base previews; reward caps and stat limits apply. Hunger increases are costs. ' + (activity.recovery_pending ? 'Retry finishes the saved claim without paying twice.' : 'Claiming ends this activity. You can keep playing other routes while it runs.') + '</div>';
      if (activity.next_checkpoint) activityHtml += '<div class="line">NEXT DURATION // ' + escapeHtml(formatCountdownSeconds(activity.next_checkpoint.seconds)) + ' TOTAL // ' + countdownMarkup(activity.next_checkpoint.cooldown, 'in ') + '</div><div class="line muted">' + escapeHtml(activityPreviewText(activity.next_checkpoint)) + '</div>';
      if (activity.activity_type === 'explore' && !activity.recovery_pending) activityHtml += '<div class="line muted">Explore gives 1 crystal from 30 minutes until 2 hours. At 2 hours, the Adventure Map replaces that crystal. Compare before claiming.</div>';
      if (activity.capped) activityHtml += '<div class="line complete">DURATION CAP REACHED // Waiting longer adds no activity rewards.</div>';
      if (activity.ends_at && !activity.recovery_pending) activityHtml += '<div class="line muted">Claim within 24 hours after the duration cap; unclaimed activities then expire.</div>';
    } else {
      var activityOptions = guidance.activity_options || [];
      activityHtml += activityOptions.length ? activityOptions.map(function (offer) {
        return '<div class="line"><strong>' + escapeHtml(words(offer.key)) + '</strong> // CLAIM FROM ' + escapeHtml(formatCountdownSeconds(offer.minimum_seconds)) + ' // CAP ' + escapeHtml(formatCountdownSeconds(offer.cap_seconds)) + '</div>' +
          '<details><summary class="line">COMPARE ' + escapeHtml(words(offer.key).toUpperCase()) + ' DURATION REWARDS</summary>' + offer.checkpoints.map(function (preview) { return '<div class="line muted">' + escapeHtml(formatCountdownSeconds(preview.seconds) + ' TOTAL // ' + activityPreviewText(preview)) + '</div>'; }).join('') + '</details>' +
          '<div class="button-grid one">' + button('START ' + words(offer.key), 'activity_start', { activity_type: offer.key }) + '</div>';
      }).join('') : '<div class="button-grid">' + ['sleep', 'train', 'work', 'explore'].map(function (kind) { return button(kind, 'activity_start', { activity_type: kind }); }).join('') + '</div>';
    }
    if (state.contracts && state.contracts.available) activityHtml += '<div class="button-grid one">' + routeButton('PLAY CONTRACTS', { screen: 'missions', focus: 'contracts' }, 'No pet energy cost or cooldown. The activity keeps accumulating.') + '</div>';
    return panel('TIMED ACTIVITY', activityHtml, 'timed-activity') + panel('JOB TERMINAL', '<div class="button-grid">' + jobsHtml + '</div>', 'jobs');
  }

  function activityPreviewText(preview) {
    var gains = [], costs = [];
    Object.entries(preview && preview.rewards || {}).forEach(function (entry) {
      var key = entry[0], amount = entry[1];
      if (key === 'item_key') { if (amount) gains.push('1 ' + words(amount)); return; }
      if (!Number(amount)) return;
      var isCost = key === 'hunger' ? amount > 0 : amount < 0;
      (isCost ? costs : gains).push(Math.abs(amount) + ' ' + (key === 'hunger' ? amount > 0 ? 'Hunger increase' : 'Hunger reduction' : words(key)));
    });
    return 'GAIN ' + (gains.join(' + ') || 'NONE') + ' // COST ' + (costs.join(' + ') || 'NONE');
  }

  function valueText(value) {
    var output = [];
    Object.entries(value || {}).forEach(function (entry) {
      var key = entry[0];
      var amount = entry[1];
      if (amount == null || amount === 0) return;
      if ((key === 'items' || key === 'materials') && typeof amount === 'object') {
        Object.entries(amount).forEach(function (asset) { if (Number(asset[1]) > 0) output.push(number(asset[1]) + ' ' + words(asset[0])); });
      } else if (typeof amount !== 'object') output.push(number(amount) + ' ' + words(key));
    });
    return output.join(' + ') || 'FREE';
  }

  function costText(cost) {
    return valueText(cost);
  }

  function renderEconomy() {
    var guidance = state.guidance || {};
    var economy = guidance.economy || {};
    var bounties = (economy.bounties || []).map(function (bounty) {
      var routes = window.MoonpetPlayOptions && window.MoonpetPlayOptions.bountyRouteOptions ? window.MoonpetPlayOptions.bountyRouteOptions(bounty, state) : [];
      if (state.lifecycle && state.lifecycle.phase === 'egg') routes = [{ title: 'HATCH TO WORK ON BOUNTIES', screen: 'home', focus: 'incubation' }];
      return '<div class="line ' + (bounty.complete ? 'complete' : '') + '">' + escapeHtml(bounty.title) + ' ' + number(bounty.progress) + '/' + number(bounty.required) + (bounty.claimed ? ' // CLAIMED' : bounty.complete ? ' // READY TO CLAIM' : '') + '</div>' +
        '<div class="line muted">' + escapeHtml(bounty.detail || '') + ' // REWARD ' + escapeHtml(valueText(bounty.reward)) + '</div>' +
        (bounty.complete && !bounty.claimed ? '<div class="button-grid one">' + button('CLAIM ' + bounty.title, 'bounty_claim', { bounty_key: bounty.key }) + '</div>' : !bounty.claimed && !bounty.complete ? '<div class="button-grid">' + routes.map(function (route) { return routeButton(route.title, route, route.detail); }).join('') + '</div>' : '');
    }).join('');
    var offers = (economy.market_offers || []).map(function (offer) {
      var full = offer.capacity && !offer.capacity.available;
      var capacityDetail = full ? ' // MAKE SPACE FOR ' + offer.capacity.blocked.map(function (entry) { return number(entry.amount) + ' ' + String(entry.key).replace(/_/g, ' ') + ' (' + number(entry.owned) + '/' + number(entry.limit) + ' stored)'; }).join(' + ') + '. Whole bundle required; nothing is charged while full.' : '';
      return button(offer.title, 'market_buy', { offer_key: offer.key }, { disabled: !offer.unlocked || !offer.affordable || offer.purchased || full || offer.available === false, statusLabel: offer.purchased ? 'SOLD' : full ? 'STORAGE FULL' : '', resourceRequired: offer.unlocked && !offer.affordable && !offer.purchased && !full, detail: (offer.unlocked ? '' : 'REQUIRES LEVEL ' + number(offer.min_level) + ' // ') + (offer.detail || '') + ' // COST ' + costText(offer.cost) + ' // GIVES ' + valueText(offer.reward) + capacityDetail });
    }).join('');
    var shop = (guidance.shop_items || []).map(function (item) {
      return button((item.owned && !item.equipped ? 'EQUIP FREE // ' : '') + item.title, item.owned ? 'equip' : 'buy', { item_key: item.key, pet_id: state.pet.pet_id }, { disabled: !item.unlocked || (!item.owned && !item.affordable) || item.equipped, statusLabel: item.equipped ? 'EQUIPPED' : item.owned ? 'OWNED' : '', resourceRequired: item.unlocked && !item.owned && !item.affordable && !item.equipped, detail: (item.unlocked ? '' : 'REQUIRES LEVEL ' + number(item.min_level) + ' // ') + (item.description || '') + (item.owned ? ' // FREE SWITCH. Keeps upgrades and mastery; no XP or daily shopping credit.' : ' // COST ' + costText(item.cost)) });
    }).join('');
    var inventory = (state.inventory || []).filter(function (item) { return Number(item.count || item.quantity || 0) > 0; }).map(function (item) {
      return '<div class="line">' + escapeHtml(words(item.title || item.key || item.item_key)) + ' x' + number(item.count || item.quantity) + '</div>' +
        (item.description ? '<div class="line muted">' + escapeHtml(item.description) + '</div>' : '') +
        ((item.kind === 'usable_item' || item.usable) ? '<div class="button-grid one">' + button('USE ' + (item.title || item.key), 'use_item', { item_key: item.key || item.item_key }) + '</div>' : '');
    }).join('');
    var expeditionOptions = economy.expedition_options;
    var expeditionBody = '<div class="line muted">Expedition destinations are syncing. Refresh after the game update.</div>';
    if (Array.isArray(expeditionOptions)) {
      expeditionBody = '<div class="line">' + number(economy.expedition_attempts_left) + '/3 SHARED ATTEMPTS LEFT TODAY</div>' +
        '<div class="line muted">Choose any unlocked destination. Earlier routes stay open as you level up. Each costs one account-wide attempt and its listed energy. Each awards up to 12 Pet XP under the existing cap; finds vary by destination.</div>' +
        (economy.expedition_cooldown ? '<div class="line">ATTEMPTS RESET ' + countdownMarkup(economy.expedition_cooldown, 'in ') + '</div>' : '') +
        expeditionOptions.map(function (entry) {
          return '<div class="line"><strong>' + escapeHtml(entry.title) + '</strong> // LEVEL ' + number(entry.min_level) + ' // ' + number(entry.energy) + ' ENERGY</div>' +
            '<div class="line muted">POSSIBLE FINDS // ' + escapeHtml((entry.rewards || []).map(valueText).join(' / ')) + '</div>' +
            '<div class="button-grid one">' + button('EXPLORE ' + entry.title, 'expedition', { expedition_key: entry.key, pet_id: state.pet.pet_id }, {
              disabled: !entry.available, cooldown: economy.expedition_cooldown,
              resourceRequired: entry.unlocked && !entry.affordable,
              detail: !entry.unlocked ? 'Requires Level ' + number(entry.min_level) : !entry.affordable ? 'Requires ' + number(entry.energy) + ' Energy' : 'Spend ' + number(entry.energy) + ' Energy and 1 attempt',
            }) + '</div>';
        }).join('');
      if ((economy.expedition_history || []).length) expeditionBody += '<details><summary class="line">TODAY’S EXPEDITION RECEIPTS</summary>' + economy.expedition_history.map(function (receipt) {
        return '<div class="line">' + escapeHtml(receipt.title) + ' // ' + number(receipt.energy_cost) + ' ENERGY // ' + (receipt.pet_id === state.pet.pet_id ? 'THIS PET' : receipt.pet_id ? 'OTHER PET' : 'EARLIER ACCOUNT RECEIPT') + '</div><div class="line muted">RECEIVED ' + escapeHtml(valueText(receipt.rewards)) + '</div>';
      }).join('') + '</details>';
    }
    expeditionBody += '<div class="button-grid">' + (state.contracts && state.contracts.available ? routeButton('CONTINUE WITH CONTRACTS', { screen: 'missions', focus: 'contracts' }, 'Saved quests without pet energy costs or cooldowns.') : '') + '</div>';
    var live = state.live_systems || {};
    var upgrades = new Map((live.upgrades || []).map(function (item) { return [item.item_key, item]; }));
    var gear = (state.gear || []).map(function (item) {
      var upgrade = upgrades.get(item.item_key) || {};
      var catalogItem = (guidance.shop_items || []).find(function (entry) { return entry.key === item.item_key; });
      var equip = catalogItem ? '<div class="button-grid one">' + button(catalogItem.equipped ? 'EQUIPPED' : 'EQUIP FREE', 'equip', { item_key: item.item_key, pet_id: state.pet.pet_id }, { disabled: !catalogItem.unlocked || catalogItem.equipped, detail: catalogItem.unlocked ? 'Keeps upgrades and mastery. No currency cost, XP or shopping credit.' : 'REQUIRES LEVEL ' + number(catalogItem.min_level) }) + '</div>' : '';
      return '<div class="line complete">' + escapeHtml(words(item.slot)) + ' // ' + escapeHtml(words(item.item_key)) + '</div>' +
        '<div class="line muted">LEVEL ' + number(item.item_level) + ' // ITEM XP ' + number(item.item_xp) + ' // MASTERY ' + number(item.mastery_tier) + ' (' + number(item.mastery_xp) + ' XP)</div>' + equip +
        (upgrade.maxed ? '<div class="line complete">MAX LEVEL</div>' : '<div class="button-grid one">' + button('UPGRADE TO LEVEL ' + number(upgrade.target_level), 'gear_upgrade', { item_key: item.item_key, target_level: upgrade.target_level, quote_version: upgrade.quote_version }, { disabled: !upgrade.affordable || !upgrade.quote_version, resourceRequired: upgrade.unlocked && !upgrade.affordable, detail: (upgrade.unlocked ? '' : 'REQUIRES LEVEL ' + number(upgrade.required_level) + ' // ') + costText(upgrade.cost) }) + '</div>');
    }).join('');
    var materials = (state.materials || []).map(function (item) {
      return '<div class="line ' + (item.quantity ? 'complete' : 'locked') + '">' + escapeHtml(item.label) + ' x' + number(item.quantity) + '</div><div class="line muted">SOURCE: ' + escapeHtml((item.sources || []).map(words).join(' / ')) + '</div>';
    }).join('');
    var crafting = (live.crafting || []).map(function (recipe) {
      var plan = window.MoonpetPlayOptions && window.MoonpetPlayOptions.craftingGoal && window.MoonpetPlayOptions.craftingGoal(state, recipe.key);
      var full = plan && plan.output_full;
      return button(recipe.title, 'craft', { recipe_key: recipe.key }, { disabled: !recipe.unlocked || !recipe.affordable || full, statusLabel: full ? 'OUTPUT STACK FULL' : '', resourceRequired: recipe.unlocked && !recipe.affordable, detail: (recipe.unlocked ? '' : 'REQUIRES LEVEL ' + number(recipe.min_level) + ' // ') + (recipe.detail || '') + ' // COST ' + costText(recipe.cost) + ' // MAKES ' + number(recipe.output && recipe.output.quantity) + ' ' + words(recipe.output && recipe.output.item_key) });
    }).join('');
    var relics = (state.relics || []).map(function (item) { return '<div class="line complete">◆ ' + escapeHtml(words(item.relic_id)) + '</div><div class="line muted">' + escapeHtml(item.route_effect || 'Collection requirement.') + '</div>'; }).join('');
    var equipmentSets = (live.equipment_sets || []).map(function (set) {
      var bonuses = (set.active_bonuses || []).map(function (bonus) { return number(bonus.required) + ' PIECE // ' + valueText(bonus.effects); }).join(' / ');
      return '<div class="line ' + (set.pieces >= 2 ? 'complete' : '') + '">' + escapeHtml(words(set.key)) + ' // EQUIPPED ' + number(set.pieces) + '/' + number(set.total_pieces) + ' // OWNED ' + number(set.owned_pieces) + '</div>' +
        '<div class="line muted">' + (bonuses ? 'ACTIVE ' + escapeHtml(bonuses) : 'MISSING ' + escapeHtml((set.missing || []).map(words).join(' / ') || 'EQUIP OWNED SET PIECES')) + '</div>';
    }).join('');
    var cosmetics = (live.cosmetics || []).filter(function (item) {
      return ['profile_frame', 'victory_pose', 'run_trail'].includes(item.key);
    }).map(function (item) {
      var loadout = state.style_loadout || {}, equipped = (loadout.equipped || []).includes(item.key);
      return '<div class="line">' + escapeHtml(words(item.key)) + '</div><div class="line muted">' + escapeHtml((loadout.details || {})[item.key] || '') + '</div>' + (item.unlocked
        ? button(equipped ? 'UNEQUIP FREE' : 'EQUIP FREE', 'style_equip', { pet_id: state.pet.pet_id, cosmetic_key: item.key, enabled: !equipped }, { disabled: loadout.available !== true, detail: loadout.available ? 'Owned. No currency cost.' : 'Style state unavailable. Refresh before switching.' })
        : button('UNLOCK ' + words(item.key), 'cosmetic_unlock', { cosmetic_key: item.key }, { disabled: !item.affordable, resourceRequired: !item.affordable, detail: costText(item.cost) }));
    }).join('');
    return panel('EQUIPMENT PROGRESSION', gear || '<div class="line muted">NO EQUIPMENT MASTERY RECORDS.</div>', 'equipment') +
      panel('LOADOUT SYNERGIES', equipmentSets || '<div class="line muted">NO SET DATA.</div>', 'equipment-sets') +
      panel('CRAFTING MATERIALS', materials || '<div class="line muted">NO MATERIAL DATA.</div>', 'materials') +
      panel('CRAFTING WORKSHOP', craftingGoalMarkup() + '<div class="line signal">RECIPES // CHOOSE TO SPEND MATERIALS</div><div class="button-grid">' + crafting + '</div>', 'crafting') +
      panel('RELIC VAULT', '<div class="line muted">Owned relics activate automatically in new Contract runs. Their route effects are listed below and saved at run start; new drops apply on the next run. Standard Moon Run and Daily Run keep their separate rules.</div>' + (state.relics_available === false ? '<div class="line danger">RELIC VAULT TEMPORARILY UNAVAILABLE. Refresh to try again. Your collection has not been cleared.</div>' : relics || '<div class="line muted">NO RELICS RECOVERED.</div>'), 'relics') +
      panel('DAILY BOUNTIES', '<div class="line muted">Four account-wide targets per UTC day. Only accepted actions count. The Energy Drink, Dance and Cuddles care buttons do not count. New targets arrive at 00:00 UTC. Contracts remain available between resets.</div>' + (bounties || '<div class="line muted">NO BOUNTIES.</div>'), 'bounties') +
      panel('CRYSTAL EXPEDITIONS // CHOOSE A DESTINATION', expeditionBody, 'expedition') +
      panel('MOON MARKET', '<div class="line muted">Paid bundles must fit in full. Use items or spend materials before buying when storage is full.</div><div class="button-grid one">' + offers + '</div><div class="button-grid">' + routeButton('OPEN BAG', { screen: 'economy', focus: 'inventory' }) + routeButton('OPEN CRAFTING', { screen: 'economy', focus: 'crafting' }) + '</div>', 'market') +
      panel('PERMANENT SHOP', '<div class="button-grid">' + shop + '</div>', 'shop') + panel('STYLE LAB // EQUIP YOUR LOOK', '<div class="line muted">Unlock once, then equip or remove each style free for this pet. Cosmetics change the canvas presentation, not stats. Existing owned styles work immediately. Callsign editing stays free in Profile.</div><div class="button-grid one">' + routeButton('EDIT CALLSIGN', { screen: 'profile', focus: 'callsign' }, 'Use the existing name control; no badge purchase is required.') + '</div><div class="button-grid">' + cosmetics + '</div>', 'style-lab') +
      panel('INVENTORY', inventory || '<div class="line muted">BAG EMPTY.</div>', 'inventory') +
      panel('MOON GOLD TRADE', '<div class="line muted">Game currency only. A loss spends the selected stake. Trades share a five-minute account cooldown.</div><div class="button-grid three">' + (state.trade && state.trade.offers || []).map(function (offer) { return button(offer.wager + ' GOLD', 'trade', { wager: offer.wager }, { disabled: !offer.available, cooldown: state.trade.cooldown, resourceRequired: !offer.affordable, detail: offer.affordable ? '' : 'Requires ' + number(offer.wager) + ' Moon Gold.' }); }).join('') + '</div>', 'trade');
  }

  // TEST-EXPORT: notificationControls:start
  function renderPetNotificationControls(notifications) {
    var available = Boolean(notifications && notifications.available === true && typeof notifications.enabled === 'boolean');
    var enabled = available && notifications.enabled;
    var status = available ? (enabled ? 'ONLINE' : 'OFFLINE') : 'STATE UNAVAILABLE';
    return '<div class="line ' + (enabled ? 'complete' : 'muted') + '">PROGRESSION ALERTS: ' + status + '</div>' +
      (available ? '' : '<div class="line muted">Your saved alert preference is unavailable. Tap Refresh to retry before changing alerts.</div>') +
      '<div class="button-grid">' +
      button('ENABLE ALERTS', 'notification_set', { enabled: true }, { disabled: !available || enabled, statusLabel: !available ? 'REFRESH REQUIRED' : enabled ? 'CURRENT' : '' }) +
      button('DISABLE ALERTS', 'notification_set', { enabled: false }, { disabled: !available || !enabled, statusLabel: !available ? 'REFRESH REQUIRED' : !enabled ? 'CURRENT' : '', danger: true }) + '</div>';
  }
  // TEST-EXPORT: notificationControls:end

  function renderProfile() {
    var helpPanel = panel('HOW TO PLAY', '<div class="line muted">Care, daily and weekly goals, runs, bosses, rewards and the season finale.</div><div class="button-grid one"><button type="button" class="terminal-button" data-utility="guide">HOW TO PLAY<span class="button-purpose">Read how care, quests, battles and rewards work before choosing a route.</span></button></div>', 'how-to-play');
    if (!state.pet) return helpPanel + panel('IDENTITY CORE', '<div class="line muted">INITIALISE A MOONPET TO UNLOCK THIS MODULE.</div>');
    var guidance = state.guidance || {};
    var identity = guidance.identity || {};
    var evolution = guidance.evolution;
    var currentPerk = guidance.current_evolution_perk || {};
    var evoHtml = evolution
      ? '<div class="line complete">CURRENT PERK // ' + escapeHtml(currentPerk.perk || 'Memories and traits are active.') + '</div><div class="line">NEXT: ' + escapeHtml(evolution.name) + '</div><div class="line muted">NEXT PERK // ' + escapeHtml(evolution.perk || '') + '</div>' + (evolution.missing || []).map(function (entry) { return '<div class="line muted">' + escapeHtml(entry.label) + ' ' + number(entry.current) + '/' + number(entry.required) + ' // ' + escapeHtml(entry.source || '') + '</div>'; }).join('') + '<div class="button-grid one">' + button('EVOLVE', 'evolve', { evolution_id: evolution.evolution_id }, { disabled: !evolution.ready }) + '</div>'
      : '<div class="line complete">FINAL EVOLUTION ONLINE.</div><div class="line muted">' + escapeHtml(currentPerk.perk || '') + '</div>';
    var season = guidance.season || {};
    var tiers = (season.tiers || []).map(function (tier) {
      return '<div class="line ' + (tier.claimed_at ? 'complete' : tier.unlocked ? '' : 'locked') + '">' + escapeHtml(tier.title) + ' // ' + number(tier.required_xp) + ' XP // ' + escapeHtml(tier.season_key || season.key) + '</div>' +
        '<div class="line muted">REWARD ' + escapeHtml(valueText(tier.reward)) + ' // +' + number(season.evolution_bonus_style) + ' EVOLUTION STYLE</div>' +
        (tier.unlocked && !tier.claimed_at ? '<div class="button-grid one">' + button('CLAIM ' + tier.title, 'season_claim', { tier_id: tier.tier_id, season_key: tier.season_key || season.key }) + '</div>' : '');
    }).join('');
    var traits = (guidance.personalities || []).map(function (trait) { return '<div class="line complete">[' + escapeHtml(words(trait.trait_id || trait.name || trait)) + ']</div>'; }).join('');
    var progress = state.progress || {};
    var learnedTraits = {};
    try { learnedTraits = JSON.parse(progress.traits_json || '{}'); } catch (_) {}
    var tracks = ['care', 'training', 'adventure', 'arena', 'job', 'bond'].map(function (key) {
      var xp = progress[key + '_xp'];
      return '<div class="line">' + escapeHtml(key.toUpperCase()) + ' XP ' + number(xp) + '</div>';
    }).join('');
    var leaders = (state.leaderboard || []).map(function (entry) {
      var form = entry.phase === 'rare' ? entry.rare_morph_name : entry.display_name || 'UNKNOWN';
      return '<div class="line">#' + number(entry.rank) + ' ' + escapeHtml(entry.pet_name || 'MOONPET') +
        ' // ' + escapeHtml(words(form || 'moonpet')) + ' // LVL ' + number(entry.level) + ' // ' + number(entry.pet_xp) + ' XP</div>' +
        '<div class="line muted">GOLD ' + number(entry.moon_gold) + ' // GEMS ' + number(entry.moon_crystals) +
        ' // STYLE ' + number(entry.style_tokens) + '</div>';
    }).join('');
    var notifications = state.notifications || {};
    var live = state.live_systems || {};
    var faction = live.faction || {};
    var notificationPanel = renderPetNotificationControls(notifications);
    var aptitudeRows = ['brave', 'loyal', 'clever', 'stylish', 'tough', 'lucky'].map(function (key) { return '<div class="line">' + key.toUpperCase() + ' ' + number(learnedTraits[key]) + '</div>'; }).join('');
    var memory = identity.memories || {};
    var bossHistory = (identity.boss_victories || []).slice(0, 4).map(function (boss) {
      return 'BOSS // ' + words(boss.boss_id) + ' x' + number(boss.victories);
    });
    var memoryRows = [
      memory.first_boss_id ? 'FIRST BOSS // ' + words(memory.first_boss_id) : '',
      Number(memory.total_runs) > 0 ? 'RUNS COMPLETED // ' + number(memory.total_runs) : '',
      Number(memory.total_bosses_defeated) > 0 ? 'BOSSES DEFEATED // ' + number(memory.total_bosses_defeated) : '',
      memory.favourite_activity ? 'FAVOURITE // ' + words(memory.favourite_activity) : '',
      Number(memory.biggest_reward_amount) > 0 ? 'BIGGEST REWARD // ' + number(memory.biggest_reward_amount) + ' ' + words(memory.biggest_reward_currency) : '',
      bossHistory.length ? bossHistory.join(' / ') : '',
      'CARE / EVENT / ADVENTURE / COMBAT // ' + number(memory.care_actions) + ' / ' + number(memory.event_actions) + ' / ' + number(memory.adventure_actions) + ' / ' + number(memory.combat_actions),
    ].filter(Boolean).map(function (line) { return '<div class="line">' + escapeHtml(line) + '</div>'; }).join('');
    var milestones = (memory.milestones || []).map(function (milestone) { return '<div class="line complete">◆ ' + escapeHtml(words(milestone)) + '</div>'; }).join('');
    var featureRows = (guidance.features || []).filter(function (feature) {
      return ['care_console','daily_missions','timed_activities','moon_runs','street_events','kaiju_cards','weekly_boss','pet_arena','moon_economy','equipment_upgrades'].includes(feature.key);
    }).map(function (feature) {
      var available = feature.available === true;
      var detail = feature.detail || '';
      return '<div class="line ' + (available ? 'complete' : 'locked') + '">' + (available ? '[ONLINE] ' : '[LOCKED] ') + escapeHtml(feature.title) + '</div><div class="line muted">' + escapeHtml(detail) + '</div>';
    }).join('');
    var lifecycle = state.lifecycle || {};
    var rare = lifecycle.rare || {};
    var innate = (lifecycle.innate_traits || []).map(function (trait) { return '<div class="line complete">◆ ' + escapeHtml(words(trait)) + '</div>'; }).join('');
    var rarePanel = '<div class="line ' + (rare.ready ? 'complete' : 'muted') + '">HIDDEN SIGNAL // ' + escapeHtml(words(rare.signal || 'dormant')) + ' // ' + number(rare.progress) + '%</div>' + (rare.name ? '<div class="line complete">REVEALED // ' + escapeHtml(rare.name) + '</div>' : '<div class="line muted">The route remains hidden until your evolution, traits and memories align.</div>') + (rare.ready ? '<div class="button-grid one">' + button('ANSWER RARE SIGNAL', 'rare_morph') + '</div>' : '');
    var callsignUnlocked = Number(lifecycle.evolution_stage || state.pet.evolution_stage || identity.current_stage && identity.current_stage.stage || 0) >= MOONPET_IDENTITY_REVEAL_STAGE;
    var callsignPanel = callsignUnlocked
      ? '<label class="line" for="pet-name-input">CUSTOM CALLSIGN</label><input id="pet-name-input" class="terminal-input" maxlength="32" value="' + escapeHtml(state.pet.callsign || '') + '"><div class="button-grid one">' + button('SAVE CALLSIGN', 'rename') + '</div><div class="line muted">CANONICAL IDENTITY STAYS SEPARATE FROM ANY CUSTOM CALLSIGN.</div>'
      : '<div class="line complete">UNKNOWN</div><div class="line muted">CALLSIGN LOCKED UNTIL STAGE 3.</div>';
    return activePetSummary() + helpPanel + renderSeasonSlots() +
      panel('IDENTITY CORE', '<div class="line complete">' + escapeHtml(resolveMoonpetDisplayName(lifecycle, identity)) + ' // ' + escapeHtml(moonpetStageLabel(lifecycle, state.pet || {})) + '</div><div class="line muted">' + escapeHtml(words(lifecycle.temperament || 'forming')) + ' TEMPERAMENT</div>' + innate + '<div class="line muted">PERSONALITY</div>' + (traits || '<div class="line muted">TRAITS STILL FORMING. Personality develops through play.</div>')) + panel('HIDDEN MORPH SIGNAL', rarePanel, 'rare-morph') +
      panel('APTITUDES', aptitudeRows) +
      panel('MEMORY ARCHIVE', memoryRows + (milestones || '<div class="line muted">NO MILESTONES RECORDED YET.</div>'), 'memories') +
      panel('CALLSIGN', callsignPanel, 'callsign') +
      panel('SEASON FINALE', '<div class="button-grid one">' + routeButton('OPEN SEASON FINALE', { screen: 'missions', focus: 'season-finale' }, 'Check your unlocks, resume a saved fight or collect a victory reward.') + '</div>', 'finale-link') +
      panel('EVOLUTION', evoHtml, 'evolution') + panel('FACTION PERK', '<div class="line complete">' + escapeHtml(words(faction.key || 'unaligned')) + '</div><div class="line muted">' + escapeHtml(faction.bonus ? words(faction.bonus.system) + ' // ' + costText(faction.bonus.effect) : 'JOIN A FACTION TO ACTIVATE A GAMEPLAY BONUS') + '</div>', 'faction') +
      panel('SPECIALIST TRACKS', tracks, 'tracks') + panel('UNLOCK DIRECTORY', featureRows, 'features') + panel('ALERT CONTROL', notificationPanel, 'alerts') + panel('SEASON // ' + (season.key || ''), '<div class="line">' + number(season.xp) + ' SEASON XP</div>' + tiers, 'season') + panel('TOP MOONPETS // CURRENT SEASON', (leaders || '<div class="line muted">NO RANKS LOADED.</div>') + '<div class="button-grid one"><button type="button" class="terminal-button" data-utility="leaderboard">OPEN FULL LEADERBOARD<span class="button-purpose">Compare competition scores. Viewing ranks does not change your pet.</span></button></div>', 'leaderboard');
  }

  var screens = { home: renderHome, missions: renderMissions, explore: renderExplore, work: renderWork, economy: renderEconomy, profile: renderProfile };
  var navItems = [
    ['home', '⌂', 'HOME', 'Care'], ['missions', '☷', 'MISSIONS', 'Goals'], ['explore', '⚔', 'EXPLORE', 'Runs'], ['work', '⚒', 'WORK', 'Timers'], ['economy', '◇', 'ECONOMY', 'Gear'], ['profile', '★', 'PROFILE', 'Pets'],
  ];

  function renderNav() {
    nav.innerHTML = navItems.map(function (item) {
      return '<button type="button" data-screen="' + item[0] + '" aria-current="' + (item[0] === activeScreen ? 'page' : 'false') + '"><span>' + item[1] + '</span>' + item[2] + '<small>' + item[3] + '</small></button>';
    }).join('');
  }

  // TEST-EXPORT: callsignDraft:start
  function captureEditableState() {
    var input = document.getElementById('pet-name-input');
    if (!input) return null;
    return {
      petId: renderedPetId,
      petName: renderedPetName,
      value: input.value,
      dirty: input.value !== renderedPetName,
      focused: document.activeElement === input,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    };
  }

  function restoreEditableState(draft) {
    if (!draft || !draft.dirty || !draft.petId || !state || !state.pet || draft.petId !== state.pet.pet_id) return;
    if (!draft.focused && String(state.pet.callsign || '') !== String(draft.petName || '')) return;
    var input = document.getElementById('pet-name-input');
    if (!input) return;
    input.value = draft.value;
    if (draft.focused) {
      input.focus({ preventScroll: true });
      if (typeof draft.selectionStart === 'number' && typeof draft.selectionEnd === 'number') {
        input.setSelectionRange(draft.selectionStart, draft.selectionEnd);
      }
    }
  }
  // TEST-EXPORT: callsignDraft:end

  function render(options) {
    var editableState = options && options.discardCallsignDraft ? null : captureEditableState();
    rememberPanels();
    var routeDraft = {};
    var draftPetId = renderedPetId;
    ['contract-format', 'contract-build', 'contract-tier', 'contract-side-goal'].forEach(function (id) {
      var input = document.getElementById(id); if (input) routeDraft[id] = input.value;
    });
    renderHud();
    renderNav();
    renderCanvasTools();
    var waitingForModule = stateNeedsScreenHydration(state, activeScreen);
    var hydrationStopped = waitingForModule && fullStateHydrationFailures >= FULL_STATE_HYDRATION_MAX_AUTO_RETRIES && !fullStateHydrationPromise;
    screen.innerHTML = authenticationFailure
      ? panel('TELEGRAM SESSION EXPIRED', '<div class="line muted">Close this game and reopen Moonpet OS from the bot to get a fresh signed Telegram session. Your saved progress is kept.</div><div class="button-grid one"><a class="terminal-link-button" href="https://t.me/WIKICOMSBOT?start=moonpet" target="_blank" rel="noopener noreferrer">OPEN FRESH TELEGRAM SESSION</a></div>', 'telegram-auth')
      : !state ? ''
      : waitingForModule
        ? (activeScreen === 'profile' ? renderPetSpaces(state.season_slots) : '') + panel('LOADING // ' + activeScreen.toUpperCase(),
          hydrationStopped
            ? '<div class="line danger">MODULE STATE COULD NOT LOAD.</div><div class="line muted">Automatic retries stopped to protect the API. HOME is still available.</div><div class="button-grid"><button type="button" class="terminal-button" data-utility="module-retry">RETRY MODULE<span class="button-purpose">Read your saved menu again; no previous gameplay action is repeated.</span></button>' + routeButton('RETURN HOME', { screen: 'home', focus: 'care' }, 'Use lightweight care while the module is unavailable.') + '</div>'
            : '<div class="line signal">FETCHING SERVER-AUTHORITATIVE MODULE STATE...</div><div class="line muted">HOME remains usable while this module loads.</div>',
          'module-loading')
        : renderRecommended() + screens[activeScreen]();
    restoreEditableState(editableState);
    if (draftPetId === (state && state.pet && state.pet.pet_id)) Object.keys(routeDraft).forEach(function (id) {
      var input = document.getElementById(id);
      if (input && Array.from(input.options).some(function (option) { return option.value === routeDraft[id]; })) input.value = routeDraft[id];
    });
    renderedPetId = state && state.pet && state.pet.pet_id || null;
    renderedPetName = String(state && state.pet && state.pet.callsign || '');
    if (reducedMotion) drawWorld(0);
    applyRequestedFocus();
  }

  // TEST-EXPORT: actionResultFeedback:start
  function resultRewardMap(result) {
    if (result && result.duplicate) return {};
    var applied = result && result.applied;
    var reward = result && result.rewards
      || applied && (applied.rewardsApplied || applied.rewards_applied)
      || result && result.computed && result.computed.rewards
      || applied
      || {};
    return reward && typeof reward === 'object' && !Array.isArray(reward) ? reward : {};
  }

  // TEST-EXPORT: journeyActionProgress:start
  function journeyProgressSnapshot(snapshot) {
    return {
      daily: snapshot && snapshot.daily_journey || null,
      weekly: snapshot && snapshot.weekly_journey || null,
    };
  }

  function activeJourneyPetId(snapshot) {
    var activeSlot = (snapshot && snapshot.season_slots && Array.isArray(snapshot.season_slots.slots)
      ? snapshot.season_slots.slots.find(function (slot) { return slot && slot.active; }) : null) || {};
    return String(snapshot && snapshot.pet && (snapshot.pet.pet_id || snapshot.pet.id)
      || activeSlot.pet_id
      || '');
  }

  function journeyPeriodMatches(left, right, keys) {
    return keys.every(function (key) {
      var leftValue = String(left && left[key] != null ? left[key] : '');
      var rightValue = String(right && right[key] != null ? right[key] : '');
      return !leftValue || !rightValue || leftValue === rightValue;
    });
  }

  function journeyActionProgressLines(beforeState, afterState, result) {
    if (!result || !result.accepted || !afterState) return [];
    var beforePetId = activeJourneyPetId(beforeState);
    var afterPetId = activeJourneyPetId(afterState);
    if (!beforePetId || !afterPetId || beforePetId !== afterPetId) return [];
    var before = journeyProgressSnapshot(beforeState);
    var after = journeyProgressSnapshot(afterState);
    var lines = [];
    var daily = after.daily || {};
    var beforeDaily = before.daily || {};
    var dailyRequired = Math.max(0, Number(daily.required_objectives) || 0);
    var beforeDailyRequired = Math.max(0, Number(beforeDaily.required_objectives) || 0);
    if (dailyRequired > 0 && beforeDailyRequired > 0 && journeyPeriodMatches(daily, beforeDaily, ['pet_id', 'season_key', 'utc_day'])) {
      var dailyCompleted = Math.max(0, Number(daily.completed_objectives) || 0);
      var beforeDailyCompleted = Math.max(0, Number(beforeDaily.completed_objectives) || 0);
      if (dailyCompleted > beforeDailyCompleted) {
        lines.push('Daily Journey +' + number(dailyCompleted - beforeDailyCompleted) + ' objective (' + number(dailyCompleted) + '/' + number(dailyRequired) + ').');
      } else if (daily.growth_mark_awarded && !beforeDaily.growth_mark_awarded) {
        lines.push('Growth Mark already settled for today.');
      }
    }
    var weekly = after.weekly || {};
    var beforeWeekly = before.weekly || {};
    var weeklyRequired = Math.max(0, Number(weekly.required_objectives) || 0);
    var beforeWeeklyRequired = Math.max(0, Number(beforeWeekly.required_objectives) || 0);
    if (weeklyRequired > 0 && beforeWeeklyRequired > 0 && journeyPeriodMatches(weekly, beforeWeekly, ['pet_id', 'season_key', 'qualification_week'])) {
      var weeklyCompleted = Math.max(0, Number(weekly.completed_objectives) || 0);
      var beforeWeeklyCompleted = Math.max(0, Number(beforeWeekly.completed_objectives) || 0);
      var objectives = Array.isArray(weekly.objectives) ? weekly.objectives : [];
      var beforeObjectives = Array.isArray(beforeWeekly.objectives) ? beforeWeekly.objectives : [];
      var beforeById = {};
      beforeObjectives.forEach(function (objective) { beforeById[String(objective.objective_id || '')] = objective; });
      objectives.some(function (objective) {
        var id = String(objective.objective_id || '');
        var beforeObjective = beforeById[id] || {};
        var progress = Math.max(0, Number(objective.progress) || 0);
        var target = Math.max(1, Number(objective.target) || 1);
        var beforeProgress = Math.max(0, Number(beforeObjective.progress) || 0);
        if (progress > beforeProgress) {
          lines.push(weeklyObjectiveLabel(objective) + ' ' + number(Math.min(progress, target)) + '/' + number(target) + '.');
        }
        return lines.length >= 2;
      });
      if (weeklyCompleted > beforeWeeklyCompleted && !lines.some(function (line) { return /Weekly|Daily Moon Runs|Daily chest/i.test(line); })) {
        lines.push('Weekly Journey ' + number(weeklyCompleted) + '/' + number(weeklyRequired) + '.');
      }
      if (weekly.weekly_crest_awarded && !beforeWeekly.weekly_crest_awarded) {
        lines.push('Weekly Crest already settled for this week.');
      }
    }
    return lines.slice(0, 2);
  }
  // TEST-EXPORT: journeyActionProgress:end

  function resultMessage(result, beforeState, afterState) {
    if (!result) return 'Response unavailable.';
    if (result.accepted && result.reason === 'legacy_street_event_closed') return 'OLD EVENT CLOSED. History and balances kept; no reward claimed.';
    if (!result.accepted) {
      var blockedParts = ['Action unavailable'];
      var blockedReasonCopy = rejectionMessage(result.reason);
      if (blockedReasonCopy) blockedParts[0] += ' - ' + blockedReasonCopy;
      if (result.duplicate) blockedParts.push('Duplicate blocked by authority.');
      return blockedParts.join(' - ');
    }
    var reward = resultRewardMap(result);
    var gains = Object.entries(reward).filter(function (entry) { return Number(entry[1]) > 0 && typeof entry[1] !== 'object' && !(entry[0] === 'pet_xp' && result.pet_xp_awarded != null); }).map(function (entry) { return '+' + number(entry[1]) + ' ' + words(entry[0]); });
    ['materials', 'items', 'relics'].forEach(function (kind) {
      Object.entries(reward[kind] || {}).forEach(function (entry) {
        if (Number(entry[1]) > 0) gains.push('+' + number(entry[1]) + ' ' + words(entry[0]));
      });
    });
    var parts = ['Action complete'];
    var reasonCopy = rejectionMessage(result.reason);
    if (reasonCopy) parts.push(reasonCopy);
    var terminalResult = result.battle && (result.battle.outcome || result.battle.result) || result.match && (result.match.outcome || result.match.result) || result.resolved && result.resolved.result;
    if (terminalResult) parts.push('OUTCOME ' + words(terminalResult.replace('player1', 'you').replace('player2', 'opponent')));
    var resultCopy = result.result_copy || result.outcome && result.outcome.copy;
    if (resultCopy) parts.push(String(resultCopy));
    if (result.damage) parts.push((result.participation_only ? 'CHALLENGE SCORE ' : 'DAMAGE ') + number(result.damage));
    if (!result.duplicate && result.pet_xp_awarded) parts.push('+' + number(result.pet_xp_awarded) + ' PET XP');
    if (gains.length) parts.push(gains.join(' // '));
    if (result.daily_journey) {
      parts.push(result.daily_journey.accepted
        ? 'GROWTH MARK AWARDED'
        : 'GROWTH MARK BLOCKED // ' + words(result.daily_journey.reason || 'not qualified'));
    }
    if (result.duplicate) parts.push('DUPLICATE BLOCKED BY AUTHORITY');
    journeyActionProgressLines(beforeState, afterState, result).forEach(function (line) { parts.push(line); });
    if (result.reaction) parts.push('MOONPET: ' + String(result.reaction));
    return parts.join(' // ');
  }

  function rejectionMessage(reason) {
    var messages = {
      daily_tactic_invalid: 'choose one of the offered checkpoint tactics.',
      daily_tactic_stale: 'that checkpoint has changed or its tactic is already chosen; use the refreshed run.',
      contracts_unavailable: 'contracts are syncing; refresh after the update.',
      notification_save_pending: 'the alert setting save could not be confirmed. Refresh, then retry your choice.',
      pet_busy: 'a background activity is running. Open Work to review it; other care and Contracts are available.',
      activity_state_changed: 'that activity changed in another session. Review the refreshed activity before claiming or cancelling.',
      activity_session_required: 'reload the game before claiming or cancelling this activity.',
      pet_tired: 'not enough energy for this action. Review its displayed requirement or use care to recover.',
      pet_action_state_changed: 'your pet or equipment changed while care was loading. No care reward or cooldown was applied; try again with the refreshed pet.',
      displayed_pet_required: 'the displayed Moonpet identity is missing. Refresh the game before trying again. Nothing was spent or awarded.',
      displayed_pet_changed: 'another session selected a different Moonpet. Nothing was spent or awarded. Refresh to load the active pet.',
      source_pet_changed: 'another session selected a different Moonpet. Nothing was spent or awarded. Refresh to load the active pet.',
      daily_completion_not_ready: 'finish all seven daily missions before claiming.',
      daily_completion_pending: 'your daily bonus is saved. Retry the claim.',
      finale_requirements_not_met: 'reach final evolution, 240 distinct-day Growth Marks and 44 distinct-week Crests.',
      finale_stale_turn: 'this battle changed. Use the refreshed moves.',
      finale_quarter_changed: 'a new competition quarter started. Refresh to start its Finale.',
      finale_invalid_move: 'check your charge or repair kits and choose an available move.',
      finale_reward_pending: 'your victory is saved. Retry the reward claim.',
      finale_victory_required: 'defeat the finale boss before claiming.',
      finale_already_started: 'resume your saved fight or use Retry after defeat.',
      contract_pet_changed: 'the active pet changed; reopen its contract board.',
      contract_stale: 'that contract changed; use the refreshed choices.',
      contract_active: 'finish or abandon your current contract first.',
      contract_invalid_choice: 'choose one of the available routes or upgrades.',
      market_capacity_full: 'the whole bundle must fit. Use items or spend materials/currency first; nothing was charged.',
      market_state_changed: 'your pet or balances changed before purchase. Nothing was charged; review the refreshed offer.',
      market_pet_unavailable: 'select a hatched active pet before buying.',
      contract_not_found: 'contract unavailable for this pet.',
      contract_bonus_pending: 'bonus saved; retry its delivery from the contract board.',
      active_pet_required: 'active Moonpet required.',
      weekly_journey_authority_syncing: 'Weekly Journey authority syncing.',
      daily_journey_authority_syncing: 'Daily Journey authority syncing.',
      cooldown: 'wait for cooldown.',
      trade_cooldown: 'wait for cooldown.',
      trade_state_changed: 'your pet or balance changed; review the refreshed state before trying again.',
      adventure_cooldown: 'wait for cooldown.',
      expedition_locked: 'choose an expedition your pet has unlocked.',
      expedition_pet_changed: 'your active pet changed; review its expedition choices.',
      expedition_state_changed: 'another action changed your expedition state; review the refreshed choices before trying again.',
      expedition_daily_limit: 'all three account attempts are used today. Contracts remain available.',
      weekly_boss_pet_changed: 'your active pet changed; review its boss choices.',
      weekly_boss_state_changed: 'your pet or boss state changed; review the refreshed choices.',
      street_event_audit_required: 'this saved event needs review because its original outcome could not be verified.',
      street_event_unaffordable: 'the saved outcome was unaffordable. Nothing was spent and its reward slot was released.',
      street_event_reward_pending: 'your event is saved. Refresh, then use Recover Saved Event.',
      daily_cache_state_changed: 'your pet changed before the cache could settle; refresh and try again.',
      crafting_settlement_conflict: 'your level, materials or bag capacity changed before crafting. Nothing was spent; review the refreshed recipe.',
      upgrade_conflict: 'your level, balance or gear changed before the upgrade, or wallet recovery is pending. Nothing was spent; review the refreshed gear.',
      upgrade_quote_stale: 'this upgrade quote has changed. Nothing was spent; refresh Equipment and review the level and price before trying again.',
      cosmetic_settlement_conflict: 'your balance or collection changed, or wallet recovery is pending. Nothing was spent; review the refreshed collection.',
      season_reward_pending: 'the season reward has not settled yet; refresh and retry the saved tier.',
      wallet_reconciliation_recovery_pending: 'your saved wallet is waiting for recovery. This transaction was not applied.',
      daily_boss_reward_pending: 'the final boss room is saved; refresh or finish the saved Daily Run to retry delivery without another fight.',
      daily_run_ending_unavailable: 'the saved ending needs recovery. No extra room or boss attempt was created.',
      weekly_boss_reward_pending: 'the saved victory reward is still pending; use Recover Weekly Reward to try again without another attack.',
      weekly_boss_reward_not_found: 'no matching saved victory belongs to this account and pet.',
      moon_egg_must_hatch: 'hatch your Moonpet first.',
      pet_not_adopted: 'initialise your Moonpet first.',
      insufficient_gold: 'not enough Moon Gold.',
      not_enough_pet_currency: 'not enough required currency.',
      insufficient_crystals: 'not enough Moon Crystals.',
      insufficient_style: 'not enough Style Tokens.',
      insufficient_arcade_xp: 'NOT ENOUGH ARCADE XP FOR THIS SLOT',
      arcade_xp_entry_required: 'EARN 1,000 LIFETIME ARCADE XP ON THE WEBSITE TO UNLOCK YOUR FIRST PET. YOUR XP IS KEPT.',
      pet_slot_purchased: 'PET SLOT UNLOCKED',
      pet_slot_switched: 'ACTIVE MOONPET SWITCHED',
      pet_deleted: 'PET DELETED // FRESH EGG SAVED // REWARDS AND HISTORY KEPT',
      pet_delete_confirmation_required: 'CONFIRM THE EXACT PET BEFORE DELETION',
      pet_delete_not_available: 'THAT PET IS NO LONGER AVAILABLE FOR DELETION // REFRESH',
      pet_delete_blocked: 'FINISH ACTIVE GAMES, LEAVE QUEUES AND CLAIM PENDING REWARDS BEFORE DELETING',
      pet_slot_already_owned: 'THAT PET SLOT IS ALREADY UNLOCKED',
      invalid_pet_slot: 'THAT PET SLOT IS INVALID',
      pet_slot_purchase_conflict: 'PET SLOT UNLOCK COULD NOT BE COMPLETED',
      pet_slot_creation_incomplete: 'PET SLOT UNLOCK NEEDS A SAFE RETRY',
      pet_slot_not_switchable: 'THAT PET SLOT CANNOT BE SWITCHED TO',
      pet_activity_active: 'FINISH OR CLAIM THE ACTIVE PET ACTIVITY FIRST',
      pet_run_active: 'FINISH THE ACTIVE MOON RUN BEFORE SWITCHING',
      pet_arena_active: 'FINISH THE ACTIVE ARENA BATTLE BEFORE SWITCHING',
      pet_arena_queue_active: 'LEAVE THE ARENA QUEUE BEFORE SWITCHING',
      pet_kaiju_active: 'FINISH THE ACTIVE KAIJU MATCH BEFORE SWITCHING',
      pet_kaiju_queue_active: 'LEAVE THE KAIJU QUEUE BEFORE SWITCHING',
      season_slots_unavailable: 'SEASON SLOTS ARE TEMPORARILY UNAVAILABLE',
      pet_ownership_recovery_required: 'YOUR OWNED PET NEEDS RECOVERY // PET SPACES AND ARCADE XP ARE PRESERVED',
    };
    return messages[String(reason || '')] || words(reason);
  }

  // TEST-EXPORT: actionResultFeedback:end

  // TEST-EXPORT: lifecycleDirector:start
  function lifecycleStateSnapshot(snapshot) {
    var lifecycle = snapshot && snapshot.lifecycle || {};
    var incubation = lifecycle.incubation || {};
    var rare = lifecycle.rare || {};
    var pet = snapshot && snapshot.pet || {};
    return {
      adopted: Boolean(snapshot && snapshot.adopted),
      phase: String(lifecycle.phase || ''),
      speciesId: String(lifecycle.art_identity_id || lifecycle.species_id || pet.art_identity_id || pet.species || ''),
      speciesName: resolveMoonpetDisplayName(lifecycle, snapshot && snapshot.guidance && snapshot.guidance.identity),
      temperament: String(lifecycle.temperament || ''),
      marking: String(lifecycle.appearance && lifecycle.appearance.marking || ''),
      traits: Array.isArray(lifecycle.innate_traits) ? lifecycle.innate_traits.slice(0, 2) : [],
      rareName: String(rare.name || ''),
      progress: Math.max(0, Number(incubation.progress || 0)),
      target: Math.max(1, Number(incubation.target || 12)),
      stage: pet.evolution_stage == null ? 0 : Math.max(0, Number(pet.evolution_stage || 0)),
      stageName: String(pet.stage || lifecycle.phase || ''),
    };
  }

  function planLifecycleCeremony(beforeState, afterState, action, result) {
    if (!result || !result.accepted || result.duplicate || !afterState) return null;
    // Selecting an older companion does not hatch or evolve the previous pet.
    if (beforeState && beforeState.pet && afterState.pet
      && beforeState.pet.pet_id && afterState.pet.pet_id
      && beforeState.pet.pet_id !== afterState.pet.pet_id) return null;
    var before = lifecycleStateSnapshot(beforeState);
    var after = lifecycleStateSnapshot(afterState);
    var actionKey = String(action || '').toLowerCase();
    if (actionKey === 'adopt' && !before.adopted && after.phase === 'egg') {
      return { kind: 'egg', title: 'SECRET BOT', primary: 'Ready for care', secondary: 'Your choices shape the reveal', detail: '', duration: 5200 };
    }
    if (before.phase === 'egg' && after.phase === 'young' && after.speciesId) {
      return {
        kind: 'hatch', title: 'STREET MOONPET', primary: 'UNKNOWN',
        secondary: 'Identity unlocks at Stage 3',
        detail: [after.marking].concat(after.traits).filter(Boolean).map(words).join(' - '), duration: 7600,
      };
    }
    if (before.stage < 3 && after.stage >= 3 && after.speciesName !== 'UNKNOWN') {
      return {
        kind: 'evolve', title: 'IDENTITY REVEALED', primary: after.speciesName,
        secondary: words(after.stageName || 'Elite Moonpet'),
        detail: after.traits.map(words).join(' - '), duration: 8200,
      };
    }
    if (before.phase !== 'rare' && after.phase === 'rare' && after.rareName) {
      return {
        kind: 'rare', title: 'RARE FORM', primary: after.rareName,
        secondary: after.speciesName || 'Rare form discovered',
        detail: after.traits.map(words).join(' - '), duration: 8200,
      };
    }
    if (after.stage > before.stage || before.phase === 'young' && after.phase === 'adult') {
      return {
        kind: 'evolve', title: 'EVOLVED', primary: words(after.stageName || after.phase),
        secondary: after.speciesName || 'New form ready',
        detail: after.traits.map(words).join(' - '), duration: 6800,
      };
    }
    if (actionKey === 'incubate' && after.phase === 'egg' && after.progress > before.progress) {
      return {
        kind: 'signal', title: after.progress / after.target >= 0.9 ? 'BREAKOUT' : 'SECRET BOT CARE', primary: after.progress + '/' + after.target,
        secondary: words(result.care_type || 'care') + ' progress', detail: '',
        progress: after.progress, target: after.target, duration: 4200,
      };
    }
    return null;
  }
  // TEST-EXPORT: lifecycleDirector:end

  function lifecycleCeremonyActive(time) {
    return Boolean(lifecycleCeremony && (!lifecycleCeremony.pet_id || lifecycleCeremony.pet_id === (state && state.pet && state.pet.pet_id))
      && lifecycleCeremonyUntil > Number(time == null ? performance.now() : time));
  }

  function clearLifecycleCeremony(redraw) {
    window.clearTimeout(lifecycleCeremonyTimer);
    lifecycleCeremony = null;
    lifecycleCeremonyStartedAt = 0;
    lifecycleCeremonyUntil = 0;
    if (redraw && reducedMotion) drawWorld(performance.now());
  }

  // TEST-EXPORT: lifecycleCeremonyStarter:start
  function startLifecycleCeremony(ceremony) {
    if (!ceremony) return false;
    window.clearTimeout(lifecycleCeremonyTimer);
    lifecycleCeremony = ceremony;
    lifecycleCeremonyStartedAt = performance.now();
    lifecycleCeremonyUntil = lifecycleCeremonyStartedAt + Math.max(3200, Number(ceremony.duration || 6200));
    if (reducedMotion) {
      drawWorld(lifecycleCeremonyStartedAt);
      var activeCeremony = ceremony;
      lifecycleCeremonyTimer = window.setTimeout(function () {
        if (lifecycleCeremony !== activeCeremony) return;
        clearLifecycleCeremony(true);
      }, Math.max(3200, Number(ceremony.duration || 6200)) + 20);
    }
    return true;
  }
  // TEST-EXPORT: lifecycleCeremonyStarter:end

  function scrollToPanel(panelId) {
    if (!panelId) return;
    var focusScreen = activeScreen;
    window.setTimeout(function () {
      if (focusScreen !== activeScreen) return;
      var target = screen.querySelector('[data-panel="' + CSS.escape(panelId) + '"]');
      if (target) {
        if (target.tagName === 'DETAILS') target.open = true;
        rememberPanels();
        var summary = target.querySelector('summary');
        if (summary) summary.focus({ preventScroll: true });
        var screenRect = screen.getBoundingClientRect();
        var relativeTop = target.getBoundingClientRect().top - screenRect.top + screen.scrollTop;
        screen.scrollTo({ top: Math.max(0, relativeTop - 8), behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    }, 0);
  }

  async function showPendingNotices() {
    var notices = state && Array.isArray(state.notices) ? state.notices.filter(function (notice) {
      return notice.scope === 'account' || notice.scope === 'pet' && state.pet && notice.pet_id === state.pet.pet_id && notice.season_key === state.pet.season_key;
    }) : [];
    if (!notices.length || noticesBusy) return;
    noticesBusy = true;
    var visible = notices.slice(0, 1);
    haptic('success');
    tell(visible[0].title + (visible[0].detail ? ' - ' + visible[0].detail : ''));
    try {
      var requestGeneration = beginStateRequest();
      var acknowledged = await post('/telegram-pets/app/action', { action: 'guidance_ack', notices: visible.map(function (notice) {
        return { key: notice.key, scope: notice.scope, pet_id: notice.pet_id, season_key: notice.season_key };
      }), request_id: crypto.randomUUID() });
      if (setStateSnapshot(acknowledged.state, requestGeneration)) render();
    } catch (_) {}
    noticesBusy = false;
  }

  function actionAnimationFamily(action, payload) {
    var key = String(action || '').toLowerCase();
    if (key === 'activity_start') key = String(payload && payload.activity_type || '').toLowerCase();
    if (key === 'greet') return 'greet';
    if (key === 'activity_claim') return 'celebrate';
    if (key === 'activity_cancel') return 'interact';
    if (key === 'energy_drink') return 'fight';
    if (key === 'dance') return 'dance';
    if (key === 'cuddles') return 'victory';
    if (key === 'daily_run_tactic') return 'victory';
    if (key === 'finale_step') return payload && payload.move === 'patch' ? 'interact' : 'fight';
    if (key === 'finale_start' || key === 'finale_retry') return 'battle';
    if (key === 'contract_step') return payload && payload.choice === 'bold' ? 'fight' : payload && payload.choice === 'rest' ? 'sleep' : 'travel';
    if (key === 'contract_start') return 'travel';
    if (/fail|blocked|denied|lose/.test(key)) return 'blocked';
    if (/feed|use_item/.test(key)) return 'feed';
    if (/play/.test(key)) return 'play';
    if (/clean/.test(key)) return 'clean';
    if (/hatch/.test(key)) return 'hatch';
    if (/rare_morph/.test(key)) return 'evolve';
    if (/incubate/.test(key)) return String(payload && payload.care_type || '') === 'music' ? 'play' : String(payload && payload.care_type || '') === 'rest' ? 'sleep' : 'interact';
    if (/sleep|rest/.test(key)) return 'sleep';
    if (/train/.test(key)) return 'train';
    if (/boss|arena|kaiju|fight|attack/.test(key)) return 'battle';
    if (/random_event|event_chain/.test(key)) return 'interact';
    if (/run|adventure|expedition|explore|district/.test(key)) return 'travel';
    if (/job|activity|work/.test(key)) return 'work';
    if (/buy|market|equipment|cosmetic|gear/.test(key)) return 'equip';
    if (/evolve/.test(key)) return 'evolve';
    if (/trade/.test(key)) return 'trade';
    if (/claim|chest|bounty|season|reward|achievement|win/.test(key)) return 'celebrate';
    if (/talk|interact/.test(key)) return 'interact';
    return 'interact';
  }

  function animateAction(action, accepted, duration, payload) {
    animationMode = accepted === false ? 'blocked' : actionAnimationFamily(action, payload);
    actionSequence += 1;
    var animationDuration = duration || 2400;
    actionStartedAt = performance.now();
    animationUntil = sleepLatched && animationMode === 'sleep' ? Number.POSITIVE_INFINITY : actionStartedAt + animationDuration;
    if (reducedMotion) {
      window.clearTimeout(reducedMotionAnimationTimer);
      var sequence = actionSequence;
      drawWorld(performance.now());
      if (!(sleepLatched && animationMode === 'sleep')) {
        reducedMotionAnimationTimer = window.setTimeout(function () {
          if (sequence !== actionSequence) return;
          animationMode = sleepLatched ? 'sleep' : 'idle';
          drawWorld(performance.now());
        }, animationDuration);
      }
    }
  }

  function hatchArtTransitionActive(time) {
    return hatchArtTransitionUntil > Number(time == null ? performance.now() : time);
  }

  function hatchAnimationDuration() {
    var asset = botArtRendererState && botArtRendererState.assetsByRole && botArtRendererState.assetsByRole.egg_hatch;
    var frameCount = Math.max(1, Number(asset && asset.frame_count || asset && asset.frames && asset.frames.length || 25));
    var fps = Math.max(1, Number(asset && asset.fps || 12));
    return Math.ceil(frameCount / fps * 1000);
  }

  // TEST-EXPORT: hatchArtTransition:start
  function startHatchArtTransition(duration, nextSnapshot) {
    window.clearTimeout(hatchArtTransitionTimer);
    var transitionGeneration = ++hatchArtTransitionGeneration;
    var hatchActionSequence = actionSequence;
    var transitionDuration = Math.max(1, Number(duration || hatchAnimationDuration()));
    hatchArtTransitionUntil = performance.now() + transitionDuration;
    hatchStageOnePreloadPromise = window.MoonpetBotArtLoader
      ? window.MoonpetBotArtLoader.loadMoonpetBotArt(botArtIdentity(nextSnapshot)).catch(function (error) {
        console.info('[Moonpet] Stage 1 art preload failed', error);
      })
      : Promise.resolve();
    hatchArtTransitionTimer = window.setTimeout(async function () {
      if (transitionGeneration !== hatchArtTransitionGeneration) return;
      var releaseTimer;
      try {
        hatchArtTransitionUntil = performance.now() + 10000;
        await Promise.race([hatchStageOnePreloadPromise, new Promise(function (resolve) {
          releaseTimer = window.setTimeout(resolve, 10000);
        })]);
      } finally {
        window.clearTimeout(releaseTimer);
        if (transitionGeneration === hatchArtTransitionGeneration) {
          hatchArtTransitionUntil = 0;
          if (hatchActionSequence === actionSequence) {
            animationUntil = 0;
            animationMode = sleepLatched ? 'sleep' : 'idle';
          }
          selectBotArtForState(state).catch(function (error) {
            console.info('[Moonpet] Stage 1 art selection failed after reveal', error);
          });
          if (reducedMotion) drawWorld(performance.now());
        }
      }
    }, transitionDuration + 20);
    return transitionDuration;
  }
  // TEST-EXPORT: hatchArtTransition:end

  async function runAction(action, payload, buttonElement) {
    if (busy) return;
    if (['run_start', 'daily_run_start', 'run_step', 'run_extract', 'daily_run_tactic'].includes(action) && !playOptionsReady()) {
      tell('RUN CONTROLS UNAVAILABLE. TAP REFRESH TO RETRY.', 'danger');
      return;
    }
    if (petActionRefreshRequired) {
      tell('LIVE SAVE REFRESH REQUIRED. TAP REFRESH.', 'danger');
      return;
    }
    if (lifecycleCeremonyActive()) {
      tell('LIFECYCLE REVEAL IN PROGRESS.');
      haptic('light');
      return;
    }
    if (action === 'delete_pet_slot') {
      var petToDelete = String(payload && payload.pet_id || '');
      if (!petToDelete || !window.confirm('Delete ' + (payload.pet_label || 'this pet') + '?\n\nThis pet cannot return to play. A fresh egg will use the same owned space at no XP cost.\n\nAccount XP, currencies, items, competition scores and reward history are kept. This pet\'s training will not transfer.')) return;
      payload = { pet_id: petToDelete, confirm_pet_id: petToDelete, confirmed: true };
    }
    if (action === 'event_close') {
      var eventToClose = String(payload && payload.event_id || '');
      if (!eventToClose || !window.confirm('Close this old Street Event?\n\nIts original outcome could not be verified. Closing it gives up this event without a reward or refund.\n\nIts history, balances and old reward slot are kept. This cannot be undone in the game.')) return;
      payload = { event_id: eventToClose, confirm_event_id: eventToClose, confirmed: true };
    }
    busy = true;
    if (buttonElement) buttonElement.classList.add('is-active');
    haptic('medium');
    var fastResponse = shouldUseFastActionResponse(action);
    var authoritativeSleepClear = ['energy_drink', 'dance', 'cuddles'].includes(String(action || '').toLowerCase());
    var waitForAcceptedAnimation = !fastResponse && authoritativeSleepClear;
    var actionFamily = actionAnimationFamily(action, payload);
    if (sleepLatched && actionFamily !== 'sleep' && !authoritativeSleepClear) setSleepLatch(false);
    if (!waitForAcceptedAnimation) animateAction(action, true, fastResponse ? (actionFamily === 'dance' ? 3600 : 2800) : 8000, payload);
    tell(words(action) + ' in progress...');
    try {
      var stateBeforeAction = state;
      var requestGeneration = beginStateRequest();
      // Bind controls to the pet actually rendered at click time. The Worker
      // validates this identity before and during transactional settlement.
      var requestPayload = Object.assign({
        action: action,
        request_id: crypto.randomUUID(),
        displayed_pet_id: stateBeforeAction && stateBeforeAction.pet && stateBeforeAction.pet.pet_id || null
      }, payload || {});
      if (fastResponse) requestPayload.response_mode = 'result_only';
      else if (activeScreen === 'missions' && stateNeedsFullHydration(stateBeforeAction)) requestPayload.state_mode = 'missions';
      var data = await post('/telegram-pets/app/action', requestPayload);
      if (!data || !data.result || typeof data.result.accepted !== 'boolean') throw new Error('ACTION RESPONSE UNCONFIRMED');
      var actionAccepted = Boolean(data.result && data.result.accepted);
      // Record a confirmed sleep/wake preference on the pet that took the
      // action, before a newer projection can select a different companion.
      if (actionAccepted && actionFamily === 'sleep') setSleepLatch(true, stateBeforeAction);
      else if (authoritativeSleepClear && actionAccepted) setSleepLatch(false, stateBeforeAction);

      if (fastResponse && data.state_pending === true) {
        if (stateRequestGate.isCurrent(requestGeneration)) {
          var staleDisplayedPet = Boolean(data.result && (data.result.refresh_state === true
            || data.result.pet && data.result.pet.pet_id && data.result.pet.pet_id !== (stateBeforeAction && stateBeforeAction.pet && stateBeforeAction.pet.pet_id)
            || (!actionAccepted && ['displayed_pet_required', 'displayed_pet_changed', 'source_pet_changed', 'pet_action_state_changed'].includes(data.result.reason))));
          if (staleDisplayedPet) {
            // Never merge Pet B into Pet A's old snapshot. Block further clicks
            // until a complete authoritative projection has replaced the view.
            if (!actionAccepted) animateAction('blocked', false, 2800, payload);
            var staleMessage = resultMessage(data.result, stateBeforeAction, stateBeforeAction);
            petActionRefreshRequired = true;
            tell(staleMessage + (actionAccepted ? ' // SAVE CONFIRMED' : '') + ' // REFRESHING LIVE SAVE...', actionAccepted ? '' : 'danger');
            haptic(actionAccepted ? 'success' : 'error');
            var staleGeneration = beginStateRequest();
            try {
              var refreshed = await post('/telegram-pets/app/state', stateRefreshPayload(stateBeforeAction, activeScreen));
              if (setStateSnapshot(refreshed.state, staleGeneration)) {
                fastActionStateDirty = false;
                render();
                tell(staleMessage, actionAccepted ? '' : 'danger');
              }
            } catch (_) {
              render();
              tell(staleMessage + (actionAccepted ? ' // SAVE CONFIRMED' : '') + ' // DISPLAY SYNC FAILED. TAP REFRESH.', actionAccepted ? '' : 'danger');
            }
            return;
          }
          state = patchFastActionState(state, data.result, action);
          var fastServerTime = Date.parse(data.server_time || data.result && data.result.server_time || '');
          if (Number.isFinite(fastServerTime)) serverClockOffsetMs = fastServerTime - Date.now();
          if (!actionAccepted) animateAction('blocked', false, 2800, payload);
          var message = resultMessage(data.result, stateBeforeAction, state);
          tell(message + (actionAccepted ? ' // SAVE CONFIRMED' : ''), actionAccepted ? '' : 'danger');
          haptic(actionAccepted ? 'success' : 'error');
          render();
          scheduleFastActionStateRefresh(4000);
        }
        return;
      }

      var responseState = mergeActionResultCooldown(data.state, data.result, action);
      // The action may have committed before its separate state read failed.
      // Preserve that result and the last valid view; Refresh retries only the
      // read, without submitting the paid action a second time.
      if (!responseState && stateRequestGate.isCurrent(requestGeneration)) {
        petActionRefreshRequired = true;
        render();
        tell(resultMessage(data.result, stateBeforeAction, stateBeforeAction) + (actionAccepted ? ' // SAVE CONFIRMED' : '') + ' // DISPLAY SYNC FAILED. TAP REFRESH.', actionAccepted ? '' : 'danger');
        haptic(actionAccepted ? 'success' : 'error');
        animateAction(action, actionAccepted, 2800, payload);
        return;
      }
      var beforePhase = String(stateBeforeAction && stateBeforeAction.lifecycle && stateBeforeAction.lifecycle.phase || '');
      var afterPhase = String(responseState && responseState.lifecycle && responseState.lifecycle.phase || '');
      var isHatchReveal = actionAccepted && beforePhase === 'egg' && afterPhase !== 'egg'
        && stateBeforeAction.pet && responseState.pet && stateBeforeAction.pet.pet_id === responseState.pet.pet_id
        && actionAnimationFamily(action, payload) === 'hatch';
      var hatchDuration = isHatchReveal ? hatchAnimationDuration() : 0;
      if (!setStateSnapshot(responseState, requestGeneration, { deferBotArtSelection: isHatchReveal })) return;
      if (isHatchReveal) {
        animateAction(action, true, hatchDuration + 250, payload);
        animationUntil = Number.POSITIVE_INFINITY;
        // The reveal owns completion while the final hatch frame is held.
        window.clearTimeout(reducedMotionAnimationTimer);
        reducedMotionAnimationTimer = 0;
        startHatchArtTransition(hatchDuration, responseState);
      }
      var nextState = state;
      var plannedCeremony = planLifecycleCeremony(stateBeforeAction, nextState, action, data.result);
      if (plannedCeremony) plannedCeremony.pet_id = nextState.pet && nextState.pet.pet_id;
      var message = resultMessage(data.result, stateBeforeAction, nextState);
      tell(message, data.result && data.result.accepted ? '' : 'danger');
      haptic(data.result && data.result.accepted ? 'success' : 'error');
      render({ discardCallsignDraft: action === 'rename' && Boolean(data.result && data.result.accepted) });
      // Keep the rejection and retry instructions visible. Queued unlock notices
      // remain unacknowledged until the next successful action or refresh.
      if (actionAccepted) await showPendingNotices();
      // Notice acknowledgement can return a newer pet selected in another
      // session. Its companion must not inherit the original action's reveal.
      if ((nextState.pet && nextState.pet.pet_id) !== (state && state.pet && state.pet.pet_id)) return;
      if (!isHatchReveal) animateAction(action, actionAccepted, actionFamily === 'dance' ? 3600 : 2800, payload);
      startLifecycleCeremony(plannedCeremony);
    } catch (error) {
      if (authenticationFailure) {
        tell('TELEGRAM SESSION EXPIRED. OPEN A FRESH SESSION FROM @WIKICOMSBOT.', 'danger');
        haptic('error');
        return;
      }
      // A lost response is not proof that the server rejected the mutation.
      // Require an authoritative read before another click can spend again.
      petActionRefreshRequired = true;
      render();
      var savedResult = data && data.result && typeof data.result.accepted === 'boolean';
      var failureMessage = savedResult
        ? resultMessage(data.result, stateBeforeAction, stateBeforeAction) + (data.result.accepted ? ' // SAVE CONFIRMED' : '')
        : 'ACTION RESPONSE UNCONFIRMED. YOUR SAVE MAY HAVE UPDATED.';
      tell(failureMessage + ' // DISPLAY SYNC FAILED. TAP REFRESH.', actionAccepted ? '' : 'danger');
      animateAction(action, actionAccepted === true, 2800, payload);
      haptic(actionAccepted ? 'success' : 'error');
    } finally {
      busy = false;
      if (buttonElement) buttonElement.classList.remove('is-active');
    }
  }

  function switchScreen(nextScreen) {
    if (!SCREEN_ORDER.includes(nextScreen) || nextScreen === activeScreen) return false;
    if (requestedFocusScreen !== nextScreen) requestedFocus = '';
    activeScreen = nextScreen;
    render();
    if (stateNeedsScreenHydration(state, nextScreen)) hydrateFullState(nextScreen);
    else if (fastActionStateDirty) scheduleFastActionStateRefresh(0);
    return true;
  }

  screen.addEventListener('change', function (event) {
    if (event.target.id !== 'crafting-goal' || !state || !state.pet || busy) return;
    var selected = event.target.value;
    if (selected && !(state.live_systems && state.live_systems.crafting || []).some(function (recipe) { return recipe.key === selected; })) return;
    craftingGoalMemory[state.pet.pet_id] = selected;
    try { window.localStorage.setItem('moonpet-crafting-goal:' + state.pet.pet_id, selected); }
    catch (_) { craftingGoalStorageAvailable = false; }
    render();
    var control = document.getElementById('crafting-goal');
    if (control) control.focus({ preventScroll: true });
  });

  canvasTools.addEventListener('click', function (event) {
    var utility = event.target.closest('[data-utility]');
    if (!utility) return;
    if (utility.dataset.utility === 'audio') toggleAudio();
    else if (utility.dataset.utility === 'radio') toggleRadio();
    else if (utility.dataset.utility === 'sync') syncState();
  });

  screen.addEventListener('click', function (event) {
    var utility = event.target.closest('[data-utility]');
    if (utility) {
      if (utility.dataset.utility === 'guide' || utility.dataset.utility === 'leaderboard') openUtility(utility.dataset.utility);
      else if (utility.dataset.utility === 'retry') window.location.reload();
      else if (utility.dataset.utility === 'module-retry') hydrateFullState(activeScreen, { manual: true });
      return;
    }
    var petGreeting = event.target.closest('[data-pet-greet]');
    if (petGreeting) { canvas.dispatchEvent(new CustomEvent('moonpet:greet')); return; }
    if (lifecycleCeremonyActive()) {
      tell('LIFECYCLE REVEAL IN PROGRESS.');
      haptic('light');
      return;
    }
    var setupButton = event.target.closest('[data-contract-setup]');
    if (setupButton && !setupButton.disabled && !busy) {
      var setup;
      try { setup = JSON.parse(setupButton.dataset.contractSetup); } catch (_) { return; }
      var buildSelect = document.getElementById('contract-build'), tierSelect = document.getElementById('contract-tier'), formatSelect = document.getElementById('contract-format');
      if (!buildSelect || !tierSelect) return;
      var startButton = Array.from(screen.querySelectorAll('[data-action="contract_start"]')).find(function (entry) { return JSON.parse(entry.dataset.payload).goal === setup.goal; });
      if (!startButton || !Array.from(buildSelect.options).some(function (option) { return option.value === setup.build; }) || !Array.from(tierSelect.options).some(function (option) { return option.value === String(setup.tier); })) return;
      if (formatSelect && !Array.from(formatSelect.options).some(function (option) { return option.value === setup.format; })) return;
      buildSelect.value = setup.build; tierSelect.value = String(setup.tier);
      if (formatSelect) formatSelect.value = setup.format;
      tell('SETUP SELECTED // ' + words(setup.build) + ' // TIER ' + setup.tier + ' // ' + words(setup.format || 'standard') + '. Press the focused quest button to start.');
      startButton.focus({ preventScroll: true }); startButton.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
      return;
    }
    var jump = event.target.closest('[data-jump]');
    if (jump && !busy) {
      if (!SCREEN_ORDER.includes(jump.dataset.jump)) {
        tell('ROUTE NOT FOUND.', 'danger');
        haptic('error');
        return;
      }
      var needsModuleHydration = stateNeedsScreenHydration(state, jump.dataset.jump);
      requestedFocus = jump.dataset.focus || '';
      requestedFocusScreen = jump.dataset.jump;
      switchScreen(jump.dataset.jump);
      if (needsModuleHydration) {
        hydrateFullState(jump.dataset.jump);
      } else {
        applyRequestedFocus();
      }
      haptic('light');
      return;
    }
    var target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    var payload = {};
    try { payload = JSON.parse(target.dataset.payload || '{}'); } catch (_) {}
    if (target.dataset.action === 'rename') {
      var input = document.getElementById('pet-name-input');
      payload.pet_name = input ? input.value.trim() : '';
    }
    if (target.dataset.action === 'contract_start') {
      payload.build = document.getElementById('contract-build').value;
      payload.tier = Number(document.getElementById('contract-tier').value);
      var sideGoal = document.getElementById('contract-side-goal');
      if (sideGoal) payload.side_goal = sideGoal.value;
      var routeFormat = document.getElementById('contract-format');
      if (routeFormat) payload.format = routeFormat.value;
    }
    runAction(target.dataset.action, payload, target);
  });

  function companionGreetingVariant(pet) {
    return pet ? 'front_wave' : 'basic';
  }

  function greetCompanion() {
    var now = performance.now();
    if (busy || !state || !state.adopted || animationUntil > now || companionCombatActive(state, activeScreen) || lifecycleCeremonyActive(now)) return;
    companionTapSequence += 1;
    var greetingVariant = companionGreetingVariant(state.pet);
    animateAction('greet', true, greetingVariant === 'front_wave' ? 2200 : 1400, { source: 'pet_tap', sequence: companionTapSequence, variant: greetingVariant });
    haptic('light');

  }

  canvas.addEventListener('moonpet:greet', greetCompanion);

  var BOT_RENDER_CENTER_X = 160;
  var BOT_RENDER_BASELINE_Y = 219;
  var BOT_RENDER_FIT_WIDTH = 184;
  var BOT_RENDER_FIT_HEIGHT = 184;
  var BOT_RENDER_PIVOT_Y = 1;

  function moonpetBotFitBounds() {
    var display = botArtRendererState && botArtRendererState.display || {};
    var fitWidth = Math.max(1, Number(display.fit_width || BOT_RENDER_FIT_WIDTH));
    var fitHeight = Math.max(1, Number(display.fit_height || BOT_RENDER_FIT_HEIGHT));
    var pivotY = Math.max(0, Math.min(1, Number(display.pivot_y || BOT_RENDER_PIVOT_Y)));
    return {
      left: BOT_RENDER_CENTER_X - fitWidth * 0.5,
      right: BOT_RENDER_CENTER_X + fitWidth * 0.5,
      top: BOT_RENDER_BASELINE_Y - fitHeight * pivotY,
      bottom: BOT_RENDER_BASELINE_Y + fitHeight * (1 - pivotY)
    };
  }

  canvas.addEventListener('click', function (event) {
    var bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    var canvasX = (event.clientX - bounds.left) * canvas.width / bounds.width;
    var canvasY = (event.clientY - bounds.top) * canvas.height / bounds.height;
    var botBounds = moonpetBotFitBounds();
    if (canvasX >= botBounds.left && canvasX <= botBounds.right && canvasY >= botBounds.top && canvasY <= botBounds.bottom) greetCompanion();
  });

  canvas.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    greetCompanion();
  });

  utilityLayer.addEventListener('click', function (event) {
    if (event.target === utilityLayer || event.target.closest('[data-utility-close]')) {
      closeUtility();
      return;
    }
    var period = event.target.closest('[data-leaderboard-period]');
    if (period) { loadLeaderboard(period.dataset.leaderboardPeriod); return; }
    if (event.target.closest('[data-open-full-guide]')) openExternalGuide();
  });

  document.addEventListener('keydown', function (event) {
    if (utilityLayer.hidden) return;
    if (event.key === 'Escape') { closeUtility(); return; }
    if (event.key !== 'Tab') return;
    var focusable = Array.from(utilityLayer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) { event.preventDefault(); return; }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var current = document.activeElement;
    if (!utilityLayer.contains(current) || event.shiftKey && current === first) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  });

  nav.addEventListener('click', function (event) {
    var target = event.target.closest('[data-screen]');
    if (!target || busy) return;
    if (lifecycleCeremonyActive()) {
      tell('LIFECYCLE REVEAL IN PROGRESS.');
      haptic('light');
      return;
    }
    switchScreen(target.dataset.screen);
    screen.scrollTop = 0;
    haptic('light');
    if (activeScreen === 'explore' || activeScreen === 'work') refreshLiveState();
  });

  function multiplayerFingerprint(snapshot) {
    var arena = snapshot && snapshot.arena;
    var kaiju = snapshot && snapshot.kaiju && snapshot.kaiju.match;
    return [arena && arena.battle_id, arena && arena.status, arena && arena.current_round, arena && arena.opponent_ready,
      snapshot && snapshot.arena_queue && snapshot.arena_queue.position, kaiju && kaiju.match_id, kaiju && kaiju.status,
      kaiju && kaiju.opponent_card_locked, snapshot && snapshot.kaiju && snapshot.kaiju.queue && snapshot.kaiju.queue.position].join('|');
  }

  // TEST-EXPORT: passiveLiveRefresh:start
  function seasonSnapshotRefreshDue() {
    return seasonRefreshPending || lastSeasonServerRefreshAt <= 0
      || performance.now() - lastSeasonServerRefreshAt >= 300000;
  }

  function mergePetLiveSnapshot(snapshot, patch) {
    if (!snapshot || !snapshot.pet || !patch || patch.pet_id !== snapshot.pet.pet_id
      || patch.season_key !== snapshot.pet.season_key || patch.adopted !== true) return null;
    if (!['arena', 'arena_queue', 'arena_result', 'kaiju', 'activity', 'server_time'].every(function (key) {
      return Object.prototype.hasOwnProperty.call(patch, key);
    }) || !patch.kaiju || typeof patch.kaiju !== 'object') return null;
    // Merge only this projection's fields. A live poll must never replace the
    // hydrated shops, lifecycle, cooldowns or rewards with a partial response.
    return Object.assign({}, snapshot, {
      arena: patch.arena, arena_queue: patch.arena_queue, arena_result: patch.arena_result,
      kaiju: Object.assign({}, snapshot.kaiju, patch.kaiju),
      guidance: Object.assign({}, snapshot.guidance, { activity: patch.activity }),
      server_time: patch.server_time,
    });
  }

  async function refreshLiveState() {
    if (stateNeedsFullHydration(state)) return;
    var multiplayerActive = state && (state.arena || state.arena_queue || state.kaiju && (state.kaiju.match || state.kaiju.queue));
    var activityActive = state && state.guidance && state.guidance.activity;
    var relevant = activeScreen === 'explore' && multiplayerActive || activeScreen === 'work' && activityActive;
    var minimumDelay = multiplayerActive && activeScreen === 'explore' ? 4500 : 14000;
    if (busy || noticesBusy || passiveRefreshInFlight || fastActionStateRefreshInFlight || cooldownRefreshInFlight || seasonRefreshBusy || fullStateHydrationPromise
      || !state || !state.adopted || !relevant || Date.now() - lastPassiveRefreshAt < minimumDelay) return;
    // The five-second timer can run before every aligned season tick. Service
    // its queued/deadline read before starting another live request.
    if (seasonSnapshotRefreshDue() && performance.now() >= seasonRefreshRetryAt) {
      await refreshSeasonSnapshot(false);
      return;
    }
    passiveRefreshInFlight = true;
    var before = multiplayerFingerprint(state);
    var beforeActivity = state.guidance && state.guidance.activity;
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state', { mode: 'live' });
      if (!stateRequestGate.isCurrent(requestGeneration) || authenticationFailure) return;
      // During a coordinated release an older Worker may still return its
      // complete snapshot for an unknown mode. Keep play working in that gap.
      var legacyFull = data.state && data.state.pet && (!data.state.hydration || data.state.hydration.full === true);
      var merged = legacyFull ? data.state : mergePetLiveSnapshot(state, data.state);
      var sourceChanged = data.state && data.state.hydration && data.state.hydration.mode === 'live'
        && (data.state.adopted === false || data.state.adopted === true && typeof data.state.pet_id === 'string'
          && typeof data.state.season_key === 'string' && state.pet
          && (data.state.pet_id !== state.pet.pet_id || data.state.season_key !== state.pet.season_key));
      if (!merged && sourceChanged) {
        // Another device can switch/delete a pet. Its partial data cannot be
        // merged into this pet; obtain the complete newly selected save.
        data = await post('/telegram-pets/app/state', {});
        if (!data.state || stateNeedsFullHydration(data.state)) return;
        merged = data.state;
        legacyFull = true;
      }
      if (!merged) return;
      var nextActivity = merged.guidance && merged.guidance.activity;
      var activityChanged = Boolean((beforeActivity || nextActivity) && (!beforeActivity || !nextActivity
        || beforeActivity.id !== nextActivity.id || beforeActivity.status !== nextActivity.status));
      var terminal = Boolean(data.state.recovery_needed === true || activityChanged
        || state.arena && (!merged.arena || state.arena.battle_id !== merged.arena.battle_id)
        || merged.arena_result && (!state.arena_result || merged.arena_result.battle_id !== state.arena_result.battle_id)
        || state.arena_queue && !merged.arena_queue && !merged.arena
        || state.kaiju && state.kaiju.match && (!(merged.kaiju && merged.kaiju.match)
          || state.kaiju.match.match_id !== merged.kaiju.match.match_id)
        || merged.kaiju && merged.kaiju.result && !(state.kaiju && state.kaiju.result && state.kaiju.result.match_id === merged.kaiju.result.match_id)
        || state.kaiju && state.kaiju.queue && !(merged.kaiju && (merged.kaiju.queue || merged.kaiju.match)));
      if (legacyFull) {
        if (!setStateSnapshot(merged, requestGeneration)) return;
      } else if (terminal) {
        // Interrupted combat and changed/claimed activities need ordered full
        // recovery before publishing their effects on wallet, care or XP.
        data = await post('/telegram-pets/app/state', {});
        if (!data.state || stateNeedsFullHydration(data.state)) return;
        if (!setStateSnapshot(data.state, requestGeneration)) return;
      } else {
        state = merged;
        var serverTime = Date.parse(merged.server_time || '');
        if (Number.isFinite(serverTime)) serverClockOffsetMs = serverTime - Date.now();
      }
      render();
      var after = multiplayerFingerprint(state);
      if (before !== after && activeScreen === 'explore') {
        tell('MULTIPLAYER STATE UPDATED.');
        haptic('light');
      } else if (activeScreen === 'work' && state.guidance && state.guidance.activity && state.guidance.activity.ready
        && (!beforeActivity || beforeActivity.id !== state.guidance.activity.id || !beforeActivity.ready)) {
        tell('TIMED ACTIVITY REWARD READY.');
        haptic('success');
      }
      await showPendingNotices();
    } catch (_) {
      // Retain the last authoritative state and let the next serialized poll
      // retry. This path never invents empty combat or timed-activity results.
    } finally {
      passiveRefreshInFlight = false;
      lastPassiveRefreshAt = Date.now();
    }
  }
  // TEST-EXPORT: passiveLiveRefresh:end

  // TEST-EXPORT: seasonalStateRefresh:start
  async function refreshSeasonSnapshot(force) {
    var monotonicNow = performance.now();
    if (!state || !state.adopted) return;
    if (!force && !seasonSnapshotRefreshDue()) return;
    seasonRefreshPending = true;
    if (!force && monotonicNow < seasonRefreshRetryAt) return;
    if (busy || noticesBusy || seasonRefreshBusy || passiveRefreshInFlight || fastActionStateRefreshInFlight || cooldownRefreshInFlight || fullStateHydrationPromise) return;
    seasonRefreshBusy = true;
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state', {});
      if (!data.state || stateNeedsFullHydration(data.state)) return;
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      seasonRefreshPending = false;
      seasonRefreshRetryAt = 0;
      var scrollTop = screen.scrollTop;
      render();
      screen.scrollTop = scrollTop;
    } catch (_) {
    } finally {
      seasonRefreshBusy = false;
      // A failed or superseded full read stays queued, with bounded retries.
      if (seasonRefreshPending) seasonRefreshRetryAt = performance.now() + 30000;
    }
  }

  function tickSeasonDisplay() {
    if (!state || !state.adopted || busy || noticesBusy) return;
    if (activeScreen === 'home') {
      var scrollTop = screen.scrollTop;
      render();
      screen.scrollTop = scrollTop;
    }
    refreshSeasonSnapshot(false);
  }
  // TEST-EXPORT: seasonalStateRefresh:end

  function drawPixelRect(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  // TEST-EXPORT: companionCombatActive:start
  function companionCombatActive(snapshot, screenKey) {
    if (screenKey !== 'explore' || !snapshot || !snapshot.adopted) return false;
    var arena = snapshot.arena;
    if (arena && hasSystemUnlocked('arena', snapshot) && arena.status !== 'completed' && !arena.outcome) return true;
    var kaiju = snapshot.kaiju && snapshot.kaiju.match;
    if (kaiju && hasSystemUnlocked('kaiju', snapshot) && kaiju.status !== 'completed' && !kaiju.outcome) return true;
    var run = snapshot.run;
    return Boolean(run && ['active', 'extractable'].includes(String(run.status || 'active')));
  }
  // TEST-EXPORT: companionCombatActive:end
  function drawSelectedBotSprite(time, mode, active, x, y, scale) {
    if (!botArtModeEnabled || !botArtRendererReady || !window.MoonpetBotArtRenderer) return false;
    var drew = window.MoonpetBotArtRenderer.renderMoonpetBot(ctx, mode, x, y, scale, time, {
      active: active,
      startedAt: active ? actionStartedAt : 0,
      lifecycle: state && state.lifecycle || {}
    });
    botArtRendererState = window.MoonpetBotArtRenderer.getMoonpetBotArtRendererState();
    if (!drew && !botArtFallbackLogged) {
      botArtFallbackLogged = true;
      console.info('[Moonpet] bot art safe loading state used', botArtRendererState);
    }
    return drew;
  }

  function drawPet(time) {
    var pet = state && state.pet;
    var renderTime = reducedMotion ? performance.now() : time;
    var active = sleepLatched || animationUntil > renderTime;
    var x = BOT_RENDER_CENTER_X;
    var y = BOT_RENDER_BASELINE_Y;
    var styledVictory = !active && state && state.lifecycle && state.lifecycle.phase !== 'egg' && (state.style_loadout && state.style_loadout.equipped || []).includes('victory_pose');
    if (drawSelectedBotSprite(renderTime, styledVictory ? 'victory' : animationMode, active || styledVictory, x, y, 1)) return;
    if (!botArtFallbackLogged) {
      botArtFallbackLogged = true;
      console.info('[Moonpet] bot art unavailable; suppressing retired procedural pet fallback', botArtRendererState);
    }
  }



  var RETRO_SPACE_LOOP_MS = 20000;
  var RETRO_SPACE_TAU = Math.PI * 2;

  // TEST-EXPORT: retroSpaceLoop:start
  function retroSpaceLoopPhase(time) {
    var milliseconds = Number(time) || 0;
    return ((milliseconds % RETRO_SPACE_LOOP_MS) + RETRO_SPACE_LOOP_MS) % RETRO_SPACE_LOOP_MS / RETRO_SPACE_LOOP_MS;
  }
  // TEST-EXPORT: retroSpaceLoop:end

  function drawRetroEnemyShip(x, y, color, wingColor) {
    drawPixelRect(x - 7, y, 15, 3, color);
    drawPixelRect(x - 11, y + 3, 23, 4, color);
    drawPixelRect(x - 15, y + 7, 7, 4, wingColor);
    drawPixelRect(x + 9, y + 7, 7, 4, wingColor);
    drawPixelRect(x - 5, y + 7, 11, 5, '#10162c');
    drawPixelRect(x - 2, y + 9, 5, 2, '#f4ff65');
  }

  function drawRetroPlayerShip(x, y) {
    drawPixelRect(x - 3, y - 10, 7, 14, '#d8f9ff');
    drawPixelRect(x - 8, y - 4, 17, 7, '#61f5ff');
    drawPixelRect(x - 13, y, 7, 5, '#f6a7ff');
    drawPixelRect(x + 7, y, 7, 5, '#f6a7ff');
    drawPixelRect(x - 2, y - 7, 5, 5, '#f4ff65');
    drawPixelRect(x - 6, y + 5, 4, 4, '#ff954f');
    drawPixelRect(x + 3, y + 5, 4, 4, '#ff954f');
  }

  function drawRetroExplosion(x, y, amount) {
    var radius = 2 + Math.floor(amount * 10);
    drawPixelRect(x - radius, y - 1, radius * 2 + 1, 3, '#ff954f');
    drawPixelRect(x - 1, y - radius, 3, radius * 2 + 1, '#ffcf68');
    if (amount > 0.35) {
      drawPixelRect(x - radius + 2, y - radius + 2, 3, 3, '#f6a7ff');
      drawPixelRect(x + radius - 4, y + radius - 4, 3, 3, '#61f5ff');
    }
  }

  function drawRetroSpaceBackground(time) {
    var phase = retroSpaceLoopPhase(time);
    var wave = Math.sin(phase * RETRO_SPACE_TAU);
    drawPixelRect(0, 0, 320, 220, '#03040d');
    drawPixelRect(0, 38, 320, 1, '#172147');
    drawPixelRect(0, 39, 320, 1, '#471d59');

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#25134c';
    ctx.beginPath();
    ctx.arc(282, 48, 30, 0, RETRO_SPACE_TAU);
    ctx.fill();
    ctx.fillStyle = '#165266';
    ctx.beginPath();
    ctx.arc(282, 48, 21, 0, RETRO_SPACE_TAU);
    ctx.fill();
    ctx.restore();

    for (var star = 0; star < 52; star += 1) {
      var starSpeed = star % 3 + 1;
      var starX = (star * 67 + star * star * 3 + 17) % 320;
      var starY = ((star * 43 + 13) % 220 + phase * 220 * starSpeed) % 220;
      var starColor = star % 11 === 0 ? '#f6a7ff' : star % 7 === 0 ? '#61f5ff' : star % 5 === 0 ? '#f4ff65' : '#8190b6';
      var starSize = star % 13 === 0 ? 2 : 1;
      drawPixelRect(starX, starY, starSize, starSize, starColor);
    }

    var formationShift = wave * 13;
    for (var row = 0; row < 3; row += 1) {
      for (var column = 0; column < 6; column += 1) {
        var enemyIndex = row * 6 + column;
        var enemyX = 34 + column * 49 + formationShift * (row % 2 ? -0.65 : 1);
        var enemyY = 55 + row * 27 + Math.sin(phase * RETRO_SPACE_TAU * 2 + enemyIndex) * 3;
        var blastCycle = (phase * 4 + enemyIndex * 0.137) % 1;
        if ((enemyIndex === 4 || enemyIndex === 13) && blastCycle < 0.18) {
          drawRetroExplosion(enemyX, enemyY + 6, blastCycle / 0.18);
        } else {
          drawRetroEnemyShip(enemyX, enemyY, row === 1 ? '#f6a7ff' : '#ff6d6d', row === 2 ? '#61f5ff' : '#ff954f');
        }
      }
    }

    var playerX = 257 + Math.sin(phase * RETRO_SPACE_TAU * 2) * 38;
    var playerY = 187 + Math.cos(phase * RETRO_SPACE_TAU * 4) * 4;
    drawRetroPlayerShip(playerX, playerY);
    for (var shot = 0; shot < 7; shot += 1) {
      var shotProgress = (phase * 7 + shot / 7) % 1;
      var shotX = 257 + Math.sin((phase - shotProgress / 7) * RETRO_SPACE_TAU * 2) * 38;
      drawPixelRect(shotX - 1, 176 - shotProgress * 130, 2, 8, shot % 2 ? '#61f5ff' : '#f4ff65');
    }
    for (var enemyShot = 0; enemyShot < 5; enemyShot += 1) {
      var enemyShotProgress = (phase * 5 + enemyShot * 0.2) % 1;
      drawPixelRect(55 + enemyShot * 52 + wave * 7, 82 + enemyShotProgress * 106, 2, 6, '#ff6d6d');
    }

    drawPixelRect(0, 214, 320, 6, '#080b18');
    drawPixelRect(0, 214, 320, 1, '#61f5ff');
    for (var deck = 0; deck < 16; deck += 1) {
      drawPixelRect(deck * 22 - 7, 217, 12, 1, deck % 2 ? '#f6a7ff' : '#284c78');
    }
  }

  // TEST-EXPORT: petBackground:start
  var PET_BACKGROUND_URL = '/img/BITTY BACKGROUND.jpg';
  function drawPetBackground() {
    if (!petBackgroundImage) {
      petBackgroundImage = new Image();
      petBackgroundImage.decoding = 'async';
      petBackgroundImage.onload = function () {
        petBackgroundReady = petBackgroundImage.naturalWidth > 0 && petBackgroundImage.naturalHeight > 0;
        if (reducedMotion && state) drawWorld(performance.now());
      };
      petBackgroundImage.onerror = function () { petBackgroundReady = false; };
      petBackgroundImage.src = PET_BACKGROUND_URL;
    }
    if (!petBackgroundReady) return false;
    var width = petBackgroundImage.naturalWidth;
    var height = petBackgroundImage.naturalHeight;
    var scale = Math.max(320 / width, 220 / height);
    var cropWidth = 320 / scale;
    var cropHeight = 220 / scale;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(petBackgroundImage, (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, 320, 220);
    ctx.restore();
    backgroundArtState = { mode: 'bitty_background', source: PET_BACKGROUND_URL };
    return true;
  }
  // TEST-EXPORT: petBackground:end

  function stageZeroPresentationActive(time) {
    var phase = String(state && state.lifecycle && state.lifecycle.phase || '');
    return phase === 'egg' || hatchArtTransitionActive(time);
  }

  function ensureStageZeroBackground() {
    if (stageZeroBackgroundImage) return;
    stageZeroBackgroundImage = new Image();
    stageZeroBackgroundImage.decoding = 'async';
    stageZeroBackgroundImage.onload = function () {
      stageZeroBackgroundReady = true;
      if (reducedMotion) drawWorld(performance.now());
    };
    stageZeroBackgroundImage.onerror = function () {
      stageZeroBackgroundReady = false;
      console.info('[Moonpet] Stage 0 background failed to load');
    };
    stageZeroBackgroundImage.src = STAGE_ZERO_BACKGROUND_URL;
  }

  function drawStageZeroBackground() {
    drawPixelRect(0, 0, 320, 220, '#03040d');
    ensureStageZeroBackground();
    if (!stageZeroBackgroundReady) return;
    var sourceWidth = Math.max(1, stageZeroBackgroundImage.naturalWidth || stageZeroBackgroundImage.width);
    var sourceHeight = Math.max(1, stageZeroBackgroundImage.naturalHeight || stageZeroBackgroundImage.height);
    var scale = Math.max(320 / sourceWidth, 220 / sourceHeight);
    var cropWidth = 320 / scale;
    var cropHeight = 220 / scale;
    ctx.drawImage(stageZeroBackgroundImage, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, 320, 220);
  }

  function drawEquippedStyles(time, foreground) {
    var equipped = state && state.style_loadout && state.style_loadout.equipped || [];
    if (!equipped.length) return;
    ctx.save();
    if (!foreground && equipped.includes('run_trail') && activeScreen === 'explore') {
      for (var i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#f6a7ff' : '#61f5ff';
        ctx.globalAlpha = 0.25 + i / 16;
        ctx.fillRect(72 + i * 9, 190 + (reducedMotion ? 0 : Math.sin(time / 180 + i) * 3), 5, 3);
      }
    }
    ctx.globalAlpha = 1;
    if (foreground && equipped.includes('profile_frame')) {
      ctx.strokeStyle = '#f6a7ff'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, 314, 214);
      ctx.strokeStyle = '#61f5ff'; ctx.strokeRect(6, 6, 308, 208);
    }
    ctx.restore();
  }

  // TEST-EXPORT: drawWorld:start
  function drawWorld(time) {
    var renderTime = reducedMotion ? performance.now() : time;

    if (stageZeroPresentationActive(renderTime)) {
      backgroundArtState = { mode: 'stage0_secret_bot', source: STAGE_ZERO_BACKGROUND_URL };
      drawStageZeroBackground();
    } else if (!drawPetBackground()) {
      backgroundArtState = { mode: 'retro_space_loop', loop_ms: 20000, source: 'canvas' };
      drawRetroSpaceBackground(renderTime);
    }

    ctx.save();
    drawEquippedStyles(renderTime, false);
    drawPet(renderTime);
    ctx.restore();
    drawEquippedStyles(renderTime, true);

  }
  // TEST-EXPORT: drawWorld:end

  function sendPerformanceSample(averageFps, slowFramePct, renderDurationMs) {
    if (performanceSent || !state) return;
    performanceSent = true;
    post('/telegram-pets/app/performance', {
      quality_tier: renderQuality, average_fps: Math.min(240, Math.max(0, averageFps)), slow_frame_pct: Math.min(100, Math.max(0, slowFramePct)),
      render_duration_ms: renderDurationMs == null ? null : Math.min(10000, Math.max(0.01, renderDurationMs)),
      device_memory: deviceMemory || null, hardware_concurrency: hardwareConcurrency || null,
      viewport_width: Math.max(1, window.innerWidth), viewport_height: Math.max(1, window.innerHeight), reduced_motion: reducedMotion,
    }).catch(function () {});
  }

  function frame(time) {
    var skipLowFrame = renderQuality === 'low' && performanceLastFrameAt && time - performanceLastFrameAt < LOW_RENDER_INTERVAL_MS;
    if (!skipLowFrame) {
      if (!performanceStartedAt) performanceStartedAt = time;
      var renderDelta = performanceLastFrameAt ? time - performanceLastFrameAt : renderQuality === 'low' ? 33.34 : 16.67;
      performanceLastFrameAt = time;
      performanceFrames += 1;
      if (renderDelta > (renderQuality === 'low' ? 68 : 34)) performanceSlowFrames += 1;
      drawWorld(time);
    }
    if (animationUntil <= time) {
      animationMode = sleepLatched ? 'sleep' : 'idle';
    }
    if (lifecycleCeremony && lifecycleCeremonyUntil <= time) clearLifecycleCeremony(false);
    if (reducedMotion) return;
    if (!skipLowFrame && performanceFrames === 300) {
      var sampleFps = performanceFrames * 1000 / Math.max(1, time - performanceStartedAt);
      if (sampleFps < 42 && renderQuality === 'high') renderQuality = 'medium';
      if (sampleFps < 28) renderQuality = 'low';
    }
    if (!skipLowFrame && !performanceSent && performanceFrames >= 600 && state) {
      var elapsed = Math.max(1, time - performanceStartedAt);
      sendPerformanceSample(performanceFrames * 1000 / elapsed, performanceSlowFrames * 100 / performanceFrames);
    }
    requestAnimationFrame(frame);
  }

  async function start() {
    await waitForTelegramContext();
    bindViewportSizing();
    if (tg) {
      try { tg.ready(); tg.expand(); tg.setHeaderColor('#070707'); tg.setBackgroundColor('#070707'); if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (_) {}
      syncViewportHeight();
    }
    // Sprite loading must never block the game boot/auth path. Start all renderers in
    // the background and keep drawPet in its safe loading state until bot art is ready.
    var spriteStartup = Promise.allSettled([initBotArtMode()]);
    requestAnimationFrame(frame);
    var startupBoot = typeBoot(['MOONPET BIOS 0.9', 'CHECKING TELEGRAM SIGNATURE...', 'CONNECTING TO D1 MEMORY CORE...'], { speed: 10, hold: 180 });
    spriteStartup.then(function () {
      if (state) drawWorld(performance.now());
    });
    await restoreBrowserAuth();
    if (!initData && !telegramAuth) {
      await startupBoot;
      tell('OPEN THIS GAME FROM @WIKICOMSBOT.', 'danger');
      screen.innerHTML = panel('TELEGRAM SIGNATURE REQUIRED',
        '<div class="line">MOONPET OS READS YOUR LIVE SAVE ONLY AFTER TELEGRAM VERIFIES YOUR IDENTITY.</div>' +
        '<div class="line muted">No player data was requested in this browser. Open the signed Mini App, then initialise or resume your Moonpet.</div>' +
        '<div class="button-grid one"><a class="terminal-link-button" href="https://t.me/WIKICOMSBOT?start=moonpet" target="_blank" rel="noopener noreferrer">OPEN MOONPET OS IN TELEGRAM</a>' +
        '<button type="button" class="terminal-button" data-utility="guide">HOW TO PLAY<span class="button-purpose">Read how care, quests, battles and rewards work before choosing a route.</span></button></div>', 'telegram-auth');
      await typeBoot(['AUTHENTICATION NOT FOUND', 'OPEN THE MINI APP INSIDE TELEGRAM', 'NO PLAYER DATA WAS READ'], { speed: 9, hold: 800 });
      return;
    }
    try {
      var requestGeneration = beginStateRequest();
      var initialStateRequest = post('/telegram-pets/app/state', { mode: 'core' });
      await startupBoot;
      var data = await initialStateRequest;
      if (!setStateSnapshot(data.state, requestGeneration)) throw new Error('STALE INITIAL STATE RESPONSE');
      if (reducedMotion) {
        var reducedMotionStartedAt = performance.now();
        render();
        reducedMotionRenderMs = Math.max(1, performance.now() - reducedMotionStartedAt);
        sendPerformanceSample(0, 0, reducedMotionRenderMs);
      } else {
        performanceFrames = 0; performanceSlowFrames = 0; performanceStartedAt = 0; performanceLastFrameAt = 0;
        render();
      }
      if (activeScreen === 'home') queueBackgroundStateHydration();
      if (radioRequestedOn) setRadioEnabled(true, false);
      tell(state.adopted ? 'LIVE SAVE LOADED. CHOOSE A ROUTINE.' : homeNextLine());
      await typeBoot(['SIGNATURE VERIFIED', 'PLAYER SAVE LOADED', 'MOONPET OS READY'], { speed: 8, hold: 320 });
      if (!stateNeedsFullHydration(state)) await showPendingNotices();
      applyRequestedFocus();
      if (stateNeedsScreenHydration(state, activeScreen)) hydrateFullState(activeScreen);
      window.setInterval(refreshLiveState, 5000);
      window.setInterval(tickCooldownDom, 1000);
      window.setInterval(tickSeasonDisplay, 30000);
    } catch (error) {
      var authenticationFailed = Number(error.status) === 401;
      var startupFaultMessage = authenticationFailed ? 'TELEGRAM SESSION EXPIRED OR INVALID. OPEN A FRESH SESSION FROM @WIKICOMSBOT.' : error.message || 'STARTUP FAILED';
      tell(startupFaultMessage, 'danger');
      screen.innerHTML = '<div class="connection-fault">STARTUP FAULT // ' + escapeHtml(error.message || 'API UNAVAILABLE') + '</div>' + (authenticationFailed
        ? '<div class="line muted">Close this game and reopen Moonpet OS from the bot to get a fresh signed Telegram session.</div><div class="button-grid one"><a class="terminal-link-button" href="https://t.me/WIKICOMSBOT?start=moonpet" target="_blank" rel="noopener noreferrer">OPEN FRESH TELEGRAM SESSION</a></div>'
        : '<div class="button-grid one"><button type="button" class="terminal-button" data-utility="retry">RETRY CONNECTION<span class="button-purpose">Reconnect and read your saved pet. No gameplay action is repeated.</span></button></div>');
      await typeBoot(['STARTUP FAULT', startupFaultMessage, authenticationFailed ? 'REOPEN MOONPET OS FROM THE BOT' : 'USE RETRY CONNECTION BELOW'], { speed: 8, hold: 900 });
    }
  }

  window.addEventListener('pagehide', function () {
    window.clearInterval(scoreTimer); scoreTimer = 0;
    radioRequestGeneration += 1;
    if (radioPlayer) radioPlayer.pause();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && radioRequestedOn) setRadioEnabled(true, false);
    if (event.persisted && audioEnabled && !radioRequestedOn) syncMoonpetScore();
    if (event.persisted) refreshSeasonSnapshot(true);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    refreshSeasonSnapshot(true);
    if (performanceSent) return;
    performanceFrames = 0; performanceSlowFrames = 0; performanceStartedAt = 0; performanceLastFrameAt = 0;
  });

  window.MoonpetBetaAppearance = {
    getBotArtState: function () { return botArtRendererState; },
    isBotArtReady: function () { return botArtRendererReady; },
    getBackgroundArtState: function () { return backgroundArtState; }
  };

  start();
}());
