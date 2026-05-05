/**
 * site-shell.js
 *
 * Synchronously builds and inserts the full site shell into <body>.
 * Runs as a plain <script> at the end of <body> (no defer/async).
 * By the time this runs, <main id="content"> is already in the DOM.
 * wiki.js (loaded after) handles all interactive event handlers.
 */
(function () {
  'use strict';

  /* ── 1. Grab existing <main> ─────────────────────────────────── */
  var main = document.getElementById('content');
  if (!main) return; // safety: bail if no content found

  /* ── 2. Skip-link ────────────────────────────────────────────── */
  var skipLink = document.createElement('a');
  skipLink.className = 'skip-link';
  skipLink.href = '#content';
  skipLink.textContent = 'Skip to content';

  /* ── 3. Header ───────────────────────────────────────────────── */
  var header = document.createElement('header');
  header.id = 'site-header';
  header.setAttribute('role', 'banner');
  header.innerHTML = [
    '<button class="hamburger" id="hamburger" aria-label="Toggle navigation"',
    '  aria-expanded="false" aria-controls="sidebar">☰</button>',
    '<a href="/index.html" class="site-logo" aria-label="The Crypto Moonboys GK Wiki home">',
    '  <img src="/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png" alt="" aria-hidden="true">',
    '  <span>',
    '    <span class="logo-text">THE CRYPTO MOONBOYS GK WIKI</span>',
    '    <span class="logo-sub">Living Web3 Wiki · Play. Earn. Build.</span>',
    '  </span>',
    '</a>',
    '<div id="header-search" role="search">',
    '  <input type="search" id="search-input" placeholder="Search the wiki…"',
    '    aria-label="Search" autocomplete="off">',
    '  <button id="search-btn" aria-label="Search">\uD83D\uDD0D</button>',
    '  <div id="search-results" role="listbox"></div>',
    '</div>',
    '<nav class="header-nav" aria-label="Main navigation">',
    '  <a href="/index.html">Home</a>',
    '</nav>',
  ].join('\n');

  /* ── 4. Sidebar overlay ──────────────────────────────────────── */
  var overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  /* ── 5. Sidebar nav ──────────────────────────────────────────── */
  var sidebar = document.createElement('nav');
  sidebar.id = 'sidebar';
  sidebar.setAttribute('aria-label', 'Wiki navigation');
  sidebar.innerHTML = [
    '<div class="sidebar-section">',
    '  <div class="sidebar-heading">Navigation</div>',
    '  <div class="sidebar-nav">',
    '    <a href="/index.html"><span class="nav-icon" aria-hidden="true">\u2302</span> Main Page</a>',
    '    <a href="/categories/index.html"><span class="nav-icon" aria-hidden="true">\u2261</span> All Categories</a>',
    '    <a href="/search.html"><span class="nav-icon" aria-hidden="true">\u25C8</span> All Articles</a>',
    '    <a href="/timeline.html"><span class="nav-icon" aria-hidden="true">\u25A4</span> Timeline</a>',
    '    <a href="/graph.html"><span class="nav-icon" aria-hidden="true">\u25CE</span> Entity Graph</a>',
    '    <a href="/dashboard.html"><span class="nav-icon" aria-hidden="true">\u25A6</span> Dashboard</a>',
    '    <a href="/sam.html"><span class="nav-icon" aria-hidden="true">\u2295</span> SAM</a>',
    '    <a href="/games/"><span class="nav-icon" aria-hidden="true">\u25C9</span> Arcade</a>',
    '    <a href="/how-to-play.html"><span class="nav-icon" aria-hidden="true">\u25C6</span> How to Play</a>',
    '    <a href="/gkniftyheads-incubator.html"><span class="nav-icon" aria-hidden="true">\u25B2</span> Incubator HUB</a>',
    '    <a href="/community.html"><span class="nav-icon" aria-hidden="true">\u2694</span> Battle Chamber</a>',
    '  </div>',
    '</div>',
    '<div class="sidebar-section">',
    '  <div class="sidebar-heading">HODL Wars Lore Grid</div>',
    '  <div class="sidebar-nav">',
    '    <a href="/wiki/hodl-wars.html"><span class="nav-icon" aria-hidden="true">\u2715</span> HODL WAR$</a>',
    '    <a href="/wiki/hodl-warriors.html"><span class="nav-icon" aria-hidden="true">\u25C6</span> HODL WARRIORS</a>',
    '    <a href="/wiki/diamond-hands.html"><span class="nav-icon" aria-hidden="true">\u25C7</span> Diamond Hands</a>',
    '    <a href="/wiki/paper-hands.html"><span class="nav-icon" aria-hidden="true">\u25AD</span> Paper Hands</a>',
    '    <a href="/wiki/whale-lords.html"><span class="nav-icon" aria-hidden="true">\u25B2</span> The Whale Lords</a>',
    '    <a href="/wiki/moon-mission.html"><span class="nav-icon" aria-hidden="true">\u2191</span> Moon Mission</a>',
    '    <a href="/wiki/the-great-dip.html"><span class="nav-icon" aria-hidden="true">\u25BC</span> The Great Dip</a>',
    '    <a href="/wiki/bear-market-siege.html"><span class="nav-icon" aria-hidden="true">\u25FC</span> Bear Market Siege</a>',
    '    <a href="/wiki/rug-pull-wars.html"><span class="nav-icon" aria-hidden="true">\u2717</span> Rug Pull Wars</a>',
    '    <a href="/wiki/satoshi-scroll.html"><span class="nav-icon" aria-hidden="true">\u2261</span> The Satoshi Scroll</a>',
    '    <a href="/wiki/fomo-plague.html"><span class="nav-icon" aria-hidden="true">\u25C9</span> The FOMO Plague</a>',
    '    <a href="/wiki/ngmi-chronicles.html"><span class="nav-icon" aria-hidden="true">\u2726</span> NGMI Chronicles</a>',
    '    <a href="/wiki/wagmi-prophecy.html"><span class="nav-icon" aria-hidden="true">\u2605</span> The WAGMI Prophecy</a>',
    '  </div>',
    '</div>',
    '<div class="sidebar-section">',
    '  <div class="sidebar-heading">GK Wiki Info</div>',
    '  <div class="sidebar-nav">',
    '    <a href="/about.html"><span class="nav-icon" aria-hidden="true">\u25C8</span> About</a>',
    '    <a href="/about.html#citation"><span class="nav-icon" aria-hidden="true">\u2261</span> Citation Policy</a>',
    '    <a href="/about.html#sources"><span class="nav-icon" aria-hidden="true">\u25CE</span> Source Types</a>',
    '  </div>',
    '</div>',
  ].join('\n');

  /* Arcade extra section */
  if (document.body.dataset.sidebarExtra === 'arcade') {
    var arcadeSection = document.createElement('div');
    arcadeSection.className = 'sidebar-section';
    arcadeSection.innerHTML = [
      '<div class="sidebar-heading">Arcade</div>',
      '<div class="sidebar-nav">',
      '  <a href="/games/leaderboard.html"><span class="nav-icon" aria-hidden="true">\u25A6</span> Leaderboard</a>',
      '  <a href="/games/invaders-3008/"><span class="nav-icon" aria-hidden="true">\u2715</span> Invaders 3008</a>',
      '  <a href="/games/pac-chain/"><span class="nav-icon" aria-hidden="true">\u25C9</span> Pac-Chain</a>',
      '  <a href="/games/asteroid-fork/"><span class="nav-icon" aria-hidden="true">\u25CE</span> Asteroid Fork</a>',
      '  <a href="/games/breakout-bullrun/"><span class="nav-icon" aria-hidden="true">\u25AD</span> Breakout Bullrun</a>',
      '  <a href="/games/tetris-block-topia/"><span class="nav-icon" aria-hidden="true">\u25A6</span> Tetris Block Topia</a>',
      '  <a href="/games/block-topia-quest-maze/"><span class="nav-icon" aria-hidden="true">\u25A4</span> Block Topia Quest Maze</a>',
      '  <a href="/games/crystal-quest/"><span class="nav-icon" aria-hidden="true">\u25C7</span> Crystal Quest</a>',
      '  <a href="/games/snake-run/"><span class="nav-icon" aria-hidden="true">\u2261</span> SnakeRun 3008</a>',
      '  <a href="/games/block-topia/"><span class="nav-icon" aria-hidden="true">\u25C8</span> Block Topia Multiplayer</a>',
      '</div>',
    ].join('\n');
    sidebar.appendChild(arcadeSection);
  }

  /* ── 6. Footer ───────────────────────────────────────────────── */
  var footer = document.createElement('footer');
  footer.id = 'site-footer';
  footer.setAttribute('role', 'contentinfo');
  footer.innerHTML = [
    '<div class="footer-inner">',
    '  <div class="footer-col">',
    '    <h4>\uD83C\uDF19 The Crypto Moonboys GK Wiki</h4>',
    '    <p>A living Web3 wiki. Knowledge plus action.</p>',
    '  </div>',
    '  <div class="footer-col">',
    '    <h4>Explore</h4>',
    '    <ul>',
    '      <li><a href="/index.html">Main Page</a></li>',
    '      <li><a href="/categories/index.html">Categories</a></li>',
    '      <li><a href="/search.html">All Articles</a></li>',
    '      <li><a href="/about.html">About</a></li>',
    '    </ul>',
    '  </div>',
    '  <div class="footer-col">',
    '    <h4>\u2694\uFE0F HODL Wars Lore</h4>',
    '    <ul>',
    '      <li><a href="/wiki/hodl-wars.html">HODL Wars</a></li>',
    '      <li><a href="/wiki/hodl-warriors.html">HODL Warriors</a></li>',
    '    </ul>',
    '  </div>',
    '</div>',
    '<div class="footer-bottom">',
    '  <p>\u00A9 2026 Crypto Moonboys Wiki \u00B7 Not financial advice.</p>',
    '  <p><span class="no-login-note">\uD83D\uDD12 No sign-up \u00B7 No login \u00B7 Bot-maintained</span></p>',
    '</div>',
  ].join('\n');

  /* ── 7. Right panel ─────────────────────────────────────────────
   *
   * shouldShowRightPanel(pathname, body)
   *   Canonical, drift-resistant check.  Returns true when either:
   *     a) body carries the 'page-has-right-panel' CSS class, OR
   *     b) the pathname is in the canonical allowlist below.
   *   Rule (b) fires even when the class is accidentally absent.
   */
  function shouldShowRightPanel(pn, body) {
    if (body.classList.contains('page-has-right-panel')) return true;
    /* Normalise: '/' → '/index.html'; strip trailing slash on other paths */
    var p = pn === '/' ? '/index.html'
          : (pn.length > 1 && pn.charAt(pn.length - 1) === '/')
            ? pn.slice(0, -1)
            : pn;
    /* Exact allowlist */
    var exact = [
      '/index.html',
      '/sam.html',
      '/graph.html',
      '/search.html',
      '/timeline.html',
      '/dashboard.html',
      '/community.html',
      '/how-to-play.html',
      '/games',
      '/games/',
      '/games/index.html',
      '/games/leaderboard.html',
    ];
    if (exact.indexOf(p) !== -1) return true;
    /* Prefix allowlist */
    var prefixes = ['/categories/', '/wiki/'];
    for (var i = 0; i < prefixes.length; i++) {
      if (p.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  var rightPanel = null;
  if (shouldShowRightPanel(window.location.pathname, document.body)) {
    rightPanel = document.createElement('aside');
    rightPanel.id = 'homepage-right-panel';
    rightPanel.setAttribute('aria-label', 'Player and system status');
    rightPanel.innerHTML = [
      '<!-- ── PLAYER STATUS ── -->',
      '<div class="retro-hud-box hud-box--player">',
      '  <div class="retro-hud-title">',
      '    <span class="retro-hud-title-icon" aria-hidden="true">\u25B6</span>',
      '    Player Status',
      '    <span class="retro-hud-mascot" aria-hidden="true">\uD83D\uDC3B</span>',
      '  </div>',
      '  <div class="retro-hud-body">',
      '    <div class="hud-player-portrait-row">',
      '      <div class="hud-avatar-box" role="img" aria-label="Player avatar">',
      '        <span class="hud-avatar-icon" aria-hidden="true">\uD83D\uDC7E</span>',
      '      </div>',
      '      <div class="hud-player-info">',
      '        <div class="hud-info-row">',
      '          <span class="hud-label">PLAYER:</span>',
      '          <span class="hud-value hud-player-name">\u2014</span>',
      '        </div>',
      '        <div class="hud-info-row">',
      '          <span class="hud-label">RANK:</span>',
      '          <span class="hud-value hud-rank-val">\u2014</span>',
      '        </div>',
      '        <div class="hud-info-row">',
      '          <span class="hud-label">XP:</span>',
      '          <span class="hud-value hud-xp-inline"><span class="hud-xp-cur">--</span>&thinsp;/&thinsp;<span class="hud-xp-max">--</span></span>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div class="hud-xp-bar-wrap">',
      '      <span class="hud-xp-label">XP</span>',
      '      <div class="hud-xp-track"><div class="hud-xp-fill"></div></div>',
      '      <span class="hud-xp-pct">--</span>',
      '    </div>',
      '    <div class="hud-stats-row">',
      '      <div class="hud-stat-chip"><span class="hud-stat-icon" aria-hidden="true">\uD83E\uDE99</span><span class="hud-stat-val">--</span></div>',
      '      <div class="hud-stat-chip"><span class="hud-stat-icon" aria-hidden="true">\uD83D\uDC8E</span><span class="hud-stat-val">--</span></div>',
      '      <div class="hud-stat-chip"><span class="hud-stat-icon" aria-hidden="true">\u26A1</span><span class="hud-stat-val">--</span></div>',
      '    </div>',
      '    <div data-csp-panel></div>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── SYSTEM STATUS ── -->',
      '<div class="retro-hud-box hud-box--system">',
      '  <div class="retro-hud-title">',
      '    <span class="retro-hud-title-icon" aria-hidden="true">\u25B6</span>',
      '    System Status',
      '    <span class="retro-hud-mascot" aria-hidden="true">\uD83E\uDD16</span>',
      '  </div>',
      '  <div class="retro-hud-body">',
      '    <div class="hud-sys-table" aria-label="System status indicators">',
      '      <div class="hud-sys-row">',
      '        <span class="hud-sys-label">NETWORK</span>',
      '        <span class="hud-sys-val hud-sys-online">ONLINE</span>',
      '        <span class="hud-sys-dot" aria-hidden="true"></span>',
      '      </div>',
      '      <div class="hud-sys-row">',
      '        <span class="hud-sys-label">ORACLE FEED</span>',
      '        <span class="hud-sys-val hud-sys-online">SYNCED</span>',
      '        <span class="hud-sys-dot" aria-hidden="true"></span>',
      '      </div>',
      '      <div class="hud-sys-row">',
      '        <span class="hud-sys-label">BATTLE CHAMBER</span>',
      '        <span class="hud-sys-val hud-sys-online">ACTIVE</span>',
      '        <span class="hud-sys-dot" aria-hidden="true"></span>',
      '      </div>',
      '      <div class="hud-sys-row">',
      '        <span class="hud-sys-label">ARCADE SERVER</span>',
      '        <span class="hud-sys-val hud-sys-online">ONLINE</span>',
      '        <span class="hud-sys-dot" aria-hidden="true"></span>',
      '      </div>',
      '      <div class="hud-sys-row">',
      '        <span class="hud-sys-label">WIKI NODES</span>',
      '        <span class="hud-sys-val hud-sys-ratio">\u2014 / \u2014</span>',
      '        <span class="hud-sys-dot" aria-hidden="true"></span>',
      '      </div>',
      '    </div>',
      '    <div data-las-panel></div>',
      '  </div>',
      '</div>',
      '',
      '<!-- ── LIVE SYSTEM FEED ── -->',
      '<div class="retro-hud-box hud-box--feed">',
      '  <div class="retro-hud-title">',
      '    <span class="retro-hud-title-icon" aria-hidden="true">\u25B6</span>',
      '    Live System Feed',
      '    <span class="retro-hud-mascot" aria-hidden="true">\u26D1\uFE0F</span>',
      '  </div>',
      '  <div class="retro-hud-body" id="live-feed-widget">',
      '    <div class="hud-feed-item">',
      '      <span class="hud-feed-icon" aria-hidden="true">\uD83D\uDCE1</span>',
      '      <span class="hud-feed-text">Connecting to feed\u2026</span>',
      '      <span class="hud-feed-time">--:--</span>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  /* ── 8. Back-to-top button ───────────────────────────────────── */
  var backToTop = document.createElement('button');
  backToTop.id = 'back-to-top';
  backToTop.setAttribute('aria-label', 'Back to top');
  backToTop.textContent = '\u2191';

  /* ── 9. Assemble layout ──────────────────────────────────────── */
  var mainWrapper = document.createElement('div');
  mainWrapper.id = 'main-wrapper';
  // Move existing <main> into wrapper
  mainWrapper.appendChild(main);
  mainWrapper.appendChild(footer);

  var layout = document.createElement('div');
  layout.id = 'layout';
  layout.appendChild(sidebar);
  layout.appendChild(mainWrapper);
  if (rightPanel) {
    layout.appendChild(rightPanel);
  }

  /* ── 10. Build final body ────────────────────────────────────── */
  // Remove only known old shell nodes to avoid duplication on re-run.
  // Do NOT remove arbitrary body children — Cloudflare Rocket Loader
  // replaces later <script> tags with placeholder nodes that are not
  // SCRIPT elements, and removing them causes:
  //   [ROCKET LOADER] Placeholder for script … was detached from document.
  // Only the four IDs that site-shell.js itself creates are safe to remove.
  var OLD_SHELL_IDS = ['site-header', 'sidebar-overlay', 'layout', 'back-to-top'];
  for (var si = 0; si < OLD_SHELL_IDS.length; si++) {
    var oldNode = document.getElementById(OLD_SHELL_IDS[si]);
    if (oldNode && oldNode.parentNode === document.body) {
      document.body.removeChild(oldNode);
    }
  }

  // Insert shell nodes at the very beginning of body, before any existing
  // children (scripts, text nodes, Rocket Loader placeholder nodes, etc.).
  var firstChild = document.body.firstChild;
  document.body.insertBefore(backToTop, firstChild);
  document.body.insertBefore(layout, backToTop);
  document.body.insertBefore(overlay, layout);
  document.body.insertBefore(header, overlay);
  document.body.insertBefore(skipLink, header);

  /* ── 11. Mark active sidebar link ────────────────────────────── */
  var pathname = window.location.pathname;
  // Normalise: treat bare '/' as '/index.html'
  var normPath = (pathname === '/' ? '/index.html' : pathname);

  var exactMatches = [
    '/index.html',
    '/dashboard.html',
    '/sam.html',
    '/community.html',
    '/how-to-play.html',
    '/graph.html',
    '/timeline.html',
    '/search.html',
    '/about.html',
    '/gkniftyheads-incubator.html',
    '/games/leaderboard.html',
  ];

  function markActive(el) {
    el.classList.add('active');
    el.setAttribute('aria-current', 'page');
  }

  var marked = false;

  // Exact matches first
  if (!marked && exactMatches.indexOf(normPath) !== -1) {
    var links = sidebar.querySelectorAll('a[href="' + normPath + '"]');
    if (links.length > 0) {
      markActive(links[0]);
      marked = true;
    }
  }

  // Leaderboard exact
  if (!marked && normPath === '/games/leaderboard.html') {
    var lbLinks = sidebar.querySelectorAll('a[href="/games/leaderboard.html"]');
    if (lbLinks.length > 0) { markActive(lbLinks[0]); marked = true; }
  }

  // Prefix: /games/ (but not leaderboard)
  if (!marked && normPath.indexOf('/games/') === 0 && normPath !== '/games/leaderboard.html') {
    var gameLinks = sidebar.querySelectorAll('a[href="/games/"]');
    if (gameLinks.length > 0) { markActive(gameLinks[0]); marked = true; }
  }

  // Prefix: /wiki/
  if (!marked && normPath.indexOf('/wiki/') === 0) {
    // Try exact article link first
    var wikiLinks = sidebar.querySelectorAll('a[href="' + normPath + '"]');
    if (wikiLinks.length > 0) {
      markActive(wikiLinks[0]);
      marked = true;
    }
  }

  // Prefix: /categories/
  if (!marked && normPath.indexOf('/categories/') === 0) {
    var catLinks = sidebar.querySelectorAll('a[href="/categories/index.html"]');
    if (catLinks.length > 0) { markActive(catLinks[0]); marked = true; }
  }

  // Mark header Home link when on index
  if (normPath === '/index.html') {
    var homeLinks = header.querySelectorAll('.header-nav a[href="/index.html"]');
    if (homeLinks.length > 0) {
      markActive(homeLinks[0]);
    }
  }

  /* ── 12. Hamburger / sidebar binding ─────────────────────────────
   *
   * Binds immediately after injection so the hamburger works before
   * wiki.js (or any other script) attaches its DOMContentLoaded
   * handler.  Uses body.sidebar-open as the single canonical state
   * class so CSS never depends on page-specific body classes.
   *
   * Per-element binding markers (dataset.sidebarBound) are used so
   * that if site-shell.js ever reruns and replaces DOM nodes the new
   * elements are still bound correctly.  The Escape handler is
   * registered once globally but always reads the *current* DOM.
   *
   * wiki.js checks window.__MOONBOYS_SIDEBAR_BOUND and skips its own
   * binding to prevent double-binding (idempotent).
   */
  (function _bindSidebarNav() {
    var ham = document.getElementById('hamburger');
    var ov  = document.getElementById('sidebar-overlay');

    function _shellSetSidebarOpen(open) {
      var sb = document.getElementById('sidebar');
      if (!sb) return;
      document.body.classList.toggle('sidebar-open', open);
      var h = document.getElementById('hamburger');
      if (h) h.setAttribute('aria-expanded', String(open));
    }

    if (ham && !ham.dataset.sidebarBound) {
      ham.dataset.sidebarBound = 'true';
      ham.addEventListener('click', function () {
        _shellSetSidebarOpen(!document.body.classList.contains('sidebar-open'));
      });
    }

    if (ov && !ov.dataset.sidebarBound) {
      ov.dataset.sidebarBound = 'true';
      ov.addEventListener('click', function () { _shellSetSidebarOpen(false); });
    }

    // Escape handler: registered once globally; always acts on current DOM.
    if (!window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND) {
      window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') _shellSetSidebarOpen(false);
      });
    }

    // Signal to wiki.js that the hamburger is already bound so it does not
    // attach duplicate click listeners.  Reset whenever shell rebuilds so
    // wiki.js never skips rebinding against stale state.
    window.__MOONBOYS_SIDEBAR_BOUND = !!(ham && ham.dataset.sidebarBound);
  }());
}());
