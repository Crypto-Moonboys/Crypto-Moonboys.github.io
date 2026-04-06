/**
 * Crypto Moonboys Wiki — API Configuration
 * =========================================
 * Set MOONBOYS_API.BASE_URL to your backend API root when ready.
 * All real persistence (comments, likes, votes, leaderboard, feed)
 * requires an external API — no backend logic lives in this repo.
 *
 * Example: BASE_URL: 'https://api.crypto-moonboys.com/v1'
 *
 * CoinGecko public API is used for live price data (no key required).
 */
window.MOONBOYS_API = {

  /* ── Backend API ─────────────────────────────────────────── */
  // Set this when your backend is live. null = all backend widgets show placeholders.
  BASE_URL: null,

  /* ── CoinGecko public API ────────────────────────────────── */
  COINGECKO_BASE: 'https://api.coingecko.com/api/v3',

  /* ── Feature flags ───────────────────────────────────────── */
  FEATURES: {
    PRICE_TICKER:    true,   // live price data from CoinGecko (no backend needed)
    COMMENTS:        false,  // requires BASE_URL backend
    LIKES:           false,  // requires BASE_URL backend
    CITATION_VOTES:  false,  // requires BASE_URL backend
    LEADERBOARD:     false,  // requires BASE_URL backend
    LIVE_FEED:       false,  // requires BASE_URL backend
    SAM_STATUS:      false,  // requires BASE_URL backend
  },

  /* ── Tracked price assets ────────────────────────────────── */
  // CoinGecko coin IDs → display metadata
  TRACKED_ASSETS: [
    { id: 'wax',          symbol: 'WAXP', label: 'WAX',          icon: '💰' },
    { id: 'bitcoin',      symbol: 'BTC',  label: 'Bitcoin',      icon: '₿'  },
    { id: 'ethereum',     symbol: 'ETH',  label: 'Ethereum',     icon: 'Ξ'  },
    { id: 'bitcoin-cash', symbol: 'BCH',  label: 'Bitcoin Cash', icon: '₿C' },
    { id: 'ripple',       symbol: 'XRP',  label: 'XRP',          icon: '✕'  },
  ],
};
