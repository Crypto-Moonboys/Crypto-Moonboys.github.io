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

window.MOONBOYS_API = window.MOONBOYS_API || {};
if (!window.MOONBOYS_API.BASE_URL) {
  window.MOONBOYS_API.BASE_URL = "https://moonboys-api.sercullen.workers.dev";
}
// Centralised leaderboard URL — consumed by js/leaderboard-client.js.
// Always set this here so leaderboard-client.js does not need a hardcoded fallback.
if (!window.MOONBOYS_API.LEADERBOARD_URL) {
  window.MOONBOYS_API.LEADERBOARD_URL = "https://moonboys-leaderboard.sercullen.workers.dev";
}

Object.assign(window.MOONBOYS_API, {

  /* ── Backend API ─────────────────────────────────────────── */
  /* ── Identity Sync Gate ──────────────────────────────────── */
  // URL shown to users who attempt a competitive action without Telegram sync.
  SYNC_GATE_URL: 'https://cryptomoonboys.com/gkniftyheads-incubator.html',

  /* ── CoinGecko Public API ────────────────────────────────── */
  // Used for live cryptocurrency price data (no API key required).
  COINGECKO_BASE: 'https://api.coingecko.com/api/v3',

  /* ── Feature Flags ───────────────────────────────────────── */
  // Engagement features that require backend routes not yet provisioned
  // in the moonboys-api worker are set to false so the UI shows honest
  // "coming soon" placeholders instead of network errors.
  FEATURES: {
    PRICE_TICKER:       true,   // Live crypto price data (CoinGecko — no worker needed)
    COMMENTS:           false,  // Article comments — /comments endpoint not yet live
    LIKES:              false,  // Page likes — /likes endpoint not yet live
    CITATION_VOTES:     false,  // Citation votes — /citation-votes endpoint not yet live
    LEADERBOARD:        true,   // Engagement leaderboard — live at moonboys-leaderboard.sercullen.workers.dev
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
});
