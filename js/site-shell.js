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
    '  <p><span class="no-login-note">\uD83D\uDD12 No password account \u00B7 Telegram link for competitive systems \u00B7 Bot-maintained</span></p>',
    '</div>',
  ].join('\n');

  /* ── 6. Right panel ───────────────────────────────────────────── */
  function shouldShowRightPanel(pn, body) {
    var p = pn === '/' ? '/index.html' : (pn.length > 1 && pn.charAt(pn.length - 1) === '/') ? pn.slice(0, -1) : pn;
    // The editorial dashboard is intentionally wiki-only: never inject player live/faction panels at runtime.
    if (p === '/dashboard.html') return false;
    if (body.classList.contains('page-has-right-panel')) return true;
    var exact = ['/index.html','/sam.html','/graph.html','/search.html','/timeline.html','/community.html','/how-to-play.html','/games','/games/','/games/index.html','/games/leaderboard.html'];
    if (exact.indexOf(p) !== -1) return true;
    var prefixes = ['/categories/', '/wiki/'];
    for (var i = 0; i < prefixes.length; i++) { if (p.indexOf(prefixes[i]) === 0) return true; }
    return false;
  }

  var rightPanel = null;
  if (shouldShowRightPanel(window.location.pathname, document.body)) {
    rightPanel = document.createElement('aside');
    rightPanel.id = 'homepage-right-panel';
    rightPanel.setAttribute('aria-label', 'Player status and actions');
    rightPanel.innerHTML = [
      '<!-- ── PLAYER STATUS ── -->',
      '<div class="retro-hud-box hud-box--player">',
      '  <div class="retro-hud-title">',
      '    <span class="retro-hud-title-icon" aria-hidden="true">\u25B6</span>',
      '    PLAYER LIVE FEED',
      '    <span class="retro-hud-mascot" aria-hidden="true">\uD83D\uDC3B</span>',
      '  </div>',
      '  <div class="retro-hud-body">',
      '    <div class="hud-player-portrait-row">',
      '      <div class="hud-avatar-box" id="hud-player-avatar" role="img" aria-label="Player avatar">',
      '        <span class="hud-avatar-icon" aria-hidden="true">\uD83D\uDC7E</span>',
      '      </div>',
      '      <div class="hud-player-info">',
      '        <span class="hud-player-name" id="hud-player-name">Telegram not linked</span>',
      '      </div>',
      '    </div>',
      '    <div data-csp-panel></div>',
      '  </div>',
      '</div>',
      '<div class="retro-hud-box hud-box--actions">',
      '  <div class="retro-hud-title"><span class="retro-hud-title-icon" aria-hidden="true">\u2694</span> FACTION DAILY OPS</div>',
      '  <div class="retro-hud-body"><div data-csp-faction-ops></div></div>',
      '</div>',
      '<div class="retro-hud-box hud-box--events">',
      '  <div class="retro-hud-title"><span class="retro-hud-title-icon" aria-hidden="true">\u25CE</span> DAILY WTF SIGNAL</div>',
      '  <div class="retro-hud-body"><div data-csp-wtf-signal></div></div>',
      '</div>',
      '<div class="retro-hud-box hud-box--missed">',
      '  <div class="retro-hud-title"><span class="retro-hud-title-icon" aria-hidden="true">\u26A0</span> MISSED OPPORTUNITIES</div>',
      '  <div class="retro-hud-body"><div data-csp-missed></div></div>',
      '</div>',
    ].join('\n');

    var _hudLivePillRestoreInflight = null;
    var _hudIdentityRefreshTimer = null;
    var _hudIdentityRefreshBound = false;

    function clearHudLivePill(nameEl) {
      if (!nameEl || !nameEl.parentNode) return;
      var existingPill = nameEl.parentNode.querySelector('.hud-live-pill');
      if (existingPill && existingPill.parentNode) {
        existingPill.parentNode.removeChild(existingPill);
      }
    }

    function renderHudAvatar(gate, avatarBox) {
      if (!avatarBox) return;
      var photoUrl = gate && typeof gate.getTelegramPhotoUrl === 'function' ? gate.getTelegramPhotoUrl() : null;
      avatarBox.innerHTML = '';
      if (photoUrl) {
        var img = document.createElement('img');
        img.src = photoUrl;
        img.alt = '';
        img.className = 'hud-avatar-img';
        img.width = 36;
        img.height = 36;
        img.setAttribute('aria-hidden', 'true');
        avatarBox.appendChild(img);
        avatarBox.setAttribute('aria-label', 'Telegram avatar');
        return;
      }
      avatarBox.innerHTML = '<span class="hud-avatar-icon" aria-hidden="true">\uD83D\uDC7E</span>';
      avatarBox.setAttribute('aria-label', 'Player avatar');
    }

    function resolveHudSignedTelegramAuth(gate) {
      if (!gate) return Promise.resolve(null);
      if (typeof gate.getFreshTelegramAuth === 'function') {
        return Promise.resolve(gate.getFreshTelegramAuth());
      }
      var currentAuth = typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
      if (currentAuth) return Promise.resolve(currentAuth);
      if (typeof gate.restoreLinkedTelegramAuth !== 'function') return Promise.resolve(null);
      if (_hudLivePillRestoreInflight) return _hudLivePillRestoreInflight;
      _hudLivePillRestoreInflight = Promise.resolve(gate.restoreLinkedTelegramAuth())
        .then(function (restored) {
          if (restored && restored.ok && restored.telegram_auth) return restored.telegram_auth;
          return typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
        })
        .catch(function () { return null; })
        .finally(function () {
          _hudLivePillRestoreInflight = null;
        });
      return _hudLivePillRestoreInflight;
    }

    async function renderHudLivePill(gate, nameEl) {
      if (!nameEl || !nameEl.parentNode) return;
      var pillHost = nameEl.parentNode;
      var token = Number(pillHost.dataset.hudPillToken || 0) + 1;
      pillHost.dataset.hudPillToken = String(token);
      clearHudLivePill(nameEl);
      var linked = !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
      if (!linked) return;
      var freshAuth = gate && typeof gate.getSignedTelegramAuth === 'function' ? gate.getSignedTelegramAuth() : null;
      if (!freshAuth && gate) freshAuth = await resolveHudSignedTelegramAuth(gate);
      if (pillHost.dataset.hudPillToken !== String(token)) return;
      clearHudLivePill(nameEl);
      var pillEl = document.createElement('span');
      var apiCfg = window.MOONBOYS_API || {};
      var apiInfo = typeof apiCfg.getApiBaseInfo === 'function'
        ? apiCfg.getApiBaseInfo({ mode: 'write' })
        : { url: apiCfg.BASE_URL || '', state: apiCfg.BASE_URL ? 'configured' : 'config_required' };
      var hasWriteApi = !!(apiInfo && apiInfo.url);
      pillEl.className = 'hud-live-pill ' + (!freshAuth ? 'hud-live-pill--relink' : (hasWriteApi ? 'hud-live-pill--linked' : 'hud-live-pill--relink'));
      pillEl.setAttribute('aria-label', !freshAuth ? 'Relink required' : (hasWriteApi ? 'Live linked' : 'Sync pending'));
      if (freshAuth && hasWriteApi) {
        pillEl.textContent = 'LIVE LINKED';
      } else if (freshAuth) {
        pillEl.textContent = 'SYNC PENDING';
      } else {
        var relinkA = document.createElement('a');
        relinkA.href = '/gkniftyheads-incubator.html';
        relinkA.textContent = 'RELINK';
        pillEl.appendChild(relinkA);
      }
      pillHost.appendChild(pillEl);
    }

    function refreshHudIdentity() {
      var gate = window.MOONBOYS_IDENTITY;
      var linked = !!(gate && typeof gate.isTelegramLinked === 'function' && gate.isTelegramLinked());
      var nameEl = document.getElementById('hud-player-name');
      if (nameEl) {
        var telegramName = gate && typeof gate.getTelegramName === 'function' ? gate.getTelegramName() : null;
        if (linked && telegramName) {
          nameEl.textContent = telegramName;
        } else if (linked) {
          nameEl.textContent = 'Telegram linked';
        } else {
          nameEl.textContent = 'Telegram not linked';
        }
        renderHudLivePill(gate, nameEl);
      }
      renderHudAvatar(gate, document.getElementById('hud-player-avatar'));
    }

    function scheduleHudIdentityRefresh() {
      if (_hudIdentityRefreshTimer) clearTimeout(_hudIdentityRefreshTimer);
      _hudIdentityRefreshTimer = setTimeout(function () {
        _hudIdentityRefreshTimer = null;
        refreshHudIdentity();
      }, 0);
    }

    function bindHudIdentityRefresh() {
      if (_hudIdentityRefreshBound) return;
      _hudIdentityRefreshBound = true;
      window.addEventListener('moonboys:sync-state', scheduleHudIdentityRefresh);
      window.addEventListener('moonboys:faction-status', scheduleHudIdentityRefresh);
      window.addEventListener('storage', function (e) {
        var key = e && e.key ? String(e.key) : '';
        if (/^(moonboys_tg_(id|name|linked|auth|sync_health)|MOONBOYS_TELEGRAM_AUTH)$/.test(key)) {
          scheduleHudIdentityRefresh();
        }
      });
    }

    /* Deferred HUD population */
    setTimeout(function _hudPlayerInit() {
      bindHudIdentityRefresh();
      scheduleHudIdentityRefresh();
    }, 0);
  }

  /* ── 7. Back-to-top button ───────────────────────────────────── */
  var backToTop = document.createElement('button');
  backToTop.id = 'back-to-top';
  backToTop.setAttribute('aria-label', 'Back to top');
  backToTop.textContent = '\u2191';

  /* ── 8. SAFE SHELL REBUILD (EXACT ORDER) ─────────────────────── */
  var oldLayout = document.getElementById('layout');
  var oldMainWrapper = document.getElementById('main-wrapper');
  if (oldMainWrapper && oldMainWrapper.contains(main)) {
    oldMainWrapper.removeChild(main);
  } else if (oldLayout && oldLayout.contains(main)) {
    oldLayout.removeChild(main);
  } else if (main.parentNode) {
    main.parentNode.removeChild(main);
  }

  var OLD_SHELL_IDS = ['site-header', 'sidebar-overlay', 'layout', 'back-to-top', 'main-wrapper'];
  for (var si = 0; si < OLD_SHELL_IDS.length; si++) {
    var oldNode = document.getElementById(OLD_SHELL_IDS[si]);
    if (oldNode && oldNode.parentNode === document.body) {
      document.body.removeChild(oldNode);
    }
  }

  var mainWrapper = document.createElement('div');
  mainWrapper.id = 'main-wrapper';
  mainWrapper.appendChild(main);
  mainWrapper.appendChild(footer);

  var layout = document.createElement('div');
  layout.id = 'layout';
  layout.appendChild(sidebar);
  layout.appendChild(mainWrapper);
  if (rightPanel) layout.appendChild(rightPanel);

  var firstChild = document.body.firstChild;
  document.body.insertBefore(backToTop, firstChild);
  document.body.insertBefore(layout, backToTop);
  document.body.insertBefore(overlay, layout);
  document.body.insertBefore(header, overlay);

  /* ── 9. Global Paperclip agent (render exactly once) ────────── */
  if (!document.getElementById('site-paperclip-agent')) {
    var paperclip = document.createElement('a');
    paperclip.id = 'site-paperclip-agent';
    paperclip.className = 'site-paperclip-agent';
    paperclip.href = '/paperclip.html';
    paperclip.setAttribute('aria-label', 'Open Crypto Moonboys Paperclip brain');
    paperclip.innerHTML =
      '<span class="site-paperclip-agent__bubble" aria-hidden="true">HELLO...</span>' +
      '<span class="site-paperclip-agent__bot" aria-hidden="true">\uD83E\uDD16</span>';
    document.body.appendChild(paperclip);
  }

  /* ── 10. Mark active sidebar link ───────────────────────────── */
  var pathname = window.location.pathname;
  var normPath = (pathname === '/' ? '/index.html' : pathname);
  var exactMatches = ['/index.html','/dashboard.html','/sam.html','/community.html','/how-to-play.html','/graph.html','/timeline.html','/search.html','/about.html','/gkniftyheads-incubator.html','/games/leaderboard.html'];
  var marked = false;

  if (!marked && exactMatches.indexOf(normPath) !== -1) {
    var links = sidebar.querySelectorAll('a[href="' + normPath + '"]');
    if (links.length > 0) { links[0].classList.add('active'); links[0].setAttribute('aria-current', 'page'); marked = true; }
  }
  if (!marked && normPath === '/games/leaderboard.html') {
    var lbLinks = sidebar.querySelectorAll('a[href="/games/leaderboard.html"]');
    if (lbLinks.length > 0) { lbLinks[0].classList.add('active'); lbLinks[0].setAttribute('aria-current', 'page'); marked = true; }
  }
  if (!marked && normPath.indexOf('/games/') === 0 && normPath !== '/games/leaderboard.html') {
    var gameLinks = sidebar.querySelectorAll('a[href="/games/"]');
    if (gameLinks.length > 0) { gameLinks[0].classList.add('active'); gameLinks[0].setAttribute('aria-current', 'page'); marked = true; }
  }
  if (!marked && normPath.indexOf('/wiki/') === 0) {
    var wikiLinks = sidebar.querySelectorAll('a[href="' + normPath + '"]');
    if (wikiLinks.length > 0) { wikiLinks[0].classList.add('active'); wikiLinks[0].setAttribute('aria-current', 'page'); marked = true; }
  }
  if (!marked && normPath.indexOf('/categories/') === 0) {
    var catLinks = sidebar.querySelectorAll('a[href="/categories/index.html"]');
    if (catLinks.length > 0) { catLinks[0].classList.add('active'); catLinks[0].setAttribute('aria-current', 'page'); marked = true; }
  }
  if (normPath === '/index.html') {
    var homeLinks = header.querySelectorAll('.header-nav a[href="/index.html"]');
    if (homeLinks.length > 0) homeLinks[0].classList.add('active');
  }

  /* ── 11. Hamburger / sidebar binding ────────────────────────── */
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
      ham.addEventListener('click', function () { _shellSetSidebarOpen(!document.body.classList.contains('sidebar-open')); });
    }
    if (ov && !ov.dataset.sidebarBound) {
      ov.dataset.sidebarBound = 'true';
      ov.addEventListener('click', function () { _shellSetSidebarOpen(false); });
    }
    if (!window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND) {
      window.__MOONBOYS_SIDEBAR_ESCAPE_BOUND = true;
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _shellSetSidebarOpen(false); });
    }
    window.__MOONBOYS_SIDEBAR_BOUND = !!(ham && ham.dataset.sidebarBound);
  }());
}());
