/**
 * Crypto Moonboys — Global Event Bus
 * =====================================
 * Centralised pub/sub bridge for cross-component runtime state.
 * All XP, faction, activity, and sync events must flow through here so
 * every page component stays in sync without duplicating fetch logic.
 *
 * Unified event names:
 *   xp:update      — Arcade XP changed (bridged from moonboys:xp-gain)
 *   faction:update — Faction joined or changed (bridged from moonboys:faction-*)
 *   sync:state     — Telegram sync state changed (bridged from moonboys:sync-state)
 *   activity:event — General activity (score, XP, faction, notify)
 *
 * Usage:
 *   MOONBOYS_EVENT_BUS.on('xp:update', function(payload) { ... });
 *   MOONBOYS_EVENT_BUS.emit('xp:update', { amount: 5, total: 55 });
 *   MOONBOYS_EVENT_BUS.off('xp:update', handler);
 *
 * Load order: must appear before faction-alignment.js and
 * connection-status-panel.js on every page.
 */
(function () {
  'use strict';

  // Guard: allow only one instance.
  if (window.MOONBOYS_EVENT_BUS) return;

  var _handlers = {};

  function on(event, handler) {
    if (typeof handler !== 'function') return;
    if (!_handlers[event]) _handlers[event] = [];
    if (_handlers[event].indexOf(handler) === -1) {
      _handlers[event].push(handler);
    }
  }

  function off(event, handler) {
    if (!_handlers[event]) return;
    _handlers[event] = _handlers[event].filter(function (h) { return h !== handler; });
  }

  function emit(event, payload) {
    var detail = payload || {};
    var handlers = (_handlers[event] || []).slice(); // snapshot before iteration
    for (var i = 0; i < handlers.length; i++) {
      try {
        handlers[i](detail);
      } catch (e) {
        console.warn('[event-bus] handler error on ' + event + ':', e);
      }
    }
  }

  // ── Bridge existing moonboys:* CustomEvents → unified names ──────────────
  // All existing code continues to dispatch moonboys:* events unchanged.
  // The bus listens and re-emits under the standardised names so new code
  // can use bus.on() without knowing the legacy event names.

  var BRIDGES = [
    { src: 'moonboys:xp-gain',       target: 'xp:update' },
    { src: 'moonboys:faction-status', target: 'faction:update' },
    { src: 'moonboys:faction-boost',  target: 'faction:update' },
    { src: 'moonboys:sync-state',     target: 'sync:state' },
    { src: 'moonboys:score-updated',  target: 'activity:event' },
    { src: 'moonboys:xp-gain',        target: 'activity:event' },
    { src: 'moonboys:faction-boost',  target: 'activity:event' },
    { src: 'moonboys:micro-notify',   target: 'activity:event' },
  ];

  BRIDGES.forEach(function (b) {
    window.addEventListener(b.src, function (e) {
      emit(b.target, Object.assign({ _src: b.src }, (e && e.detail) || {}));
    });
  });

  // ── Public API ─────────────────────────────────────────────────────────────
  window.MOONBOYS_EVENT_BUS = { on: on, off: off, emit: emit };

}());
