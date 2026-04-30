/**
 * faction-hud.js — Lightweight faction HUD panel for arcade game pages.
 *
 * Renders a collapsible panel showing:
 *   • Active faction + rank badge
 *   • Active faction bonuses
 *   • Current daily rotation label
 *   • Today's mission progress (count / 3 completed)
 *   • Small live activity ticker (last 5 events, no blocking modal)
 *
 * Usage (in each game page's <script type="module">):
 *   import { mountFactionHud } from '/js/arcade/ui/faction-hud.js';
 *   mountFactionHud();
 *
 * The panel is entirely display-side.  It never calls game code or alters
 * any scoring/XP/submission logic.  All animations are CSS transitions only.
 */

import {
  getFactionEffects,
  getPlayerFaction,
} from '/js/arcade/systems/faction-effect-system.js';

import {
  getDailyRotation,
} from '/js/arcade/systems/global-rotation-system.js';

import {
  getDailyMissions,
  getCompletedMissions,
} from '/js/arcade/systems/faction-missions.js';

import {
  getFactionRank,
} from '/js/arcade/systems/faction-ranks.js';

import {
  subscribeActivityFeed,
} from '/js/arcade/systems/live-activity.js';

// ── CSS ───────────────────────────────────────────────────────────────────────

var _cssInjected = false;

function _injectStyles() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  var style = document.createElement('style');
  style.id = 'faction-hud-styles';
  style.textContent = [
    '#faction-hud{margin-top:12px;background:rgba(255,255,255,.03);border:1px solid var(--color-border,#333);border-radius:16px;padding:0;overflow:hidden;font-family:inherit}',
    '#faction-hud .fh-header{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;cursor:pointer;user-select:none;border-bottom:1px solid transparent;transition:border-color .2s}',
    '#faction-hud .fh-header:hover{border-bottom-color:var(--color-border,#333)}',
    '#faction-hud .fh-title{font-weight:700;font-size:.82rem;letter-spacing:.05em;color:var(--faction-color,#f7c948)}',
    '#faction-hud .fh-toggle{background:none;border:none;color:var(--color-text-muted,#888);cursor:pointer;font-size:.8rem;padding:0 2px;line-height:1}',
    '#faction-hud .fh-body{padding:10px 14px 12px}',
    '#faction-hud .fh-row{display:flex;align-items:baseline;gap:6px;margin-bottom:4px;font-size:.78rem}',
    '#faction-hud .fh-label{color:var(--color-text-muted,#888);min-width:72px;flex-shrink:0}',
    '#faction-hud .fh-val{color:var(--color-text,#e6edf3);flex:1}',
    '#faction-hud .fh-val--bonus{color:var(--faction-color,#f7c948)}',
    '#faction-hud .fh-val--rotation{color:#56dcff}',
    '#faction-hud .fh-val--rank{font-weight:700}',
    '#faction-hud .fh-ticker{margin-top:8px;padding-top:7px;border-top:1px solid var(--color-border,#2a2a2a);max-height:80px;overflow:hidden}',
    '#faction-hud .fh-tick-row{font-size:.73rem;color:var(--color-text-muted,#888);padding:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .3s}',
    '#faction-hud .fh-tick-row.fh-tick-new{color:#e6edf3;opacity:1}',
    '#faction-hud .fh-mission-bar{display:flex;gap:4px;align-items:center;margin-top:2px}',
    '#faction-hud .fh-mission-dot{width:10px;height:10px;border-radius:50%;border:1px solid var(--color-border,#444)}',
    '#faction-hud .fh-mission-dot.done{background:var(--faction-color,#f7c948);border-color:var(--faction-color,#f7c948)}',
    '#faction-hud .fh-mission-dot.pending{background:transparent}',
  ].join('');
  document.head.appendChild(style);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _factionColor(id) {
  var colors = {
    'diamond-hands': '#56dcff',
    'hodl-warriors': '#ff6ad5',
    graffpunks:      '#7dff72',
    unaligned:       '#8b949e',
  };
  return colors[String(id || 'unaligned')] || '#8b949e';
}

// ── Ticker ────────────────────────────────────────────────────────────────────

var _ticker = [];
var _tickerEl = null;
var TICKER_MAX = 5;

function _addTickerItem(text) {
  _ticker.unshift({ text: text, ts: Date.now() });
  if (_ticker.length > TICKER_MAX) _ticker.length = TICKER_MAX;
  _renderTicker();
}

function _renderTicker() {
  if (!_tickerEl) return;
  _tickerEl.innerHTML = _ticker.map(function (item, i) {
    return '<div class="fh-tick-row' + (i === 0 ? ' fh-tick-new' : '') + '">'
      + _esc(item.text) + '</div>';
  }).join('');
}

// ── Build HTML ────────────────────────────────────────────────────────────────

function _buildHtml(factionId, fx, rotation, missionsDone, total, rank) {
  var color    = _factionColor(factionId);
  var rankText = rank.badge + ' ' + rank.label;
  var nextText = rank.next
    ? 'Next: ' + rank.next.label + ' (' + rank.next.threshold + ' power)'
    : 'Max rank';

  var dots = '';
  for (var i = 0; i < total; i++) {
    dots += '<span class="fh-mission-dot ' + (i < missionsDone ? 'done' : 'pending') + '"></span>';
  }

  return [
    '<div class="fh-header" role="button" tabindex="0" aria-expanded="true" id="fh-toggle-btn">',
      '<span class="fh-title">⚡ Faction</span>',
      '<button class="fh-toggle interactive" aria-label="Toggle faction HUD" id="fh-collapse-btn">▲</button>',
    '</div>',
    '<div class="fh-body" id="fh-body">',
      '<div class="fh-row">',
        '<span class="fh-label">Faction</span>',
        '<span class="fh-val">' + _esc(fx.label || factionId) + '</span>',
      '</div>',
      fx.bonusText ? (
        '<div class="fh-row">'
        + '<span class="fh-label">Bonus</span>'
        + '<span class="fh-val fh-val--bonus">' + _esc(fx.bonusText) + '</span>'
        + '</div>'
      ) : '',
      '<div class="fh-row">',
        '<span class="fh-label">Rank</span>',
        '<span class="fh-val fh-val--rank" style="color:' + _esc(color) + '">' + _esc(rankText) + '</span>',
      '</div>',
      '<div class="fh-row">',
        '<span class="fh-label"></span>',
        '<span class="fh-val" style="font-size:.7rem;color:#8b949e">' + _esc(nextText) + '</span>',
      '</div>',
      '<div class="fh-row">',
        '<span class="fh-label">Rotation</span>',
        '<span class="fh-val fh-val--rotation">' + _esc(rotation.label || '—') + '</span>',
      '</div>',
      '<div class="fh-row">',
        '<span class="fh-label">Missions</span>',
        '<div class="fh-val"><div class="fh-mission-bar" aria-label="' + missionsDone + ' of ' + total + ' missions done">' + dots + '</div></div>',
      '</div>',
      '<div class="fh-ticker" id="fh-ticker"></div>',
    '</div>',
  ].join('');
}

// ── Mount ─────────────────────────────────────────────────────────────────────

var _mounted = false;

/**
 * Mount the faction HUD panel.
 * Inserts a collapsible panel after the modifier panel (or after the game
 * card if the modifier panel is absent).
 *
 * Safe to call multiple times — only mounts once per page.
 */
export function mountFactionHud() {
  if (_mounted || typeof document === 'undefined') return;

  function _doMount() {
    if (_mounted) return;
    _mounted = true;
    _injectStyles();

    var factionId = getPlayerFaction();
    var fx        = getFactionEffects(factionId);
    var rotation, missions, completed, rank;

    try { rotation  = getDailyRotation(); } catch (_) { rotation = { label: '—' }; }
    try { missions  = getDailyMissions(factionId); } catch (_) { missions = []; }
    try { completed = getCompletedMissions(factionId); } catch (_) { completed = []; }
    try { rank      = getFactionRank(factionId); } catch (_) { rank = { badge: '◌', label: 'Recruit', next: null }; }

    var total      = missions.length || 3;
    var doneCount  = completed.length;
    var color      = _factionColor(factionId);

    var panel = document.createElement('div');
    panel.id = 'faction-hud';
    panel.style.setProperty('--faction-color', color);
    panel.innerHTML = _buildHtml(factionId, fx, rotation, doneCount, total, rank);

    // Inject after modifier panel if present, else after .game-card
    var anchor = document.getElementById('cm-modifier-panel')
      || document.querySelector('.game-card');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    } else {
      var main = document.querySelector('main') || document.body;
      if (main) main.appendChild(panel);
    }

    // Wire collapse toggle
    var toggleBtn = panel.querySelector('#fh-collapse-btn');
    var body      = panel.querySelector('#fh-body');
    var header    = panel.querySelector('#fh-toggle-btn');
    var collapsed = false;

    function _toggle() {
      collapsed = !collapsed;
      if (body) body.style.display = collapsed ? 'none' : '';
      if (toggleBtn) toggleBtn.textContent = collapsed ? '▼' : '▲';
      if (header) header.setAttribute('aria-expanded', String(!collapsed));
    }

    if (toggleBtn) toggleBtn.addEventListener('click', function (e) { e.stopPropagation(); _toggle(); });
    if (header)    header.addEventListener('click', _toggle);

    // Wire live ticker
    _tickerEl = panel.querySelector('#fh-ticker');
    subscribeActivityFeed(function (detail) {
      if (detail && detail.text) _addTickerItem(detail.text);
    });

    // Listen for faction updates to refresh the HUD
    var bus = (typeof window !== 'undefined') && window.MOONBOYS_EVENT_BUS;
    if (bus && typeof bus.on === 'function') {
      bus.on('faction:update', function () {
        var nextFaction = getPlayerFaction();
        var nextFx      = getFactionEffects(nextFaction);
        var nextColor   = _factionColor(nextFaction);
        panel.style.setProperty('--faction-color', nextColor);
        var bonusEl = panel.querySelector('.fh-val--bonus');
        if (bonusEl) bonusEl.textContent = nextFx.bonusText || '';
        var factionValEl = panel.querySelector('.fh-val');
        if (factionValEl) factionValEl.textContent = nextFx.label || nextFaction;
      });
      bus.on('faction:mission:complete', function () {
        try {
          var newFaction   = getPlayerFaction();
          var newCompleted = getCompletedMissions(newFaction);
          var bars = panel.querySelectorAll('.fh-mission-dot');
          bars.forEach(function (dot, i) {
            dot.className = 'fh-mission-dot ' + (i < newCompleted.length ? 'done' : 'pending');
          });
        } catch (_) {}
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _doMount, { once: true });
  } else {
    _doMount();
  }
}
