/**
 * waxonedge-sources.js
 *
 * Read-only data source configuration for the WAXONEDGE WAX analytics dashboard.
 * All endpoints are public, unauthenticated, read-only APIs.
 * No wallet signing, no transaction submission, no private-key handling.
 */

/* global window */

(function () {
  'use strict';

  /** Alcor Exchange public WAX REST API v2 */
  var ALCOR_API = 'https://wax.alcor.exchange/api/v2';

  /** WAX Hyperion history v2 (transfers, actions, account-token balances) */
  var HYPERION_API = 'https://wax.eosusa.io/v2';

  /** WAX Chain RPC — get_table_rows, get_abi, etc. */
  var WAX_RPC = 'https://wax.greymass.com';

  /** Fallback WAX RPC endpoints (tried in order when primary is unavailable) */
  var WAX_RPC_FALLBACKS = [
    'https://api.waxsweden.org',
    'https://wax.cryptolions.io',
  ];

  /** swap.nefty DEX contract on WAX */
  var NEFTY_CONTRACT = 'swap.nefty';

  /** WaxBlock explorer base URL */
  var WAXBLOCK_BASE = 'https://waxblock.io';

  /** Direct WaxBlock explorer link for the swap.nefty contract */
  var NEFTY_WAXBLOCK_LINK = 'https://waxblock.io/account/swap.nefty';

  /**
   * All tracked data sources with display metadata and health-check URLs.
   * Each entry has: id, label, description, baseUrl, healthPath, explorerLink (optional)
   */
  var WAXONEDGE_SOURCES = [
    {
      id: 'alcor-tokens',
      label: 'Alcor Tokens',
      description: 'WAX token registry via Alcor Exchange',
      baseUrl: ALCOR_API,
      healthPath: '/tokens',
      docsUrl: 'https://wax.alcor.exchange',
    },
    {
      id: 'alcor-pairs',
      label: 'Alcor Pairs',
      description: 'WAX pair registry and pool definitions',
      baseUrl: ALCOR_API,
      healthPath: '/pairs',
      docsUrl: 'https://wax.alcor.exchange',
    },
    {
      id: 'alcor-tickers',
      label: 'Alcor Tickers',
      description: 'Live price tickers for all WAX pairs',
      baseUrl: ALCOR_API,
      healthPath: '/tickers',
      docsUrl: 'https://wax.alcor.exchange',
    },
    {
      id: 'alcor-analytics',
      label: 'Alcor Analytics',
      description: 'Global WAX DEX analytics snapshot',
      baseUrl: ALCOR_API,
      healthPath: '/analytics/global',
      docsUrl: 'https://wax.alcor.exchange',
    },
    {
      id: 'hyperion',
      label: 'WAX Hyperion',
      description: 'WAX history API — transfers and account data',
      baseUrl: HYPERION_API,
      healthPath: '/health',
      docsUrl: 'https://wax.eosusa.io',
    },
    {
      id: 'wax-rpc',
      label: 'WAX Chain RPC',
      description: 'WAX chain tables, ABI, and contract data',
      baseUrl: WAX_RPC,
      healthPath: '/v1/chain/get_info',
      docsUrl: 'https://wax.greymass.com',
    },
    {
      id: 'nefty-contract',
      label: 'swap.nefty',
      description: 'NeftyBlocks DEX contract on WAX chain',
      baseUrl: WAX_RPC,
      healthPath: '/v1/chain/get_info',
      explorerLink: NEFTY_WAXBLOCK_LINK,
      docsUrl: 'https://github.com/neftyblocks',
    },
  ];

  /** Alcor API endpoint paths */
  var ALCOR_PATHS = {
    tokens: '/tokens',
    pairs: '/pairs',
    tickers: '/tickers',
    analyticsGlobal: '/analytics/global',
  };

  /** WAX Chain RPC paths */
  var WAX_RPC_PATHS = {
    getInfo:       '/v1/chain/get_info',
    getAbi:        '/v1/chain/get_abi',
    getTableRows:  '/v1/chain/get_table_rows',
  };

  /** Hyperion v2 paths */
  var HYPERION_PATHS = {
    health:    '/health',
    getTokens: '/state/get_tokens',   // ?account=<name>
    transfers: '/history/get_actions', // ?account=<name>&filter=eosio.token:transfer
  };

  /** swap.nefty table configuration for get_table_rows */
  var NEFTY_TABLES = {
    pools: {
      code:  NEFTY_CONTRACT,
      scope: NEFTY_CONTRACT,
      table: 'pools',
    },
    pairs: {
      code:  NEFTY_CONTRACT,
      scope: NEFTY_CONTRACT,
      table: 'pairs',
    },
  };

  /* ── Public surface ──────────────────────────────────────────── */
  window.WAXONEDGE_SOURCES    = WAXONEDGE_SOURCES;
  window.WAXONEDGE_ALCOR_API  = ALCOR_API;
  window.WAXONEDGE_HYPERION   = HYPERION_API;
  window.WAXONEDGE_WAX_RPC    = WAX_RPC;
  window.WAXONEDGE_WAX_RPC_FALLBACKS = WAX_RPC_FALLBACKS;
  window.WAXONEDGE_NEFTY_CONTRACT    = NEFTY_CONTRACT;
  window.WAXONEDGE_WAXBLOCK_BASE     = WAXBLOCK_BASE;
  window.WAXONEDGE_NEFTY_WAXBLOCK_LINK = NEFTY_WAXBLOCK_LINK;
  window.WAXONEDGE_ALCOR_PATHS  = ALCOR_PATHS;
  window.WAXONEDGE_RPC_PATHS    = WAX_RPC_PATHS;
  window.WAXONEDGE_HYPERION_PATHS = HYPERION_PATHS;
  window.WAXONEDGE_NEFTY_TABLES   = NEFTY_TABLES;
}());
