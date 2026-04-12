/**
 * Crypto Moonboys Wiki — API Configuration
 * =========================================
 * This file centralizes all configuration for the Moonboys engagement layer.
 *
 * 🔧 IMPORTANT:
 * - Set MOONBOYS_API.BASE_URL to your deployed Cloudflare Worker endpoint.
 * - When BASE_URL is null, all backend-driven features gracefully fall back
 *   to placeholder content.
 *
 * Example Worker URL:
 *   https://moonboys-api.your-domain.workers.dev
 *
 * CoinGecko public API is used for live price data and requires no API key.
 */

window.MOONBOYS_API = {

  /* ── Backend API ─────────────────────────────────────────── */
  // Replace with your actual Cloudflare Worker URL once deployed.
  BASE_URL: 'https://moonboys-api.your-domain.workers.dev',
  // Example alternative:
  // BASE_URL: 'https://moonboys-api.sercullen.workers.dev',

  /* ── CoinGecko Public API ────────────────────────────────── */
  COINGECKO_BASE: 'https://api.coingecko.com/api/v3',

  /* ── Feature Flags ───────────────────────────────────────── */
  // All engagement features are enabled. They will only function
  // when BASE_URL points to a live backend.
  FEATURES: {
    PRICE_TICKER:   true,  // Live crypto price data
    COMMENTS:       true,  // Article and community comments
    LIKES:          true,  // Page likes and engagement
    CITATION_VOTES: true,  // Up/down voting for citations
    LEADERBOARD:    true,  // Top contributors leaderboard
    LIVE_FEED:      true,  // Real-time activity feed
    SAM_STATUS:     true,  // SAM agent status widget
    ACTIVITY_PANEL: true,  // Trending / hot pages
  },

  /* ── Gravatar Configuration ──────────────────────────────── */
  // Avatars are generated using an MD5 hash of the user's email.
  // If no Gravatar exists, an identicon is displayed.
  GRAVATAR: {
    BASE: 'https://www.gravatar.com/avatar/',
    DEFAULT: 'identicon',
    SIZE: 64
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

  /* ── Environment Metadata (Optional but Useful) ──────────── */
  ENV: {
    NAME: 'production',
    VERSION: '1.0.0'
  }
};
