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
 *   { xp: 0, faction: 'unaligned', lastEvent: null, updatedAt: 0, sync: null,
 *     linked: false, source: 'guest', syncedAt: null }
 *
 * Internal state shape:
 *   { xp: 0, faction: 'unaligned', lastEvent: null, updatedAt: 0, sync: null }
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

  var DEFAULT_STATE = { xp: 0, faction: 'unaligned', lastEvent: null, updatedAt: 0, sync: null, linked: false, source: 'guest', syncedAt: null };

  // ── Internal state ──────────────────────────────────────────────────────────

  var _state = Object.assign({}, DEFAULT_STATE);
  var _subscribers = [];

  // ── localStorage helpers ────────────────────────────────────────────────────

  function _save() {
    try {
      // Only persist stable state fields; session-only fields (sync, linked, source, syncedAt)
      // are re-established during hydration on each page load.
      var toSave = {
        xp:        _state.xp,
        faction:   _state.faction,
        lastEvent: _state.lastEvent,
        updatedAt: _state.updatedAt,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
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
        sync: null, // sync state is session-only; never restored from localStorage
        linked: false,  // re-established during hydration
        source: 'cache', // was persisted; will be upgraded to 'server' or marked 'guest' after hydration
        syncedAt: null,
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
    // ── Input validation ───────────────────────────────────────────────────────
    // Reject the entire update if any supplied field fails validation.
    // This prevents corrupted XP values or non-string factions from entering state.
    if ('xp' in partial) {
      if (!Number.isInteger(partial.xp) || partial.xp < 0) return;
    }
    if ('faction' in partial) {
      if (typeof partial.faction !== 'string') return;
    }
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
   * 2. If user is linked, fetch /blocktopia/progression and snapshot faction.
   * 3. Call setState() with real values so all subscribers update immediately.
   *
   * HYDRATION LOCK: _hydrated is set to true at the START of the first call.
   * After hydrateState() runs, state may only be updated via bus events
   * (xp:update, faction:update, activity:event).  No subsequent API call may
   * write to state.  Calling hydrateState() again is a no-op.
   */
  var _hydrated = false;

  function hydrateState() {
    if (_hydrated) return Promise.resolve(getState());
    // Lock immediately — prevents any concurrent or re-entrant call from
    // issuing a second fetch and overwriting live event-driven state.
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

      if (!telegramAuth) {
        setState({ linked: false, source: 'guest' });
        return getState();
      }

      // Fetch the authoritative XP value from the API.  This is the ONLY time
      // the API is consulted for state — all subsequent XP changes arrive via
      // bus events (xp:update) which update state through the bus listeners below.
      try {
        var res = await fetch(apiBase + '/blocktopia/progression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_auth: telegramAuth }),
        });
        var payload = await res.json().catch(function () { return {}; });
        if (res.ok && payload && payload.ok === true && payload.progression) {
          var prog = payload.progression;
          var incomingXp = Math.max(0, Math.floor(Number(prog.arcade_xp_total) || 0));
          // Only apply the API value if it is at least as high as the current
          // cached/live value.  This prevents a stale API response from rolling
          // back XP that has already been updated by in-session bus events.
          if (incomingXp >= _state.xp) {
            setState({ xp: incomingXp, linked: true, source: 'server', syncedAt: Date.now() });
          } else {
            setState({ linked: true, source: 'server', syncedAt: Date.now() });
          }
        }
      } catch (_) {}

      // Snapshot cached faction if available; subsequent faction changes arrive
      // exclusively via faction:update bus events.
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

  // ── Bus integration (SOLE write path post-hydration) ────────────────────────
  // After hydrateState() completes, ALL state changes must arrive through these
  // bus listeners.  No component may call setState() directly for XP or faction.
  // global-event-bus.js is guaranteed to have run before this file.

  var bus = window.MOONBOYS_EVENT_BUS;
  if (bus) {
    bus.on('xp:update', function (d) {
      var currentXp = _state.xp;
      var newXp = (typeof d.total === 'number' && d.total > 0)
        ? d.total
        : (typeof d.amount === 'number' && d.amount > 0 ? currentXp + d.amount : currentXp);
      // Dedup guard: skip if XP hasn't changed to prevent redundant writes and
      // duplicate subscriber notifications.
      if (newXp === currentXp) return;
      setState({ xp: newXp, lastEvent: 'xp' });
    });

    bus.on('faction:update', function (d) {
      if (d.faction && d.faction !== 'unaligned') {
        setState({ faction: d.faction, lastEvent: 'faction' });
      }
    });

    // Bridge sync events into state so every MOONBOYS_STATE subscriber receives
    // live sync updates — UI components must read state.sync, not the raw bus.
    bus.on('sync:state', function (d) {
      setState({ sync: d });
    });

    bus.on('activity:event', function (d) {
      setState({ lastEvent: d });
    });
  }

  // ── Initialise ──────────────────────────────────────────────────────────────
  // Restore persisted state synchronously so components get real values on mount.
  _restore();

  // ── Publish ─────────────────────────────────────────────────────────────────
  // Frozen: only the named methods are accessible; direct property mutation
  // from external code is blocked at runtime.
  var _api = Object.freeze({
    getState: getState,
    setState: setState,
    subscribe: subscribe,
    hydrateState: hydrateState,
    /** Returns the current number of active state subscribers. Used by the
     *  dev debug panel and diagnostics; never call setState() from here. */
    getSubscriberCount: function () { return _subscribers.length; },
  });

  // Proxy wraps the frozen API to emit a console warning whenever external
  // code attempts a direct property write (e.g. window.MOONBOYS_STATE.xp = 5).
  // All property reads pass through transparently.
  window.MOONBOYS_STATE = (typeof Proxy !== 'undefined')
    ? new Proxy(_api, {
        set: function (target, prop) {
          console.warn(
            '[moonboys-state] Rejected direct write to window.MOONBOYS_STATE.' +
            String(prop) + '. Use setState() instead.'
          );
          return false; // signals the write was rejected
        },
      })
    : _api;

  // Run hydration once the page is ready (non-blocking; UI renders with cached state first).
  // When DOM is already loaded, defer to the next task (setTimeout 0) so that
  // synchronous script tags loaded after this file (CSP, header, LAS) have
  // executed and had a chance to register their state subscribers before the
  // first setState() call from hydrateState() fires.  This is safe because all
  // peer components are loaded from static <script> tags in the same HTML page,
  // which complete synchronously before any task-queue callbacks run.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hydrateState(); });
  } else {
    setTimeout(function () { hydrateState(); }, 0);
  }

}());
