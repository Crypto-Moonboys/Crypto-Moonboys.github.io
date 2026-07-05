// One runtime shell owns global navigation, layout, route mode, and recovery.
// Audit anchor: No password account \u00B7 Telegram link for competitive systems \u00B7 Bot-maintained

window.__HUD_CONSOLIDATED__ = true;

(function () {
  'use strict';

  if (window.__MOONBOYS_SHELL_BOOTED__) return;
  window.__MOONBOYS_SHELL_BOOTED__ = true;

  const CANONICAL_PUBLIC_ROOT = '/wiki/';
  const SHARED_WIKI_HEADER = Object.freeze({
    html: '/wiki/components/header.html',
    css: '/wiki/components/header.css',
    js: '/wiki/components/header.js',
  });
  let sharedHeaderMarkupPromise = null;

  const links = [
    { label: 'HOME', href: '/index.html', icon: '⌂', title: 'Home' },
    { label: 'WIKI', href: '/search.html', icon: '◫', title: 'Wiki' },
    { label: 'GAMES', href: '/games/', icon: '◆', title: 'Games' },
    { label: 'BATTLE CHAMBER', href: '/community.html', icon: '⚔', title: 'Battle Chamber' },
    { label: 'SWARMSY', href: '/swarmsy.html', icon: '✦', title: 'SWARMSY' },
    { label: 'SYSTEM HUB', href: '/dashboard.html', icon: '◎', title: 'System Hub' }
  ];

  const sidebarGroups = [
    { heading: 'Navigation', items: links },
    {
      heading: 'Wiki Routes',
      items: [
        { label: 'Crypto Moonboys', href: '/wiki/crypto-moonboys.html', icon: '☾', title: 'Crypto Moonboys' },
        { label: 'All Articles', href: '/search.html', icon: '⌕', title: 'All Articles' },
        { label: 'Categories', href: '/categories/index.html', icon: '▦', title: 'Categories' },
        { label: 'Timeline', href: '/timeline.html', icon: '⌁', title: 'Timeline' },
        { label: 'Graph', href: '/graph.html', icon: '✣', title: 'Graph' }
      ]
    },
    {
      heading: 'Build Layers',
      items: [
        { label: 'Factions', href: '/battle-chamber/factions/', icon: '◉', title: 'Factions' },
        { label: 'Block Topia', href: '/games/block-topia/', icon: '▣', title: 'Block Topia' },
        { label: 'How To Play', href: '/how-to-play.html', icon: '?', title: 'How To Play' }
      ]
    }
  ];

  function normalizePathname(rawPath) {
    let p = String(rawPath || window.location.pathname || '/').split('#')[0].split('?')[0];
    if (!p.startsWith('/')) p = '/' + p;
    p = p.replace(/\/+/g, '/');
    if (p === '/') return '/index.html';
    if (p === '/games') return '/games/';
    if (p === '/battle-chamber/factions') return '/battle-chamber/factions/';
    return p;
  }

  function resolveShellMode(pathname) {
    const p = normalizePathname(pathname);
    if (p === '/index.html') return 'home';
    if (p === '/search.html' || p.startsWith('/wiki/') || p.startsWith('/categories/')) return 'wiki';
    if (p.startsWith('/games/')) return 'games';
    if (p.startsWith('/battle-chamber/') || p === '/community.html') return 'battle';
    if (p === '/waxcash.html' || p === '/waxonedge.html' || p.startsWith('/tools/')) return 'tool';
    if (p === '/dashboard.html' || p === '/admin-tools.html') return 'system';
    return 'legacy';
  }

  function isWikiShellRoute(pathname) {
    const p = normalizePathname(pathname);
    return p === '/search.html' || p.startsWith('/wiki/') || p.startsWith('/categories/');
  }

  function resolveCanonicalWikiRoute(pathname) {
    const p = normalizePathname(pathname);
    if (p.startsWith(CANONICAL_PUBLIC_ROOT)) return p;
    if (p === '/search.html') return '/search.html';
    if (p === '/index.html') return '/wiki/crypto-moonboys.html';
    if (p.startsWith('/games/')) return '/wiki/games-graffpunks.html';
    if (p.startsWith('/battle-chamber/') || p === '/community.html') return '/search.html?q=Battle%20Chamber';
    if (p === '/swarmsy.html' || p === '/sparky.html') return '/search.html?q=SWARMSY';
    if (p === '/dashboard.html' || p === '/admin-tools.html') return '/search.html?q=System%20Hub';
    if (p === '/waxcash.html' || p === '/waxonedge.html') return '/search.html?q=WAX';
    return '/search.html';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isActiveRoute(href) {
    const current = normalizePathname(window.location.pathname);
    const target = normalizePathname(href);
    if (target === '/index.html') return current === target;
    if (target === '/games/') return current.startsWith('/games/');
    if (target === '/community.html') return current === '/community.html' || current.startsWith('/battle-chamber/');
    if (target === '/search.html') return current === '/search.html' || current.startsWith('/wiki/') || current.startsWith('/categories/');
    return current === target;
  }

  function navLinkHtml(item, className) {
    const active = isActiveRoute(item.href) ? ' active' : '';
    const icon = item.icon ? `<span class="nav-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>` : '';
    return `<a class="${className}${active}" href="${escapeHtml(item.href)}" title="${escapeHtml(item.title || item.label)}" data-shell-link="${escapeHtml(item.label)}">${icon}<span>${escapeHtml(item.label)}</span></a>`;
  }

  function isGlobalNavComplete(nav) {
    if (!nav || nav.id !== 'global-nav') return false;
    return links.every((item) => {
      const expectedHref = normalizePathname(item.href);
      return Array.from(nav.querySelectorAll('a[href]')).some((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const label = anchor.dataset.shellLink || anchor.textContent || '';
        return normalizePathname(href) === expectedHref && label.trim().includes(item.label);
      });
    });
  }

  function stampShellMode() {
    const mode = resolveShellMode(window.location.pathname);
    document.documentElement.dataset.wikiShell = 'global';
    document.body.classList.add('swarmsy-shell');
    document.body.dataset.shellMode = mode;
    document.body.dataset.publicSource = window.location.pathname.startsWith(CANONICAL_PUBLIC_ROOT) ? 'wiki' : 'swarmsy-shell';
    document.body.classList.remove('wiki-shell-v1', 'wiki-shell-mode-home', 'wiki-shell-mode-wiki', 'wiki-shell-mode-games', 'wiki-shell-mode-battle', 'wiki-shell-mode-tool', 'wiki-shell-mode-system', 'wiki-shell-mode-legacy');
    document.body.classList.remove('swarmsy-shell-mode-home', 'swarmsy-shell-mode-wiki', 'swarmsy-shell-mode-games', 'swarmsy-shell-mode-battle', 'swarmsy-shell-mode-tool', 'swarmsy-shell-mode-system', 'swarmsy-shell-mode-legacy');
    document.body.classList.add(`swarmsy-shell-mode-${mode}`);
    if (!document.body.classList.contains('page-standard-shell') && mode !== 'games') {
      document.body.classList.add('page-standard-shell');
    }
  }

  function buildHeaderHtml(navHtml) {
    return `
        <a class="site-logo" href="/index.html" aria-label="Crypto Moonboys home">
          <img src="/CRYPTO-MOONBOYS-BITCOIN-LOGO.png" alt="" width="36" height="36" loading="eager" decoding="async">
          <span><span class="logo-text">THE CRYPTO MOONBOYS GK WIKI</span><span class="logo-sub">LIVE KNOWLEDGE NETWORK</span></span>
        </a>
        <form id="header-search" role="search" action="/search.html">
          <input id="search-input" name="q" type="search" placeholder="Search the wiki…" autocomplete="off" aria-label="Search the wiki">
          <button id="search-btn" type="submit" aria-label="Search">⌕</button>
          <div id="search-results" role="listbox" aria-label="Search suggestions"></div>
        </form>
        <nav id="global-nav" class="header-nav" aria-label="Global navigation">${navHtml}</nav>
      `;
  }

  function ensureSharedHeaderAssets() {
    if (!isWikiShellRoute(window.location.pathname)) return;
    if (!document.querySelector(`link[data-wiki-shared-header-css], link[href="${SHARED_WIKI_HEADER.css}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = SHARED_WIKI_HEADER.css;
      link.setAttribute('data-wiki-shared-header-css', 'swarmsy-lock-v1');
      document.head.append(link);
    }
    if (!document.querySelector(`script[data-wiki-shared-header-js], script[src="${SHARED_WIKI_HEADER.js}"]`)) {
      const script = document.createElement('script');
      script.src = SHARED_WIKI_HEADER.js;
      script.async = true;
      script.setAttribute('data-wiki-shared-header-js', 'swarmsy-lock-v1');
      document.head.append(script);
    }
  }

  function loadSharedHeaderMarkup(navHtml) {
    if (!isWikiShellRoute(window.location.pathname)) {
      return Promise.resolve(buildHeaderHtml(navHtml));
    }
    if (typeof window.fetch !== 'function') {
      return Promise.resolve('');
    }
    if (!sharedHeaderMarkupPromise) {
      sharedHeaderMarkupPromise = window.fetch(SHARED_WIKI_HEADER.html, { credentials: 'same-origin' })
        .then((response) => (response.ok ? response.text() : ''))
        .catch(() => '');
    }
    return sharedHeaderMarkupPromise.then((markup) => (markup && markup.trim()) || '');
  }

  function parseSharedHeaderMarkup(markup) {
    if (!markup || typeof document === 'undefined') return null;
    const template = document.createElement('template');
    template.innerHTML = String(markup).trim();
    return template.content.querySelector('#site-header') || template.content.firstElementChild || null;
  }

  function syncSharedHeaderMarkup(header, navHtml) {
    if (!isWikiShellRoute(window.location.pathname)) return;
    ensureSharedHeaderAssets();
    loadSharedHeaderMarkup(navHtml).then((markup) => {
      if (!header || !header.isConnected || !markup) return;
      if (header.dataset.sharedHeaderMarkup === markup) return;
      const parsedHeader = parseSharedHeaderMarkup(markup);
      if (parsedHeader) {
        header.innerHTML = parsedHeader.innerHTML;
        if (parsedHeader.getAttribute('role')) header.setAttribute('role', parsedHeader.getAttribute('role'));
        if (parsedHeader.hasAttribute('data-wiki-shared-header')) {
          header.setAttribute('data-wiki-shared-header', parsedHeader.getAttribute('data-wiki-shared-header'));
        }
      } else {
        header.innerHTML = markup;
      }
      header.dataset.sharedHeaderMarkup = markup;
      header.dataset.sharedHeaderPath = SHARED_WIKI_HEADER.html;
      const globalNav = document.getElementById('global-nav');
      if (globalNav) globalNav.innerHTML = navHtml;
      bindSearchForm();
    });
  }

  function ensureHeader() {
    let header = document.getElementById('site-header');
    const navHtml = links.map((item) => navLinkHtml(item, 'global-nav-link')).join('');

    if (!header) {
      header = document.createElement('header');
      header.id = 'site-header';
      header.setAttribute('role', 'banner');
      header.innerHTML = buildHeaderHtml(navHtml);
      document.body.insertBefore(header, document.body.firstChild);
    } else {
      let globalNav = document.getElementById('global-nav');
      if (!globalNav) {
        globalNav = document.createElement('nav');
        globalNav.id = 'global-nav';
        globalNav.className = 'header-nav';
        globalNav.setAttribute('aria-label', 'Global navigation');
        header.appendChild(globalNav);
      }
      if (globalNav.parentElement !== header) header.appendChild(globalNav);
      globalNav.className = 'header-nav';
      globalNav.setAttribute('aria-label', 'Global navigation');
      globalNav.innerHTML = navHtml;
      if (!document.getElementById('search-input')) {
        const form = document.createElement('form');
        form.id = 'header-search';
        form.setAttribute('role', 'search');
        form.action = '/search.html';
        form.innerHTML = '<input id="search-input" name="q" type="search" placeholder="Search the wiki…" autocomplete="off" aria-label="Search the wiki"><button id="search-btn" type="submit" aria-label="Search">⌕</button><div id="search-results" role="listbox" aria-label="Search suggestions"></div>';
        header.insertBefore(form, globalNav);
      }
    }

    syncSharedHeaderMarkup(header, navHtml);
    const legacyBareNav = Array.from(document.querySelectorAll('body > #global-nav')).find((node) => node.parentElement !== header);
    if (legacyBareNav) legacyBareNav.remove();
    return header;
  }

  function ensureInlineLiveStats(content) {
    if (!shouldShowInlineStats(window.location.pathname)) return;
    if (content.querySelector('.inline-live-stats')) return;
    const container = document.createElement('div');
    container.className = 'inline-live-stats inline-live-stats--bottom';
    container.setAttribute('aria-label', 'Live player stats');
    container.setAttribute('data-live-stats-position', 'bottom');
    container.innerHTML = `
      <section class="hud-card hud-box hud-box--player" data-csp-panel>
        <h2>PLAYER LIVE FEED</h2>
        <div class="hud-player-card">
          <div id="hud-player-avatar" aria-hidden="true"><span class="hud-avatar-icon">☾</span></div>
          <div><div id="hud-player-name" class="hud-player-name">Telegram not linked</div><p>Link Telegram to see live faction and competitive stats.</p></div>
        </div>
      </section>
      <section class="hud-card hud-box hud-box--actions" data-csp-faction-ops>
        <h2>FACTION DAILY OPS</h2>
        <p>Faction state loads here when competitive systems are online.</p>
      </section>
      <section class="hud-card hud-box hud-box--events" data-csp-wtf-signal>
        <h2>DAILY WTF SIGNAL</h2>
        <p>Daily WTF signal and live events stay isolated to action pages.</p>
      </section>
      <section class="hud-card hud-box hud-box--missed" data-csp-missed>
        <h2>MISSED OPPORTUNITIES</h2>
        <p>Missed rewards and activity notes render without touching wiki articles.</p>
      </section>
    `;
    content.appendChild(container);
  }

  function shouldShowInlineStats(pathname) {
    const p = normalizePathname(pathname || window.location.pathname);
    return [
      '/community.html',
      '/games/',
      '/games/index.html',
      '/games/leaderboard.html',
    ].includes(p);
  }

  function ensureMainContent() {
    let content = document.getElementById('content') || document.querySelector('main');
    if (!content) {
      content = document.createElement('main');
      content.id = 'content';
      content.setAttribute('role', 'main');
      const movable = Array.from(document.body.childNodes).filter((node) => {
        if (node.nodeType === Node.TEXT_NODE) return String(node.textContent || '').trim();
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = node.tagName.toLowerCase();
        return !['script', 'style', 'link', 'header', 'nav'].includes(tag)
          && !['site-header', 'sidebar', 'sidebar-overlay', 'layout'].includes(node.id);
      });
      for (const node of movable) content.appendChild(node);
      document.body.insertBefore(content, document.querySelector('script'));
    }
    if (!content.id) content.id = 'content';
    if (!content.getAttribute('role')) content.setAttribute('role', 'main');
    return content;
  }

  function ensureLayout() {
    const header = ensureHeader();
    const content = ensureMainContent();

    // Remove stale page-has-right-panel class from HTML source (no global right panel).
    document.body.classList.remove('page-has-right-panel');

    let layout = document.getElementById('layout');
    if (!layout) {
      layout = document.createElement('div');
      layout.id = 'layout';
      header.insertAdjacentElement('afterend', layout);
    }

    let mainWrapper = document.getElementById('main-wrapper');
    if (!mainWrapper) {
      mainWrapper = document.createElement('div');
      mainWrapper.id = 'main-wrapper';
    }
    if (mainWrapper.parentElement !== layout) layout.appendChild(mainWrapper);
    if (content.parentElement !== mainWrapper) mainWrapper.insertBefore(content, mainWrapper.firstChild);

    ensureFooter(mainWrapper);
    return { layout, mainWrapper, content };
  }

  function ensureFooter(mainWrapper) {
    let footer = document.getElementById('site-footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.id = 'site-footer';
      footer.innerHTML = '<span>No password account \u00B7 Telegram link for competitive systems \u00B7 Bot-maintained</span>';
    }
    if (footer.parentElement !== mainWrapper) mainWrapper.appendChild(footer);
    return footer;
  }

  function shouldShowRightPanel() {
    return false;
  }

  function ensureRightPanel() {
    let rightPanel = document.getElementById('homepage-right-panel');
    document.body.classList.remove('page-has-right-panel');
    if (rightPanel) rightPanel.remove();
    return null;
  }

  function ensureSwarmsyLandingTighten() {
    if (normalizePathname(window.location.pathname) !== '/swarmsy.html') return;
    document.body.classList.add('swarmsy-landing-tight');
    if (document.getElementById('swarmsy-landing-tight-css')) return;
    const style = document.createElement('style');
    style.id = 'swarmsy-landing-tight-css';
    style.textContent = 'body.page-swarmsy #content{padding-top:0;}body.page-swarmsy .swarmsy-page{margin-top:0;}body.page-swarmsy .swarmsy-hero{margin-top:0;}';
    document.head.appendChild(style);
  }

  function bindSearchForm() {
    const form = document.getElementById('header-search');
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-results');
    if (!form || form.dataset.shellSearchBound) return;
    form.dataset.shellSearchBound = 'true';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const q = input ? String(input.value || '').trim() : '';
      window.location.href = q ? `/search.html?q=${encodeURIComponent(q)}` : '/search.html';
    });
    if (input && dropdown) {
      input.addEventListener('input', () => dropdown.classList.toggle('open', Boolean(input.value.trim())));
      document.addEventListener('click', (event) => {
        if (!form.contains(event.target)) dropdown.classList.remove('open');
      });
    }
  }

  function getTelegramPhotoUrl(gate) {
    if (gate && typeof gate.getTelegramPhotoUrl === 'function') return gate.getTelegramPhotoUrl();
    if (gate && gate.photo_url) return gate.photo_url;
    if (gate && gate.photoUrl) return gate.photoUrl;
    return '';
  }

  function clearHudLivePill(nameEl) {
    if (!nameEl) return;
    const existing = nameEl.querySelector('.hud-live-pill');
    if (existing) existing.remove();
  }

  function resolveHudSignedTelegramAuth(gate) {
    if (gate && typeof gate.restoreLinkedTelegramAuth === 'function') {
      return gate.restoreLinkedTelegramAuth();
    }
    return window.MOONBOYS_TELEGRAM_AUTH || null;
  }

  function renderHudLivePill(nameEl, gate) {
    if (!nameEl) return;
    clearHudLivePill(nameEl);
    const auth = resolveHudSignedTelegramAuth(gate);
    const pill = document.createElement('span');
    pill.className = auth ? 'hud-live-pill' : 'hud-live-pill hud-live-pill--relink';
    pill.textContent = auth ? 'LIVE LINKED' : 'RELINK';
    if (auth && window.MOONBOYS_API_CONFIGURED === false) {
      pill.className = 'hud-live-pill hud-live-pill--pending';
      pill.textContent = 'SYNC PENDING';
    }
    nameEl.appendChild(pill);
  }

  function scheduleHudIdentityRefresh() {
    window.clearTimeout(window.__MOONBOYS_HUD_IDENTITY_REFRESH_TIMER__);
    window.__MOONBOYS_HUD_IDENTITY_REFRESH_TIMER__ = window.setTimeout(refreshHudIdentity, 0);
  }

  function refreshHudIdentity() {
    const gate = window.MOONBOYS_TELEGRAM_GATE || window.IDENTITY_GATE || null;
    const avatar = document.getElementById('hud-player-avatar');
    const nameEl = document.getElementById('hud-player-name');
    if (avatar) {
      const photo = getTelegramPhotoUrl(gate);
      avatar.innerHTML = photo
        ? `<img src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async">`
        : '<span class="hud-avatar-icon" aria-hidden="true">☾</span>';
    }
    if (nameEl) {
      if (!nameEl.firstChild || nameEl.firstChild.nodeType !== Node.TEXT_NODE) nameEl.textContent = 'Telegram not linked';
      renderHudLivePill(nameEl, gate);
    }
  }

  function bindHudIdentityRefresh() {
    if (window.__MOONBOYS_HUD_IDENTITY_REFRESH_BOUND__) return;
    window.__MOONBOYS_HUD_IDENTITY_REFRESH_BOUND__ = true;
    window.addEventListener('moonboys:sync-state', scheduleHudIdentityRefresh);
    window.addEventListener('moonboys:faction-status', scheduleHudIdentityRefresh);
    window.addEventListener('storage', (event) => {
      const key = String(event && event.key || '');
      if (key.indexOf('moonboys_tg_') === 0 || key === 'MOONBOYS_TELEGRAM_AUTH') scheduleHudIdentityRefresh();
    });
  }

  function ensureBackToTop() {
    let button = document.getElementById('back-to-top');
    if (!button) {
      button = document.createElement('button');
      button.id = 'back-to-top';
      button.type = 'button';
      button.setAttribute('aria-label', 'Back to top');
      button.textContent = '↑';
      document.body.appendChild(button);
    }
    if (!button.dataset.shellBound) {
      button.dataset.shellBound = 'true';
      window.addEventListener('scroll', () => button.classList.toggle('visible', window.scrollY > 320), { passive: true });
      button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

  function ensureSwarmsyAgent() {
    if (document.getElementById('site-paperclip-agent')) return;
    const sparkyAgent = document.createElement('a');
    sparkyAgent.id = 'site-paperclip-agent';
    sparkyAgent.href = '/swarmsy.html';
    sparkyAgent.setAttribute('aria-label', 'Open SWARMSY Sparky assistant');
    sparkyAgent.title = 'Open SWARMSY Sparky assistant';
    sparkyAgent.innerHTML = '<img src="/SPARKY%20FLOATING%20CLIP.png" alt="" loading="lazy" decoding="async"><span>SWARMSY</span>';
    document.body.appendChild(sparkyAgent);
  }

  function bootHUD() {
    if (window.__HUD_BOOTED__) return;
    window.__HUD_BOOTED__ = true;
    if (window.HUD_UNIFIED && window.HUD_UNIFIED.init) window.HUD_UNIFIED.init();
    if (window.OS_HUD && window.OS_HUD.init) window.OS_HUD.init();
    if (window.XP_UI && window.XP_UI.init) window.XP_UI.init();
  }

  function ensureNav() {
    stampShellMode();
    const shell = ensureLayout();
    ensureSwarmsyLandingTighten();
    ensureInlineLiveStats(shell.content);
    bindSearchForm();
    bindHudIdentityRefresh();
    scheduleHudIdentityRefresh();
    ensureBackToTop();
    ensureSwarmsyAgent();
    bootHUD();
    return shell;
  }

  function startRecoveryObserver() {
    if (window.__WIKI_SHELL_RECOVERY_BOUND__) return;
    window.__WIKI_SHELL_RECOVERY_BOUND__ = true;
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(() => {
        pending = false;
        const header = document.getElementById('site-header');
        const globalNav = document.getElementById('global-nav');
        if (!header || !isGlobalNavComplete(globalNav) || globalNav.parentElement !== header || !document.getElementById('layout')) {
          ensureNav();
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function bootShell() {
    ensureNav();
    startRecoveryObserver();
  }

  window.MOONBOYS_WIKI_SHELL = Object.freeze({
    CANONICAL_PUBLIC_ROOT,
    links: links.map((item) => ({ label: item.label, href: item.href })),
    ensureNav,
    resolveShellMode,
    resolveCanonicalWikiRoute,
    isWikiShellRoute,
    shouldShowInlineStats,
    shouldShowRightPanel,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootShell);
  } else {
    bootShell();
  }
})();
