(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var apiConfig = window.MOONBOYS_API || {};
  var apiBase = apiConfig.BASE_URL || 'https://api.cryptomoonboys.com';
  var initData = '';
  var telegramAuth = null;
  var state = null;
  var renderedPetId = null;
  var renderedPetName = '';
  var botArtModeEnabled = moonpetBotArtRequested();
  var botArtRendererReady = false;
  var botArtRendererState = null;
  var botArtFallbackLogged = false;
  var botArtSelectionGeneration = 0;
  var backgroundSelectionGeneration = 0;
  var backgroundArtState = null;
  window.MOONPET_USE_BOT_ART = botArtModeEnabled;
  var seasonSnapshotReceivedAt = 0;
  var lastSeasonServerRefreshAt = 0;
  var seasonRefreshBusy = false;
  var stateRequestGate = createStateRequestGate();
  var serverClockOffsetMs = 0;
  var cooldownRefreshTimer = 0;
  var cooldownRefreshInFlight = false;
  var lastCooldownRefreshKey = '';
  var SCREEN_ORDER = ['home', 'missions', 'explore', 'work', 'economy', 'profile'];
  var requestedScreen = launchParameter('screen');
  var requestedFocus = launchParameter('focus');
  var activeScreen = SCREEN_ORDER.includes(requestedScreen) ? requestedScreen : 'home';
  var busy = false;
  var typingToken = 0;
  var animationMode = 'idle';
  var animationUntil = 0;
  var actionSequence = 0;
  var reducedMotionAnimationTimer = 0;
  var actionResultHoldMs = 3600;
  var actionStartedAt = 0;
  var sleepLatched = false;
  var SLEEP_LATCH_STORAGE_KEY = 'moonpet-botty-sleep-latch-v1';
  var cameraImpactUntil = 0;
  var cameraImpactStrength = 0;
  var feedbackUntil = 0;
  var feedbackRedrawTimer = 0;
  var feedbackTone = '';
  var feedbackLines = [];
  var feedbackReaction = '';
  var feedbackActionMode = '';
  var lifecycleCeremony = null;
  var lifecycleCeremonyStartedAt = 0;
  var lifecycleCeremonyUntil = 0;
  var lifecycleCeremonyTimer = 0;
  var utcHour = new Date().getUTCHours();
  var companionGreeting = '';
  var companionGreetingUntil = 0;
  var companionGreetingTimer = 0;
  var companionTapSequence = 0;
  var companionSeedSpecies = null;
  var companionSeedTemperament = null;
  var companionSeedMarking = null;
  var companionSeedName = null;
  var companionSeedValue = 0;
  var combatSnapshot = null;
  var combatScreen = '';
  var COMBAT_RIVAL_COLORS = ['#ff6d6d', '#ff954f', '#f6a7ff', '#61f5ff', '#f4ff65', '#c99cff'];
  var COMBAT_ARENA_SPECIAL_MAX = 3;
  var COMBAT_PRESENTATION_FRAME = {
    active: false, mode: '', title: '', status: '', opponentName: '', round: 0, maxRounds: 0,
    playerValue: 0, opponentValue: 0, maxValue: 100, playerSpecial: 0, opponentSpecial: 0,
    playerCardKey: '', opponentCardKey: '', rivalColor: '#ff6d6d', source: null,
  };
  var noticesBusy = false;
  var lastPassiveRefreshAt = 0;
  var reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var audioContext = null;
  var audioEnabled = readAudioPreference();
  var scoreTimer = 0;
  var scoreStep = 0;
  var radioPlayer = null;
  var radioLoadPromise = null;
  var radioEnabled = readRadioPreference();
  var radioRequestedOn = radioEnabled;
  var radioRequestGeneration = 0;
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
  var screen = document.getElementById('screen');
  var nav = document.getElementById('nav');
  var output = document.getElementById('terminal-output');
  var bootLayer = document.getElementById('boot-layer');
  var bootText = document.getElementById('boot-text');
  var title = document.getElementById('system-title');
  var clock = document.getElementById('system-clock');
  var utilityLayer = document.getElementById('utility-layer');
  var utilityTitle = document.getElementById('utility-title');
  var utilityContent = document.getElementById('utility-content');
  var utilityReturnFocus = null;
  var activeUtility = '';
  var utilityRequestGeneration = 0;

  // TEST-EXPORT: worldBackgroundLoader:start
  var DEFAULT_WORLD_BACKGROUND_URL = '/games/assets/BITTY%20BACKGROUND.jpg';
  var worldBackgroundUrl = '';
  var worldBackgroundImage = null;
  var worldBackgroundReady = false;
  var worldBackgroundLoadGeneration = 0;
  var failedWorldBackgroundUrls = Object.create(null);

  function setWorldBackground(imagePath) {
    var nextUrl = String(imagePath || DEFAULT_WORLD_BACKGROUND_URL);
    if (failedWorldBackgroundUrls[nextUrl]) nextUrl = DEFAULT_WORLD_BACKGROUND_URL;
    if (nextUrl === worldBackgroundUrl && worldBackgroundReady) return;
    var generation = ++worldBackgroundLoadGeneration;
    var candidateImage = new Image();
    candidateImage.onload = function () {
      if (generation !== worldBackgroundLoadGeneration) return;
      worldBackgroundImage = candidateImage;
      worldBackgroundUrl = nextUrl;
      worldBackgroundReady = true;
      if (state) drawWorld(performance.now());
    };
    candidateImage.onerror = function () {
      if (generation !== worldBackgroundLoadGeneration) return;
      failedWorldBackgroundUrls[nextUrl] = true;
      console.error('[Moonpet] world background failed to load:', nextUrl);
      if (nextUrl !== DEFAULT_WORLD_BACKGROUND_URL) setWorldBackground(DEFAULT_WORLD_BACKGROUND_URL);
    };
    candidateImage.src = nextUrl;
  }
  setWorldBackground(DEFAULT_WORLD_BACKGROUND_URL);
  // TEST-EXPORT: worldBackgroundLoader:end

  function currentPetSleepKey(snapshot) {
    var pet = snapshot && snapshot.pet || {};
    return String(pet.pet_id || pet.id || '');
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

  function setSleepLatch(value) {
    sleepLatched = Boolean(value);
    var petKey = currentPetSleepKey(state);
    if (!petKey) return sleepLatched;
    try {
      var saved = JSON.parse(window.localStorage.getItem(SLEEP_LATCH_STORAGE_KEY) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
      if (sleepLatched) saved[petKey] = true;
      else delete saved[petKey];
      window.localStorage.setItem(SLEEP_LATCH_STORAGE_KEY, JSON.stringify(saved));
    } catch (_) {}
    return sleepLatched;
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

  function loadApprovedSpriteScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        // Static parser-loaded scripts that appear before moonpet-mini-app.js have
        // already executed. Waiting for a second load event deadlocks forever.
        if (existing.dataset.approvedSpriteAdapter !== 'true' || existing.dataset.loaded === 'true') {
          resolve();
          return;
        }
        existing.addEventListener('load', function () {
          existing.dataset.loaded = 'true';
          resolve();
        }, { once: true });
        existing.addEventListener('error', function () { reject(new Error(src + ' failed to load')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.approvedSpriteAdapter = 'true';
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        reject(new Error(src + ' failed to load'));
      };
      document.head.appendChild(script);
    });
  }

  function botArtIdentity(snapshot) {
    var lifecycle = snapshot && snapshot.lifecycle || {};
    var pet = snapshot && snapshot.pet || {};
    return {
      speciesId: String(lifecycle.species_id || pet.species || ''),
      speciesName: String(lifecycle.species_name || ''),
      evolutionStage: Number(pet.evolution_stage || lifecycle.evolution_stage || lifecycle.stage || 1)
    };
  }

  async function selectWorldBackgroundForState(snapshot) {
    if (!window.MoonpetArtResolver) return false;
    var generation = ++backgroundSelectionGeneration;
    var lifecycle = snapshot && snapshot.lifecycle || {};
    var result = await window.MoonpetArtResolver.loadMoonpetBackground(
      botArtIdentity(snapshot),
      String(lifecycle.rare_morph_id || lifecycle.rare && lifecycle.rare.id || lifecycle.rare_morph || '')
    );
    if (generation !== backgroundSelectionGeneration) return false;
    backgroundArtState = result;
    setWorldBackground(result && result.imagePath);
    return Boolean(result && result.imagePath);
  }

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
      await loadApprovedSpriteScript('/js/moonpet-art-resolver.js?v=20260926-evolution-art-foundation-v1');
      await loadApprovedSpriteScript('/js/moonpet-bot-art-loader.js?v=20260926-evolution-art-foundation-v1');
      await loadApprovedSpriteScript('/js/moonpet-bot-art-renderer.js?v=20260926-evolution-art-foundation-v1');
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

  function refreshTelegramContext() {
    tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : tg;
    initData = String(tg && tg.initData || launchParameter('tgWebAppData') || '');
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

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function words(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
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
    try { return window.localStorage.getItem('arcade_radio_on') === 'true'; } catch (_) { return false; }
  }

  function saveRadioPreference(on) {
    try { window.localStorage.setItem('arcade_radio_on', on ? 'true' : 'false'); } catch (_) {}
  }

  function loadRadioPlayer() {
    if (radioPlayer) return Promise.resolve(radioPlayer);
    if (!radioLoadPromise) {
      radioLoadPromise = import('/js/arcade/core/radio.js?v=20260814-moonpet-aaa-pass').then(function (radio) {
        radioPlayer = new Audio(radio.ARCADE_RADIO_URL);
        radioPlayer.preload = 'none';
        radioPlayer.volume = 0.5;
        return radioPlayer;
      }).catch(function (error) {
        radioLoadPromise = null;
        throw error;
      });
    }
    return radioLoadPromise;
  }

  async function setRadioEnabled(on, announce) {
    radioRequestedOn = Boolean(on);
    var requestGeneration = ++radioRequestGeneration;
    if (!on) {
      if (radioPlayer) radioPlayer.pause();
      radioEnabled = false;
      saveRadioPreference(false);
      syncMoonpetScore();
      if (state) render();
      if (announce !== false) tell('GRAFFPUNKS RADIO OFFLINE.');
      return false;
    }
    if (state) render();
    try {
      var player = await loadRadioPlayer();
      if (requestGeneration !== radioRequestGeneration || !radioRequestedOn) return false;
      await player.play();
      if (requestGeneration !== radioRequestGeneration) {
        if (!radioRequestedOn) player.pause();
        return false;
      }
      radioEnabled = true;
      saveRadioPreference(true);
      syncMoonpetScore();
      if (state) render();
      if (announce !== false) tell('GRAFFPUNKS RADIO LIVE.');
      return true;
    } catch (_) {
      radioRequestedOn = false;
      radioEnabled = false;
      saveRadioPreference(false);
      syncMoonpetScore();
      if (state) render();
      if (announce !== false) tell('RADIO STREAM BLOCKED. TAP RADIO TO RETRY.', 'danger');
      return false;
    }
  }

  function toggleRadio() {
    haptic('light');
    return setRadioEnabled(!radioRequestedOn, true);
  }

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
    render();
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

  async function post(path, payload) {
    var response = await fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, authBody(), payload || {})),
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok && response.status !== 409) throw new Error(data.error || 'NETWORK HANDSHAKE FAILED');
    return data;
  }

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

  function tell(message, tone) {
    output.dataset.tone = tone || '';
    output.textContent = String(message || 'READY.');
  }

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
    if (options.futureExpansion) return 'FUTURE EXPANSION';
    if (options.disabled) return 'LOCKED';
    return 'Ready now';
  }

  function availabilityDetail(options) {
    options = options || {};
    var label = availabilityLabel(options);
    var detail = options.detail ? String(options.detail) : '';
    return detail ? label + ' // ' + detail : label;
  }

  function availabilityDetailMarkup(options) {
    options = options || {};
    var label = options.cooldown ? countdownMarkup(options.cooldown, 'Available in ') : escapeHtml(availabilityLabel(options));
    var detail = options.detail ? String(options.detail) : '';
    return detail ? label + ' // ' + escapeHtml(detail) : label;
  }

  function shouldShowAvailability(options) {
    options = options || {};
    return Boolean(
      options.detail
      || options.disabled
      || options.futureExpansion
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
  // TEST-EXPORT: actionAvailability:end

  function button(label, action, payload, options) {
    options = actionCooldownButtonOptions(action, options);
    var disabled = options && options.disabled;
    var detail = shouldShowAvailability(options)
      ? '<small>' + availabilityDetailMarkup(options) + '</small>'
      : '';
    return '<button class="terminal-button' + (options && options.danger ? ' danger' : '') + '" type="button" data-action="' + escapeHtml(action) + '" data-payload="' + escapeHtml(JSON.stringify(payload || {})) + '"' + (disabled ? ' disabled' : '') + '>' + escapeHtml(label) + detail + '</button>';
  }

  function panel(name, body, panelId) {
    return '<section class="panel"' + (panelId ? ' data-panel="' + escapeHtml(panelId) + '"' : '') + '><h2 class="panel-title">' + escapeHtml(name) + '</h2><div class="panel-body">' + body + '</div></section>';
  }

  function recommendedFocus(next) {
    var key = String(next && next.key || '') + ' ' + String(next && next.action || '') + ' ' + String(next && next.callback_data || '');
    if (/feed|sleep|clean|play|health/.test(key)) return 'care';
    if (/activity/.test(key)) return 'timed-activity';
    if (/mission/.test(key)) return 'missions';
    if (/evol/.test(key)) return 'evolution';
    if (/season/.test(key)) return 'season';
    if (/achievement|trait/.test(key)) return 'achievements';
    if (/weekly.boss/.test(key)) return 'weekly-boss';
    if (/seasonal.boss/.test(key)) return 'seasonal-boss';
    if (/district/.test(key)) return 'districts';
    if (/event.chain/.test(key)) return 'story-chains';
    if (/arena/.test(key)) return 'arena';
    if (/kaiju/.test(key)) return 'kaiju';
    if (/run|adventure/.test(key)) return 'moon-run';
    if (/job|work/.test(key)) return 'jobs';
    if (/bount/.test(key)) return 'bounties';
    if (/expedition/.test(key)) return 'expedition';
    if (/market/.test(key)) return 'market';
    if (/cosmetic/.test(key)) return 'style-lab';
    if (/gear|upgrade/.test(key)) return 'equipment';
    if (/shop|buy/.test(key)) return 'shop';
    return 'care';
  }

  function meter(label, value, invert) {
    var amount = Math.max(0, Math.min(100, Number(value) || 0));
    if (invert) amount = 100 - amount;
    return '<div class="meter"><span>' + escapeHtml(label) + '</span><span class="meter-track"><span class="meter-fill" style="width:' + amount + '%"></span></span><strong>' + Math.floor(amount) + '</strong></div>';
  }

  var SECTION_JUMPS = {
    explore: [['districts', 'DISTRICTS'], ['moon-run', 'RUN'], ['weekly-boss', 'BOSS'], ['story-chains', 'STORIES'], ['seasonal-boss', 'RAID'], ['arena', 'ARENA'], ['kaiju', 'KAIJU']],
    economy: [['equipment', 'GEAR'], ['materials', 'MATERIALS'], ['bounties', 'BOUNTIES'], ['expedition', 'EXPEDITION'], ['market', 'MARKET'], ['shop', 'SHOP'], ['inventory', 'BAG'], ['trade', 'TRADE']],
    profile: [['rare-morph', 'RARE'], ['memories', 'MEMORY'], ['callsign', 'NAME'], ['evolution', 'EVOLVE'], ['season', 'SEASON'], ['leaderboard', 'RANKS']],
  };

  function utilityRail() {
    return '<nav class="utility-rail" aria-label="Game utilities">' +
      '<button type="button" class="utility-button" data-utility="guide">HOW TO PLAY</button>' +
      '<button type="button" class="utility-button" data-utility="leaderboard">LEADERBOARD</button>' +
      '<button type="button" class="utility-button" data-utility="audio" aria-pressed="' + (audioEnabled ? 'true' : 'false') + '">AUDIO ' + (audioEnabled ? 'ON' : 'OFF') + '</button>' +
      '<button type="button" class="utility-button" data-utility="radio" aria-pressed="' + (radioRequestedOn ? 'true' : 'false') + '">RADIO ' + (radioRequestedOn ? 'ON' : 'OFF') + '</button>' +
      '<button type="button" class="utility-button" data-utility="sync">REFRESH</button>' +
      '</nav>';
  }

  function sectionJumpBar(screenKey) {
    var jumps = SECTION_JUMPS[screenKey] || [];
    if (!jumps.length) return '';
    return '<nav class="section-jumps" aria-label="' + escapeHtml(words(screenKey)) + ' shortcuts">' + jumps.map(function (jump) {
      return '<button type="button" class="jump-button" data-panel-jump="' + escapeHtml(jump[0]) + '">' + escapeHtml(jump[1]) + '</button>';
    }).join('') + '</nav>';
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
    return '<div class="guide-step"><strong>1 // WAKE THE EGG</strong>Initialise your Moon Egg, then use at least three kinds of incubation care. Your care pattern shapes the hatch.</div>' +
      '<div class="guide-step"><strong>2 // PLAY THE CURRENT BUILD</strong>PET handles care, TASKS tracks Daily Journey and Weekly Journey, WORK covers jobs and timers, and RUN handles bosses plus Moon Run.</div>' +
      '<div class="guide-step"><strong>3 // KEEP NEEDS STABLE</strong>Feed, play, clean and rest. Training, care and daily routines build Pet XP, specialist XP, personality, aptitudes and equipment mastery.</div>' +
      '<div class="guide-step"><strong>4 // FOLLOW THE ROUTE</strong>The PET screen recommends the best next move. Daily Journey, Weekly Journey, missions and achievements are current gameplay priorities.</div>' +
      '<div class="guide-step"><strong>5 // BUILD YOUR LOADOUT</strong>GEAR contains equipment, materials, bounties, market offers, inventory and upgrades. Districts show an objective, opponent and route before you commit. ' + combatGuideCopy + ' Moon Run reaches 100 rooms—extract to bank unbanked rewards.</div>' +
      '<div class="guide-step"><strong>6 // IDENTITY AND ROADMAP</strong>CORE tracks personality, aptitudes, memories, evolution and season rewards. Advanced Traits, Breeding, Lineage, Fusion, Sanctuary and Prestige remain coming soon.</div>' +
      '<div class="guide-step"><strong>CURRENCIES</strong>Pet XP raises level. Moon Gold buys common upgrades. Gems unlock premium routes. Style unlocks cosmetics. Energy powers demanding actions.</div>' +
      '<div class="button-grid one"><button type="button" class="terminal-button" data-open-full-guide>OPEN COMPLETE WEBSITE GUIDE</button></div>';
  }
  // TEST-EXPORT: guideMarkup:end

  function leaderboardRowsMarkup(entries, self, period) {
    var rows = (entries || []).map(function (entry) {
      var form = entry.phase === 'rare' ? entry.rare_morph_name : entry.species_name || (entry.phase === 'egg' ? 'Moon Egg' : entry.stage);
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
      utilityContent.innerHTML = '<div class="period-tabs">' + tabs + '</div><div class="line muted">' + (selected === 'run_depth' ? 'DEEPEST ROOM RANKS' : 'PET XP RANKS') + ' // ' + escapeHtml(words(data.period || selected)) + '</div>' + leaderboardRowsMarkup(data.entries, data.self, selected);
    } catch (error) {
      if (generation !== utilityRequestGeneration || utilityLayer.hidden || activeUtility !== 'leaderboard') return;
      utilityContent.innerHTML = '<div class="connection-fault">RANKING LINK FAILED // ' + escapeHtml(error.message || 'CONNECTION FAILED') + '</div><div class="button-grid one"><button type="button" class="terminal-button" data-leaderboard-period="' + selected + '">RETRY LEADERBOARD</button></div>';
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
    busy = true;
    tell('REFRESHING LIVE SAVE...');
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state');
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      render();
      tell('LIVE SAVE REFRESHED.');
      haptic('success');
    } catch (error) {
      tell(error.message || 'REFRESH FAILED', 'danger');
      haptic('error');
    } finally { busy = false; }
  }

  function applyRequestedFocus() {
    if (!requestedFocus) return;
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
      state: stateLabel === 'AVAILABLE' ? 'AVAILABLE' : stateLabel === 'COMING_SOON' ? 'COMING_SOON' : 'LOCKED',
      unlocked: system.unlocked === true,
      active: system.active === true,
      reason: system.reason || (stateLabel === 'COMING_SOON' ? 'feature_not_available' : 'capability_unavailable'),
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
      futureExpansion: true,
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
    if (eggJourneyLocked) {
      return '<div class="line locked">DAILY JOURNEY // HATCH REQUIRED</div>' +
        '<div class="line muted">Journey progress starts after HATCH MOONPET creates an active companion.</div>' +
        '<div class="line muted">NEXT // Incubate or HATCH MOONPET before Daily Journey progress starts.</div>';
    }
    if (dailyReason === 'active_pet_required') {
      return '<div class="line locked">DAILY JOURNEY // ACTIVE PET REQUIRED</div>' +
        '<div class="line muted">Journey progress starts after you have a hatched active Moonpet.</div>' +
        '<div class="line muted">NEXT // Initialise, incubate, or hatch your Moonpet before Daily Journey progress starts.</div>';
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
        '<div class="line muted">Growth Marks // ' + number(growth.earned) + '/' + number(growth.required) + ' earned by this pet this season. Duplicate Growth Marks for the same UTC day are blocked by authority.</div>'
      : '<div class="line locked">DAILY JOURNEY // SYNCING</div><div class="line muted">' + escapeHtml(dailyJourneyNextAction(dailyAuthority, completedMissions, guidance, stateValue)) + '</div>';
  }
  // TEST-EXPORT: dailyJourneyMarkup:end

  // TEST-EXPORT: weeklyJourneyMarkup:start
  function weeklyObjectiveLabel(objective) {
    return objective.name || objective.title || ({
      weekly_care: 'Weekly care actions',
      weekly_training: 'Weekly training sessions',
      weekly_run: 'Daily Moon Runs',
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
    if (weeklyReason === 'active_pet_required') return 'Initialise, incubate, hatch, or select an active seasonal Moonpet before Weekly Journey progress starts.';
    if (weeklyState === 'COMING_SOON') return 'Weekly Journey is planned expansion.';
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
        '<div class="line muted">No Daily or Weekly objective progress is shown until you have an active hatched seasonal Moonpet.</div>';
    }
    if (!weeklyReady) {
      var waitingTitle = weeklyState === 'COMING_SOON'
        ? 'WEEKLY JOURNEY // PLANNED EXPANSION'
        : weeklyReason === 'active_pet_required' ? 'WEEKLY JOURNEY // ACTIVE PET REQUIRED' : 'WEEKLY JOURNEY // SYNCING';
      var waitingCopy = weeklyState === 'COMING_SOON'
        ? (weeklyCapability.message || weeklyAuthority.reason || 'Weekly Journey is planned expansion.')
        : weeklyReason === 'active_pet_required'
          ? 'Journey progress starts after you have a hatched active Moonpet.'
          : (weeklyCapability.message || weeklyAuthority.reason || 'Weekly Journey authority is syncing. Progress display will refresh when server authority is available.');
      var waitingDetail = weeklyState === 'COMING_SOON'
        ? 'Weekly Journey objectives will appear when this system is available.'
        : weeklyReason === 'active_pet_required'
          ? 'No Daily or Weekly objective progress is shown until you have an active hatched seasonal Moonpet.'
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
        escapeHtml(label) + ' // ' + number(Math.min(progress, target)) + '/' + number(target) + ' // ' + (complete ? 'COMPLETE' : 'INCOMPLETE') + '</div>';
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
    var summary = state.season_slots || {};
    var slot = activeSeasonSlot();
    var progression = activePetProgression();
    var lifecycle = progression.lifecycle || {};
    var growth = progression.growth_marks || {};
    var crests = progression.weekly_crests || {};
    var seasonKey = slot.season_key || summary.season && summary.season.key || 'CURRENT';
    var status = progression.season_complete ? 'COMPLETED ADULT PET'
      : lifecycle.evolution_ready ? 'ELIGIBLE TO EVOLVE' : 'KEEP DAILY AND WEEKLY ROUTINES MOVING';
    return panel('ACTIVE PET // SLOT ' + number(slot.slot_number || 1),
      '<div class="season-identity"><strong>' + escapeHtml(pet.pet_name || 'Moonpet') + '</strong><span>' + escapeHtml(seasonKey) + '</span></div>' +
      '<div class="season-status-grid"><div><span>STAGE</span><strong>' + escapeHtml(words(pet.stage || lifecycle.phase || 'egg')) + '</strong></div><div><span>LEVEL</span><strong>' + number(pet.level) + '</strong></div><div><span>GROWTH MARKS</span><strong>' + number(growth.earned) + '/' + number(growth.required) + '</strong></div><div><span>WEEKLY CRESTS</span><strong>' + number(crests.earned) + '/' + number(crests.required) + '</strong></div></div>' +
      '<div class="line complete">' + status + '</div><div class="line muted">NEXT // ' + escapeHtml(profileNextLine()) + '</div><div class="line muted">Progress is per pet. Switching slots changes which Moonpet earns lifecycle, Daily Journey and Weekly Journey progress.</div>', 'active-pet');
  }

  function profileNextLine() {
    var seasonSlots = state && state.season_slots || {};
    var slot = activeSeasonSlot();
    var progression = activePetProgression();
    var authoritativeLifecycle = state && state.lifecycle || {};
    var progressionLifecycle = progression.lifecycle || {};
    var phase = String(authoritativeLifecycle.phase || progressionLifecycle.phase || '').toLowerCase();
    var evolutionReady = Boolean(authoritativeLifecycle.evolution_ready || progressionLifecycle.evolution_ready);
    if (!state || !state.adopted || !state.pet) return 'Initialise a Moon Egg to begin.';
    if (phase === 'egg') return authoritativeLifecycle.incubation && authoritativeLifecycle.incubation.ready ? 'HATCH MOONPET to wake your first companion.' : 'Incubate your Moon Egg until the hatch signal is ready.';
    if (seasonSlots.unavailable) return 'Season slot authority is syncing. Active Moonpet guidance will refresh when server authority is available.';
    if (!slot.pet_id) return 'Pick an active seasonal Moonpet before journey progress starts.';
    if (evolutionReady) return 'Evolve your active Moonpet when you are ready.';
    if (isNewlyHatchedFirstSessionPet(phase, progression)) return 'Start with first care, then follow the first server-authoritative Journey objective when it appears.';
    return 'Keep the active seasonal Moonpet moving through Daily and Weekly Journey objectives.';
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

  function homeNextLine(next) {
    var lifecycle = state && state.lifecycle || {};
    var incubation = lifecycle.incubation || {};
    if (!state || !state.adopted) return 'Initialise a Moon Egg to begin.';
    if (lifecycle.phase === 'egg') {
      return incubation.ready ? 'HATCH MOONPET to wake your first companion.' : 'Incubate with care signals until the hatch signal is ready.';
    }
    return next && next.title ? String(next.title) : 'Keep needs stable and follow the recommended route.';
  }

  function exploreNextLine() {
    var firstSession = firstSessionPhase();
    if (firstSession === 'unadopted') return 'Initialise a Moon Egg to begin.';
    if (firstSession === 'egg') return 'Incubate or HATCH MOONPET before Explore actions open.';
    if (state && state.run) return 'Resolve the visible Moon Run room or extract to bank rewards.';
    var boss = state && state.guidance && state.guidance.weekly_boss || {};
    var weekly = state && state.weekly_journey || {};
    var objectives = Array.isArray(weekly.objectives) ? weekly.objectives : [];
    var bossObjective = objectives.find(function (objective) { return String(objective.objective_id || '') === 'weekly_boss_attempt'; });
    if (bossObjective && !bossObjective.completed && Number(bossObjective.progress || 0) < Number(bossObjective.target || 1)) {
      return boss.available ? 'Complete Weekly boss attempt to progress Weekly Journey.' : 'Build level and energy before the Weekly boss attempt.';
    }
    var energy = Number(state && state.pet && state.pet.energy);
    if (Number.isFinite(energy) && energy < 12) return 'Restore energy before starting a Moon Run.';
    return 'Start a Moon Run or pick an available Explore action.';
  }

  function firstSessionExploreMarkup() {
    var phase = firstSessionPhase();
    if (!phase) return '';
    var nextLine = exploreNextLine();
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
        district: 'Initialise a Moon Egg before district routes, bosses, Arena, Kaiju, or pet work open.',
        run: 'Moon Run opens after you have a hatched active Moonpet.',
        journey: 'Journey progress starts after you have a hatched active Moonpet.',
      }
      : {
        district: 'Your Moon Egg is still forming. Incubate it before district routes, bosses, Arena, Kaiju, or pet work open.',
        run: 'Moon Run opens after HATCH MOONPET creates an active companion.',
        journey: 'Journey progress starts after hatching, when server authority can bind objectives to the active pet.',
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
      panel('WEEKLY BOSS // LOCKED', '<div class="line muted">' + escapeHtml(copy.journey) + '</div>', 'weekly-boss') +
      panel('STREET STORY CHAINS', '<div class="line muted">' + escapeHtml(copy.journey) + '</div>', 'story-chains') +
      panel('SEASONAL RAID', '<div class="line muted">' + escapeHtml(copy.journey) + '</div>', 'seasonal-boss') +
      panel('PET ARENA', arenaBody, 'arena') +
      panel('KAIJU CODE CARDS', kaijuBody, 'kaiju');
  }
  // TEST-EXPORT: nextGuidance:end

  function renderHome() {
    if (!state.adopted) {
      return panel('DORMANT MOON EGG', '<div class="line">NO COMPANION RECORD FOUND.</div><div class="line muted">NEXT // ' + escapeHtml(homeNextLine()) + '</div><div class="button-grid one">' + button('INITIALISE MOONPET', 'adopt') + '</div>');
    }
    var pet = state.pet;
    var lifecycle = state.lifecycle || {};
    var incubation = lifecycle.incubation || {};
    if (lifecycle.phase === 'egg') {
      var signals = incubation.signals || {};
      return '<div class="ticker"><span>MOON EGG // SIGNAL ' + number(incubation.progress) + '/' + number(incubation.target) + ' // IDENTITY FORMING //</span></div>' +
        panel('INCUBATION CHAMBER', '<div class="line complete">THE EGG REMEMBERS HOW YOU TREAT IT.</div><div class="line muted">NEXT // ' + escapeHtml(homeNextLine()) + '</div><div class="line muted">Use at least three types of care. Your pattern shapes the hatch; no species odds are exposed.</div>' + meter('HATCH SIGNAL', Number(incubation.progress || 0) / Math.max(1, Number(incubation.target || 12)) * 100) + '<div class="line">WARM ' + number(signals.warm) + ' // TALK ' + number(signals.talk) + ' // MUSIC ' + number(signals.music) + ' // REST ' + number(signals.rest) + '</div><div class="button-grid">' + button('WARM EGG', 'incubate', { care_type: 'warm' }) + button('TALK TO EGG', 'incubate', { care_type: 'talk' }) + button('PLAY A BEAT', 'incubate', { care_type: 'music' }) + button('LET IT REST', 'incubate', { care_type: 'rest' }) + '</div><div class="button-grid one">' + button('HATCH MOONPET', 'hatch', {}, { disabled: !incubation.ready, eggRequired: !incubation.ready }) + '</div><div class="line muted">DAILY SIGNALS ' + number(incubation.actions_today) + '/' + number(incubation.daily_cap) + '</div>', 'incubation') +
        renderSeasonSlots();
    }
    var next = state.next || {};
    var nextKey = String(next.key || '') + ' ' + String(next.callback_data || '') + ' ' + String(next.title || '');
    var nextScreen = next.destination || (/buy|shop|market|bount|econom|gear|cosmetic/i.test(nextKey) ? 'economy' : /run|boss|arena|adventure|district|event.chain/i.test(nextKey) ? 'explore' : /job|work|activity/i.test(nextKey) ? 'work' : /mission/i.test(nextKey) ? 'missions' : /evol|season|achievement|trait/i.test(nextKey) ? 'profile' : 'home');
    var focus = recommendedFocus(next);
    var equipped = ['food', 'toy', 'outfit', 'armor', 'weapon', 'charm'].map(function (slot) {
      return '<div class="line"><strong>' + slot.toUpperCase() + '</strong> // ' + escapeHtml(words(pet['equipped_' + slot] || (slot === 'food' ? 'basic food' : slot === 'toy' ? 'basic toy' : 'none equipped'))) + '</div>';
    }).join('');
    return '<div class="ticker"><span>MOONPET OS // ' + escapeHtml(pet.pet_name || 'MOONPET') + ' // ' + escapeHtml(words(pet.stage)) + ' // STREAK ' + number(pet.streak_days) + ' DAYS //</span></div>' +
      activePetSummary() +
      panel('RECOMMENDED NEXT MOVE', '<div class="line complete">' + escapeHtml(next.title || 'Maintain current route') + '</div><div class="line muted">NEXT // ' + escapeHtml(homeNextLine(next)) + '</div><div class="line muted">' + escapeHtml(next.detail || 'All systems nominal.') + '</div><div class="button-grid one"><button class="terminal-button" type="button" data-jump="' + nextScreen + '" data-focus="' + focus + '">OPEN RECOMMENDED ROUTE</button></div>', 'recommended') +
      panel('VITAL SYSTEMS', meter('HEALTH', pet.health) + meter('ENERGY', pet.energy) + meter('HUNGER', pet.hunger, true) + meter('FUN', pet.happiness) + meter('CLEAN', pet.cleanliness), 'vitals') +
      panel('CARE CONSOLE', '<div class="button-grid">' +
        button('FEED', 'feed') + button('PLAY', 'play') + button('CLEAN', 'clean') + button('SLEEP', 'sleep') + button('TRAIN', 'train') + button('DAILY CACHE', 'daily_chest') + '<button class="terminal-button" type="button" data-pet-greet>SAY HELLO</button>' +
      '</div>', 'care') +
      renderSeasonSlots() +
      panel('COMPANION DETAILS', '<div class="line complete">' + escapeHtml(lifecycle.species_name || words(pet.species)) + ' // ' + escapeHtml(words(lifecycle.phase || pet.stage)) + '</div><div class="line">LEVEL ' + number(pet.level) + ' // ' + number(pet.pet_xp) + ' XP // ' + number(pet.style_tokens) + ' STYLE // ' + number(pet.streak_days) + '-DAY STREAK</div><div class="line muted">' + escapeHtml(words(lifecycle.temperament || 'forming')) + ' TEMPERAMENT // ' + escapeHtml(words(lifecycle.appearance && lifecycle.appearance.marking || 'moon mark')) + '</div>' + equipped, 'details');
  }

  // TEST-EXPORT: stateRequestGate:start
  function createStateRequestGate() {
    var generation = 0;
    return {
      begin: function () {
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

  function setStateSnapshot(nextState, requestGeneration) {
    if (!nextState || !stateRequestGate.isCurrent(requestGeneration)) return false;
    var serverTime = Date.parse(nextState.server_time || nextState.cooldowns && nextState.cooldowns.server_time || '');
    if (Number.isFinite(serverTime)) serverClockOffsetMs = serverTime - Date.now();
    state = nextState;
    sleepLatched = readSleepLatch(state);
    selectBotArtForState(state).catch(function (error) {
      console.info('[Moonpet] bot art selection failed', error);
    });
    selectWorldBackgroundForState(state).catch(function (error) {
      console.info('[Moonpet] background art selection failed', error);
      setWorldBackground(DEFAULT_WORLD_BACKGROUND_URL);
    });
    seasonSnapshotReceivedAt = performance.now();
    lastSeasonServerRefreshAt = seasonSnapshotReceivedAt;
    scheduleCooldownRefresh();
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
    var delay = Number.isFinite(override) && override > 0 ? Math.ceil(override) : nextCooldownDelayMs(state);
    if (!delay) return;
    cooldownRefreshTimer = window.setTimeout(function () {
      cooldownRefreshTimer = 0;
      refreshExpiredCooldownState();
    }, Math.min(delay, 2147483647));
  }

  async function refreshExpiredCooldownState() {
    if (!state || !state.adopted) return;
    if (busy || noticesBusy || cooldownRefreshInFlight) {
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
      var data = await post('/telegram-pets/app/state');
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      var scrollTop = screen.scrollTop;
      render();
      screen.scrollTop = scrollTop;
      tell('COOLDOWN EXPIRED. STATE REFRESHED.');
      await showPendingNotices();
    } catch (_) {
      if (refreshKey && refreshKey === lastCooldownRefreshKey) lastCooldownRefreshKey = '';
      scheduleCooldownRefresh();
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
    if (!pet.progression) return '<div class="pet-instance-card" data-pet-id="' + escapeHtml(slot.pet_id || '') + '"><div class="pet-instance-heading"><strong>' + escapeHtml(pet.name || 'Moonpet') + '</strong>' + (slot.active ? '<span>◆ ACTIVE</span>' : '<span>OWNED</span>') + '</div><div class="line muted"><strong>PROGRESSION UNAVAILABLE</strong></div></div>';
    var progression = pet.progression || {};
    var lifecycle = progression.lifecycle || {};
    var growth = progression.growth_marks || {};
    var crests = progression.weekly_crests || {};
    var completion = progression.season_complete
      ? '<div class="line complete"><strong>SEASON COMPLETE</strong></div>'
      : progression.legendary ? '<div class="line complete"><strong>LEGENDARY</strong> // SEASON JOURNEY STILL INCOMPLETE</div>'
        : '<div class="line muted"><strong>ROAD TO LEGENDARY</strong></div>';
    var variant = pet.variant ? '<div><span>VARIANT</span><strong>' + escapeHtml(words(pet.variant)) + '</strong></div>' : '';
    return '<div class="pet-instance-card" data-pet-id="' + escapeHtml(slot.pet_id || '') + '">' +
      '<div class="pet-instance-heading"><strong>' + escapeHtml(pet.name || 'Moonpet') + '</strong>' + (slot.active ? '<span>◆ ACTIVE</span>' : '<span>OWNED</span>') + '</div>' +
      '<div class="pet-instance-grid"><div><span>SPECIES</span><strong>' + escapeHtml(words(pet.species || 'forming')) + '</strong></div>' + variant +
      '<div><span>LIFECYCLE</span><strong>' + escapeHtml(words(pet.stage || 'egg')) + '</strong></div><div><span>LEVEL</span><strong>' + number(pet.level || 1) + '</strong></div>' +
      '<div><span>PET XP</span><strong>' + number(pet.pet_xp) + '</strong></div><div><span>HEALTH</span><strong>' + number(pet.health) + '</strong></div>' +
      '<div><span>STAGE</span><strong>' + number(lifecycle.current_stage || 1) + '/' + number(lifecycle.total_stages || 6) + '</strong></div><div><span>GROWTH</span><strong>' + number(growth.earned) + '/' + number(growth.required) + '</strong></div>' +
      '<div><span>CRESTS</span><strong>' + number(crests.earned) + '/' + number(crests.required) + '</strong></div><div><span>ENERGY</span><strong>' + number(pet.energy) + '</strong></div><div><span>HUNGER</span><strong>' + number(pet.hunger) + '</strong></div>' +
      '<div><span>FUN</span><strong>' + number(pet.happiness) + '</strong></div><div><span>CLEAN</span><strong>' + number(pet.cleanliness) + '</strong></div></div>' + completion + '</div>';
  }

  function renderSeasonSlots() {
    var summary = state.season_slots || {};
    var season = summary.season || {};
    var timing = seasonTiming(season, seasonSnapshotElapsed());
    var accountSeason = state.guidance && state.guidance.season || {};
    var tiers = Array.isArray(accountSeason.tiers) ? accountSeason.tiers : [];
    var unlockedTiers = tiers.filter(function (tier) { return tier.unlocked || tier.claimed_at; }).length;
    var provided = Array.isArray(summary.slots) ? summary.slots : [];
    var byNumber = {};
    provided.forEach(function (slot) { byNumber[Number(slot.slot_number)] = slot; });
    var activeSlot = provided.find(function (slot) { return slot.active; }) || {};
    var journey = activeSlot.pet && activeSlot.pet.progression || {};
    var journeyLifecycle = journey.lifecycle || {};
    var journeyGrowth = journey.growth_marks || {};
    var journeyCrests = journey.weekly_crests || {};
    var nextEvolution = journeyLifecycle.next_evolution || {};
    var levelRequirement = journeyLifecycle.requirements && journeyLifecycle.requirements.pet_level || {};
    var journeyStatus = journey.season_complete ? 'SEASON COMPLETE'
      : journey.legendary ? 'LEGENDARY // SEASON JOURNEY STILL INCOMPLETE' : 'ROAD TO LEGENDARY';
    var lifecycleRequirement = journeyLifecycle.next_evolution ? 'LEVEL // ' + number(levelRequirement.current) + '/' + number(levelRequirement.required) + ' // EVOLUTION READY ' + (journeyLifecycle.evolution_ready ? 'YES' : 'NO // ' + words(journeyLifecycle.authority_reason || 'requirements not met')) : 'FINAL FORM REACHED';
    var journeyPanel = journey.pet_id ? '<div class="progression-split"><div><strong>LIFECYCLE // STAGE ' + number(journeyLifecycle.current_stage) + '/' + number(journeyLifecycle.total_stages) + '</strong><span>NEXT // ' + escapeHtml(nextEvolution.name || 'FINAL FORM REACHED') + '</span><span>' + lifecycleRequirement + '</span></div><div><strong>SEASON JOURNEY // WEEK ' + number(summary.current_season_week) + '</strong><span>GROWTH MARKS // ' + number(journeyGrowth.earned) + '/' + number(journeyGrowth.required) + '</span><span>WEEKLY CRESTS // ' + number(journeyCrests.earned) + '/' + number(journeyCrests.required) + '</span><span>' + journeyStatus + '</span></div></div>' : '<div class="line muted"><strong>PROGRESSION UNAVAILABLE</strong></div>';
    var available = Number(summary.arcade_xp_available != null ? summary.arcade_xp_available : (provided[0] && provided[0].arcade_xp_available != null ? provided[0].arcade_xp_available : 0));
    var rows = [1, 2, 3].map(function (slotNumber) {
      var slot = byNumber[slotNumber] || { slot_number: slotNumber, unlocked: false, purchase_enabled: false };
      var owned = Boolean(slot.unlocked);
      var active = Boolean(slot.active);
      var cost = Number(slot.unlock_cost_arcade_xp || 0);
      var unlockEnabled = !owned && Boolean(slot.purchase_enabled);
      var affordable = unlockEnabled && Boolean(slot.affordable);
      var status = active ? 'ACTIVE' : owned ? 'OWNED' : 'LOCKED';
      var details = owned ? renderPetInstanceCard(slot)
        : '<div class="slot-unlock-copy"><strong>COMMUNITY XP UNLOCK</strong><span>You have earned Arcade XP from community play.</span><span>CURRENT ARCADE XP // ' + number(available) + ' / ' + number(cost) + ' REQUIRED</span></div>';
      var control = active ? '<strong class="slot-active-marker" aria-label="Active pet">◆ ACTIVE</strong>'
        : owned ? button('SWITCH TO SLOT ' + slotNumber, 'switch_pet_slot', { pet_id: slot.pet_id, slot_number: slotNumber })
          : unlockEnabled ? button('UNLOCK SLOT ' + slotNumber, 'buy_pet_slot', { slot_number: slotNumber }, {
            disabled: !affordable,
            resourceRequired: !affordable,
            detail: affordable ? 'SPEND ' + number(cost) + ' ARCADE XP' : 'NEED ' + number(Math.max(0, cost - available)) + ' MORE ARCADE XP',
          }) : '<div class="line muted">UNLOCK UNAVAILABLE // ' + escapeHtml(words(slot.purchase_disabled_reason || summary.purchase_disabled_reason || 'season slots unavailable')) + '</div>';
      return '<article class="season-slot ' + (active ? 'is-active' : owned ? 'is-owned' : 'is-locked') + '" data-season-slot="' + slotNumber + '">' +
        '<header><strong>PET ' + slotNumber + ' // SLOT ' + slotNumber + '</strong><span>' + status + '</span></header>' + details + '<div class="slot-control">' + control + '</div></article>';
    }).join('');
    var timingCopy = timing.status === 'UNAVAILABLE'
      ? '<div class="line muted">RUNTIME SEASON TIMING UNAVAILABLE.</div>'
      : '<div class="season-status-grid"><div><span>PHASE</span><strong>' + timing.status + '</strong></div><div><span>POSITION</span><strong>DAY ' + number(timing.day) + ' / ' + number(timing.totalDays) + '</strong></div><div><span>REMAINING</span><strong>' + countdownMarkup({ expires_at: season.end_at }, '') + '</strong></div><div><span>CYCLE</span><strong>' + (timing.partial ? 'YEAR-END PARTIAL' : '90-DAY TARGET') + '</strong></div></div>' + meter('SEASON', timing.percent);
    return panel('SEASON STATUS // LIVE',
      '<div class="season-identity"><strong>SEASON ' + number(season.season_number || 1) + ' // ' + escapeHtml(season.key || 'CURRENT') + '</strong><span>SERVER-AUTHORITATIVE CALENDAR</span></div>' + timingCopy +
      journeyPanel + '<div class="progression-split"><div><strong>PET PROGRESSION</strong><span>Identity // stats // lifecycle // Pet XP stay with each pet instance.</span></div><div><strong>SEASON PROGRESSION</strong><span>' + number(accountSeason.xp) + ' seasonal XP // ' + number(unlockedTiers) + '/' + number(tiers.length) + ' tiers // account leaderboard status</span></div></div>' +
      '<div class="line muted">NEXT // ' + escapeHtml(profileNextLine()) + '</div>' +
      '<div class="season-slot-balance"><strong>CURRENT ARCADE XP</strong><span>' + number(available) + '</span></div>' +
      '<div class="line muted">PET 1 IS FREE // PET 2 REQUIRES 500 XP // PET 3 REQUIRES 1,000 XP // EARNED COMMUNITY PROGRESSION</div><div class="season-slot-grid">' + rows + '</div>' +
      '<div class="line muted">IN DEVELOPMENT // DIMINISHING-RETURN BALANCING · FUTURE // CATCH-UP SYSTEMS</div>', 'season-slots');
  }

  function renderMissions() {
    var guidance = state.guidance || {};
    var missions = state.guidance && state.guidance.missions || [];
    var completedMissions = missions.filter(function (mission) { return mission.completed; }).length;
    var missionPercent = missions.length ? Math.round(completedMissions / missions.length * 100) : 0;
    var rows = missions.map(function (mission) {
      return '<div class="line ' + (mission.completed ? 'complete' : '') + '">' + (mission.completed ? '[OK] ' : '[  ] ') + escapeHtml(mission.title) + '</div>';
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
      : weeklyState === 'COMING_SOON' ? 'WEEKLY JOURNEY // PLANNED EXPANSION' : 'WEEKLY JOURNEY // SYNCING';
    var weeklyJourney = weeklyJourneyMarkup(weeklyAuthority, weeklyCapability, state);
    return activePetSummary() +
      panel('DAILY JOURNEY // GROWTH MARK', dailyJourney, 'daily-journey') +
      panel(weeklyTitle, weeklyJourney, 'weekly-journey') +
      panel('DAILY MISSION BUFFER // ' + number(completedMissions) + '/' + number(missions.length), '<div class="line muted">NEXT // ' + escapeHtml(dailyJourneyNextAction(dailyAuthority, completedMissions, guidance, state)) + '</div><div class="line muted">DAY ' + escapeHtml(guidance.day_key || 'UTC') + ' // WEEK ' + escapeHtml(guidance.week_key || 'UTC') + '</div>' + meter('DAILY CLEAR', missionPercent) + rows, 'missions') +
      panel('ACHIEVEMENT ARCHIVE // ' + number(unlockedCount) + '/' + number(achievements.length), achievementRows || '<div class="line muted">EMPTY ARCHIVE.</div>', 'achievements');
  }

  function renderExplore() {
    var firstSessionExplore = firstSessionExploreMarkup();
    if (firstSessionExplore) return firstSessionExplore;
    var guidance = state.guidance || {};
    var encounter = state.encounter;
    var eventButtons = encounter ? encounter.choices.map(function (choice) {
      return button(choice.label, 'random_event', { choice: choice.key, challenge_token: encounter.challenge_token });
    }).join('') : '';
    var adventure = state.adventure;
    var adventureButtons = adventure ? adventure.choices.map(function (choice) {
      return button(choice.label, 'adventure', { adventure_key: choice.key, challenge_token: adventure.challenge_token });
    }).join('') : '';
    var boss = guidance.weekly_boss || {};
    var run = state.run;
    var runBody;
    if (run) {
      var runRoom = run.room || {};
      var opponent = runRoom.opponent || {};
      var unbankedSummary = number(run.unbanked_pet_xp) + ' XP // ' + number(run.unbanked_moon_gold) + ' GOLD // ' + number(run.unbanked_moon_crystals) + ' GEMS // ' + number(run.unbanked_style_tokens) + ' STYLE';
      var roomBrief = '<div class="run-brief"><div class="line complete">ROOM SIGNAL // ' + escapeHtml(words(runRoom.title || run.checkpoint || 'street')) + '</div>' +
        (runRoom.description ? '<div class="line">' + escapeHtml(runRoom.description) + '</div>' : '') +
        (runRoom.objective ? '<div class="line muted">OBJECTIVE // ' + escapeHtml(runRoom.objective) + '</div>' : '') +
        (opponent.name ? '<div class="run-opponent"><strong>' + escapeHtml(opponent.name) + '</strong> // ' + escapeHtml(words(opponent.role || 'enemy')) + ' // THREAT ' + number(runRoom.threat) + '/5' + (opponent.intro ? '<small>' + escapeHtml(opponent.intro) + '</small>' : '') + '</div>' : '') +
        meter('THREAT', number(runRoom.threat) * 20) + '</div>';
      var runDecisionButtons = (run.choices || []).map(function (choice) {
        return button(choice.label, 'run_step', { run_id: run.run_id, choice_key: choice.key, expected_step_index: run.expected_step_index }, { detail: choice.detail || words(choice.type) });
      }).join('');
      runBody = '<div class="line complete">ENDLESS MOON RUN // DISTRICT TIER ' + number(run.difficulty) + '</div><div class="line">ROOM ' + number(run.expected_step_index || Number(run.current_room != null ? run.current_room : run.depth || 0) + 1) + '/' + number(run.max_room || run.max_depth) + ' // SCORE ' + number(run.score) + ' // NEXT CHECKPOINT ' + number(run.next_checkpoint) + '</div>' +
        roomBrief +
        '<div class="run-stakes"><strong>UNBANKED // ' + escapeHtml(unbankedSummary) + '</strong><span>EXTRACT TO SECURE IT. A FAILED ROOM LOSES THE BAG.</span></div>' +
        '<div class="button-grid run-decisions">' + runDecisionButtons +
        button('EXTRACT & BANK', 'run_extract', { run_id: run.run_id }, { danger: true, detail: 'END RUN AND SECURE ' + unbankedSummary }) + '</div>';
    } else {
      runBody = '<div class="line">NO ACTIVE RUN.</div><div class="button-grid">' + button('START MOON RUN', 'run_start') + button('DAILY RUN', 'daily_run_start') + '</div>';
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
          : '<div class="button-grid arena-decisions">' + arenaMoves + '</div><div class="button-grid one">' + button('FORFEIT BATTLE', 'arena_forfeit', { battle_id: arena.battle_id }, { danger: true }) + '</div>');
      } else if (arenaQueue) {
        arenaBody = '<div class="line">MATCHMAKING QUEUE // POSITION ' + number(arenaQueue.position) + ' // ' + escapeHtml(words(arenaQueue.rank_bucket)) + '</div><div class="button-grid">' +
          button('ACCEPT ANY RANK', 'arena_matchmake', { accept_any_rank: true }, { disabled: arenaQueue.accept_any_rank, statusLabel: arenaQueue.accept_any_rank ? 'CURRENT' : '' }) + button('CANCEL QUEUE', 'arena_queue_cancel', {}, { danger: true }) + '</div>';
      } else {
        arenaBody = (arenaResult ? '<div class="line complete">LAST RESULT // ' + escapeHtml(words(arenaResult.outcome || arenaResult.result)) + ' // ' + escapeHtml(arenaResult.opponent && arenaResult.opponent.pet_name || 'RIVAL') + '</div>' : '') + '<div class="line muted">RANKED PLAYER MATCHMAKING OR SOLO PRACTICE.</div><div class="button-grid">' + button('FIND PLAYER BATTLE', 'arena_matchmake') + button('ENTER SOLO ARENA', 'arena_start') + '</div>';
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
          : (kaiju.result ? '<div class="combat-recap"><strong>LAST KAIJU RESULT // ' + escapeHtml(words(kaiju.result.outcome || kaiju.result.result)) + '</strong><span>CATEGORY // ' + escapeHtml(kaiju.result.category ? kaiju.result.category.name : words(kaiju.result.category_key)) + '</span>' + (kaiju.result.score ? '<span>SCORE // ' + number(kaiju.result.score.player) + ' : ' + number(kaiju.result.score.opponent) + '</span>' : '') + '</div>' : '') + '<div class="line">PLAYER MATCHMAKING OR CRT PRACTICE.</div><div class="button-grid">' + button('FIND KAIJU PLAYER', 'kaiju_matchmake') + button('START SOLO KAIJU', 'kaiju_start') + '</div>';
    }
    var regions = (state.regions || []).map(function (region) {
      var mission = region.mission || {};
      var opponent = mission.opponent || {};
      var decisions = (mission.choices || []).map(function (choice) {
        return button(choice.label, 'district_mission', { region_key: region.key, approach_key: choice.key }, {
          disabled: !region.available,
          detail: number(choice.success_percent) + '% CLEAR // +' + number(choice.mastery_success) + ' MASTERY // ' + number(Math.round(number(choice.reward_multiplier) * 100)) + '% REWARD // ' + choice.detail,
        });
      }).join('');
      var brief = mission.title
        ? '<div class="district-mission"><div class="line signal"><strong>' + escapeHtml(mission.title) + '</strong> // THREAT ' + number(mission.threat) + '/5' + (mission.boss ? ' // BOSS CHECKPOINT' : '') + '</div><div class="line">' + escapeHtml(mission.intro) + '</div><div class="line muted">OBJECTIVE // ' + escapeHtml(mission.objective) + '</div>' + (opponent.name ? '<div class="run-opponent"><strong>' + escapeHtml(opponent.name) + '</strong> // ' + escapeHtml(words(opponent.role)) + '<small>' + escapeHtml(opponent.intro || '') + '</small></div>' : '') + '</div>'
        : '';
      return '<div class="region-entry ' + (region.playable ? 'complete' : 'locked') + '"><div class="line"><strong>' + escapeHtml(region.title) + '</strong> // ' + escapeHtml(region.used_today ? 'COMPLETE TODAY' : region.playable ? 'ONLINE' : region.status.toUpperCase()) + '</div><div class="line muted">' + escapeHtml(region.strapline) + '</div><div class="line">' + escapeHtml(region.lore) + '</div><div class="line">MASTERY ' + number(region.mastery_xp) + ' // BOSS: ' + escapeHtml(words(region.boss)) + ' // FOCUS: ' + escapeHtml(region.focus.map(words).join(' + ')) + '</div>' + brief + (region.lock_reason ? '<div class="line locked">LOCK: ' + escapeHtml(region.lock_reason) + '</div>' : region.used_today ? '<div class="line complete">DISTRICT PLAY COMPLETE TODAY // RESET ' + countdownMarkup(region.cooldown, 'in ') + '</div>' : '<div class="button-grid district-decisions">' + decisions + '</div>') + '</div>';
    }).join('');
    var live = state.live_systems || {};
    var chains = (live.chains || []).map(function (chain) {
      var scene = chain.scene || {};
      var decisions = (scene.choices || []).map(function (choice) {
        var bonus = valueText(choice.reward_bonus);
        return button(choice.label, 'event_chain', { chain_key: chain.key, choice_key: choice.key }, { disabled: !chain.available, detail: choice.detail + (bonus === 'FREE' ? '' : ' // BONUS ' + bonus) });
      }).join('');
      return '<div class="story-scene"><div class="line signal"><strong>' + escapeHtml(chain.title || words(chain.key)) + '</strong> // STEP ' + number(chain.step_index + 1) + '/' + number(chain.steps.length) + '</div><div class="line"><strong>' + escapeHtml(scene.title || words(chain.current_step)) + '</strong></div><div class="line">' + escapeHtml(scene.intro || '') + '</div><div class="line muted">OBJECTIVE // ' + escapeHtml(scene.objective || '') + '</div>' + (chain.used_today ? '<div class="line complete">STORY CHOICE LOCKED IN TODAY // RESET ' + countdownMarkup(chain.cooldown, 'in ') + '</div>' : '<div class="button-grid story-decisions">' + decisions + '</div>') + '</div>';
    }).join('');
    var seasonal = live.seasonal_boss || {};
    var seasonalDefeated = Boolean(seasonal.defeated_at);
    var seasonalButtonLabel = seasonalDefeated ? 'SEASONAL BOSS DEFEATED' : seasonal.attempted_today ? 'ATTACK USED TODAY' : 'ATTACK SEASONAL BOSS // 18 ENERGY';
    var seasonalStatusLabel = seasonalDefeated ? 'DEFEATED' : seasonal.attempted_today ? 'USED TODAY' : '';
    var seasonalBody = '<div class="line">' + escapeHtml(words(seasonal.title || 'offline')) + ' // ' + number(seasonal.damage) + '/' + number(seasonal.hp) + ' DAMAGE</div><div class="line muted">WEAKNESS ' + escapeHtml(words(seasonal.weakness)) + ' // REWARD ' + escapeHtml(words(seasonal.reward)) + '</div><div class="button-grid one">' + button(seasonalButtonLabel, 'seasonal_boss', {}, { disabled: !seasonal.available, statusLabel: seasonalStatusLabel, cooldown: seasonalDefeated ? null : seasonal.cooldown }) + '</div>';
    var bossReward = valueText(boss.reward);
    var bossStatusLabel = boss.defeated ? 'DEFEATED' : boss.attempt_used ? 'USED TODAY' : '';
    var bossBody = '<div class="line">' + (boss.defeated ? 'TARGET DEFEATED.' : boss.attempt_used ? 'DAILY ATTEMPT USED.' : 'SELECT AN ATTACK ROUTINE.') + '</div>' +
      '<div class="line muted">HP ' + number(boss.remaining_hp) + '/' + number(boss.hp) + ' // DAMAGE ' + number(boss.damage) + ' // ATTEMPTS ' + number(boss.attempts) + '/' + number(boss.max_attempts || 7) + '</div>' +
      '<div class="line muted">WEAKNESS ' + escapeHtml(words(boss.weakness || 'unknown')) + ' // REWARD ' + escapeHtml(bossReward) + '</div>' +
      '<div class="button-grid three">' + button('STRIKE', 'weekly_boss', { move: 'strike' }, { disabled: !boss.available, statusLabel: bossStatusLabel, cooldown: boss.defeated ? null : boss.cooldown }) + button('OUTSMART', 'weekly_boss', { move: 'outsmart' }, { disabled: !boss.available, statusLabel: bossStatusLabel, cooldown: boss.defeated ? null : boss.cooldown }) + button('ENDURE', 'weekly_boss', { move: 'endure' }, { disabled: !boss.available, statusLabel: bossStatusLabel, cooldown: boss.defeated ? null : boss.cooldown }) + '</div>';
    return panel('DISTRICT NETWORK', '<div class="line muted">NEXT // ' + escapeHtml(exploreNextLine()) + '</div>' + regions, 'districts') + panel('MOON RUN', '<div class="line muted">NEXT // ' + escapeHtml(exploreNextLine()) + '</div>' + runBody, 'moon-run') +
      panel(adventure ? adventure.title : 'PET ADVENTURE', '<div class="line">' + escapeHtml(adventure ? adventure.intro : 'NO ADVENTURE SIGNAL.') + '</div><div class="button-grid three">' + adventureButtons + '</div>', 'adventure') +
      panel(encounter ? encounter.title : 'STREET EVENT', '<div class="line">' + escapeHtml(encounter ? encounter.intro : 'NO EVENT SIGNAL.') + '</div><div class="button-grid three">' + eventButtons + '</div>', 'street-event') +
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
      return button(job.title, 'work', { job_key: job.key }, { disabled: job.available === false, detail: 'LVL ' + job.min_level + ' // STAGE ' + number(job.min_evolution_stage) + specialistGate + ' // REWARD ' + jobRewards + ' // ' + (job.lore || '') });
    }).join('');
    var activity = guidance.activity;
    var activityHtml = activity
      ? '<div class="line">ACTIVE: ' + escapeHtml(words(activity.activity_type)) + ' // ' + (activity.ready ? escapeHtml(activity.detail) : countdownMarkup(activity.cooldown || activity, 'Claim ready in ')) + '</div><div class="button-grid">' + button('CLAIM', 'activity_claim', {}, activityClaimButtonOptions(activity)) + button('CANCEL', 'activity_cancel', {}, { danger: true }) + '</div>'
      : '<div class="button-grid">' + ['sleep', 'train', 'work', 'explore'].map(function (kind) { return button(kind, 'activity_start', { activity_type: kind }); }).join('') + '</div>';
    return panel('TIMED ACTIVITY', activityHtml, 'timed-activity') + panel('JOB TERMINAL', '<div class="button-grid">' + jobsHtml + '</div>', 'jobs');
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
      return '<div class="line ' + (bounty.complete ? 'complete' : '') + '">' + escapeHtml(bounty.title) + ' ' + number(bounty.progress) + '/' + number(bounty.required) + '</div>' +
        '<div class="line muted">' + escapeHtml(bounty.detail || '') + ' // REWARD ' + escapeHtml(valueText(bounty.reward)) + '</div>' +
        (bounty.complete && !bounty.claimed ? '<div class="button-grid one">' + button('CLAIM ' + bounty.title, 'bounty_claim', { bounty_key: bounty.key }) + '</div>' : '');
    }).join('');
    var offers = (economy.market_offers || []).map(function (offer) {
      return button(offer.title, 'market_buy', { offer_key: offer.key }, { disabled: !offer.unlocked || !offer.affordable || offer.purchased, statusLabel: offer.purchased ? 'SOLD' : '', resourceRequired: offer.unlocked && !offer.affordable && !offer.purchased, detail: (offer.unlocked ? '' : 'REQUIRES LEVEL ' + number(offer.min_level) + ' // ') + (offer.detail || '') + ' // COST ' + costText(offer.cost) + ' // GIVES ' + valueText(offer.reward) });
    }).join('');
    var shop = (guidance.shop_items || []).map(function (item) {
      return button(item.title, 'buy', { item_key: item.key }, { disabled: !item.unlocked || !item.affordable || item.equipped, statusLabel: item.equipped ? 'EQUIPPED' : '', resourceRequired: item.unlocked && !item.affordable && !item.equipped, detail: item.equipped ? (item.description || '') : (item.unlocked ? '' : 'REQUIRES LEVEL ' + number(item.min_level) + ' // ') + (item.description || '') + ' // COST ' + costText(item.cost) });
    }).join('');
    var inventory = (state.inventory || []).filter(function (item) { return Number(item.count || item.quantity || 0) > 0; }).map(function (item) {
      return '<div class="line">' + escapeHtml(words(item.title || item.key || item.item_key)) + ' x' + number(item.count || item.quantity) + '</div>' +
        ((item.kind === 'usable_item' || item.usable) ? '<div class="button-grid one">' + button('USE ' + (item.title || item.key), 'use_item', { item_key: item.key || item.item_key }) + '</div>' : '');
    }).join('');
    var expedition = economy.expedition || {};
    var live = state.live_systems || {};
    var upgrades = new Map((live.upgrades || []).map(function (item) { return [item.item_key, item]; }));
    var gear = (state.gear || []).map(function (item) {
      var upgrade = upgrades.get(item.item_key) || {};
      return '<div class="line complete">' + escapeHtml(words(item.slot)) + ' // ' + escapeHtml(words(item.item_key)) + '</div>' +
        '<div class="line muted">LEVEL ' + number(item.item_level) + ' // ITEM XP ' + number(item.item_xp) + ' // MASTERY ' + number(item.mastery_tier) + ' (' + number(item.mastery_xp) + ' XP)</div>' +
        (upgrade.maxed ? '<div class="line complete">MAX LEVEL</div>' : '<div class="button-grid one">' + button('UPGRADE TO LEVEL ' + number(upgrade.target_level), 'gear_upgrade', { item_key: item.item_key }, { disabled: !upgrade.affordable, resourceRequired: upgrade.unlocked && !upgrade.affordable, detail: (upgrade.unlocked ? '' : 'REQUIRES LEVEL ' + number(upgrade.required_level) + ' // ') + costText(upgrade.cost) }) + '</div>');
    }).join('');
    var materials = (state.materials || []).map(function (item) {
      return '<div class="line ' + (item.quantity ? 'complete' : 'locked') + '">' + escapeHtml(item.label) + ' x' + number(item.quantity) + '</div><div class="line muted">SOURCE: ' + escapeHtml((item.sources || []).map(words).join(' / ')) + '</div>';
    }).join('');
    var crafting = (live.crafting || []).map(function (recipe) {
      return button(recipe.title, 'craft', { recipe_key: recipe.key }, { disabled: !recipe.unlocked || !recipe.affordable, resourceRequired: recipe.unlocked && !recipe.affordable, detail: (recipe.unlocked ? '' : 'REQUIRES LEVEL ' + number(recipe.min_level) + ' // ') + (recipe.detail || '') + ' // COST ' + costText(recipe.cost) + ' // MAKES ' + number(recipe.output && recipe.output.quantity) + ' ' + words(recipe.output && recipe.output.item_key) });
    }).join('');
    var relics = (state.relics || []).map(function (item) { return '<div class="line complete">◆ ' + escapeHtml(words(item.relic_id)) + '</div>'; }).join('');
    var equipmentSets = (live.equipment_sets || []).map(function (set) {
      var bonuses = (set.active_bonuses || []).map(function (bonus) { return number(bonus.required) + ' PIECE // ' + valueText(bonus.effects); }).join(' / ');
      return '<div class="line ' + (set.pieces >= 2 ? 'complete' : '') + '">' + escapeHtml(words(set.key)) + ' // EQUIPPED ' + number(set.pieces) + '/' + number(set.total_pieces) + ' // OWNED ' + number(set.owned_pieces) + '</div>' +
        '<div class="line muted">' + (bonuses ? 'ACTIVE ' + escapeHtml(bonuses) : 'MISSING ' + escapeHtml((set.missing || []).map(words).join(' / ') || 'EQUIP OWNED SET PIECES')) + '</div>';
    }).join('');
    var cosmetics = (live.cosmetics || []).map(function (item) { return button(words(item.key), 'cosmetic_unlock', { cosmetic_key: item.key }, { disabled: !item.affordable || item.unlocked && !item.repeatable, statusLabel: item.unlocked && !item.repeatable ? 'OWNED' : '', resourceRequired: !item.affordable && !(item.unlocked && !item.repeatable), detail: (item.unlocked ? 'x' + number(item.quantity) + ' // ' : '') + costText(item.cost) }); }).join('');
    return panel('EQUIPMENT PROGRESSION', gear || '<div class="line muted">NO EQUIPMENT MASTERY RECORDS.</div>', 'equipment') +
      panel('LOADOUT SYNERGIES', equipmentSets || '<div class="line muted">NO SET DATA.</div>', 'equipment-sets') +
      panel('CRAFTING MATERIALS', materials || '<div class="line muted">NO MATERIAL DATA.</div>', 'materials') +
      panel('CRAFTING WORKSHOP', '<div class="button-grid">' + crafting + '</div>', 'crafting') +
      panel('RELIC VAULT', relics || '<div class="line muted">NO RELICS RECOVERED.</div>', 'relics') +
      panel('DAILY BOUNTIES', bounties || '<div class="line muted">NO BOUNTIES.</div>', 'bounties') +
      panel('CRYSTAL EXPEDITION // ' + escapeHtml(expedition.title || 'LOCKED'), '<div class="line">' + number(economy.expedition_attempts_left) + '/3 ATTEMPTS // COST ' + number(expedition.energy) + ' ENERGY</div><div class="line muted">POSSIBLE FINDS // ' + escapeHtml((expedition.rewards || []).map(valueText).join(' / ')) + '</div><div class="button-grid one">' + button('RUN EXPEDITION', 'expedition', {}, { disabled: !economy.expedition_attempts_left || Number(state.pet && state.pet.energy || 0) < Number(expedition.energy || 0), resourceRequired: Boolean(economy.expedition_attempts_left) && Number(state.pet && state.pet.energy || 0) < Number(expedition.energy || 0) }) + '</div>', 'expedition') +
      panel('MOON MARKET', '<div class="button-grid">' + offers + '</div>', 'market') +
      panel('PERMANENT SHOP', '<div class="button-grid">' + shop + '</div>', 'shop') + panel('STYLE LAB', '<div class="button-grid">' + cosmetics + '</div>', 'style-lab') +
      panel('INVENTORY', inventory || '<div class="line muted">BAG EMPTY.</div>', 'inventory') +
      panel('MOON GOLD TRADE', '<div class="button-grid three">' + [10, 25, 50].map(function (wager) { return button(wager + ' GOLD', 'trade', { wager: wager }); }).join('') + '</div>', 'trade');
  }

  function renderProfile() {
    if (!state.pet) return panel('IDENTITY CORE', '<div class="line muted">INITIALISE A MOONPET TO UNLOCK THIS MODULE.</div>');
    var guidance = state.guidance || {};
    var identity = guidance.identity || {};
    var evolution = guidance.evolution;
    var currentPerk = guidance.current_evolution_perk || {};
    var evoHtml = evolution
      ? '<div class="line complete">CURRENT PERK // ' + escapeHtml(currentPerk.perk || 'Memories and traits are active.') + '</div><div class="line">NEXT: ' + escapeHtml(evolution.name) + '</div><div class="line muted">NEXT PERK // ' + escapeHtml(evolution.perk || '') + '</div>' + (evolution.missing || []).map(function (entry) { return '<div class="line muted">' + escapeHtml(entry.label) + ' ' + number(entry.current) + '/' + number(entry.required) + ' // ' + escapeHtml(entry.source || '') + '</div>'; }).join('') + '<div class="button-grid one">' + button('EVOLVE', 'evolve', { evolution_id: evolution.evolution_id }, { disabled: !evolution.ready }) + '</div>'
      : '<div class="line complete">FINAL EVOLUTION ONLINE.</div><div class="line muted">' + escapeHtml(currentPerk.perk || '') + '</div>';
    var season = guidance.season || {};
    var tiers = (season.tiers || []).map(function (tier) {
      return '<div class="line ' + (tier.claimed_at ? 'complete' : tier.unlocked ? '' : 'locked') + '">' + escapeHtml(tier.title) + ' // ' + number(tier.required_xp) + ' XP</div>' +
        '<div class="line muted">REWARD ' + escapeHtml(valueText(tier.reward)) + ' // +' + number(season.evolution_bonus_style) + ' EVOLUTION STYLE</div>' +
        (tier.unlocked && !tier.claimed_at ? '<div class="button-grid one">' + button('CLAIM ' + tier.title, 'season_claim', { tier_id: tier.tier_id }) + '</div>' : '');
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
      var form = entry.phase === 'rare'
        ? entry.rare_morph_name
        : entry.species_name || (entry.phase === 'egg' ? 'Moon Egg' : entry.stage);
      return '<div class="line">#' + number(entry.rank) + ' ' + escapeHtml(entry.pet_name || 'MOONPET') +
        ' // ' + escapeHtml(words(form || 'moonpet')) + ' // LVL ' + number(entry.level) + ' // ' + number(entry.pet_xp) + ' XP</div>' +
        '<div class="line muted">GOLD ' + number(entry.moon_gold) + ' // GEMS ' + number(entry.moon_crystals) +
        ' // STYLE ' + number(entry.style_tokens) + '</div>';
    }).join('');
    var notifications = state.notifications || {};
    var live = state.live_systems || {};
    var faction = live.faction || {};
    var notificationPanel = '<div class="line ' + (notifications.enabled ? 'complete' : 'muted') + '">PROGRESSION ALERTS: ' + (notifications.enabled ? 'ONLINE' : 'OFFLINE') + '</div><div class="button-grid">' +
      button('ENABLE ALERTS', 'notification_set', { enabled: true }, { disabled: notifications.enabled, statusLabel: notifications.enabled ? 'CURRENT' : '' }) +
      button('DISABLE ALERTS', 'notification_set', { enabled: false }, { disabled: !notifications.enabled, statusLabel: !notifications.enabled ? 'CURRENT' : '', danger: true }) + '</div>';
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
    // TEST-EXPORT: futureSystemTitles:start
    var futureSystemTitles = {
      breeding: 'Breeding',
      traits: 'Advanced Traits',
      sanctuary: 'Sanctuary',
      lineage: 'Lineage',
      fusion: 'Fusion',
      prestige: 'Prestige',
    };
    // TEST-EXPORT: futureSystemTitles:end
    var capabilitySystems = state.capabilities_version === 1 && state.capabilities && state.capabilities.systems && typeof state.capabilities.systems === 'object'
      ? state.capabilities.systems
      : {};
    var futureSystems = Object.keys(futureSystemTitles).map(function (key) {
      var system = capabilitySystems[key] || {};
      var status = String(system.state || 'COMING_SOON').toUpperCase();
      var message = system.message || 'Future expansion content. Not available yet.';
      return {
        key: key,
        title: futureSystemTitles[key],
        status: ['LOCKED', 'COMING_SOON', 'AVAILABLE'].includes(status) ? status : 'COMING_SOON',
        detail: message,
      };
    });
    var futureSystemRows = futureSystems.filter(function (system) {
      return system.key !== 'sanctuary' && system.key !== 'prestige';
    }).map(function (system) {
      return '<div class="line locked">[ROADMAP] ' + escapeHtml(system.title || system.key || 'Future System') + '</div><div class="line muted">' + escapeHtml(system.detail || '') + '</div>';
    }).join('');
    function futureSystemByKey(key, fallbackStatus) {
      return futureSystems.find(function (system) { return system.key === key; }) || {
        key: key,
        status: fallbackStatus || 'LOCKED',
        detail: fallbackStatus === 'COMING_SOON' ? 'Future expansion content. Not available yet.' : 'Current beta requirements not met.',
      };
    }
    function futureSystemPanelCopy(system) {
      var status = String(system.status || 'LOCKED').toUpperCase();
      if (status === 'COMING_SOON') return '<div class="line locked">FUTURE EXPANSION CONTENT.</div><div class="line muted">NOT AVAILABLE YET.</div>';
      if (status === 'AVAILABLE') return '<div class="line complete">AVAILABLE.</div><div class="line muted">' + escapeHtml(system.detail || '') + '</div>';
      return '<div class="line locked">LOCKED.</div><div class="line muted">' + escapeHtml(system.detail || 'Current beta requirements not met.') + '</div>';
    }
    var featureRows = (guidance.features || []).map(function (feature) {
      var available = feature.available === true;
      var detail = feature.detail || '';
      return '<div class="line ' + (available ? 'complete' : 'locked') + '">' + (available ? '[ONLINE] ' : '[LOCKED] ') + escapeHtml(feature.title) + '</div><div class="line muted">' + escapeHtml(detail) + '</div>';
    }).join('');
    var sanctuarySystem = futureSystemByKey('sanctuary');
    var sanctuaryPanel = futureSystemPanelCopy(sanctuarySystem);
    var lifecycle = state.lifecycle || {};
    var rare = lifecycle.rare || {};
    var innate = (lifecycle.innate_traits || []).map(function (trait) { return '<div class="line complete">◆ ' + escapeHtml(words(trait)) + '</div>'; }).join('');
    var rarePanel = '<div class="line ' + (rare.ready ? 'complete' : 'muted') + '">HIDDEN SIGNAL // ' + escapeHtml(words(rare.signal || 'dormant')) + ' // ' + number(rare.progress) + '%</div>' + (rare.name ? '<div class="line complete">REVEALED // ' + escapeHtml(rare.name) + '</div>' : '<div class="line muted">The route remains hidden until your evolution, traits and memories align.</div>') + (rare.ready ? '<div class="button-grid one">' + button('ANSWER RARE SIGNAL', 'rare_morph') + '</div>' : '');
    return activePetSummary() +
      panel('IDENTITY CORE', '<div class="line complete">' + escapeHtml(lifecycle.species_name || identity.current_stage && identity.current_stage.name || words(state.pet.stage)) + ' // ' + escapeHtml(words(lifecycle.phase || 'companion')) + '</div><div class="line muted">' + escapeHtml(words(lifecycle.temperament || 'forming')) + ' TEMPERAMENT</div>' + innate + '<div class="line muted">PERSONALITY</div>' + (traits || '<div class="line muted">TRAITS STILL FORMING. Personality develops through play.</div>')) + panel('HIDDEN MORPH SIGNAL', rarePanel, 'rare-morph') +
      panel('APTITUDES', aptitudeRows) +
      panel('MEMORY ARCHIVE', memoryRows + (milestones || '<div class="line muted">NO MILESTONES RECORDED YET.</div>'), 'memories') +
      panel('CALLSIGN', '<label class="line" for="pet-name-input">MOONPET NAME</label><input id="pet-name-input" class="terminal-input" maxlength="32" value="' + escapeHtml(state.pet.pet_name || '') + '"><div class="button-grid one">' + button('WRITE NEW CALLSIGN', 'rename') + '</div>', 'callsign') +
      panel('EVOLUTION', evoHtml, 'evolution') + panel('FACTION PERK', '<div class="line complete">' + escapeHtml(words(faction.key || 'unaligned')) + '</div><div class="line muted">' + escapeHtml(faction.bonus ? words(faction.bonus.system) + ' // ' + costText(faction.bonus.effect) : 'JOIN A FACTION TO ACTIVATE A GAMEPLAY BONUS') + '</div>', 'faction') +
      panel('PRESTIGE // FUTURE SEASON', futureSystemPanelCopy(futureSystemByKey('prestige', 'COMING_SOON')), 'prestige') +
      panel('MOONPET SANCTUARY // FUTURE SEASON', sanctuaryPanel, 'sanctuary') + panel('SPECIALIST TRACKS', tracks, 'tracks') + panel('ROADMAP // FUTURE SEASONS', futureSystemRows, 'future-systems') + panel('UNLOCK DIRECTORY', featureRows, 'features') + panel('ALERT CONTROL', notificationPanel, 'alerts') + panel('SEASON // ' + (season.key || ''), '<div class="line">' + number(season.xp) + ' SEASON XP</div>' + tiers, 'season') + panel('TOP MOONPETS', (leaders || '<div class="line muted">NO RANKS LOADED.</div>') + '<div class="button-grid one"><button type="button" class="terminal-button" data-utility="leaderboard">OPEN FULL LEADERBOARD</button></div>', 'leaderboard');
  }

  var screens = { home: renderHome, missions: renderMissions, explore: renderExplore, work: renderWork, economy: renderEconomy, profile: renderProfile };
  var navItems = [
    ['home', '⌂', 'HOME'], ['missions', '☷', 'MISSIONS'], ['explore', '⚔', 'EXPLORE'], ['work', '⚒', 'WORK'], ['economy', '◇', 'ECONOMY'], ['profile', '★', 'PROFILE'],
  ];

  function renderNav() {
    nav.innerHTML = navItems.map(function (item) {
      return '<button type="button" data-screen="' + item[0] + '" aria-current="' + (item[0] === activeScreen ? 'page' : 'false') + '"><span>' + item[1] + '</span>' + item[2] + '</button>';
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
    if (!draft.focused && String(state.pet.pet_name || '') !== String(draft.petName || '')) return;
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
    renderHud();
    renderNav();
    screen.innerHTML = state ? utilityRail() + sectionJumpBar(activeScreen) + screens[activeScreen]() : '';
    restoreEditableState(editableState);
    renderedPetId = state && state.pet && state.pet.pet_id || null;
    renderedPetName = String(state && state.pet && state.pet.pet_name || '');
    title.textContent = state && state.pet ? (state.pet.pet_name || 'MOONPET') + ' OS' : 'MOONPET OS';
    if (reducedMotion) drawWorld(0);
  }

  // TEST-EXPORT: actionResultFeedback:start
  function resultRewardMap(result) {
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
    if (!result.accepted) {
      var blockedParts = ['Action unavailable'];
      var blockedReasonCopy = rejectionMessage(result.reason);
      if (blockedReasonCopy) blockedParts[0] += ' - ' + blockedReasonCopy;
      if (result.duplicate) blockedParts.push('Duplicate blocked by authority.');
      return blockedParts.join(' - ');
    }
    var reward = resultRewardMap(result);
    var gains = Object.entries(reward).filter(function (entry) { return Number(entry[1]) > 0 && typeof entry[1] !== 'object'; }).map(function (entry) { return '+' + number(entry[1]) + ' ' + words(entry[0]); });
    var parts = ['Action complete'];
    var reasonCopy = rejectionMessage(result.reason);
    if (reasonCopy) parts.push(reasonCopy);
    var terminalResult = result.battle && (result.battle.outcome || result.battle.result) || result.match && (result.match.outcome || result.match.result) || result.resolved && result.resolved.result;
    if (terminalResult) parts.push('OUTCOME ' + words(terminalResult.replace('player1', 'you').replace('player2', 'opponent')));
    var resultCopy = result.result_copy || result.outcome && result.outcome.copy;
    if (resultCopy) parts.push(String(resultCopy));
    if (result.damage) parts.push('DAMAGE ' + number(result.damage));
    if (result.pet_xp_awarded) parts.push('+' + number(result.pet_xp_awarded) + ' PET XP');
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
      active_pet_required: 'active seasonal Moonpet required.',
      completed_season_pet_required: 'completed Season pet required.',
      weekly_journey_authority_syncing: 'Weekly Journey authority syncing.',
      daily_journey_authority_syncing: 'Daily Journey authority syncing.',
      cooldown: 'wait for cooldown.',
      trade_cooldown: 'wait for cooldown.',
      adventure_cooldown: 'wait for cooldown.',
      moon_egg_must_hatch: 'hatch your Moonpet first.',
      pet_not_adopted: 'initialise your Moonpet first.',
      insufficient_gold: 'not enough Moon Gold.',
      not_enough_pet_currency: 'not enough required currency.',
      insufficient_crystals: 'not enough Moon Crystals.',
      insufficient_style: 'not enough Style Tokens.',
      insufficient_arcade_xp: 'NOT ENOUGH ARCADE XP FOR THIS SLOT',
      pet_slot_purchased: 'SEASONAL PET SLOT UNLOCKED',
      pet_slot_switched: 'ACTIVE MOONPET SWITCHED',
      pet_slot_already_owned: 'THAT PET SLOT IS ALREADY UNLOCKED',
      invalid_pet_slot: 'THAT SEASONAL PET SLOT IS INVALID',
      pet_slot_purchase_conflict: 'PET SLOT UNLOCK COULD NOT BE COMPLETED',
      pet_slot_creation_incomplete: 'PET SLOT UNLOCK NEEDS A SAFE RETRY',
      pet_slot_not_switchable: 'THAT PET SLOT CANNOT BE SWITCHED TO',
      pet_activity_active: 'FINISH OR CLAIM THE ACTIVE PET ACTIVITY FIRST',
      pet_run_active: 'FINISH THE ACTIVE MOON RUN BEFORE SWITCHING',
      pet_arena_active: 'FINISH THE ACTIVE ARENA BATTLE BEFORE SWITCHING',
      pet_kaiju_active: 'FINISH THE ACTIVE KAIJU MATCH BEFORE SWITCHING',
      season_slots_unavailable: 'SEASON SLOTS ARE TEMPORARILY UNAVAILABLE',
    };
    return messages[String(reason || '')] || words(reason);
  }

  function compactFeedback(value, limit) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text.length > limit ? text.slice(0, Math.max(0, limit - 3)).trim() + '...' : text;
  }

  function actionFeedback(result, beforeState, afterState) {
    if (!result) return { tone: 'danger', lines: ['Response unavailable'], reaction: '' };
    var lines = [result.accepted ? 'Complete' : 'Not available'];
    if (!result.accepted) {
      var feedbackReasonCopy = rejectionMessage(result.reason);
      if (feedbackReasonCopy) lines.push(compactFeedback(feedbackReasonCopy, 34));
      if (result.duplicate && lines.length < 3) lines.push('DUPLICATE BLOCKED');
      return { tone: 'danger', lines: lines.slice(0, 3), reaction: compactFeedback(result.reaction, 24) };
    }
    journeyActionProgressLines(beforeState, afterState, result).some(function (line) {
      if (lines.length >= 3) return true;
      lines.push(compactFeedback(line, 34));
      return lines.length >= 3;
    });
    var terminalResult = result.battle && (result.battle.outcome || result.battle.result) || result.match && (result.match.outcome || result.match.result) || result.resolved && result.resolved.result;
    if (terminalResult) lines.push('OUTCOME ' + words(String(terminalResult).replace('player1', 'you').replace('player2', 'opponent')));
    if (result.damage) lines.push('DAMAGE ' + number(result.damage));
    if (result.pet_xp_awarded) lines.push('+' + number(result.pet_xp_awarded) + ' PET XP');
    var reward = resultRewardMap(result);
    Object.entries(reward).some(function (entry) {
      if (lines.length >= 3) return true;
      if (Number(entry[1]) > 0 && typeof entry[1] !== 'object') lines.push('+' + number(entry[1]) + ' ' + words(entry[0]));
      return lines.length >= 3;
    });
    var resultCopy = result.result_copy || result.outcome && result.outcome.copy;
    if (lines.length < 3 && resultCopy) lines.push(compactFeedback(resultCopy, 34));
    return { tone: 'success', lines: lines.slice(0, 3), reaction: compactFeedback(result.reaction, 24) };
  }
  // TEST-EXPORT: actionResultFeedback:end

  function clearResultFeedback(redraw) {
    window.clearTimeout(feedbackRedrawTimer);
    feedbackUntil = 0;
    feedbackTone = '';
    feedbackLines = [];
    feedbackReaction = '';
    feedbackActionMode = '';
    if (redraw && reducedMotion) drawWorld(performance.now());
  }

  function presentResultFeedback(result, beforeState, afterState) {
    var feedback = actionFeedback(result, beforeState, afterState);
    var feedbackDuration = Math.max(5200, actionResultHoldMs + 1600);
    window.clearTimeout(feedbackRedrawTimer);
    feedbackTone = feedback.tone;
    feedbackLines = feedback.lines;
    feedbackReaction = feedback.reaction;
    feedbackActionMode = animationMode;
    feedbackUntil = performance.now() + feedbackDuration;
    if (reducedMotion) {
      drawWorld(performance.now());
      feedbackRedrawTimer = window.setTimeout(function () {
        clearResultFeedback(true);
      }, feedbackDuration + 20);
    }
  }

  // TEST-EXPORT: lifecycleDirector:start
  function lifecycleStateSnapshot(snapshot) {
    var lifecycle = snapshot && snapshot.lifecycle || {};
    var incubation = lifecycle.incubation || {};
    var rare = lifecycle.rare || {};
    var pet = snapshot && snapshot.pet || {};
    return {
      adopted: Boolean(snapshot && snapshot.adopted),
      phase: String(lifecycle.phase || ''),
      speciesId: String(lifecycle.species_id || pet.species || ''),
      speciesName: String(lifecycle.species_name || words(pet.species) || ''),
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
    var before = lifecycleStateSnapshot(beforeState);
    var after = lifecycleStateSnapshot(afterState);
    var actionKey = String(action || '').toLowerCase();
    if (actionKey === 'adopt' && !before.adopted && after.phase === 'egg') {
      return { kind: 'egg', title: 'NEW MOON EGG', primary: 'Ready for care', secondary: 'Your choices shape what hatches', detail: '', duration: 5200 };
    }
    if (before.phase === 'egg' && after.phase === 'young' && after.speciesId) {
      return {
        kind: 'hatch', title: 'HATCHED', primary: after.speciesName,
        secondary: words(after.temperament || 'forming') + ' temperament',
        detail: [after.marking].concat(after.traits).filter(Boolean).map(words).join(' - '), duration: 7600,
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
        kind: 'signal', title: 'EGG CARE', primary: after.progress + '/' + after.target,
        secondary: words(result.care_type || 'care') + ' progress', detail: '',
        progress: after.progress, target: after.target, duration: 4200,
      };
    }
    return null;
  }
  // TEST-EXPORT: lifecycleDirector:end

  function lifecycleCeremonyActive(time) {
    return Boolean(lifecycleCeremony && lifecycleCeremonyUntil > Number(time == null ? performance.now() : time));
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
    clearResultFeedback(false);
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
    window.setTimeout(function () {
      var target = screen.querySelector('[data-panel="' + CSS.escape(panelId) + '"]');
      if (target) {
        var screenRect = screen.getBoundingClientRect();
        var rail = screen.querySelector('.utility-rail');
        var stickyInset = rail ? Math.max(0, rail.getBoundingClientRect().bottom - screenRect.top) : 0;
        var relativeTop = target.getBoundingClientRect().top - screenRect.top + screen.scrollTop;
        screen.scrollTo({ top: Math.max(0, relativeTop - stickyInset - 8), behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    }, 0);
  }

  async function showPendingNotices() {
    var notices = state && Array.isArray(state.notices) ? state.notices : [];
    if (!notices.length || noticesBusy) return;
    noticesBusy = true;
    var visible = notices.slice(0, 5);
    haptic('success');
    tell(visible[0].title + (visible[0].detail ? ' - ' + visible[0].detail : ''));
    try {
      var requestGeneration = beginStateRequest();
      var acknowledged = await post('/telegram-pets/app/action', { action: 'guidance_ack', notice_keys: visible.map(function (notice) { return notice.key; }), request_id: crypto.randomUUID() });
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
    if (/fail|blocked|denied|lose/.test(key)) return 'blocked';
    if (/feed|use_item/.test(key)) return 'feed';
    if (/play/.test(key)) return 'play';
    if (/clean/.test(key)) return 'clean';
    if (/hatch|rare_morph/.test(key)) return 'evolve';
    if (/incubate/.test(key)) return String(payload && payload.care_type || '') === 'music' ? 'play' : String(payload && payload.care_type || '') === 'rest' ? 'sleep' : 'interact';
    if (/sleep|rest/.test(key)) return 'sleep';
    if (/train/.test(key)) return 'train';
    if (/boss|arena|kaiju|fight|attack/.test(key)) return 'battle';
    if (/random_event|event_chain/.test(key)) return 'interact';
    if (/run|adventure|expedition|explore|district/.test(key)) return 'travel';
    if (/job|activity|work/.test(key)) return 'work';
    if (/buy|market|equipment|cosmetic|gear/.test(key)) return 'equip';
    if (/evolve|prestige/.test(key)) return 'evolve';
    if (/trade/.test(key)) return 'trade';
    if (/claim|chest|bounty|season|reward|achievement|win/.test(key)) return 'celebrate';
    if (/talk|interact/.test(key)) return 'interact';
    return 'interact';
  }

  var CAMERA_IMPACT_STRENGTH = {
    feed: 1, play: 2, clean: 1, sleep: 0, train: 3, battle: 6, travel: 2,
    work: 2, equip: 2, evolve: 5, trade: 2, celebrate: 4, interact: 1, greet: 1, blocked: 4,
  };

  function animateAction(action, accepted, duration, payload) {
    animationMode = accepted === false ? 'blocked' : actionAnimationFamily(action, payload);
    actionSequence += 1;
    var animationDuration = duration || 2400;
    actionStartedAt = performance.now();
    cameraImpactStrength = reducedMotion ? 0 : CAMERA_IMPACT_STRENGTH[animationMode] || 0;
    cameraImpactUntil = actionStartedAt + Math.min(animationDuration, 900);
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

  async function runAction(action, payload, buttonElement) {
    if (busy) return;
    if (lifecycleCeremonyActive()) {
      tell('LIFECYCLE REVEAL IN PROGRESS.');
      haptic('light');
      return;
    }
    busy = true;
    if (buttonElement) buttonElement.classList.add('is-active');
    haptic('medium');
    clearResultFeedback(false);
    if (sleepLatched && actionAnimationFamily(action, payload) !== 'sleep') {
      setSleepLatch(false);
    }
    animateAction(action, true, 8000, payload);
    tell(words(action) + ' in progress...');
    try {
      var stateBeforeAction = state;
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/action', Object.assign({ action: action, request_id: crypto.randomUUID() }, payload || {}));
      var responseState = mergeActionResultCooldown(data.state, data.result, action);
      if (!setStateSnapshot(responseState, requestGeneration)) return;
      var nextState = state;
      var plannedCeremony = planLifecycleCeremony(stateBeforeAction, nextState, action, data.result);
      var message = resultMessage(data.result, stateBeforeAction, nextState);
      tell(message, data.result && data.result.accepted ? '' : 'danger');
      haptic(data.result && data.result.accepted ? 'success' : 'error');
      render({ discardCallsignDraft: action === 'rename' && Boolean(data.result && data.result.accepted) });
      await showPendingNotices();
      var actionAccepted = Boolean(data.result && data.result.accepted);
      var actionFamily = actionAnimationFamily(action, payload);
      if (actionFamily === 'sleep') setSleepLatch(actionAccepted);
      animateAction(action, actionAccepted, 2800, payload);
      if (!startLifecycleCeremony(plannedCeremony)) presentResultFeedback(data.result, stateBeforeAction, nextState);
    } catch (error) {
      animateAction('blocked', false, 2800);
      tell(error.message || 'CONNECTION FAILED', 'danger');
      haptic('error');
      presentResultFeedback({ accepted: false, reason: error.message || 'connection failed' }, state, state);
    } finally {
      busy = false;
      if (buttonElement) buttonElement.classList.remove('is-active');
    }
  }

  function switchScreen(nextScreen) {
    if (!SCREEN_ORDER.includes(nextScreen) || nextScreen === activeScreen) return false;
    activeScreen = nextScreen;
    render();
    return true;
  }

  screen.addEventListener('click', function (event) {
    var utility = event.target.closest('[data-utility]');
    if (utility) {
      if (utility.dataset.utility === 'guide' || utility.dataset.utility === 'leaderboard') openUtility(utility.dataset.utility);
      else if (utility.dataset.utility === 'audio') toggleAudio();
      else if (utility.dataset.utility === 'radio') toggleRadio();
      else if (utility.dataset.utility === 'sync') syncState();
      else if (utility.dataset.utility === 'retry') window.location.reload();
      return;
    }
    var panelJump = event.target.closest('[data-panel-jump]');
    if (panelJump) {
      scrollToPanel(panelJump.dataset.panelJump);
      haptic('light');
      return;
    }
    var petGreeting = event.target.closest('[data-pet-greet]');
    if (petGreeting) { canvas.dispatchEvent(new CustomEvent('moonpet:greet')); return; }
    if (lifecycleCeremonyActive()) {
      tell('LIFECYCLE REVEAL IN PROGRESS.');
      haptic('light');
      return;
    }
    var jump = event.target.closest('[data-jump]');
    if (jump && !busy) {
      if (!SCREEN_ORDER.includes(jump.dataset.jump)) {
        tell('ROUTE NOT FOUND.', 'danger');
        haptic('error');
        return;
      }
      switchScreen(jump.dataset.jump);
      scrollToPanel(jump.dataset.focus);
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
    runAction(target.dataset.action, payload, target);
  });

  function companionGreetingCopy(pet, lifecycle) {
    var mood = petMood(pet);
    if (lifecycle && lifecycle.phase === 'egg') return 'SIGNAL RECEIVED';
    if (mood === 'hurt') return 'STAY WITH ME';
    if (mood === 'tired') return 'FIVE MORE MINUTES';
    if (mood === 'hungry') return 'YOU BROUGHT SNACKS?';
    if (mood === 'scruffy') return 'DO NOT JUDGE';
    if (mood === 'happy') return 'WE RUN THIS CITY';
    return temperamentCompanionHabit(lifecycle && lifecycle.temperament) === 'swagger' ? 'WHAT IS THE MOVE?' : 'GOOD TO SEE YOU';
  }

  function companionGreetingVariant(pet) {
    return pet ? 'front_wave' : 'basic';
  }

  function greetCompanion() {
    var now = performance.now();
    if (busy || !state || !state.adopted || feedbackUntil > now || animationUntil > now || COMBAT_PRESENTATION_FRAME.active || lifecycleCeremonyActive(now)) return;
    companionTapSequence += 1;
    companionGreeting = compactFeedback(companionGreetingCopy(state.pet, state.lifecycle || {}), 24);
    companionGreetingUntil = now + 2600;
    window.clearTimeout(companionGreetingTimer);
    var greetingVariant = companionGreetingVariant(state.pet);
    animateAction('greet', true, greetingVariant === 'front_wave' ? 2200 : 1400, { source: 'pet_tap', sequence: companionTapSequence, variant: greetingVariant });
    haptic('light');
    if (reducedMotion) {
      companionGreetingTimer = window.setTimeout(function () {
        companionGreeting = '';
        companionGreetingUntil = 0;
        drawWorld(performance.now());
      }, 2620);
    }
  }

  canvas.addEventListener('moonpet:greet', greetCompanion);

  canvas.addEventListener('click', function (event) {
    var bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    var canvasX = (event.clientX - bounds.left) * canvas.width / bounds.width;
    var canvasY = (event.clientY - bounds.top) * canvas.height / bounds.height;
    if (canvasX >= 92 && canvasX <= 228 && canvasY >= 72 && canvasY <= 220) greetCompanion();
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

  async function refreshLiveState() {
    var multiplayerActive = state && (state.arena || state.arena_queue || state.kaiju && (state.kaiju.match || state.kaiju.queue));
    var activityActive = state && state.guidance && state.guidance.activity;
    var relevant = activeScreen === 'explore' && multiplayerActive || activeScreen === 'work' && activityActive;
    var minimumDelay = multiplayerActive && activeScreen === 'explore' ? 4500 : 14000;
    if (busy || noticesBusy || !state || !state.adopted || !relevant || Date.now() - lastPassiveRefreshAt < minimumDelay) return;
    lastPassiveRefreshAt = Date.now();
    var before = multiplayerFingerprint(state);
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state');
      if (!data.state) return;
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      render();
      var after = multiplayerFingerprint(state);
      if (before !== after && activeScreen === 'explore') {
        tell('MULTIPLAYER STATE UPDATED.');
        haptic('light');
      } else if (activeScreen === 'work' && state.guidance && state.guidance.activity && state.guidance.activity.ready) {
        tell('TIMED ACTIVITY REWARD READY.');
        haptic('success');
      }
      await showPendingNotices();
    } catch (_) {}
  }

  async function refreshSeasonSnapshot(force) {
    var monotonicNow = performance.now();
    if (busy || noticesBusy || seasonRefreshBusy || !state || !state.adopted) return;
    if (!force && lastSeasonServerRefreshAt > 0 && monotonicNow - lastSeasonServerRefreshAt < 300000) return;
    seasonRefreshBusy = true;
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state');
      if (!setStateSnapshot(data.state, requestGeneration)) return;
      var scrollTop = screen.scrollTop;
      render();
      screen.scrollTop = scrollTop;
    } catch (_) {
    } finally {
      seasonRefreshBusy = false;
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

  function drawPixelRect(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  function petMood(pet) {
    if (!pet) return 'curious';
    if (Number(pet.health) < 35) return 'hurt';
    if (Number(pet.energy) < 20) return 'tired';
    if (Number(pet.hunger) > 78) return 'hungry';
    if (Number(pet.cleanliness) < 30) return 'scruffy';
    if (Number(pet.happiness) > 78) return 'happy';
    return 'curious';
  }

  function temperamentCompanionHabit(temperament) {
    var key = String(temperament || '').toLowerCase();
    if (/bold|brave|fierce|confident/.test(key)) return 'swagger';
    if (/rhythmic|play|wild|chaos|energetic/.test(key)) return 'fidget';
    if (/calm|soft|patient|loyal/.test(key)) return 'chill';
    if (/social|curious|alert|observant/.test(key)) return 'listen';
    return 'listen';
  }

  // TEST-EXPORT: combatDirector:start
  function clearCombatPresentation() {
    COMBAT_PRESENTATION_FRAME.active = false;
    COMBAT_PRESENTATION_FRAME.mode = '';
    COMBAT_PRESENTATION_FRAME.title = '';
    COMBAT_PRESENTATION_FRAME.status = '';
    COMBAT_PRESENTATION_FRAME.opponentName = '';
    COMBAT_PRESENTATION_FRAME.round = 0;
    COMBAT_PRESENTATION_FRAME.maxRounds = 0;
    COMBAT_PRESENTATION_FRAME.playerValue = 0;
    COMBAT_PRESENTATION_FRAME.opponentValue = 0;
    COMBAT_PRESENTATION_FRAME.maxValue = 100;
    COMBAT_PRESENTATION_FRAME.playerSpecial = 0;
    COMBAT_PRESENTATION_FRAME.opponentSpecial = 0;
    COMBAT_PRESENTATION_FRAME.playerCardKey = '';
    COMBAT_PRESENTATION_FRAME.opponentCardKey = '';
    COMBAT_PRESENTATION_FRAME.rivalColor = '#ff6d6d';
    COMBAT_PRESENTATION_FRAME.source = null;
    return COMBAT_PRESENTATION_FRAME;
  }

  function snapshotHasCombatUnlocked(snapshot) {
    var combat = combatCapability(snapshot);
    return combat.state === 'AVAILABLE' && combat.unlocked === true;
  }

  function snapshotHasSystemUnlocked(snapshot, key) {
    return hasSystemUnlocked(key, snapshot);
  }

  function updateCombatPresentation(snapshot) {
    if (snapshot === combatSnapshot && activeScreen === combatScreen) return COMBAT_PRESENTATION_FRAME;
    combatSnapshot = snapshot;
    combatScreen = activeScreen;
    clearCombatPresentation();
    if (activeScreen !== 'explore' || !snapshot || !snapshot.adopted) return COMBAT_PRESENTATION_FRAME;
    var arena = snapshot.arena;
    if (arena && snapshotHasSystemUnlocked(snapshot, 'arena') && arena.status !== 'completed' && !arena.outcome) {
      COMBAT_PRESENTATION_FRAME.active = true;
      COMBAT_PRESENTATION_FRAME.mode = 'arena';
      COMBAT_PRESENTATION_FRAME.title = arena.mode === 'multiplayer' ? 'PLAYER ARENA' : 'CRT ARENA';
      COMBAT_PRESENTATION_FRAME.status = arena.status === 'readying'
        ? arena.ready ? 'LOCKED IN // WAITING' : 'MATCH FOUND // READY UP'
        : 'ROUND ' + Number(arena.current_round || 1) + '/' + Number(arena.max_rounds || 5) + ' LIVE';
      COMBAT_PRESENTATION_FRAME.opponentName = String(arena.opponent && arena.opponent.pet_name || 'RIVAL');
      COMBAT_PRESENTATION_FRAME.rivalColor = combatRivalColor(COMBAT_PRESENTATION_FRAME);
      COMBAT_PRESENTATION_FRAME.round = Number(arena.current_round || 1);
      COMBAT_PRESENTATION_FRAME.maxRounds = Number(arena.max_rounds || 5);
      COMBAT_PRESENTATION_FRAME.playerValue = Math.max(0, Number(arena.player_hp || 0));
      COMBAT_PRESENTATION_FRAME.opponentValue = Math.max(0, Number(arena.opponent_hp || 0));
      COMBAT_PRESENTATION_FRAME.maxValue = Math.max(100, COMBAT_PRESENTATION_FRAME.playerValue, COMBAT_PRESENTATION_FRAME.opponentValue);
      COMBAT_PRESENTATION_FRAME.playerSpecial = Math.max(0, Number(arena.player_special || 0));
      COMBAT_PRESENTATION_FRAME.opponentSpecial = Math.max(0, Number(arena.opponent_special || 0));
      COMBAT_PRESENTATION_FRAME.source = arena;
      return COMBAT_PRESENTATION_FRAME;
    }
    var kaiju = snapshot.kaiju && snapshot.kaiju.match;
    if (kaiju && snapshotHasSystemUnlocked(snapshot, 'kaiju') && kaiju.status !== 'completed' && !kaiju.outcome) {
      COMBAT_PRESENTATION_FRAME.active = true;
      COMBAT_PRESENTATION_FRAME.mode = 'kaiju';
      COMBAT_PRESENTATION_FRAME.title = kaiju.mode === 'group' ? 'PLAYER KAIJU DUEL' : 'CRT KAIJU DUEL';
      COMBAT_PRESENTATION_FRAME.status = kaiju.own_card_locked
        ? kaiju.opponent_card_locked ? 'BOTH CARDS LOCKED' : 'YOUR CARD LOCKED // WAIT'
        : 'SELECT YOUR CODE CARD';
      COMBAT_PRESENTATION_FRAME.opponentName = kaiju.mode === 'group' ? 'RIVAL CARD' : 'CRT CARD';
      COMBAT_PRESENTATION_FRAME.rivalColor = combatRivalColor(COMBAT_PRESENTATION_FRAME);
      COMBAT_PRESENTATION_FRAME.playerValue = kaiju.own_card_locked ? 1 : 0;
      COMBAT_PRESENTATION_FRAME.opponentValue = kaiju.opponent_card_locked ? 1 : 0;
      COMBAT_PRESENTATION_FRAME.maxValue = 1;
      COMBAT_PRESENTATION_FRAME.playerCardKey = String(kaiju.own_card_key || '');
      COMBAT_PRESENTATION_FRAME.opponentCardKey = String(kaiju.opponent_card_key || '');
      COMBAT_PRESENTATION_FRAME.source = kaiju;
      return COMBAT_PRESENTATION_FRAME;
    }
    var run = snapshot.run;
    if (run && ['active', 'extractable'].includes(String(run.status || 'active'))) {
      var depth = Number(run.current_room != null ? run.current_room : run.depth || 0);
      var maxDepth = Math.max(1, Number(run.max_room || run.max_depth || 1));
      COMBAT_PRESENTATION_FRAME.active = true;
      COMBAT_PRESENTATION_FRAME.mode = 'run';
      COMBAT_PRESENTATION_FRAME.title = String(run.daily ? 'DAILY MOON RUN' : 'MOON RUN');
      COMBAT_PRESENTATION_FRAME.status = 'DEPTH ' + depth + '/' + maxDepth + ' // RISK ' + Number(run.risk_level || 1);
      COMBAT_PRESENTATION_FRAME.opponentName = 'ALLEY THREAT';
      COMBAT_PRESENTATION_FRAME.rivalColor = combatRivalColor(COMBAT_PRESENTATION_FRAME);
      COMBAT_PRESENTATION_FRAME.playerValue = depth;
      COMBAT_PRESENTATION_FRAME.opponentValue = Math.max(0, maxDepth - depth);
      COMBAT_PRESENTATION_FRAME.maxValue = maxDepth;
      COMBAT_PRESENTATION_FRAME.source = run;
    }
    return COMBAT_PRESENTATION_FRAME;
  }

  // TEST-EXPORT: combatDirector:end
  function drawPixelText(text, x, y, color, align) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.fillStyle = color; ctx.font = 'bold 8px "Courier New", monospace'; ctx.textAlign = align || 'left';
    ctx.fillText(String(text), x, y);
    ctx.restore();
  }

  // TEST-EXPORT: actionPresentation:start
  var ACTION_INFO_COLORS = {
    feed: '#c9a15a', play: '#73b9c6', clean: '#79bac0', sleep: '#8c91b8', train: '#ba7966',
    travel: '#7097bd', work: '#b79a62', equip: '#9db3bd', evolve: '#9a82b5', trade: '#78a58a',
    celebrate: '#c3a85c', interact: '#7faeb5', greet: '#7faeb5', blocked: '#b56c6c', battle: '#b56c6c'
  };

  function actionInfoTitle(mode) {
    if (mode === 'greet') return 'INTERACT';
    return words(mode || 'action').toUpperCase();
  }

  function drawCanvasText(text, x, y, color, size, weight) {
    ctx.save();
    ctx.fillStyle = color || '#d9e0de';
    ctx.font = String(weight || 400) + ' ' + String(size || 8) + 'px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(text || ''), x, y);
    ctx.restore();
  }

  function drawActionInfoPanel(title, lines, color, opacity) {
    var x = 205;
    var y = 74;
    var width = 105;
    var safeLines = (lines || []).filter(Boolean).slice(0, 5);
    ctx.save();
    ctx.globalAlpha = opacity == null ? 1 : opacity;
    ctx.fillStyle = 'rgba(3, 8, 7, 0.68)';
    ctx.fillRect(x - 6, y - 17, width + 6, 25 + safeLines.length * 13);
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 8, width, 1);
    ctx.restore();
    drawCanvasText(compactFeedback(title, 18), x, y + 4, color, 9, 600);
    safeLines.forEach(function (line, index) {
      drawCanvasText(compactFeedback(String(line).replace(/\s*\/\/\s*/g, ' - '), 23), x, y + 20 + index * 13, index === 0 ? '#eef2f1' : '#bec8c5', 8, index === 0 ? 500 : 400);
    });
  }

  function drawActionInfo(time) {
    var feedbackActive = feedbackUntil > time && feedbackLines.length;
    var actionActive = sleepLatched || animationUntil > time;
    if (!feedbackActive && !actionActive) return;
    var mode = feedbackActive && feedbackActionMode ? feedbackActionMode : animationMode;
    var lines = feedbackActive ? feedbackLines.slice() : [mode === 'sleep' ? 'Sleeping' : 'Processing...'];
    if (feedbackActive && feedbackReaction && lines.length < 5) lines.push(feedbackReaction);
    var fade = feedbackActive && !reducedMotion ? Math.min(1, Math.max(0.35, (feedbackUntil - time) / 480)) : 1;
    drawActionInfoPanel(actionInfoTitle(mode), lines, ACTION_INFO_COLORS[mode] || '#8fa5a0', fade);
  }
  // TEST-EXPORT: actionPresentation:end

  function createPetPalette(body, shade, accent) {
    return {
      normal: { body: body, shade: shade, accent: accent, outline: '#061009' },
      legendary: { body: body, shade: shade, accent: '#f6a7ff', outline: '#061009' },
    };
  }

  var PET_APPEARANCE_PALETTES = {
    mint_punch: createPetPalette('#80ffd5', '#36a878', '#f4ff65'),
    coral_pop: createPetPalette('#ff8bbd', '#c84f78', '#61f5ff'),
    cobalt_lime: createPetPalette('#61a8ff', '#3158a8', '#a9ff55'),
    gold_violet: createPetPalette('#f4cf58', '#8450aa', '#f6a7ff'),
    lavender_ice: createPetPalette('#d8b7ff', '#7757a8', '#b3ffff'),
    turquoise_flame: createPetPalette('#61f5ff', '#158f94', '#ff954f'),
  };
  var PET_SPECIES_PALETTES = {
    neon_raccoon: createPetPalette('#80ffd5', '#2c8f70', '#f4ff65'),
    bubble_ram: createPetPalette('#ff8bbd', '#a84770', '#61f5ff'),
    comet_gecko: createPetPalette('#61a8ff', '#3158a8', '#a9ff55'),
    vinyl_crab: createPetPalette('#f4ff65', '#bd703b', '#ff8bbd'),
    lantern_fox: createPetPalette('#c99cff', '#713d91', '#ffcf68'),
    sneaker_snail: createPetPalette('#a9ff55', '#4d9938', '#61f5ff'),
    alley_drake: createPetPalette('#ff954f', '#9c4329', '#f4ff65'),
    moon_ferret: createPetPalette('#61f5ff', '#277f91', '#f6a7ff'),
  };
  var DEFAULT_PET_PALETTE = createPetPalette('#a9ff9a', '#4ea85a', '#f4ff65');

  function drawMoonEgg(time, active, incubation) {
    var progress = Math.max(0, Number(incubation && incubation.progress || 0));
    var target = Math.max(1, Number(incubation && incubation.target || 12));
    var crack = Math.min(2, Math.floor(progress / target * 3));
    var eggY = 150 + (active ? -Math.abs(Math.round(Math.sin(time / 100) * 5)) : Math.round(Math.sin(time / 340) * 2));
    drawPixelRect(134, eggY - 48, 52, 57, '#061009');
    drawPixelRect(138, eggY - 44, 44, 49, '#d8f9ff');
    drawPixelRect(142, eggY - 38, 8, 10, '#61f5ff'); drawPixelRect(174, eggY - 23, 6, 12, '#f6a7ff');
    drawPixelRect(147, eggY - 18, 7, 6, '#061009'); drawPixelRect(167, eggY - 18, 7, 6, '#061009');
    drawPixelRect(157, eggY - 9, 8, 3, '#061009');
    if (crack > 0) { drawPixelRect(158, eggY - 47, 4, 12, '#061009'); drawPixelRect(161, eggY - 38, 8, 4, '#061009'); }
    if (crack > 1) { drawPixelRect(151, eggY - 34, 11, 4, '#061009'); drawPixelRect(148, eggY - 30, 4, 9, '#061009'); }
    drawPixelRect(128, eggY + 5, 64, 11, '#6eb8a1'); drawPixelRect(134, eggY + 8, 52, 7, '#d8f9ff');
    if (active) drawPixelText('SIGNAL!', 160, eggY - 58, '#f4ff65', 'center');
  }

  function drawSelectedBotSprite(time, mode, active, x, y, scale) {
    if (!botArtModeEnabled || !botArtRendererReady || !window.MoonpetBotArtRenderer) return false;
    var drew = window.MoonpetBotArtRenderer.renderMoonpetBot(ctx, mode, x, y, scale, time, {
      active: active,
      startedAt: active ? actionStartedAt : 0
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
    var lifecycle = state && state.lifecycle || {};
    var renderTime = reducedMotion ? performance.now() : time;
    var active = sleepLatched || animationUntil > renderTime;
    if (lifecycle.phase === 'egg') {
      drawMoonEgg(time, active, lifecycle.incubation);
      return;
    }

    var x = 112;
    var y = 194;
    if (drawSelectedBotSprite(renderTime, animationMode, active, x, y, 1)) return;
    if (!botArtFallbackLogged) {
      botArtFallbackLogged = true;
      console.info('[Moonpet] bot art unavailable; suppressing retired procedural pet fallback', botArtRendererState);
    }
  }

  var WORLD_SCENES = {
    home: { label: 'MOONBLOCK ROOFTOP', sky: '#03060b', haze: '#10251c', wall: '#102117', mortar: '#285b36', neon: '#a9ff9a', accent: '#61f5ff', leftTag: 'MOON', rightTag: 'HOME' },
    missions: { label: 'QUEST UNDERPASS', sky: '#090516', haze: '#241137', wall: '#21152c', mortar: '#5f3473', neon: '#f6a7ff', accent: '#f4ff65', leftTag: 'QUEST', rightTag: 'XP' },
    explore: { label: 'NEON RUN ALLEY', sky: '#02081a', haze: '#092b42', wall: '#0d2631', mortar: '#17607a', neon: '#61f5ff', accent: '#ff6d6d', leftTag: 'RUN', rightTag: 'BOSS' },
    work: { label: 'SCRAP YARD 85', sky: '#100805', haze: '#34200d', wall: '#2a2014', mortar: '#70522b', neon: '#ffcf68', accent: '#a9ff9a', leftTag: 'WORK', rightTag: '85' },
    economy: { label: 'CHAIN MARKET', sky: '#080414', haze: '#22103d', wall: '#211433', mortar: '#603d80', neon: '#f4ff65', accent: '#61f5ff', leftTag: 'GEMS', rightTag: 'TRADE' },
    profile: { label: 'ALL-CITY HEIGHTS', sky: '#08030d', haze: '#32102a', wall: '#271325', mortar: '#6d315e', neon: '#ff8bbd', accent: '#f4ff65', leftTag: 'RARE', rightTag: 'CORE' },
  };

  function companionAmbienceMode(hour) {
    if (hour < 6) return 'NIGHT SHIFT';
    if (hour < 9) return 'DAWN SHIFT';
    if (hour < 18) return 'DAY SHIFT';
    if (hour < 21) return 'DUSK SHIFT';
    return 'NIGHT SHIFT';
  }

  function drawUtcAmbience(scene) {
    var mode = companionAmbienceMode(utcHour);
    var tint = mode === 'DAY SHIFT' ? '#f4ff65' : mode === 'DAWN SHIFT' ? '#ff954f' : mode === 'DUSK SHIFT' ? '#f6a7ff' : '#61a8ff';
    ctx.save();
    ctx.globalAlpha = mode === 'DAY SHIFT' ? 0.025 : 0.055;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, 320, 220);
    ctx.restore();
    drawPixelText(mode, 314, 11, tint, 'right');
  }

  function combatRivalColor(combat) {
    var source = String(combat && combat.opponentName || combat && combat.mode || 'rival');
    var hash = 0;
    for (var index = 0; index < source.length; index += 1) hash = (hash * 33 + source.charCodeAt(index)) | 0;
    return COMBAT_RIVAL_COLORS[Math.abs(hash) % COMBAT_RIVAL_COLORS.length];
  }

  function drawCombatOpponent(time, scene, combat) {
    if (!combat || !combat.active) return;
    var rivalColor = combat.rivalColor || '#ff6d6d';
    var pulse = reducedMotion ? 0 : Math.round(Math.sin(time / 260) * 2);
    var x = 235;
    var y = 160 + pulse;
    if (combat.mode === 'kaiju') {
      drawPixelRect(202, 94, 66, 74, '#020704');
      drawPixelRect(202, 94, 66, 3, rivalColor);
      drawPixelRect(205, 100, 60, 43, scene.haze);
      drawPixelRect(218, 111, 34, 27, rivalColor);
      drawPixelRect(224, 105, 8, 8, rivalColor); drawPixelRect(242, 105, 8, 8, rivalColor);
      drawPixelRect(225, 119, 5, 7, '#020704'); drawPixelRect(241, 119, 5, 7, '#020704');
      drawPixelRect(228, 133, 18, 3, '#020704');
      drawPixelText(combat.opponentValue ? 'LOCKED' : 'HIDDEN', 235, 157, combat.opponentValue ? '#f4ff65' : '#aab5ae', 'center');
      drawPixelText('VS', 160, 136, '#ff6d6d', 'center');
      return;
    }
    if (combat.mode === 'run') {
      drawPixelRect(x - 25, y - 43, 50, 48, '#020704');
      drawPixelRect(x - 19, y - 55, 38, 25, rivalColor);
      drawPixelRect(x - 25, y - 42, 7, 36, rivalColor); drawPixelRect(x + 18, y - 42, 7, 36, rivalColor);
      drawPixelRect(x - 14, y - 49, 7, 5, '#f4ff65'); drawPixelRect(x + 7, y - 49, 7, 5, '#f4ff65');
      drawPixelRect(x - 17, y + 5, 13, 8, '#020704'); drawPixelRect(x + 4, y + 5, 13, 8, '#020704');
      drawPixelText('THREAT', x, y - 67, rivalColor, 'center');
      return;
    }
    drawPixelRect(x - 27, y - 39, 54, 39, rivalColor);
    drawPixelRect(x - 21, y - 62, 42, 31, rivalColor);
    drawPixelRect(x - 25, y - 68, 12, 12, rivalColor); drawPixelRect(x + 13, y - 68, 12, 12, rivalColor);
    drawPixelRect(x - 13, y - 53, 8, 7, '#020704'); drawPixelRect(x + 5, y - 53, 8, 7, '#020704');
    drawPixelRect(x - 7, y - 41, 14, 4, '#020704');
    drawPixelRect(x - 38, y - 31, 11, 8, rivalColor); drawPixelRect(x + 27, y - 31, 11, 8, rivalColor);
    drawPixelRect(x - 20, y, 14, 10, '#020704'); drawPixelRect(x + 6, y, 14, 10, '#020704');
    drawPixelText(compactFeedback(combat.opponentName, 15), x, y - 77, rivalColor, 'center');
  }

  function drawCombatMeter(x, y, width, value, maximum, color, reverse) {
    var safeMax = Math.max(1, Number(maximum || 1));
    var fill = Math.round(Math.max(0, Math.min(1, Number(value || 0) / safeMax)) * (width - 4));
    drawPixelRect(x, y, width, 7, '#020704');
    drawPixelRect(x, y, width, 1, color);
    if (fill > 0) drawPixelRect(reverse ? x + width - 2 - fill : x + 2, y + 2, fill, 3, color);
  }

  function drawCombatHud(scene, combat) {
    if (!combat || !combat.active) return;
    var rivalColor = combat.rivalColor || '#ff6d6d';
    var lines = [String(combat.status || '').replace(/\s*\/\/\s*/g, ' - ')];
    if (combat.mode === 'arena') {
      lines.push('You  HP ' + Number(combat.playerValue));
      lines.push(compactFeedback(combat.opponentName, 13) + '  HP ' + Number(combat.opponentValue));
      lines.push('Special ' + Number(combat.playerSpecial) + '/' + COMBAT_ARENA_SPECIAL_MAX);
    } else if (combat.mode === 'kaiju') {
      lines.push(combat.playerValue ? 'Your card locked' : 'Select your card');
      lines.push(combat.opponentValue ? 'Rival card locked' : 'Waiting for rival');
      if (combat.playerCardKey) lines.push('Card  ' + compactFeedback(words(combat.playerCardKey), 14));
    } else {
      lines.push('Progress ' + Number(combat.playerValue) + '/' + Number(combat.maxValue));
      lines.push(Number(combat.opponentValue) + ' rooms remain');
    }
    if (feedbackUntil > performance.now() && feedbackLines.length) lines = lines.concat(feedbackLines).slice(0, 5);
    drawActionInfoPanel(combat.title, lines, rivalColor, 1);
  }

  var WORLD_BUILDING_HEIGHTS = [32, 51, 39, 66, 44, 58, 35, 70, 48, 61];

  function worldScene() {
    return WORLD_SCENES[activeScreen] || WORLD_SCENES.home;
  }

  function drawGraffitiTag(text, x, y, color, align) {
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.font = 'bold italic 13px "Courier New", monospace';
    ctx.textAlign = align || 'left';
    ctx.fillText(text, x, y);
    ctx.fillRect(align === 'right' ? x - 42 : x, y + 3, 42, 2);
    ctx.restore();
  }

  var CAMERA_FRAME = { x: 0, y: 0, zoom: 1 };

  function updateCameraFrame(time) {
    CAMERA_FRAME.x = 0; CAMERA_FRAME.y = 0; CAMERA_FRAME.zoom = 1;
    if (botArtModeEnabled) return CAMERA_FRAME;
    if (reducedMotion || cameraImpactUntil <= time || cameraImpactStrength <= 0) return CAMERA_FRAME;
    var falloff = Math.max(0, Math.min(1, (cameraImpactUntil - time) / 900));
    var impact = cameraImpactStrength * falloff;
    CAMERA_FRAME.x = Math.round(Math.sin((time + actionSequence * 37) / 17) * impact);
    CAMERA_FRAME.y = Math.round(Math.cos((time + actionSequence * 23) / 23) * impact * 0.55);
    CAMERA_FRAME.zoom = 1 + Math.min(0.035, impact * 0.004);
    return CAMERA_FRAME;
  }

  function drawCinematicFeedback(time, scene) {
    if (feedbackUntil <= time || !feedbackLines.length) return;
    var color = feedbackTone === 'danger' ? '#ff6d6d' : scene.neon;
    var fade = reducedMotion ? 1 : Math.min(1, Math.max(0, (feedbackUntil - time) / 480));
    ctx.save(); ctx.globalAlpha = fade;
    drawPixelRect(53, 174, 214, 35, '#020704');
    drawPixelRect(53, 174, 214, 2, color); drawPixelRect(53, 207, 214, 2, color);
    for (var line = 0; line < feedbackLines.length; line += 1) drawPixelText(feedbackLines[line], 160, 185 + line * 10, line === 0 ? color : '#d8f9ff', 'center');
    if (feedbackReaction) {
      drawPixelRect(172, 74, 141, 31, '#020704'); drawPixelRect(172, 74, 3, 31, scene.accent);
      drawPixelText('MOONPET //', 181, 86, scene.accent, 'left');
      drawPixelText(feedbackReaction, 181, 98, '#f4ff65', 'left');
    }
    ctx.restore();
  }

  function drawLifecycleCeremony(time, scene) {
    if (!lifecycleCeremonyActive(time)) return;
    var ceremony = lifecycleCeremony;
    var duration = Math.max(1, lifecycleCeremonyUntil - lifecycleCeremonyStartedAt);
    var progress = Math.max(0, Math.min(1, (time - lifecycleCeremonyStartedAt) / duration));
    var color = ceremony.kind === 'rare' ? '#f6a7ff'
      : ceremony.kind === 'hatch' ? '#f4ff65'
        : ceremony.kind === 'evolve' ? '#61f5ff' : scene.accent;
    var fade = reducedMotion ? 1 : Math.min(1, progress * 5, (1 - progress) * 7);
    var lines = [ceremony.primary, ceremony.secondary];
    if (ceremony.kind === 'signal') {
      lines.push('Hatch progress ' + Number(ceremony.progress) + '/' + Number(ceremony.target));
    } else if (ceremony.detail) {
      lines.push(ceremony.detail);
    }
    drawActionInfoPanel(ceremony.title, lines, color, fade);
  }

  function drawWorldBackground() {
    if (!worldBackgroundReady || !worldBackgroundImage.naturalWidth || !worldBackgroundImage.naturalHeight) {
      drawPixelRect(0, 0, 320, 220, '#010402');
      return;
    }
    var sourceWidth = worldBackgroundImage.naturalWidth;
    var sourceHeight = worldBackgroundImage.naturalHeight;
    var sourceRatio = sourceWidth / sourceHeight;
    var targetRatio = 320 / 220;
    var sx = 0;
    var sy = 0;
    var sw = sourceWidth;
    var sh = sourceHeight;
    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) / 2;
    } else if (sourceRatio < targetRatio) {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) / 2;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(worldBackgroundImage, sx, sy, sw, sh, 0, 0, 320, 220);
    ctx.restore();
  }

  // TEST-EXPORT: drawWorld:start
  function drawWorld(time) {
    var scene = worldScene();
    var renderTime = reducedMotion ? performance.now() : time;
    var camera = updateCameraFrame(renderTime);
    var combat = updateCombatPresentation(state);

    // The authored BITTY image is now the complete environment. No procedural
    // sky, skyline, graffiti wall, landmarks, street, foreground or ambience.
    drawWorldBackground();

    ctx.save();
    ctx.translate(160 + camera.x, 110 + camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-160, -110);
    drawPet(renderTime);
    ctx.restore();

    if (lifecycleCeremonyActive(renderTime)) drawLifecycleCeremony(renderTime, scene);
    else if (combat.active) drawCombatHud(scene, combat);
    else drawActionInfo(renderTime);
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
    if (companionGreetingUntil > 0 && companionGreetingUntil <= time) {
      companionGreeting = '';
      companionGreetingUntil = 0;
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
    if (tg) {
      try { tg.ready(); tg.expand(); tg.setHeaderColor('#070707'); tg.setBackgroundColor('#070707'); if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (_) {}
    }
    setInterval(function () {
      var now = new Date();
      var nextUtcHour = now.getUTCHours();
      if (nextUtcHour !== utcHour) {
        utcHour = nextUtcHour;
        if (reducedMotion) drawWorld(performance.now());
      }
      clock.textContent = now.toISOString().slice(11, 19) + ' UTC';
    }, 1000);
    // Sprite loading must never block the game boot/auth path. Start all renderers in
    // the background and keep drawPet in its safe loading state until bot art is ready.
    var spriteStartup = Promise.allSettled([initBotArtMode()]);
    requestAnimationFrame(frame);
    await typeBoot(['MOONPET BIOS 0.9', 'CHECKING TELEGRAM SIGNATURE...', 'CONNECTING TO D1 MEMORY CORE...'], { speed: 10, hold: 180 });
    spriteStartup.then(function () {
      if (state) drawWorld(performance.now());
    });
    await restoreBrowserAuth();
    if (!initData && !telegramAuth) {
      tell('OPEN THIS GAME FROM @WIKICOMSBOT.', 'danger');
      screen.innerHTML = panel('TELEGRAM SIGNATURE REQUIRED',
        '<div class="line">MOONPET OS READS YOUR LIVE SAVE ONLY AFTER TELEGRAM VERIFIES YOUR IDENTITY.</div>' +
        '<div class="line muted">No player data was requested in this browser. Open the signed Mini App, then initialise or resume your Moonpet.</div>' +
        '<div class="button-grid one"><a class="terminal-link-button" href="https://t.me/WIKICOMSBOT?start=moonpet" target="_blank" rel="noopener noreferrer">OPEN MOONPET OS IN TELEGRAM</a>' +
        '<button type="button" class="terminal-button" data-utility="guide">HOW TO PLAY</button></div>', 'telegram-auth');
      await typeBoot(['AUTHENTICATION NOT FOUND', 'OPEN THE MINI APP INSIDE TELEGRAM', 'NO PLAYER DATA WAS READ'], { speed: 9, hold: 800 });
      return;
    }
    try {
      var requestGeneration = beginStateRequest();
      var data = await post('/telegram-pets/app/state');
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
      if (radioEnabled) setRadioEnabled(true, false);
      tell(state.adopted ? 'LIVE SAVE LOADED. CHOOSE A ROUTINE.' : 'MOON EGG READY FOR INITIALISATION.');
      await typeBoot(['SIGNATURE VERIFIED', 'PLAYER SAVE LOADED', 'MOONPET OS READY'], { speed: 8, hold: 320 });
      await showPendingNotices();
      applyRequestedFocus();
      window.setInterval(refreshLiveState, 5000);
      window.setInterval(tickCooldownDom, 1000);
      window.setInterval(tickSeasonDisplay, 30000);
    } catch (error) {
      tell(error.message || 'STARTUP FAILED', 'danger');
      screen.innerHTML = '<div class="connection-fault">STARTUP FAULT // ' + escapeHtml(error.message || 'API UNAVAILABLE') + '</div><div class="button-grid one"><button type="button" class="terminal-button" data-utility="retry">RETRY CONNECTION</button></div>';
      await typeBoot(['STARTUP FAULT', error.message || 'API UNAVAILABLE', 'USE RETRY CONNECTION BELOW'], { speed: 8, hold: 900 });
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
