/**
 * Crypto Moonboys — Global Player Header
 * ========================================
 * Unified player-state badge/strip across all core pages.
 * Reuses MOONBOYS_STATUS_PANEL for all data fetching and rendering.
 * Does NOT duplicate XP fetch logic.
 *
 * Behaviour:
 *   - On pages WITH #site-header  : MOONBOYS_STATUS_PANEL auto-injects the
 *     compact badge there; this module exposes the public API only.
 *   - On pages WITHOUT #site-header: injects a compact fixed top-right badge
 *     using MOONBOYS_STATUS_PANEL.mountBadge().
 *
 * Public API:
 *   window.MOONBOYS_GLOBAL_HEADER.refresh()
 *   window.MOONBOYS_GLOBAL_HEADER.mount(elementOrId)      // full status panel
 *   window.MOONBOYS_GLOBAL_HEADER.mountBadge(elementOrId) // compact badge
 *
 * Load order (all pages):
 *   /js/api-config.js
 *   /js/identity-gate.js
 *   /js/faction-alignment.js                    (optional — enhances faction row)
 *   /js/components/connection-status-panel.js   (MOONBOYS_STATUS_PANEL)
 *   /js/components/global-player-header.js      ← this file
 *
 * XP labels enforced across all render paths:
 *   Score         = leaderboard ranking
 *   Arcade XP     = multiplayer gate progress (Block Topia entry)
 *   Block Topia XP = in-game progression only
 *   Faction       = faction alignment only
 */
(function () {
  'use strict';

  var FIXED_BADGE_ID = 'moonboys-global-header-fixed-badge';
  var FIXED_BADGE_STYLE_ID = 'moonboys-global-header-fixed-style';

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getStatusPanel() {
    return window.MOONBOYS_STATUS_PANEL || null;
  }

  function injectFixedBadgeStyles() {
    if (document.getElementById(FIXED_BADGE_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = FIXED_BADGE_STYLE_ID;
    style.textContent =
      '#' + FIXED_BADGE_ID + '{' +
        'position:fixed;top:10px;right:10px;z-index:9999;' +
        'max-width:340px;pointer-events:auto;' +
      '}';
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * For pages that have no wiki #site-header (e.g. Block Topia gate),
   * inject a compact fixed badge at top-right so the player always sees
   * their Telegram link state, Arcade XP, and Block Topia access.
   */
  function injectFixedBadge() {
    // If there is a wiki-shell header, MOONBOYS_STATUS_PANEL already injects
    // the badge inside it — no duplicate needed.
    if (document.getElementById('site-header')) return;
    // Already injected.
    if (document.getElementById(FIXED_BADGE_ID)) return;
    // Global badge already present (injected by CSP via #site-header fallback).
    if (document.getElementById('moonboys-global-status-badge')) return;

    injectFixedBadgeStyles();
    var wrap = document.createElement('div');
    wrap.id = FIXED_BADGE_ID;
    wrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(wrap);

    var panel = getStatusPanel();
    if (panel) {
      panel.mountBadge(wrap);
    }
  }

  // ── Public API delegates ────────────────────────────────────────────────

  function refresh() {
    var panel = getStatusPanel();
    if (panel) panel.refresh();
  }

  function mount(containerOrId) {
    var panel = getStatusPanel();
    if (panel) return panel.mount(containerOrId);
  }

  function mountBadge(containerOrId) {
    var panel = getStatusPanel();
    if (panel) return panel.mountBadge(containerOrId);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────

  function bootstrap() {
    injectFixedBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  window.MOONBOYS_GLOBAL_HEADER = {
    refresh: refresh,
    mount: mount,
    mountBadge: mountBadge,
  };

}());
