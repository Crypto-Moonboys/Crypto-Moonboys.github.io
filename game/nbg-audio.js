(function () {
  'use strict';

  var MANIFEST_URL = '/game/assets/audio/nbg-dark-industrial/manifest.json';
  var STORAGE_KEY = 'nbg-audio-settings-v1';
  var MAX_VOICES = 12;
  var DEFAULT_SETTINGS = { muted: false, musicLevel: 0.42, sfxLevel: 0.78 };
  var PRIORITY = {
    game_over: 100, level_complete: 100, record_saved: 95, record_rejected: 95,
    player_hurt: 90, player_fall: 90, health_low: 88, checkpoint: 80,
    graffbot_fire: 72, rat_pounce: 72, rat_attack: 70, enemy_stomp: 70,
    jump_3_backflip: 65, speed_boost_pickup: 65, secret_found: 65,
    jump_2: 55, jump_1: 50, land_heavy: 50, spray_hit: 48,
    coin_small: 20, coin_medium: 24, coin_large: 28, coin_xl: 32
  };
  var PER_EFFECT_LIMIT = {
    coin_small: 3, coin_medium: 3, coin_large: 2, coin_xl: 2,
    spray_hit: 2, enemy_defeat: 3, pigeon_pass: 1, health_low: 1
  };
  var COOLDOWN_MS = {
    coin_combo: 160, health_low: 1000, pigeon_pass: 450,
    ui_confirm: 80, ui_back: 80
  };

  var settings = loadSettings();
  var audioContext = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var unlocked = false;
  var manifest = null;
  var encodedAssets = new Map();
  var decodedBuffers = new Map();
  var decodePromises = new Map();
  var activeVoices = [];
  var lastPlayedAt = new Map();
  var musicSource = null;
  var musicWanted = false;
  var musicRequest = 0;

  function clampLevel(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  }

  function loadSettings() {
    var next = Object.assign({}, DEFAULT_SETTINGS);
    try {
      var stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && typeof stored === 'object') {
        if (typeof stored.muted === 'boolean') next.muted = stored.muted;
        next.musicLevel = clampLevel(stored.musicLevel, next.musicLevel);
        next.sfxLevel = clampLevel(stored.sfxLevel, next.sfxLevel);
      } else if (typeof window._arcadeMuted === 'boolean') {
        next.muted = window._arcadeMuted;
      }
    } catch (_) {
      if (typeof window._arcadeMuted === 'boolean') next.muted = window._arcadeMuted;
    }
    return next;
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  function assetUrl(file) {
    return new URL(file, new URL(MANIFEST_URL, window.location.href)).href;
  }

  function fetchAsset(id, file) {
    return fetch(assetUrl(file), { cache: 'force-cache' }).then(function (response) {
      if (!response.ok) throw new Error('NBG audio asset failed: ' + id + ' (' + response.status + ')');
      return response.arrayBuffer();
    }).then(function (data) {
      encodedAssets.set(id, data);
      return data;
    });
  }

  var manifestPromise = fetch(MANIFEST_URL, { cache: 'force-cache' }).then(function (response) {
    if (!response.ok) throw new Error('NBG audio manifest failed (' + response.status + ')');
    return response.json();
  }).then(function (data) {
    manifest = data;
    var entries = Object.keys(data.effects || {}).map(function (id) {
      return [id, data.effects[id]];
    });
    if (data.music && data.music.main) entries.push(['music:main', data.music.main]);
    return Promise.all(entries.map(function (entry) {
      return fetchAsset(entry[0], entry[1]);
    })).then(function () { return data; });
  }).catch(function (error) {
    console.warn('[NBG audio] preload unavailable:', error && error.message ? error.message : error);
    return null;
  });

  function ensureContext() {
    if (audioContext) return audioContext;
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
      audioContext = new Context();
      masterGain = audioContext.createGain();
      musicGain = audioContext.createGain();
      sfxGain = audioContext.createGain();
      musicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      masterGain.connect(audioContext.destination);
      applyGainSettings();
    } catch (_) {
      audioContext = null;
      masterGain = null;
      musicGain = null;
      sfxGain = null;
    }
    return audioContext;
  }

  function applyGainSettings() {
    if (!audioContext || !masterGain) return;
    var now = audioContext.currentTime;
    masterGain.gain.setValueAtTime(settings.muted ? 0 : 1, now);
    musicGain.gain.setValueAtTime(settings.musicLevel, now);
    sfxGain.gain.setValueAtTime(settings.sfxLevel, now);
  }

  function decodeAsset(id) {
    if (decodedBuffers.has(id)) return Promise.resolve(decodedBuffers.get(id));
    if (decodePromises.has(id)) return decodePromises.get(id);
    var pending = manifestPromise.then(function () {
      var context = ensureContext();
      var encoded = encodedAssets.get(id);
      if (!context || !encoded) return null;
      return context.decodeAudioData(encoded.slice(0)).then(function (buffer) {
        decodedBuffers.set(id, buffer);
        return buffer;
      });
    }).catch(function (error) {
      console.warn('[NBG audio] decode unavailable for ' + id + ':', error && error.message ? error.message : error);
      return null;
    });
    decodePromises.set(id, pending);
    return pending;
  }

  function resumeContext() {
    var context = ensureContext();
    if (!context) return Promise.resolve(false);
    var attempt = context.state === 'suspended' ? context.resume() : Promise.resolve();
    return Promise.resolve(attempt).then(function () {
      unlocked = context.state === 'running';
      if (unlocked && musicWanted && !settings.muted) startMusicSource();
      return unlocked;
    }).catch(function () { return false; });
  }

  function unlockFromInteraction() {
    resumeContext();
  }

  document.addEventListener('pointerdown', unlockFromInteraction, { capture: true, passive: true });
  document.addEventListener('touchstart', unlockFromInteraction, { capture: true, passive: true });
  document.addEventListener('keydown', unlockFromInteraction, true);

  function removeVoice(voice) {
    var index = activeVoices.indexOf(voice);
    if (index >= 0) activeVoices.splice(index, 1);
  }

  function stopVoice(voice) {
    if (!voice) return;
    voice.cancelled = true;
    try { if (voice.source) voice.source.stop(); } catch (_) {}
    try { if (voice.source) voice.source.disconnect(); } catch (_) {}
    try { if (voice.gain) voice.gain.disconnect(); } catch (_) {}
    removeVoice(voice);
  }

  function stopVoices() {
    activeVoices.slice().forEach(stopVoice);
  }

  function chooseVoiceToEvict(priority) {
    if (activeVoices.length < MAX_VOICES) return null;
    var lowest = activeVoices.reduce(function (selected, voice) {
      if (!selected || voice.priority < selected.priority ||
          (voice.priority === selected.priority && voice.startedAt < selected.startedAt)) return voice;
      return selected;
    }, null);
    return lowest && lowest.priority <= priority ? lowest : null;
  }

  function playEffect(id, options) {
    var opts = options || {};
    if (settings.muted || !id) return null;
    var nowMs = Date.now();
    var cooldown = Number(opts.cooldownMs != null ? opts.cooldownMs : (COOLDOWN_MS[id] || 0));
    if (cooldown && nowMs - Number(lastPlayedAt.get(id) || 0) < cooldown) return null;
    lastPlayedAt.set(id, nowMs);

    var context = audioContext;
    if (!context) return null;
    var voice = {
      id: id,
      priority: Number(opts.priority != null ? opts.priority : (PRIORITY[id] || 40)),
      startedAt: nowMs,
      source: null,
      gain: null,
      cancelled: false
    };

    decodeAsset(id).then(function (buffer) {
      if (!buffer || voice.cancelled || settings.muted || !audioContext) return;
      var sameId = activeVoices.filter(function (item) { return item.id === id; });
      var limit = Number(PER_EFFECT_LIMIT[id] || 4);
      if (sameId.length >= limit) stopVoice(sameId[0]);
      var evicted = chooseVoiceToEvict(voice.priority);
      if (activeVoices.length >= MAX_VOICES && !evicted) return;
      if (evicted) stopVoice(evicted);

      voice.source = audioContext.createBufferSource();
      voice.gain = audioContext.createGain();
      voice.source.buffer = buffer;
      voice.gain.gain.setValueAtTime(clampLevel(opts.volume, 1), audioContext.currentTime);
      voice.source.connect(voice.gain);
      voice.gain.connect(sfxGain);
      voice.source.onended = function () {
        try { voice.source.disconnect(); } catch (_) {}
        try { voice.gain.disconnect(); } catch (_) {}
        removeVoice(voice);
      };
      activeVoices.push(voice);
      voice.source.start();
    });
    return { stop: function () { stopVoice(voice); } };
  }

  function stopMusicSource() {
    musicRequest += 1;
    if (!musicSource) return;
    try { musicSource.stop(); } catch (_) {}
    try { musicSource.disconnect(); } catch (_) {}
    musicSource = null;
  }

  function startMusicSource() {
    if (!musicWanted || settings.muted || !audioContext || audioContext.state !== 'running' || musicSource) return;
    var request = ++musicRequest;
    decodeAsset('music:main').then(function (buffer) {
      if (!buffer || request !== musicRequest || !musicWanted || settings.muted ||
          !audioContext || audioContext.state !== 'running' || musicSource) return;
      var source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(musicGain);
      source.onended = function () {
        if (musicSource === source) musicSource = null;
      };
      musicSource = source;
      source.start();
    });
  }

  function startMusic() {
    musicWanted = true;
    if (unlocked && !settings.muted) startMusicSource();
  }

  function stopMusic() {
    musicWanted = false;
    stopMusicSource();
  }

  function setMuted(muted, options) {
    var opts = options || {};
    settings.muted = !!muted;
    window._arcadeMuted = settings.muted;
    saveSettings();
    applyGainSettings();
    if (settings.muted) {
      stopVoices();
      stopMusicSource();
    } else if (unlocked) {
      resumeContext().then(startMusicSource);
    }
    if (opts.emitEvent !== false) {
      document.dispatchEvent(new CustomEvent('arcade-mute-change', {
        detail: { muted: settings.muted }
      }));
    }
    return settings.muted;
  }

  function setLevels(levels) {
    var next = levels || {};
    settings.musicLevel = clampLevel(next.music, settings.musicLevel);
    settings.sfxLevel = clampLevel(next.sfx, settings.sfxLevel);
    saveSettings();
    applyGainSettings();
    return { music: settings.musicLevel, sfx: settings.sfxLevel };
  }

  function isMuted() {
    return settings.muted;
  }

  function stopAllSounds() {
    stopVoices();
    stopMusic();
  }

  function cueFromRuntime(event) {
    var detail = event && event.detail ? event.detail : {};
    if (detail.id) playEffect(detail.id, detail.options || {});
  }

  window.addEventListener('nbg-audio-cue', cueFromRuntime);

  window.addEventListener('nbg-level-started', function () {
    playEffect('ui_start', { priority: 80 });
    startMusic();
  });

  window.addEventListener('nbg-level-reset', function () {
    stopVoices();
    stopMusic();
  });

  window.addEventListener('nbg-xp-collected', function (event) {
    var detail = event && event.detail ? event.detail : {};
    var coin = detail.coin || {};
    if (coin.secret) return;
    var tier = ['small', 'medium', 'large', 'xl'].indexOf(coin.tier) >= 0 ? coin.tier : 'small';
    playEffect('coin_' + tier);
    var multiplier = Number(detail.multiplier || 1);
    if (multiplier >= 4 && multiplier % 4 === 0) playEffect('coin_combo');
  });

  window.addEventListener('nbg-secret-found', function () {
    playEffect('secret_found', { priority: 65 });
  });

  window.addEventListener('nbg-speed-boost', function () {
    playEffect('speed_boost_pickup', { priority: 65 });
  });

  window.addEventListener('nbg-reward-found', function (event) {
    var detail = event && event.detail ? event.detail : {};
    playEffect(detail.kind === 'star' ? 'star_box' : 'mystery_box', { priority: 58 });
    if (detail.reward && Number(detail.reward.health) > 0) {
      playEffect('health_restore', { priority: 68 });
    }
  });

  window.addEventListener('nbg-enemy-defeated', function (event) {
    var detail = event && event.detail ? event.detail : {};
    if (detail.reason === 'spray') playEffect('spray_hit', { priority: 58 });
    if (detail.reason === 'stomp') playEffect('enemy_stomp', { priority: 70 });
    if (detail.type === 'bot') playEffect('graffbot_hurt', { priority: 68 });
    if (detail.type === 'balloon') playEffect('balloon_burst', { priority: 68 });
    playEffect('enemy_defeat', { priority: 62 });
  });

  window.addEventListener('nbg-player-hit', function (event) {
    var detail = event && event.detail ? event.detail : {};
    playEffect(detail.enemy === 'fall' ? 'player_fall' : 'player_hurt', { priority: 90 });
    if (Number(detail.health) === 1) playEffect('health_low', { priority: 88 });
  });

  window.addEventListener('nbg-checkpoint', function () {
    playEffect('checkpoint', { priority: 80 });
  });

  window.addEventListener('nbg-game-over', function () {
    stopMusic();
    playEffect('game_over', { priority: 100 });
  });

  window.addEventListener('nbg-level-complete', function () {
    stopMusic();
    playEffect('level_complete', { priority: 100 });
  });

  window.addEventListener('nbg-record-result', function (event) {
    var detail = event && event.detail ? event.detail : {};
    if (detail.accepted === true) playEffect('record_saved', { priority: 95 });
    if (detail.accepted === false && detail.authoritative === true) {
      playEffect('record_rejected', { priority: 95 });
    }
  });

  document.addEventListener('arcade-pause-change', function (event) {
    playEffect(event && event.detail && event.detail.paused ? 'ui_pause' : 'ui_resume', { priority: 76 });
  });

  document.addEventListener('arcade-mute-change', function (event) {
    setMuted(!!(event && event.detail && event.detail.muted), { emitEvent: false });
  });

  document.addEventListener('arcade-overlay-exit', function () {
    playEffect('ui_back', { priority: 60 });
  });

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('button, a') : null;
    if (!target || target.closest('.touch-controls')) return;
    if (target.matches('#overlay-btn-exit, #nbg-close-records')) {
      playEffect('ui_back', { priority: 60 });
      return;
    }
    if (target.matches('#overlay-btn-info, #overlay-btn-data, #overlay-btn-modifiers, #overlay-btn-faction, #overlay-btn-fs, #fullscreen-prompt-btn, #overlay-btn-reset, #overlay-btn-mute, #nbg-open-records, #nbg-zoom-control, .nbg-record-switches button')) {
      playEffect('ui_confirm', { priority: 45 });
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!audioContext) return;
    if (document.hidden) {
      audioContext.suspend().catch(function () {});
      return;
    }
    if (unlocked && !settings.muted) resumeContext();
  });

  window._arcadeMuted = settings.muted;
  var api = {
    playSound: playEffect,
    playEffect: playEffect,
    startMusic: startMusic,
    stopMusic: stopMusic,
    stopAllSounds: stopAllSounds,
    setMuted: setMuted,
    isMuted: isMuted,
    setLevels: setLevels,
    unlock: resumeContext,
    getState: function () {
      return {
        unlocked: unlocked,
        contextState: audioContext ? audioContext.state : 'unavailable',
        muted: settings.muted,
        musicLevel: settings.musicLevel,
        sfxLevel: settings.sfxLevel,
        activeVoices: activeVoices.length,
        maxVoices: MAX_VOICES,
        musicWanted: musicWanted,
        musicPlaying: !!musicSource,
        manifestLoaded: !!manifest,
        encodedAssets: encodedAssets.size,
        decodedAssets: decodedBuffers.size
      };
    }
  };
  window.NBGAudio = api;
  window.ArcadeAudio = api;
  // game-fullscreen.js loads first, so refresh its button after restoring storage.
  document.dispatchEvent(new CustomEvent('arcade-mute-change', {
    detail: { muted: settings.muted }
  }));
}());
