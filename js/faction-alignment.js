(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var BASE = cfg.BASE_URL || '';
  var KEY = 'moonboys_faction_status_v1';

  var FACTIONS = {
    'diamond-hands': { key: 'diamond-hands', label: 'Diamond Hands', icon: '💎', color: '#56dcff', bonus: '+XP stability (less decay, better long-term gain)' },
    'hodl-warriors': { key: 'hodl-warriors', label: 'HODL Warriors', icon: '⚔️', color: '#ff6ad5', bonus: '+combat rewards and XP bursts' },
    graffpunks: { key: 'graffpunks', label: 'GraffPUNKS', icon: '🎨', color: '#7dff72', bonus: '+event rewards and mission bonuses' },
    unaligned: { key: 'unaligned', label: 'Unaligned', icon: '◌', color: '#7f8a96', bonus: 'No faction bonus active' },
  };

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
    if (v === 'diamond_hands' || v === 'diamondhands') return 'diamond-hands';
    if (v === 'hodl_warriors' || v === 'hodlwarriors') return 'hodl-warriors';
    if (v === 'graff-punks' || v === 'graff_punks') return 'graffpunks';
    if (FACTIONS[v]) return v;
    return 'unaligned';
  }

  function getAuth() {
    var gate = window.MOONBOYS_IDENTITY;
    return gate && typeof gate.getTelegramAuth === 'function' ? gate.getTelegramAuth() : null;
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
      return parsed;
    } catch {
      return null;
    }
  }

  function setCachedStatus(status) {
    try { localStorage.setItem(KEY, JSON.stringify(status || {})); } catch {}
  }

  async function request(path, init) {
    if (!BASE) throw new Error('API unavailable');
    var res = await fetch(BASE + path, init || {});
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  async function loadStatus() {
    var auth = getAuth();
    if (!auth) return getCachedStatus() || { faction: 'unaligned', faction_xp: 0, bonuses: FACTIONS.unaligned };
    var data = await request('/faction/status?telegram_auth=' + encodeURIComponent(JSON.stringify(auth)));
    var faction = normalizeFaction(data.faction);
    var bonuses = data.bonuses || {};
    var payload = {
      faction: faction,
      faction_xp: Number(data.faction_xp) || 0,
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
    var auth = getAuth();
    if (!auth) throw new Error('Telegram auth required');
    var target = normalizeFaction(faction);
    if (target === 'unaligned') throw new Error('Invalid faction');
    var data = await request('/faction/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth, faction: target }),
    });
    var payload = {
      faction: normalizeFaction(data.faction),
      faction_xp: Number(data.faction_xp) || 0,
      bonuses: data.bonuses || FACTIONS[normalizeFaction(data.faction)],
      cooldown_ms_remaining: Number(data.cooldown_ms) || 0,
    };
    setCachedStatus(payload);
    dispatchUiState('moonboys:faction-boost', { faction: payload.faction, amount: 0, source: 'join', ts: Date.now() });
    emitToBus('faction:update', { faction: payload.faction, faction_xp: payload.faction_xp, source: 'join', ts: Date.now() });
    return data;
  }

  async function earnFactionXp(source, baseXp) {
    var auth = getAuth();
    if (!auth) return null;
    var data = await request('/faction/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth, source: source || 'score_accept', base_xp: Math.max(0, Math.floor(Number(baseXp) || 0)) }),
    });
    var payload = {
      faction: normalizeFaction(data.faction),
      faction_xp: Number(data.faction_xp_total) || 0,
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
    var joinPrompt = unaligned ? '<div class="faction-join-prompt">Choose a faction to unlock alignment bonuses.</div>' : '';
    var actions = (opts && opts.showJoinActions && unaligned)
      ? '<div class="faction-join-actions">' +
          '<button class="faction-join-btn interactive" data-faction="diamond-hands">Join Diamond Hands</button>' +
          '<button class="faction-join-btn interactive" data-faction="hodl-warriors">Join HODL Warriors</button>' +
          '<button class="faction-join-btn interactive" data-faction="graffpunks">Join GraffPUNKS</button>' +
        '</div>'
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
    loadStatus: loadStatus,
    joinFaction: joinFaction,
    earnFactionXp: earnFactionXp,
    renderPlayerCard: renderPlayerCard,
  };
})();
