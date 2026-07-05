(function () {
  'use strict';

  var SCHEMA_VERSION = 1;
  var SECTION_TIMEOUT_MS = 8000;
  var DISCLOSURE_STORAGE_KEY = 'moonboys:battle-chamber:disclosures:v1';
  var SNAPSHOT_PREFIX = 'moonboys:battle-chamber:snapshot:';
  var VALID_FACTIONS = [
    'hard-fork-rockers',
    'rugpull-miners',
    'graffpunks',
    'blockchain-furies',
    'crypto-moongirls',
    'blockstars',
    'all-city-bulls',
    'nomad-bears',
    'crypto-stoned-boys',
  ];

  var SECTION_COPY = Object.freeze({
    degraded: 'Live data did not resolve in time. Showing cached or local-safe Battle Chamber state.',
    retry: 'Retry',
    offline: 'Live server data is unavailable. Showing offline/cache-safe state.',
    failed: 'This section could not load live data. Try again or use the cached local view.',
    identityRequired: 'Connect an identity provider to load linked account state.',
    noLinkedDaily: 'Linked daily state is unavailable. Local Battle Chamber guidance remains available.',
    factionLock: 'Choose carefully. Your faction is locked for the current season.',
    factionReset: 'At season reset, your faction lock clears and you can join again or pick a new side.',
    factionIdentityRequired: 'Faction clout only counts when you are identity-linked. No faction, no faction clout.',
    joinIntro: 'Join a faction to make your arcade activity count for something bigger. Your runs build clout. Your faction earns pressure.',
    missionsLoading: 'Loading faction missions... (connect your identity provider to sync live data)',
    missionsNote: 'Mission rewards are clout/war contribution only. Linked identity users sync mission progress to server.',
    proofFallback: 'Faction activity, XP movement, and public proof appear below where wired. Linked identity users sync activity to the server.',
    backendUnavailable: 'Faction backend is updating. Your identity link is active, but faction join is temporarily unavailable. Try again after deployment.',
  });

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeText(value, fallback) {
    if (value == null) return fallback || '';
    return String(value);
  }

  function toNumber(value, fallback) {
    var num = Number(value);
    return Number.isFinite(num) ? num : (fallback || 0);
  }

  function cleanFactionKey(value) {
    var key = safeText(value).toLowerCase().trim();
    return VALID_FACTIONS.indexOf(key) === -1 ? '' : key;
  }

  function versioned(type, data, source) {
    return {
      schemaVersion: SCHEMA_VERSION,
      type: type,
      source: source || 'local',
      updatedAt: Date.now(),
      data: data,
    };
  }

  function validateStandingsPayload(payload, fallbackPeriod) {
    if (!isObject(payload) || payload.ok !== true || !Array.isArray(payload.factions)) return null;
    var rows = payload.factions.map(function (row) {
      row = isObject(row) ? row : {};
      var key = cleanFactionKey(row.faction_id || row.faction);
      if (!key) return null;
      return {
        faction_id: key,
        rank: toNumber(row.rank, 0),
        clout_total: toNumber(row.clout_total, 0),
        contribution_total: toNumber(row.contribution_total, 0),
        mission_total: toNumber(row.mission_total, 0),
        score_total: toNumber(row.score_total, 0),
        member_count: toNumber(row.member_count, 0),
        momentum: row.momentum == null ? null : toNumber(row.momentum, 0),
      };
    }).filter(Boolean);
    return versioned('faction-standings', {
      period: safeText(payload.period, fallbackPeriod || 'weekly'),
      period_key: payload.period_key || null,
      rows: rows,
    }, 'server');
  }

  function validateActivityPayload(payload) {
    if (!isObject(payload) || payload.ok !== true || !Array.isArray(payload.items)) return null;
    return versioned('xp-feed', payload.items.filter(isObject).slice(0, 50), 'server');
  }

  function validateRewardData(payload) {
    var factions = isObject(payload) && isObject(payload.factions) ? payload.factions : {};
    var output = {};
    VALID_FACTIONS.forEach(function (key) {
      var reward = isObject(factions[key]) ? factions[key] : {};
      output[key] = {
        factionId: key,
        weekly: isObject(reward.weekly) ? reward.weekly : {},
        monthly: isObject(reward.monthly) ? reward.monthly : {},
        seasonal: isObject(reward.seasonal) ? reward.seasonal : {},
        personal: isObject(reward.personal) ? reward.personal : {},
        badgeTrack: Array.isArray(reward.badgeTrack) ? reward.badgeTrack : [],
        stickerTrack: Array.isArray(reward.stickerTrack) ? reward.stickerTrack : [],
        titleTrack: Array.isArray(reward.titleTrack) ? reward.titleTrack : [],
        roguelite: Array.isArray(reward.roguelite) ? reward.roguelite : [],
      };
    });
    return versioned('rewards', { factions: output }, payload && payload.source ? payload.source : 'local');
  }

  function validateMissionData(payload) {
    var input = isObject(payload) ? payload : {};
    var output = {};
    VALID_FACTIONS.forEach(function (key) {
      var data = isObject(input[key]) ? input[key] : {};
      output[key] = {
        daily: Array.isArray(data.daily) ? data.daily.filter(isObject) : [],
        seasonal: Array.isArray(data.seasonal) ? data.seasonal.filter(isObject) : [],
        completed: Array.isArray(data.completed) ? data.completed : [],
        progress: isObject(data.progress) ? data.progress : {},
      };
    });
    return versioned('missions', output, 'local');
  }

  function validateDailyState(payload) {
    if (!isObject(payload) || payload.ok !== true) return null;
    return versioned('daily-options', payload, 'server');
  }

  function validateMissedHistoryPayload(payload) {
    if (!isObject(payload) || payload.ok !== true || !Array.isArray(payload.items)) return null;
    return versioned('missed-history', payload.items.filter(isObject), 'server');
  }

  function storageGet(key) {
    try { return window.localStorage ? window.localStorage.getItem(key) : null; } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { if (window.localStorage) window.localStorage.setItem(key, value); } catch (_) {}
  }

  function setSectionState(id, state, message) {
    var node = document.getElementById(id);
    if (!node) return;
    node.dataset.bcState = state;
    node.dataset.bcUpdatedAt = String(Date.now());
    var details = node.closest ? node.closest('details.bc-disclosure') : null;
    if (details) details.dataset.bcState = state;
    if (message) node.dataset.bcMessage = message;
  }

  function saveSectionSnapshot(id) {
    var node = document.getElementById(id);
    if (!node || !node.innerHTML || node.querySelector('.community-loading')) return;
    storageSet(SNAPSHOT_PREFIX + id, JSON.stringify({ html: node.innerHTML, savedAt: Date.now() }));
  }

  function restoreSectionSnapshot(id) {
    var raw = storageGet(SNAPSHOT_PREFIX + id);
    if (!raw) return false;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.html) return false;
      var node = document.getElementById(id);
      if (!node) return false;
      node.innerHTML = '<p class="bc-state-note">' + SECTION_COPY.offline + '</p>' + parsed.html;
      setSectionState(id, 'offline-cache', SECTION_COPY.offline);
      return true;
    } catch (_) {
      return false;
    }
  }

  function showFallback(id, state, message) {
    var node = document.getElementById(id);
    if (!node) return;
    if (restoreSectionSnapshot(id)) return;
    node.innerHTML =
      '<div class="bc-fallback-state" role="status">' +
        '<p>' + safeText(message, SECTION_COPY.failed) + '</p>' +
        '<button class="bc-retry-btn" type="button" data-bc-retry>' + SECTION_COPY.retry + '</button>' +
      '</div>';
    setSectionState(id, state || 'failed', message || SECTION_COPY.failed);
  }

  function createIdentityProvider() {
    function gate() { return window.MOONBOYS_IDENTITY || null; }
    return {
      type: 'telegram',
      isAvailable: function () {
        var identity = gate();
        return !!identity;
      },
      isLinked: function () {
        try {
          var identity = gate();
          return !!(identity && typeof identity.isTelegramLinked === 'function' && identity.isTelegramLinked());
        } catch (_) { return false; }
      },
      getSignedAuth: function () {
        try {
          var identity = gate();
          if (!identity || typeof identity.getSignedTelegramAuth !== 'function') return null;
          var payload = identity.getSignedTelegramAuth();
          return isObject(payload) ? payload : null;
        } catch (_) { return null; }
      },
    };
  }

  function createRenderController(options) {
    options = options || {};
    var callbacks = options.callbacks || {};
    var sections = options.sections || [];
    var delay = options.debounceMs || 80;
    var queue = [];
    var timer = null;
    var rendering = false;
    var lastStatus = null;

    function markLoading() {
      sections.forEach(function (id) {
        var node = document.getElementById(id);
        if (!node || node.dataset.bcState) return;
        setSectionState(id, 'loading');
        window.setTimeout(function () {
          var current = document.getElementById(id);
          if (current && current.dataset.bcState === 'loading') {
            showFallback(id, 'degraded', SECTION_COPY.degraded);
          }
        }, SECTION_TIMEOUT_MS);
      });
    }

    function runSection(id, fn, status) {
      setSectionState(id, 'loading');
      try {
        fn(status || null);
        setSectionState(id, 'loaded');
        saveSectionSnapshot(id);
      } catch (err) {
        showFallback(id, 'failed', SECTION_COPY.failed);
      }
    }

    function flush() {
      if (rendering) return;
      var jobs = queue.splice(0);
      if (!jobs.length) return;
      rendering = true;
      jobs.forEach(function (job) {
        if (job.status) lastStatus = job.status;
      });
      var status = lastStatus;
      try {
        if (callbacks.renderAll) callbacks.renderAll(status);
        if (callbacks.afterRender) callbacks.afterRender();
      } finally {
        rendering = false;
        if (queue.length) schedule();
      }
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        flush();
      }, delay);
    }

    return {
      markLoading: markLoading,
      runSection: runSection,
      request: function (reason, status) {
        queue.push({ reason: reason || 'update', status: status || null, at: Date.now() });
        schedule();
      },
      retry: function () {
        sections.forEach(function (id) { setSectionState(id, 'loading'); });
        this.request('retry', lastStatus);
      },
    };
  }

  window.BATTLE_CHAMBER_PLATFORM = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    VALID_FACTIONS: VALID_FACTIONS.slice(),
    content: SECTION_COPY,
    identityProvider: createIdentityProvider(),
    schema: {
      versioned: versioned,
      validateStandingsPayload: validateStandingsPayload,
      validateActivityPayload: validateActivityPayload,
      validateRewardData: validateRewardData,
      validateMissionData: validateMissionData,
      validateDailyState: validateDailyState,
      validateMissedHistoryPayload: validateMissedHistoryPayload,
    },
    sections: {
      setState: setSectionState,
      saveSnapshot: saveSectionSnapshot,
      restoreSnapshot: restoreSectionSnapshot,
      showFallback: showFallback,
    },
    disclosureStorageKey: DISCLOSURE_STORAGE_KEY,
    createRenderController: createRenderController,
  });
})();
