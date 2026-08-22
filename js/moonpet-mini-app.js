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
  var animationLabel = '';
  var actionSequence = 0;
  var reducedMotionAnimationTimer = 0;
  var actionResultHoldMs = 3600;
  var actionStartedAt = 0;
  var cameraImpactUntil = 0;
  var cameraImpactStrength = 0;
  var feedbackUntil = 0;
  var feedbackRedrawTimer = 0;
  var feedbackTone = '';
  var feedbackLines = [];
  var feedbackReaction = '';
  var lifecycleCeremony = null;
  var lifecycleCeremonyStartedAt = 0;
  var lifecycleCeremonyUntil = 0;
  var lifecycleCeremonyTimer = 0;
  var sceneTransitionStartedAt = 0;
  var sceneTransitionUntil = 0;
  var sceneTransitionDirection = 1;
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

  function launchParameter(name) {
    var locations = [String(window.location.hash || '').replace(/^#/, ''), String(window.location.search || '').replace(/^\?/, '')];
    for (var index = 0; index < locations.length; index += 1) {
      if (!locations[index]) continue;
      var value = new URLSearchParams(locations[index]).get(name);
      if (value) return String(value);
    }
    return '';
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
    return remaining > 0 ? new Date(nowMs + remaining * 1000).toISOString() : '';
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
    profile: [['rare-morph', 'RARE'], ['memories', 'MEMORY'], ['callsign', 'NAME'], ['evolution', 'EVOLVE'], ['prestige', 'PRESTIGE'], ['season', 'SEASON'], ['leaderboard', 'RANKS']],
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

  function guideMarkup() {
    var combatGuideCopy = hasCombatUnlocked()
      ? 'Arena and Kaiju are available for completed Season players with a hatched active Moonpet.'
      : 'Arena and Kaiju remain locked future panels with stale-state cleanup only.';
    return '<div class="guide-step"><strong>1 // WAKE THE EGG</strong>Initialise your Moon Egg, then use at least three kinds of incubation care. Your care pattern shapes the hatch.</div>' +
      '<div class="guide-step"><strong>2 // KEEP NEEDS STABLE</strong>Feed, play, clean and rest. Training, care and daily routines build Pet XP, specialist XP, traits and equipment mastery.</div>' +
      '<div class="guide-step"><strong>3 // FOLLOW THE ROUTE</strong>The PET screen recommends the best next move. TASKS contains daily missions and achievements.</div>' +
      '<div class="guide-step"><strong>4 // EXPLORE THE CITY</strong>Districts show an objective, opponent and three risk routes; Stories offer two authored choices. ' + combatGuideCopy + ' Moon Run reaches 100 rooms—extract to bank unbanked rewards.</div>' +
      '<div class="guide-step"><strong>5 // BUILD YOUR LOADOUT</strong>WORK runs timed activities and jobs. GEAR contains equipment, materials, bounties, market offers, inventory and upgrades.</div>' +
      '<div class="guide-step"><strong>6 // EVOLVE YOUR IDENTITY</strong>CORE tracks personality, memories, evolution, season rewards and hidden rare-morph signals.</div>' +
      '<div class="guide-step"><strong>CURRENCIES</strong>Pet XP raises level. Moon Gold buys common upgrades. Gems unlock premium routes. Style unlocks cosmetics. Energy powers demanding actions.</div>' +
      '<div class="button-grid one"><button type="button" class="terminal-button" data-open-full-guide>OPEN COMPLETE WEBSITE GUIDE</button></div>';
  }

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
    ].every(function (key) { return typeof requirements[key] === 'boolean'; });
    if (!completeRequirements) return fallback;
    var stateLabel = String(combat.state || '').toUpperCase();
    var requirementReady = requirements.completed_season_pet === true
      && requirements.active_pet_exists === true
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

  function combatLockCopy() {
    var reason = combatCapability(state).reason;
    if (reason === 'moon_egg_must_hatch') {
      return {
        title: 'COMBAT LOCKED UNTIL YOUR ACTIVE MOONPET HATCHES.',
        detail: 'Requires a completed Season pet and a hatched active Moonpet. This is future expansion content and is not available during early Season 1.',
        entryDetail: 'REQUIRES HATCHED ACTIVE MOONPET',
      };
    }
    if (reason === 'pet_not_adopted') {
      return {
        title: 'COMBAT LOCKED UNTIL YOU ADOPT A MOONPET.',
        detail: 'Requires a completed Season pet and an active adult Moonpet. This is future expansion content and is not available during early Season 1.',
        entryDetail: 'REQUIRES ACTIVE MOONPET',
      };
    }
    if (reason === 'moonpet_lifecycle_required') {
      return {
        title: 'COMBAT LOCKED UNTIL YOUR MOONPET STATE SYNCS.',
        detail: 'Requires synced lifecycle authority before future combat can unlock.',
        entryDetail: 'REQUIRES SYNCED MOONPET',
      };
    }
    if (reason === 'capability_unavailable') {
      return {
        title: 'COMBAT LOCKED UNTIL CAPABILITY STATE SYNCS.',
        detail: 'Requires worker capability authority before future combat can unlock.',
        entryDetail: 'REQUIRES CAPABILITY SYNC',
      };
    }
    return {
      title: 'LOCKED UNTIL YOU COMPLETE A SEASON PET.',
      detail: 'Requires a completed adult Moonpet. This is future expansion content and is not available during early Season 1.',
      entryDetail: 'REQUIRES COMPLETED SEASON PET',
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
      ? '<div class="line complete"><strong>SEASON COMPLETE</strong> // SANCTUARY ELIGIBLE</div>'
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
    var journeyStatus = journey.season_complete ? 'SEASON COMPLETE // SANCTUARY ELIGIBLE'
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
    if (!hasCombatUnlocked()) {
      var arenaLock = combatLockCopy();
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
    if (!hasCombatUnlocked()) {
      var kaijuLock = combatLockCopy();
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
    var futureSystemTitles = {
      breeding: 'Breeding',
      traits: 'Traits',
      sanctuary: 'Sanctuary',
      lineage: 'Lineage',
      fusion: 'Fusion',
      arena: 'Arena',
      kaiju: 'Kaiju',
      prestige: 'Prestige',
      weekly_journey: 'Weekly Journey',
    };
    var capabilitySystems = state.capabilities_version === 1 && state.capabilities && state.capabilities.systems && typeof state.capabilities.systems === 'object'
      ? state.capabilities.systems
      : {};
    var futureSystems = Object.keys(futureSystemTitles).map(function (key) {
      var system = capabilitySystems[key] || {};
      var status = String(system.state || 'LOCKED').toUpperCase();
      var message = system.message || (status === 'COMING_SOON' ? 'Future expansion content. Not available yet.' : 'Requires completed Season pet. Locked until you complete a Season pet.');
      return {
        key: key,
        title: futureSystemTitles[key],
        status: ['LOCKED', 'COMING_SOON', 'AVAILABLE'].includes(status) ? status : 'LOCKED',
        detail: message,
      };
    });
    var futureSystemRows = futureSystems.map(function (system) {
      var status = String(system.status || 'LOCKED').toUpperCase();
      var online = status === 'AVAILABLE';
      var label = status === 'COMING_SOON' ? 'PLANNED EXPANSION' : status;
      return '<div class="line ' + (online ? 'complete' : 'locked') + '">[' + escapeHtml(label) + '] ' + escapeHtml(system.title || system.key || 'Future System') + '</div><div class="line muted">' + escapeHtml(system.detail || '') + '</div>';
    }).join('');
    function futureSystemByKey(key, fallbackStatus) {
      return futureSystems.find(function (system) { return system.key === key; }) || {
        key: key,
        status: fallbackStatus || 'LOCKED',
        detail: fallbackStatus === 'COMING_SOON' ? 'Future expansion content. Not available yet.' : 'Requires completed Season pet. Locked until you complete a Season pet.',
      };
    }
    function futureSystemPanelCopy(system) {
      var status = String(system.status || 'LOCKED').toUpperCase();
      if (status === 'COMING_SOON') return '<div class="line locked">FUTURE EXPANSION CONTENT.</div><div class="line muted">NOT AVAILABLE YET.</div>';
      if (status === 'AVAILABLE') return '<div class="line complete">AVAILABLE.</div><div class="line muted">' + escapeHtml(system.detail || '') + '</div>';
      return '<div class="line locked">LOCKED UNTIL YOU COMPLETE A SEASON PET.</div><div class="line muted">' + escapeHtml(system.detail || 'Requires completed Season pet. Locked until you complete a Season pet.') + '</div>';
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
      panel('IDENTITY CORE', '<div class="line complete">' + escapeHtml(lifecycle.species_name || identity.current_stage && identity.current_stage.name || words(state.pet.stage)) + ' // ' + escapeHtml(words(lifecycle.phase || 'companion')) + '</div><div class="line muted">' + escapeHtml(words(lifecycle.temperament || 'forming')) + ' TEMPERAMENT</div>' + innate + '<div class="line muted">LEARNED PERSONALITY</div>' + (traits || '<div class="line muted">TRAITS STILL FORMING. Trait expansion remains locked until completed Season pets.</div>')) + panel('HIDDEN MORPH SIGNAL', rarePanel, 'rare-morph') +
      panel('LEARNED APTITUDES', aptitudeRows) +
      panel('MEMORY ARCHIVE', memoryRows + (milestones || '<div class="line muted">NO MILESTONES RECORDED YET.</div>'), 'memories') +
      panel('CALLSIGN', '<label class="line" for="pet-name-input">MOONPET NAME</label><input id="pet-name-input" class="terminal-input" maxlength="32" value="' + escapeHtml(state.pet.pet_name || '') + '"><div class="button-grid one">' + button('WRITE NEW CALLSIGN', 'rename') + '</div>', 'callsign') +
      panel('EVOLUTION', evoHtml, 'evolution') + panel('FACTION PERK', '<div class="line complete">' + escapeHtml(words(faction.key || 'unaligned')) + '</div><div class="line muted">' + escapeHtml(faction.bonus ? words(faction.bonus.system) + ' // ' + costText(faction.bonus.effect) : 'JOIN A FACTION TO ACTIVATE A GAMEPLAY BONUS') + '</div>', 'faction') +
      panel('PRESTIGE', futureSystemPanelCopy(futureSystemByKey('prestige', 'COMING_SOON')), 'prestige') +
      panel('MOONPET SANCTUARY', sanctuaryPanel, 'sanctuary') + panel('SPECIALIST TRACKS', tracks, 'tracks') + panel('LOCKED FUTURE SYSTEMS', futureSystemRows, 'future-systems') + panel('UNLOCK DIRECTORY', featureRows, 'features') + panel('ALERT CONTROL', notificationPanel, 'alerts') + panel('SEASON // ' + (season.key || ''), '<div class="line">' + number(season.xp) + ' SEASON XP</div>' + tiers, 'season') + panel('TOP MOONPETS', (leaders || '<div class="line muted">NO RANKS LOADED.</div>') + '<div class="button-grid one"><button type="button" class="terminal-button" data-utility="leaderboard">OPEN FULL LEADERBOARD</button></div>', 'leaderboard');
  }

  var screens = { home: renderHome, missions: renderMissions, explore: renderExplore, work: renderWork, economy: renderEconomy, profile: renderProfile };
  var navItems = [
    ['home', '⌂', 'PET'], ['missions', '☷', 'TASKS'], ['explore', '⚔', 'RUN'], ['work', '⚒', 'WORK'], ['economy', '◇', 'GEAR'], ['profile', '★', 'CORE'],
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
    if (!result) return 'SYSTEM RESPONSE LOST.';
    if (!result.accepted) {
      var blockedParts = ['ACTION BLOCKED'];
      var blockedReasonCopy = rejectionMessage(result.reason);
      if (blockedReasonCopy) blockedParts[0] += ' - ' + blockedReasonCopy;
      if (result.duplicate) blockedParts.push('Duplicate blocked by authority.');
      return blockedParts.join(' // ');
    }
    var reward = resultRewardMap(result);
    var gains = Object.entries(reward).filter(function (entry) { return Number(entry[1]) > 0 && typeof entry[1] !== 'object'; }).map(function (entry) { return '+' + number(entry[1]) + ' ' + words(entry[0]); });
    var parts = ['ACTION ACCEPTED'];
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
    if (!result) return { tone: 'danger', lines: ['SYSTEM RESPONSE LOST'], reaction: '' };
    var lines = [result.accepted ? 'ACTION COMPLETE' : 'ACTION BLOCKED'];
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
    if (redraw && reducedMotion) drawWorld(performance.now());
  }

  function presentResultFeedback(result, beforeState, afterState) {
    var feedback = actionFeedback(result, beforeState, afterState);
    var feedbackDuration = Math.max(5200, actionResultHoldMs + 1600);
    window.clearTimeout(feedbackRedrawTimer);
    feedbackTone = feedback.tone;
    feedbackLines = feedback.lines;
    feedbackReaction = feedback.reaction;
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
      return { kind: 'egg', title: 'MOON EGG INITIALISED', primary: 'IDENTITY SIGNAL DORMANT', secondary: 'CARE SHAPES WHAT HATCHES', detail: '', duration: 5200 };
    }
    if (before.phase === 'egg' && after.phase === 'young' && after.speciesId) {
      return {
        kind: 'hatch', title: 'HATCH COMPLETE', primary: after.speciesName,
        secondary: words(after.temperament || 'forming') + ' TEMPERAMENT',
        detail: [after.marking].concat(after.traits).filter(Boolean).map(words).join(' // '), duration: 7600,
      };
    }
    if (before.phase !== 'rare' && after.phase === 'rare' && after.rareName) {
      return {
        kind: 'rare', title: 'HIDDEN MORPH REVEALED', primary: after.rareName,
        secondary: after.speciesName ? after.speciesName + ' // RARE SIGNAL LIVE' : 'RARE SIGNAL LIVE',
        detail: after.traits.map(words).join(' // '), duration: 8200,
      };
    }
    if (after.stage > before.stage || before.phase === 'young' && after.phase === 'adult') {
      return {
        kind: 'evolve', title: 'EVOLUTION COMPLETE', primary: words(after.stageName || after.phase),
        secondary: after.speciesName || 'MOONPET FORM STABLE',
        detail: after.traits.map(words).join(' // '), duration: 6800,
      };
    }
    if (actionKey === 'incubate' && after.phase === 'egg' && after.progress > before.progress) {
      return {
        kind: 'signal', title: 'EGG SIGNAL STRENGTHENED', primary: after.progress + '/' + after.target,
        secondary: words(result.care_type || 'care') + ' RESONANCE', detail: '',
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
    await typeBoot(['PROGRESSION MILESTONE DETECTED'].concat(visible.map(function (notice) { return notice.title + (notice.detail ? ' // ' + notice.detail : ''); })), { speed: 6, hold: 1600, notice: true });
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
    if (key === 'activity_claim') return 'celebrate';
    if (key === 'activity_cancel') return 'interact';
    if (/feed|use_item/.test(key)) return 'feed';
    if (/play/.test(key)) return 'play';
    if (/clean/.test(key)) return 'clean';
    if (/hatch|rare_morph/.test(key)) return 'evolve';
    if (/incubate/.test(key)) return String(payload && payload.care_type || '') === 'music' ? 'play' : String(payload && payload.care_type || '') === 'rest' ? 'sleep' : 'interact';
    if (/sleep|rest/.test(key)) return 'sleep';
    if (/train/.test(key)) return 'train';
    if (/boss|arena|kaiju|fight|attack|district/.test(key)) return 'battle';
    if (/run|adventure|expedition|random_event|event_chain/.test(key)) return 'travel';
    if (/job|activity|work/.test(key)) return 'work';
    if (/buy|market|equipment|cosmetic|gear/.test(key)) return 'equip';
    if (/evolve|prestige/.test(key)) return 'evolve';
    if (/trade/.test(key)) return 'trade';
    if (/claim|chest|bounty|season|reward|achievement/.test(key)) return 'celebrate';
    return 'interact';
  }

  var CAMERA_IMPACT_STRENGTH = {
    feed: 1, play: 2, clean: 1, sleep: 0, train: 3, battle: 6, travel: 2,
    work: 2, equip: 2, evolve: 5, trade: 2, celebrate: 4, interact: 1, blocked: 4,
  };

  function animateAction(action, accepted, duration, payload) {
    animationMode = accepted === false ? 'blocked' : actionAnimationFamily(action, payload);
    animationLabel = accepted === false ? 'NOT READY' : words(animationMode);
    actionSequence += 1;
    var animationDuration = duration || 2400;
    actionStartedAt = performance.now();
    cameraImpactStrength = reducedMotion ? 0 : CAMERA_IMPACT_STRENGTH[animationMode] || 0;
    cameraImpactUntil = actionStartedAt + Math.min(animationDuration, 900);
    animationUntil = actionStartedAt + animationDuration;
    if (reducedMotion) {
      window.clearTimeout(reducedMotionAnimationTimer);
      var sequence = actionSequence;
      drawWorld(performance.now());
      reducedMotionAnimationTimer = window.setTimeout(function () {
        if (sequence !== actionSequence) return;
        animationMode = 'idle';
        animationLabel = '';
        drawWorld(performance.now());
      }, animationDuration);
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
    animateAction(action, true, 8000, payload);
    tell('TRANSMITTING ' + words(action) + '...');
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
      await typeBoot(['EXEC ' + action.toUpperCase(), message, 'STATE CACHE REFRESHED'], { speed: 5, hold: actionResultHoldMs });
      await showPendingNotices();
      animateAction(action, Boolean(data.result && data.result.accepted), 2800, payload);
      if (!startLifecycleCeremony(plannedCeremony)) presentResultFeedback(data.result, stateBeforeAction, nextState);
    } catch (error) {
      animateAction('blocked', false, 2800);
      tell(error.message || 'CONNECTION FAILED', 'danger');
      haptic('error');
      await typeBoot(['FAULT DETECTED', error.message || 'CONNECTION FAILED', 'RETRY WHEN LINK IS STABLE'], { speed: 8, hold: 2200 });
    } finally {
      busy = false;
      if (buttonElement) buttonElement.classList.remove('is-active');
    }
  }

  function switchScreen(nextScreen) {
    if (!SCREEN_ORDER.includes(nextScreen) || nextScreen === activeScreen) return false;
    sceneTransitionDirection = SCREEN_ORDER.indexOf(nextScreen) >= SCREEN_ORDER.indexOf(activeScreen) ? 1 : -1;
    activeScreen = nextScreen;
    sceneTransitionStartedAt = performance.now();
    sceneTransitionUntil = reducedMotion ? 0 : sceneTransitionStartedAt + 420;
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
      typeBoot(['ROUTING COACH RECOMMENDATION', 'MOUNT /' + activeScreen.toUpperCase(), 'REQUIREMENTS DISPLAYED'], { speed: 4, hold: 150 });
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

  function greetCompanion() {
    var now = performance.now();
    if (busy || !state || !state.adopted || feedbackUntil > now || animationUntil > now || COMBAT_PRESENTATION_FRAME.active || lifecycleCeremonyActive(now)) return;
    companionTapSequence += 1;
    companionGreeting = compactFeedback(companionGreetingCopy(state.pet, state.lifecycle || {}), 24);
    companionGreetingUntil = now + 2600;
    window.clearTimeout(companionGreetingTimer);
    animateAction('interact', true, 1400, { source: 'pet_tap', sequence: companionTapSequence });
    animationLabel = 'HELLO';
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
    if (canvasX >= 92 && canvasX <= 228 && canvasY >= 66 && canvasY <= 190) greetCompanion();
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
    typeBoot(['MOUNT /' + activeScreen.toUpperCase(), 'READING LIVE PLAYER STATE', 'MODULE READY'], { speed: 4, hold: 130 });
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

  function petStage(pet) {
    if (!pet) return 0;
    var explicit = pet.evolution_stage == null ? NaN : Number(pet.evolution_stage);
    if (Number.isFinite(explicit)) return Math.max(0, Math.min(5, explicit));
    var label = String(pet.stage || '').toLowerCase();
    if (label.includes('legend')) return 5;
    if (label.includes('guardian')) return 4;
    if (label.includes('elite')) return 3;
    if (label.includes('cyber')) return 2;
    if (label.includes('street')) return 1;
    return 0;
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

  var SCENE_COMPANION_HABITS = {
    home: 'moon_gaze', missions: 'signal_scan', explore: 'alley_prowl',
    work: 'scrap_tinker', economy: 'window_shop', profile: 'memory_glow',
  };
  var SPECIES_COMPANION_HABITS = {
    neon_raccoon: 'mask_wash', bubble_ram: 'hoof_tap', comet_gecko: 'wall_cling',
    vinyl_crab: 'claw_click', lantern_fox: 'ear_flick', sneaker_snail: 'shell_rock',
    alley_drake: 'wing_flex', moon_ferret: 'tunnel_peek',
  };
  var COMPANION_THOUGHTS = {
    moon_gaze: 'MOON LOOKS CLOSE', signal_scan: 'SIGNAL LOCKED', alley_prowl: 'ALLEY CHECK',
    scrap_tinker: 'MAKING SOMETHING', window_shop: 'THAT GEAR THOUGH', memory_glow: 'I REMEMBER',
    mask_wash: 'MASK STAYS FRESH', hoof_tap: 'KEEP THE BEAT', wall_cling: 'UP HERE!',
    claw_click: 'CLICK CLACK', ear_flick: 'HEARD SOMETHING', shell_rock: 'ROLL WITH IT',
    wing_flex: 'READY TO LIFT', tunnel_peek: 'SECRET ROUTE?', swagger: 'ALL CITY ENERGY',
    listen: 'TELL ME MORE', fidget: 'LET US MOVE', chill: 'GOOD VIBES',
  };
  var COMPANION_PRESENCE_FRAME = { behavior: 'chill', phase: 0.72, thought: 'GOOD VIBES', slot: -1, screen: '', seed: -1 };
  var COMBAT_RIVAL_COLORS = ['#ff6d6d', '#ff954f', '#f6a7ff', '#61f5ff', '#f4ff65', '#c99cff'];
  var COMBAT_ARENA_SPECIAL_MAX = 3;
  var COMBAT_PRESENTATION_FRAME = {
    active: false, mode: '', title: '', status: '', opponentName: '', round: 0, maxRounds: 0,
    playerValue: 0, opponentValue: 0, maxValue: 100, playerSpecial: 0, opponentSpecial: 0,
    playerCardKey: '', opponentCardKey: '', rivalColor: '#ff6d6d', source: null,
  };

  function companionIdentitySeed(pet, lifecycle) {
    var appearance = lifecycle && lifecycle.appearance;
    var species = lifecycle && lifecycle.species_id || pet && pet.species || 'moonpet';
    var temperament = lifecycle && lifecycle.temperament || 'curious';
    var marking = appearance && appearance.marking || 'moon_mark';
    var petName = pet && pet.pet_name || 'moonpet';
    if (species === companionSeedSpecies && temperament === companionSeedTemperament && marking === companionSeedMarking && petName === companionSeedName) return companionSeedValue;
    var source = String(species) + '|' + String(temperament) + '|' + String(marking) + '|' + String(petName);
    var hash = 0;
    for (var index = 0; index < source.length; index += 1) hash = (hash * 31 + source.charCodeAt(index)) | 0;
    companionSeedSpecies = species;
    companionSeedTemperament = temperament;
    companionSeedMarking = marking;
    companionSeedName = petName;
    companionSeedValue = Math.abs(hash);
    return companionSeedValue;
  }

  function temperamentCompanionHabit(temperament) {
    var key = String(temperament || '').toLowerCase();
    if (/bold|brave|fierce|confident/.test(key)) return 'swagger';
    if (/rhythmic|play|wild|chaos|energetic/.test(key)) return 'fidget';
    if (/calm|soft|patient|loyal/.test(key)) return 'chill';
    if (/social|curious|alert|observant/.test(key)) return 'listen';
    return 'listen';
  }

  function companionNeedThought(pet, lifecycle, fallback) {
    if (!pet) return fallback;
    if (Number(pet.health) < 35) return 'I NEED PATCHING';
    if (Number(pet.energy) < 20) return 'NAP SIGNAL';
    if (Number(pet.hunger) > 78) return 'SNACK PLEASE';
    if (Number(pet.cleanliness) < 30) return 'WASH TIME';
    if (Number(pet.happiness) < 30) return 'PLAY WITH ME';
    if (lifecycle && lifecycle.phase === 'young') return 'WHAT IS NEXT?';
    if (lifecycle && lifecycle.phase === 'rare') return 'RARE SIGNAL LIVE';
    return fallback;
  }

  // TEST-EXPORT: phase4PresenceDirector:start
  function updateCompanionPresence(pet, lifecycle, time) {
    if (!pet) {
      COMPANION_PRESENCE_FRAME.behavior = 'chill';
      COMPANION_PRESENCE_FRAME.phase = 0.72;
      COMPANION_PRESENCE_FRAME.thought = '';
      return COMPANION_PRESENCE_FRAME;
    }
    var presenceTime = reducedMotion ? 0 : Math.max(0, time);
    var slot = reducedMotion ? 0 : Math.floor(presenceTime / 8000);
    var seed = companionIdentitySeed(pet, lifecycle);
    if (COMPANION_PRESENCE_FRAME.slot !== slot || COMPANION_PRESENCE_FRAME.screen !== activeScreen || COMPANION_PRESENCE_FRAME.seed !== seed) {
      var selector = (seed + slot) % 3;
      COMPANION_PRESENCE_FRAME.behavior = selector === 0
        ? SCENE_COMPANION_HABITS[activeScreen] || 'moon_gaze'
        : selector === 1
          ? SPECIES_COMPANION_HABITS[lifecycle && lifecycle.species_id || pet && pet.species] || 'listen'
          : temperamentCompanionHabit(lifecycle && lifecycle.temperament);
      COMPANION_PRESENCE_FRAME.slot = slot;
      COMPANION_PRESENCE_FRAME.screen = activeScreen;
      COMPANION_PRESENCE_FRAME.seed = seed;
    }
    COMPANION_PRESENCE_FRAME.phase = reducedMotion ? 0.72 : presenceTime % 8000 / 8000;
    COMPANION_PRESENCE_FRAME.thought = companionNeedThought(pet, lifecycle, COMPANION_THOUGHTS[COMPANION_PRESENCE_FRAME.behavior] || 'STAY READY');
    return COMPANION_PRESENCE_FRAME;
  }
  // TEST-EXPORT: phase4PresenceDirector:end

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

  function updateCombatPresentation(snapshot) {
    if (snapshot === combatSnapshot && activeScreen === combatScreen) return COMBAT_PRESENTATION_FRAME;
    combatSnapshot = snapshot;
    combatScreen = activeScreen;
    clearCombatPresentation();
    if (activeScreen !== 'explore' || !snapshot || !snapshot.adopted) return COMBAT_PRESENTATION_FRAME;
    var arena = snapshot.arena;
    if (arena && snapshotHasCombatUnlocked(snapshot) && arena.status !== 'completed' && !arena.outcome) {
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
    if (kaiju && snapshotHasCombatUnlocked(snapshot) && kaiju.status !== 'completed' && !kaiju.outcome) {
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

  function drawActionEffects(time, x, y, active) {
    if (!active) return;
    var phase = Math.floor(time / 90) + actionSequence * 7;
    var i;
    if (animationMode === 'feed') {
      drawPixelRect(x + 36, y - 7, 15, 8, '#ffb84d'); drawPixelRect(x + 43, y - 13, 6, 6, '#f4ff65');
      drawPixelText('NOM!', x + 52, y - 20, '#f4ff65', 'center');
    } else if (animationMode === 'play') {
      var ballX = x + Math.round(Math.sin(time / 105) * 48); var ballY = y - 10 - Math.abs(Math.round(Math.cos(time / 105) * 25));
      drawPixelRect(ballX - 5, ballY - 5, 10, 10, '#f6a7ff'); drawPixelRect(ballX - 2, ballY - 2, 4, 4, '#61f5ff');
    } else if (animationMode === 'clean') {
      for (i = 0; i < 7; i += 1) { var bubbleY = y - 5 - ((phase * 3 + i * 13) % 62); drawPixelRect(x - 45 + i * 15, bubbleY, 4 + i % 2, 4 + i % 2, '#b3ffff'); }
    } else if (animationMode === 'sleep') {
      drawPixelText('Z', x + 33, y - 32, '#d8f9ff'); drawPixelText('Z', x + 43, y - 45, '#d8f9ff'); drawPixelText('Z', x + 55, y - 60, '#d8f9ff');
    } else if (animationMode === 'train') {
      drawPixelRect(x - 55, y - 7, 34, 5, '#aab5ae'); drawPixelRect(x - 59, y - 13, 5, 17, '#aab5ae'); drawPixelRect(x - 65, y - 16, 6, 23, '#4ea85a');
      drawPixelText('+XP', x + 45, y - 40, '#f4ff65', 'center');
    } else if (animationMode === 'battle') {
      for (i = 0; i < 4; i += 1) { var slash = (phase * 6 + i * 17) % 70; drawPixelRect(x - 50 + slash, y - 55 + i * 9, 18, 2, i % 2 ? '#ff6d6d' : '#f4ff65'); }
      drawPixelText('COMBO!', x, y - 65, '#ff6d6d', 'center');
    } else if (animationMode === 'travel') {
      for (i = 0; i < 6; i += 1) drawPixelRect(x - 62 - ((phase * 4 + i * 15) % 42), y + 18 - i % 3 * 5, 8, 2, '#4ea85a');
      drawPixelText('RUN!', x + 44, y - 45, '#f4ff65', 'center');
    } else if (animationMode === 'work') {
      drawPixelRect(x + 36, y - 28, 4, 28, '#ffcf68'); drawPixelRect(x + 29, y - 33, 19, 7, '#aab5ae');
      drawPixelText('WORK', x + 43, y - 43, '#f4ff65', 'center');
    } else if (animationMode === 'equip') {
      for (i = 0; i < 5; i += 1) { var sparkle = (phase + i * 11) % 40; drawPixelRect(x - 46 + i * 23, y - 18 - sparkle, 3, 3, '#61f5ff'); }
      drawPixelText('GEAR ON', x, y - 65, '#61f5ff', 'center');
    } else if (animationMode === 'evolve') {
      ctx.strokeStyle = phase % 2 ? '#f6a7ff' : '#f4ff65'; ctx.lineWidth = 3; ctx.strokeRect(x - 45 - phase % 8, y - 58 - phase % 8, 90 + phase % 16, 82 + phase % 16);
      drawPixelText('EVOLVING', x, y - 70, '#f6a7ff', 'center');
    } else if (animationMode === 'trade' || animationMode === 'celebrate') {
      for (i = 0; i < 8; i += 1) { var coinY = y - ((phase * 4 + i * 17) % 76); drawPixelRect(x - 55 + i * 16, coinY, 5, 5, i % 3 ? '#f4ff65' : '#61f5ff'); }
      drawPixelText(animationMode === 'trade' ? 'DEAL!' : 'REWARD!', x, y - 68, '#f4ff65', 'center');
    } else if (animationMode === 'blocked') {
      drawPixelRect(x - 50, y - 58, 100, 3, '#ff6d6d'); drawPixelRect(x - 50, y - 58, 3, 20, '#ff6d6d');
      drawPixelText('NOT READY', x, y - 45, '#ff6d6d', 'center');
    } else {
      drawPixelText('!', x + 40, y - 44, '#f4ff65', 'center');
    }
  }

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

  function petPalette(lifecycle, stage) {
    var selected = PET_APPEARANCE_PALETTES[lifecycle && lifecycle.appearance && lifecycle.appearance.palette]
      || PET_SPECIES_PALETTES[lifecycle && lifecycle.species_id]
      || DEFAULT_PET_PALETTE;
    return stage >= 5 ? selected.legendary : selected.normal;
  }

  function petPose(time, active, mood, presence) {
    var pose = { x: 0, y: 0, headY: 0, squashX: 1, squashY: 1, arm: 0, tail: 0 };
    if (!active) {
      pose.y = mood === 'tired' ? 3 : Math.round(Math.sin(time / 270) * 2);
      if (mood === 'happy') { pose.y -= 2; pose.arm = -3; pose.tail = 8; }
      else if (mood === 'hungry') { pose.headY = 4; pose.arm = 5; pose.squashY = 0.96; }
      else if (mood === 'hurt') { pose.headY = 4; pose.x = -2; pose.squashX = 0.94; pose.squashY = 0.92; }
      var idleTime = reducedMotion ? 0 : time;
      var idleWave = Math.sin(idleTime / 520);
      var behavior = presence && presence.behavior || 'chill';
      if (behavior === 'moon_gaze') { pose.headY -= 3; pose.x += 2; pose.tail += 3; }
      else if (behavior === 'signal_scan') { pose.x += Math.round(idleWave * 3); pose.headY -= 1; }
      else if (behavior === 'alley_prowl') { pose.x += Math.round(idleWave * 6); pose.y += Math.abs(Math.round(idleWave * 2)); pose.tail += 5; }
      else if (behavior === 'scrap_tinker') { pose.headY += 2; pose.arm = -5; }
      else if (behavior === 'window_shop') { pose.x += 3; pose.headY -= 2; pose.arm = -2; }
      else if (behavior === 'memory_glow') { pose.y -= 2; pose.arm = -3; pose.tail += 4; }
      else if (behavior === 'mask_wash') { pose.arm = -7; pose.headY += 1; }
      else if (behavior === 'hoof_tap') { pose.y += Math.abs(Math.round(idleWave * 2)); pose.squashY = 0.98; }
      else if (behavior === 'wall_cling') { pose.x += 4; pose.y -= 3; pose.squashY = 1.04; }
      else if (behavior === 'claw_click') { pose.arm = Math.round(idleWave * 5); }
      else if (behavior === 'ear_flick') { pose.headY += Math.round(idleWave * 2); pose.tail += 4; }
      else if (behavior === 'shell_rock') { pose.x += Math.round(idleWave * 3); pose.squashX = 1.03; }
      else if (behavior === 'wing_flex') { pose.arm = -8; pose.squashX = 1.04; }
      else if (behavior === 'tunnel_peek') { pose.x -= 4; pose.headY += 2; }
      else if (behavior === 'swagger') { pose.x += 3; pose.arm = -4; pose.tail += 6; }
      else if (behavior === 'listen') { pose.headY -= 2; pose.x += Math.round(idleWave); }
      else if (behavior === 'fidget') { pose.y -= Math.abs(Math.round(idleWave * 3)); pose.tail += 8; }
      else { pose.squashX = 1 + idleWave * 0.012; pose.squashY = 1 - idleWave * 0.012; }
      return pose;
    }
    if (animationMode === 'feed') { pose.headY = 5; pose.arm = 7; pose.squashY = 0.96; }
    else if (animationMode === 'play') { pose.x = Math.round(Math.sin(time / 70) * 20); pose.y = -Math.abs(Math.round(Math.sin(time / 80) * 7)); pose.arm = -8; pose.tail = 13; }
    else if (animationMode === 'clean') { pose.x = Math.round(Math.sin(time / 90) * 3); pose.squashX = 1.04; }
    else if (animationMode === 'sleep') { pose.y = 7; pose.headY = 5; pose.squashX = 1.12; pose.squashY = 0.84; }
    else if (animationMode === 'train') { pose.y = -Math.abs(Math.round(Math.sin(time / 80) * 11)); pose.arm = -10; }
    else if (animationMode === 'battle') { pose.x = Math.round(Math.sin(time / 65) * 7); pose.headY = -2; pose.arm = -11; }
    else if (animationMode === 'travel') { pose.x = Math.round(Math.sin(time / 115) * 12); pose.y = -Math.abs(Math.round(Math.sin(time / 90) * 4)); pose.tail = 9; }
    else if (animationMode === 'work') { pose.headY = 2; pose.arm = -7; }
    else if (animationMode === 'celebrate') { pose.y = -Math.abs(Math.round(Math.sin(time / 80) * 11)); pose.arm = -13; pose.tail = 14; pose.squashX = 1.06; }
    else if (animationMode === 'evolve') { pose.y = -6; pose.arm = -13; pose.tail = 14; pose.squashX = 1.08 + Math.sin(time / 90) * 0.05; pose.squashY = 1.08 + Math.sin(time / 90) * 0.05; }
    else if (animationMode === 'blocked') { pose.x = Math.round(Math.sin(time / 28) * 3); pose.squashX = 0.96; }
    return pose;
  }

  function petGrowthShape(phase, stage) {
    if (phase === 'young') return { scaleX: 0.9, scaleY: 0.76, offsetY: 12 };
    if (phase === 'rare') return { scaleX: 1.22, scaleY: 1.18, offsetY: -7 };
    var adultScale = 1 + Math.min(5, stage) * 0.025;
    return { scaleX: adultScale, scaleY: adultScale, offsetY: 0 };
  }

  function petFaceOffset(speciesId) {
    return speciesId === 'sneaker_snail' ? 18 : 0;
  }

  function drawPetEyes(eyeStyle, mood, blink, outline, accent, headY) {
    var leftX = -15;
    var rightX = 8;
    var eyeHeight = blink ? 2 : mood === 'hurt' ? 4 : eyeStyle === 'sleepy' ? 4 : 7;
    if (eyeStyle === 'soft') { leftX = -13; rightX = 8; }
    if (eyeStyle === 'focused' && !blink) {
      drawPixelRect(leftX, -38 + headY, 8, 3, outline); drawPixelRect(rightX, -38 + headY, 8, 3, outline);
      drawPixelRect(leftX + 2, -35 + headY, 6, 4, outline); drawPixelRect(rightX, -35 + headY, 6, 4, outline);
    } else if (eyeStyle === 'mischief' && !blink) {
      drawPixelRect(leftX, -37 + headY, 7, 6, outline); drawPixelRect(rightX, -38 + headY, 8, 3, outline);
      drawPixelRect(rightX + 2, -35 + headY, 5, 3, outline);
    } else {
      drawPixelRect(leftX, -37 + headY, eyeStyle === 'soft' ? 6 : 7, eyeHeight, outline);
      drawPixelRect(rightX, -37 + headY, eyeStyle === 'soft' ? 6 : 7, eyeHeight, outline);
    }
    if (!blink && eyeStyle === 'bright') {
      drawPixelRect(leftX + 2, -36 + headY, 2, 2, accent); drawPixelRect(rightX + 2, -36 + headY, 2, 2, accent);
    }
  }

  function drawPetMarking(marking, palette, headY) {
    if (marking === 'moon_mask') {
      drawPixelRect(-21, -44 + headY, 13, 6, palette.shade); drawPixelRect(8, -44 + headY, 13, 6, palette.shade);
    } else if (marking === 'spray_stripe') {
      drawPixelRect(-22, -49 + headY, 8, 28, palette.accent); drawPixelRect(-14, -46 + headY, 5, 8, palette.accent);
    } else if (marking === 'pixel_freckles') {
      [-19, -10, 10, 18].forEach(function (markX, index) { drawPixelRect(markX, -27 + headY + index % 2 * 3, 3, 3, palette.accent); });
    } else if (marking === 'split_face') {
      drawPixelRect(0, -47 + headY, 22, 29, palette.shade); drawPixelRect(0, -47 + headY, 4, 29, palette.accent);
    } else if (marking === 'star_patch') {
      drawPixelRect(11, -45 + headY, 5, 17, palette.accent); drawPixelRect(5, -39 + headY, 17, 5, palette.accent);
    } else if (marking === 'ink_drops') {
      drawPixelRect(-20, -45 + headY, 5, 9, palette.shade); drawPixelRect(-12, -47 + headY, 4, 13, palette.shade); drawPixelRect(15, -42 + headY, 4, 8, palette.shade);
    }
  }

  function drawRaccoon(palette, pose) {
    drawPixelRect(27, -31 - pose.tail, 12, 32 + pose.tail, palette.outline); drawPixelRect(30, -28 - pose.tail, 6, 8, palette.body);
    drawPixelRect(30, -16 - pose.tail, 6, 7, palette.accent); drawPixelRect(30, -4 - pose.tail, 6, 5, palette.body);
    drawPixelRect(-25, -22, 52, 34, palette.outline); drawPixelRect(-21, -18, 44, 26, palette.body);
    drawPixelRect(-27, -52 + pose.headY, 54, 39, palette.outline); drawPixelRect(-23, -48 + pose.headY, 46, 31, palette.body);
    drawPixelRect(-23, -64 + pose.headY, 16, 17, palette.outline); drawPixelRect(7, -64 + pose.headY, 16, 17, palette.outline);
    drawPixelRect(-18, -59 + pose.headY, 8, 11, palette.shade); drawPixelRect(10, -59 + pose.headY, 8, 11, palette.shade);
    drawPixelRect(-21, -44 + pose.headY, 15, 8, palette.shade); drawPixelRect(6, -44 + pose.headY, 15, 8, palette.shade);
  }

  function drawRam(palette, pose) {
    drawPixelRect(-28, -26, 56, 38, palette.outline); drawPixelRect(-24, -22, 48, 30, palette.body);
    drawPixelRect(-27, -53 + pose.headY, 54, 40, palette.outline); drawPixelRect(-23, -49 + pose.headY, 46, 32, palette.body);
    drawPixelRect(-42, -57 + pose.headY, 18, 23, palette.outline); drawPixelRect(24, -57 + pose.headY, 18, 23, palette.outline);
    drawPixelRect(-38, -53 + pose.headY, 11, 16, palette.accent); drawPixelRect(27, -53 + pose.headY, 11, 16, palette.accent);
    drawPixelRect(-34, -49 + pose.headY, 7, 8, palette.shade); drawPixelRect(27, -49 + pose.headY, 7, 8, palette.shade);
    drawPixelRect(-18, 6, 12, 15, palette.outline); drawPixelRect(8, 6, 12, 15, palette.outline);
  }

  function drawGecko(palette, pose) {
    drawPixelRect(-32, -19, 58, 28, palette.outline); drawPixelRect(-28, -15, 50, 20, palette.body);
    drawPixelRect(21, -16 - pose.tail, 17, 9, palette.outline); drawPixelRect(34, -25 - pose.tail, 16, 9, palette.outline);
    drawPixelRect(47, -36 - pose.tail, 12, 9, palette.outline); drawPixelRect(24, -13 - pose.tail, 14, 4, palette.accent);
    drawPixelRect(-31, -49 + pose.headY, 58, 35, palette.outline); drawPixelRect(-27, -45 + pose.headY, 50, 27, palette.body);
    drawPixelRect(-24, -57 + pose.headY, 13, 13, palette.body); drawPixelRect(10, -57 + pose.headY, 13, 13, palette.body);
    drawPixelRect(-31, 3, 16, 8, palette.outline); drawPixelRect(11, 3, 16, 8, palette.outline);
  }

  function drawCrab(palette, pose) {
    drawPixelRect(-31, -24, 62, 34, palette.outline); drawPixelRect(-27, -20, 54, 26, palette.body);
    drawPixelRect(-48, -28 + pose.arm, 20, 13, palette.outline); drawPixelRect(28, -28 + pose.arm, 20, 13, palette.outline);
    drawPixelRect(-54, -38 + pose.arm, 16, 16, palette.outline); drawPixelRect(38, -38 + pose.arm, 16, 16, palette.outline);
    drawPixelRect(-49, -34 + pose.arm, 8, 8, palette.accent); drawPixelRect(41, -34 + pose.arm, 8, 8, palette.accent);
    drawPixelRect(-27, -52 + pose.headY, 54, 34, palette.outline); drawPixelRect(-23, -48 + pose.headY, 46, 26, palette.body);
    [-24, -8, 8, 24].forEach(function (legX) { drawPixelRect(legX, 7, 8, 13, palette.outline); });
  }

  function drawFox(palette, pose) {
    drawPixelRect(-23, -22, 48, 33, palette.outline); drawPixelRect(-19, -18, 40, 25, palette.body);
    drawPixelRect(23, -33 - pose.tail, 20, 35 + pose.tail, palette.outline); drawPixelRect(27, -29 - pose.tail, 12, 25 + pose.tail, palette.body);
    drawPixelRect(29, -11 - pose.tail, 10, 7, palette.accent);
    drawPixelRect(-27, -53 + pose.headY, 54, 39, palette.outline); drawPixelRect(-23, -49 + pose.headY, 46, 31, palette.body);
    drawPixelRect(-25, -72 + pose.headY, 18, 23, palette.outline); drawPixelRect(7, -72 + pose.headY, 18, 23, palette.outline);
    drawPixelRect(-20, -65 + pose.headY, 8, 14, palette.accent); drawPixelRect(12, -65 + pose.headY, 8, 14, palette.accent);
    drawPixelRect(-17, 6, 11, 14, palette.outline); drawPixelRect(8, 6, 11, 14, palette.outline);
  }

  function drawSnail(palette, pose) {
    drawPixelRect(-38, -33, 38, 38, palette.outline); drawPixelRect(-34, -29, 30, 30, palette.shade);
    drawPixelRect(-27, -22, 17, 17, palette.body); drawPixelRect(-21, -16, 7, 7, palette.accent);
    drawPixelRect(-8, -21, 42, 28, palette.outline); drawPixelRect(-4, -17, 34, 20, palette.body);
    drawPixelRect(3, -49 + pose.headY, 33, 34, palette.outline); drawPixelRect(7, -45 + pose.headY, 25, 26, palette.body);
    drawPixelRect(8, -62 + pose.headY, 5, 17, palette.outline); drawPixelRect(26, -62 + pose.headY, 5, 17, palette.outline);
    drawPixelRect(7, -65 + pose.headY, 7, 7, palette.accent); drawPixelRect(25, -65 + pose.headY, 7, 7, palette.accent);
    drawPixelRect(-8, 3, 46, 9, palette.outline); drawPixelRect(-4, 4, 38, 4, palette.accent);
  }

  function drawDrake(palette, pose) {
    drawPixelRect(-24, -25, 50, 36, palette.outline); drawPixelRect(-20, -21, 42, 28, palette.body);
    drawPixelRect(-43, -34 + pose.arm, 22, 29, palette.outline); drawPixelRect(21, -34 + pose.arm, 22, 29, palette.outline);
    drawPixelRect(-38, -29 + pose.arm, 14, 19, palette.shade); drawPixelRect(24, -29 + pose.arm, 14, 19, palette.shade);
    drawPixelRect(24, -21 - pose.tail, 25, 11, palette.outline); drawPixelRect(44, -30 - pose.tail, 14, 10, palette.outline);
    drawPixelRect(-27, -54 + pose.headY, 54, 40, palette.outline); drawPixelRect(-23, -50 + pose.headY, 46, 32, palette.body);
    drawPixelRect(-19, -68 + pose.headY, 8, 18, palette.accent); drawPixelRect(11, -68 + pose.headY, 8, 18, palette.accent);
    drawPixelRect(-18, 6, 11, 15, palette.outline); drawPixelRect(8, 6, 11, 15, palette.outline);
  }

  function drawFerret(palette, pose) {
    drawPixelRect(-38, -20, 66, 30, palette.outline); drawPixelRect(-34, -16, 58, 22, palette.body);
    drawPixelRect(24, -23 - pose.tail, 30, 12, palette.outline); drawPixelRect(49, -31 - pose.tail, 13, 12, palette.outline);
    drawPixelRect(-31, -50 + pose.headY, 58, 35, palette.outline); drawPixelRect(-27, -46 + pose.headY, 50, 27, palette.body);
    drawPixelRect(-25, -61 + pose.headY, 14, 15, palette.outline); drawPixelRect(10, -61 + pose.headY, 14, 15, palette.outline);
    drawPixelRect(-20, -56 + pose.headY, 7, 9, palette.accent); drawPixelRect(13, -56 + pose.headY, 7, 9, palette.accent);
    drawPixelRect(-27, 5, 13, 13, palette.outline); drawPixelRect(10, 5, 13, 13, palette.outline);
  }

  function drawSpeciesSilhouette(speciesId, palette, pose) {
    if (speciesId === 'bubble_ram') drawRam(palette, pose);
    else if (speciesId === 'comet_gecko') drawGecko(palette, pose);
    else if (speciesId === 'vinyl_crab') drawCrab(palette, pose);
    else if (speciesId === 'lantern_fox') drawFox(palette, pose);
    else if (speciesId === 'sneaker_snail') drawSnail(palette, pose);
    else if (speciesId === 'alley_drake') drawDrake(palette, pose);
    else if (speciesId === 'moon_ferret') drawFerret(palette, pose);
    else drawRaccoon(palette, pose);
  }

  function drawRareMorphShell(name, palette, pose) {
    if (!name) return;
    if (name === 'Celestial Serpent') {
      [-55, -43, -31, -19].forEach(function (segmentX, index) {
        drawPixelRect(segmentX, -8 - index * 8, 15, 13, palette.outline); drawPixelRect(segmentX + 3, -5 - index * 8, 9, 7, index % 2 ? palette.accent : palette.body);
      });
      drawPixelRect(-62, -5, 8, 8, palette.accent);
    } else if (name === 'Crown Beast') {
      drawPixelRect(-36, -66 + pose.headY, 72, 7, palette.accent);
      [-31, -15, 1, 17].forEach(function (spikeX, index) { drawPixelRect(spikeX, -78 - index % 2 * 5 + pose.headY, 9, 15 + index % 2 * 5, palette.accent); });
    } else if (name === 'Boombox Kaiju') {
      drawPixelRect(-57, -34, 28, 38, palette.outline); drawPixelRect(29, -34, 28, 38, palette.outline);
      drawPixelRect(-52, -29, 18, 18, palette.accent); drawPixelRect(34, -29, 18, 18, palette.accent);
      drawPixelRect(-47, -24, 8, 8, palette.outline); drawPixelRect(39, -24, 8, 8, palette.outline);
    } else if (name === 'Graffiti Guardian') {
      drawPixelRect(-61, -49 + pose.arm, 34, 12, palette.outline); drawPixelRect(27, -49 + pose.arm, 34, 12, palette.outline);
      drawPixelRect(-55, -37 + pose.arm, 27, 9, palette.accent); drawPixelRect(28, -37 + pose.arm, 27, 9, palette.accent);
      drawPixelRect(-48, -27 + pose.arm, 19, 7, palette.body); drawPixelRect(29, -27 + pose.arm, 19, 7, palette.body);
    }
  }

  function drawEvolutionLayers(stage, palette) {
    if (stage >= 1) {
      drawPixelRect(-24, -11, 48, 8, '#20262b'); drawPixelRect(-7, -11, 14, 8, palette.accent);
    }
    if (stage >= 2) {
      drawPixelRect(-31, -44, 7, 25, '#61f5ff'); drawPixelRect(24, -44, 7, 25, '#61f5ff');
      drawPixelRect(-4, -53, 8, 5, '#61f5ff');
    }
    if (stage >= 3) {
      drawPixelRect(-36, -18, 12, 24, palette.outline); drawPixelRect(24, -18, 12, 24, palette.outline);
      drawPixelRect(-32, -14, 7, 16, palette.body); drawPixelRect(25, -14, 7, 16, palette.body);
      drawPixelRect(-20, -7, 40, 4, palette.accent);
    }
    if (stage >= 5) {
      drawPixelRect(-24, -70, 48, 6, '#f6a7ff'); drawPixelRect(-18, -79, 7, 9, '#f6a7ff');
      drawPixelRect(-4, -84, 8, 14, palette.accent); drawPixelRect(11, -79, 7, 9, '#f6a7ff');
    }
  }

  function drawEquipmentLayers(pet, palette, pose) {
    var outfit = String(pet && pet.equipped_outfit || '');
    var armor = String(pet && pet.equipped_armor || '');
    var weapon = String(pet && pet.equipped_weapon || '');
    var charm = String(pet && pet.equipped_charm || '');
    var toy = String(pet && pet.equipped_toy || '');
    var food = String(pet && pet.equipped_food || '');
    if (outfit && !/none/.test(outfit)) {
      drawPixelRect(-22, -16, 44, 13, '#242a38'); drawPixelRect(-18, -13, 36, 5, outfit === 'crown_jacket' ? '#f4cf58' : palette.accent);
      drawPixelRect(-3, -16, 6, 13, '#f6a7ff');
    }
    if (armor && !/none/.test(armor)) {
      var armorColor = armor === 'cyber_armor' ? '#61f5ff' : armor === 'street_armor' ? '#aab5ae' : '#5b6570';
      drawPixelRect(-34, -20 + pose.arm, 13, 19, palette.outline); drawPixelRect(21, -20 + pose.arm, 13, 19, palette.outline);
      drawPixelRect(-30, -16 + pose.arm, 8, 12, armorColor); drawPixelRect(22, -16 + pose.arm, 8, 12, armorColor);
    }
    if (weapon && !/none/.test(weapon)) {
      if (weapon === 'moon_blaster') {
        drawPixelRect(30, -25 + pose.arm, 29, 10, palette.outline); drawPixelRect(34, -22 + pose.arm, 20, 5, '#61f5ff');
        drawPixelRect(28, -17 + pose.arm, 9, 13, palette.outline);
      } else {
        drawPixelRect(29, -23 + pose.arm, 18, 7, palette.outline);
        drawPixelRect(39, -31 + pose.arm, 4, 12, weapon === 'laser_claws' ? '#61f5ff' : '#aab5ae');
        drawPixelRect(46, -29 + pose.arm, 4, 12, weapon === 'laser_claws' ? '#61f5ff' : '#aab5ae');
      }
    }
    if (charm && !/none/.test(charm)) {
      drawPixelRect(-2, -10, 4, 11, '#f4cf58'); drawPixelRect(-6, -1, 12, 10, palette.outline);
      drawPixelRect(-3, 1, 6, 5, charm === 'shield_charm' ? '#61f5ff' : '#f4ff65');
    }
    if (toy === 'hoverboard') {
      drawPixelRect(-30, 18, 62, 6, palette.outline); drawPixelRect(-24, 18, 49, 3, '#f6a7ff');
      drawPixelRect(-23, 24, 8, 4, '#61f5ff'); drawPixelRect(17, 24, 8, 4, '#61f5ff');
    }
    if (food === 'crystal_bowl') {
      drawPixelRect(-51, 5, 20, 8, palette.outline); drawPixelRect(-48, 4, 14, 5, '#61f5ff');
    }
  }

  function unlockedCosmetic(key) {
    var cosmetics = state && state.live_systems && state.live_systems.cosmetics || [];
    return cosmetics.some(function (item) { return item && item.key === key && item.unlocked; });
  }

  function drawCosmeticLayers(time, palette, active) {
    if (unlockedCosmetic('profile_frame')) {
      drawPixelRect(-61, -73, 22, 4, palette.accent); drawPixelRect(-61, -73, 4, 22, palette.accent);
      drawPixelRect(39, -73, 22, 4, palette.accent); drawPixelRect(57, -73, 4, 22, palette.accent);
      drawPixelRect(-61, 17, 22, 4, palette.accent); drawPixelRect(-61, -1, 4, 22, palette.accent);
      drawPixelRect(39, 17, 22, 4, palette.accent); drawPixelRect(57, -1, 4, 22, palette.accent);
    }
    if (unlockedCosmetic('run_trail') && active && animationMode === 'travel') {
      for (var trail = 0; trail < 5; trail += 1) drawPixelRect(-73 - trail * 9, 5 - trail % 2 * 7, 7, 3, trail % 2 ? palette.accent : '#61f5ff');
    }
    if (unlockedCosmetic('victory_pose') && active && animationMode === 'celebrate') {
      drawPixelText('★ ALL CITY ★', 0, -91, palette.accent, 'center');
    }
    if (unlockedCosmetic('rename_badge')) {
      drawPixelRect(-18, 12, 36, 7, '#20262b'); drawPixelRect(-14, 14, 28, 3, palette.accent);
    }
  }

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

  function drawPet(time, presence, combat) {
    var pet = state && state.pet;
    var lifecycle = state && state.lifecycle || {};
    var stage = petStage(pet);
    var mood = petMood(pet);
    var renderTime = reducedMotion ? performance.now() : time;
    var active = animationUntil > renderTime;
    if (lifecycle.phase === 'egg') {
      drawMoonEgg(time, active, lifecycle.incubation);
      drawActionEffects(time, 160, 150, active);
      if (active && animationLabel && !lifecycleCeremonyActive(time)) drawPixelText('[' + animationLabel + ']', 160, 211, animationMode === 'blocked' ? '#ff6d6d' : '#f4ff65', 'center');
      return;
    }

    var pose = petPose(time, active, mood, presence);
    var rareName = lifecycle.rare && lifecycle.rare.name || '';
    var growth = petGrowthShape(lifecycle.phase, stage);
    var combatScale = combat && combat.active ? 0.78 : 1;
    var ceremonyScale = lifecycleCeremonyActive(time)
      ? reducedMotion ? 1.08 : 1.06 + Math.sin((time - lifecycleCeremonyStartedAt) / 180) * 0.05
      : 1;
    var scale = Math.max(growth.scaleX, growth.scaleY) * combatScale * ceremonyScale;
    var palette = petPalette(lifecycle, stage);
    var speciesId = lifecycle.species_id || pet && pet.species || 'neon_raccoon';
    var faceX = petFaceOffset(speciesId);
    var x = 160 + pose.x + (combat && combat.active ? -62 : 0);
    var y = 150 + pose.y + growth.offsetY;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(growth.scaleX * pose.squashX * combatScale * ceremonyScale, growth.scaleY * pose.squashY * combatScale * ceremonyScale);
    ctx.shadowColor = lifecycle.phase === 'rare' ? palette.accent : stage >= 2 ? '#61f5ff' : palette.body;
    ctx.shadowBlur = lifecycle.phase === 'rare' ? 12 : stage * 2 + (active ? 6 : 2);
    drawRareMorphShell(rareName, palette, pose);
    drawSpeciesSilhouette(speciesId, palette, pose);
    ctx.save();
    ctx.translate(faceX, 0);
    drawPetMarking(lifecycle.appearance && lifecycle.appearance.marking, palette, pose.headY);
    ctx.restore();
    drawEvolutionLayers(stage, palette);
    drawEquipmentLayers(pet, palette, pose);
    drawCosmeticLayers(time, palette, active);

    var blink = !reducedMotion && Math.floor(renderTime / 1800) % 7 === 0 || mood === 'tired' || animationMode === 'sleep' && active;
    ctx.save();
    ctx.translate(faceX, 0);
    drawPetEyes(lifecycle.appearance && lifecycle.appearance.eyes || 'bright', mood, blink, palette.outline, palette.accent, pose.headY);
    drawPixelRect(-3, -27 + pose.headY, 6, 4, palette.outline);
    if (mood === 'happy' || active && ['play', 'celebrate', 'feed'].includes(animationMode)) {
      drawPixelRect(-8, -20 + pose.headY, 6, 3, palette.outline); drawPixelRect(2, -20 + pose.headY, 6, 3, palette.outline);
    } else if (mood === 'hungry') drawPixelRect(-5, -20 + pose.headY, 10, 5, palette.outline);
    else { drawPixelRect(-6, -20 + pose.headY, 12, 2, palette.outline); drawPixelRect(-2, -18 + pose.headY, 4, 2, palette.outline); }
    ctx.restore();
    ctx.restore();
    ctx.shadowBlur = 0;

    if (!active && mood !== 'curious' && !lifecycleCeremonyActive(time)) drawPixelText(mood.toUpperCase(), x, y - 78 * scale, mood === 'hurt' ? '#ff6d6d' : palette.accent, 'center');
    if ((!combat || !combat.active) && !lifecycleCeremonyActive(time)) {
      if (rareName) drawPixelText(rareName.toUpperCase(), x, 70, palette.accent, 'center');
      else if (lifecycle.species_name) drawPixelText(lifecycle.species_name.toUpperCase(), x, 78, palette.accent, 'center');
    }
    drawCompanionHabitEffects(time, x, y, presence, palette.accent, active);
    drawActionEffects(time, x, y, active);
    if (active && animationLabel && !lifecycleCeremonyActive(time)) drawPixelText('[' + animationLabel + ']', 160, 211, animationMode === 'blocked' ? '#ff6d6d' : '#f4ff65', 'center');
  }

  var WORLD_SCENES = {
    home: { label: 'MOONBLOCK ROOFTOP', sky: '#03060b', haze: '#10251c', wall: '#102117', mortar: '#285b36', neon: '#a9ff9a', accent: '#61f5ff', leftTag: 'MOON', rightTag: 'HOME' },
    missions: { label: 'QUEST UNDERPASS', sky: '#090516', haze: '#241137', wall: '#21152c', mortar: '#5f3473', neon: '#f6a7ff', accent: '#f4ff65', leftTag: 'QUEST', rightTag: 'XP' },
    explore: { label: 'NEON RUN ALLEY', sky: '#02081a', haze: '#092b42', wall: '#0d2631', mortar: '#17607a', neon: '#61f5ff', accent: '#ff6d6d', leftTag: 'RUN', rightTag: 'BOSS' },
    work: { label: 'SCRAP YARD 85', sky: '#100805', haze: '#34200d', wall: '#2a2014', mortar: '#70522b', neon: '#ffcf68', accent: '#a9ff9a', leftTag: 'WORK', rightTag: '85' },
    economy: { label: 'CHAIN MARKET', sky: '#080414', haze: '#22103d', wall: '#211433', mortar: '#603d80', neon: '#f4ff65', accent: '#61f5ff', leftTag: 'GEMS', rightTag: 'TRADE' },
    profile: { label: 'ALL-CITY HEIGHTS', sky: '#08030d', haze: '#32102a', wall: '#271325', mortar: '#6d315e', neon: '#ff8bbd', accent: '#f4ff65', leftTag: 'RARE', rightTag: 'CORE' },
  };
  var WORLD_STAR_X = [13, 41, 78, 109, 147, 181, 214, 249, 286, 311, 28, 64, 126, 167, 231, 274];
  var WORLD_STAR_Y = [17, 31, 12, 48, 24, 39, 15, 52, 29, 8, 68, 57, 73, 61, 79, 66];

  function drawCompanionHabitEffects(time, x, y, presence, color, active) {
    if (active || !presence) return;
    var behavior = presence.behavior;
    var effectTime = reducedMotion ? 0 : time;
    var phase = Math.floor(effectTime / 260);
    if (behavior === 'signal_scan') {
      drawPixelRect(x - 48, y - 52 + phase % 7 * 5, 96, 1, color);
    } else if (behavior === 'scrap_tinker' || behavior === 'claw_click') {
      for (var spark = 0; spark < 3; spark += 1) drawPixelRect(x + 31 + spark * 6, y - 18 - (phase + spark * 3) % 13, 2, 2, color);
    } else if (behavior === 'memory_glow') {
      for (var memory = 0; memory < 4; memory += 1) {
        var angle = effectTime / 900 + memory * Math.PI / 2;
        drawPixelRect(x + Math.cos(angle) * 54, y - 28 + Math.sin(angle) * 18, 3, 3, color);
      }
    } else if (behavior === 'alley_prowl' || behavior === 'tunnel_peek') {
      drawPixelRect(x - 57, y + 17, 5, 2, color); drawPixelRect(x - 45, y + 13, 5, 2, color);
    } else if (behavior === 'moon_gaze' || behavior === 'ear_flick') {
      drawPixelRect(x + 45, y - 67, 3, 3, color); drawPixelRect(x + 52, y - 75, 2, 2, color);
    } else if (behavior === 'window_shop') {
      drawPixelRect(x + 48, y - 47, 5, 5, color); drawPixelRect(x + 44, y - 43, 13, 1, color);
    }
  }

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

  function drawCompanionPresence(time, scene, presence) {
    if (!state || !state.adopted || !state.pet || !presence) return;
    var actionActive = animationUntil > time;
    var feedbackActive = feedbackUntil > time;
    var greetingActive = companionGreetingUntil > time && companionGreeting;
    if (feedbackActive || actionActive && !greetingActive) return;
    var copy = greetingActive ? companionGreeting : presence.phase >= 0.58 ? presence.thought : '';
    if (!copy) return;
    copy = compactFeedback(copy, 24);
    var bubbleY = 54;
    drawPixelRect(7, bubbleY, 150, 31, '#020704');
    drawPixelRect(7, bubbleY, 3, 31, scene.accent);
    drawPixelText(greetingActive ? 'CHECK-IN //' : 'MOONPET THINKS //', 16, bubbleY + 12, scene.accent, 'left');
    drawPixelText(copy, 16, bubbleY + 24, '#f4ff65', 'left');
    drawPixelRect(143, bubbleY + 31, 6, 4, '#020704');
    drawPixelRect(149, bubbleY + 35, 4, 4, '#020704');
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
    drawPixelRect(7, 54, 306, 38, '#020704');
    drawPixelRect(7, 54, 306, 2, scene.neon);
    drawPixelText(combat.title, 16, 65, scene.neon, 'left');
    drawPixelText(compactFeedback(combat.status, 17), 304, 65, '#d8f9ff', 'right');
    if (combat.mode === 'arena') {
      drawCombatMeter(16, 69, 128, combat.playerValue, combat.maxValue, '#a9ff9a', false);
      drawCombatMeter(176, 69, 128, combat.opponentValue, combat.maxValue, rivalColor, true);
      drawCombatMeter(16, 78, 64, combat.playerSpecial, COMBAT_ARENA_SPECIAL_MAX, '#61f5ff', false);
      drawCombatMeter(240, 78, 64, combat.opponentSpecial, COMBAT_ARENA_SPECIAL_MAX, '#61f5ff', true);
      drawPixelText('HP ' + Number(combat.playerValue) + ' // SP ' + Number(combat.playerSpecial) + '/' + COMBAT_ARENA_SPECIAL_MAX, 16, 90, '#a9ff9a', 'left');
      drawPixelText('SP ' + Number(combat.opponentSpecial) + '/' + COMBAT_ARENA_SPECIAL_MAX + ' // ' + Number(combat.opponentValue) + ' HP', 304, 90, rivalColor, 'right');
    } else if (combat.mode === 'kaiju') {
      drawPixelText(combat.playerValue ? 'YOU // LOCKED' : 'YOU // SELECT', 16, 80, combat.playerValue ? '#f4ff65' : '#aab5ae', 'left');
      drawPixelText(combat.opponentValue ? 'RIVAL // LOCKED' : 'RIVAL // WAITING', 304, 80, combat.opponentValue ? rivalColor : '#aab5ae', 'right');
      if (combat.playerCardKey) drawPixelText('CARD // ' + compactFeedback(words(combat.playerCardKey), 12), 16, 90, '#d8f9ff', 'left');
    } else {
      drawCombatMeter(16, 74, 288, combat.playerValue, combat.maxValue, scene.accent, false);
      drawPixelText('PROGRESS', 16, 84, scene.accent, 'left');
      drawPixelText(Number(combat.opponentValue) + ' ROOMS REMAIN', 304, 84, rivalColor, 'right');
    }
  }

  var WORLD_BUILDING_HEIGHTS = [32, 51, 39, 66, 44, 58, 35, 70, 48, 61];
  var WORLD_REACTION_COLORS = {
    feed: '#ffb84d', play: '#f6a7ff', clean: '#b3ffff', sleep: '#8091c9', train: '#f4ff65',
    battle: '#ff4f64', travel: '#61f5ff', work: '#ffcf68', equip: '#61f5ff', evolve: '#f6a7ff',
    trade: '#f4ff65', celebrate: '#a9ff55', interact: '#a9ff9a', blocked: '#ff4f64',
  };

  function worldScene() {
    return WORLD_SCENES[activeScreen] || WORLD_SCENES.home;
  }

  function drawWorldSky(time, scene) {
    drawPixelRect(0, 0, 320, 112, scene.sky);
    drawPixelRect(0, 72, 320, 40, scene.haze);
    var driftPhase = reducedMotion ? 0 : Math.floor(time / 2400);
    for (var star = 0; star < WORLD_STAR_X.length; star += 1) {
      var starSpeed = star % 3 === 0 ? 1 : 0.35;
      var starX = (WORLD_STAR_X[star] + driftPhase * starSpeed) % 320;
      var twinkle = reducedMotion ? 1 : 1 + (Math.floor(time / 420) + star) % 3;
      drawPixelRect(Math.floor(starX), WORLD_STAR_Y[star], twinkle === 3 ? 2 : 1, 1, star % 4 ? scene.neon : scene.accent);
    }
    drawPixelRect(271, 17, 25, 25, scene.neon);
    drawPixelRect(275, 13, 17, 33, scene.neon);
    drawPixelRect(267, 21, 33, 17, scene.neon);
    drawPixelRect(275, 21, 17, 17, scene.sky);
    drawPixelRect(279, 23, 3, 14, scene.accent);
    drawPixelRect(282, 23, 7, 3, scene.accent);
    drawPixelRect(282, 29, 7, 3, scene.accent);
    drawPixelRect(282, 34, 7, 3, scene.accent);
    drawPixelRect(288, 25, 3, 5, scene.accent);
    drawPixelRect(288, 31, 3, 5, scene.accent);
    drawPixelRect(281, 20, 2, 4, scene.accent);
    drawPixelRect(286, 20, 2, 4, scene.accent);
    drawPixelRect(281, 36, 2, 4, scene.accent);
    drawPixelRect(286, 36, 2, 4, scene.accent);
  }

  function drawWorldSkyline(time, scene) {
    var drift = reducedMotion ? 0 : Math.round(Math.sin(time / 3600) * 4);
    for (var building = -1; building < WORLD_BUILDING_HEIGHTS.length; building += 1) {
      var index = (building + WORLD_BUILDING_HEIGHTS.length) % WORLD_BUILDING_HEIGHTS.length;
      var bx = building * 36 - drift;
      var bh = WORLD_BUILDING_HEIGHTS[index];
      drawPixelRect(bx, 112 - bh, 31, bh, '#07100d');
      drawPixelRect(bx + 4, 112 - bh + 5, 23, 4, scene.mortar);
      for (var wy = 14; wy < bh - 4; wy += 11) {
        drawPixelRect(bx + 6, 112 - bh + wy, 4, 4, index % 2 ? scene.neon : scene.accent);
        if ((wy + index) % 3) drawPixelRect(bx + 19, 112 - bh + wy, 4, 4, scene.neon);
      }
    }
    drawPixelRect(0, 108, 320, 4, scene.mortar);
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

  function drawGraffitiWall(scene) {
    drawPixelRect(0, 112, 320, 66, scene.wall);
    for (var row = 0; row < 5; row += 1) {
      var brickOffset = row % 2 ? -17 : 0;
      for (var brick = brickOffset; brick < 320; brick += 34) {
        drawPixelRect(brick, 114 + row * 13, 32, 2, scene.mortar);
        drawPixelRect(brick + 31, 114 + row * 13, 2, 13, scene.mortar);
      }
    }
    drawPixelRect(105, 117, 110, 54, '#09110d');
    drawPixelRect(111, 123, 98, 42, scene.haze);
    drawPixelRect(118, 130, 84, 28, '#07100d');
    drawGraffitiTag(scene.leftTag, 9, 143, scene.neon, 'left');
    drawGraffitiTag(scene.rightTag, 311, 164, scene.accent, 'right');
    drawPixelText('CHAIN // 85', 160, 121, scene.mortar, 'center');
  }

  function drawWorldLandmarks(sceneKey, scene) {
    if (sceneKey === 'home') {
      drawPixelRect(26, 126, 48, 8, '#09100d');
      drawPixelRect(31, 119, 38, 9, scene.mortar);
      drawPixelRect(35, 113, 30, 7, '#09100d');
      drawPixelRect(36, 134, 5, 26, scene.mortar);
      drawPixelRect(59, 134, 5, 26, scene.mortar);
      drawPixelRect(269, 116, 4, 44, scene.mortar);
      drawPixelRect(257, 123, 28, 3, scene.neon);
      drawPixelRect(264, 129, 15, 3, scene.accent);
    } else if (sceneKey === 'missions') {
      drawPixelRect(12, 119, 72, 47, '#080a09');
      drawPixelRect(17, 124, 62, 37, scene.mortar);
      drawPixelRect(22, 129, 52, 27, scene.wall);
      drawPixelText('?', 48, 148, scene.neon, 'center');
      drawPixelRect(250, 126, 43, 5, scene.accent);
      drawPixelRect(260, 136, 43, 5, scene.neon);
      drawPixelRect(250, 146, 43, 5, scene.accent);
    } else if (sceneKey === 'explore') {
      drawPixelRect(11, 116, 5, 50, scene.mortar);
      drawPixelRect(71, 116, 5, 50, scene.mortar);
      drawPixelRect(16, 122, 55, 4, scene.neon);
      drawPixelRect(16, 137, 55, 4, scene.mortar);
      drawPixelRect(16, 152, 55, 4, scene.accent);
      drawPixelRect(249, 119, 55, 34, '#060b0d');
      drawPixelRect(254, 124, 45, 24, scene.mortar);
      drawPixelText('RUN', 276, 140, scene.neon, 'center');
    } else if (sceneKey === 'work') {
      drawPixelRect(23, 116, 6, 49, scene.mortar);
      drawPixelRect(29, 116, 65, 5, scene.neon);
      drawPixelRect(84, 121, 5, 22, scene.mortar);
      drawPixelRect(78, 141, 17, 8, '#070b09');
      drawPixelRect(82, 149, 9, 7, scene.accent);
      drawPixelRect(247, 152, 59, 14, '#080b09');
      drawPixelRect(254, 143, 21, 9, scene.mortar);
      drawPixelRect(277, 138, 18, 14, scene.accent);
      drawPixelRect(296, 147, 10, 5, scene.neon);
    } else if (sceneKey === 'economy') {
      drawPixelRect(10, 125, 78, 9, scene.neon);
      drawPixelRect(14, 134, 70, 30, '#080a09');
      drawPixelRect(20, 140, 19, 20, scene.mortar);
      drawPixelRect(57, 140, 19, 20, scene.accent);
      drawPixelRect(232, 125, 78, 9, scene.accent);
      drawPixelRect(236, 134, 70, 30, '#080a09');
      drawPixelRect(243, 141, 56, 5, scene.mortar);
      drawPixelText('G', 271, 158, scene.neon, 'center');
    } else if (sceneKey === 'profile') {
      drawPixelRect(18, 151, 66, 14, '#080a09');
      drawPixelRect(26, 141, 50, 10, scene.mortar);
      drawPixelRect(35, 129, 8, 12, scene.neon);
      drawPixelRect(47, 123, 8, 18, scene.accent);
      drawPixelRect(59, 129, 8, 12, scene.neon);
      drawPixelRect(244, 119, 59, 46, '#080a09');
      drawPixelRect(250, 125, 47, 34, scene.mortar);
      drawPixelRect(256, 131, 35, 22, scene.wall);
      drawPixelText('★', 274, 147, scene.accent, 'center');
    }
  }

  function drawWorldStreet(time, scene) {
    drawPixelRect(0, 178, 320, 42, '#070b09');
    drawPixelRect(0, 178, 320, 4, scene.mortar);
    drawPixelRect(0, 212, 320, 8, '#020504');
    var roadDrift = reducedMotion ? 0 : Math.floor(time / 70) % 32;
    for (var line = -32; line < 352; line += 32) drawPixelRect(line - roadDrift, 201, 15, 2, scene.mortar);
    drawPixelRect(15, 164, 18, 14, '#121916');
    drawPixelRect(19, 159, 10, 5, scene.accent);
    drawPixelRect(22, 155, 4, 4, scene.neon);
    drawPixelRect(284, 161, 20, 17, '#121916');
    drawPixelRect(288, 157, 12, 4, scene.neon);
    drawPixelRect(291, 151, 6, 6, scene.accent);
  }

  function drawWorldReaction(time, scene) {
    var active = animationUntil > (reducedMotion ? performance.now() : time);
    if (!active) return;
    var color = WORLD_REACTION_COLORS[animationMode] || scene.neon;
    ctx.save();
    ctx.globalAlpha = animationMode === 'blocked' ? 0.2 : 0.14;
    ctx.fillStyle = color;
    ctx.fillRect(82, 86, 156, 96);
    ctx.restore();
    var pulse = reducedMotion ? 0 : Math.floor(time / 85);
    if (animationMode === 'battle' || animationMode === 'evolve' || animationMode === 'celebrate') {
      for (var spark = 0; spark < (renderQuality === 'low' ? 3 : renderQuality === 'medium' ? 6 : 9); spark += 1) {
        var sparkX = (spark * 41 + pulse * 7) % 320;
        var sparkY = 31 + (spark * 19 + pulse * 5) % 132;
        drawPixelRect(sparkX, sparkY, 3, 3, spark % 2 ? color : scene.accent);
      }
    } else if (animationMode === 'sleep') {
      drawPixelRect(0, 0, 320, 112, 'rgba(4,6,20,.28)');
    } else if (animationMode === 'clean') {
      for (var drop = 0; drop < 8; drop += 1) {
        var dropY = (drop * 27 + pulse * 5) % 176;
        drawPixelRect(18 + drop * 41, dropY, 2, 7, color);
      }
    }
  }

  function drawWorldForeground(scene) {
    drawPixelRect(3, 185, 7, 27, '#18201c');
    drawPixelRect(10, 188, 4, 24, scene.neon);
    drawPixelRect(306, 184, 10, 28, '#18201c');
    drawPixelRect(302, 191, 4, 21, scene.accent);
    drawPixelText(scene.label, 6, 11, scene.neon, 'left');
  }

  var CAMERA_FRAME = { x: 0, y: 0, zoom: 1 };

  function updateCameraFrame(time) {
    CAMERA_FRAME.x = 0; CAMERA_FRAME.y = 0; CAMERA_FRAME.zoom = 1;
    if (reducedMotion || cameraImpactUntil <= time || cameraImpactStrength <= 0) return CAMERA_FRAME;
    var falloff = Math.max(0, Math.min(1, (cameraImpactUntil - time) / 900));
    var impact = cameraImpactStrength * falloff;
    CAMERA_FRAME.x = Math.round(Math.sin((time + actionSequence * 37) / 17) * impact);
    CAMERA_FRAME.y = Math.round(Math.cos((time + actionSequence * 23) / 23) * impact * 0.55);
    CAMERA_FRAME.zoom = 1 + Math.min(0.035, impact * 0.004);
    return CAMERA_FRAME;
  }

  function drawActionFlash(time, scene) {
    if (reducedMotion || actionStartedAt <= 0 || time < actionStartedAt || time - actionStartedAt > 210) return;
    var color = WORLD_REACTION_COLORS[animationMode] || scene.neon;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 0.24 * (1 - (time - actionStartedAt) / 210));
    ctx.fillStyle = color; ctx.fillRect(0, 0, 320, 220);
    ctx.restore();
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
    var burst = reducedMotion ? 38 : 24 + Math.sin(progress * Math.PI) * 44;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(1,4,2,.58)';
    ctx.fillRect(0, 46, 320, 174);
    drawPixelRect(7, 50, 306, 2, color);
    drawPixelRect(7, 216, 306, 2, color);
    drawPixelText(ceremony.title, 160, 63, color, 'center');
    drawPixelText(compactFeedback(ceremony.primary, 28), 160, 78, '#ffffff', 'center');
    drawPixelText(compactFeedback(ceremony.secondary, 34), 160, 91, '#d8f9ff', 'center');
    for (var spark = 0; spark < 18; spark += 1) {
      var angle = spark * Math.PI * 2 / 18;
      var sparkX = 160 + Math.cos(angle) * burst;
      var sparkY = 151 + Math.sin(angle) * burst * 0.62;
      drawPixelRect(sparkX, sparkY, spark % 3 === 0 ? 4 : 2, 2, spark % 2 ? color : '#ffffff');
    }
    drawPixelRect(101, 103, 3, 24, color); drawPixelRect(101, 103, 22, 3, color);
    drawPixelRect(216, 103, 3, 24, color); drawPixelRect(197, 103, 22, 3, color);
    drawPixelRect(101, 178, 3, 18, color); drawPixelRect(101, 193, 22, 3, color);
    drawPixelRect(216, 178, 3, 18, color); drawPixelRect(197, 193, 22, 3, color);
    if (ceremony.kind === 'signal') {
      drawCombatMeter(76, 201, 168, ceremony.progress, ceremony.target, color, false);
      drawPixelText('HATCH SIGNAL ' + Number(ceremony.progress) + '/' + Number(ceremony.target), 160, 198, color, 'center');
    } else if (ceremony.detail) {
      drawPixelRect(43, 199, 234, 15, '#020704');
      drawPixelText(compactFeedback(ceremony.detail, 38), 160, 210, color, 'center');
    } else {
      drawPixelText('SERVER IDENTITY CONFIRMED', 160, 210, color, 'center');
    }
    ctx.restore();
  }

  function drawSceneTransition(time, scene) {
    if (reducedMotion || sceneTransitionUntil <= time) return;
    var duration = Math.max(1, sceneTransitionUntil - sceneTransitionStartedAt);
    var progress = Math.max(0, Math.min(1, (time - sceneTransitionStartedAt) / duration));
    var cover = Math.ceil((1 - progress) * 320);
    var origin = sceneTransitionDirection > 0 ? 320 - cover : 0;
    drawPixelRect(origin, 0, cover, 220, '#020704');
    for (var stripe = 0; stripe < 6; stripe += 1) {
      var stripeWidth = Math.max(0, cover - stripe * 13);
      var stripeX = sceneTransitionDirection > 0 ? 320 - stripeWidth : 0;
      drawPixelRect(stripeX, 28 + stripe * 29, stripeWidth, 3, stripe % 2 ? scene.neon : scene.accent);
    }
    if (progress < 0.72) drawPixelText('ENTER // ' + scene.label, 160, 111, scene.neon, 'center');
  }

  function drawWorld(time) {
    var scene = worldScene();
    var renderTime = reducedMotion ? performance.now() : time;
    var worldTime = reducedMotion ? 0 : time;
    var camera = updateCameraFrame(renderTime);
    var presence = updateCompanionPresence(state && state.pet, state && state.lifecycle || {}, renderTime);
    var combat = updateCombatPresentation(state);
    drawPixelRect(0, 0, 320, 220, scene.sky);
    ctx.save();
    ctx.translate(160 + camera.x, 110 + camera.y); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-160, -110);
    drawWorldSky(worldTime, scene);
    drawWorldSkyline(worldTime, scene);
    drawGraffitiWall(scene);
    drawWorldLandmarks(activeScreen, scene);
    drawWorldStreet(worldTime, scene);
    drawWorldReaction(worldTime, scene);
    drawPet(renderTime, presence, combat);
    drawCombatOpponent(worldTime, scene, combat);
    ctx.restore();
    drawWorldForeground(scene);
    drawUtcAmbience(scene);
    drawCombatHud(scene, combat);
    if (!combat.active && !lifecycleCeremonyActive(renderTime)) drawCompanionPresence(renderTime, scene, presence);
    drawActionFlash(renderTime, scene);
    drawCinematicFeedback(renderTime, scene);
    drawLifecycleCeremony(renderTime, scene);
    drawSceneTransition(renderTime, scene);
  }

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
    if (animationUntil <= time) { animationMode = 'idle'; animationLabel = ''; }
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
      try { tg.ready(); tg.expand(); tg.setHeaderColor('#06110b'); tg.setBackgroundColor('#010402'); if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (_) {}
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
    requestAnimationFrame(frame);
    await typeBoot(['MOONPET BIOS 0.9', 'CHECKING TELEGRAM SIGNATURE...', 'CONNECTING TO D1 MEMORY CORE...'], { speed: 10, hold: 180 });
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

  start();
}());
