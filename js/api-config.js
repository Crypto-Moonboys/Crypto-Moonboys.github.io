/**
 * Crypto Moonboys Wiki — API Configuration
 * =========================================
 * Canonical frontend API configuration and runtime context detection.
 *
 * This file is the single source of truth for:
 * - Worker API base URLs
 * - Production fallback policy
 * - Runtime environment metadata
 * - Shared frontend status copy for API/auth sync messaging
 *
 * Rules:
 * - Production fallback is allowed only on the live production hosts.
 * - Local/dev/staging previews must opt in with explicit config instead of
 *   silently drifting to the production Worker.
 * - `BASE_URL = null` or `LEADERBOARD_URL = null` explicitly disables that
 *   endpoint for the current page/runtime.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  var wikiPathname = window.location && typeof window.location.pathname === 'string'
    ? window.location.pathname
    : '';

  function loadScriptOnce(src, marker) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[' + marker + ']');
      if (existing) {
        if (existing.dataset.loaded === 'true') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.setAttribute('data-cfasync', 'false');
      script.setAttribute(marker, 'true');
      script.addEventListener('load', function () {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.body.appendChild(script);
    });
  }

  function restoreCryptoPetsEngagementDeck() {
    if (wikiPathname !== '/wiki/crypto-moonboy-pets.html') return;

    if (!document.querySelector('link[data-crypto-pets-battle-layer]')) {
      var battleCss = document.createElement('link');
      battleCss.rel = 'stylesheet';
      battleCss.href = '/css/battle-layer.css';
      battleCss.setAttribute('data-crypto-pets-battle-layer', 'true');
      document.head.appendChild(battleCss);
    }

    var article = document.querySelector('article[data-entity-slug="crypto-moonboy-pets"]');
    if (article && !document.querySelector('.wiki-comments[data-page-id="crypto-moonboy-pets"]')) {
      var commentsMount = document.createElement('div');
      commentsMount.className = 'wiki-comments';
      commentsMount.setAttribute('data-page-id', 'crypto-moonboy-pets');
      article.insertAdjacentElement('afterend', commentsMount);
    }

    loadScriptOnce('/js/engagement.js', 'data-crypto-pets-engagement')
      .then(function () { return loadScriptOnce('/js/comments.js', 'data-crypto-pets-comments'); })
      .then(function () { return loadScriptOnce('/js/battle-layer.js', 'data-crypto-pets-battle-script'); })
      .catch(function (error) {
        console.error('[crypto-moonboy-pets] engagement deck load failed', error);
      });
  }

  if (typeof document !== 'undefined' && wikiPathname === '/wiki/crypto-moonboy-pets.html') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', restoreCryptoPetsEngagementDeck, { once: true });
    } else {
      restoreCryptoPetsEngagementDeck();
    }
  }

  if (
    typeof document !== 'undefined' &&
    wikiPathname.indexOf('/wiki/') === 0 &&
    !document.querySelector('link[data-wiki-engagement-layout-fix]')
  ) {
    var engagementLayoutFix = document.createElement('link');
    engagementLayoutFix.rel = 'stylesheet';
    engagementLayoutFix.href = '/css/wiki-engagement-layout-fix.css';
    engagementLayoutFix.setAttribute('data-wiki-engagement-layout-fix', 'true');
    document.head.appendChild(engagementLayoutFix);
  }

  if (
    typeof document !== 'undefined' &&
    wikiPathname.indexOf('/wiki/') === 0 &&
    !document.querySelector('script[data-wiki-flagship-migrator]')
  ) {
    var migratorSrc = '/js/wiki-flagship-migrator.js?v=20260729-full-width-5';

    if (document.readyState === 'loading') {
      document.write(
        '<script data-cfasync="false" data-wiki-flagship-migrator="true" src="' +
        migratorSrc +
        '"><\/script>'
      );
    } else {
      var flagshipMigrator = document.createElement('script');
      flagshipMigrator.src = migratorSrc;
      flagshipMigrator.async = false;
      flagshipMigrator.setAttribute('data-cfasync', 'false');
      flagshipMigrator.setAttribute('data-wiki-flagship-migrator', 'true');
      document.head.appendChild(flagshipMigrator);
    }
  }

  var api = window.MOONBOYS_API && typeof window.MOONBOYS_API === 'object'
    ? window.MOONBOYS_API
    : {};
  var PRODUCTION_BASE_URL = 'https://api.cryptomoonboys.com';
  var PRODUCTION_LEADERBOARD_URL = 'https://moonboys-leaderboard.sercullen.workers.dev';
  var PRODUCTION_HOSTS = Object.freeze([
    'cryptomoonboys.com',
    'www.cryptomoonboys.com',
    'crypto-moonboys.github.io',
  ]);

  function hasOwn(obj, key) {
    return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
  }

  function normalizeUrl(value) {
    if (value == null) return '';
    var normalized = String(value).trim().replace(/\/$/, '');
    return normalized || '';
  }

  function resolveExplicitUrl(kind) {
    var candidates = kind === 'leaderboard'
      ? [
          { present: hasOwn(api, 'LEADERBOARD_URL'), value: api.LEADERBOARD_URL, source: 'window.MOONBOYS_API.LEADERBOARD_URL' },
          { present: typeof window.LEADERBOARD_API_URL !== 'undefined', value: window.LEADERBOARD_API_URL, source: 'window.LEADERBOARD_API_URL' },
        ]
      : [
          { present: hasOwn(api, 'BASE_URL'), value: api.BASE_URL, source: 'window.MOONBOYS_API.BASE_URL' },
          { present: !!(window.API_CONFIG && hasOwn(window.API_CONFIG, 'BASE_URL')), value: window.API_CONFIG && window.API_CONFIG.BASE_URL, source: 'window.API_CONFIG.BASE_URL' },
          { present: !!(window.MOONBOYS_CONFIG && hasOwn(window.MOONBOYS_CONFIG, 'API_BASE')), value: window.MOONBOYS_CONFIG && window.MOONBOYS_CONFIG.API_BASE, source: 'window.MOONBOYS_CONFIG.API_BASE' },
        ];

    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      if (!candidate.present) continue;
      if (candidate.value == null) {
        return {
          url: '',
          explicit: true,
          disabled: true,
          source: candidate.source,
        };
      }
      var url = normalizeUrl(candidate.value);
      if (!url) continue;
      return {
        url: url,
        explicit: true,
        disabled: false,
        source: candidate.source,
      };
    }

    return {
      url: '',
      explicit: false,
      disabled: false,
      source: null,
    };
  }

  function detectContext() {
    var loc = window.location || {};
    var protocol = String(loc.protocol || '').toLowerCase();
    var hostname = String(loc.hostname || '').toLowerCase();
    var localHosts = {
      localhost: true,
      '127.0.0.1': true,
      '0.0.0.0': true,
      '::1': true,
      '[::1]': true,
    };
    var isLocalPreview = protocol === 'file:' || !!localHosts[hostname] || /\.local$/i.test(hostname);
    var isProduction = PRODUCTION_HOSTS.indexOf(hostname) !== -1;
    var name = isProduction ? 'production' : (isLocalPreview ? 'local-preview' : 'preview');
    return {
      name: name,
      protocol: protocol || null,
      hostname: hostname || null,
      origin: normalizeUrl(loc.origin || ''),
      isProduction: isProduction,
      isLocalPreview: isLocalPreview,
    };
  }

  var context = detectContext();
  var explicitBaseConfig = resolveExplicitUrl('base');
  var explicitLeaderboardConfig = resolveExplicitUrl('leaderboard');

  function getEndpointInfo(kind, options) {
    var explicit = kind === 'leaderboard' ? explicitLeaderboardConfig : explicitBaseConfig;
    var productionUrl = kind === 'leaderboard' ? PRODUCTION_LEADERBOARD_URL : PRODUCTION_BASE_URL;
    var allowProductionFallback = options && hasOwn(options, 'allowProductionFallback')
      ? !!options.allowProductionFallback
      : context.isProduction;
    if (explicit.url) {
      return {
        endpoint: kind,
        url: explicit.url,
        available: true,
        explicit: true,
        disabled: false,
        usingProductionFallback: false,
        source: explicit.source,
        state: 'configured',
        summary: 'Server confirmed',
        detail: 'API configured for this context',
        context: context,
      };
    }
    if (explicit.disabled) {
      return {
        endpoint: kind,
        url: '',
        available: false,
        explicit: true,
        disabled: true,
        usingProductionFallback: false,
        source: explicit.source,
        state: 'disabled',
        summary: 'Endpoint disabled',
        detail: 'API endpoint disabled for this context',
        context: context,
      };
    }
    if (allowProductionFallback) {
      return {
        endpoint: kind,
        url: productionUrl,
        available: true,
        explicit: false,
        disabled: false,
        usingProductionFallback: true,
        source: 'production_fallback',
        state: 'production_fallback',
        summary: 'Server confirmed',
        detail: 'Using centralized production API fallback',
        context: context,
      };
    }
    return {
      endpoint: kind,
      url: '',
      available: false,
      explicit: false,
      disabled: false,
      usingProductionFallback: false,
      source: null,
      state: 'config_required',
      summary: 'API config required',
      detail: 'Production API not configured for this context',
      context: context,
    };
  }

  function getBuildDate() {
    var candidates = [
      window.MOONBOYS_BUILD_DATE,
      api.ENV && api.ENV.BUILD_DATE,
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var value = candidates[i];
      if (typeof value !== 'string') continue;
      var trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    return null;
  }

  api.PRODUCTION_BASE_URL = PRODUCTION_BASE_URL;
  api.PRODUCTION_LEADERBOARD_URL = PRODUCTION_LEADERBOARD_URL;
  api.CONTEXT = context;
  api.STATUS = Object.freeze({
    API_CONFIG_REQUIRED: 'API config required',
    ENDPOINT_DISABLED: 'Endpoint disabled',
    ENDPOINT_DISABLED_FOR_CONTEXT: 'API endpoint disabled for this context',
    SYNC_PENDING: 'Sync pending',
    SERVER_UNAVAILABLE: 'Server unavailable',
    PRODUCTION_API_NOT_CONFIGURED: 'Production API not configured for this context',
    LOCAL_CACHED_ONLY: 'Local cached only',
    PUBLIC_SCORE_SUBMITTED: 'Public score submitted',
    COMPETITIVE_XP_SYNCED: 'Competitive XP synced',
    SIGNED_AUTH_MISSING: 'Signed Telegram auth missing',
    SERVER_CONFIRMED: 'Server confirmed',
  });
  api.getApiBaseInfo = function (options) {
    return getEndpointInfo('base', options);
  };
  api.getLeaderboardApiInfo = function (options) {
    return getEndpointInfo('leaderboard', options);
  };
  api.getApiBase = function (options) {
    return getEndpointInfo('base', options).url;
  };
  api.getLeaderboardUrl = function (options) {
    return getEndpointInfo('leaderboard', options).url;
  };
  api.BASE_URL = api.getApiBase() || null;
  api.LEADERBOARD_URL = api.getLeaderboardUrl() || null;

  Object.assign(api, {

  /* ── Backend API ─────────────────────────────────────────── */
  /* ── Identity Sync Gate ──────────────────────────────────── */
  SYNC_GATE_URL: 'https://cryptomoonboys.com/gkniftyheads-incubator.html',

  /* ── Dead Run Map Tiles ──────────────────────────────────── */
  DEAD_RUN_TILE_URL: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  DEAD_RUN_TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',

  /* ── CoinGecko Public API ────────────────────────────────── */
  COINGECKO_BASE: 'https://api.coingecko.com/api/v3',

  /* ── Feature Flags ───────────────────────────────────────── */
  FEATURES: {
    PRICE_TICKER:       true,
    COMMENTS:           true,
    LIKES:              true,
    CITATION_VOTES:     true,
    LEADERBOARD:        false,
    ARCADE_LEADERBOARD: true,
    LIVE_FEED:          false,
    SAM_STATUS:         true,
    ACTIVITY_PANEL:     false,
    TELEGRAM_LOGIN:     true,
    TELEGRAM_COMMUNITY: true,
  },

  /* ── Telegram Login Widget ───────────────────────────────── */
  TELEGRAM_BOT_USERNAME: 'WIKICOMSBOT',

  /* ── Gravatar Configuration ──────────────────────────────── */
  GRAVATAR: {
    BASE: 'https://www.gravatar.com/avatar/',
    DEFAULT: 'identicon',
    SIZE: 64,
    RATING: 'g'
  },

  /* ── Tracked Price Assets ───────────────────────────────── */
  TRACKED_ASSETS: [
    { id: 'wax',          symbol: 'WAXP', label: 'WAX',          icon: '💰' },
    { id: 'bitcoin',      symbol: 'BTC',  label: 'Bitcoin',      icon: '₿'  },
    { id: 'ethereum',     symbol: 'ETH',  label: 'Ethereum',     icon: 'Ξ'  },
    { id: 'bitcoin-cash', symbol: 'BCH',  label: 'Bitcoin Cash', icon: '₿C' },
    { id: 'ripple',       symbol: 'XRP',  label: 'XRP',          icon: '✕'  },
  ],

  /* ── Environment Metadata ───────────────────────────────── */
  ENV: {
    NAME: context.name,
    VERSION: '1.0.0',
    BUILD_DATE: getBuildDate(),
    BUILD_DATE_SOURCE: getBuildDate() ? 'injected' : 'unavailable',
    RUNTIME_LOADED_AT: new Date().toISOString(),
    PLATFORM: 'github-pages',
    BACKEND: 'cloudflare-workers'
  },

  /* ── UI & Engagement Defaults ───────────────────────────── */
  UI: {
    DEFAULT_AVATAR: 'identicon',
    LEADERBOARD_LIMIT: 10,
    FEED_LIMIT: 5,
    COMMENTS_LIMIT: 50,
    ENABLE_FACTION_SYSTEM: true,
    ENABLE_MISSIONS: true,
    ENABLE_BATTLE_LAYER: true
  }
  });

  window.MOONBOYS_API = api;
}());