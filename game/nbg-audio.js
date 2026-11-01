(function () {
  'use strict';

  var MANIFEST_URL = '/game/assets/audio/nbg-dark-industrial/manifest.json?v=two-song-music-v1';
  var STORAGE_KEY = 'nbg-audio-settings-v1';
  var MAX_VOICES = 12;
  var MAX_ENEMY_LOOPS = 3;
  var MAX_ENEMY_LOOP_SOURCES = 6;
  var ENEMY_LOOP_DISTANCE = 520;
  var ENEMY_LOOP_FADE_SECONDS = 0.12;
  var ENEMY_LOOP_RETRY_MS = 3000;
  var ENEMY_LOOP_MIN_VOLUME = 0.035;
  var ENEMY_LOOP_MAX_VOLUME = 0.24;
  var DEFAULT_SETTINGS = { muted: false, musicLevel: 0.42, sfxLevel: 0.78 };
  var PRIORITY = {
    game_over: 100, level_complete: 100, record_saved: 95, record_rejected: 95,
    player_hurt: 90, player_fall: 90, health_low: 88, checkpoint: 80,
    graffbot_fire: 72, rat_pounce: 72, turquoise_rat_kick: 72,
    rat_attack: 70, brown_rat_punch: 70, turquoise_rat_punch: 70, enemy_stomp: 70,
    jump_3_backflip: 65, speed_boost_pickup: 65, secret_found: 65,
    jump_2: 55, jump_1: 50, land_heavy: 50, spray_hit: 48,
    coin_small: 20, coin_medium: 24, coin_large: 28, coin_xl: 32
  };
  var PER_EFFECT_LIMIT = {
    coin_small: 3, coin_medium: 3, coin_large: 2, coin_xl: 2,
    spray_hit: 2, enemy_defeat: 3, pigeon_pass: 1, health_low: 1
  };
  var COOLDOWN_MS = {
    coin_combo: 160, health_low: 1000, pigeon_pass: 450, pigeon_call: 800,
    graffbot_spot: 600, london_rat_alert: 450, brown_rat_alert: 450,
    turquoise_rat_alert: 450, balloon_girl_spot: 650,
    ui_confirm: 80, ui_back: 80
  };
  var ENEMY_AUDIO = {
    bot: { moving: 'graffbot_walk', idle: 'graffbot_idle', alert: 'graffbot_spot' },
    rat: { moving: 'london_rat_walk', alert: 'london_rat_alert' },
    brownRat: { moving: 'brown_rat_walk', alert: 'brown_rat_alert' },
    turquoiseRat: { moving: 'turquoise_rat_walk', alert: 'turquoise_rat_alert' },
    parachuteRatA: { moving: 'parachute_rat_a_descent' },
    parachuteRatB: { moving: 'parachute_rat_b_descent' },
    parachuteRatC: { moving: 'parachute_rat_c_descent' },
    balloon: { moving: 'balloon_girl_walk', presence: 'balloon_girl_presence', alert: 'balloon_girl_spot' },
    pigeon: { moving: 'pigeon_flight', alert: 'pigeon_call' }
  };

  var settings = loadSettings();
  var audioContext = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var unlocked = false;
  var manifest = null;
  var encodedAssets = new Map();
  var inFlightAssets = new Map();
  var assetFailures = new Map();
  var manifestError = null;
  var decodedBuffers = new Map();
  var decodePromises = new Map();
  var activeVoices = [];
  // Invalidate effects that are still waiting for fetch/decode and have not yet
  // entered activeVoices. Reset and mute must silence the abandoned request too.
  var effectRequestGeneration = 0;
  var lastPlayedAt = new Map();
  var enemyLoopVoices = new Map();
  var enemyLoopSources = [];
  var enemyEncountered = new Set();
  var enemyLoopRequestGeneration = 0;
  var enemyLoopRetryAt = new Map();
  var enemyLoopStartCounter = 0;
  var enemyLoopsPaused = false;
  var musicSource = null;
  var musicWanted = false;
  var musicRequest = 0;
  var musicIndex = 0;
  var musicMediaNode = null;
  var musicGesturePrimed = false;
  var MUSIC_FIRST_TRACK = 'music/Rolling In Dark (6).mp3';

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

  function fetchAsset(id, file, options) {
    if (encodedAssets.has(id)) return Promise.resolve(encodedAssets.get(id));
    if (inFlightAssets.has(id)) return inFlightAssets.get(id);
    var cacheMode = options && options.retry ? 'reload' : 'force-cache';
    var pending = fetch(assetUrl(file), { cache: cacheMode }).then(function (response) {
      if (!response.ok) throw new Error('NBG audio asset failed: ' + id + ' (' + response.status + ')');
      return response.arrayBuffer();
    }).then(function (data) {
      encodedAssets.set(id, data);
      assetFailures.delete(id);
      return data;
    }).catch(function (error) {
      assetFailures.set(id, String(error && error.message || error));
      console.warn('[NBG audio] asset unavailable: ' + id, error);
      return null;
    }).then(function (data) {
      inFlightAssets.delete(id);
      return data;
    });
    inFlightAssets.set(id, pending);
    return pending;
  }

  var manifestPromise = fetch(MANIFEST_URL, { cache: 'no-store' }).then(function (response) {
    if (!response.ok) throw new Error('NBG audio manifest failed (' + response.status + ')');
    return response.json();
  }).then(function (data) {
    manifest = data;
    if (Object.keys(data.enemyIdentities || {}).length !== 17) {
      console.warn('[NBG audio] expected 17 enemy identity sounds, got ' + Object.keys(data.enemyIdentities || {}).length);
    }
    var entries = Object.keys(data.effects || {}).map(function (id) {
      return [id, data.effects[id]];
    });
    Object.keys(data.enemyIdentities || {}).forEach(function (id) {
      entries.push([id, data.enemyIdentities[id]]);
    });
    // Long MP3 music streams through HTMLAudioElement, not the SFX decode cache.
    // Do not make requested SFX wait for every other file in the full pack.
    // The manifest is ready immediately; background preload is best effort.
    entries.forEach(function (entry) { fetchAsset(entry[0], entry[1]); });
    return data;
  }).catch(function (error) {
    manifestError = String(error && error.message || error);
    console.warn('[NBG audio] preload unavailable:', manifestError);
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
    musicGain.gain.setValueAtTime(settings.muted || !musicWanted || document.hidden ? 0 : settings.musicLevel, now);
    sfxGain.gain.setValueAtTime(settings.sfxLevel, now);
  }

  function decodeAsset(id) {
    if (decodedBuffers.has(id)) return Promise.resolve(decodedBuffers.get(id));
    if (decodePromises.has(id)) return decodePromises.get(id);
    var pending = manifestPromise.then(function () {
      var context = ensureContext();
      if (!context || !manifest) return null;
      var file = (manifest.effects || {})[id] || (manifest.enemyIdentities || {})[id];
      if (!file) return null;
      return encodedAssets.has(id) ? encodedAssets.get(id) : fetchAsset(id, file, { retry: true });
    }).then(function (encoded) {
      if (!encoded || !audioContext) return null;
      var context = audioContext;
      return context.decodeAudioData(encoded.slice(0)).then(function (buffer) {
        decodedBuffers.set(id, buffer);
        return buffer;
      });
    }).catch(function (error) {
      console.warn('[NBG audio] decode unavailable for ' + id + ':', error && error.message ? error.message : error);
      return null;
    });
    decodePromises.set(id, pending);
    pending.then(function (buffer) { if (!buffer) decodePromises.delete(id); });
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
    primeMusicFromGesture();
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
    effectRequestGeneration += 1;
    activeVoices.slice().forEach(stopVoice);
    stopEnemyLoops(false, true);
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
      cancelled: false,
      generation: effectRequestGeneration
    };

    decodeAsset(id).then(function (buffer) {
      if (!buffer || voice.cancelled || voice.generation !== effectRequestGeneration ||
          settings.muted || !audioContext) return;
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
  function removeEnemyLoopSource(voice) {
    var index = enemyLoopSources.indexOf(voice);
    if (index >= 0) enemyLoopSources.splice(index, 1);
  }

  function setEnemyLoopGain(voice, volume, immediate) {
    if (!voice || !voice.gain || !audioContext) return;
    var gain = voice.gain.gain;
    var now = audioContext.currentTime;
    var target = clampLevel(volume, 0);
    try {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Number(gain.value) || 0, now);
      if (immediate) gain.setValueAtTime(target, now);
      else gain.linearRampToValueAtTime(target, now + ENEMY_LOOP_FADE_SECONDS);
    } catch (_) {
      gain.value = target;
    }
  }

  function stopEnemyLoopVoice(voice, immediate) {
    if (!voice) return;
    if (voice.cancelled && !immediate) return;
    voice.cancelled = true;
    if (enemyLoopVoices.get(voice.key) === voice) enemyLoopVoices.delete(voice.key);
    if (!voice.source) return;
    var stopAt = audioContext ? audioContext.currentTime : 0;
    if (!immediate) {
      setEnemyLoopGain(voice, 0, false);
      stopAt += ENEMY_LOOP_FADE_SECONDS;
    }
    try { voice.source.stop(stopAt); } catch (_) {}
    if (immediate) {
      try { voice.source.disconnect(); } catch (_) {}
      try { if (voice.gain) voice.gain.disconnect(); } catch (_) {}
      removeEnemyLoopSource(voice);
    }
  }

  function stopEnemyLoops(clearEncounters, immediate) {
    enemyLoopRequestGeneration += 1;
    Array.from(enemyLoopVoices.values()).forEach(function (voice) {
      stopEnemyLoopVoice(voice, !!immediate);
    });
    if (immediate) enemyLoopSources.slice().forEach(function (voice) {
      stopEnemyLoopVoice(voice, true);
    });
    if (clearEncounters) {
      enemyEncountered = new Set();
      enemyLoopRetryAt.clear();
    }
  }

  function enemyLoopId(snapshot, config) {
    if (!config) return '';
    if (snapshot.state === 'combat') return '';
    if (snapshot.identity === 'balloon' && snapshot.state === 'release') return config.presence || '';
    if (snapshot.moving) return config.moving || '';
    return config.idle || config.presence || '';
  }

  function enemyDistance(snapshot, listener) {
    var supplied = Number(snapshot.distance);
    if (Number.isFinite(supplied)) return Math.max(0, supplied);
    var dx = Number(snapshot.x || 0) - Number(listener.x || 0);
    var dy = (Number(snapshot.y || 0) - Number(listener.y || 0)) * 0.55;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function enemyLoopVolume(distance) {
    var proximity = Math.max(0, 1 - distance / ENEMY_LOOP_DISTANCE);
    return ENEMY_LOOP_MIN_VOLUME +
      (ENEMY_LOOP_MAX_VOLUME - ENEMY_LOOP_MIN_VOLUME) * proximity * proximity;
  }

  function startEnemyLoop(candidate) {
    var voice = {
      key: candidate.key,
      id: candidate.id,
      targetVolume: candidate.volume,
      source: null,
      gain: null,
      cancelled: false,
      generation: enemyLoopRequestGeneration
    };
    enemyLoopVoices.set(candidate.key, voice);
    decodeAsset(candidate.id).then(function (buffer) {
      if (voice.cancelled || voice.generation !== enemyLoopRequestGeneration ||
          enemyLoopVoices.get(voice.key) !== voice) return;
      if (!buffer) {
        enemyLoopVoices.delete(voice.key);
        enemyLoopRetryAt.set(voice.id, Date.now() + ENEMY_LOOP_RETRY_MS);
        return;
      }
      if (settings.muted || enemyLoopsPaused || document.hidden || !audioContext ||
          audioContext.state !== 'running') return;
      enemyLoopRetryAt.delete(voice.id);
      while (enemyLoopSources.length >= MAX_ENEMY_LOOP_SOURCES) {
        stopEnemyLoopVoice(enemyLoopSources[0], true);
      }
      voice.source = audioContext.createBufferSource();
      voice.gain = audioContext.createGain();
      voice.source.buffer = buffer;
      voice.source.loop = true;
      voice.gain.gain.setValueAtTime(0, audioContext.currentTime);
      voice.source.connect(voice.gain);
      voice.gain.connect(sfxGain);
      voice.source.onended = function () {
        try { voice.source.disconnect(); } catch (_) {}
        try { voice.gain.disconnect(); } catch (_) {}
        removeEnemyLoopSource(voice);
        if (enemyLoopVoices.get(voice.key) === voice) enemyLoopVoices.delete(voice.key);
      };
      enemyLoopSources.push(voice);
      var duration = Number(buffer.duration) || 0;
      var offset = duration > 0 ? (enemyLoopStartCounter * 0.37) % duration : 0;
      enemyLoopStartCounter += 1;
      voice.source.start(0, offset);
      setEnemyLoopGain(voice, voice.targetVolume, false);
    });
    return voice;
  }

  function updateEnemyLoops(detail) {
    var frame = detail || {};
    if (settings.muted || enemyLoopsPaused || document.hidden || !unlocked ||
        !audioContext || audioContext.state !== 'running') {
      stopEnemyLoops(false, false);
      return;
    }
    var listener = frame.listener || {};
    var snapshots = Array.isArray(frame.enemies) ? frame.enemies : [];
    var candidates = [];
    snapshots.forEach(function (snapshot, index) {
      if (!snapshot || snapshot.alive === false || snapshot.visible !== true) return;
      var key = snapshot.key || snapshot.enemy;
      var identity = snapshot.identity || snapshot.variant || snapshot.type;
      var config = ENEMY_AUDIO[identity];
      if (!key || !config) return;
      var normalized = Object.assign({}, snapshot, { identity: identity });
      var id = enemyLoopId(normalized, config);
      if (!id) return;
      var distance = enemyDistance(normalized, listener);
      if (distance > ENEMY_LOOP_DISTANCE) return;
      candidates.push({
        key: key,
        id: id,
        alert: config.alert || '',
        distance: distance,
        volume: enemyLoopVolume(distance),
        order: index
      });
    });
    candidates.sort(function (left, right) {
      return left.distance - right.distance || left.order - right.order;
    });
    candidates = candidates.slice(0, MAX_ENEMY_LOOPS);
    var desired = new Set(candidates.map(function (candidate) { return candidate.key; }));
    Array.from(enemyLoopVoices.values()).forEach(function (voice) {
      if (!desired.has(voice.key)) stopEnemyLoopVoice(voice, false);
    });
    candidates.forEach(function (candidate) {
      var voice = enemyLoopVoices.get(candidate.key);
      if (voice && voice.id !== candidate.id) {
        stopEnemyLoopVoice(voice, false);
        voice = null;
      }
      if (!voice && Date.now() >= Number(enemyLoopRetryAt.get(candidate.id) || 0)) {
        voice = startEnemyLoop(candidate);
      }
      if (!voice) return;
      voice.targetVolume = candidate.volume;
      setEnemyLoopGain(voice, candidate.volume, false);
      if (candidate.alert && !enemyEncountered.has(candidate.key)) {
        enemyEncountered.add(candidate.key);
        playEffect(candidate.alert, { priority: 34, volume: 0.46 });
      }
    });
  }

  // The streaming element is created in the user's initial gesture, not in the
  // later async level-start event. Safari requires this for reliable playback.
  // It is connected once to the existing Web Audio music gain to make level 0
  // genuinely silent even on iOS where HTMLMediaElement.volume cannot be set.
  function ensureMusicSource() {
    if (musicSource) return musicSource;
    var context = ensureContext();
    if (!context || !context.createMediaElementSource || !window.Audio) return null;
    var source = new window.Audio();
    source.preload = 'auto';
    source.loop = false;
    source.src = assetUrl(MUSIC_FIRST_TRACK);
    try {
      musicMediaNode = context.createMediaElementSource(source);
      musicMediaNode.connect(musicGain);
    } catch (error) {
      console.warn('[NBG audio] music mixer unavailable:', error);
      return null; // Never play directly at unregulated device volume.
    }
    source.onended = function () {
      if (source !== musicSource || !musicWanted) return;
      var tracks = manifest && manifest.music && manifest.music.tracks;
      if (!Array.isArray(tracks) || tracks.length !== 2) return;
      musicIndex = (musicIndex + 1) % tracks.length;
      source.src = assetUrl(tracks[musicIndex]);
      source.load();
      playMusicSource(source);
    };
    source.onerror = function () {
      console.warn('[NBG audio] music track unavailable:', source.src);
      pauseMusicSource();
    };
    musicSource = source;
    applyGainSettings();
    return source;
  }

  function primeMusicFromGesture() {
    var source = ensureMusicSource();
    if (!source || settings.muted || document.hidden) return;
    if (musicWanted) {
      // A fresh touch also retries any browser-blocked playback synchronously.
      playMusicSource(source);
      return;
    }
    if (musicGesturePrimed) return;
    musicGesturePrimed = true;
    // This must be called synchronously inside pointerdown/touchstart/keydown.
    // The gain graph is silent while !musicWanted, so the intro cannot leak.
    var attempt;
    try { attempt = source.play(); } catch (_) { musicGesturePrimed = false; return; }
    Promise.resolve(attempt).then(function () {
      if (source === musicSource && !musicWanted) {
        source.pause();
        try { source.currentTime = 0; } catch (_) {}
      }
    }, function () {
      musicGesturePrimed = false; // Allow a later user gesture to retry.
    });
  }

  function pauseMusicSource() {
    if (musicSource) {
      try { musicSource.pause(); } catch (_) {}
    }
  }

  function stopMusicSource() {
    musicRequest += 1;
    pauseMusicSource();
    if (musicSource) {
      try { musicSource.currentTime = 0; } catch (_) {}
    }
    // Reuse the unlocked element + its single MediaElementAudioSourceNode.
  }

  function playMusicSource(source) {
    if (!source || source !== musicSource || !musicWanted || settings.muted || document.hidden) return;
    applyGainSettings();
    var playing;
    try { playing = source.play(); } catch (error) {
      console.warn('[NBG audio] music playback blocked:', error);
      return;
    }
    if (playing && typeof playing.catch === 'function') {
      playing.catch(function (error) {
        if (source === musicSource && musicWanted && !settings.muted) {
          console.warn('[NBG audio] music playback blocked:', error);
        }
      });
    }
  }

  function startMusicSource() {
    if (!musicWanted || settings.muted || document.hidden || !unlocked ||
        !audioContext || audioContext.state !== 'running') return;
    var request = ++musicRequest;
    manifestPromise.then(function (data) {
      if (request !== musicRequest || !musicWanted || settings.muted || document.hidden ||
          !unlocked || !audioContext || audioContext.state !== 'running') return;
      var tracks = data && data.music && data.music.tracks;
      if (!Array.isArray(tracks) || tracks.length !== 2 || tracks[0] !== MUSIC_FIRST_TRACK) return;
      var source = ensureMusicSource();
      if (!source) return;
      var desired = assetUrl(tracks[musicIndex]);
      if (source.src !== desired) {
        source.src = desired;
        source.load();
      }
      if (source.paused) playMusicSource(source);
      else applyGainSettings(); // Priming may still be playing silently.
    });
  }

  function startMusic() {
    stopMusicSource();
    musicIndex = 0;
    musicWanted = true;
    applyGainSettings();
    if (unlocked && !settings.muted) startMusicSource();
  }

  function stopMusic() {
    musicWanted = false;
    stopMusicSource();
    musicIndex = 0;
    applyGainSettings();
  }

  function setMuted(muted, options) {
    var opts = options || {};
    settings.muted = !!muted;
    window._arcadeMuted = settings.muted;
    saveSettings();
    applyGainSettings();
    if (settings.muted) {
      stopVoices();
      pauseMusicSource();
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
  window.addEventListener('nbg-enemy-audio-frame', function (event) {
    updateEnemyLoops(event && event.detail ? event.detail : {});
  });

  window.addEventListener('nbg-level-started', function () {
    enemyLoopsPaused = false;
    playEffect('ui_start', { priority: 80 });
    startMusic();
  });

  window.addEventListener('nbg-level-reset', function () {
    stopVoices();
    stopEnemyLoops(true, true);
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
    stopEnemyLoops(false, false);
    stopMusic();
    playEffect('game_over', { priority: 100 });
  });

  window.addEventListener('nbg-level-complete', function () {
    stopEnemyLoops(false, false);
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
    enemyLoopsPaused = !!(event && event.detail && event.detail.paused);
    if (enemyLoopsPaused) stopEnemyLoops(false, false);
    playEffect(enemyLoopsPaused ? 'ui_pause' : 'ui_resume', { priority: 76 });
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
      stopEnemyLoops(false, true);
      pauseMusicSource();
      applyGainSettings();
      audioContext.suspend().catch(function () {});
      return;
    }
    applyGainSettings();
    if (unlocked && !settings.muted) resumeContext();
  });

  window.addEventListener('pagehide', function () { stopEnemyLoops(false, true); stopMusic(); });
  window.addEventListener('beforeunload', function () { stopEnemyLoops(false, true); stopMusic(); });

  window._arcadeMuted = settings.muted;
  var api = {
    playSound: playEffect,
    playEffect: playEffect,
    startMusic: startMusic,
    stopMusic: stopMusic,
    stopAllSounds: stopAllSounds,
    updateEnemyLoops: updateEnemyLoops,
    stopEnemyLoops: function () { stopEnemyLoops(true, true); },
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
        activeEnemyLoops: enemyLoopVoices.size,
        enemyLoopSources: enemyLoopSources.length,
        enemyLoopIds: Array.from(enemyLoopVoices.values()).map(function (voice) { return voice.id; }),
        enemyLoopVolumes: Array.from(enemyLoopVoices.values()).map(function (voice) { return voice.targetVolume; }),
        maxEnemyLoops: MAX_ENEMY_LOOPS,
        musicWanted: musicWanted,
        musicPlaying: !!musicSource && !musicSource.paused,
        musicTrackIndex: musicIndex,
        musicTrack: manifest && manifest.music && manifest.music.tracks && manifest.music.tracks[musicIndex] || null,
        manifestLoaded: !!manifest,
        encodedAssets: encodedAssets.size,
        expectedAssets: manifest ? Object.keys(manifest.effects || {}).length + Object.keys(manifest.enemyIdentities || {}).length : 0,
        enemyAssetsLoaded: manifest ? Object.keys(manifest.enemyIdentities || {}).filter(function (id) { return encodedAssets.has(id); }).length : 0,
        failedAssets: Array.from(assetFailures.entries()),
        manifestError: manifestError,
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
