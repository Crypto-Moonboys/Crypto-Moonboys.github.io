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

  var api = window.MOONBOYS_API && typeof window.MOONBOYS_API === 'object'
    ? window.MOONBOYS_API
    : {};
  var PRODUCTION_BASE_URL = 'https://moonboys-api.sercullen.workers.dev';
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
  // URL shown to users who attempt a competitive action without Telegram sync.
  SYNC_GATE_URL: 'https://cryptomoonboys.com/gkniftyheads-incubator.html',

  /* ── CoinGecko Public API ────────────────────────────────── */
  // Used for live cryptocurrency price data (no API key required).
  COINGECKO_BASE: 'https://api.coingecko.com/api/v3',

  /* ── Feature Flags ───────────────────────────────────────── */
  // Engagement features stay false until the matching Worker deploy and
  // required D1 migrations are live. This keeps pages from calling routes
  // before their backing tables exist.
  FEATURES: {
    PRICE_TICKER:       true,   // Live crypto price data (CoinGecko — no worker needed)
    COMMENTS:           false,  // Article comments — requires Worker deploy + migration 029
    LIKES:              false,  // Page likes — requires Worker deploy + migration 029
    CITATION_VOTES:     false,  // Citation votes — requires Worker deploy + migration 029
    LEADERBOARD:        false,  // Engagement leaderboard — moonboys-api /leaderboard endpoint not yet live
    ARCADE_LEADERBOARD: true,   // Arcade score-submission worker (moonboys-leaderboard.sercullen.workers.dev) — live
    LIVE_FEED:          false,  // Activity feed — /feed endpoint not yet live
    SAM_STATUS:         true,   // SAM agent status widget (/sam/status — live)
    ACTIVITY_PANEL:     false,  // Trending pages — /activity/hot endpoint not yet live
    TELEGRAM_LOGIN:     true,   // Telegram Login Widget prefill (requires TELEGRAM_BOT_USERNAME)
    TELEGRAM_COMMUNITY: true,   // Telegram XP / quest / community leaderboard panels (live)
  },

  /* ── Telegram Login Widget ───────────────────────────────── */
  // Set to your bot's @username (without the @) to enable the Telegram Login
  // Widget in the comment identity form.  The widget prefills telegram_username
  // and avatar_url; email and display name remain required.
  // Leave as null to hide the widget.
  TELEGRAM_BOT_USERNAME: 'WIKICOMSBOT',

  /* ── Gravatar Configuration ──────────────────────────────── */
  // Avatars are generated using a SHA-256 hash of the user's email.
  // If no Gravatar exists, an identicon is displayed.
  GRAVATAR: {
    BASE: 'https://www.gravatar.com/avatar/',
    DEFAULT: 'identicon',
    SIZE: 64,
    RATING: 'g' // Ensures family-friendly avatars
  },

  /* ── Tracked Price Assets ───────────────────────────────── */
  // CoinGecko coin IDs mapped to display metadata.
  TRACKED_ASSETS: [
    { id: 'wax',          symbol: 'WAXP', label: 'WAX',          icon: '💰' },
    { id: 'bitcoin',      symbol: 'BTC',  label: 'Bitcoin',      icon: '₿'  },
    { id: 'ethereum',     symbol: 'ETH',  label: 'Ethereum',     icon: 'Ξ'  },
    { id: 'bitcoin-cash', symbol: 'BCH',  label: 'Bitcoin Cash', icon: '₿C' },
    { id: 'ripple',       symbol: 'XRP',  label: 'XRP',          icon: '✕'  },
  ],

  /* ── WAX DEX Tokens ──────────────────────────────────────── */
  // WAX-chain DEX tokens fetched from Alcor Exchange (wax.alcor.exchange).
  // Not available on CoinGecko — shown with graceful fallback if API unavailable.
  WAX_DEX_ASSETS: [
    { symbol: 'WAXCASH', label: 'WAXCASH', icon: '💵', contract: 'waxcash.gm' },
    { symbol: 'NBG',     label: 'NBG',     icon: '🟢', contract: 'nebulablockgames' },
    { symbol: 'WUFFI',   label: 'WUFFI',   icon: '🐾', contract: 'wuffi' },
    { symbol: 'PXJ',     label: 'PXJ',     icon: '🎮', contract: 'pxjtoken' },
    { symbol: 'WAXUSDC', label: 'WAXUSDC', icon: '💲', contract: 'waxusdc' },
    { symbol: 'WAXUSDT', label: 'WAXUSDT', icon: '💱', contract: 'waxusdt' },
    { symbol: 'LSWAX',   label: 'LSWAX',   icon: '🔒', contract: 'lswaxtoken' },
    { symbol: 'CHEESE',  label: 'CHEESE',  icon: '🧀', contract: 'cheesetoken' },
    { symbol: 'KING',    label: 'KING',    icon: '👑', contract: 'kingtoken' },
    { symbol: 'DMT',     label: 'DMT',     icon: '🌀', contract: 'dmttoken' },
    { symbol: 'KEK',     label: 'KEK',     icon: '🐸', contract: 'kektoken' },
  ],

  /* ── Environment Metadata ───────────────────────────────── */
  // BUILD_DATE is reserved for an explicitly injected/static build timestamp.
  // RUNTIME_LOADED_AT is the per-page-load runtime timestamp.
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
  // Centralized settings for frontend behaviour.
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
