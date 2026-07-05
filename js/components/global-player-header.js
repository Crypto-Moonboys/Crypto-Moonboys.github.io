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
 * autoMountActivityPanel() does NOT run unless the page opts in via
 * <body data-auto-las-panel="true">.  The personal live feed / faction ops
 * panel belongs in the right rail (site-shell.js) only; this module must not
 * auto-create it globally.
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
  var HEADER_BADGE_ID = 'moonboys-global-status-badge';
  var HEADER_NAV_ID = 'global-nav';
  var HEADER_BADGE_STYLE_ID = 'moonboys-header-status-dock-style';
  var _headerBadgeObserver = null;
  var _headerBadgeDockPending = false;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getStatusPanel() {
    return window.MOONBOYS_STATUS_PANEL || null;
  }

  function nextFrame(fn) {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(fn);
      return;
    }
    window.setTimeout(fn, 0);
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

  function injectHeaderBadgeDockStyles() {
    if (document.getElementById(HEADER_BADGE_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = HEADER_BADGE_STYLE_ID;
    style.textContent = [
      '@media (min-width:1121px){',
      '  #site-header{grid-template-columns:minmax(180px,auto) minmax(220px,1fr) auto minmax(0,auto);}',
      '  #site-header>.site-logo{grid-column:1;grid-row:1;}',
      '  #site-header>#header-search{grid-column:2;grid-row:1;}',
      '  #site-header>#' + HEADER_BADGE_ID + '{grid-column:3;grid-row:1;align-self:center;justify-self:start;margin-left:0;min-width:0;}',
      '  #site-header>#' + HEADER_NAV_ID + '{grid-column:4;grid-row:1;}',
      '}',
      '#' + HEADER_BADGE_ID + '{display:flex;align-items:center;min-width:0;}',
      '#' + HEADER_BADGE_ID + ' .csp-badge{max-width:min(280px,24vw);}',
      '#' + HEADER_BADGE_ID + ' .csp-badge-chip{display:none!important;}',
      '@media (max-width:1120px){',
      '  #site-header>#' + HEADER_BADGE_ID + '{grid-column:1 / -1;justify-self:start;margin-left:0;}',
      '  #' + HEADER_BADGE_ID + ' .csp-badge{max-width:100%;}',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function stripHeaderBadgeChips() {
    var badge = document.getElementById(HEADER_BADGE_ID);
    if (!badge) return;
    badge.querySelectorAll('.csp-badge-chip').forEach(function (chip) {
      chip.remove();
    });
  }

  function dockHeaderBadge() {
    injectHeaderBadgeDockStyles();
    var header = document.getElementById('site-header');
    var nav = document.getElementById(HEADER_NAV_ID);
    var badge = document.getElementById(HEADER_BADGE_ID);

    if (header && nav && badge && badge.parentElement === header && badge.nextElementSibling !== nav) {
      header.insertBefore(badge, nav);
    }

    stripHeaderBadgeChips();
  }

  function scheduleHeaderBadgeDock() {
    if (_headerBadgeDockPending) return;
    _headerBadgeDockPending = true;
    nextFrame(function () {
      _headerBadgeDockPending = false;
      dockHeaderBadge();
    });
  }

  function observeHeaderBadgeDock() {
    if (_headerBadgeObserver || typeof MutationObserver !== 'function') return;
    _headerBadgeObserver = new MutationObserver(scheduleHeaderBadgeDock);
    _headerBadgeObserver.observe(document.body, { childList: true, subtree: true });
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
    if (document.getElementById(HEADER_BADGE_ID)) return;

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
    scheduleHeaderBadgeDock();
  }

  function mount(containerOrId) {
    var panel = getStatusPanel();
    if (panel) return panel.mount(containerOrId);
  }

  function mountBadge(containerOrId) {
    var panel = getStatusPanel();
    return panel ? panel.mountBadge(containerOrId).then(function (result) {
      scheduleHeaderBadgeDock();
      return result;
    }) : undefined;
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────
  /**
   * Auto-mounts a [data-las-panel] element only when the page explicitly opts in
   * via <body data-auto-las-panel="true">.
   *
   * The personal live feed / faction ops panel belongs in the right rail only
   * (site-shell.js already injects one there).  Auto-creating it globally would
   * reintroduce player live panels outside the intended right rail.
   *
   * Pages that genuinely need an auto-mounted LAS panel outside the right rail
   * must set <body data-auto-las-panel="true"> to opt in explicitly.
   */
  function autoMountActivityPanel() {
    if (document.querySelector('[data-las-panel]')) return; // already present
    // Only auto-create if the page has opted in.
    if (document.body && document.body.dataset.autoLasPanel !== 'true') return;
    var wrap = document.createElement('div');
    wrap.setAttribute('data-las-panel', '');
    wrap.style.marginBottom = '12px';
    var header = document.getElementById('site-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(wrap, header.nextSibling);
    }
    var las = window.MOONBOYS_LIVE_ACTIVITY;
    if (las && typeof las.mount === 'function') las.mount(wrap);
  }

  function bootstrap() {
    injectFixedBadge();
    dockHeaderBadge();
    observeHeaderBadgeDock();
    // Defer panel creation by one task to guarantee live-activity-summary.js
    // has already bootstrapped and set window.MOONBOYS_LIVE_ACTIVITY.  Both
    // scripts load synchronously in the same <head>, but LAS bootstraps via
    // DOMContentLoaded too; the deferred call runs after all DOMContentLoaded
    // handlers, ensuring LAS.mount() is callable.
    setTimeout(autoMountActivityPanel, 0);
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
