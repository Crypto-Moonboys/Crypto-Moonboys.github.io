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

// ── Internal emit ────────────────────────────────────────────────────────────

function _bus() {
  return (typeof window !== 'undefined') && window.MOONBOYS_EVENT_BUS || null;
}

function _emit(type, payload) {
  var detail = Object.assign({ type: type, ts: Date.now() }, payload || {});
  var b = _bus();
  if (b && typeof b.emit === 'function') {
    b.emit('faction:activity', detail);
  }
  // Also notify local subscribers directly so HUD updates even without bus
  var snapshot = _feedHandlers.slice();
  for (var i = 0; i < snapshot.length; i++) {
    try { snapshot[i](detail); } catch (_) {}
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
    text:    _factionLabel(factionId) + ' +'  + amt + ' war power',
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
  // Also subscribe to bus events from external emitters
  var b = _bus();
  if (b && typeof b.on === 'function') {
    b.on('faction:activity', handler);
    b.on('faction:mission:complete', function (d) {
      handler(Object.assign({ type: 'mission_complete', text: '✅ ' + (d.label || 'Mission complete') }, d));
    });
    b.on('faction:war:contribution', function (d) {
      handler(Object.assign({ type: 'faction_gain', text: _factionLabel(d.faction) + ' +' + (d.amount || 0) + ' war power' }, d));
    });
    b.on('faction:streak:update', function (d) {
      handler(Object.assign({ type: 'streak', text: '🔥 ' + (d.type || '') + ' streak: day ' + (d.count || 1) }, d));
    });
  }
}

/**
 * Unsubscribe from the activity feed.
 * @param {Function} handler
 */
export function unsubscribeActivityFeed(handler) {
  _feedHandlers = _feedHandlers.filter(function (h) { return h !== handler; });
  var b = _bus();
  if (b && typeof b.off === 'function') {
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
