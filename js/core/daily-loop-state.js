/**
 * Crypto Moonboys - UTC Daily Loop Frontend Singleton
 * ==================================================
 * One shared frontend fetch layer for the Worker-owned /daily-loop/state
 * authority. Widgets must consume this singleton instead of independently
 * calling the aggregator endpoint.
 */
(function () {
  'use strict';

  if (window.MOONBOYS_DAILY_LOOP && typeof window.MOONBOYS_DAILY_LOOP.getState === 'function') return;

  var ENDPOINT = '/daily-loop/state';
  var FETCH_TIMEOUT_MS = 8000;
  var REFRESH_EVENTS = [
    'moonboys:sync-state',
    'moonboys:score-updated',
    'moonboys:faction-status',
    'moonboys:faction-boost',
    'moonboys:wtf-event-checkin',
    'moonboys:wtf-event-complete',
    'moonboys:roguelite-options-unlocked',
    'battle-chamber:activity-ready',
    'moonboys:wiki-mission-complete',
    'moonboys:wiki-mission-completed',
  ];

  var _state = null;
  var _subscribers = [];
  var _inflight = null;
  var _inflightKey = null;
  var _cacheKey = null;
  var _invalidatedReason = null;
  var _lastFetchStatus = 'idle';

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    if (!value || typeof value !== 'object') return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function getApiBase() {
    var cfg = window.MOONBOYS_API || {};
    if (typeof cfg.getApiBase === 'function') {
      return String(cfg.getApiBase({ mode: 'write' }) || '').replace(/\/$/, '');
    }
    return String(cfg.BASE_URL || '').replace(/\/$/, '');
  }

  function getIdentity() {
    return window.MOONBOYS_IDENTITY || null;
  }

  function isLinked() {
    var gate = getIdentity();
    return !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
  }

  function getTelegramId() {
    var gate = getIdentity();
    if (!gate || typeof gate.getTelegramId !== 'function') return null;
    return gate.getTelegramId();
  }

  async function getFreshAuth(options) {
    var gate = getIdentity();
    if (!gate) return null;
    if (typeof gate.getFreshTelegramAuth === 'function') {
      return gate.getFreshTelegramAuth(options || {});
    }
    var auth = typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
    if (auth) return auth;
    if (typeof gate.restoreLinkedTelegramAuth === 'function') {
      var restored = await gate.restoreLinkedTelegramAuth(options || {}).catch(function () { return null; });
      if (restored && restored.ok && restored.telegram_auth) return restored.telegram_auth;
    }
    return typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
  }

  function authCacheKey(auth, linked) {
    if (!auth) return linked ? 'linked:auth_required:' + String(getTelegramId() || 'unknown') : 'anonymous';
    return 'linked:' + String(auth.id || auth.telegram_id || getTelegramId() || 'unknown');
  }

  function currentUtcDay() {
    return new Date().toISOString().slice(0, 10);
  }

  function buildCacheKey(auth, linked) {
    return currentUtcDay() + '|' + authCacheKey(auth, linked);
  }

  async function resolveRequestContext(options) {
    var opts = options || {};
    var apiBase = getApiBase();
    if (!apiBase) throw new Error('daily_loop_api_unavailable');

    var linked = isLinked();
    var auth = linked ? await getFreshAuth({ force: !!opts.forceAuth }) : null;
    var authState = linked && !auth ? 'auth_required' : (auth ? 'linked' : 'anonymous');
    return {
      apiBase: apiBase,
      linked: linked,
      auth: auth,
      authState: authState,
      key: buildCacheKey(auth, linked),
    };
  }

  function normalizeState(payload, fetchStatus, authState) {
    var next = payload && typeof payload === 'object' ? clone(payload) : {};
    next.fetched_at = nowIso();
    next.fetch_status = fetchStatus || 'ok';
    next.source_status = next.source_status && typeof next.source_status === 'object' ? next.source_status : {};
    if (!next.identity || typeof next.identity !== 'object') next.identity = {};
    if (authState === 'auth_required') {
      next.identity.linked = false;
      next.identity.auth_mode = 'auth_required';
      next.identity.relink_required = true;
      next.identity.message = 'Telegram-linked state requires fresh signed auth; anonymous daily-loop state shown.';
    }
    return next;
  }

  function emitBus(eventName, detail) {
    var bus = window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.emit === 'function') {
      try { bus.emit(eventName, detail || {}); } catch (_) {}
    }
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function notify(eventName, detail) {
    var payload = detail || { state: clone(_state) };
    emitBus(eventName, payload);
    if (eventName === 'daily-loop:ready') dispatch('moonboys:daily-loop-ready', payload);
    if (eventName === 'daily-loop:update') dispatch('moonboys:daily-loop-update', payload);
    if (eventName === 'daily-loop:error') dispatch('moonboys:daily-loop-error', payload);
    var snapshot = clone(_state);
    _subscribers.slice().forEach(function (callback) {
      try { callback(snapshot); } catch (error) { console.warn('[daily-loop-state] subscriber error:', error); }
    });
  }

  function setState(next, eventName) {
    _state = next;
    _lastFetchStatus = next && next.fetch_status ? next.fetch_status : 'ok';
    notify(eventName || 'daily-loop:update', { state: clone(_state) });
    return clone(_state);
  }

  function errorState(error) {
    var message = error && error.message ? error.message : String(error || 'daily_loop_fetch_failed');
    var previous = _state && typeof _state === 'object' ? clone(_state) : {};
    previous.fetch_status = 'error';
    previous.fetched_at = nowIso();
    previous.error = message;
    previous.source_status = previous.source_status || {};
    previous.source_status.daily_loop = { state: 'query_failed', source: 'frontend_singleton', error: message };
    return previous;
  }

  async function fetchState(context, options) {
    var opts = options || {};
    var auth = context.auth;
    var authState = context.authState;
    var key = context.key;

    if (!opts.force && !_invalidatedReason && _state && _cacheKey === key && _state.utc_day === currentUtcDay()) {
      return clone(_state);
    }

    _cacheKey = key;
    _lastFetchStatus = 'loading';
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    var request = auth
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_auth: auth }),
          signal: controller.signal,
        }
      : { method: 'GET', signal: controller.signal };

    try {
      var res = await fetch(context.apiBase + ENDPOINT, request);
      var payload = await res.json().catch(function () { return {}; });
      if (!res.ok || !payload || payload.ok === false) {
        throw new Error(payload && payload.error ? payload.error : 'daily_loop_http_' + String(res.status || 0));
      }
      _invalidatedReason = null;
      var nextState = normalizeState(payload, 'ok', authState);
      if (_inflightKey !== key) return clone(nextState);
      return setState(nextState, _state ? 'daily-loop:update' : 'daily-loop:ready');
    } catch (error) {
      var next = errorState(error);
      if (_inflightKey !== key) return clone(next);
      _lastFetchStatus = 'error';
      _state = next;
      notify('daily-loop:error', { state: clone(next), error: next.error });
      return clone(_state);
    } finally {
      clearTimeout(timer);
      if (_inflightKey === key) {
        _inflight = null;
        _inflightKey = null;
      }
    }
  }

  async function refresh(options) {
    var opts = options || {};
    var context;
    try {
      context = await resolveRequestContext(opts);
    } catch (error) {
      return setState(errorState(error), 'daily-loop:error');
    }
    if (_inflight && _inflightKey === context.key) return _inflight;
    _inflightKey = context.key;
    _inflight = fetchState(context, opts);
    return _inflight;
  }

  function getState(options) {
    var expectedMode = isLinked() ? '|linked:' : '|anonymous';
    if (
      _state &&
      !(options && options.force) &&
      !_invalidatedReason &&
      _cacheKey &&
      _cacheKey.indexOf(currentUtcDay() + expectedMode) === 0
    ) {
      return Promise.resolve(clone(_state));
    }
    return refresh(options || {});
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return function () {};
    if (_subscribers.indexOf(callback) === -1) _subscribers.push(callback);
    if (_state) {
      try { callback(clone(_state)); } catch (_) {}
    }
    return function () {
      _subscribers = _subscribers.filter(function (item) { return item !== callback; });
    };
  }

  function invalidate(reason) {
    _invalidatedReason = reason || 'manual';
    _cacheKey = null;
    emitBus('daily-loop:stale', { reason: _invalidatedReason, state: clone(_state) });
    refresh({ force: true, reason: _invalidatedReason });
  }

  function isReady() {
    return !!(_state && _state.fetch_status === 'ok');
  }

  window.MOONBOYS_DAILY_LOOP = {
    getState: getState,
    refresh: refresh,
    subscribe: subscribe,
    invalidate: invalidate,
    isReady: isReady,
  };

  REFRESH_EVENTS.forEach(function (eventName) {
    window.addEventListener(eventName, function () {
      invalidate(eventName);
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { refresh(); }, { once: true });
  } else {
    refresh();
  }
}());
