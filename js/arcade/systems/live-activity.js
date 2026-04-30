/**
 * live-activity.js — Faction gameplay activity emitter.
 *
 * Emits lightweight events to MOONBOYS_EVENT_BUS for:
 *   • faction gains
 *   • mission completions
 *   • rank unlocks
 *   • global rotation changes
 *   • faction dominance shifts
 *
 * This module does NOT own or render any UI.  It is a pure event emitter.
 * The faction HUD (faction-hud.js) subscribes to these events for display.
 * Existing live-activity-summary.js is unaffected.
 *
 * Public API:
 *   emitFactionGain(factionId, amount, source)
 *   emitMissionComplete(factionId, missionLabel, tier)
 *   emitRankUnlock(factionId, rankLabel)
 *   emitRotationChange(rotationLabel)
 *   emitDominanceShift(newDominantFaction)
 *   subscribeActivityFeed(handler)   — handler({ type, text, faction, ts })
 *   unsubscribeActivityFeed(handler)
 */

var _feedHandlers = [];

// Map<handler, { activity, missionWrapper, warWrapper, streakWrapper }>
// Tracks the per-handler bus wrappers so all four can be removed on unsubscribe.
var _busWrappers = typeof Map !== 'undefined' ? new Map() : null;

// ── Internal emit ────────────────────────────────────────────────────────────

function _bus() {
  return (typeof window !== 'undefined') && window.MOONBOYS_EVENT_BUS || null;
}

function _emit(type, payload) {
  var detail = Object.assign({ type: type, ts: Date.now() }, payload || {});
  var b = _bus();
  if (b && typeof b.emit === 'function') {
    // Bus exists — only emit via the bus.  Registered handlers receive events
    // through their bus.on() subscriptions; calling _feedHandlers directly here
    // would cause each handler to fire twice.
    b.emit('faction:activity', detail);
  } else {
    // No bus — notify local subscribers directly.
    var snapshot = _feedHandlers.slice();
    for (var i = 0; i < snapshot.length; i++) {
      try { snapshot[i](detail); } catch (_) {}
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Emit a faction gain event (score/contribution awarded to faction).
 * @param {string} factionId
 * @param {number} amount
 * @param {string} [source]  — e.g. 'score_submission', 'mission_complete'
 */
export function emitFactionGain(factionId, amount, source) {
  var amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (!amt) return;
  _emit('faction_gain', {
    faction: String(factionId || 'unaligned'),
    amount:  amt,
    source:  String(source || 'unknown'),
    text:    _factionLabel(factionId) + ' +' + amt + ' war power',
  });
}

/**
 * Emit a mission completion event.
 * @param {string} factionId
 * @param {string} missionLabel
 * @param {string} [tier]  — 'daily' | 'seasonal'
 */
export function emitMissionComplete(factionId, missionLabel, tier) {
  _emit('mission_complete', {
    faction: String(factionId || 'unaligned'),
    label:   String(missionLabel || ''),
    tier:    String(tier || 'daily'),
    text:    '✅ Mission: ' + String(missionLabel || 'Complete'),
  });
}

/**
 * Emit a rank unlock event.
 * @param {string} factionId
 * @param {string} rankLabel
 */
export function emitRankUnlock(factionId, rankLabel) {
  _emit('rank_unlock', {
    faction:   String(factionId || 'unaligned'),
    rankLabel: String(rankLabel || ''),
    text:      '🏅 Rank unlocked: ' + String(rankLabel || ''),
  });
}

/**
 * Emit a rotation change event (called when a new daily rotation begins).
 * @param {string} rotationLabel  — e.g. '⚡ High chaos · 🎨 GraffPUNKS featured'
 */
export function emitRotationChange(rotationLabel) {
  _emit('rotation_change', {
    label: String(rotationLabel || ''),
    text:  '🔄 Rotation: ' + String(rotationLabel || ''),
  });
}

/**
 * Emit a faction dominance shift event.
 * @param {string} newDominantFaction
 */
export function emitDominanceShift(newDominantFaction) {
  _emit('dominance_shift', {
    faction: String(newDominantFaction || 'unaligned'),
    text:    _factionLabel(newDominantFaction) + ' is now dominant',
  });
}

/**
 * Subscribe to the activity feed.
 * Handler receives: { type, text, faction, ts, ... }
 * @param {Function} handler
 */
export function subscribeActivityFeed(handler) {
  if (typeof handler !== 'function') return;
  if (_feedHandlers.indexOf(handler) === -1) {
    _feedHandlers.push(handler);
  }
  var b = _bus();
  if (!b || typeof b.on !== 'function') return;

  // Build dedicated wrapper functions so every one can be precisely removed.
  var missionWrapper = function (d) {
    handler(Object.assign({ type: 'mission_complete', text: '✅ ' + (d.label || 'Mission complete') }, d));
  };
  var warWrapper = function (d) {
    handler(Object.assign({ type: 'faction_gain', text: _factionLabel(d.faction) + ' +' + (d.amount || 0) + ' war power' }, d));
  };
  var streakWrapper = function (d) {
    handler(Object.assign({ type: 'streak', text: '🔥 ' + (d.type || '') + ' streak: day ' + (d.count || 1) }, d));
  };

  // faction:activity events are emitted by _emit() via the bus, so handler
  // itself is the correct listener — no wrapper needed.
  b.on('faction:activity',       handler);
  b.on('faction:mission:complete', missionWrapper);
  b.on('faction:war:contribution', warWrapper);
  b.on('faction:streak:update',   streakWrapper);

  // Track all four wrappers so unsubscribeActivityFeed can remove them all.
  if (_busWrappers) {
    _busWrappers.set(handler, {
      activity:       handler,
      missionWrapper: missionWrapper,
      warWrapper:     warWrapper,
      streakWrapper:  streakWrapper,
    });
  }
}

/**
 * Unsubscribe from the activity feed.
 * Removes the handler and ALL associated bus wrappers (4 events).
 * @param {Function} handler
 */
export function unsubscribeActivityFeed(handler) {
  _feedHandlers = _feedHandlers.filter(function (h) { return h !== handler; });
  var b = _bus();
  if (!b || typeof b.off !== 'function') return;

  var wrappers = _busWrappers && _busWrappers.get(handler);
  if (wrappers) {
    b.off('faction:activity',        wrappers.activity);
    b.off('faction:mission:complete', wrappers.missionWrapper);
    b.off('faction:war:contribution', wrappers.warWrapper);
    b.off('faction:streak:update',   wrappers.streakWrapper);
    _busWrappers.delete(handler);
  } else {
    // Fallback: try to remove the handler directly from faction:activity
    b.off('faction:activity', handler);
  }
}

// ── Helper ───────────────────────────────────────────────────────────────────

function _factionLabel(id) {
  var labels = {
    'diamond-hands': '💎 Diamond Hands',
    'hodl-warriors': '⚔️ HODL Warriors',
    graffpunks:      '🎨 GraffPUNKS',
  };
  return labels[String(id || '')] || String(id || 'Faction');
}
