(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var BASE = cfg.BASE_URL || '';
  var KEY = 'moonboys_faction_status_v1';

  var LIVE_FACTION_ORDER = Object.freeze([
    'hard-fork-rockers',
    'rugpull-miners',
    'graffpunks',
    'blockchain-furies',
    'crypto-moongirls',
    'blockstars',
    'all-city-bulls',
    'nomad-bears',
    'crypto-stoned-boys',
  ]);

  var FACTIONS = {
    'hard-fork-rockers': { key: 'hard-fork-rockers', label: 'Hard Fork Rockers', icon: '🪨', color: '#56dcff', bonus: '+endurance stability and streak protection' },
    'rugpull-miners': { key: 'rugpull-miners', label: 'Rugpull Miners', icon: '⛏️', color: '#ff6ad5', bonus: '+defensive recovery and shield support' },
    graffpunks: { key: 'graffpunks', label: 'GraffPUNKS', icon: '🎨', color: '#7dff72', bonus: '+chaos bursts and combo pressure' },
    'blockchain-furies': { key: 'blockchain-furies', label: 'Blockchain Furies', icon: '🔥', color: '#ff9f43', bonus: '+speed pressure and revenge momentum' },
    'crypto-moongirls': { key: 'crypto-moongirls', label: 'Crypto Moongirls', icon: '🌙', color: '#b88dff', bonus: '+precision control and penalty resistance' },
    blockstars: { key: 'blockstars', label: 'The Blockstars', icon: '⭐', color: '#ffd166', bonus: '+featured clout tracks and spotlight scoring' },
    'all-city-bulls': { key: 'all-city-bulls', label: 'All City Bulls', icon: '🐂', color: '#ff6b6b', bonus: '+score pressure and war push' },
    'nomad-bears': { key: 'nomad-bears', label: 'Nomad Bears', icon: '🐻', color: '#8ecf7a', bonus: '+route variety and consistency rewards' },
    'crypto-stoned-boys': { key: 'crypto-stoned-boys', label: 'Crypto Stoned Boys', icon: '😶‍🌫️', color: '#8fd3ff', bonus: '+chill streak comfort and random branch luck' },
    unaligned: { key: 'unaligned', label: 'Unaligned', icon: '◌', color: '#7f8a96', bonus: 'No faction bonus active' },
  };

  var FACTION_ALIASES = Object.freeze({
    'diamond-hands': 'hard-fork-rockers',
    diamond_hands: 'hard-fork-rockers',
    diamondhands: 'hard-fork-rockers',
    'hodl-warriors': 'rugpull-miners',
    hodl_warriors: 'rugpull-miners',
    hodlwarriors: 'rugpull-miners',
    'rugpull-minors': 'rugpull-miners',
    rugpull_minors: 'rugpull-miners',
    rugpullminors: 'rugpull-miners',
    'graff-punks': 'graffpunks',
    graff_punks: 'graffpunks',
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function dispatchUiState(name, detail) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function emitToBus(event, payload) {
    var bus = window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.emit === 'function') bus.emit(event, payload || {});
  }

  function normalizeFaction(value) {
    var v = String(value || '').toLowerCase().trim();
    if (FACTION_ALIASES[v]) return FACTION_ALIASES[v];
    if (FACTIONS[v]) return v;
    return 'unaligned';
  }

  function getAuth() {
    var gate = window.MOONBOYS_IDENTITY;
    return gate && typeof gate.getTelegramAuth === 'function' ? gate.getTelegramAuth() : null;
  }

  function getIdentityTelegramId() {
    var gate = window.MOONBOYS_IDENTITY;
    if (!gate || typeof gate.getTelegramId !== 'function') return null;
    var id = gate.getTelegramId();
    return id == null ? null : String(id);
  }

  async function getSignedTelegramAuthWithRestore() {
    var gate = window.MOONBOYS_IDENTITY;
    if (!gate) return null;
    var freshAuth = typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
    if (freshAuth) return freshAuth;
    if (typeof gate.restoreLinkedTelegramAuth !== 'function') return null;
    var restored = await gate.restoreLinkedTelegramAuth().catch(function () { return null; });
    if (restored && restored.ok && restored.telegram_auth) return restored.telegram_auth;
    return typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
  }

  function isLinked() {
    var gate = window.MOONBOYS_IDENTITY;
    return !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
  }

  function getCachedStatus() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      parsed.faction = normalizeFaction(parsed.faction);
      var cachedTelegramId = parsed.telegram_id == null ? null : String(parsed.telegram_id);
      var identityTelegramId = getIdentityTelegramId();
      if (identityTelegramId && cachedTelegramId && cachedTelegramId !== identityTelegramId) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function setCachedStatus(status) {
    try {
      var next = Object.assign({}, status || {});
      if (next.telegram_id == null) {
        var identityTelegramId = getIdentityTelegramId();
        if (identityTelegramId) next.telegram_id = identityTelegramId;
      }
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  function clearCachedStatus() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  async function request(path, init) {
    if (!BASE) throw new Error('API unavailable');
    var res = await fetch(BASE + path, init || {});
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var error = new Error((data && data.message) || data.error || ('HTTP ' + res.status));
      error.status = res.status;
      error.code = data.error || null;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function loadStatus() {
    var auth = await getSignedTelegramAuthWithRestore();
    if (!auth) return getCachedStatus() || { faction: 'unaligned', faction_xp: 0, bonuses: FACTIONS.unaligned };
    var data = await request('/faction/status?telegram_auth=' + encodeURIComponent(JSON.stringify(auth)));
    var faction = normalizeFaction(data.faction);
    var bonuses = data.bonuses || {};
    var payload = {
      telegram_id: auth && auth.id != null ? String(auth.id) : getIdentityTelegramId(),
      faction: faction,
      faction_xp: Number(data.faction_xp) || 0,
      season_key: data.season_key || null,
      bonuses: {
        icon: bonuses.icon || FACTIONS[faction].icon,
        color: bonuses.color || FACTIONS[faction].color,
        bonus: bonuses.bonus || FACTIONS[faction].bonus,
      },
      cooldown_ms_remaining: Math.max(0, Number(data.cooldown_ms_remaining) || 0),
    };
    setCachedStatus(payload);
    dispatchUiState('moonboys:faction-status', { ...payload, source: 'load', ts: Date.now() });
    emitToBus('faction:update', { faction: payload.faction, faction_xp: payload.faction_xp, source: 'load', ts: Date.now() });
    return payload;
  }

  async function joinFaction(faction) {
    var auth = await getSignedTelegramAuthWithRestore();
    if (!auth) throw new Error('Telegram auth required');
    var target = normalizeFaction(faction);
    if (target === 'unaligned') throw new Error('Invalid faction');
    var data = await request('/faction/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth, faction: target }),
    });
    var cooldownMs = Math.max(0, Number(data && data.cooldown_ms) || 0);
    var payload = {
      telegram_id: auth && auth.id != null ? String(auth.id) : getIdentityTelegramId(),
      faction: normalizeFaction(data.faction),
      faction_xp: Number(data.faction_xp) || 0,
      season_key: data.season_key || null,
      bonuses: data.bonuses || FACTIONS[normalizeFaction(data.faction)],
      cooldown_ms: cooldownMs,
      cooldown_ms_remaining: 0,
    };
    setCachedStatus(payload);
    dispatchUiState('moonboys:faction-boost', { faction: payload.faction, amount: 0, source: 'join', ts: Date.now() });
    emitToBus('faction:update', { faction: payload.faction, faction_xp: payload.faction_xp, source: 'join', ts: Date.now() });
    return data;
  }

  async function earnFactionXp(source, baseXp) {
    var auth = await getSignedTelegramAuthWithRestore();
    if (!auth) return null;
    var priorStatus = getCachedStatus();
    var data = await request('/faction/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth, source: source || 'score_accept', base_xp: Math.max(0, Math.floor(Number(baseXp) || 0)) }),
    });
    var payload = {
      telegram_id: auth && auth.id != null ? String(auth.id) : getIdentityTelegramId(),
      faction: normalizeFaction(data.faction),
      faction_xp: Number(data.faction_xp_total) || 0,
      season_key: data.season_key || (priorStatus && priorStatus.season_key) || null,
      bonuses: data.bonuses || FACTIONS[normalizeFaction(data.faction)],
      cooldown_ms_remaining: 0,
    };
    var xpAmount = Number(data.faction_xp_awarded || data.faction_xp_delta || baseXp || 0);
    setCachedStatus(payload);
    dispatchUiState('moonboys:faction-boost', {
      faction: payload.faction,
      amount: xpAmount,
      total: payload.faction_xp,
      source: source || 'score_accept',
      ts: Date.now(),
    });
    emitToBus('faction:update', { faction: payload.faction, faction_xp: payload.faction_xp, amount: xpAmount, source: source || 'score_accept', ts: Date.now() });
    return data;
  }

  function getVisualMeta(faction) {
    var key = normalizeFaction(faction);
    return FACTIONS[key] || FACTIONS.unaligned;
  }

  function renderPlayerCard(status, opts) {
    var s = status || getCachedStatus() || { faction: 'unaligned', faction_xp: 0, bonuses: FACTIONS.unaligned };
    var faction = getVisualMeta(s.faction);
    var linked = isLinked();
    var unaligned = faction.key === 'unaligned';
    var glowClass = linked && !unaligned ? ' faction-state--active sync-live' : ' faction-state--dim';
    var joinPrompt = unaligned ? '<div class="faction-join-prompt">Choose a faction to unlock missions, clout, perks, and Battle Chamber proof.</div>' : '';
    var actions = (opts && opts.showJoinActions && unaligned)
      ? '<div class="faction-join-actions">' + LIVE_FACTION_ORDER.map(function (key) {
          var meta = FACTIONS[key];
          return '<button class="faction-join-btn interactive" data-faction="' + esc(meta.key) + '">Join ' + esc(meta.label) + '</button>';
        }).join('') + '</div>'
      : '';

    return '' +
      '<div class="faction-player-card interactive ' + glowClass + (linked ? ' player-online' : ' player-offline') + '" style="--faction-color:' + esc(faction.color) + '">' +
        '<div class="faction-player-title">Player Alignment</div>' +
        '<div class="faction-player-row"><span>Faction:</span><strong>' + (unaligned ? 'No faction selected yet' : esc(faction.icon + ' ' + faction.label)) + '</strong></div>' +
        (unaligned ? '' : '<div class="faction-player-row"><span>Faction XP:</span><strong>' + (Number(s.faction_xp) || 0) + '</strong></div>') +
        '<div class="faction-player-row"><span>Bonus:</span><strong>' + esc((s.bonuses && s.bonuses.bonus) || faction.bonus) + '</strong></div>' +
        joinPrompt + actions +
      '</div>';
  }

  window.MOONBOYS_FACTION = {
    normalizeFaction: normalizeFaction,
    getVisualMeta: getVisualMeta,
    getCachedStatus: getCachedStatus,
    clearCachedStatus: clearCachedStatus,
    loadStatus: loadStatus,
    joinFaction: joinFaction,
    earnFactionXp: earnFactionXp,
    renderPlayerCard: renderPlayerCard,
  };
})();
