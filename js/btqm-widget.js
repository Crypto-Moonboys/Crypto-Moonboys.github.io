/**
 * Block Topia Quest Maze — Homepage / Community Widget
 * =====================================================
 * Reads the `btqm_widget_v1` key written by the game into localStorage
 * and renders live daily-quest progress into any element with
 * `data-btqm-widget` attribute or an explicit target element ID.
 *
 * Usage (homepage Daily Missions box):
 *   <div id="btqm-missions-widget"></div>
 *   <script src="/js/btqm-widget.js"></script>
 *
 * Usage (community page Lore Quests box):
 *   <div id="btqm-lore-widget"></div>
 *   <script src="/js/btqm-widget.js"></script>
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'btqm_widget_v1';

  var ZONE_NAMES = [
    'HODL or FOLD',
    'Bear Market Siege',
    'FOMO Plague Escape',
    'Rug Pull Recovery',
    "Whale Lord's Challenge",
    'Moon Mission',
  ];

  var ZONE_ACCENT = ['#4caf50', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#f39c12'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readWidgetData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  /** Render the "Daily Missions" flavour (compact, 2-column style). */
  function renderMissions(el, data) {
    var clears   = data.dailyClears || 0;
    var total    = 6;
    var score    = data.dailyScore  || 0;
    var fullClear = data.fullClear  || false;
    var name     = esc(data.playerName || 'Guest');
    var zoneClears = Array.isArray(data.zoneClears) ? data.zoneClears : Array(6).fill(false);

    var progressPct = Math.round((clears / total) * 100);

    var zoneIcons = zoneClears.map(function (cleared, i) {
      var col = cleared ? ZONE_ACCENT[i] : '#444';
      var bg  = cleared ? 'rgba(' + hexToRgb(ZONE_ACCENT[i]) + ',0.15)' : 'rgba(255,255,255,0.04)';
      return '<span title="' + esc(ZONE_NAMES[i]) + '" style="'
        + 'display:inline-flex;align-items:center;justify-content:center;'
        + 'width:26px;height:26px;border-radius:4px;border:1px solid ' + col + ';'
        + 'background:' + bg + ';font-size:0.7em;font-weight:bold;color:' + col + ';'
        + 'font-family:monospace;">'
        + (cleared ? '✓' : String(i + 1))
        + '</span>';
    }).join('');

    var bonusBadge = fullClear
      ? '<span style="display:inline-block;background:rgba(243,156,18,0.2);color:#f39c12;'
        + 'border:1px solid rgba(243,156,18,0.4);border-radius:10px;padding:1px 8px;'
        + 'font-size:0.72em;font-weight:bold;margin-left:6px;">2× FULL CLEAR!</span>'
      : '';

    var progressBar = '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin:8px 0;">'
      + '<div style="height:100%;width:' + progressPct + '%;background:linear-gradient(90deg,#f39c12,#e67e22);border-radius:3px;transition:width .4s;"></div>'
      + '</div>';

    el.innerHTML = '<div style="font-size:0.82em;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
      + '<span style="color:var(--color-text-muted,#aaa);">Player: <strong style="color:var(--color-text,#eee);">' + name + '</strong></span>'
      + '<span style="color:#74b9ff;font-family:monospace;font-size:0.9em;">Score: ' + score + bonusBadge + '</span>'
      + '</div>'
      + '<div style="display:flex;gap:5px;align-items:center;margin-bottom:4px;">'
      + zoneIcons
      + '<span style="margin-left:auto;color:var(--color-text-muted,#888);font-size:0.85em;">' + clears + '/' + total + ' today</span>'
      + '</div>'
      + progressBar
      + '<a href="/games/block-topia-quest-maze.html" '
      + 'style="display:inline-block;margin-top:6px;padding:5px 14px;background:#f39c12;color:#000;'
      + 'border-radius:4px;font-weight:bold;font-size:0.85em;text-decoration:none;font-family:monospace;">'
      + (clears === 0 ? '▶ Start Daily Quest' : clears < 6 ? '▶ Continue Quest (' + clears + '/6)' : '⭐ Full Clear! Play Again')
      + '</a>'
      + '</div>';
  }

  /** Render the "Lore Quests" flavour (community page, quest-list style). */
  function renderLoreQuests(el, data) {
    var zoneClears = Array.isArray(data.zoneClears) ? data.zoneClears : Array(6).fill(false);
    var name = esc(data.playerName || 'Guest');
    var score = data.dailyScore || 0;
    var fullClear = data.fullClear || false;

    var rows = ZONE_NAMES.map(function (zoneName, i) {
      var cleared = zoneClears[i];
      var accent  = ZONE_ACCENT[i];
      return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;'
        + 'border-bottom:1px solid rgba(255,255,255,0.06);">'
        + '<span style="width:22px;height:22px;border-radius:3px;border:1px solid ' + accent + ';'
        + 'display:inline-flex;align-items:center;justify-content:center;'
        + 'background:' + (cleared ? 'rgba(' + hexToRgb(accent) + ',0.2)' : 'rgba(255,255,255,0.03)') + ';'
        + 'font-size:0.7em;font-weight:bold;color:' + (cleared ? accent : '#555') + ';font-family:monospace;">'
        + (cleared ? '✓' : String(i + 1))
        + '</span>'
        + '<span style="flex:1;font-size:0.84em;color:' + (cleared ? 'var(--color-text,#eee)' : 'var(--color-text-muted,#888)') + ';">'
        + esc(zoneName)
        + '</span>'
        + (cleared ? '<span style="font-size:0.72em;color:' + accent + ';">CLEARED</span>' : '')
        + '</div>';
    }).join('');

    var header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<span style="font-size:0.82em;color:var(--color-text-muted,#aaa);">Hero: <strong style="color:var(--color-text,#eee);">' + name + '</strong></span>'
      + (fullClear ? '<span style="font-size:0.75em;color:#f39c12;font-weight:bold;">2× FULL CLEAR!</span>' : '<span style="font-size:0.75em;color:#74b9ff;">Score: ' + score + '</span>')
      + '</div>';

    var cta = '<a href="/games/block-topia-quest-maze.html" '
      + 'style="display:block;margin-top:10px;padding:6px;text-align:center;'
      + 'background:rgba(243,156,18,0.1);border:1px solid rgba(243,156,18,0.3);'
      + 'border-radius:4px;color:#f39c12;font-size:0.82em;font-weight:bold;'
      + 'text-decoration:none;font-family:monospace;">▶ Play Block Topia Quest Maze</a>';

    el.innerHTML = header + rows + cta;
  }

  /** Render a "not played yet" placeholder. */
  function renderPlaceholder(el, isMissions) {
    if (isMissions) {
      el.innerHTML = '<div style="font-size:0.82em;">'
        + '<div style="display:flex;gap:5px;margin-bottom:8px;">'
        + ZONE_NAMES.map(function (n, i) {
            return '<span title="' + esc(n) + '" style="display:inline-flex;align-items:center;justify-content:center;'
              + 'width:26px;height:26px;border-radius:4px;border:1px solid #444;'
              + 'background:rgba(255,255,255,0.04);font-size:0.7em;font-weight:bold;color:#444;font-family:monospace;">'
              + String(i + 1) + '</span>';
          }).join('')
        + '</div>'
        + '<a href="/games/block-topia-quest-maze.html" '
        + 'style="display:inline-block;padding:5px 14px;background:#f39c12;color:#000;'
        + 'border-radius:4px;font-weight:bold;font-size:0.85em;text-decoration:none;font-family:monospace;">'
        + '▶ Start Daily Quest'
        + '</a>'
        + '</div>';
    } else {
      el.innerHTML = '<div style="font-size:0.82em;color:var(--color-text-muted,#888);">'
        + '<p style="margin:0 0 8px;">Complete the 6 daily quest zones in Block Topia. All 6 in 24h = double points!</p>'
        + '<a href="/games/block-topia-quest-maze.html" '
        + 'style="display:inline-block;padding:6px 14px;background:rgba(243,156,18,0.15);'
        + 'border:1px solid rgba(243,156,18,0.35);border-radius:4px;color:#f39c12;'
        + 'font-weight:bold;font-size:0.85em;text-decoration:none;font-family:monospace;">'
        + '▶ Enter Block Topia'
        + '</a>'
        + '</div>';
    }
  }

  /** hex color string '#RRGGBB' or hex number → 'R,G,B' for rgba() */
  function hexToRgb(hex) {
    var n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  }

  /** Mount widget into a single element. */
  function mount(el) {
    var isMissions = el.id === 'btqm-missions-widget' || el.getAttribute('data-btqm-style') === 'missions';
    var data = readWidgetData();
    if (!data) {
      renderPlaceholder(el, isMissions);
      return;
    }
    if (isMissions) {
      renderMissions(el, data);
    } else {
      renderLoreQuests(el, data);
    }
  }

  /** Mount all target elements when DOM is ready. */
  function init() {
    var targets = [];

    // Explicit ID targets
    ['btqm-missions-widget', 'btqm-lore-widget'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) targets.push(el);
    });

    // Any element with data-btqm-widget attribute
    document.querySelectorAll('[data-btqm-widget]').forEach(function (el) {
      if (targets.indexOf(el) === -1) targets.push(el);
    });

    targets.forEach(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
