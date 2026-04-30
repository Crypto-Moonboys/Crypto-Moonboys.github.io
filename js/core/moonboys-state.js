/**
 * Crypto Moonboys — Authoritative State Singleton
 * =================================================
 * Provides a persistent, hydrated, subscribable state store for
 * cross-component XP, faction, and event data.
 *
 * Exposes window.MOONBOYS_STATE with:
 *   getState()          — returns a shallow copy of the current state
 *   setState(partial)   — merges partial into state, persists, notifies subscribers
 *   subscribe(callback) — registers a callback, returns an unsubscribe function
 *   hydrateState()      — async: restore from localStorage then fetch API if linked
 *
 * Internal state shape:
 *   { xp: 0, faction: 'unaligned', lastEvent: null, updatedAt: 0 }
 *
 * Load order: must appear AFTER global-event-bus.js so that
 * MOONBOYS_EVENT_BUS is already available when this file executes.
 *
 * localStorage key: moonboys_state_v1
 */
(function () {
  'use strict';

  // Guard: allow only one instance.
  if (window.MOONBOYS_STATE && typeof window.MOONBOYS_STATE.getState === 'function') return;

  var STORAGE_KEY = 'moonboys_state_v1';

  var DEFAULT_STATE = { xp: 0, faction: 'unaligned', lastEvent: null, updatedAt: 0 };

  // ── Internal state ──────────────────────────────────────────────────────────

  var _state = Object.assign({}, DEFAULT_STATE);
  var _subscribers = [];

  // ── localStorage helpers ────────────────────────────────────────────────────

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (_) {}
  }

  function _restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      // Validate shape: must be an object with expected fields.
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.xp !== 'number' ||
        typeof parsed.faction !== 'string'
      ) {
        return false;
      }
      _state = {
        xp:         typeof parsed.xp === 'number'    ? parsed.xp        : DEFAULT_STATE.xp,
        faction:    typeof parsed.faction === 'string' ? parsed.faction  : DEFAULT_STATE.faction,
        lastEvent:  parsed.lastEvent !== undefined    ? parsed.lastEvent : DEFAULT_STATE.lastEvent,
        updatedAt:  typeof parsed.updatedAt === 'number' ? parsed.updatedAt : DEFAULT_STATE.updatedAt,
      };
      return true;
    } catch (_) {
      return false;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  function getState() {
    return Object.assign({}, _state);
  }

  function setState(partial) {
    if (!partial || typeof partial !== 'object') return;
    Object.assign(_state, partial);
    _state.updatedAt = Date.now();
    _save();
    // Notify subscribers with a copy to prevent mutation.
    var copy = Object.assign({}, _state);
    for (var i = 0; i < _subscribers.length; i++) {
      try { _subscribers[i](copy); } catch (e) {
        console.warn('[moonboys-state] subscriber error:', e);
      }
    }
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return function () {};
    _subscribers.push(callback);
    return function () {
      _subscribers = _subscribers.filter(function (cb) { return cb !== callback; });
    };
  }

  // ── Hydration ───────────────────────────────────────────────────────────────

  /**
   * Hydrate MOONBOYS_STATE from the API if the user is linked.
   * 1. Sync restore from localStorage (already done on module load).
   * 2. If user is linked, fetch /blocktopia/progression and /faction status.
   * 3. Call setState() with real values so all subscribers update immediately.
   *
   * This is idempotent — safe to call multiple times (will not re-fetch once
   * progression data has already been loaded into state for this session).
   */
  var _hydrated = false;

  function hydrateState() {
    if (_hydrated) return Promise.resolve(getState());
    _hydrated = true;

    var gate = window.MOONBOYS_IDENTITY || null;
    var apiBase = (window.MOONBOYS_API && window.MOONBOYS_API.BASE_URL) || '';

    if (!gate || !apiBase) return Promise.resolve(getState());

    return (async function () {
      var telegramAuth = null;

      if (typeof gate.getSignedTelegramAuth === 'function') {
        telegramAuth = gate.getSignedTelegramAuth();
      }
      if (!telegramAuth && typeof gate.restoreLinkedTelegramAuth === 'function') {
        try {
          var restored = await gate.restoreLinkedTelegramAuth();
          telegramAuth = restored && restored.ok ? restored.telegram_auth : null;
        } catch (_) {}
      }

      if (!telegramAuth) return getState();

      // Fetch XP from progression endpoint (same as connection-status-panel).
      try {
        var res = await fetch(apiBase + '/blocktopia/progression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_auth: telegramAuth }),
        });
        var payload = await res.json().catch(function () { return {}; });
        if (res.ok && payload && payload.ok === true && payload.progression) {
          var prog = payload.progression;
          setState({
            xp: Math.max(0, Math.floor(Number(prog.arcade_xp_total) || 0)),
          });
        }
      } catch (_) {}

      // Faction is managed by MOONBOYS_FACTION; subscribe to bus for updates.
      // Snapshot current cached faction if available.
      var fa = window.MOONBOYS_FACTION;
      if (fa && typeof fa.getCachedStatus === 'function') {
        var cachedFaction = fa.getCachedStatus();
        if (cachedFaction && cachedFaction.faction && cachedFaction.faction !== 'unaligned') {
          setState({ faction: cachedFaction.faction });
        }
      }

      return getState();
    }());
  }

  // ── Bus integration ─────────────────────────────────────────────────────────
  // Hook into MOONBOYS_EVENT_BUS so every bus event keeps state in sync.
  // global-event-bus.js is guaranteed to have run before this file.

  var bus = window.MOONBOYS_EVENT_BUS;
  if (bus) {
    bus.on('xp:update', function (d) {
      var currentXp = _state.xp;
      var newXp = (typeof d.total === 'number' && d.total > 0)
        ? d.total
        : (typeof d.amount === 'number' && d.amount > 0 ? currentXp + d.amount : currentXp);
      setState({ xp: newXp, lastEvent: 'xp' });
    });

    bus.on('faction:update', function (d) {
      if (d.faction && d.faction !== 'unaligned') {
        setState({ faction: d.faction, lastEvent: 'faction' });
      }
    });

    bus.on('activity:event', function (d) {
      setState({ lastEvent: d });
    });
  }

  // ── Initialise ──────────────────────────────────────────────────────────────
  // Restore persisted state synchronously so components get real values on mount.
  _restore();

  // ── Publish ─────────────────────────────────────────────────────────────────
  window.MOONBOYS_STATE = { getState: getState, setState: setState, subscribe: subscribe, hydrateState: hydrateState };

  // Run hydration once the page is ready (non-blocking; UI renders with cached state first).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hydrateState(); });
  } else {
    // Use setTimeout to defer after synchronous script execution so all
    // other components (CSP, header) have a chance to register their subscribers.
    setTimeout(function () { hydrateState(); }, 0);
  }

}());
