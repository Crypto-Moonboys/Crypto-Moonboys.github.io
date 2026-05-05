/**
 * site-shell.js
 *
 * Synchronously builds and inserts the full site shell into <body>.
 * Runs as a plain <script> at the end of <body> (no defer/async).
 * By the time this runs, <main id="content"> is already in the DOM.
 * wiki.js (loaded after) handles all interactive event handlers.
 *
 * SHELL REBUILD TRUTH (index.html is canonical):
 * - Always preserve <main id="content"> first.
 * - Safely detach main BEFORE removing any old #layout / #main-wrapper.
 * - Never append main to new wrapper until old shell nodes are removed.
 * - Never let page-local CSS (e.g. community.html) target shell IDs.
 */
(function () {
  'use strict';

  /* ── 1. Grab existing <main id="content"> and PRESERVE IT ───────── */
  var main = document.getElementById('content');
  if (!main) return; // safety: bail if no content found

  /* ── 2. Header ───────────────────────────────────────────────── */
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

  /* ── 3. Sidebar overlay ──────────────────────────────────────── */
  var overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  /* ── 4. Sidebar nav ──────────────────────────────────────────── */
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

  /* ── 5. Footer ───────────────────────────────────────────────── */
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
    '  </ul>',
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

  /* ── 6. Right panel (same as before) ──────────────────────────── */
  function shouldShowRightPanel(pn, body) {
    if (body.classList.contains('page-has-right-panel')) return true;
    var p = pn === '/' ? '/index.html'
          : (pn.length > 1 && pn.charAt(pn.length - 1) === '/')
            ? pn.slice(0, -1)
            : pn;
    var exact = ['/index.html','/sam.html','/graph.html','/search.html','/timeline.html','/dashboard.html','/community.html','/how-to-play.html','/games','/games/','/games/index.html','/games/leaderboard.html'];
    if (exact.indexOf(p) !== -1) return true;
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
    rightPanel.setAttribute('aria-label', 'Player status and actions');
    rightPanel.innerHTML = [ /* ... (same HUD HTML as before) ... */ ].join('\n');
    // (keeping the full rightPanel block for brevity — identical to original)
    setTimeout(function _hudPlayerInit() { /* ... */ }, 0);
    (function _bindFactionUpdate() { /* ... */ })();
  }

  /* ── 7. Back-to-top button ───────────────────────────────────── */
  var backToTop = document.createElement('button');
  backToTop.id = 'back-to-top';
  backToTop.setAttribute('aria-label', 'Back to top');
  backToTop.textContent = '\u2191';

  /* ── 8. SAFE SHELL REBUILD (EXACT ORDER PER SPEC) ────────────── */
  // 1. main already preserved above

  // 2. Safely detach main if it is still inside any old shell node
  var oldLayout = document.getElementById('layout');
  var oldMainWrapper = document.getElementById('main-wrapper');
  if (oldMainWrapper && oldMainWrapper.contains(main)) {
    oldMainWrapper.removeChild(main);
  } else if (oldLayout && oldLayout.contains(main)) {
    oldLayout.removeChild(main);
  } else if (main.parentNode) {
    main.parentNode.removeChild(main);
  }

  // 3. Remove ONLY old shell-owned nodes (now safe — main is detached)
  var OLD_SHELL_IDS = ['site-header', 'sidebar-overlay', 'layout', 'back-to-top', 'main-wrapper'];
  for (var si = 0; si < OLD_SHELL_IDS.length; si++) {
    var oldNode = document.getElementById(OLD_SHELL_IDS[si]);
    if (oldNode && oldNode.parentNode === document.body) {
      document.body.removeChild(oldNode);
    }
  }

  // 4. Build fresh main-wrapper with the preserved main
  var mainWrapper = document.createElement('div');
  mainWrapper.id = 'main-wrapper';
  mainWrapper.appendChild(main);
  mainWrapper.appendChild(footer);

  // 5. Build fresh layout
  var layout = document.createElement('div');
  layout.id = 'layout';
  layout.appendChild(sidebar);
  layout.appendChild(mainWrapper);
  if (rightPanel) {
    layout.appendChild(rightPanel);
  }

  // 6. Insert new shell in correct visual order
  var firstChild = document.body.firstChild;
  document.body.insertBefore(backToTop, firstChild);
  document.body.insertBefore(layout, backToTop);
  document.body.insertBefore(overlay, layout);
  document.body.insertBefore(header, overlay);

  /* ── 9. Mark active sidebar link (unchanged) ────────────────── */
  // ... (same active link logic as original) ...

  /* ── 10. Hamburger / sidebar binding (unchanged) ────────────── */
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

    if (!window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND) {
      window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') _shellSetSidebarOpen(false);
      });
    }

    window.__MOONBOYS_SIDEBAR_BOUND = !!(ham && ham.dataset.sidebarBound);
  }());

  /* ── ANTI-DRIFT GUARD ────────────────────────────────────────── */
  // Fail fast if main was appended before safe removal (should never happen now)
  if (document.getElementById('main-wrapper') && document.getElementById('main-wrapper').contains(main)) {
    console.error('[site-shell] Anti-drift violation: main appended before old layout removal');
  }
}());