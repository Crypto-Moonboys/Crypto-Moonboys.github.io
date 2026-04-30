/**
 * Crypto Moonboys — Dev Debug Panel
 * ===================================
 * Floating overlay that shows live MOONBOYS_STATE data for local development.
 *
 * Renders only on localhost / 127.0.0.1 — a no-op in production.
 *
 * Displays:
 *   - Current state (xp, faction, updatedAt)
 *   - Last event
 *   - Active subscriber count
 *
 * Load order: must appear AFTER moonboys-state.js so that MOONBOYS_STATE
 * is available when this file executes.
 */
(function () {
  'use strict';

  // ── Dev guard ──────────────────────────────────────────────────────────────
  // Only activate on localhost / 127.0.0.1. Production pages are untouched.
  var hostname = (typeof location !== 'undefined') ? location.hostname : '';
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;

  var PANEL_ID = 'moonboys-debug-panel';
  var STYLE_ID = PANEL_ID + '-style';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatLastEvent(lastEvent) {
    if (lastEvent === null || lastEvent === undefined) return 'null';
    if (typeof lastEvent === 'object') {
      try { return JSON.stringify(lastEvent); } catch (_) { return String(lastEvent); }
    }
    return String(lastEvent);
  }

  // ── HTML builder ───────────────────────────────────────────────────────────

  function buildContentHTML(state) {
    var ms = window.MOONBOYS_STATE;
    var subscriberCount = (ms && typeof ms.getSubscriberCount === 'function')
      ? ms.getSubscriberCount()
      : '—';
    var updatedAtStr = state.updatedAt
      ? new Date(state.updatedAt).toLocaleTimeString()
      : '—';
    return (
      '<div class="mbdp-row">' +
        '<span class="mbdp-label">XP</span>' +
        '<span class="mbdp-val">' + esc(String(state.xp)) + '</span>' +
      '</div>' +
      '<div class="mbdp-row">' +
        '<span class="mbdp-label">Faction</span>' +
        '<span class="mbdp-val">' + esc(state.faction) + '</span>' +
      '</div>' +
      '<div class="mbdp-row">' +
        '<span class="mbdp-label">Last Event</span>' +
        '<span class="mbdp-val">' + esc(formatLastEvent(state.lastEvent)) + '</span>' +
      '</div>' +
      '<div class="mbdp-row">' +
        '<span class="mbdp-label">Subscribers</span>' +
        '<span class="mbdp-val">' + esc(String(subscriberCount)) + '</span>' +
      '</div>' +
      '<div class="mbdp-row">' +
        '<span class="mbdp-label">Updated</span>' +
        '<span class="mbdp-val">' + esc(updatedAtStr) + '</span>' +
      '</div>'
    );
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + PANEL_ID + '{' +
        'position:fixed;bottom:12px;right:12px;z-index:99999;' +
        'background:rgba(8,18,34,.96);' +
        'border:1px solid rgba(86,220,255,.45);border-radius:10px;' +
        'padding:10px 14px 12px;font-family:monospace;font-size:.75rem;' +
        'color:#c8f0ff;min-width:200px;max-width:280px;pointer-events:auto;' +
        'box-shadow:0 4px 24px rgba(0,0,0,.5);' +
      '}',
      '#' + PANEL_ID + ' .mbdp-title{' +
        'font-weight:700;color:#56dcff;margin-bottom:8px;font-size:.68rem;' +
        'text-transform:uppercase;letter-spacing:.08em;padding-right:16px;' +
      '}',
      '#' + PANEL_ID + ' .mbdp-row{display:flex;gap:8px;margin-bottom:4px;align-items:baseline}',
      '#' + PANEL_ID + ' .mbdp-label{color:#8b949e;min-width:76px;flex-shrink:0;font-size:.7rem}',
      '#' + PANEL_ID + ' .mbdp-val{color:#e6f0ff;word-break:break-all}',
      '#' + PANEL_ID + ' .mbdp-close{' +
        'position:absolute;top:6px;right:8px;cursor:pointer;color:#8b949e;' +
        'font-size:1rem;line-height:1;background:none;border:none;padding:0;' +
        'font-family:monospace;' +
      '}',
      '#' + PANEL_ID + ' .mbdp-close:hover{color:#f85149}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Mount ──────────────────────────────────────────────────────────────────

  function mount() {
    if (document.getElementById(PANEL_ID)) return;

    var ms = window.MOONBOYS_STATE;
    if (!ms || typeof ms.getState !== 'function') {
      console.warn('[moonboys-debug-panel] MOONBOYS_STATE not available — debug panel skipped.');
      return;
    }

    injectStyles();

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-label', 'Moonboys state debug panel');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'mbdp-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.setAttribute('aria-label', 'Close debug panel');
    closeBtn.addEventListener('click', function () { panel.remove(); });

    var title = document.createElement('div');
    title.className = 'mbdp-title';
    title.textContent = '\uD83D\uDEE0 MOONBOYS_STATE [dev]';

    var content = document.createElement('div');
    content.className = 'mbdp-content';
    content.innerHTML = buildContentHTML(ms.getState());

    panel.appendChild(closeBtn);
    panel.appendChild(title);
    panel.appendChild(content);
    document.body.appendChild(panel);

    // Subscribe to MOONBOYS_STATE for live in-place updates.
    ms.subscribe(function (state) {
      content.innerHTML = buildContentHTML(state);
    });
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // Expose so developers can re-mount the panel if they closed it.

  window.MOONBOYS_DEBUG_PANEL = { mount: mount };

}());
