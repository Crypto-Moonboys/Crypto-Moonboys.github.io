/**
 * Crypto Moonboys Wiki — API Configuration
 * =========================================
 * Centralized configuration for all Moonboys engagement and data services.
 *
 * This file controls:
 * - Backend API connectivity (comments, likes, votes, leaderboard, feed)
 * - Gravatar avatar generation
 * - CoinGecko price data
 * - Feature toggles
 * - Environment metadata for debugging and versioning
 *
 * When BASE_URL is set to null, all backend-driven features gracefully
 * fall back to placeholder content. Once a live endpoint is provided,
 * all engagement features automatically activate.
 */

window.MOONBOYS_API = {

  /* ── Backend API ─────────────────────────────────────────── */
  // Live Cloudflare Worker endpoint powering all engagement features.
  BASE_URL: 'https://moonboys-api.sercullen.workers.dev',

  /* ── CoinGecko Public API ────────────────────────────────── */
  // Used for live cryptocurrency price data (no API key required).
  COINGECKO_BASE: 'https://api.coingecko.com/api/v3',

  /* ── Feature Flags ───────────────────────────────────────── */
  // All engagement features are enabled. These rely on BASE_URL.
  FEATURES: {
    PRICE_TICKER:   true,  // Live crypto price data
    COMMENTS:       true,  // Article and community comments
    LIKES:          true,  // Page likes and engagement
    CITATION_VOTES: true,  // Up/down voting for citations
    LEADERBOARD:    true,  // Top contributors leaderboard
    LIVE_FEED:      true,  // Real-time activity feed
    SAM_STATUS:     true,  // SAM agent status widget
    ACTIVITY_PANEL: true,  // Trending / hot pages
    TELEGRAM_LOGIN: true,  // Telegram Login Widget prefill (requires TELEGRAM_BOT_USERNAME)
  },

  /* ── Telegram Login Widget ───────────────────────────────── */
  // Set to your bot's @username (without the @) to enable the Telegram Login
  // Widget in the comment identity form.  The widget prefills telegram_username
  // and avatar_url; email and display name remain required.
  // Leave as null to hide the widget.
  TELEGRAM_BOT_USERNAME: null,

  /* ── Gravatar Configuration ──────────────────────────────── */
  // Avatars are generated using an MD5 hash of the user's email.
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

  /* ── Environment Metadata ───────────────────────────────── */
  // Useful for debugging, analytics, and future multi-environment setups.
  ENV: {
    NAME: 'production',
    VERSION: '1.0.0',
    BUILD_DATE: new Date().toISOString(),
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
};
