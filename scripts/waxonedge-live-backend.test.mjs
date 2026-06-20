import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return existsSync(path.join(ROOT, rel));
}

function hasRealColumn(sql) {
  return sql.split(/\r?\n/).some((line) => /^\s+[A-Za-z_][A-Za-z0-9_]*\s+REAL\b/i.test(line));
}

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log('PASS: ' + label);
    passed += 1;
  } else {
    console.error('FAIL: ' + label + (detail ? ' - ' + detail : ''));
    failed += 1;
  }
}

function almostEqual(a, b, epsilon = 1e-9) {
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

ok('moonboys-api WaxOnEdge route module exists', exists('workers/moonboys-api/routes/waxonedge.js'));
ok('moonboys-api WaxOnEdge migration exists', exists('workers/moonboys-api/migrations/022_waxonedge_live_indexer.sql'));
ok('moonboys-api WaxOnEdge aggregate migration exists', exists('workers/moonboys-api/migrations/023_waxonedge_token_aggregate_stats.sql'));
ok('moonboys-api WaxOnEdge aggregate source coverage migration exists', exists('workers/moonboys-api/migrations/024_waxonedge_aggregate_source_coverage.sql'));
ok('moonboys-api WaxOnEdge source index state migration exists', exists('workers/moonboys-api/migrations/025_waxonedge_source_index_state.sql'));
ok('WaxOnEdge real reference audit exists', exists('docs/waxonedge-real-reference-audit.md'));

const route = read('workers/moonboys-api/routes/waxonedge.js');
const normalizedRoute = route.replace(/\r\n/g, '\n');
const worker = read('workers/moonboys-api/worker.js');
const wrangler = read('workers/moonboys-api/wrangler.toml');
const ci = read('.github/workflows/ci.yml');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const migration = read('workers/moonboys-api/migrations/022_waxonedge_live_indexer.sql');
const aggregateMigration = read('workers/moonboys-api/migrations/023_waxonedge_token_aggregate_stats.sql');
const sourceCoverageMigration = read('workers/moonboys-api/migrations/024_waxonedge_aggregate_source_coverage.sql');
const sourceStateMigration = read('workers/moonboys-api/migrations/025_waxonedge_source_index_state.sql');
const frontend = read('js/waxonedge.js');
const frontendBubbles = read('js/waxonedge-bubbles-v2.js');
const waxcashGraphFrontend = read('js/waxcash-graph.js');
const featuredTokens = read('js/waxonedge-featured-tokens.js');
const frontendSources = read('js/waxonedge-sources.js');
const waxcashAnalyticsFrontend = read('js/waxcash-analytics.js');
const html = read('waxonedge.html');
const waxcashHtml = read('waxcash.html');
const tokenHtml = read('analytics/token/index.html');
const { __waxonedgeTestHooks } = await import(pathToFileURL(path.join(ROOT, 'workers/moonboys-api/routes/waxonedge.js')).href);
const liveIndexer = await import(pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/src/index.mjs')).href);
const referenceAudit = read('docs/waxonedge-real-reference-audit.md');
const adapterContractDoc = read('docs/waxonedge-dex-adapter-contract.md');
const liveIndexerPackage = JSON.parse(read('services/waxonedge-live-indexer/package.json'));
const liveIndexerReadme = read('services/waxonedge-live-indexer/README.md');
const liveIndexerEnvExample = read('services/waxonedge-live-indexer/.env.example');
const liveIndexerDeploy = read('services/waxonedge-live-indexer/DEPLOY.md');
const liveIndexerProdEnvExample = read('services/waxonedge-live-indexer/.env.production.example');
const liveIndexerSystemd = read('services/waxonedge-live-indexer/waxonedge-live-indexer.service.example');
const liveIndexerCheckScript = read('services/waxonedge-live-indexer/scripts/check-live-indexer.mjs');
const liveIndexerSource = read('services/waxonedge-live-indexer/src/index.mjs');
const liveIndexerCheck = await import(pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/scripts/check-live-indexer.mjs')).href);

for (const table of [
  'waxonedge_sync_runs',
  'waxonedge_snapshots',
  'waxonedge_tokens',
  'waxonedge_pairs',
  'waxonedge_token_stats',
  'waxonedge_holders',
  'waxonedge_chart_candles',
  'waxonedge_trades',
]) {
  ok('migration defines ' + table, migration.includes('CREATE TABLE IF NOT EXISTS ' + table));
}
ok('source state migration defines resumable checkpoint table',
  sourceStateMigration.includes('CREATE TABLE IF NOT EXISTS waxonedge_source_index_state') &&
  ['source TEXT PRIMARY KEY', 'sync_cycle_id TEXT', 'cursor TEXT', 'page_count INTEGER DEFAULT 0', 'row_count INTEGER DEFAULT 0', 'complete INTEGER DEFAULT 0', 'truncated INTEGER DEFAULT 0', 'status TEXT', 'error TEXT', 'started_at TEXT', 'updated_at TEXT'].every((column) => sourceStateMigration.includes(column)));

ok('migration avoids SQLite REAL for analytics precision', !hasRealColumn(migration));
ok('migration stores price/volume/liquidity as TEXT',
  migration.includes('price_wax TEXT') &&
  migration.includes('volume_24h TEXT') &&
  migration.includes('liquidity_usd TEXT') &&
  migration.includes('fdv_usd TEXT'));
ok('worker delegates /api/waxonedge routes through moonboys-api',
  worker.includes("path === '/api/waxonedge'") &&
  worker.includes('handleWaxOnEdgeRoute(request, env, CORS_HEADERS)'));
ok('worker scheduled handler runs WaxOnEdge sync', worker.includes('runWaxOnEdgeScheduledSync(env, cron)'));
ok('wrangler has WaxOnEdge minute cron and daily digest cron',
  wrangler.includes('"* * * * *"') &&
  wrangler.includes('"0 9 * * *"'));
ok('wrangler documents WaxOnEdge live indexer probe env without committing shared secret',
  wrangler.includes('# WAXONEDGE_LIVE_INDEXER_URL = "http://127.0.0.1:8789"') &&
  wrangler.includes('wrangler secret put WAXONEDGE_LIVE_SHARED_SECRET') &&
  !/^\s*WAXONEDGE_LIVE_INDEXER_URL\s*=\s*"http:\/\/127\.0\.0\.1:8789"/m.test(wrangler) &&
  !/WAXONEDGE_LIVE_SHARED_SECRET\s*=/.test(wrangler));
ok('wrangler configures real WAX Hyperion source for live WaxOnEdge backfill',
  wrangler.includes('WAXONEDGE_HYPERION_API = "https://wax.eosusa.io/v2"'));
ok('worker computes WaxOnEdge 5/15 minute and holder-snapshot sub-cadences',
  route.includes('minute % 5 === 0') &&
  route.includes('minute % 15 === 0') &&
  route.includes('hour % 2 === 0'));
ok('Worker scheduled sync runs WAXCASH-specific live coverage jobs',
  route.includes('syncPinnedWaxcashPairs(env, syncCycleId)') &&
  route.includes('syncLiveIndexerHistory(env)') &&
  route.includes('syncWaxcashHolderSnapshot(env)') &&
  !route.includes("recordSyncRun(env.DB, 'holders', 'skipped'"));
ok('wrangler wires same-origin WaxOnEdge route',
  wrangler.includes('cryptomoonboys.com/api/waxonedge/*') &&
  wrangler.includes('zone_name = "cryptomoonboys.com"'));

for (const endpoint of [
  '/bootstrap',
  '/summary',
  '/tokens/top',
  '/pairs/top',
  '/sync-status',
  '/indexer-health',
  '/live',
  '/live/stream',
]) {
  ok('route exposes ' + endpoint, route.includes(endpoint));
}
ok('live snapshot route reads the WAXCASH graph instead of broad token rows',
  route.includes('async function listLiveTokenUpdates') &&
  route.includes('const graph = await loadWaxcashGraphTokenRows(db)') &&
  route.includes('pairRows: graph.pairRows') &&
  route.includes('routeGraphRows: graph.pairRows') &&
  route.includes('LIVE_SNAPSHOT_TOKEN_LIMIT'));
ok('live snapshot token rows expose metric confidence proof fields',
  route.includes('s.selected_pair_source') &&
  route.includes('s.selected_pair_id') &&
  route.includes('selected_price_confidence: proof.selected_price_confidence') &&
  route.includes('liquidity_confidence: proof.liquidity_confidence') &&
  route.includes('tvl_confidence: proof.tvl_confidence') &&
  route.includes('metric_status: proof.metric_status') &&
  route.includes('metric_reason_codes: proof.metric_reason_codes'));
ok('live snapshot rows select supply and market cap fields needed for valuation serialization',
  route.includes('t.decimals') &&
  route.includes('t.total_supply') &&
  route.includes('t.max_supply') &&
  route.includes('s.circulating_supply') &&
  route.includes('s.market_cap_wax') &&
  route.includes('s.market_cap_usd') &&
  route.includes('s.fdv_wax') &&
  route.includes('s.fdv_usd'));
{
  const liveSnapshotBlock = route.match(/async function handleLiveSnapshot[\s\S]*?function handleLiveStream/)?.[0] || '';
  ok('live snapshot handler does not call Hyperion, public fetch, or aggregate rebuild',
    liveSnapshotBlock.includes('listLiveTokenUpdates(env.DB') &&
    !liveSnapshotBlock.includes('fetch(') &&
    !liveSnapshotBlock.includes('hyperionHistoryActionsEndpoint') &&
    !liveSnapshotBlock.includes('aggregateTokenAnalytics'));
}
ok('live snapshot uses stable contract-symbol token keys',
  route.includes('function liveTokenUpdateKey(contract, symbol)') &&
  route.includes('return tokenKey(contract, symbol)') &&
  route.includes('token_key: tokenKeyValue') &&
  __waxonedgeTestHooks.liveTokenUpdateKey('GraffitiKing', 'waxcash') === 'graffitiking::WAXCASH');
{
  const cursor = __waxonedgeTestHooks.liveCursorFromRow({
    contract: 'graffitiking',
    symbol: 'WAXCASH',
    stats_updated_at: '2026-06-14T10:00:00.000Z',
  });
  const parsed = __waxonedgeTestHooks.parseLiveCursor(cursor);
  ok('live endpoint returns a safe tuple next_cursor for pagination over hard limits',
    cursor === '2026-06-14T10%3A00%3A00.000Z~graffitiking~WAXCASH' &&
    parsed.cursor &&
    parsed.cursor.updated_at === '2026-06-14T10:00:00.000Z' &&
    parsed.cursor.contract === 'graffitiking' &&
    parsed.cursor.symbol === 'WAXCASH' &&
    route.includes('updatedAt > cursor.updated_at') &&
    route.includes('updatedAt === cursor.updated_at && contract > cursor.contract') &&
    route.includes('updatedAt === cursor.updated_at && contract === cursor.contract && symbol > cursor.symbol') &&
    route.includes('next_cursor: liveCursorFromRow(lastRow)'));
}
{
  const update = __waxonedgeTestHooks.normalizeLiveTokenUpdate({
    contract: 'graffitiking',
    symbol: 'WAXCASH',
    selected_price_usd: '0',
    selected_price_source: 'swap.alcor #8388 direct_wax',
    selected_pair_source: 'swap.alcor',
    selected_pair_id: '8388',
    change_24h: '0',
    volume_24h_usd: '0',
    tvl_usd: '123.45',
    liquidity_wax: '456.78',
    direct_pair_liquidity_wax: '456.78',
    direct_waxcash_pair_liquidity_wax: '456.78',
    bubble_liquidity_wax: '123.45',
    bubble_tvl_wax: '123.45',
    suspicious_liquidity_pair_count: '1',
    bubble_suspicious_liquidity_pair_count: '1',
    liquidity_basis: 'direct_indexed_pair_reserves',
    tvl_basis: 'direct_indexed_pair_reserves',
    updated_at: '2026-06-14T00:00:00.000Z',
  });
  ok('live token update preserves real zero metric values when reserve proof is present',
    update &&
    update.token_key === 'graffitiking::WAXCASH' &&
    update.price_usd === '0' &&
    update.selected_price_confidence === 'good' &&
    update.liquidity_confidence === 'good' &&
    update.tvl_confidence === 'good' &&
    update.metric_status.selected_price.live === true &&
    update.metric_status.liquidity.live === true &&
    update.metric_status.tvl.live === true &&
    update.direct_pair_liquidity_wax === '456.78' &&
    update.direct_waxcash_pair_liquidity_wax === '456.78' &&
    update.bubble_liquidity_wax === '123.45' &&
    update.bubble_tvl_wax === '123.45' &&
    update.suspicious_liquidity_pair_count === 1 &&
    update.bubble_suspicious_liquidity_pair_count === 1 &&
    update.change_24h === '0' &&
    update.volume_24h_usd === '0');
}
{
  const update = __waxonedgeTestHooks.normalizeLiveTokenUpdate({
    contract: 'aigodtokenwx',
    symbol: 'AIGOD',
    selected_price_wax: '100',
    selected_pair_source: 'swap.taco',
    selected_pair_id: 'AIGODWAXFAKE',
    liquidity_wax: '600800000',
    liquidity_usd: '360480000',
    tvl_wax: '600800000',
    tvl_usd: '360480000',
    bubble_liquidity_wax: null,
    bubble_liquidity_usd: null,
    bubble_tvl_wax: null,
    bubble_tvl_usd: null,
    bubble_suspicious_liquidity_pair_count: '2',
    liquidity_basis: 'direct_indexed_pair_reserves',
    tvl_basis: 'direct_indexed_pair_reserves',
    updated_at: '2026-06-14T00:00:00.000Z',
  });
  ok('live token update treats null bubble-safe liquidity/TVL as intentional and does not fall back to aggregate totals',
    update &&
    update.token_key === 'aigodtokenwx::AIGOD' &&
    update.liquidity_wax === '600800000' &&
    update.tvl_wax === '600800000' &&
    update.bubble_liquidity_wax === null &&
    update.bubble_liquidity_usd === null &&
    update.bubble_tvl_wax === null &&
    update.bubble_tvl_usd === null &&
    update.bubble_suspicious_liquidity_pair_count === 2);
}
{
  const update = __waxonedgeTestHooks.normalizeLiveTokenUpdate({
    contract: 'legacy.token',
    symbol: 'LEGACY',
    selected_price_wax: '1',
    selected_pair_source: 'swap.taco',
    selected_pair_id: 'LEGACYWAX',
    liquidity_wax: '321',
    liquidity_usd: '192.6',
    tvl_wax: '321',
    tvl_usd: '192.6',
    liquidity_basis: 'direct_indexed_pair_reserves',
    tvl_basis: 'direct_indexed_pair_reserves',
    updated_at: '2026-06-14T00:00:00.000Z',
  });
  ok('live token update keeps undefined legacy bubble-safe fields falling back to aggregate liquidity/TVL',
    update &&
    update.token_key === 'legacy.token::LEGACY' &&
    update.bubble_liquidity_wax === '321' &&
    update.bubble_liquidity_usd === '192.6' &&
    update.bubble_tvl_wax === '321' &&
    update.bubble_tvl_usd === '192.6');
}
{
  const preciseMarketCapWax = '12345678901234567890.123456789';
  const preciseMarketCapUsd = '98765432109876543210.987654321';
  const update = __waxonedgeTestHooks.normalizeLiveTokenUpdate({
    contract: 'graffitiking',
    symbol: 'WAXCASH',
    selected_price_wax: '1.23456789',
    selected_price_usd: '0.123456789',
    selected_pair_source: 'swap.alcor',
    selected_pair_id: '8388',
    circulating_supply: '10000000000000000000.000000001',
    market_cap_wax: preciseMarketCapWax,
    market_cap_usd: preciseMarketCapUsd,
    updated_at: '2026-06-14T00:00:00.000Z',
  });
  ok('live market_cap_wax decimal TEXT is preserved without float round-trip precision loss',
    update &&
    update.market_cap_confidence === 'good' &&
    update.market_cap_wax === preciseMarketCapWax);
  ok('live market_cap_usd decimal TEXT is preserved without float round-trip precision loss',
    update &&
    update.market_cap_confidence === 'good' &&
    update.market_cap_usd === preciseMarketCapUsd);
}
{
  const update = __waxonedgeTestHooks.normalizeLiveTokenUpdate({
    contract: 'graffitiking',
    symbol: 'WAXCASH',
    selected_price_usd: '0',
    selected_pair_source: 'swap.alcor',
    selected_pair_id: '8388',
    volume_24h_usd: '0',
    tvl_usd: '999999999',
    liquidity_wax: '888888888',
    updated_at: '2026-06-14T00:00:00.000Z',
  });
  ok('live token update blocks stored impossible TVL/liquidity without reserve proof basis',
    update &&
    update.liquidity_confidence === 'unavailable' &&
    update.tvl_confidence === 'unavailable' &&
    update.liquidity_wax === null &&
    update.liquidity_usd === null &&
    update.tvl_wax === null &&
    update.tvl_usd === null &&
    update.selected_metric_value === '0');
}
ok('bootstrap token rows expose metric confidence proof fields',
  route.includes('const graph = await loadWaxcashGraphTokenRows(db)') &&
  route.includes('async function deriveReserveBackedTokenRow') &&
  route.includes('async function loadPairRowsForTokens') &&
  route.includes('async function loadReserveRouteGraphRows') &&
  route.includes('const providedPairRows = Array.isArray(options.pairRows)') &&
  route.includes('const priceRows = await loadTokenPriceRowsForPairs(db, pairRows)') &&
  !route.includes('const priceRows = await loadTokenPriceRowsForPairs(db, [])') &&
  route.includes('Array.isArray(options.routeGraphRows)') &&
  route.includes('const graphRows = dedupePairRows(pairRows.concat(routeGraphRows))') &&
  route.includes('return tokenRows.map((entry) => deriveTokenPairMetrics(') &&
  route.includes('selected_price_confidence: selectedPriceLive && selectedPriceProof.source ? \'good\' : \'unavailable\'') &&
  route.includes('liquidity_confidence: liquidityBasis != null ? \'good\' : \'unavailable\'') &&
  route.includes('tvl_confidence: tvlBasis != null ? \'good\' : \'unavailable\''));
ok('live snapshot rows are reserve-derived before confidence is emitted',
  route.includes('const reserveBackedRows = await deriveReserveBackedTokenRows(db, results, {') &&
  route.includes('routeGraphRows: graph.pairRows') &&
  route.includes('tokens: sortWaxcashGraphTokens(reserveBackedRows).map(normalizeLiveTokenUpdate).filter(Boolean)') &&
  route.includes("const liquidityWax = proof.liquidity_confidence === 'good' ? safeDecimal(asNumber(row.liquidity_wax)) : null") &&
  route.includes("const tvlWax = proof.tvl_confidence === 'good' ? safeDecimal(asNumber(row.tvl_wax)) : null"));
ok('live snapshot liquidity uses sane direct pair reserves instead of route-multiplied TVL',
  route.includes('const MAX_REASONABLE_PAIR_TVL_WAX = 10000000000') &&
  route.includes('const MAX_BUBBLE_LIQUIDITY_TO_MARKET_CAP_RATIO = 5') &&
  route.includes('function isReasonablePairTvlWax') &&
  route.includes('function isReasonableBubbleLiquidity') &&
  route.includes('row.bubble_liquidity_wax !== undefined ? row.bubble_liquidity_wax : row.liquidity_wax') &&
  route.includes('row.bubble_liquidity_usd !== undefined ? row.bubble_liquidity_usd : row.liquidity_usd') &&
  route.includes('row.bubble_tvl_wax !== undefined ? row.bubble_tvl_wax : row.tvl_wax') &&
  route.includes('row.bubble_tvl_usd !== undefined ? row.bubble_tvl_usd : row.tvl_usd') &&
  !route.includes('row.bubble_liquidity_wax ?? row.liquidity_wax') &&
  route.includes('const sortedPairs = (pairRows || [])') &&
  route.includes("String(b?.updated_at || '').localeCompare(String(a?.updated_at || ''))") &&
  route.includes('for (const pair of dedupePairRows(sortedPairs))') &&
  route.includes('suspiciousLiquidityPairCount += 1') &&
  route.includes("metrics.liquidity_basis = hasLiquidityWax ? 'direct_indexed_pair_reserves' : null") &&
  route.includes("metrics.tvl_basis = hasLiquidityWax ? 'direct_indexed_pair_reserves' : null") &&
  route.includes('direct_waxcash_pair_liquidity_wax') &&
  route.includes('bubble_liquidity_wax') &&
  route.includes('bubble_suspicious_liquidity_pair_count') &&
  route.includes('suspicious_liquidity_pair_count'));
ok('live snapshot reserve proof is bounded to the recursive WAXCASH market graph',
  route.includes('const OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT = 2000') &&
  route.includes('const WAXCASH_GRAPH_ROUTE_CONCURRENCY = 8') &&
  route.includes('const WAXCASH_MARKET_GRAPH_DEFAULT_DEPTH = 2') &&
  route.includes('const WAXCASH_MARKET_GRAPH_MIN_EXPAND_LIQUIDITY_WAX = 1') &&
  route.includes('routeGraphLimit: 0') &&
  route.includes('async function loadWaxcashGraphTokenRows') &&
  route.includes('let frontier = pairedTokens.filter((token) => token?.key && !isWaxToken(token.contract, token.symbol))') &&
  route.includes('for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1)') &&
  route.includes('pairPassesGraphExpansionThreshold(pair, minExpandLiquidityWax)') &&
  route.includes('index += WAXCASH_GRAPH_ROUTE_CONCURRENCY') &&
  route.includes('const batch = frontier.slice(index, index + WAXCASH_GRAPH_ROUTE_CONCURRENCY)') &&
  route.includes('const batchRows = await Promise.all(batch.map((token) => loadPairRowsForToken(db, token.contract, token.symbol)))') &&
  route.includes('async function loadReserveRouteGraphRows(db, limit = OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT)') &&
  route.includes('const graphLimit = clampInteger(limit, OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT, 1, OG_WAX_ROUTE_GRAPH_PAIR_SCAN_LIMIT)') &&
  route.includes(').bind(graphLimit).all().catch(() => ({ results: [] }))'));
ok('instant live recompute helper emits verified valuation fields for changed graph pairs',
  route.includes('function instantLiveTokenUpdatesForVerifiedPairEvent') &&
  route.includes('function buildInstantLiveTokenUpdatesForPair') &&
  route.includes('selectedProofUsesPair(metrics, changed)') &&
  route.includes('selected_pair_source: row.selected_pair_source || null') &&
  route.includes('selected_pair_id: row.selected_pair_id || null') &&
  route.includes("proof_status: proof.selected_price_confidence === 'good' && marketCapLive ? 'verified' : 'unavailable'") &&
  route.includes('buildOgWaxRouteGraph(graphRows, priceIndex)') &&
  !route.includes('liquidity_as_market_cap'));
ok('live stream route proxies VPS SSE into recomputed Worker token_update events',
  route.includes('function handleLiveStream') &&
  route.includes("fetchImpl(`${baseUrl}/stream`") &&
  route.includes('parseSseFrames(buffer)') &&
  route.includes('changedPairFromLiveEvent(payload)') &&
  route.includes('buildInstantLiveTokenUpdatesForPair(env.DB, changedPair') &&
  route.includes("enqueue('token_update', update)") &&
  route.includes('fallback: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT') &&
  route.includes('uses_fake_live_data: false') &&
  route.includes("transport: 'worker-sse-proxy'"));
ok('VPS live indexer service package exists',
  exists('services/waxonedge-live-indexer/package.json') &&
  exists('services/waxonedge-live-indexer/src/index.mjs') &&
  exists('services/waxonedge-live-indexer/.env.example') &&
  exists('services/waxonedge-live-indexer/.env.production.example') &&
  exists('services/waxonedge-live-indexer/README.md') &&
  exists('services/waxonedge-live-indexer/DEPLOY.md') &&
  exists('services/waxonedge-live-indexer/waxonedge-live-indexer.service.example') &&
  exists('services/waxonedge-live-indexer/scripts/check-live-indexer.mjs') &&
  liveIndexerPackage.name === '@crypto-moonboys/waxonedge-live-indexer' &&
  liveIndexerPackage.type === 'module' &&
  liveIndexerPackage.scripts.start === 'node src/index.mjs' &&
  liveIndexerPackage.scripts.check === 'node scripts/check-live-indexer.mjs');
ok('VPS live indexer service entrypoint starts for relative npm/systemd paths',
  liveIndexer.isDirectRun(
    pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/src/index.mjs')).href,
    'src/index.mjs',
    path.join(ROOT, 'services/waxonedge-live-indexer'),
  ) === true &&
  liveIndexer.isDirectRun(
    pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/src/index.mjs')).href,
    'services/waxonedge-live-indexer/src/index.mjs',
    ROOT,
  ) === true &&
  liveIndexer.isDirectRun(
    pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/src/index.mjs')).href,
    path.join(ROOT, 'services/waxonedge-live-indexer/src/index.mjs'),
    ROOT,
  ) === true &&
  liveIndexer.isDirectRun(
    pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/src/index.mjs')).href,
    'scripts/waxonedge-live-backend.test.mjs',
    ROOT,
  ) === false);
ok('VPS live indexer check entrypoint runs for relative npm check paths',
  liveIndexerCheck.isDirectRun(
    pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/scripts/check-live-indexer.mjs')).href,
    'services/waxonedge-live-indexer/scripts/check-live-indexer.mjs',
  ) === true &&
  liveIndexerCheck.isDirectRun(
    pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/scripts/check-live-indexer.mjs')).href,
    path.join(ROOT, 'services/waxonedge-live-indexer/scripts/check-live-indexer.mjs'),
  ) === true &&
  liveIndexerCheck.isDirectRun(
    pathToFileURL(path.join(ROOT, 'services/waxonedge-live-indexer/scripts/check-live-indexer.mjs')).href,
    'scripts/waxonedge-live-backend.test.mjs',
  ) === false &&
  liveIndexerCheckScript.includes('if (isDirectRun())') &&
  liveIndexerCheckScript.includes('runCheck()'));
ok('VPS live indexer documents env-only config and shared secret header',
  liveIndexerEnvExample.includes('WAXONEDGE_LIVE_PORT=8789') &&
  liveIndexerEnvExample.includes('WAXONEDGE_HYPERION_API=https://wax.eosusa.io/v2') &&
  liveIndexerEnvExample.includes('WAXNODE_ENDPOINT=') &&
  liveIndexerEnvExample.includes('WAXONEDGE_LIVE_POLL_MS=1000') &&
  liveIndexerEnvExample.includes('WAXONEDGE_LIVE_HISTORY_PATH=') &&
  liveIndexerEnvExample.includes('WAXONEDGE_LIVE_SHARED_SECRET=') &&
  liveIndexerReadme.includes('x-waxonedge-live-secret') &&
  liveIndexerReadme.includes('Do not commit secrets.') &&
  liveIndexerReadme.includes('history_mode') &&
  liveIndexerReadme.includes('fresh_start') &&
  liveIndexerReadme.includes('requires_ship_for_deep_history'));
ok('VPS live indexer production env example has required keys and blank secret',
  liveIndexerProdEnvExample.includes('WAXONEDGE_LIVE_PORT=8789') &&
  liveIndexerProdEnvExample.includes('WAXONEDGE_HYPERION_API=https://wax.eosusa.io/v2') &&
  liveIndexerProdEnvExample.includes('WAXONEDGE_STATE_HISTORY_ENDPOINT=') &&
  liveIndexerProdEnvExample.includes('WAXNODE_ENDPOINT=') &&
  liveIndexerProdEnvExample.includes('WAXONEDGE_LIVE_SHARED_SECRET=') &&
  liveIndexerProdEnvExample.includes('WAXONEDGE_LIVE_ENABLE_STREAM=false') &&
  liveIndexerProdEnvExample.includes('WAXONEDGE_LIVE_BIND_HOST=127.0.0.1') &&
  liveIndexerProdEnvExample.includes('WAXONEDGE_LIVE_POLL_MS=1000') &&
  liveIndexerProdEnvExample.includes('WAXONEDGE_LIVE_HISTORY_PATH=/opt/crypto-moonboys/services/waxonedge-live-indexer/data/waxonedge-live-history.json') &&
  !/WAXONEDGE_LIVE_SHARED_SECRET=.+/.test(liveIndexerProdEnvExample));
ok('VPS live indexer deploy guide documents runtime operations without enabling production proxy',
  liveIndexerDeploy.includes('Node.js 22') &&
  liveIndexerDeploy.includes('sudo groupadd --system waxonedge || true') &&
  liveIndexerDeploy.includes('sudo useradd --system --gid waxonedge --home /opt/crypto-moonboys --shell /usr/sbin/nologin waxonedge || true') &&
  liveIndexerDeploy.indexOf('sudo groupadd --system waxonedge || true') <
    liveIndexerDeploy.indexOf('sudo chown waxonedge:waxonedge /opt/crypto-moonboys') &&
  liveIndexerDeploy.includes('npm install --omit=dev') &&
  liveIndexerDeploy.includes('systemd') &&
  liveIndexerDeploy.includes('PM2') &&
  liveIndexerDeploy.includes('curl -fsS http://127.0.0.1:8789/health') &&
  liveIndexerDeploy.includes('curl -fsS http://127.0.0.1:8789/snapshot') &&
  liveIndexerDeploy.includes('curl -fsS http://127.0.0.1:8789/history') &&
  liveIndexerDeploy.includes('curl -N http://127.0.0.1:8789/stream') &&
  liveIndexerDeploy.includes('history_complete=false') &&
  liveIndexerDeploy.includes('history_backfilled=false') &&
  liveIndexerDeploy.includes('fresh-start') &&
  liveIndexerDeploy.includes('journalctl -u waxonedge-live-indexer') &&
  liveIndexerDeploy.includes('systemctl restart waxonedge-live-indexer') &&
  /rollback/i.test(liveIndexerDeploy) &&
  liveIndexerDeploy.includes('WAXONEDGE_LIVE_INDEXER_URL=http://127.0.0.1:8789') &&
  liveIndexerDeploy.includes('Do not proxy') &&
  liveIndexerDeploy.includes('fake token updates'));
ok('VPS live indexer systemd template is local-only and secret-free',
  liveIndexerSystemd.includes('User=waxonedge') &&
  liveIndexerSystemd.includes('Group=waxonedge') &&
  liveIndexerSystemd.includes('WorkingDirectory=/opt/crypto-moonboys/services/waxonedge-live-indexer') &&
  liveIndexerSystemd.includes('Environment=WAXONEDGE_LIVE_BIND_HOST=127.0.0.1') &&
  liveIndexerSystemd.includes('EnvironmentFile=/etc/waxonedge-live-indexer.env') &&
  liveIndexerSystemd.indexOf('Environment=WAXONEDGE_LIVE_BIND_HOST=127.0.0.1') <
    liveIndexerSystemd.indexOf('EnvironmentFile=/etc/waxonedge-live-indexer.env') &&
  liveIndexerSystemd.includes('ExecStart=/usr/bin/node src/index.mjs') &&
  liveIndexerSystemd.includes('Restart=on-failure') &&
  liveIndexerSystemd.includes('NoNewPrivileges=true') &&
  !/WAXONEDGE_LIVE_SHARED_SECRET=.+/.test(liveIndexerSystemd) &&
  !liveIndexerSystemd.includes('secret-value'));
ok('VPS live indexer runtime check script verifies health, snapshot, stream, and fake-data bans',
  liveIndexerCheckScript.includes('/health') &&
  liveIndexerCheckScript.includes('/snapshot') &&
  liveIndexerCheckScript.includes('/stream') &&
  liveIndexerCheckScript.includes('uses_fake_live_data !== false') &&
  liveIndexerCheckScript.includes('event: token_update') &&
  liveIndexerCheckScript.includes('process.exitCode = 1'));
ok('VPS live indexer registers only verified trade streams',
  liveIndexer.VERIFIED_TRADE_STREAMS.length === 6 &&
  liveIndexer.VERIFIED_TRADE_STREAMS.some((stream) => stream.account === 'alcordexmain' && stream.action === 'buymatch') &&
  liveIndexer.VERIFIED_TRADE_STREAMS.some((stream) => stream.account === 'alcordexmain' && stream.action === 'sellmatch') &&
  liveIndexer.VERIFIED_TRADE_STREAMS.some((stream) => stream.account === 'swap.alcor' && stream.action === 'logswap') &&
  liveIndexer.VERIFIED_TRADE_STREAMS.some((stream) => stream.account === 'swap.taco' && stream.action === 'exchangelog') &&
  liveIndexer.VERIFIED_TRADE_STREAMS.some((stream) => stream.account === 'swap.box' && stream.action === 'swaplog') &&
  liveIndexer.VERIFIED_TRADE_STREAMS.some((stream) => stream.account === 'swap.nefty' && stream.action === 'logswap') &&
  liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) => stream.account === 'alcordexmain' && stream.action === 'buymatch')?.og_source === 'alcor_buy' &&
  liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) => stream.account === 'alcordexmain' && stream.action === 'sellmatch')?.og_source === 'alcor_sell' &&
  liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) => stream.account === 'swap.alcor' && stream.action === 'logswap')?.og_source === 'alcorv2' &&
  liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) => stream.account === 'swap.taco' && stream.action === 'exchangelog')?.og_source === 'taco' &&
  liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) => stream.account === 'swap.box' && stream.action === 'swaplog')?.og_source === 'defibox' &&
  liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) => stream.account === 'swap.nefty' && stream.action === 'logswap')?.og_source === 'neftyblocks' &&
  !liveIndexerSource.includes("account: 'swap.adex'") &&
  !liveIndexerSource.includes("account: 'dapp.fusion'"));
{
  const state = liveIndexer.createState(liveIndexer.loadConfig({
    WAXONEDGE_LIVE_PORT: '8790',
    WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    WAXONEDGE_LIVE_SHARED_SECRET: 'secret-value',
    WAXONEDGE_LIVE_ENABLE_STREAM: 'false',
  }));
  const health = liveIndexer.healthPayload(state);
  const snapshot = liveIndexer.snapshotPayload(state);
  ok('VPS live indexer /health contract is honest while not connected',
    health.ok === false &&
    health.status === 'not_connected' &&
    health.connected === false &&
    health.config.hyperion_configured === true &&
    health.config.shared_secret_configured === true &&
    health.config.secret_header === 'x-waxonedge-live-secret' &&
    health.uses_fake_live_data === false &&
    health.browser_hyperion_fetch === false &&
    health.emits_fake_token_updates === false);
  ok('VPS live indexer defaults to approximately one-second verified stream polling',
    state.config.poll_ms === 1000 &&
    liveIndexerSource.includes('const DEFAULT_LIVE_POLL_MS = 1000'));
  ok('VPS live indexer /snapshot contract matches Worker live snapshot shape without fake data',
    snapshot.ok === false &&
    snapshot.source === 'waxonedge-live-indexer' &&
    snapshot.mode === 'snapshot' &&
    snapshot.status === 'not_connected' &&
    snapshot.token_key_format === 'contract::symbol' &&
    Array.isArray(snapshot.tokens) &&
    snapshot.tokens.length === 0 &&
    snapshot.next_cursor === null &&
    snapshot.uses_fake_live_data === false &&
    snapshot.browser_hyperion_fetch === false);
  const missingConfigState = liveIndexer.createState(liveIndexer.loadConfig({}));
  const missingConfigHealth = liveIndexer.healthPayload(missingConfigState);
  ok('VPS live indexer health reports a concrete missing stream config reason',
    missingConfigHealth.last_error === 'WAXONEDGE_HYPERION_API, WAXONEDGE_STATE_HISTORY_ENDPOINT, or WAXNODE_ENDPOINT required' &&
    missingConfigHealth.config.hyperion_configured === false &&
    missingConfigHealth.config.state_history_configured === false &&
    missingConfigHealth.config.waxnode_configured === false &&
    !liveIndexerSource.includes('live stream connector not implemented yet'));
}

function createEmptyWaxonedgeHealthDb() {
  const statement = {
    bind() {
      return this;
    },
    async first() {
      return { count: 0 };
    },
    async all() {
      return { results: [] };
    },
  };
  return {
    prepare() {
      return statement;
    },
  };
}

function createWriteCaptureDb() {
  const writes = [];
  const db = {
    writes,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('COUNT')) return { count: 0 };
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              writes.push({ sql, params });
              return { success: true };
            },
          };
        },
        async first() {
          if (sql.includes('COUNT')) return { count: 0 };
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          writes.push({ sql, params: [] });
          return { success: true };
        },
      };
    },
    async batch(statements) {
      for (const statement of statements || []) {
        if (statement?.run) await statement.run();
        else writes.push(statement);
      }
      return statements || [];
    },
  };
  return db;
}
ok('VPS live indexer binds locally by default and allows explicit host override',
  liveIndexer.loadConfig({}).bind_host === '127.0.0.1' &&
  liveIndexer.loadConfig({ WAXONEDGE_LIVE_BIND_HOST: '0.0.0.0' }).bind_host === '0.0.0.0' &&
  liveIndexer.normalizeBindHost('[::1]') === '::1' &&
  liveIndexer.normalizeBindHost('::1') === '::1' &&
  liveIndexer.normalizeBindHost('127.0.0.1') === '127.0.0.1' &&
  liveIndexer.normalizeBindHost('0.0.0.0') === '0.0.0.0' &&
  liveIndexer.loadConfig({ WAXONEDGE_LIVE_BIND_HOST: '[::1]' }).bind_host === '::1');
ok('VPS live indexer runtime config respects explicit blank history path',
  liveIndexer.runtimeConfig({ WAXONEDGE_LIVE_HISTORY_PATH: '' }).history_path === '' &&
  liveIndexer.runtimeConfig({}).history_path === liveIndexer.defaultHistoryPath() &&
  liveIndexer.loadConfig({}).history_save_ms === 5000 &&
  liveIndexer.loadConfig({ WAXONEDGE_LIVE_HISTORY_SAVE_MS: '25' }).history_save_ms === 25);
ok('VPS live indexer checker maps wildcard bind hosts to routable local targets',
  liveIndexerCheck.checkTargetHost('0.0.0.0') === '127.0.0.1' &&
  liveIndexerCheck.checkTargetHost('::') === '[::1]' &&
  liveIndexerCheck.checkTargetHost('[::]') === '[::1]' &&
  liveIndexerCheck.checkTargetHost('127.0.0.1') === '127.0.0.1' &&
  liveIndexerCheck.checkTargetHost('localhost') === 'localhost' &&
  liveIndexerCheck.checkTargetHost('::1') === '[::1]' &&
  liveIndexerCheck.checkTargetHost('[::1]') === '[::1]' &&
  liveIndexerCheck.checkUrl({ WAXONEDGE_LIVE_BIND_HOST: '0.0.0.0', WAXONEDGE_LIVE_PORT: '8789' }) === 'http://127.0.0.1:8789' &&
  liveIndexerCheck.checkUrl({ WAXONEDGE_LIVE_BIND_HOST: '::', WAXONEDGE_LIVE_PORT: '8789' }) === 'http://[::1]:8789' &&
  liveIndexerCheck.checkUrl({ WAXONEDGE_LIVE_BIND_HOST: '[::]', WAXONEDGE_LIVE_PORT: '8789' }) === 'http://[::1]:8789' &&
  liveIndexerCheck.checkUrl({ WAXONEDGE_LIVE_BIND_HOST: '[::1]', WAXONEDGE_LIVE_PORT: '8789' }) === 'http://[::1]:8789' &&
  liveIndexerCheck.checkUrl({ WAXONEDGE_LIVE_BIND_HOST: '::1', WAXONEDGE_LIVE_PORT: '8789' }) === 'http://[::1]:8789');
ok('VPS live indexer /stream contract supports heartbeat and real token update events only',
  liveIndexerSource.includes("pathname === '/stream'") &&
  liveIndexerSource.includes("'content-type': 'text/event-stream; charset=utf-8'") &&
  liveIndexerSource.includes('event: heartbeat') &&
  liveIndexerSource.includes('token_update_events_enabled: state.config.stream_enabled === true') &&
  liveIndexerSource.includes('event: token_update') &&
  liveIndexerSource.includes('function writeSseTokenUpdate') &&
  !liveIndexerSource.includes('Math.random'));
ok('VPS live indexer exposes fresh-start rolling history without claiming backfill',
  liveIndexerSource.includes("pathname === '/history'") &&
  liveIndexerSource.includes("pathname === '/history/trades'") &&
  liveIndexerSource.includes('historyTradesPayload(state') &&
  liveIndexerSource.includes('const limit = clampInteger(options.limit, 250, 1, 500)') &&
  !liveIndexerSource.includes('clampInt(') &&
  liveIndexerSource.includes('waxcash_trade_count') &&
  liveIndexerSource.includes('next_cursor') &&
  liveIndexerSource.includes("history_mode: FRESH_HISTORY_MODE") &&
  liveIndexerSource.includes('history_complete: false') &&
  liveIndexerSource.includes('history_backfilled: false') &&
  liveIndexerSource.includes("deep_history_status: 'requires_ship_state_history'") &&
  liveIndexerSource.includes('requires_ship_for_deep_history: true') &&
  liveIndexerSource.includes('const refresh = options.refresh !== false') &&
  liveIndexerSource.includes('if (refresh) refreshRollingHistory(state)') &&
  liveIndexerSource.includes('const save = options.save !== false') &&
  liveIndexerSource.includes('refresh: false') &&
  liveIndexerSource.includes('save: false') &&
  liveIndexerSource.includes('if (persistedTradesAdded) saveObservedHistory(state)') &&
  liveIndexerSource.includes('observeLiveTrade(state, trade, { persist: false, broadcast: false, refresh: false })') &&
  liveIndexerSource.includes('last_error: state.history.last_error || null') &&
  liveIndexerSource.includes('state.history_save_in_flight = true') &&
  liveIndexerSource.includes('state.history_save_dirty = true') &&
  liveIndexerSource.includes('history_save_pending') &&
  liveIndexerSource.includes('history_last_saved_at') &&
  liveIndexerSource.includes('WAXONEDGE_LIVE_HISTORY_SAVE_MS') &&
  liveIndexerSource.includes('const DEFAULT_HISTORY_SAVE_MS = 5000') &&
  liveIndexerSource.includes('await fs.promises.writeFile(tmpPath') &&
  liveIndexerSource.includes('await fs.promises.rename(tmpPath, historyPath)') &&
  liveIndexerSource.includes('trades.splice(0, trades.length - MAX_PERSISTED_TRADE_HISTORY)') &&
  !liveIndexerSource.includes('state.history.trades = state.history.trades.slice(-MAX_PERSISTED_TRADE_HISTORY)') &&
  !liveIndexerSource.includes('.slice(-MAX_PERSISTED_TRADE_HISTORY)') &&
  !liveIndexerSource.includes('state.history.trades.slice().sort') &&
  !liveIndexerSource.includes('fs.writeFileSync') &&
  !liveIndexerSource.includes('fs.renameSync') &&
  !liveIndexerSource.includes('fs.mkdirSync') &&
  !liveIndexerSource.includes('reserve-derived candles'));
{
  const imported = __waxonedgeTestHooks.normalizeLiveIndexerHistoryTrade({
    trade_id: 'live-8388-a',
    source: 'swap.alcor',
    pair_id: '8388',
    contract: 'graffitiking',
    symbol: 'WAXCASH',
    quote_contract: 'eosio.token',
    quote_symbol: 'WAX',
    price: '0.03',
    volume: '10',
    side: 'swap',
    traded_at: '2026-06-18T00:00:00.000Z',
  });
  ok('Worker normalizes live-indexer WAXCASH history rows into D1 trade rows with WAX-volume proof',
    imported &&
    imported.source === 'swap.alcor' &&
    imported.pair_id === '8388' &&
    imported.contract === 'graffitiking' &&
    imported.symbol === 'WAXCASH' &&
    imported.price === '0.03' &&
    JSON.parse(imported.raw_json).volume_wax === '0.3' &&
    JSON.parse(imported.raw_json).reference_ingestion === 'waxonedge-live-indexer /history');
  const db = createWriteCaptureDb();
  const requestedHistoryUrls = [];
  const historyResult = await __waxonedgeTestHooks.syncLiveIndexerHistory({
    DB: db,
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live.example',
  }, async (url) => {
    requestedHistoryUrls.push(url);
    return ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        history_started_at: '2026-06-18T00:00:00.000Z',
        persisted_trade_count: 1,
        trades: [{
          trade_id: 'live-8388-a',
          source: 'swap.alcor',
          pair_id: '8388',
          contract: 'graffitiking',
          symbol: 'WAXCASH',
          quote_contract: 'eosio.token',
          quote_symbol: 'WAX',
          price: '0.03',
          volume: '10',
          traded_at: '2026-06-18T00:00:00.000Z',
        }],
      });
    },
  });
  });
  ok('Worker imports live-indexer history into waxonedge_trades for rolling volume and candle backfill',
    historyResult.ok &&
    requestedHistoryUrls[0] === 'https://live.example/history/trades?limit=500' &&
    historyResult.imported_trade_count === 1 &&
    db.writes.some((write) => write.sql.includes('INSERT INTO waxonedge_trades') && write.params[0] === 'swap.alcor' && write.params[2] === '8388') &&
    db.writes.some((write) => write.params.includes('live_indexer_history_import')));
  const metadataOnlyDb = createWriteCaptureDb();
  const metadataOnlyResult = await __waxonedgeTestHooks.syncLiveIndexerHistory({
    DB: metadataOnlyDb,
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live.example',
  }, async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        history: {
          history_started_at: '2026-06-18T00:00:00.000Z',
          persisted_trade_count: 12,
        },
      });
    },
  }));
  ok('Worker does not mark live-indexer metadata-only history payload as successful import',
    metadataOnlyResult.ok &&
    metadataOnlyResult.status === 'skipped' &&
    metadataOnlyResult.imported_trade_count === 0 &&
    metadataOnlyResult.reason === 'live_indexer_history_trades_not_exposed' &&
    !metadataOnlyDb.writes.some((write) => write.sql.includes('INSERT INTO waxonedge_trades')) &&
    metadataOnlyDb.writes.some((write) => write.params.includes('live_indexer_history_trades_not_exposed')));
}
{
  const snapshotAt = '2026-06-18T00:00:00.000Z';
  const holders = __waxonedgeTestHooks.holderRowsFromHyperionPayload({
    tokens: [
      { account: 'alice', contract: 'graffitiking', symbol: 'WAXCASH', amount: '12.50000000' },
      { owner: 'bob', contract: 'graffitiking', quantity: '0.00000000 WAXCASH' },
      { account: 'carol', contract: 'graffitiking', quantity: '2.00000000 WAXCASH' },
      { account: 'wrong', contract: 'other.token', quantity: '5.00000000 WAXCASH' },
    ],
  }, snapshotAt);
  ok('WAXCASH holder snapshot parser counts only positive graffitiking::WAXCASH balances',
    holders.length === 2 &&
    holders[0].account === 'alice' &&
    holders[0].balance === '12.5' &&
    holders[1].account === 'carol' &&
    holders.every((holder) => holder.snapshot_at === snapshotAt && holder.source === 'hyperion_state_get_tokens'));
  const holderFetch = await __waxonedgeTestHooks.fetchWaxcashHolderRows({}, 1000, '');
  const holderDb = createWriteCaptureDb();
  const holderSync = await __waxonedgeTestHooks.syncWaxcashHolderSnapshot({ DB: holderDb });
  ok('WAXCASH holder sync does not use account-scoped Hyperion state/get_tokens as a global holder source',
    holderFetch.skipped === true &&
    holderFetch.reason === 'holder_global_source_unavailable' &&
    holderSync.status === 'skipped' &&
    holderSync.holder_count === null &&
    holderSync.reason === 'holder_global_source_unavailable' &&
    holderDb.writes.some((write) => write.params.includes('holder_global_source_unavailable')) &&
    !route.includes("hyperionStateEndpoint(env, '/state/get_tokens')") &&
    !route.includes("source_endpoint: 'hyperion_state_get_tokens'"));
}
ok('VPS live indexer exposes no fake live events or random movement',
  liveIndexerSource.includes('uses_fake_live_data: false') &&
  liveIndexerSource.includes('emits_fake_token_updates: false') &&
  !/fake\s*:\s*true/i.test(liveIndexerSource) &&
  !liveIndexerSource.includes('random') &&
  !liveIndexerSource.includes('setInterval'));
{
  const alcorStream = liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) =>
    stream.account === 'alcordexmain' && stream.action === 'buymatch');
  const ammStream = liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) =>
    stream.account === 'swap.alcor' && stream.action === 'logswap');
  const alcorTrade = liveIndexer.normalizeLiveTradeRow({
    action: 'buymatch',
    global_sequence: 101,
    timestamp: '2026-06-15T10:00:00',
    data: {
      record: {
        id: 7,
        market_id: 314,
        ask: '10.00000000 WAXCASH',
        bid: '0.10000000 WAX',
        unit_price: 1000000,
        market: {
          id: 314,
          base_token: { contract: 'graffitiking', sym: '8,WAXCASH' },
          quote_token: { contract: 'eosio.token', sym: '8,WAX' },
        },
      },
    },
  }, alcorStream);
  const ammTrade = liveIndexer.normalizeLiveTradeRow({
    action: 'logswap',
    global_sequence: 102,
    timestamp: '2026-06-15T10:01:00Z',
    data: {
      record: {
        poolId: 22,
        tokenA: { quantity: '5.00000000 WAXCASH', contract: 'graffitiking' },
        tokenB: { quantity: '0.05000000 WAX', contract: 'eosio.token' },
      },
    },
  }, ammStream);
  const reserveBearingStream = liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) =>
    stream.account === 'swap.nefty' && stream.action === 'logswap');
  const reserveBearingTrade = liveIndexer.normalizeLiveTradeRow({
    action: 'logswap',
    global_sequence: 103,
    timestamp: '2026-06-15T10:04:00Z',
    data: {
      record: {
        code: 'WAXCASHWUF',
        quantity_in: { quantity: '1.00000000 WAXCASH', contract: 'graffitiking' },
        quantity_out: { quantity: '0.01000000 WUF', contract: 'wuffi' },
        token_a_contract: 'graffitiking',
        token_a_symbol: 'WAXCASH',
        token_b_contract: 'wuffi',
        token_b_symbol: 'WUF',
        reserve_a: '100000',
        reserve_b: '1000',
        liquidity_wax: '2000',
        liquidity_usd: '12',
      },
    },
  }, reserveBearingStream);
  const reserveWithoutExplicitIdentityTrade = liveIndexer.normalizeLiveTradeRow({
    action: 'logswap',
    global_sequence: 104,
    timestamp: '2026-06-15T10:05:00Z',
    data: {
      record: {
        code: 'WAXCASHWUF',
        quantity_in: { quantity: '1.00000000 WAXCASH', contract: 'graffitiking' },
        quantity_out: { quantity: '0.01000000 WUF', contract: 'wuffi' },
        reserve_a: '100000',
        reserve_b: '1000',
      },
    },
  }, reserveBearingStream);
  const alcorMissingStableId = liveIndexer.normalizeLiveTradeRow({
    action: 'buymatch',
    timestamp: '2026-06-15T10:02:00Z',
    data: {
      record: {
        market_id: 315,
        ask: '10.00000000 WAXCASH',
        bid: '0.10000000 WAX',
        unit_price: 1000000,
        market: {
          id: 315,
          base_token: { contract: 'graffitiking', sym: '8,WAXCASH' },
          quote_token: { contract: 'eosio.token', sym: '8,WAX' },
        },
      },
    },
  }, alcorStream);
  const ammMissingStableId = liveIndexer.normalizeLiveTradeRow({
    action: 'logswap',
    timestamp: '2026-06-15T10:03:00Z',
    data: {
      record: {
        poolId: 23,
        tokenA: { quantity: '5.00000000 WAXCASH', contract: 'graffitiking' },
        tokenB: { quantity: '0.05000000 WAX', contract: 'eosio.token' },
      },
    },
  }, ammStream);
  const state = liveIndexer.createState(liveIndexer.loadConfig({
    WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    WAXONEDGE_LIVE_ENABLE_STREAM: 'true',
  }));
  const initialHealth = liveIndexer.healthPayload(state);
  const observed = liveIndexer.observeLiveTrade(state, alcorTrade);
  const health = liveIndexer.healthPayload(state);
  const snapshot = liveIndexer.snapshotPayload(state);
  const reserveState = liveIndexer.createState(liveIndexer.loadConfig({
    WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    WAXONEDGE_LIVE_ENABLE_STREAM: 'true',
  }));
  const reserveBearingUpdate = liveIndexer.observeLiveTrade(reserveState, reserveBearingTrade, {
    save: false,
    refresh: false,
    broadcast: false,
  });
  ok('VPS live indexer normalizes real verified Hyperion trade rows without fake data',
    alcorTrade &&
    alcorTrade.contract === 'graffitiking' &&
    alcorTrade.symbol === 'WAXCASH' &&
    alcorTrade.stream_source === 'alcordexmain::buymatch' &&
    alcorTrade.og_source === 'alcor_buy' &&
    ammTrade &&
    ammTrade.contract === 'graffitiking' &&
    ammTrade.symbol === 'WAXCASH' &&
    ammTrade.stream_source === 'swap.alcor::logswap' &&
    ammTrade.og_source === 'alcorv2');
  ok('VPS live indexer emits canonical_pair for reserve-bearing supported swap events',
    reserveBearingTrade &&
    reserveBearingUpdate &&
    reserveBearingUpdate.canonical_pair &&
    reserveBearingUpdate.canonical_pair.source === 'swap.nefty' &&
    reserveBearingUpdate.canonical_pair.pair_id === 'WAXCASHWUF' &&
    reserveBearingUpdate.canonical_pair.token_a_contract === 'graffitiking' &&
    reserveBearingUpdate.canonical_pair.token_a_symbol === 'WAXCASH' &&
    reserveBearingUpdate.canonical_pair.token_b_contract === 'wuffi' &&
    reserveBearingUpdate.canonical_pair.token_b_symbol === 'WUF' &&
    Number(reserveBearingUpdate.canonical_pair.reserve_a) === 100000 &&
    Number(reserveBearingUpdate.canonical_pair.reserve_b) === 1000 &&
    Number(reserveBearingUpdate.canonical_pair.reserve_a_decimal) === 100000 &&
    Number(reserveBearingUpdate.canonical_pair.reserve_b_decimal) === 1000 &&
    Number(reserveBearingUpdate.canonical_pair.liquidity_wax) === 2000 &&
    Number(reserveBearingUpdate.canonical_pair.liquidity_usd) === 12 &&
    reserveState.tokenCache.get('graffitiking::WAXCASH')?.canonical_pair?.pair_id === 'WAXCASHWUF',
    JSON.stringify({ reserveBearingTrade, reserveBearingUpdate }));
  ok('VPS live indexer omits canonical_pair when the stream event lacks real reserves',
    ammTrade &&
    liveIndexer.observeLiveTrade(liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    })), ammTrade, { save: false, refresh: false, broadcast: false })?.canonical_pair == null);
  ok('VPS live indexer does not infer canonical_pair token order from parsed swap quantities',
    reserveWithoutExplicitIdentityTrade &&
    reserveWithoutExplicitIdentityTrade.canonical_pair == null &&
    liveIndexer.observeLiveTrade(liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    })), reserveWithoutExplicitIdentityTrade, { save: false, refresh: false, broadcast: false })?.canonical_pair == null);
  ok('VPS live indexer rejects trade rows without stable IDs instead of collapsing blank suffixes',
    alcorMissingStableId === null &&
    ammMissingStableId === null);
  ok('VPS live indexer health no longer reports stale skeleton connector wording',
    initialHealth.last_error === 'no verified trade events observed yet' &&
    !liveIndexerSource.includes('live stream connector not implemented yet'));
  ok('VPS live indexer becomes connected only after observed real trade rows',
    observed &&
    observed.token_key === 'graffitiking::WAXCASH' &&
    observed.uses_fake_live_data === false &&
    health.ok === true &&
    health.status === 'connected' &&
    health.connected === true &&
    health.last_event_at === alcorTrade.traded_at &&
    health.stream_source === 'alcordexmain::buymatch' &&
    health.event_count === 1 &&
    snapshot.ok === true &&
    snapshot.status === 'connected' &&
    snapshot.tokens.length === 1 &&
    snapshot.tokens[0].last_trade_price === alcorTrade.price &&
    snapshot.tokens[0].last_trade_volume === alcorTrade.volume);
  ok('VPS live indexer trade IDs include stream/source/action context for weak fallback fields',
    liveIndexer.tradeIdFromRow({ global_sequence: 77 }, { account: 'alcordexmain', action: 'buymatch', source: 'alcor' }, {}) ===
      'alcordexmain::buymatch:source:alcor:action:buymatch:seq:77' &&
    liveIndexer.tradeIdFromRow({ global_sequence: 77 }, { account: 'swap.alcor', action: 'logswap', source: 'swap.alcor' }, {}) ===
      'swap.alcor::logswap:source:swap.alcor:action:logswap:seq:77' &&
    liveIndexer.tradeIdFromRow({ global_sequence: 77 }, { action: 'buymatch', source: 'alcor' }, {}) === '' &&
    liveIndexer.tradeIdFromRow({ global_sequence: 77 }, { account: 'alcordexmain', source: 'alcor' }, {}) === '' &&
    liveIndexer.tradeIdFromRow({ global_sequence: 77 }, { account: 'alcordexmain', action: 'buymatch' }, {}) === '');
  ok('VPS live indexer final trade IDs stay collision-safe without redundant stream prefix wrapping',
    alcorTrade.trade_id === 'alcordexmain::buymatch:source:alcor:action:buymatch:id:7:seq:101:market:314' &&
    ammTrade.trade_id === 'swap.alcor::logswap:source:swap.alcor:action:logswap:seq:102:pair:22' &&
    alcorTrade.trade_id !== ammTrade.trade_id);
  ok('VPS live indexer source keeps stable ID guards and no blank trade_id suffix path',
    liveIndexerSource.includes('const stableId = tradeIdFromRow(row, stream, record);') &&
    liveIndexerSource.includes('if (!stableId) return null;') &&
    !liveIndexerSource.includes('${streamKey(stream)}:${marketId}:${tradeIdFromRow(row, stream, record)}') &&
    !liveIndexerSource.includes('${streamKey(stream)}:${pairId}:${tradeIdFromRow(row, stream, record)}'));
  {
    const evictionState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    }));
    const makeTrade = (symbol, seconds, streamSource = 'alcordexmain::buymatch') => ({
      ...alcorTrade,
      trade_id: `${streamSource}:${symbol}:${seconds}`,
      contract: `${symbol.toLowerCase()}.tokens`,
      symbol,
      stream_source: streamSource,
      traded_at: `2026-06-15T10:${String(seconds).padStart(2, '0')}:00.000Z`,
    });
    liveIndexer.observeLiveTrade(evictionState, makeTrade('OLD', 1));
    for (let i = 2; i <= 500; i += 1) {
      liveIndexer.observeLiveTrade(evictionState, makeTrade(`T${i}`, i % 60));
    }
    liveIndexer.observeLiveTrade(evictionState, makeTrade('OLD', 50));
    liveIndexer.observeLiveTrade(evictionState, makeTrade('NEW', 51));
    ok('VPS live indexer refreshes token cache recency before eviction',
      evictionState.tokenCache.size === 500 &&
      evictionState.tokenCache.has('old.tokens::OLD') &&
      evictionState.tokenCache.has('new.tokens::NEW') &&
      !evictionState.tokenCache.has('t2.tokens::T2'));
  }
  {
    const monotonicState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    }));
    const newer = { ...alcorTrade, trade_id: 'newer', traded_at: '2026-06-15T12:00:00.000Z', stream_source: 'alcordexmain::buymatch' };
    const olderSameStream = { ...alcorTrade, trade_id: 'older-same', traded_at: '2026-06-15T11:00:00.000Z', stream_source: 'alcordexmain::buymatch' };
    const olderOtherStream = { ...ammTrade, trade_id: 'older-other', traded_at: '2026-06-15T10:00:00.000Z', stream_source: 'swap.alcor::logswap' };
    liveIndexer.observeLiveTrade(monotonicState, newer);
    liveIndexer.observeLiveTrade(monotonicState, olderSameStream);
    liveIndexer.observeLiveTrade(monotonicState, olderOtherStream);
    ok('VPS live indexer does not move global or stream timestamps backwards',
      monotonicState.event_count === 3 &&
      monotonicState.last_event_at === newer.traded_at &&
      monotonicState.stream_source === newer.stream_source &&
      monotonicState.streamState.get('alcordexmain::buymatch').last_event_at === newer.traded_at &&
      monotonicState.streamState.get('swap.alcor::logswap').last_event_at === olderOtherStream.traded_at);
  }
  {
    const sourceState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    }));
    liveIndexer.observeLiveTrade(sourceState, alcorTrade);
    liveIndexer.observeLiveTrade(sourceState, { ...ammTrade, contract: 'graffitiking', symbol: 'WAXCASH' });
    liveIndexer.observeLiveTrade(sourceState, { ...alcorTrade, trade_id: `${alcorTrade.trade_id}:again` });
    const merged = sourceState.tokenCache.get('graffitiking::WAXCASH');
    ok('VPS live indexer merges source_keys across observed token sources without duplicates',
      merged &&
      merged.source_keys === 'alcor,swap.alcor' &&
      merged.source === 'alcor');
  }
  {
    const originalDateNow = Date.now;
    Date.now = () => Date.parse('2026-06-15T11:00:00.000Z');
    try {
      const singleTradeState = liveIndexer.createState(liveIndexer.loadConfig({
        WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      }));
      singleTradeState.history.history_started_at = '2026-06-15T10:00:00.000Z';
      liveIndexer.observeLiveTrade(singleTradeState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:metric-single`,
        traded_at: '2026-06-15T10:30:00.000Z',
        price: 2,
        volume: 3,
      });
      const singleWaxcash = liveIndexer.snapshotPayload(singleTradeState).tokens
        .find((token) => token.token_key === 'graffitiking::WAXCASH');
      const metricState = liveIndexer.createState(liveIndexer.loadConfig({
        WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      }));
      metricState.history.history_started_at = '2026-06-15T10:00:00.000Z';
      liveIndexer.observeLiveTrade(metricState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:metric-old`,
        traded_at: '2026-06-15T10:00:00.000Z',
        price: 1,
        volume: 2,
      });
      liveIndexer.observeLiveTrade(metricState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:metric-new`,
        traded_at: '2026-06-15T10:30:00.000Z',
        price: 2,
        volume: 3,
      });
      liveIndexer.observeLiveTrade(metricState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:wax-token`,
        contract: 'eosio.token',
        symbol: 'WAX',
        traded_at: '2026-06-15T10:45:00.000Z',
        price: 1,
        volume: 4,
      });
      const metricSnapshot = liveIndexer.snapshotPayload(metricState);
      const waxcash = metricSnapshot.tokens.find((token) => token.token_key === 'graffitiking::WAXCASH');
      const wax = metricSnapshot.tokens.find((token) => token.token_key === 'eosio.token::WAX');
      ok('VPS live indexer keeps fresh percentage change unavailable until an older observed price exists',
        singleWaxcash &&
        singleWaxcash.fresh_history_change_1h === null &&
        singleWaxcash.fresh_history_change_24h === null);
      ok('VPS live indexer derives fresh rolling metrics only from observed persisted trades',
        waxcash &&
        waxcash.fresh_history_latest_price === 2 &&
        waxcash.fresh_history_latest_trade_at === '2026-06-15T10:30:00.000Z' &&
        waxcash.fresh_history_volume_1h === 5 &&
        waxcash.fresh_history_volume_24h === 5 &&
        waxcash.fresh_history_change_1h === 100 &&
        waxcash.fresh_history_change_24h === 100 &&
        waxcash.fresh_history_volume_24h_complete === false &&
        waxcash.fresh_history_volume_7d_complete === false &&
        waxcash.fresh_history_volume_30d_complete === false &&
        wax &&
        wax.token_key === 'eosio.token::WAX' &&
        wax.symbol === 'WAX' &&
        wax.uses_fake_live_data === false);
      const dirtyHealthState = liveIndexer.createState(liveIndexer.loadConfig({
        WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      }));
      liveIndexer.observeLiveTrade(dirtyHealthState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:dirty-health`,
        traded_at: '2026-06-15T10:20:00.000Z',
        price: 2,
        volume: 3,
      }, { save: false, refresh: false, broadcast: false });
      const dirtyHealth = liveIndexer.healthPayload(dirtyHealthState);
      const healthToken = dirtyHealthState.tokenCache.get('graffitiking::WAXCASH');
      const dirtySnapshotState = liveIndexer.createState(liveIndexer.loadConfig({
        WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      }));
      liveIndexer.observeLiveTrade(dirtySnapshotState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:dirty-snapshot`,
        traded_at: '2026-06-15T10:21:00.000Z',
        price: 2,
        volume: 3,
      }, { save: false, refresh: false, broadcast: false });
      const dirtySnapshot = liveIndexer.snapshotPayload(dirtySnapshotState);
      const dirtyHistoryState = liveIndexer.createState(liveIndexer.loadConfig({
        WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      }));
      liveIndexer.observeLiveTrade(dirtyHistoryState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:dirty-history`,
        traded_at: '2026-06-15T10:22:00.000Z',
        price: 2,
        volume: 3,
      }, { save: false, refresh: false, broadcast: false });
      const dirtyHistory = liveIndexer.historyPayload(dirtyHistoryState);
      ok('VPS live indexer refreshes dirty rolling history on payload reads',
        liveIndexerSource.includes('if (!state.rollingHistory || state.rolling_history_dirty)') &&
        liveIndexerSource.includes('refreshRollingHistory(state)') &&
        liveIndexerSource.includes('const rolling = state.rollingHistory') &&
        dirtyHealth.history.rolling_token_count === 1 &&
        dirtyHealthState.rolling_history_dirty === false &&
        healthToken?.fresh_history_trade_count === 1 &&
        dirtySnapshot.history.rolling_token_count === 1 &&
        dirtySnapshotState.rolling_history_dirty === false &&
        dirtySnapshot.tokens.find((token) => token.token_key === 'graffitiking::WAXCASH')?.fresh_history_trade_count === 1 &&
        dirtyHistory.rolling_token_count === 1 &&
        dirtyHistoryState.rolling_history_dirty === false);
      const staleMetricState = liveIndexer.createState(liveIndexer.loadConfig({
        WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      }));
      liveIndexer.observeLiveTrade(staleMetricState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:stale-fields`,
        traded_at: '2026-06-15T10:23:00.000Z',
        price: 2,
        volume: 3,
      });
      staleMetricState.history.trades.splice(0, staleMetricState.history.trades.length);
      staleMetricState.persistedTradeIdSet.clear();
      staleMetricState.rolling_history_dirty = true;
      const staleHistory = liveIndexer.historyPayload(staleMetricState);
      const staleToken = staleMetricState.tokenCache.get('graffitiking::WAXCASH');
      ok('VPS live indexer clears stale fresh-history fields for cached tokens missing rolling metrics',
        staleHistory.rolling_token_count === 0 &&
        staleToken &&
        staleToken.fresh_history_trade_count === 0 &&
        staleToken.fresh_history_latest_price === null &&
        staleToken.fresh_history_latest_trade_at === null &&
        staleToken.fresh_history_volume_1h === null &&
        staleToken.fresh_history_volume_24h === null &&
        staleToken.fresh_history_volume_7d === null &&
        staleToken.fresh_history_volume_30d === null &&
        staleToken.fresh_history_change_1h === null &&
        staleToken.fresh_history_change_24h === null &&
        staleToken.fresh_history_volume_24h_complete === false &&
        staleToken.fresh_history_volume_7d_complete === false &&
        staleToken.fresh_history_volume_30d_complete === false);
    } finally {
      Date.now = originalDateNow;
    }
  }
  {
    const historyPath = path.join(ROOT, '.tmp-waxonedge-live-history-test.json');
    rmSync(historyPath, { force: true });
    const historyConfig = liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      WAXONEDGE_LIVE_HISTORY_PATH: historyPath,
      WAXONEDGE_LIVE_HISTORY_SAVE_MS: '0',
    });
    const historyState = liveIndexer.createState(historyConfig);
    liveIndexer.observeLiveTrade(historyState, alcorTrade);
    await historyState.history_save_promise;
    const successfulSaveResult = await liveIndexer.saveObservedHistory(historyState);
    const fileWasWritten = existsSync(historyPath);
    const historyHealth = liveIndexer.healthPayload(historyState);
    const restartedState = liveIndexer.createState(historyConfig);
    const restartedHealth = liveIndexer.healthPayload(restartedState);
    const restartedSnapshot = liveIndexer.snapshotPayload(restartedState);
    rmSync(historyPath, { force: true });
    ok('VPS live indexer persists observed verified trades and hydrates fresh history after restart',
      successfulSaveResult === true &&
      fileWasWritten &&
      historyHealth.history.history_mode === 'fresh_start' &&
      historyHealth.history.last_error === null &&
      historyHealth.history.persisted_trade_count === 1 &&
      historyHealth.history.history_complete === false &&
      historyHealth.history.history_backfilled === false &&
      historyHealth.history.deep_history_status === 'requires_ship_state_history' &&
      historyHealth.history.requires_ship_for_deep_history === true &&
      restartedHealth.status === 'connected' &&
      restartedHealth.history.persisted_trade_count === 1 &&
      restartedHealth.history.rolling_1d_candle_count === 1 &&
      restartedSnapshot.tokens.length === 1 &&
      restartedSnapshot.tokens[0].og_source === 'alcor_buy' &&
      restartedSnapshot.tokens[0].fresh_history_trade_count === 1 &&
      restartedSnapshot.tokens[0].fresh_history_volume_7d_complete === false &&
      restartedSnapshot.tokens[0].fresh_history_volume_30d_complete === false);
  }
  {
    const failingConfig = liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      WAXONEDGE_LIVE_HISTORY_PATH: 'bad\u0000path',
    });
    const failingState = liveIndexer.createState(failingConfig);
    let threw = false;
    let failedSaveResult;
    try {
      liveIndexer.observeLiveTrade(failingState, { ...alcorTrade, trade_id: `${alcorTrade.trade_id}:save-failure` });
      failedSaveResult = await failingState.history_save_promise;
    } catch (_) {
      threw = true;
    }
    ok('VPS live indexer records history save failures without crashing ingestion',
      threw === false &&
      failedSaveResult === false &&
      /history save failed:/.test(failingState.history.last_error || '') &&
      failingState.last_error === failingState.history.last_error &&
      failingState.history.trades.length === 1 &&
      liveIndexer.healthPayload(failingState).history.last_error === failingState.history.last_error &&
      liveIndexer.snapshotPayload(failingState).history.last_error === failingState.history.last_error);
  }
  {
    const disabledState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      WAXONEDGE_LIVE_HISTORY_PATH: '',
    }));
    const disabledSaveResult = await liveIndexer.saveObservedHistory(disabledState);
    ok('VPS live indexer save promise resolves false when history persistence is disabled',
      disabledSaveResult === false &&
      disabledState.history_save_promise === null &&
      disabledState.history.last_error == null);
  }
  {
    const serializedPath = path.join(ROOT, '.tmp-waxonedge-live-history-serialized.json');
    rmSync(serializedPath, { force: true });
    rmSync(`${serializedPath}.tmp`, { force: true });
    const serializedState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      WAXONEDGE_LIVE_HISTORY_PATH: serializedPath,
      WAXONEDGE_LIVE_HISTORY_SAVE_MS: '20',
    }));
    const originalWriteFile = fs.promises.writeFile;
    let releaseFirstWrite;
    let activeWrites = 0;
    let maxActiveWrites = 0;
    let writeCalls = 0;
    fs.promises.writeFile = async (...args) => {
      writeCalls += 1;
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      try {
        if (writeCalls === 1) {
          await new Promise((resolve) => { releaseFirstWrite = resolve; });
        }
        return await originalWriteFile.apply(fs.promises, args);
      } finally {
        activeWrites -= 1;
      }
    };
    try {
      liveIndexer.observeLiveTrade(serializedState, { ...alcorTrade, trade_id: `${alcorTrade.trade_id}:serialized-1` });
      const firstPromise = serializedState.history_save_promise;
      for (let i = 0; i < 20 && !releaseFirstWrite; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!releaseFirstWrite) throw new Error('history save did not reach writeFile');
      liveIndexer.observeLiveTrade(serializedState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:serialized-2`,
        traded_at: '2026-06-15T10:31:00.000Z',
      });
      liveIndexer.observeLiveTrade(serializedState, {
        ...alcorTrade,
        trade_id: `${alcorTrade.trade_id}:serialized-3`,
        traded_at: '2026-06-15T10:32:00.000Z',
      });
      const dirtyDuringFirstWrite = serializedState.history_save_dirty;
      releaseFirstWrite();
      await firstPromise;
      const pendingAfterFirstWrite = liveIndexer.historyPayload(serializedState).history_save_pending;
      await serializedState.history_save_promise;
      const serializedHistory = liveIndexer.historyPayload(serializedState);
      ok('VPS live indexer serializes async history saves with dirty follow-up writes',
        dirtyDuringFirstWrite === true &&
        pendingAfterFirstWrite === true &&
        writeCalls === 2 &&
        serializedState.history.trades.length === 3 &&
        maxActiveWrites === 1 &&
        serializedState.history_save_in_flight === false &&
        serializedState.history_save_dirty === false &&
        serializedHistory.history_save_pending === false &&
        typeof serializedHistory.history_last_saved_at === 'string' &&
        serializedState.history.last_error === null);
    } finally {
      fs.promises.writeFile = originalWriteFile;
      rmSync(serializedPath, { force: true });
      rmSync(`${serializedPath}.tmp`, { force: true });
    }
  }
  {
    const duplicateState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      WAXONEDGE_LIVE_ENABLE_STREAM: 'true',
    }));
    liveIndexer.observeLiveTrade(duplicateState, alcorTrade, { save: false, refresh: false, broadcast: false });
    duplicateState.seenTradeIds = [];
    duplicateState.seenTradeIdSet.clear();
    duplicateState.event_count = 0;
    duplicateState.last_event_at = '2026-06-15T12:00:00.000Z';
    duplicateState.stream_source = 'swap.alcor::logswap';
    const sentEvents = [];
    duplicateState.clients.add({
      res: {
        write(chunk) {
          sentEvents.push(String(chunk));
        },
      },
    });
    const duplicateResult = await liveIndexer.ingestVerifiedTradeStreams(duplicateState, async () => new Response(JSON.stringify({
      actions: [{
        action: 'buymatch',
        global_sequence: 101,
        timestamp: '2026-06-15T10:00:00',
        data: {
          record: {
            id: 7,
            market_id: 314,
            ask: '10.00000000 WAXCASH',
            bid: '0.10000000 WAX',
            unit_price: 1000000,
            market: {
              id: 314,
              base_token: { contract: 'graffitiking', sym: '8,WAXCASH' },
              quote_token: { contract: 'eosio.token', sym: '8,WAX' },
            },
          },
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const cachedDuplicateToken = duplicateState.tokenCache.get('graffitiking::WAXCASH');
    ok('VPS live indexer skips retained persisted duplicate trades before side effects',
      liveIndexerSource.includes('state.persistedTradeIdSet.has(trade.trade_id)') &&
      liveIndexerSource.indexOf('state.persistedTradeIdSet.has(trade.trade_id)') <
        liveIndexerSource.indexOf('!rememberTradeId(state, trade.trade_id)') &&
      duplicateResult.observed === 0 &&
      duplicateState.event_count === 0 &&
      duplicateState.last_event_at === '2026-06-15T12:00:00.000Z' &&
      duplicateState.stream_source === 'swap.alcor::logswap' &&
      duplicateState.history.trades.length === 1 &&
      duplicateState.persistedTradeIdSet.has(alcorTrade.trade_id) &&
      cachedDuplicateToken?.last_trade_at === alcorTrade.traded_at &&
      sentEvents.length === 0);
  }
  {
    const maxHistoryMatch = liveIndexerSource.match(/const MAX_PERSISTED_TRADE_HISTORY = (\d+)/);
    const maxPersistedHistory = Number.parseInt(maxHistoryMatch?.[1] || '0', 10);
    const trimState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    }));
    trimState.history.trades.splice(0, trimState.history.trades.length);
    trimState.persistedTradeIdSet.clear();
    const trimBaseMs = Date.parse('2026-06-14T00:00:00.000Z');
    for (let i = 0; i < maxPersistedHistory; i += 1) {
      const trade = {
        ...alcorTrade,
        trade_id: `trim-retained-${i}`,
        traded_at: new Date(trimBaseMs + i * 1000).toISOString(),
      };
      trimState.history.trades.push(trade);
      trimState.persistedTradeIdSet.add(trade.trade_id);
    }
    liveIndexer.observeLiveTrade(trimState, {
      ...alcorTrade,
      trade_id: 'trim-retained-new',
      traded_at: new Date(trimBaseMs + maxPersistedHistory * 1000).toISOString(),
    }, { save: false, refresh: false, broadcast: false });
    ok('VPS live indexer removes trimmed retained trade IDs from persisted dedupe set',
      maxPersistedHistory > 0 &&
      trimState.history.trades.length === maxPersistedHistory &&
      !trimState.persistedTradeIdSet.has('trim-retained-0') &&
      trimState.persistedTradeIdSet.has('trim-retained-new') &&
      liveIndexerSource.includes('idSet.delete(trade.trade_id)'));
  }
}
{
  const stream = liveIndexer.VERIFIED_TRADE_STREAMS.find((item) =>
    item.account === 'alcordexmain' && item.action === 'sellmatch');
  const state = liveIndexer.createState(liveIndexer.loadConfig({
    WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
  }));
  const response = new Response(JSON.stringify({
    actions: [{
      action: 'sellmatch',
      global_sequence: 55,
      timestamp: '2026-06-15T11:00:00Z',
      data: {
        record: {
          id: 9,
          market_id: 400,
          ask: '1.00000000 WAXCASH',
          bid: '0.01000000 WAX',
          unit_price: 1000000,
          market: {
            id: 400,
            base_token: { contract: 'graffitiking', sym: '8,WAXCASH' },
            quote_token: { contract: 'eosio.token', sym: '8,WAX' },
          },
        },
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const requestedUrls = [];
  const result = await liveIndexer.ingestVerifiedTradeStreams(state, async (url) => {
    requestedUrls.push(url);
    return response.clone();
  });
  ok('VPS live indexer polls only verified Hyperion action streams and updates in-memory cache',
    requestedUrls.some((url) => url.includes('/history/get_actions') &&
      url.includes('account=alcordexmain') &&
      url.includes('act.name=buymatch')) &&
    requestedUrls.some((url) => url.includes('account=swap.alcor') && url.includes('act.name=logswap')) &&
    result.observed === 1 &&
    state.connected === true &&
    state.tokenCache.has('graffitiking::WAXCASH') &&
    stream &&
    !liveIndexerSource.includes('reserve-derived candles') &&
    !/Math\.random|synthetic price movement|browser_hyperion_fetch:\s*true/i.test(liveIndexerSource));
  ok('VPS live indexer batches polling refresh and history persistence once per poll',
    liveIndexerSource.includes('const updatedTokenKeys = new Set()') &&
    liveIndexerSource.includes('let persistedTradesAdded = false') &&
    liveIndexerSource.includes('observeLiveTrade(state, trade, {') &&
    liveIndexerSource.includes('save: false') &&
    liveIndexerSource.includes('broadcast: false') &&
    liveIndexerSource.includes('refresh: false') &&
    liveIndexerSource.includes('if (observed > 0) {') &&
    liveIndexerSource.includes('refreshRollingHistory(state)') &&
    liveIndexerSource.includes('if (persistedTradesAdded) saveObservedHistory(state)') &&
    !/for \(const row of rows\.reverse\(\)\)[\s\S]*refreshRollingHistory\(state\)[\s\S]*observed \+= 1/.test(liveIndexerSource) &&
    !/for \(const row of rows\.reverse\(\)\)[\s\S]*saveObservedHistory\(state\)[\s\S]*observed \+= 1/.test(liveIndexerSource));
  {
    const errorState = liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
    }));
    const errorResult = await liveIndexer.ingestVerifiedTradeStreams(errorState, async () =>
      new Response('bad gateway', { status: 502 }));
    ok('VPS live indexer surfaces real stream errors when no trades are observed',
      errorResult.observed === 0 &&
      errorState.connected === false &&
      errorState.last_error === 'Hyperion 502' &&
      errorResult.error === 'Hyperion 502');
  }
  const emptyResult = await liveIndexer.ingestVerifiedTradeStreams(state, async () =>
    new Response(JSON.stringify({ actions: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  ok('VPS live indexer keeps connected state after an empty poll once real events were observed',
    emptyResult.observed === 0 &&
    state.connected === true &&
    state.status === 'connected' &&
    liveIndexer.healthPayload(state).status === 'connected');
}
{
  let rejectedFakeHealth = false;
  let rejectedFakeToken = false;
  let rejectedNestedSynthetic = false;
  try {
    liveIndexerCheck.assertNoFakeLiveData({ uses_fake_live_data: true }, 'health');
  } catch (_) {
    rejectedFakeHealth = true;
  }
  try {
    liveIndexerCheck.assertNoFakeLiveData({
      uses_fake_live_data: false,
      tokens: [{ token_key: 'fake::FAKE', fake: true }],
    }, 'snapshot');
  } catch (_) {
    rejectedFakeToken = true;
  }
  try {
    liveIndexerCheck.assertNoFakeLiveData({
      uses_fake_live_data: false,
      details: { synthetic: true },
    }, 'snapshot');
  } catch (_) {
    rejectedNestedSynthetic = true;
  }
  ok('VPS live indexer runtime check fails on fake live data',
    rejectedFakeHealth && rejectedFakeToken && rejectedNestedSynthetic);
}
{
  const healthPayload = {
    service: 'waxonedge-live-indexer',
    status: 'not_connected',
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  };
  const snapshotPayload = {
    source: 'waxonedge-live-indexer',
    mode: 'snapshot',
    token_key_format: 'contract::symbol',
    tokens: [],
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
  };
  const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  const sseResponse = (body) => new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
  const sseChunkResponse = (chunks) => new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  }), {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
  let consumed503StreamBody = false;
  const jsonStream503 = (payload) => new Response(new ReadableStream({
    start(controller) {
      consumed503StreamBody = true;
      controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
      controller.close();
    },
  }), {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  async function withMockFetch(responses, fn) {
    const originalFetch = globalThis.fetch;
    const pending = responses.slice();
    globalThis.fetch = async () => {
      const next = pending.shift();
      if (!next) throw new Error('unexpected fetch call');
      return next;
    };
    try {
      return await fn();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
  const checkEnv = {
    WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test',
    WAXONEDGE_LIVE_CHECK_STREAM: 'false',
  };
  const skeleton = await withMockFetch([
    jsonResponse(503, healthPayload),
    jsonResponse(503, snapshotPayload),
  ], () => liveIndexerCheck.runCheck(checkEnv));
  const connected = await withMockFetch([
    jsonResponse(200, { ...healthPayload, status: 'connected' }),
    jsonResponse(200, { ...snapshotPayload, status: 'connected' }),
  ], () => liveIndexerCheck.runCheck(checkEnv));
  let rejectedWrongService = false;
  let rejected404 = false;
  let rejected500 = false;
  let rejectedNoHeartbeat = false;
  let rejectedFakeStream = false;
  let rejectedNestedFakeStream = false;
  let rejectedCrlfFakeStream = false;
  let rejectedFake503Stream = false;
  let rejectedNestedJson503Stream = false;
  const firstChunkHeartbeat = await withMockFetch([
    jsonResponse(503, healthPayload),
    jsonResponse(503, snapshotPayload),
    sseResponse('event: heartbeat\ndata: {"uses_fake_live_data":false}\n\n'),
  ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  const splitHeartbeat = await withMockFetch([
    jsonResponse(503, healthPayload),
    jsonResponse(503, snapshotPayload),
    sseChunkResponse(['event: hea', 'rtbeat\n', 'data: {"uses_fake_live_data":false}\n\n']),
  ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  const skeleton503Stream = await withMockFetch([
    jsonResponse(503, healthPayload),
    jsonResponse(503, snapshotPayload),
    jsonStream503({
      ok: false,
      error: 'live stream transport not enabled yet',
      uses_fake_live_data: false,
    }),
  ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  const realTokenStream = await withMockFetch([
    jsonResponse(200, { ...healthPayload, status: 'connected' }),
    jsonResponse(200, { ...snapshotPayload, status: 'connected' }),
    sseResponse('event: token_update\ndata: {"token_key":"graffitiking::WAXCASH","uses_fake_live_data":false}\n\nevent: heartbeat\ndata: {"uses_fake_live_data":false}\n\n'),
  ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  try {
    await withMockFetch([
      jsonResponse(200, { ...healthPayload, service: 'other-service' }),
      jsonResponse(200, snapshotPayload),
    ], () => liveIndexerCheck.runCheck(checkEnv));
  } catch (_) {
    rejectedWrongService = true;
  }
  try {
    await withMockFetch([
      jsonResponse(404, { ...healthPayload }),
      jsonResponse(200, snapshotPayload),
    ], () => liveIndexerCheck.runCheck(checkEnv));
  } catch (_) {
    rejected404 = true;
  }
  try {
    await withMockFetch([
      jsonResponse(500, { ...healthPayload }),
      jsonResponse(200, snapshotPayload),
    ], () => liveIndexerCheck.runCheck(checkEnv));
  } catch (_) {
    rejected500 = true;
  }
  try {
    await withMockFetch([
      jsonResponse(503, healthPayload),
      jsonResponse(503, snapshotPayload),
      sseChunkResponse(['event: ready\n', 'data: {}\n\n']),
    ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  } catch (_) {
    rejectedNoHeartbeat = true;
  }
  try {
    await withMockFetch([
      jsonResponse(503, healthPayload),
      jsonResponse(503, snapshotPayload),
      sseResponse('event: token_update\ndata: {\n  "uses_fake_live_data" : true\n}\n\n'),
    ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  } catch (_) {
    rejectedFakeStream = true;
  }
  try {
    await withMockFetch([
      jsonResponse(503, healthPayload),
      jsonResponse(503, snapshotPayload),
      sseResponse('event: token_update\ndata: {"token_key":"graffitiking::WAXCASH","meta":{"source":"mock"},"uses_fake_live_data":false}\n\nevent: heartbeat\ndata: {"uses_fake_live_data":false}\n\n'),
    ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  } catch (_) {
    rejectedNestedFakeStream = true;
  }
  try {
    await withMockFetch([
      jsonResponse(503, healthPayload),
      jsonResponse(503, snapshotPayload),
      sseResponse('event: token_update\r\ndata: {"token_key":"graffitiking::WAXCASH","meta":{"synthetic":true},"uses_fake_live_data":false}\r\n\r\nevent: heartbeat\r\ndata: {"uses_fake_live_data":false}\r\n\r\n'),
    ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  } catch (_) {
    rejectedCrlfFakeStream = true;
  }
  try {
    await withMockFetch([
      jsonResponse(503, healthPayload),
      jsonResponse(503, snapshotPayload),
      jsonStream503({ uses_fake_live_data: true }),
    ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  } catch (_) {
    rejectedFake503Stream = true;
  }
  try {
    await withMockFetch([
      jsonResponse(503, healthPayload),
      jsonResponse(503, snapshotPayload),
      jsonStream503({ uses_fake_live_data: false, nested: { browser_hyperion_fetch: true } }),
    ], () => liveIndexerCheck.runCheck({ WAXONEDGE_LIVE_CHECK_URL: 'http://live-indexer.test' }));
  } catch (_) {
    rejectedNestedJson503Stream = true;
  }
  ok('VPS live indexer runtime checker validates service identity, endpoint status, and skeleton contracts',
    skeleton.ok === true &&
    connected.ok === true &&
    firstChunkHeartbeat.stream.heartbeat === true &&
    splitHeartbeat.stream.heartbeat === true &&
    skeleton503Stream.stream.unavailable === true &&
    realTokenStream.stream.heartbeat === true &&
    consumed503StreamBody &&
    rejectedWrongService &&
    rejected404 &&
    rejected500 &&
    rejectedNoHeartbeat &&
    rejectedFakeStream &&
    rejectedNestedFakeStream &&
    rejectedCrlfFakeStream &&
    rejectedFake503Stream &&
    rejectedNestedJson503Stream &&
    liveIndexerCheckScript.includes("JSON.parse(String(text || '').trim())") &&
    liveIndexerCheckScript.includes('parseSseDataPayloads(text).some((payload) => hasFakeMarker(payload))'));
}
ok('VPS live indexer safely parses request path without trusting Host header',
  liveIndexer.safeRequestPathname('/health?x=1') === '/health' &&
  liveIndexer.safeRequestPathname('/health') === '/health' &&
  liveIndexer.safeRequestPathname('/snapshot') === '/snapshot' &&
  liveIndexer.safeRequestPathname('/stream') === '/stream' &&
  liveIndexer.safeRequestPathname('bad-target') === null &&
  liveIndexer.safeRequestPathname('/bad%') === null &&
  liveIndexer.safeRequestPathname('/bad\r\nHost:evil.example') === null &&
  liveIndexer.safeRequestPathname('https://user:pass@host/health?x=1') === null &&
  liveIndexer.safeRequestPathname('https://host/health#frag') === null &&
  liveIndexer.safeRequestPathname('ftp://host/health') === null &&
  liveIndexerSource.includes('function safeRequestPathname') &&
  !liveIndexerSource.includes('new URL(req.url ||') &&
  !liveIndexerSource.includes('req.headers.host ||') &&
  liveIndexerSource.includes("error: 'malformed request target'"));
{
  let body = '';
  const res = {
    writeHead() {},
    end(value) {
      body = value;
    },
  };
  liveIndexer.writeJson(res, 200, { ok: true, nested: { value: 1 } });
  ok('VPS live indexer writeJson uses compact JSON responses',
    body === '{"ok":true,"nested":{"value":1}}' &&
    !body.includes('\n  "'));
}
{
  function fakeLiveDb(results, onSql) {
    return {
      prepare(sql) {
        if (onSql) onSql(sql);
        return {
          bind() {
            return {
              async all() {
                return { results };
              },
            };
          },
        };
      },
    };
  }
  const emptyResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    { DB: fakeLiveDb([]) },
    new URLSearchParams(),
    {},
  );
  const emptyBody = await emptyResponse.json();
  ok('/api/waxonedge/live returns ok true with pinned WAXCASH when indexed graph rows are empty',
    emptyResponse.status === 200 &&
    emptyBody.ok === true &&
    emptyBody.source === 'moonboys-api/waxonedge-live' &&
    emptyBody.mode === 'snapshot' &&
    Array.isArray(emptyBody.tokens) &&
    emptyBody.tokens.length === 1 &&
    emptyBody.tokens[0].token_key === 'graffitiking::WAXCASH' &&
    emptyBody.next_cursor == null &&
    Array.isArray(emptyBody.warnings) &&
    emptyBody.warnings.length === 0);
  const nullStatsResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    {
      DB: fakeLiveDb([{
        contract: 'graffitiking',
        symbol: 'WAXCASH',
        price_wax: null,
        price_usd: null,
        pair_count: null,
        updated_at: '2026-06-14T11:00:00.000Z',
        source_keys: '',
      }]),
    },
    new URLSearchParams(),
    {},
  );
  const nullStatsBody = await nullStatsResponse.json();
  ok('/api/waxonedge/live handler does not throw when stats fields are null/missing',
    nullStatsResponse.status === 200 &&
    nullStatsBody.ok === true &&
    nullStatsBody.tokens.length === 1 &&
    nullStatsBody.tokens[0].token_key === 'graffitiking::WAXCASH' &&
    nullStatsBody.next_cursor === '2026-06-14T11%3A00%3A00.000Z~graffitiking~WAXCASH');
  const liveValuationPair = {
    source: 'swap.taco',
    pair_id: '8388',
    token_a_contract: 'eosio.token',
    token_a_symbol: 'WAX',
    token_b_contract: 'graffitiking',
    token_b_symbol: 'WAXCASH',
    reserve_a: '1000',
    reserve_b: '100000',
    volume_24h_wax: '123',
    volume_24h_usd: '0.738',
    updated_at: '2026-06-14T11:00:00.000Z',
  };
  const liveValuationDb = {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('FROM waxonedge_pairs')) {
                return { results: [liveValuationPair] };
              }
              if (sql.includes('SELECT contract, symbol, price_wax, price_usd')) {
                return { results: [{ contract: 'eosio.token', symbol: 'WAX', price_wax: '1', price_usd: '0.006' }] };
              }
              if (sql.includes('FROM waxonedge_tokens t') && sql.includes('WHERE')) {
                return {
                  results: [{
                    contract: 'graffitiking',
                    symbol: 'WAXCASH',
                    total_supply: '1000000',
                    circulating_supply: '500000',
                    pair_count: '1',
                    source_keys: 'swap.taco',
                    updated_at: '2026-06-14T11:00:00.000Z',
                  }],
                };
              }
              return {
                results: [],
              };
            },
          };
        },
      };
    },
  };
  const valuedLiveResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    { DB: liveValuationDb },
    new URLSearchParams(),
    {},
  );
  const valuedLiveBody = await valuedLiveResponse.json();
  const valuedLiveToken = valuedLiveBody.tokens?.[0] || {};
  ok('/api/waxonedge/live serializes reserve-backed selected price, TVL, liquidity, volume, and market cap',
    valuedLiveResponse.status === 200 &&
    valuedLiveBody.ok === true &&
    valuedLiveToken.token_key === 'graffitiking::WAXCASH' &&
    Number(valuedLiveToken.price_wax) === 0.01 &&
    Number(valuedLiveToken.price_usd) === 0.00006 &&
    Number(valuedLiveToken.liquidity_wax) === 2000 &&
    Number(valuedLiveToken.liquidity_usd) === 12 &&
    Number(valuedLiveToken.tvl_wax) === 2000 &&
    Number(valuedLiveToken.tvl_usd) === 12 &&
    Number(valuedLiveToken.volume_24h_wax) === 123 &&
    Number(valuedLiveToken.volume_24h_usd) === 0.738 &&
    Number(valuedLiveToken.market_cap_wax) === 5000 &&
    Number(valuedLiveToken.market_cap_usd) === 30 &&
    valuedLiveToken.selected_price_confidence === 'good' &&
    valuedLiveToken.liquidity_confidence === 'good' &&
    valuedLiveToken.tvl_confidence === 'good' &&
    valuedLiveToken.market_cap_confidence === 'good');
  const graphPairs = [
    {
      source: 'swap.alcor',
      pair_id: '8388',
      token_a_contract: 'eosio.token',
      token_a_symbol: 'WAX',
      token_b_contract: 'graffitiking',
      token_b_symbol: 'WAXCASH',
      reserve_a: '1000',
      reserve_b: '100000',
      liquidity_wax: '2000',
      volume_24h_wax: '100',
      updated_at: '2026-06-14T11:00:00.000Z',
    },
    {
      source: 'swap.nefty',
      pair_id: 'WAXCASHWAXLEGACY',
      token_a_contract: 'graffitiking',
      token_a_symbol: 'WAXCASH',
      token_b_contract: 'eosio.token',
      token_b_symbol: 'WAX',
      reserve_a: '50000',
      reserve_b: '1500',
      liquidity_wax: '3000',
      volume_24h_wax: '75',
      fee_bps: '0',
      updated_at: '2026-06-14T11:01:00.000Z',
    },
    {
      source: 'swap.nefty',
      pair_id: 'WAXCASHWUF',
      token_a_contract: 'graffitiking',
      token_a_symbol: 'WAXCASH',
      token_b_contract: 'wuffi',
      token_b_symbol: 'WUF',
      reserve_a: '50000',
      reserve_b: '1000',
      updated_at: '2026-06-14T11:05:00.000Z',
    },
    {
      source: 'swap.nefty',
      pair_id: 'WAXCASHABC',
      token_a_contract: 'graffitiking',
      token_a_symbol: 'WAXCASH',
      token_b_contract: 'abc.token',
      token_b_symbol: 'ABC',
      reserve_a: '10000',
      reserve_b: '500',
      updated_at: '2026-06-14T11:06:00.000Z',
    },
    {
      source: 'swap.nefty',
      pair_id: 'WAXCASHROUTE',
      token_a_contract: 'graffitiking',
      token_a_symbol: 'WAXCASH',
      token_b_contract: 'route.token',
      token_b_symbol: 'ROUTE',
      reserve_a: '20000',
      reserve_b: '100',
      updated_at: '2026-06-14T11:06:30.000Z',
    },
    {
      source: 'swap.nefty',
      pair_id: 'WAXCASHAIGOD',
      token_a_contract: 'graffitiking',
      token_a_symbol: 'WAXCASH',
      token_b_contract: 'aigodtokenwx',
      token_b_symbol: 'AIGOD',
      reserve_a: '1000',
      reserve_b: '3000000',
      updated_at: '2026-06-14T11:06:35.000Z',
    },
    {
      source: 'swap.taco',
      pair_id: 'AIGODWAXFAKE',
      token_a_contract: 'aigodtokenwx',
      token_a_symbol: 'AIGOD',
      token_b_contract: 'eosio.token',
      token_b_symbol: 'WAX',
      reserve_a: '1',
      reserve_b: '100',
      updated_at: '2026-06-14T11:06:40.000Z',
    },
    {
      source: 'swap.box',
      pair_id: 'ROUTEHELP',
      token_a_contract: 'route.token',
      token_a_symbol: 'ROUTE',
      token_b_contract: 'help.token',
      token_b_symbol: 'HELP',
      reserve_a: '100',
      reserve_b: '50',
      liquidity_wax: '20',
      updated_at: '2026-06-14T11:06:45.000Z',
    },
    {
      source: 'swap.taco',
      pair_id: 'HELPWAX',
      token_a_contract: 'help.token',
      token_a_symbol: 'HELP',
      token_b_contract: 'eosio.token',
      token_b_symbol: 'WAX',
      reserve_a: '1000',
      reserve_b: '200',
      updated_at: '2026-06-14T11:06:50.000Z',
    },
    {
      source: 'swap.taco',
      pair_id: 'WUFWAX150',
      token_a_contract: 'wuffi',
      token_a_symbol: 'WUF',
      token_b_contract: 'eosio.token',
      token_b_symbol: 'WAX',
      reserve_a: '100000',
      reserve_b: '150',
      updated_at: '2026-06-14T11:07:00.000Z',
    },
    {
      source: 'swap.taco',
      pair_id: 'ABCWAX50',
      token_a_contract: 'abc.token',
      token_a_symbol: 'ABC',
      token_b_contract: 'eosio.token',
      token_b_symbol: 'WAX',
      reserve_a: '10000',
      reserve_b: '50',
      updated_at: '2026-06-14T11:08:00.000Z',
    },
    {
      source: 'swap.taco',
      pair_id: 'QQQWAX999',
      token_a_contract: 'qqq.core',
      token_a_symbol: 'QQQCORE',
      token_b_contract: 'eosio.token',
      token_b_symbol: 'WAX',
      reserve_a: '100',
      reserve_b: '999',
      updated_at: '2026-06-14T11:09:00.000Z',
    },
  ];
    const graphTokenRows = [
      { contract: 'graffitiking', symbol: 'WAXCASH', total_supply: '1000000', circulating_supply: '500000', icon_url: '/img/tokens/waxcash.png', updated_at: '2026-06-14T11:00:00.000Z' },
      { contract: 'wuffi', symbol: 'WUF', total_supply: '1000000', circulating_supply: '400000', icon_url: '/img/tokens/wuf.png', source_count: 3, source_keys: 'swap.nefty,swap.taco,swap.box', updated_at: '2026-06-14T11:05:00.000Z' },
    { contract: 'abc.token', symbol: 'ABC', total_supply: '1000000', circulating_supply: '300000', updated_at: '2026-06-14T11:06:00.000Z' },
    { contract: 'route.token', symbol: 'ROUTE', total_supply: '1000000', circulating_supply: '200000', updated_at: '2026-06-14T11:06:30.000Z' },
    { contract: 'aigodtokenwx', symbol: 'AIGOD', total_supply: '1000000', circulating_supply: '200000', updated_at: '2026-06-14T11:06:35.000Z' },
    { contract: 'help.token', symbol: 'HELP', total_supply: '1000000', circulating_supply: '100000', updated_at: '2026-06-14T11:06:50.000Z' },
    { contract: 'qqq.core', symbol: 'QQQCORE', total_supply: '1000000', circulating_supply: '100000', updated_at: '2026-06-14T11:09:00.000Z' },
    { contract: 'eosio.token', symbol: 'WAX', price_wax: '1', price_usd: '0.006', icon_url: '/img/tokens/wax.png', updated_at: '2026-06-14T11:00:00.000Z' },
  ];
  const graphDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              if (sql.includes('FROM waxonedge_pairs')) {
                const wantsWaxcash = params.includes('graffitiking') && params.includes('WAXCASH');
                if (wantsWaxcash && !sql.includes('CAST(COALESCE(reserve_a')) {
                  return { results: graphPairs.filter((pair) => pair.pair_id.startsWith('8388') || pair.pair_id.startsWith('WAXCASH')) };
                }
                return {
                  results: graphPairs.filter((pair) => params.some((value, index) =>
                    index % 4 === 0 &&
                    ((pair.token_a_contract === value && pair.token_a_symbol === params[index + 1]) ||
                      (pair.token_b_contract === value && pair.token_b_symbol === params[index + 1]))
                  )),
                };
              }
              if (sql.includes('SELECT contract, symbol, price_wax, price_usd')) {
                return { results: graphTokenRows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])) };
              }
              if (sql.includes('FROM waxonedge_tokens t')) {
                return { results: graphTokenRows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])) };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
  const pairTokenTouches = (pair, contract, symbol) =>
    (pair.token_a_contract === contract && pair.token_a_symbol === symbol) ||
    (pair.token_b_contract === contract && pair.token_b_symbol === symbol);
  const waxcashAnalyticsDb = {
    prepare(sql) {
      function allResults(params) {
        if (sql.includes('FROM waxonedge_pairs')) {
          const wantsWaxcash = params.includes('graffitiking') && params.includes('WAXCASH');
          if (wantsWaxcash) {
            return { results: graphPairs.filter((pair) => pairTokenTouches(pair, 'graffitiking', 'WAXCASH')) };
          }
          return {
            results: graphPairs.filter((pair) => params.some((value, index) =>
              index % 4 === 0 &&
              ((pair.token_a_contract === value && pair.token_a_symbol === params[index + 1] && pair.token_b_contract === 'eosio.token' && pair.token_b_symbol === 'WAX') ||
                (pair.token_b_contract === value && pair.token_b_symbol === params[index + 1] && pair.token_a_contract === 'eosio.token' && pair.token_a_symbol === 'WAX'))
            )),
          };
        }
        if (sql.includes('FROM waxonedge_chart_candles')) {
          if (params[0] === 'swap.alcor' && params[1] === '8388') {
            return {
              results: [
                {
                  source: 'swap.alcor',
                  pair_id: '8388',
                  interval: '1D',
                  bucket_time: '2026-06-14T00:00:00.000Z',
                  open: '0.029',
                  high: '0.031',
                  low: '0.028',
                  close: '0.03',
                  volume: '100',
                },
                {
                  source: 'swap.alcor',
                  pair_id: '8388',
                  interval: '1D',
                  bucket_time: '2026-06-15T00:00:00.000Z',
                  open: '34.48275862',
                  high: '35.71428571',
                  low: '32.25806452',
                  close: '33.33333333',
                  volume: '120',
                },
                {
                  source: 'swap.alcor',
                  pair_id: '8388',
                  interval: '1D',
                  bucket_time: '2026-06-16T00:00:00.000Z',
                  open: '100',
                  high: '101',
                  low: '0.029',
                  close: '0.03',
                  volume: '12',
                },
              ],
            };
          }
          if (params[0] === 'swap.nefty' && params[1] === 'WAXCASHWAXLEGACY') {
            return {
              results: [
                {
                  source: 'swap.nefty',
                  pair_id: 'WAXCASHWAXLEGACY',
                  interval: '1D',
                  bucket_time: '2026-06-14T00:00:00.000Z',
                  open: '0.029',
                  high: '0.031',
                  low: '0.028',
                  close: '0.03',
                  volume: '100',
                },
                {
                  source: 'swap.nefty',
                  pair_id: 'WAXCASHWAXLEGACY',
                  interval: '1D',
                  bucket_time: '2026-06-15T00:00:00.000Z',
                  open: '34.48275862',
                  high: '35.71428571',
                  low: '32.25806452',
                  close: '33.33333333',
                  volume: '120',
                },
                {
                  source: 'swap.nefty',
                  pair_id: 'WAXCASHWAXLEGACY',
                  interval: '1D',
                  bucket_time: '2026-06-16T00:00:00.000Z',
                  open: '100',
                  high: '101',
                  low: '0.029',
                  close: '0.03',
                  volume: '12',
                },
              ],
            };
          }
          if (params[0] === 'swap.nefty' && params[1] === 'WAXWUFB') {
            return {
              results: [{
                source: 'swap.nefty',
                pair_id: 'WAXWUFB',
                interval: '1D',
                bucket_time: '2026-06-14T00:00:00.000Z',
                open: '999',
                high: '1000',
                low: '998',
                close: '999',
                volume: '1',
              }],
            };
          }
          return { results: [] };
        }
        if (sql.includes('FROM waxonedge_tokens')) {
          return { results: graphTokenRows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])) };
        }
        if (sql.includes('FROM waxonedge_token_stats')) {
          return {
            results: [{
              contract: 'graffitiking',
              symbol: 'WAXCASH',
              holder_count: '42',
              circulating_supply: '500000',
              volume_24h_wax: '100',
              volume_7d: '700',
              volume_30d: '3000',
              source_count: '3',
              updated_at: '2026-06-14T11:00:00.000Z',
            }],
          };
        }
        return { results: [] };
      }
      return {
        bind(...params) {
          return {
            async all() {
              return allResults(params);
            },
            async first() {
              return allResults(params).results[0] || null;
            },
          };
        },
      };
    },
  };
    const waxcashGraph = await __waxonedgeTestHooks.loadWaxcashGraphTokenRows(graphDb);
    const waxcashPairGraph = await __waxonedgeTestHooks.buildWaxcashPairGraph(graphDb);
    const waxcashAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(waxcashAnalyticsDb);
    const graphTokenKeys = waxcashGraph.tokenRows.map((token) => `${token.contract}::${token.symbol}`);
    const graphPairIds = waxcashGraph.pairRows.map((pair) => pair.pair_id);
    const visibleGraphKeys = waxcashGraph.tokenRows
      .filter((token) => token.visible_in_waxcash_bubbles === true)
      .map((token) => `${token.contract}::${token.symbol}`);
    const hiddenGraphKeys = waxcashGraph.tokenRows
      .filter((token) => token.visible_in_waxcash_bubbles === false)
      .map((token) => `${token.contract}::${token.symbol}`);
  ok('WaxOnEdge main token graph is WAXCASH-centered and excludes unrelated WAX tokens',
    graphTokenKeys.includes('graffitiking::WAXCASH') &&
    graphTokenKeys.includes('wuffi::WUF') &&
    graphTokenKeys.includes('abc.token::ABC') &&
    graphTokenKeys.includes('route.token::ROUTE') &&
    graphTokenKeys.includes('aigodtokenwx::AIGOD') &&
    graphTokenKeys.includes('help.token::HELP') &&
    graphTokenKeys.includes('eosio.token::WAX') &&
    !graphTokenKeys.includes('qqq.core::QQQCORE') &&
    graphPairIds.includes('WUFWAX150') &&
    graphPairIds.includes('ABCWAX50') &&
    graphPairIds.includes('AIGODWAXFAKE') &&
    graphPairIds.includes('ROUTEHELP') &&
    graphPairIds.includes('HELPWAX') &&
    graphTokenKeys.includes('help.token::HELP') &&
    !graphPairIds.includes('QQQWAX999'),
    JSON.stringify({ graphTokenKeys, graphPairIds }));
    ok('WaxOnEdge recursive graph loads direct token pairs and secondary connected token pairs',
      graphPairIds.includes('WAXCASHROUTE') &&
      graphPairIds.includes('ROUTEHELP') &&
      graphTokenKeys.includes('help.token::HELP') &&
      graphPairIds.includes('HELPWAX') &&
      waxcashGraph.graph_config.max_depth === 2,
      JSON.stringify({ graphTokenKeys, graphPairIds }));
    ok('WaxOnEdge visible bubble scope is WAXCASH root plus direct WAXCASH-paired tokens only',
      visibleGraphKeys.includes('graffitiking::WAXCASH') &&
      visibleGraphKeys.includes('wuffi::WUF') &&
      visibleGraphKeys.includes('abc.token::ABC') &&
      visibleGraphKeys.includes('route.token::ROUTE') &&
      visibleGraphKeys.includes('aigodtokenwx::AIGOD') &&
      visibleGraphKeys.includes('eosio.token::WAX') &&
      visibleGraphKeys.length === 6 &&
      hiddenGraphKeys.includes('help.token::HELP') &&
      !visibleGraphKeys.includes('help.token::HELP'),
      JSON.stringify({ visibleGraphKeys, hiddenGraphKeys }));
    ok('WaxOnEdge recursive graph does not expand through unknown graph liquidity',
      __waxonedgeTestHooks.pairPassesGraphExpansionThreshold({
        source: 'swap.taco',
        pair_id: 'UNKNOWNLIQ',
        token_a_contract: 'wuffi',
        token_a_symbol: 'WUF',
        token_b_contract: 'mystery.token',
        token_b_symbol: 'MYST',
        reserve_a: '100',
        reserve_b: '200',
        liquidity_wax: null,
      }) === false);
    ok('WAXCASH analytics endpoint returns all exact WAXCASH pairs',
      waxcashAnalytics.pairs.length === graphPairs.filter((pair) => pairTokenTouches(pair, 'graffitiking', 'WAXCASH')).length &&
      waxcashAnalytics.pairs.some((pair) => pair.pair_id === '8388') &&
      waxcashAnalytics.pairs.some((pair) => pair.pair_id === 'WAXCASHWUF') &&
      waxcashAnalytics.pairs.some((pair) => pair.pair_id === 'WAXCASHABC'),
      JSON.stringify(waxcashAnalytics.pairs.map((pair) => pair.pair_id)));
    ok('WAXCASH analytics selected price uses deepest usable direct WAX proof, not recursive graph route',
      Number(waxcashAnalytics.stats.selected_price_wax) === 0.03 &&
      waxcashAnalytics.stats.selected_pair_source === 'swap.nefty' &&
      waxcashAnalytics.stats.selected_pair_id === 'WAXCASHWAXLEGACY' &&
      waxcashAnalytics.stats.selected_price_basis === 'og_woe_direct_wax_pool' &&
      waxcashAnalytics.stats.selected_price_route === null &&
      waxcashAnalytics.stats.uses_recursive_graph_price === false &&
      waxcashAnalytics.headline_price?.headline_price_source_policy === 'og_woe_deepest_usable_direct_wax_pool');
    ok('WAXCASH analytics names the selected direct WAX pool by largest WAX reserve, not depth',
      waxcashAnalytics.selected_largest_wax_reserve_pool?.pair_id === 'WAXCASHWAXLEGACY' &&
      !(('selected_' + 'deep' + 'est_wax_pool') in waxcashAnalytics) &&
      !(('selected_' + 'deep' + 'est_wax_pool') in (waxcashAnalytics.proof || {})));
    ok('WAXCASH analytics chart source is Alcor pool #8388 display feed, not the selected price proof pair',
      waxcashAnalytics.chart?.chart_source?.source === 'swap.alcor' &&
      waxcashAnalytics.chart?.chart_source?.pair_id === '8388' &&
      waxcashAnalytics.chart?.chart_source?.pair_id !== waxcashAnalytics.selected_largest_wax_reserve_pool?.pair_id &&
      waxcashAnalytics.stats.selected_pair_id === 'WAXCASHWAXLEGACY' &&
      waxcashAnalytics.chart?.chart_source?.pair_id !== 'WAXWUFB');
    ok('WAXCASH analytics 24h change comes from selected proof history, not display chart candles',
      waxcashAnalytics.stats.metric_status.change_24h.source === 'selected_price_proof_pool_history' &&
      waxcashAnalytics.stats.metric_status.change_24h.basis.includes('selected proof pool') &&
      waxcashAnalytics.sections?.chart?.pair_id === '8388' &&
      waxcashAnalytics.stats.selected_pair_id === 'WAXCASHWAXLEGACY',
      JSON.stringify({
        change_24h: waxcashAnalytics.stats.change_24h,
        change_status: waxcashAnalytics.stats.metric_status.change_24h,
        chart: waxcashAnalytics.sections?.chart,
      }));
    const waxcashChartOhlcValues = (waxcashAnalytics.chart?.candles || []).flatMap((candle) =>
      ['open', 'high', 'low', 'close'].map((field) => Number(candle[field])));
    const waxcashChartCloses = (waxcashAnalytics.chart?.candles || []).map((candle) => Number(candle.close));
    ok('WAXCASH analytics chart normalizes selected WAX pair candles to WAX per WAXCASH without mixed inverse values',
      waxcashChartCloses.length === 2 &&
      waxcashChartCloses.every((value) => value > 0.02 && value < 0.04) &&
      waxcashChartOhlcValues.every((value) => value > 0.02 && value < 0.04) &&
      waxcashAnalytics.chart?.candle_normalization?.price_unit === 'WAX_per_WAXCASH' &&
      waxcashAnalytics.chart?.candle_normalization?.inverted_count === 1 &&
      waxcashAnalytics.chart?.candle_normalization?.rejected_count === 1 &&
      waxcashAnalytics.chart?.candle_normalization?.rejection_reasons?.ohlc_outside_selected_price_range === 1 &&
      !waxcashChartOhlcValues.some((value) => value > 1),
      JSON.stringify({ waxcashChartCloses, waxcashChartOhlcValues, normalization: waxcashAnalytics.chart?.candle_normalization }));
    const waxcashChartFeed = await __waxonedgeTestHooks.buildWaxcashUdfChartFeed(waxcashAnalyticsDb, { resolution: '1D' });
    ok('WAXCASH analytics exposes a UDF-shaped history feed backed by normalized Alcor #8388 candles',
      waxcashAnalytics.sections?.chart?.feed_url === '/api/waxonedge/waxcash-analytics/chart-feed?resolution=1D' &&
      waxcashAnalytics.sections?.chart?.feed_format === 'tradingview_udf_history' &&
      waxcashChartFeed.feed_format === 'tradingview_udf_history' &&
      waxcashChartFeed.s === 'ok' &&
      waxcashChartFeed.source === 'swap.alcor' &&
      waxcashChartFeed.pair_id === '8388' &&
      waxcashChartFeed.symbol === 'WAXCASH/WAX' &&
      waxcashChartFeed.ticker === 'WAXCASH/WAX' &&
      waxcashChartFeed.pair_label === 'WAXCASH/WAX' &&
      waxcashChartFeed.price_unit === 'WAX_per_WAXCASH' &&
      waxcashChartFeed.affects_waxonedge_metrics === false &&
      waxcashChartFeed.selected_price_policy_unchanged === true &&
      waxcashChartFeed.t.length === 2 &&
      waxcashChartFeed.o.concat(waxcashChartFeed.h, waxcashChartFeed.l, waxcashChartFeed.c).every((value) => value > 0.02 && value < 0.04) &&
      !waxcashChartFeed.o.concat(waxcashChartFeed.h, waxcashChartFeed.l, waxcashChartFeed.c).some((value) => value > 1),
      JSON.stringify(waxcashChartFeed));
    const onRequestChartRows = [];
    const onRequestTradeRows = [
      { source: 'swap.alcor', trade_id: '8388-a', pair_id: '8388', price: '0.028', volume: '10', traded_at: '2026-06-14T01:00:00.000Z', raw_json: '{}' },
      { source: 'swap.alcor', trade_id: '8388-b', pair_id: '8388', price: '0.032', volume: '12', traded_at: '2026-06-14T05:00:00.000Z', raw_json: '{}' },
      { source: 'swap.alcor', trade_id: '8388-c', pair_id: '8388', price: '0.03', volume: '11', traded_at: '2026-06-15T02:00:00.000Z', raw_json: '{}' },
    ];
    const onRequestChartDb = {
      prepare(sql) {
        if (sql.includes('INSERT INTO waxonedge_chart_candles')) {
          return {
            bind(...params) {
              return { insert_chart_params: params };
            },
          };
        }
        if (sql.includes('FROM waxonedge_chart_candles')) {
          return {
            bind(...params) {
              return {
                async all() {
                  return {
                    results: onRequestChartRows
                      .filter((row) => row.source === params[0] && row.pair_id === params[1] && row.interval === params[2])
                      .sort((a, b) => String(b.bucket_time).localeCompare(String(a.bucket_time))),
                  };
                },
                async first() {
                  return null;
                },
              };
            },
          };
        }
        if (sql.includes('FROM waxonedge_trades')) {
          return {
            bind(...params) {
              return {
                async all() {
                  if (String(params[0]) === '8388') return { results: onRequestTradeRows };
                  return { results: [] };
                },
                async first() {
                  return onRequestTradeRows[0] || null;
                },
              };
            },
          };
        }
        return waxcashAnalyticsDb.prepare(sql);
      },
      async batch(statements) {
        for (const statement of statements || []) {
          const params = statement.insert_chart_params || [];
          onRequestChartRows.push({
            source: params[0],
            pair_id: params[1],
            interval: params[2],
            bucket_time: params[3],
            open: params[4],
            high: params[5],
            low: params[6],
            close: params[7],
            volume: params[8],
            updated_at: params[9],
          });
        }
        return statements || [];
      },
    };
    const onRequestChartAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(onRequestChartDb);
    ok('WAXCASH analytics builds source-backed Alcor #8388 candles from indexed trade rows when stored candles are missing',
      onRequestChartAnalytics.chart?.chart_source?.source === 'swap.alcor' &&
      onRequestChartAnalytics.chart?.chart_source?.pair_id === '8388' &&
      onRequestChartAnalytics.chart?.candles?.length === 2 &&
      onRequestChartAnalytics.chart?.unavailable === null &&
      onRequestChartAnalytics.chart?.build_from_indexed_trades?.reason === 'candles_built_from_trade_rows' &&
      onRequestChartAnalytics.sections?.chart?.build_from_indexed_trades?.candles_written === 2 &&
      Number(onRequestChartAnalytics.stats.selected_price_wax) === 0.03 &&
      onRequestChartAnalytics.stats.selected_pair_id === 'WAXCASHWAXLEGACY',
      JSON.stringify({
        chart: onRequestChartAnalytics.chart,
        selected_pair_id: onRequestChartAnalytics.stats.selected_pair_id,
      }));
    const noChartFallbackDb = {
      prepare(sql) {
        const base = waxcashAnalyticsDb.prepare(sql);
        return {
          bind(...params) {
            const bound = base.bind(...params);
            return {
              async all() {
                const value = await bound.all();
                if (sql.includes('FROM waxonedge_pairs')) {
                  return { results: (value.results || []).filter((pair) => pair.pair_id !== '8388') };
                }
                return value;
              },
              async first() {
                const value = await this.all();
                return value.results?.[0] || null;
              },
              async run() {
                return bound.run ? bound.run() : { success: true };
              },
            };
          },
        };
      },
    };
    const noChartFallbackAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(noChartFallbackDb);
    ok('WAXCASH chart feed does not fallback to selected proof pool when Alcor #8388 is absent',
      noChartFallbackAnalytics.stats.selected_pair_id === 'WAXCASHWAXLEGACY' &&
      noChartFallbackAnalytics.chart?.chart_source === null &&
      noChartFallbackAnalytics.sections?.chart?.source === null &&
      noChartFallbackAnalytics.sections?.chart?.pair_id === null &&
      noChartFallbackAnalytics.chart?.unavailable === 'waxcash_chart_feed_pair_unavailable',
      JSON.stringify({
        selected_pair_id: noChartFallbackAnalytics.stats.selected_pair_id,
        chart: noChartFallbackAnalytics.sections?.chart,
      }));
    const noSelectedHistoryDb = {
      prepare(sql) {
        const base = waxcashAnalyticsDb.prepare(sql);
        return {
          bind(...params) {
            const bound = base.bind(...params);
            return {
              async all() {
                if (sql.includes('FROM waxonedge_chart_candles') && params[0] === 'swap.nefty' && params[1] === 'WAXCASHWAXLEGACY') {
                  return { results: [] };
                }
                return bound.all();
              },
              async first() {
                const value = await this.all();
                return value.results?.[0] || null;
              },
              async run() {
                return bound.run ? bound.run() : { success: true };
              },
            };
          },
        };
      },
    };
    const noSelectedHistoryAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(noSelectedHistoryDb);
    ok('WAXCASH 24h change stays unavailable when selected proof history is missing even if #8388 chart candles exist',
      noSelectedHistoryAnalytics.sections?.chart?.pair_id === '8388' &&
      noSelectedHistoryAnalytics.stats.selected_pair_id === 'WAXCASHWAXLEGACY' &&
      noSelectedHistoryAnalytics.stats.change_24h === null &&
      noSelectedHistoryAnalytics.stats.metric_status.change_24h.live === false,
      JSON.stringify({
        change_24h: noSelectedHistoryAnalytics.stats.change_24h,
        change_status: noSelectedHistoryAnalytics.stats.metric_status.change_24h,
        chart: noSelectedHistoryAnalytics.sections?.chart,
      }));
    ok('/waxcash-analytics returns display-ready backend sections',
      waxcashAnalytics.sections?.token_stats?.rows?.length >= 12 &&
      waxcashAnalytics.sections?.supply_proof &&
      waxcashAnalytics.sections?.price_proof &&
      waxcashAnalytics.sections?.pair_table?.rows?.length === waxcashAnalytics.pairs.length &&
      waxcashAnalytics.sections?.chart?.price_unit === 'WAX_per_WAXCASH' &&
      !waxcashAnalytics.sections?.chart_external,
      JSON.stringify(waxcashAnalytics.sections));
    const waxcashTokenStatLabels = (waxcashAnalytics.sections?.token_stats?.rows || []).map((row) => row.label);
    ok('WAXCASH token stats section keeps OG WaxOnEdge row names and omits selected-direct proof liquidity',
      JSON.stringify(waxcashTokenStatLabels.slice(0, 14)) === JSON.stringify([
        'Token',
        'Holder count',
        'Decimals',
        'TVL',
        'Cumulated Pair Liquidity',
        'Price',
        '24h price change',
        '24h volume',
        '7d volume',
        '30d volume',
        'Circulating supply',
        'Market cap',
        'Total supply',
        'Fully diluted valuation',
      ]) &&
      !waxcashTokenStatLabels.includes('Selected Direct WAX Pair Liquidity') &&
      !(waxcashAnalytics.sections?.token_stats?.by_key || {}).selected_direct_wax_pair_liquidity,
      JSON.stringify(waxcashTokenStatLabels));
    ok('WAXCASH TradingView chart stays outside backend proof metrics',
      waxcashAnalytics.headline_price?.headline_price_source_policy === 'og_woe_deepest_usable_direct_wax_pool' &&
      Number(waxcashAnalytics.stats.selected_price_wax) === 0.03 &&
      waxcashAnalytics.stats.fdv_wax === null &&
      Number(waxcashAnalytics.stats.market_cap_wax) === 15000 &&
      waxcashAnalytics.stats.market_cap_basis === 'circulating_supply_x_selected_price' &&
      !waxcashAnalytics.sections?.chart_external &&
      waxcashAnalytics.sections?.price_proof?.basis === 'og_woe_deepest_usable_direct_wax_pool',
      JSON.stringify({
        stats: waxcashAnalytics.stats,
        price_proof: waxcashAnalytics.sections?.price_proof,
      }));
    ok('WAXCASH analytics pair table orders selected WAXCASH/WAX proof pair first',
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.is_selected_price_pair === true &&
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.pair_id === 'WAXCASHWAXLEGACY');
    ok('WAXCASH analytics pair table preserves legitimate 0-bps fees',
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.pair_id === 'WAXCASHWAXLEGACY' &&
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.fee_bps !== null &&
      Number(waxcashAnalytics.sections?.pair_table?.rows?.[0]?.fee_bps) === 0,
      JSON.stringify(waxcashAnalytics.sections?.pair_table?.rows?.[0]));
    ok('WAXCASH analytics pair table exposes real token icons and proven USD price subvalues when indexed proofs exist',
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.token_a_icon === '/img/tokens/waxcash.png' &&
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.token_b_icon === '/img/tokens/wax.png' &&
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.token_a_logo === '/img/tokens/waxcash.png' &&
      waxcashAnalytics.sections?.pair_table?.rows?.[0]?.token_b_logo === '/img/tokens/wax.png' &&
      Math.abs(Number(waxcashAnalytics.sections?.pair_table?.rows?.[0]?.price_usd) - 0.00018) < 0.000000000001,
      JSON.stringify(waxcashAnalytics.sections?.pair_table?.rows?.[0]));
    ok('WAXCASH analytics pair table exposes OG row fields and keeps status/reserves out of main rows',
      waxcashAnalytics.sections?.pair_table?.rows?.some((row) =>
        row.reason &&
        row.proof_label &&
        row.no_fake_value === true &&
        row.volume_7d_wax == null &&
        row.volume_7d_usd == null &&
        row.volume_30d_wax == null &&
        row.volume_30d_usd == null) &&
      waxcashAnalytics.sections?.pair_table?.rows?.every((row) =>
        Object.prototype.hasOwnProperty.call(row, 'source_label') &&
        Object.prototype.hasOwnProperty.call(row, 'source_logo_key') &&
        Object.prototype.hasOwnProperty.call(row, 'price') &&
        Object.prototype.hasOwnProperty.call(row, 'price_usd') &&
        Object.prototype.hasOwnProperty.call(row, 'token_a_icon') &&
        Object.prototype.hasOwnProperty.call(row, 'token_b_icon') &&
        Object.prototype.hasOwnProperty.call(row, 'change_24h') &&
        Object.prototype.hasOwnProperty.call(row, 'volume_24h_wax') &&
        Object.prototype.hasOwnProperty.call(row, 'volume_7d_wax') &&
        Object.prototype.hasOwnProperty.call(row, 'volume_30d_wax') &&
        !Object.prototype.hasOwnProperty.call(row, 'status') &&
        !Object.prototype.hasOwnProperty.call(row, 'status_label') &&
        !Object.prototype.hasOwnProperty.call(row, 'reserves_label')),
      JSON.stringify(waxcashAnalytics.sections?.pair_table?.rows));
    {
      const nonWaxPair = {
        ...graphPairs.find((pair) => pair.pair_id === 'WAXCASHAIGOD'),
        pair_label: 'WAXCASH/AIGOD',
        paired_token: { contract: 'aigodtokenwx', symbol: 'AIGOD' },
        selected_waxcash_price_wax: null,
        paired_token_og_wax_price: null,
        reason_codes: [],
      };
      const lastVolumes = {
        '24h': { pools: { neftyblocks: { WAXCASHAIGOD: { volumeA: '10', volumeB: '20' } } } },
        '7d': { pools: { neftyblocks: { WAXCASHAIGOD: { volumeA: '70', volumeB: '140' } } } },
        '30d': { pools: { neftyblocks: { WAXCASHAIGOD: { volumeA: '300', volumeB: '600' } } } },
      };
      const [nativeOnlyPair] = __waxonedgeTestHooks.applyOgLastStatsToWaxcashPairs([nonWaxPair], { lastVolumes }, 0.006);
      const nativeOnlyRow = __waxonedgeTestHooks.waxcashPairTableRow(nativeOnlyPair, null);
      ok('WAXCASH pair table preserves OG native LastStats volumes for non-WAX pairs without faking WAX volume',
        nativeOnlyPair.volume_24h_wax == null &&
        Number(nativeOnlyPair.volume_24h_a_native) === 10 &&
        Number(nativeOnlyPair.volume_24h_b_native) === 20 &&
        Number(nativeOnlyPair.volume_7d_a_native) === 70 &&
        Number(nativeOnlyPair.volume_30d_b_native) === 600 &&
        nativeOnlyPair.metric_sources?.volume_24h_native?.source === 'og_waxonedge_lastVolumes_native_pair_volume' &&
        nativeOnlyRow.volume_24h_wax == null &&
        Number(nativeOnlyRow.volume_24h_a_native) === 10 &&
        Number(nativeOnlyRow.volume_24h_b_native) === 20 &&
        nativeOnlyRow.volume_native_source === 'og_waxonedge_lastVolumes_native_pair_volume',
        JSON.stringify({ nativeOnlyPair, nativeOnlyRow }));
      const [convertedPair] = __waxonedgeTestHooks.applyOgLastStatsToWaxcashPairs([{
        ...nonWaxPair,
        selected_waxcash_price_wax: '0.03',
        paired_token_og_wax_price: '100',
      }], { lastVolumes }, 0.006);
      ok('WAXCASH pair table exposes one-side route-converted WAX LastStats volume without double-counting native sides',
        almostEqual(convertedPair.volume_24h_wax, 0.3) &&
        almostEqual(convertedPair.volume_24h_usd, 0.0018) &&
        convertedPair.metric_sources?.volume_24h_wax?.source === 'og_waxonedge_lastVolumes_route_converted_wax' &&
        convertedPair.metric_sources?.volume_24h_native?.source === 'og_waxonedge_lastVolumes_native_pair_volume' &&
        Number(convertedPair.volume_24h_a_native) === 10 &&
        Number(convertedPair.volume_24h_b_native) === 20,
        JSON.stringify(convertedPair));
      const [normalizedKeyPair] = __waxonedgeTestHooks.applyOgLastStatsToWaxcashPairs([nonWaxPair], {
        lastVolumes: {
          '24h': { pools: { neftyblocks: { 'waxcash/aigod': { volumeA: '11', volumeB: '22' } } } },
          '7d': { pools: { neftyblocks: [{ pair_id: 'WAXCASH-AIGOD', volumeA: '77', volumeB: '154' }] } },
          '30d': { pools: { neftyblocks: [{ pairid: 'WAXCASH.AIGOD', volumeA: '330', volumeB: '660' }] } },
        },
      }, 0.006);
      ok('WAXCASH OG LastStats volume lookup accepts normalized OG pair-id keys and row-shaped buckets',
        Number(normalizedKeyPair.volume_24h_a_native) === 11 &&
        Number(normalizedKeyPair.volume_24h_b_native) === 22 &&
        Number(normalizedKeyPair.volume_7d_a_native) === 77 &&
        Number(normalizedKeyPair.volume_7d_b_native) === 154 &&
        Number(normalizedKeyPair.volume_30d_a_native) === 330 &&
        Number(normalizedKeyPair.volume_30d_b_native) === 660 &&
        normalizedKeyPair.volume_native_source === 'og_waxonedge_lastVolumes_native_pair_volume',
        JSON.stringify(normalizedKeyPair));
      const [exactOgPair] = __waxonedgeTestHooks.applyOgLastStatsToWaxcashPairs([{
        ...nonWaxPair,
        pair_id: 'WAXAIG',
        og_laststats_pair_id: '144117',
      }], {
        lastVolumes: {
          '24h': { pools: { neftyblocks: { WAXAIG: { volumeA: '1', volumeB: '2' }, '144117': { volumeA: '44', volumeB: '88' } } } },
          '7d': { pools: { neftyblocks: { '144117': { volumeA: '144', volumeB: '288' } } } },
          '30d': { pools: { neftyblocks: { '144117': { volumeA: '440', volumeB: '880' } } } },
        },
      }, 0.006);
      const exactDebugSection = __waxonedgeTestHooks.waxcashBuildPairTableSection([exactOgPair], null);
      const exactDebug = exactDebugSection.metric_debug.rows[0].og_laststats_volume_24h;
      ok('WAXCASH OG LastStats volume lookup prefers exact stored og_laststats_pair_id and exposes non-visible debug',
        Number(exactOgPair.volume_24h_a_native) === 44 &&
        Number(exactOgPair.volume_24h_b_native) === 88 &&
        exactDebug.displayed_pair_id === 'WAXAIG' &&
        exactDebug.mapped_og_srcType === 'pools' &&
        exactDebug.mapped_og_src === 'neftyblocks' &&
        exactDebug.exact_og_bucket_path_checked === 'lastVolumes[24h][pools][neftyblocks]' &&
        exactDebug.og_bucket_exists === true &&
        Array.isArray(exactDebug.first_20_og_bucket_keys) &&
        exactDebug.first_20_og_bucket_keys.includes('144117') &&
        Array.isArray(exactDebug.lookup_keys_attempted?.priority_1_exact_og) &&
        exactDebug.lookup_keys_attempted.priority_1_exact_og.includes('144117') &&
        exactDebug.matched_key === '144117' &&
        Number(exactDebug.volumeA) === 44 &&
        Number(exactDebug.volumeB) === 88 &&
        exactDebug.reason == null,
        JSON.stringify({ exactOgPair, exactDebug }));
      const [normalizedOgPriorityPair] = __waxonedgeTestHooks.applyOgLastStatsToWaxcashPairs([{
        ...nonWaxPair,
        pair_id: 'WAXAIG',
        og_laststats_pair_id: '144117',
      }], {
        lastVolumes: {
          '24h': { pools: { neftyblocks: { WAXAIG: { volumeA: '1', volumeB: '2' }, '144-117': { volumeA: '55', volumeB: '110' } } } },
        },
      }, 0.006);
      const normalizedOgPriorityDebug = __waxonedgeTestHooks.waxcashBuildPairTableSection([normalizedOgPriorityPair], null)
        .metric_debug.rows[0].og_laststats_volume_24h;
      ok('WAXCASH OG LastStats normalized OG key wins over earlier displayed pair id bucket key',
        Number(normalizedOgPriorityPair.volume_24h_a_native) === 55 &&
        Number(normalizedOgPriorityPair.volume_24h_b_native) === 110 &&
        normalizedOgPriorityDebug.matched_key === '144-117' &&
        normalizedOgPriorityDebug.match_priority === 'normalized_og_key',
        JSON.stringify({ normalizedOgPriorityPair, normalizedOgPriorityDebug }));
      const [tokenOnlyPair] = __waxonedgeTestHooks.applyOgLastStatsToWaxcashPairs([{
        ...nonWaxPair,
        pair_id: '144117',
      }], {
        lastVolumes: {
          '24h': { pools: { neftyblocks: [{ tokenA: 'AIGOD', tokenB: 'WAXCASH', volumeA: '999', volumeB: '1998' }] } },
        },
      }, 0.006);
      ok('WAXCASH OG LastStats volume lookup does not guess pair volume from token symbols alone',
        tokenOnlyPair.volume_24h_a_native == null &&
        (tokenOnlyPair.og_laststats_debug?.volume_24h?.reason === 'no_matching_pair_id' ||
          tokenOnlyPair.og_laststats_debug?.volume_24h?.reason === 'og_laststats_pair_id_missing'),
        JSON.stringify(tokenOnlyPair));
      const internalPairs = [
        {
          ...nonWaxPair,
          pair_id: 'DISPLAY-WAXCASHAIGOD',
          og_laststats_pair_id: 'WAXCASHAIGOD',
        },
        {
          ...graphPairs.find((pair) => pair.pair_id === 'WAXCASHWAXLEGACY'),
          og_laststats_pair_id: 'WAXCASHWAXLEGACY',
        },
      ];
      const internalTrades = [
        {
          source: 'swap.nefty',
          trade_id: 'recent-native',
          pair_id: 'WAXCASHAIGOD',
          contract: null,
          symbol: 'WAXCASH',
          amount: '10',
          volume: '10',
          traded_at: '2026-06-20T04:00:00.000Z',
          raw_json: JSON.stringify({ amount_in: '10', code_in: 'WAXCASH', amount_out: '20', code_out: 'AIGOD' }),
        },
        {
          source: 'swap.nefty',
          trade_id: 'ten-day-native',
          pair_id: 'WAXCASHAIGOD',
          contract: null,
          symbol: 'WAXCASH',
          amount: '70',
          volume: '70',
          traded_at: '2026-06-10T04:00:00.000Z',
          raw_json: JSON.stringify({ amount_in: '70', code_in: 'WAXCASH', amount_out: '140', code_out: 'AIGOD' }),
        },
        {
          source: 'swap.nefty',
          trade_id: 'old-native',
          pair_id: 'WAXCASHAIGOD',
          contract: null,
          symbol: 'WAXCASH',
          amount: '1000',
          volume: '1000',
          traded_at: '2026-05-01T04:00:00.000Z',
          raw_json: JSON.stringify({ amount_in: '1000', code_in: 'WAXCASH', amount_out: '2000', code_out: 'AIGOD' }),
        },
        {
          source: 'swap.nefty',
          trade_id: 'recent-wax',
          pair_id: 'WAXCASHWAXLEGACY',
          contract: null,
          symbol: 'WAXCASH',
          amount: '5',
          volume: '5',
          traded_at: '2026-06-20T03:30:00.000Z',
          raw_json: JSON.stringify({ amount_in: '5', code_in: 'WAXCASH', amount_out: '2', code_out: 'WAX' }),
        },
      ];
      const internalDb = {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                async all() {
                  if (sql.includes('FROM waxonedge_pairs')) return { results: internalPairs };
                  if (sql.includes('FROM waxonedge_trades')) {
                    const since = params[params.length - 1];
                    return {
                      results: internalTrades.filter((row) => !since || !/^\d{4}-/.test(String(since)) || Date.parse(row.traded_at) >= Date.parse(since)),
                    };
                  }
                  return { results: [] };
                },
                async first() {
                  if (sql.includes('MAX(traded_at)')) return { latest_trade_at: '2026-06-20T04:00:00.000Z' };
                  return null;
                },
              };
            },
          };
        },
      };
      const internalLastStats = await __waxonedgeTestHooks.buildInternalD1WaxcashLastStats(internalDb);
      const internalNativeRow = internalLastStats.lastVolumes?.['30d']?.pools?.neftyblocks?.WAXCASHAIGOD;
      const internalWaxRow = internalLastStats.lastVolumes?.['24h']?.pools?.neftyblocks?.WAXCASHWAXLEGACY;
      ok('WAXCASH internal D1 LastStats builder creates OG-shaped native volume buckets from indexed trade rows',
        internalLastStats.ok === true &&
        internalLastStats.rows_scanned === 3 &&
        internalLastStats.rows_used === 3 &&
        Number(internalLastStats.lastVolumes['24h'].pools.neftyblocks.WAXCASHAIGOD.volumeA) === 10 &&
        Number(internalLastStats.lastVolumes['24h'].pools.neftyblocks.WAXCASHAIGOD.volumeB) === 20 &&
        Number(internalNativeRow.volumeA) === 80 &&
        Number(internalNativeRow.volumeB) === 160 &&
        Number(internalNativeRow.row_count) === 2 &&
        Number(internalWaxRow.volumeB) === 2,
        JSON.stringify(internalLastStats));
      const [internalAppliedNonWax, internalAppliedWax] = __waxonedgeTestHooks.applyOgLastStatsToWaxcashPairs(internalPairs, {
        lastVolumes: internalLastStats.lastVolumes,
      }, 0.006);
      const internalSection = __waxonedgeTestHooks.waxcashBuildPairTableSection([internalAppliedNonWax, internalAppliedWax], null);
      const internalDebug = internalSection.metric_debug.rows.find((row) => row.pair_id === 'DISPLAY-WAXCASHAIGOD');
      ok('WAXCASH pair table consumes internal D1 LastStats before any dead OG API dependency',
        internalAppliedNonWax.volume_24h_wax == null &&
        Number(internalAppliedNonWax.volume_24h_a_native) === 10 &&
        Number(internalAppliedNonWax.volume_30d_b_native) === 160 &&
        internalAppliedNonWax.metric_sources?.volume_24h_native?.source === 'internal_d1_laststats_native_pair_volume' &&
        Number(internalAppliedWax.volume_24h_wax) === 75 &&
        Number(internalAppliedWax.volume_7d_wax) === 2 &&
        internalAppliedWax.metric_sources?.volume_7d_wax?.source === 'internal_d1_laststats' &&
        internalDebug.internal_laststats_bucket_exists === true &&
        internalDebug.internal_laststats_matched_key === 'WAXCASHAIGOD' &&
        Number(internalDebug.internal_volumeA) === 10 &&
        Number(internalDebug.trade_row_count_30d) === 2 &&
        internalDebug.reason === 'internal_laststats_available',
        JSON.stringify({ internalAppliedNonWax, internalAppliedWax, internalDebug }));
      const internalFetched = await __waxonedgeTestHooks.fetchWaxcashOgLastStats({ DB: internalDb });
      ok('WAXCASH LastStats fetch path uses internal D1 LastStats when OG API base is missing',
        internalFetched.laststats_source === 'internal_d1_laststats' &&
        internalFetched.sources?.lastVolumes === 'internal_d1_laststats' &&
        internalFetched.internal_laststats?.ok === true &&
        internalFetched.external_laststats?.ok === false &&
        Number(internalFetched.lastVolumes['24h'].pools.neftyblocks.WAXCASHAIGOD.volumeA) === 10,
        JSON.stringify(internalFetched));
      const nativePriceTrades = [
        {
          source: 'swap.nefty',
          trade_id: 'fresh-native-price',
          pair_id: 'WAXCASHAIGOD',
          contract: 'aigodtokenwx',
          symbol: 'AIGOD',
          amount: '20',
          volume: '20',
          price: '0.50',
          traded_at: '2026-06-20T04:00:00.000Z',
          raw_json: JSON.stringify({ amount_in: '10', code_in: 'WAXCASH', amount_out: '20', code_out: 'AIGOD' }),
        },
        {
          source: 'swap.nefty',
          trade_id: 'prior-native-price',
          pair_id: 'WAXCASHAIGOD',
          contract: 'aigodtokenwx',
          symbol: 'AIGOD',
          amount: '40',
          volume: '40',
          price: '0.25',
          traded_at: '2026-06-18T04:00:00.000Z',
          raw_json: JSON.stringify({ amount_in: '20', code_in: 'WAXCASH', amount_out: '40', code_out: 'AIGOD' }),
        },
      ];
      const nativePriceDb = {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                async all() {
                  if (sql.includes('FROM waxonedge_trades')) {
                    const since = params[params.length - 1];
                    return {
                      results: nativePriceTrades.filter((row) => !since || !/^\d{4}-/.test(String(since)) || Date.parse(row.traded_at) >= Date.parse(since)),
                    };
                  }
                  return { results: [] };
                },
                async first() {
                  if (sql.includes('MAX(traded_at)')) return { latest_trade_at: '2026-06-20T04:00:00.000Z' };
                  return null;
                },
              };
            },
          };
        },
      };
      const nativeWindowMap = await __waxonedgeTestHooks.indexedTradeWindowVolumesByPair(nativePriceDb, [nonWaxPair], {});
      const nativeWindow = nativeWindowMap.get('swap.nefty::WAXCASHAIGOD');
      const [nativeWindowPair] = __waxonedgeTestHooks.applyIndexedPairWindowVolumes([nonWaxPair], nativeWindowMap, 0.006);
      const nativeWindowDebug = __waxonedgeTestHooks.waxcashBuildPairTableSection([nativeWindowPair], null).metric_debug.rows[0];
      ok('WAXCASH pair table 24h debug distinguishes fresh native rows from missing WAX volume proof',
        nativeWindow?.row_count_24h === 1 &&
        nativeWindow?.volume_24h_wax == null &&
        nativeWindow?.volume_24h_reason === '24h_trade_rows_lack_wax_volume_proof' &&
        Number(nativeWindow?.change_24h) === 100 &&
        nativeWindowPair.metric_sources?.volume_24h_wax?.reason === '24h_trade_rows_lack_wax_volume_proof' &&
        nativeWindowPair.metric_sources?.change_24h?.source === 'indexed_trade_price_window' &&
        Number(nativeWindowPair.change_24h) === 100 &&
        nativeWindowDebug.row_count_24h === 1 &&
        nativeWindowDebug.volume_24h_wax_reason === '24h_trade_rows_lack_wax_volume_proof' &&
        nativeWindowDebug.volume_24h_unavailable_reason === '24h_trade_rows_lack_wax_volume_proof' &&
        nativeWindowDebug.latest_price_sample?.traded_at === '2026-06-20T04:00:00.000Z' &&
        nativeWindowDebug.prior_24h_price_sample?.traded_at === '2026-06-18T04:00:00.000Z',
        JSON.stringify({ nativeWindow, nativeWindowPair, nativeWindowDebug }));
      const stalePriceTrades = [
        {
          source: 'swap.nefty',
          trade_id: 'stale-latest-price',
          pair_id: 'WAXCASHAIGOD',
          contract: 'aigodtokenwx',
          symbol: 'AIGOD',
          amount: '20',
          volume: '20',
          price: '0.50',
          traded_at: '2026-06-14T06:16:34.000Z',
          raw_json: JSON.stringify({ amount_in: '10', code_in: 'WAXCASH', amount_out: '20', code_out: 'AIGOD' }),
        },
        {
          source: 'swap.nefty',
          trade_id: 'stale-prior-price',
          pair_id: 'WAXCASHAIGOD',
          contract: 'aigodtokenwx',
          symbol: 'AIGOD',
          amount: '40',
          volume: '40',
          price: '0.25',
          traded_at: '2026-06-12T06:16:34.000Z',
          raw_json: JSON.stringify({ amount_in: '20', code_in: 'WAXCASH', amount_out: '40', code_out: 'AIGOD' }),
        },
      ];
      const stalePriceDb = {
        prepare(sql) {
          return {
            bind(...params) {
              return {
                async all() {
                  if (sql.includes('FROM waxonedge_trades')) {
                    const since = params[params.length - 1];
                    return {
                      results: stalePriceTrades.filter((row) => !since || !/^\d{4}-/.test(String(since)) || Date.parse(row.traded_at) >= Date.parse(since)),
                    };
                  }
                  return { results: [] };
                },
                async first() {
                  if (sql.includes('MAX(traded_at)')) return { latest_trade_at: '2026-06-20T04:00:00.000Z' };
                  return null;
                },
              };
            },
          };
        },
      };
      const staleWindowMap = await __waxonedgeTestHooks.indexedTradeWindowVolumesByPair(stalePriceDb, [nonWaxPair], {});
      const staleWindow = staleWindowMap.get('swap.nefty::WAXCASHAIGOD');
      const [staleWindowPair] = __waxonedgeTestHooks.applyIndexedPairWindowVolumes([nonWaxPair], staleWindowMap, 0.006);
      const staleWindowDebug = __waxonedgeTestHooks.waxcashBuildPairTableSection([staleWindowPair], null).metric_debug.rows[0];
      ok('WAXCASH pair table does not expose stale indexed price-window change as current 24h change',
        staleWindow?.row_count_24h === 0 &&
        staleWindow?.row_count_7d === 1 &&
        staleWindow?.row_count_30d === 2 &&
        staleWindow?.change_24h == null &&
        staleWindow?.change_source == null &&
        staleWindow?.change_reason === 'stale_price_window' &&
        staleWindowPair.change_24h == null &&
        staleWindowPair.metric_sources?.change_24h?.source == null &&
        staleWindowPair.metric_sources?.change_24h?.reason === 'stale_price_window' &&
        staleWindowDebug.change_24h_source == null &&
        staleWindowDebug.change_24h_reason === 'stale_price_window' &&
        staleWindowDebug.latest_price_sample?.traded_at === '2026-06-14T06:16:34.000Z' &&
        staleWindowDebug.prior_24h_price_sample?.traded_at === '2026-06-12T06:16:34.000Z',
        JSON.stringify({ staleWindow, staleWindowPair, staleWindowDebug }));
    }
    const liveSupplyWrites = [];
    const liveSupplyDb = {
      prepare(sql) {
        const base = waxcashAnalyticsDb.prepare(sql);
        return {
          bind(...params) {
            const bound = base.bind(...params);
            return {
              async all() {
                return bound.all();
              },
              async first() {
                return bound.first();
              },
              async run() {
                liveSupplyWrites.push({ sql, params });
                return { success: true };
              },
            };
          },
        };
      },
    };
    const liveSupplyOriginalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init?.body || '{}');
      if (body.code === 'graffitiking' && body.symbol === 'WAXCASH') {
        return new Response(JSON.stringify({
          WAXCASH: {
            supply: '2000000.12345678 WAXCASH',
            max_supply: '2000000.12345678 WAXCASH',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    let liveSupplyAnalytics = null;
    try {
      liveSupplyAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(liveSupplyDb);
    } finally {
      globalThis.fetch = liveSupplyOriginalFetch;
    }
    ok('WAXCASH analytics performs live get_currency_stats supply proof and calculates FDV immediately',
      liveSupplyAnalytics.sections?.supply_proof?.source === 'wax_rpc_get_currency_stats' &&
      liveSupplyAnalytics.sections?.supply_proof?.total_supply === '2000000.12345678' &&
      Number(liveSupplyAnalytics.stats.total_supply) === 2000000.12345678 &&
      almostEqual(liveSupplyAnalytics.stats.fdv_wax, 60000.0037037034, 1e-7) &&
      !liveSupplyAnalytics.sections?.chart_external &&
      liveSupplyWrites.some((write) => write.sql.includes('INSERT INTO waxonedge_tokens') && write.params[0] === 'graffitiking' && write.params[1] === 'WAXCASH'),
      JSON.stringify({ supply_proof: liveSupplyAnalytics.sections?.supply_proof, stats: liveSupplyAnalytics.stats, liveSupplyWrites }));
    ok('WAXCASH analytics stats reuse indexed detail volume fields but not cached total supply',
      Number(waxcashAnalytics.stats.holder_count) === 42 &&
      Number(waxcashAnalytics.stats.circulating_supply) === 500000 &&
      waxcashAnalytics.stats.total_supply === null &&
      Number(waxcashAnalytics.stats.volume_24h_wax) === 175 &&
      Number(waxcashAnalytics.stats.volume_7d) === 700 &&
      Number(waxcashAnalytics.stats.volume_30d) === 3000,
      JSON.stringify({
        holder_count: waxcashAnalytics.stats.holder_count,
        circulating_supply: waxcashAnalytics.stats.circulating_supply,
        total_supply: waxcashAnalytics.stats.total_supply,
        volume_24h_wax: waxcashAnalytics.stats.volume_24h_wax,
        volume_7d: waxcashAnalytics.stats.volume_7d,
        volume_30d: waxcashAnalytics.stats.volume_30d,
      }));
    ok('WAXCASH analytics separates market cap, selected-pair liquidity, cumulated liquidity, and TVL',
      Number(waxcashAnalytics.stats.market_cap_wax) === 15000 &&
      almostEqual(waxcashAnalytics.stats.market_cap_usd, 90) &&
      waxcashAnalytics.stats.market_cap_basis === 'circulating_supply_x_selected_price' &&
      waxcashAnalytics.stats.fdv_wax === null &&
      waxcashAnalytics.stats.fdv_usd === null &&
      Number(waxcashAnalytics.stats.selected_direct_wax_pair_liquidity_wax) === 3000 &&
      Number(waxcashAnalytics.stats.cumulated_pair_liquidity_wax) > 3000 &&
      Number(waxcashAnalytics.stats.tvl_wax) === Number(waxcashAnalytics.stats.cumulated_pair_liquidity_wax) &&
      Number(waxcashAnalytics.stats.market_cap_wax) !== Number(waxcashAnalytics.stats.cumulated_pair_liquidity_wax),
      JSON.stringify({
        selected_price_wax: waxcashAnalytics.stats.selected_price_wax,
        selected_price_usd: waxcashAnalytics.stats.selected_price_usd,
        market_cap_wax: waxcashAnalytics.stats.market_cap_wax,
        market_cap_usd: waxcashAnalytics.stats.market_cap_usd,
        fdv_wax: waxcashAnalytics.stats.fdv_wax,
        fdv_usd: waxcashAnalytics.stats.fdv_usd,
        liquidity_wax: waxcashAnalytics.stats.liquidity_wax,
        cumulated_pair_liquidity_wax: waxcashAnalytics.stats.cumulated_pair_liquidity_wax,
      }));
    const supplyOnlyWaxcashAnalyticsDb = {
      prepare(sql) {
        function allResults(params) {
          if (sql.includes('FROM waxonedge_pairs')) {
            const wantsWaxcash = params.includes('graffitiking') && params.includes('WAXCASH');
            if (wantsWaxcash) {
              return { results: graphPairs.filter((pair) => pairTokenTouches(pair, 'graffitiking', 'WAXCASH')) };
            }
            return {
              results: graphPairs.filter((pair) => params.some((value, index) =>
                index % 4 === 0 &&
                ((pair.token_a_contract === value && pair.token_a_symbol === params[index + 1] && pair.token_b_contract === 'eosio.token' && pair.token_b_symbol === 'WAX') ||
                  (pair.token_b_contract === value && pair.token_b_symbol === params[index + 1] && pair.token_a_contract === 'eosio.token' && pair.token_a_symbol === 'WAX'))
              )),
            };
          }
          if (sql.includes('FROM waxonedge_chart_candles')) return { results: [] };
          if (sql.includes('FROM waxonedge_tokens')) {
            const rows = [
              {
                contract: 'eosio.token',
                symbol: 'WAX',
                decimals: '8',
                price_wax: '1',
                price_usd: '0.006',
                updated_at: '2026-06-14T11:00:00.000Z',
              },
              {
                contract: 'graffitiking',
                symbol: 'WAXCASH',
                decimals: '8',
                total_supply: '1000000',
                max_supply: '1000000',
                updated_at: '2026-06-14T11:00:00.000Z',
              },
            ];
            return {
              results: rows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])),
            };
          }
          if (sql.includes('FROM waxonedge_token_stats')) {
            return {
              results: [{
                contract: 'graffitiking',
                symbol: 'WAXCASH',
                volume_24h_wax: '100',
                updated_at: '2026-06-14T11:00:00.000Z',
              }],
            };
          }
          return { results: [] };
        }
        return {
          bind(...params) {
            return {
              async all() {
                return allResults(params);
              },
              async first() {
                return allResults(params).results[0] || null;
              },
            };
          },
        };
      },
    };
    const supplyOnlyOriginalFetch = globalThis.fetch;
    let supplyOnlyWaxcashAnalytics = null;
    try {
      globalThis.fetch = async (url, init) => {
        const href = String(url);
        if (href.includes('wax.alcor.exchange/api/v3/analytics/tokens/waxcash-graffitiking')) {
          return new Response(JSON.stringify({
            token: { holders: { count: 9320, truncated: false } },
            meta: { ts: '2026-06-20T01:53:10.445Z' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const body = JSON.parse(init?.body || '{}');
        if (body.code === 'graffitiking' && body.symbol === 'WAXCASH') {
          return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
      };
      supplyOnlyWaxcashAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(supplyOnlyWaxcashAnalyticsDb);
    } finally {
      globalThis.fetch = supplyOnlyOriginalFetch;
    }
    ok('WAXCASH analytics does not use D1 cached total supply or FDV when live RPC proof fails',
      supplyOnlyWaxcashAnalytics.stats.total_supply === null &&
      supplyOnlyWaxcashAnalytics.stats.fdv_wax === null &&
      supplyOnlyWaxcashAnalytics.stats.fdv_usd === null &&
      supplyOnlyWaxcashAnalytics.stats.circulating_supply === null &&
      supplyOnlyWaxcashAnalytics.stats.market_cap_wax === null &&
      supplyOnlyWaxcashAnalytics.stats.market_cap_usd === null &&
      Number(supplyOnlyWaxcashAnalytics.stats.selected_direct_wax_pair_liquidity_wax) === 3000 &&
      Number(supplyOnlyWaxcashAnalytics.stats.cumulated_pair_liquidity_wax) > 3000 &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.total_supply.live === false &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.total_supply.source === null &&
      supplyOnlyWaxcashAnalytics.sections?.supply_proof?.live === false &&
      supplyOnlyWaxcashAnalytics.sections?.supply_proof?.source === null &&
      supplyOnlyWaxcashAnalytics.sections?.supply_proof?.total_supply === null &&
      supplyOnlyWaxcashAnalytics.sections?.supply_proof?.cached_total_supply_diagnostic === '1000000' &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.circulating_supply.live === false &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.circulating_supply.reason.includes('WAXCASH circulating supply requires') &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.market_cap.reason.includes('Requires WAXCASH circulating supply') &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.fdv.live === false,
      JSON.stringify({
        total_supply: supplyOnlyWaxcashAnalytics.stats.total_supply,
        circulating_supply: supplyOnlyWaxcashAnalytics.stats.circulating_supply,
        fdv_wax: supplyOnlyWaxcashAnalytics.stats.fdv_wax,
        market_cap_wax: supplyOnlyWaxcashAnalytics.stats.market_cap_wax,
        liquidity_wax: supplyOnlyWaxcashAnalytics.stats.liquidity_wax,
        supply_proof: supplyOnlyWaxcashAnalytics.sections?.supply_proof,
        metric_status: supplyOnlyWaxcashAnalytics.stats.metric_status,
      }));
    ok('WAXCASH analytics restores holder count from the real Alcor token analytics source when local snapshots are missing',
      Number(supplyOnlyWaxcashAnalytics.stats.holder_count) === 9320 &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.holder_count.live === true &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.holder_count.source === 'alcor_token_analytics_holders' &&
      supplyOnlyWaxcashAnalytics.stats.metric_status.holder_count.snapshot_at === '2026-06-20T01:53:10.445Z' &&
      supplyOnlyWaxcashAnalytics.alcor_token_analytics.holder_count_live === true);
    let rollingVolumeSelectCount = 0;
    const rollingVolumeSelectSqls = [];
    const holderTradeWaxcashAnalyticsDb = {
      prepare(sql) {
        if (sql.includes('FROM waxonedge_token_stats')) {
          return {
            bind() {
              return {
                async all() {
                  return { results: [{ contract: 'graffitiking', symbol: 'WAXCASH', updated_at: '2026-06-14T11:00:00.000Z' }] };
                },
                async first() {
                  return { contract: 'graffitiking', symbol: 'WAXCASH', updated_at: '2026-06-14T11:00:00.000Z' };
                },
              };
            },
          };
        }
        if (sql.includes('FROM waxonedge_holders') && sql.includes('ORDER BY snapshot_at DESC')) {
          return {
            bind() {
              return {
                async all() { return { results: [{ snapshot_at: '2026-06-14T00:00:00.000Z' }] }; },
                async first() { return { snapshot_at: '2026-06-14T00:00:00.000Z' }; },
              };
            },
          };
        }
        if (sql.includes('FROM waxonedge_holders') && sql.includes('COUNT(DISTINCT account)')) {
          return {
            bind() {
              return {
                async all() { return { results: [{ count: 9173 }] }; },
                async first() { return { count: 9173 }; },
              };
            },
          };
        }
        if (sql.includes('FROM waxonedge_trades') && sql.includes('MAX(traded_at)')) {
          return {
            bind() {
              return {
                async all() { return { results: [{ latest_trade_at: '2026-06-15T00:00:00.000Z' }] }; },
                async first() { return { latest_trade_at: '2026-06-15T00:00:00.000Z' }; },
              };
            },
          };
        }
        if (sql.includes('FROM waxonedge_trades') && sql.includes('SELECT source, trade_id')) {
          rollingVolumeSelectCount += 1;
          rollingVolumeSelectSqls.push(sql);
          return {
            bind(...params) {
              return {
                async all() {
                  const since = String(params[params.length - 1] || '');
                  return {
                    results: [{
                      source: 'swap.nefty',
                      trade_id: 'proof-24h',
                      pair_id: 'WAXCASHWAXLEGACY',
                      contract: 'graffitiking',
                      symbol: 'WAXCASH',
                      amount: '999999999',
                      volume: '999999999',
                      traded_at: '2026-06-15T00:00:00.000Z',
                      raw_json: JSON.stringify({ volume_wax: '136850.54368654', volume: '999999999 WAXCASH' }),
                    }, {
                      source: 'swap.nefty',
                      trade_id: 'proof-7d-only',
                      pair_id: 'WAXCASHWAXLEGACY',
                      contract: 'graffitiking',
                      symbol: 'WAXCASH',
                      amount: '999999999',
                      volume: '999999999',
                      traded_at: '2026-06-10T00:00:00.000Z',
                      raw_json: JSON.stringify({ volume_wax: '627458.02550977', volume: '999999999 WAXCASH' }),
                    }, {
                      source: 'swap.nefty',
                      trade_id: 'proof-30d-only',
                      pair_id: 'WAXCASHWAXLEGACY',
                      contract: 'graffitiking',
                      symbol: 'WAXCASH',
                      amount: '999999999',
                      volume: '999999999',
                      traded_at: '2026-05-20T00:00:00.000Z',
                      raw_json: JSON.stringify({ volume_wax: '6052438.76459322', volume: '999999999 WAXCASH' }),
                    }, {
                      source: 'swap.nefty',
                      trade_id: 'raw-unproven-all-windows',
                      tx_id: 'raw-unproven-tx',
                      pair_id: 'WAXCASHWAXLEGACY',
                      contract: null,
                      symbol: null,
                      amount: '888888888',
                      volume: '888888888',
                      traded_at: '2026-06-15T00:00:00.000Z',
                      raw_json: JSON.stringify({ volume: '888888888 UNKNOWN' }),
                    }].filter((row) => String(row.traded_at) >= since),
                  };
                },
                async first() {
                  return (await this.all()).results[0] || null;
                },
              };
            },
          };
        }
        return supplyOnlyWaxcashAnalyticsDb.prepare(sql);
      },
    };
    const holderTradeWaxcashAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(holderTradeWaxcashAnalyticsDb);
    ok('WAXCASH analytics derives holder count and rolling volumes from indexed holder/trade rows when aggregate stats are missing',
      Number(holderTradeWaxcashAnalytics.stats.holder_count) === 9173 &&
      holderTradeWaxcashAnalytics.stats.metric_status.holder_count.source === 'indexed_holder_snapshot' &&
      Number(holderTradeWaxcashAnalytics.stats.volume_24h_wax) === 175 &&
      Number(holderTradeWaxcashAnalytics.stats.volume_7d) === 764308.56919631 &&
      Number(holderTradeWaxcashAnalytics.stats.volume_30d) === 6816747.33378953 &&
      Number(holderTradeWaxcashAnalytics.stats.volume_7d) !== 999999999 &&
      holderTradeWaxcashAnalytics.stats.metric_status.volume_24h.source === 'indexed_pair_or_ticker_volume' &&
      holderTradeWaxcashAnalytics.stats.metric_status.volume_7d.source === 'indexed_trade_rows_window_wax_denominated' &&
      holderTradeWaxcashAnalytics.stats.metric_status.volume_7d.basis === 'indexed_trade_rows_window_wax_denominated' &&
      holderTradeWaxcashAnalytics.stats.metric_status.volume_30d.source === 'indexed_trade_rows_window_wax_denominated',
      JSON.stringify({
        holder_count: holderTradeWaxcashAnalytics.stats.holder_count,
        volume_24h_wax: holderTradeWaxcashAnalytics.stats.volume_24h_wax,
        volume_7d: holderTradeWaxcashAnalytics.stats.volume_7d,
        volume_30d: holderTradeWaxcashAnalytics.stats.volume_30d,
        metric_status: holderTradeWaxcashAnalytics.stats.metric_status,
      }));
    const indexedWindowPairRow = holderTradeWaxcashAnalytics.sections?.pair_table?.rows?.find((row) => row.pair_id === 'WAXCASHWAXLEGACY');
    ok('WAXCASH pair table 24h/7d/30d volumes come from real indexed pair trade windows when available',
      Number(indexedWindowPairRow?.volume_24h_wax) === 136850.54368654 &&
      Number(indexedWindowPairRow?.volume_7d_wax) === 764308.56919631 &&
      Number(indexedWindowPairRow?.volume_30d_wax) === 6816747.33378953 &&
      Number(indexedWindowPairRow?.volume_7d_usd) === 4585.85141517786 &&
      Number(indexedWindowPairRow?.volume_30d_usd) === 40900.48400273718 &&
      indexedWindowPairRow?.proof_details?.status === 'selected_price_pair',
      JSON.stringify(indexedWindowPairRow));
    const indexedWindowDebugRow = holderTradeWaxcashAnalytics.sections?.pair_table?.metric_debug?.rows?.find((row) => row.pair_id === 'WAXCASHWAXLEGACY');
    ok('WAXCASH pair table exposes non-visible pair metric debug proof for indexed windows',
      holderTradeWaxcashAnalytics.sections?.pair_table?.metric_debug?.no_visible_ui === true &&
      indexedWindowDebugRow?.source === 'swap.nefty' &&
      indexedWindowDebugRow?.volume_24h_wax_source === 'indexed_trade_rows_window_wax_denominated' &&
      indexedWindowDebugRow?.volume_7d_wax_source === 'indexed_trade_rows_window_wax_denominated' &&
      indexedWindowDebugRow?.volume_30d_wax_source === 'indexed_trade_rows_window_wax_denominated' &&
      indexedWindowDebugRow?.latest_indexed_trade_time === '2026-06-15T00:00:00.000Z' &&
      indexedWindowDebugRow?.row_count_24h === 2 &&
      indexedWindowDebugRow?.row_count_7d === 3 &&
      indexedWindowDebugRow?.row_count_30d === 4 &&
      indexedWindowDebugRow?.indexed_trade_window_debug?.wax_volume_row_count_24h === 1 &&
      indexedWindowDebugRow?.indexed_trade_window_debug?.unproven_volume_row_count_24h === 1,
      JSON.stringify(holderTradeWaxcashAnalytics.sections?.pair_table?.metric_debug));
    rollingVolumeSelectCount = 0;
    rollingVolumeSelectSqls.length = 0;
    const tradeWindowVolumes = await __waxonedgeTestHooks.indexedTradeWindowVolumes(holderTradeWaxcashAnalyticsDb, [{
      source: 'swap.nefty',
      pair_id: 'WAXCASHWAXLEGACY',
      direct_wax_pair: true,
    }], { selectedPriceWax: '0.001' });
    ok('WAXCASH rolling volume scans chunked 30d rows once per safe query and counts distinct excluded trades once',
      Number(tradeWindowVolumes.volume_24h_wax) === 136850.54368654 &&
      Number(tradeWindowVolumes.volume_7d) === 764308.56919631 &&
      Number(tradeWindowVolumes.volume_30d) === 6816747.33378953 &&
      rollingVolumeSelectCount === tradeWindowVolumes.query_chunk_count &&
      rollingVolumeSelectSqls.length > 0 &&
      rollingVolumeSelectSqls.every((sql) => sql.includes('traded_at >= ?')) &&
      rollingVolumeSelectSqls.every((sql) => !sql.includes('24 * 60') && !sql.includes('7 * 24')) &&
      tradeWindowVolumes.excluded_unproven_trade_count === 1,
      JSON.stringify({ tradeWindowVolumes, rollingVolumeSelectCount, rollingVolumeSelectSqls }));
    const failedSupplyWaxcashAnalyticsDb = {
      prepare(sql) {
        function allResults(params) {
          if (sql.includes('FROM waxonedge_source_index_state')) {
            return { results: [{
              source: 'token_supply',
              status: 'failed',
              cursor: '',
              complete: 0,
              truncated: 0,
              row_count: 1,
              updated_at: '2026-06-14T12:00:00.000Z',
              error: 'graffitiking::WAXCASH supply sync failed: get_currency_stats_missing_WAXCASH',
            }] };
          }
          if (sql.includes('FROM waxonedge_sync_runs')) {
            return { results: [{
              source: 'token_supply',
              status: 'failed',
              started_at: '2026-06-14T12:00:00.000Z',
              finished_at: '2026-06-14T12:00:01.000Z',
              error: 'graffitiking::WAXCASH supply sync failed: get_currency_stats_missing_WAXCASH',
            }] };
          }
          if (sql.includes('FROM waxonedge_pairs')) {
            const wantsWaxcash = params.includes('graffitiking') && params.includes('WAXCASH');
            if (wantsWaxcash) {
              return { results: graphPairs.filter((pair) => pairTokenTouches(pair, 'graffitiking', 'WAXCASH')) };
            }
            return {
              results: graphPairs.filter((pair) => params.some((value, index) =>
                index % 4 === 0 &&
                ((pair.token_a_contract === value && pair.token_a_symbol === params[index + 1] && pair.token_b_contract === 'eosio.token' && pair.token_b_symbol === 'WAX') ||
                  (pair.token_b_contract === value && pair.token_b_symbol === params[index + 1] && pair.token_a_contract === 'eosio.token' && pair.token_a_symbol === 'WAX'))
              )),
            };
          }
          if (sql.includes('FROM waxonedge_chart_candles')) return { results: [] };
          if (sql.includes('FROM waxonedge_tokens')) {
            const rows = [
              { contract: 'eosio.token', symbol: 'WAX', decimals: '8', price_wax: '1', price_usd: '0.006', updated_at: '2026-06-14T11:00:00.000Z' },
              { contract: 'graffitiking', symbol: 'WAXCASH', decimals: '8', total_supply: null, max_supply: null, updated_at: '2026-06-14T11:00:00.000Z' },
            ];
            return { results: rows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])) };
          }
          if (sql.includes('FROM waxonedge_token_stats')) {
            return { results: [{ contract: 'graffitiking', symbol: 'WAXCASH', updated_at: '2026-06-14T11:00:00.000Z' }] };
          }
          return { results: [] };
        }
        return {
          bind(...params) {
            return {
              async all() {
                return allResults(params);
              },
              async first() {
                return allResults(params).results[0] || null;
              },
            };
          },
        };
      },
    };
    const failedSupplyWaxcashAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(failedSupplyWaxcashAnalyticsDb);
    ok('WAXCASH analytics total-supply metric status exposes current RPC failure without FDV or market-cap fallback',
      failedSupplyWaxcashAnalytics.stats.total_supply === null &&
      failedSupplyWaxcashAnalytics.stats.fdv_wax === null &&
      failedSupplyWaxcashAnalytics.stats.market_cap_wax === null &&
      failedSupplyWaxcashAnalytics.stats.metric_status.total_supply.live === false &&
      failedSupplyWaxcashAnalytics.stats.metric_status.total_supply.reason.includes('WAX RPC get_currency_stats failed') &&
      failedSupplyWaxcashAnalytics.supply_sync_status.waxcash.last_error.includes('get_currency_stats_missing_WAXCASH'),
      JSON.stringify({
        stats: failedSupplyWaxcashAnalytics.stats,
        supply_sync_status: failedSupplyWaxcashAnalytics.supply_sync_status,
      }));
    const supplyWrites = [];
    const supplyDb = {
      prepare(sql) {
        const makeExecutor = (params = []) => ({
          async first() {
            if (sql.includes('COUNT(*) AS count')) return { count: 0 };
            return null;
          },
          async all() {
            if (sql.includes('FROM waxonedge_tokens t')) return { results: [] };
            return { results: [] };
          },
          async run() {
            supplyWrites.push({ sql, params });
            return { success: true };
          },
        });
        return {
          bind(...params) {
            return makeExecutor(params);
          },
          first: makeExecutor([]).first,
          all: makeExecutor([]).all,
          run: makeExecutor([]).run,
        };
      },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init?.body || '{}');
      if (body.code === 'graffitiking' && body.symbol === 'WAXCASH') {
        return new Response(JSON.stringify({
          WAXCASH: {
            supply: '9999999999.12345678 WAXCASH',
            max_supply: '9999999999.12345678 WAXCASH',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    let supplySyncResult = null;
    try {
      supplySyncResult = await __waxonedgeTestHooks.syncSupplyInputs({
        DB: supplyDb,
        WAXONEDGE_FREE_SAFE_MODE: 'true',
        WAXONEDGE_SUPPLY_SYNC_LIMIT: '1',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    const tokenSupplyWrite = supplyWrites.find((write) =>
      write.sql.includes('INSERT INTO waxonedge_tokens') &&
      write.params[0] === 'graffitiking' &&
      write.params[1] === 'WAXCASH');
    ok('WAXCASH supply sync indexes exact chain stat supply with 8-decimal normalization',
      supplySyncResult?.waxcash_target_included === true &&
      supplySyncResult?.updated === 1 &&
      tokenSupplyWrite &&
      tokenSupplyWrite.params[2] === 8 &&
      tokenSupplyWrite.params[3] === '9999999999.12345678' &&
      tokenSupplyWrite.params[4] === '9999999999.12345678',
      JSON.stringify({ supplySyncResult, tokenSupplyWrite, supplyWrites }));
    const failingSupplyWrites = [];
    const failingSupplyDb = {
      prepare(sql) {
        const makeExecutor = (params = []) => ({
          async first() {
            if (sql.includes('COUNT(*) AS count')) return { count: 0 };
            return null;
          },
          async all() {
            if (sql.includes('FROM waxonedge_tokens t')) return { results: [] };
            return { results: [] };
          },
          async run() {
            failingSupplyWrites.push({ sql, params });
            return { success: true };
          },
        });
        return {
          bind(...params) {
            return makeExecutor(params);
          },
          first: makeExecutor([]).first,
          all: makeExecutor([]).all,
          run: makeExecutor([]).run,
        };
      },
    };
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    let failingSupplyResult = null;
    try {
      failingSupplyResult = await __waxonedgeTestHooks.syncSupplyInputs({
        DB: failingSupplyDb,
        WAXONEDGE_FREE_SAFE_MODE: 'true',
        WAXONEDGE_SUPPLY_SYNC_LIMIT: '1',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    ok('WAXCASH supply sync exposes exact pinned-target failure instead of silently swallowing it',
      failingSupplyResult?.status === 'failed' &&
      failingSupplyResult?.failed === 1 &&
      failingSupplyResult?.waxcash_error?.includes('graffitiking::WAXCASH supply sync failed') &&
      failingSupplyWrites.some((write) => write.sql.includes('waxonedge_source_index_state') && String(write.params[8] || '').includes('WAXCASH supply sync failed')) &&
      failingSupplyWrites.some((write) => write.sql.includes('waxonedge_sync_runs') && String(write.params[4] || '').includes('WAXCASH supply sync failed')),
      JSON.stringify({ failingSupplyResult, failingSupplyWrites }));
    const supplyStatusDb = {
      prepare(sql) {
        function result(params) {
          if (sql.includes('FROM waxonedge_source_index_state')) {
            return [{
              source: 'token_supply',
              status: 'failed',
              cursor: '',
              complete: 0,
              truncated: 0,
              row_count: 1,
              updated_at: '2026-06-14T12:00:00.000Z',
              error: 'graffitiking::WAXCASH supply sync failed: get_currency_stats_missing_WAXCASH',
            }];
          }
          if (sql.includes('FROM waxonedge_sync_runs')) {
            return [{
              source: 'token_supply',
              status: 'failed',
              started_at: '2026-06-14T12:00:00.000Z',
              finished_at: '2026-06-14T12:00:01.000Z',
              error: 'graffitiking::WAXCASH supply sync failed: get_currency_stats_missing_WAXCASH',
            }];
          }
          if (sql.includes('FROM waxonedge_tokens')) return [{ contract: 'graffitiking', symbol: 'WAXCASH', decimals: '8', total_supply: null, max_supply: null, updated_at: null }];
          return [];
        }
        return {
          bind(...params) {
            return {
              async first() {
                return result(params)[0] || null;
              },
              async all() {
                return { results: result(params) };
              },
            };
          },
        };
      },
    };
    const waxcashSupplyStatus = await __waxonedgeTestHooks.getWaxcashSupplySyncStatus(supplyStatusDb);
    ok('WAXCASH supply debug status reports missing total supply and last sync error',
      waxcashSupplyStatus.waxcash.live === false &&
      waxcashSupplyStatus.waxcash.total_supply === null &&
      waxcashSupplyStatus.waxcash.last_error.includes('get_currency_stats_missing_WAXCASH') &&
      waxcashSupplyStatus.no_fake_supply === true,
      JSON.stringify(waxcashSupplyStatus));
    const waxPriceIndex = new Map([['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }]]);
    const legacyFirstHeadline = __waxonedgeTestHooks.waxcashHeadlinePrice([
      graphPairs.find((pair) => pair.pair_id === '8388'),
      graphPairs.find((pair) => pair.pair_id === 'WAXCASHWAXLEGACY'),
    ], waxPriceIndex);
    ok('WAXCASH headline selects deepest usable direct WAX pool and rejects unproven V3',
      legacyFirstHeadline.og_headline_price_source === 'swap.nefty' &&
      legacyFirstHeadline.og_headline_price_pair_id === 'WAXCASHWAXLEGACY' &&
      Number(legacyFirstHeadline.og_headline_price_wax) === 0.03 &&
      legacyFirstHeadline.headline_price_source_policy === 'og_woe_deepest_usable_direct_wax_pool' &&
      legacyFirstHeadline.usable_direct_wax_candidate_count === 1 &&
      legacyFirstHeadline.legacy_direct_wax_selected === true &&
      legacyFirstHeadline.v3_direct_wax_selected === false);
    const v3FallbackHeadline = __waxonedgeTestHooks.waxcashHeadlinePrice([
      graphPairs.find((pair) => pair.pair_id === '8388'),
    ], waxPriceIndex);
    ok('WAXCASH headline rejects unproven Alcor V3 reserve-ratio fallback',
      v3FallbackHeadline.og_headline_price_source === null &&
      v3FallbackHeadline.og_headline_price_pair_id === null &&
      v3FallbackHeadline.og_headline_price_wax === null &&
      v3FallbackHeadline.legacy_direct_wax_selected === false &&
      v3FallbackHeadline.v3_direct_wax_selected === false &&
      v3FallbackHeadline.og_headline_reason_codes.includes('no_direct_wax_pool_with_usable_price_proof') &&
      v3FallbackHeadline.direct_wax_candidates.some((candidate) =>
        candidate.pair_id === '8388' &&
        candidate.reason_codes.includes('v3_poolv3_getprice_proof_unavailable')));
    const provenV3FallbackHeadline = __waxonedgeTestHooks.waxcashHeadlinePrice([{
      ...graphPairs.find((pair) => pair.pair_id === '8388'),
      poolv3_price: '200',
      valuation_basis: 'alcor_v3_poolv3_getprice',
      proof_status: 'verified',
    }], waxPriceIndex);
    ok('WAXCASH headline uses proven PoolV3.getPrice without reserve-ratio math',
      provenV3FallbackHeadline.og_headline_price_source === 'swap.alcor' &&
      provenV3FallbackHeadline.og_headline_price_pair_id === '8388' &&
      Number(provenV3FallbackHeadline.og_headline_price_wax) === 0.005 &&
      provenV3FallbackHeadline.og_headline_formula === 'price_wax = 1 / PoolV3.getPrice(pool)' &&
      Number(provenV3FallbackHeadline.og_headline_price_wax) !== 0.01 &&
      provenV3FallbackHeadline.v3_direct_wax_selected === true);
    const noDirectWaxcashAnalyticsDb = {
      prepare(sql) {
        function allResults(params) {
          if (sql.includes('FROM waxonedge_pairs')) {
            const wantsWaxcash = params.includes('graffitiking') && params.includes('WAXCASH');
            if (wantsWaxcash) {
              return { results: graphPairs.filter((pair) => pairTokenTouches(pair, 'graffitiking', 'WAXCASH') && pair.token_a_symbol !== 'WAX' && pair.token_b_symbol !== 'WAX') };
            }
            return { results: [] };
          }
          if (sql.includes('FROM waxonedge_chart_candles')) return { results: [] };
          if (sql.includes('FROM waxonedge_tokens')) {
            return { results: graphTokenRows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])) };
          }
          if (sql.includes('FROM waxonedge_token_stats')) {
            return {
              results: [{
                contract: 'graffitiking',
                symbol: 'WAXCASH',
                holder_count: '42',
                circulating_supply: '500000',
                total_supply: '1000000',
                updated_at: '2026-06-14T11:00:00.000Z',
              }],
            };
          }
          return { results: [] };
        }
        return {
          bind(...params) {
            return {
              async all() {
                return allResults(params);
              },
              async first() {
                return allResults(params).results[0] || null;
              },
            };
          },
        };
      },
    };
    const noDirectWaxcashAnalytics = await __waxonedgeTestHooks.buildWaxcashAnalytics(noDirectWaxcashAnalyticsDb);
    ok('WAXCASH analytics keeps price, market cap, and FDV unavailable without usable direct WAX proof',
      noDirectWaxcashAnalytics.stats.selected_price_wax === null &&
      noDirectWaxcashAnalytics.stats.market_cap_wax === null &&
      noDirectWaxcashAnalytics.stats.market_cap_usd === null &&
      noDirectWaxcashAnalytics.stats.fdv_wax === null &&
      noDirectWaxcashAnalytics.stats.fdv_usd === null &&
      noDirectWaxcashAnalytics.stats.selected_price_basis === 'og_woe_direct_wax_pool' &&
      !String(noDirectWaxcashAnalytics.stats.selected_price_basis).includes('recursive') &&
      noDirectWaxcashAnalytics.headline_price?.headline_price_source_policy === 'og_woe_deepest_usable_direct_wax_pool');
    const staleWufUpdate = __waxonedgeTestHooks.instantLiveTokenUpdatesForVerifiedPairEvent({
      changedPair: graphPairs.find((pair) => pair.pair_id === 'WAXCASHWUF'),
      tokenRows: graphTokenRows,
      pairRows: graphPairs,
      priceRows: graphTokenRows.filter((row) => row.contract === 'eosio.token' && row.symbol === 'WAX'),
      updatedAt: '2026-06-14T11:05:00.000Z',
    }).find((update) => update.token_key === 'wuffi::WUF');
    const workerReserveStream = liveIndexer.VERIFIED_TRADE_STREAMS.find((stream) =>
      stream.account === 'swap.nefty' && stream.action === 'logswap');
    const workerReserveTrade = liveIndexer.normalizeLiveTradeRow({
      action: 'logswap',
      global_sequence: 203,
      timestamp: '2026-06-18T12:30:00.000Z',
      data: {
        record: {
          code: 'WAXCASHWUF',
          quantity_in: { quantity: '1.00000000 WAXCASH', contract: 'graffitiking' },
          quantity_out: { quantity: '0.01000000 WUF', contract: 'wuffi' },
          token_a_contract: 'graffitiking',
          token_a_symbol: 'WAXCASH',
          token_b_contract: 'wuffi',
          token_b_symbol: 'WUF',
          reserve_a: '100000',
          reserve_b: '1000',
        },
      },
    }, workerReserveStream);
    const workerReserveUpdate = liveIndexer.observeLiveTrade(liveIndexer.createState(liveIndexer.loadConfig({
      WAXONEDGE_HYPERION_API: 'https://wax.eosusa.io/v2',
      WAXONEDGE_LIVE_ENABLE_STREAM: 'true',
    })), workerReserveTrade, { save: false, refresh: false, broadcast: false });
    const sseResponse = await __waxonedgeTestHooks.handleLiveStream({}, {
      DB: graphDb,
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
      WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
    }, async (url, init) => new Response(
      'event: token_update\n' +
      `data: ${JSON.stringify(workerReserveUpdate)}\n\n`,
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    ));
    const sseBody = await sseResponse.text();
    const sseTokenUpdates = Array.from(sseBody.matchAll(/event: token_update\ndata: ([^\n]+)/g))
      .map((match) => JSON.parse(match[1]));
    const sseTokenUpdate = sseTokenUpdates.find((update) => update.token_key === 'wuffi::WUF');
    ok('Worker live stream transforms changed pair events into recomputed token_update output',
      sseResponse.status === 200 &&
      sseResponse.headers.get('content-type').includes('text/event-stream') &&
      sseBody.includes('event: token_update') &&
      sseBody.includes('"token_key":"wuffi::WUF"') &&
      sseBody.includes('"selected_price_wax"') &&
      sseBody.includes('"market_cap_wax"') &&
      sseBody.includes('"graph_liquidity_wax"') &&
      sseBody.includes('"selected_pair_source"') &&
      sseBody.includes('"selected_pair_id"') &&
      sseBody.includes('"proof_status":"verified"') &&
      !sseBody.includes('do-not-leak'),
      sseBody);
    ok('Worker live stream consumes the real VPS emitted canonical_pair shape',
      workerReserveUpdate?.canonical_pair &&
      sseTokenUpdate &&
      sseTokenUpdate.selected_pair_id === workerReserveUpdate.canonical_pair.pair_id &&
      sseBody.includes('"token_key":"wuffi::WUF"'),
      JSON.stringify({ workerReserveUpdate, sseTokenUpdates }));
    ok('Worker live stream recomputes market cap from live event reserves without mutating D1 first',
      sseTokenUpdate &&
      staleWufUpdate &&
      Number(sseTokenUpdate.selected_price_wax) !== Number(staleWufUpdate.selected_price_wax) &&
      Number(sseTokenUpdate.market_cap_wax) !== Number(staleWufUpdate.market_cap_wax) &&
      Number(sseTokenUpdate.graph_liquidity_wax) !== 0 &&
      sseTokenUpdate.selected_pair_id === 'WAXCASHWUF',
      JSON.stringify({ staleWufUpdate, sseTokenUpdates }));
    const staleIdentityOnlySse = await __waxonedgeTestHooks.handleLiveStream({}, {
      DB: graphDb,
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    }, async () => new Response(
      'event: token_update\n' +
      'data: {"source":"swap.taco","pair_id":"WUFWAX150","updated_at":"2026-06-18T12:31:00.000Z"}\n\n',
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    ));
    const staleIdentityOnlyBody = await staleIdentityOnlySse.text();
    ok('Worker live stream does not claim instant recompute from identity-only stale-D1 events',
      staleIdentityOnlyBody.includes('event: heartbeat') &&
      !staleIdentityOnlyBody.includes('event: token_update'),
      staleIdentityOnlyBody);
    const noSupplyGraphUpdate = __waxonedgeTestHooks.normalizeLiveTokenUpdate({
      contract: 'nosupply.token',
      symbol: 'NOSUP',
      selected_price_wax: '2',
      selected_price_usd: '0.012',
      liquidity_wax: '500',
      liquidity_usd: '3',
      graph_liquidity_wax: '500',
      graph_liquidity_usd: '3',
      liquidity_basis: 'og_wax_route_pool_graph',
      market_cap_wax: '999999',
      market_cap_usd: '5999.994',
    });
    ok('WaxOnEdge market cap is unavailable without circulating supply and is not replaced with graph liquidity',
      noSupplyGraphUpdate.graph_liquidity_wax === '500' &&
      noSupplyGraphUpdate.market_cap_wax === null &&
      noSupplyGraphUpdate.market_cap_usd === null &&
      noSupplyGraphUpdate.market_cap_confidence === 'unavailable' &&
      noSupplyGraphUpdate.metric_status.market_cap.live === false);
    const wufGraphNode = waxcashPairGraph.nodes.find((node) => node.token_key === 'wuffi::WUF');
    ok('WAXCASH graph endpoint source_count matches direct WAXCASH source_keys only',
      wufGraphNode &&
      wufGraphNode.source_keys === 'swap.nefty' &&
      wufGraphNode.source_count === 1 &&
      wufGraphNode.indexed_pair_count === 1);
    const valuationGraphPairs = [
      {
        source: 'swap.alcor',
        pair_id: '8388',
        token_a_contract: 'eosio.token',
        token_a_symbol: 'WAX',
        token_b_contract: 'graffitiking',
        token_b_symbol: 'WAXCASH',
        reserve_a: '100',
        reserve_b: '10000',
        poolv3_price: '100',
        valuation_basis: 'alcor_v3_poolv3_getprice',
        proof_status: 'verified',
        liquidity_wax: '999999',
        updated_at: '2026-06-14T12:00:00.000Z',
      },
      {
        source: 'swap.nefty',
        pair_id: 'WAXCASHTOKA',
        token_a_contract: 'graffitiking',
        token_a_symbol: 'WAXCASH',
        token_b_contract: 'tok.a',
        token_b_symbol: 'TOKA',
        reserve_a: '500',
        reserve_b: '100',
        liquidity_wax: '999999',
        volume_24h_wax: '-7',
        volume_24h_usd: '-0.042',
        updated_at: '2026-06-14T12:05:00.000Z',
      },
      {
        source: 'swap.taco',
        pair_id: 'TOKBWAXCASH',
        token_a_contract: 'tok.b',
        token_a_symbol: 'TOKB',
        token_b_contract: 'graffitiking',
        token_b_symbol: 'WAXCASH',
        reserve_a: '20',
        reserve_b: '40',
        liquidity_wax: '999999',
        updated_at: '2026-06-14T12:06:00.000Z',
      },
      {
        source: 'swap.box',
        pair_id: 'WAXCASHZERO',
        token_a_contract: 'graffitiking',
        token_a_symbol: 'WAXCASH',
        token_b_contract: 'zero.token',
        token_b_symbol: 'ZERO',
        reserve_a: '0',
        reserve_b: '1',
        liquidity_wax: '999999',
        updated_at: '2026-06-14T12:07:00.000Z',
      },
    ];
    const valuationGraphRows = [
      { contract: 'eosio.token', symbol: 'WAX', decimals: 8, price_wax: '1', price_usd: '0.006', updated_at: '2026-06-14T12:00:00.000Z' },
      { contract: 'graffitiking', symbol: 'WAXCASH', decimals: 8, total_supply: '1000000', circulating_supply: '500000', updated_at: '2026-06-14T12:00:00.000Z' },
      { contract: 'tok.a', symbol: 'TOKA', decimals: 4, total_supply: '1000000', source_count: 5, source_keys: 'swap.nefty,swap.taco', updated_at: '2026-06-14T12:05:00.000Z' },
      { contract: 'tok.b', symbol: 'TOKB', decimals: 6, total_supply: '1000000', circulating_supply: '10', updated_at: '2026-06-14T12:06:00.000Z' },
      { contract: 'zero.token', symbol: 'ZERO', decimals: 0, total_supply: '100', updated_at: '2026-06-14T12:07:00.000Z' },
    ];
    const valuationGraphDb = {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async all() {
                if (sql.includes('FROM waxonedge_pairs')) {
                  return { results: valuationGraphPairs };
                }
                if (sql.includes('SELECT contract, symbol, price_wax, price_usd')) {
                  return { results: valuationGraphRows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])) };
                }
                if (sql.includes('FROM waxonedge_tokens t')) {
                  return { results: valuationGraphRows.filter((row) => params.some((value, index) => index % 2 === 0 && row.contract === value && row.symbol === params[index + 1])) };
                }
                return { results: [] };
              },
            };
          },
        };
      },
    };
    const valuationGraph = await __waxonedgeTestHooks.buildWaxcashPairGraph(valuationGraphDb);
    const tokaNode = valuationGraph.nodes.find((node) => node.token_key === 'tok.a::TOKA');
    const tokbNode = valuationGraph.nodes.find((node) => node.token_key === 'tok.b::TOKB');
    const zeroNode = valuationGraph.nodes.find((node) => node.token_key === 'zero.token::ZERO');
    const tokaEdge = valuationGraph.edges.find((edge) => edge.pair_id === 'WAXCASHTOKA');
    const tokbEdge = valuationGraph.edges.find((edge) => edge.pair_id === 'TOKBWAXCASH');
    const zeroEdge = valuationGraph.edges.find((edge) => edge.pair_id === 'WAXCASHZERO');
    ok('WAXCASH graph endpoint values direct WAXCASH pairs from normalized reserves, not stored liquidity',
      valuationGraph.counts.direct_pair_count === 4 &&
      tokaEdge &&
      tokaEdge.valuation.pair_direction === 'waxcash_token_a' &&
      tokaEdge.valuation.waxcash_decimals === 8 &&
      tokaEdge.valuation.paired_token_decimals === 4 &&
      Number(tokaEdge.valuation.token_price_in_waxcash) === 5 &&
      Number(tokaEdge.valuation.selected_price_wax) === 0.05 &&
      Number(tokaEdge.liquidity_wax) === 10 &&
      tokaEdge.liquidity_wax !== '999999' &&
      Number(tokaEdge.volume_24h_wax) === 7 &&
      tokbEdge &&
      tokbEdge.valuation.pair_direction === 'waxcash_token_b' &&
      tokbEdge.valuation.paired_token_decimals === 6 &&
      Number(tokbEdge.valuation.token_price_in_waxcash) === 2 &&
      Number(tokbEdge.liquidity_wax) === 0.8);
    ok('WAXCASH graph endpoint leaves missing-supply market cap null and keeps sources direct-scoped',
      tokaNode &&
      tokaNode.market_cap_wax === null &&
      tokaNode.market_cap_usd === null &&
      tokaNode.source_keys === 'swap.nefty' &&
      tokaNode.source_count === 1 &&
      tokbNode &&
      Number(tokbNode.market_cap_wax) === 0.2 &&
      zeroNode &&
      zeroNode.price_wax === null &&
      zeroEdge &&
      zeroEdge.liquidity_wax === null &&
      zeroEdge.valuation.reason_codes.includes('missing_or_zero_reserves'));
    const graphLiveResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    { DB: graphDb },
    new URLSearchParams(),
    {},
  );
  const graphLiveBody = await graphLiveResponse.json();
  const graphLiveKeys = graphLiveBody.tokens.map((token) => token.token_key);
  const visibleLiveKeys = graphLiveBody.tokens
    .filter((token) => token.visible_in_waxcash_bubbles === true)
    .map((token) => token.token_key);
  const hiddenLiveKeys = graphLiveBody.tokens
    .filter((token) => token.visible_in_waxcash_bubbles === false)
    .map((token) => token.token_key);
  ok('/api/waxonedge/live default feed is pinned to WAXCASH graph, not broad WAX token ranking',
    graphLiveResponse.status === 200 &&
    graphLiveKeys[0] === 'graffitiking::WAXCASH' &&
    graphLiveKeys.includes('wuffi::WUF') &&
    graphLiveKeys.includes('abc.token::ABC') &&
    graphLiveKeys.includes('route.token::ROUTE') &&
    graphLiveKeys.includes('aigodtokenwx::AIGOD') &&
    graphLiveKeys.includes('help.token::HELP') &&
    graphLiveKeys.includes('eosio.token::WAX') &&
    !graphLiveKeys.includes('qqq.core::QQQCORE'));
  ok('/api/waxonedge/live marks visible bubbles separately from recursive valuation tokens',
    visibleLiveKeys.length === 6 &&
    visibleLiveKeys.includes('graffitiking::WAXCASH') &&
    visibleLiveKeys.includes('route.token::ROUTE') &&
    visibleLiveKeys.includes('eosio.token::WAX') &&
    hiddenLiveKeys.includes('help.token::HELP') &&
    graphLiveKeys.includes('help.token::HELP'),
    JSON.stringify({ graphLiveKeys, visibleLiveKeys, hiddenLiveKeys }));
  ok('/api/waxonedge/live exposes selected price and market-cap rejection diagnostics per token',
    graphLiveBody.tokens.every((token) =>
      Object.prototype.hasOwnProperty.call(token, 'selected_price_source') &&
      Object.prototype.hasOwnProperty.call(token, 'selected_price_route') &&
      Object.prototype.hasOwnProperty.call(token, 'selected_price_rejection_reason') &&
      Object.prototype.hasOwnProperty.call(token, 'market_cap_rejection_reason')
    ));
  const routedLiveToken = graphLiveBody.tokens.find((token) => token.token_key === 'route.token::ROUTE');
  ok('WAXCASH-paired token without a direct WAX pool remains visible and can use routed valuation',
    routedLiveToken &&
    routedLiveToken.visible_in_waxcash_bubbles === true &&
    routedLiveToken.selected_price_confidence === 'good' &&
    Number(routedLiveToken.price_wax) > 0 &&
    Number(routedLiveToken.liquidity_wax) > 0 &&
    Number(routedLiveToken.tvl_wax) > 0);
  const aigodLiveToken = graphLiveBody.tokens.find((token) => token.token_key === 'aigodtokenwx::AIGOD');
  const wufLiveToken = graphLiveBody.tokens.find((token) => token.token_key === 'wuffi::WUF');
  ok('AIGOD-style fake/exploded WAXCASH pair liquidity stays in proof totals but is excluded from bubble sizing',
    aigodLiveToken &&
    wufLiveToken &&
    aigodLiveToken.selected_price_confidence === 'good' &&
    Number(aigodLiveToken.price_wax) === 100 &&
    Number(aigodLiveToken.liquidity_wax) > 100000000 &&
    Number(aigodLiveToken.tvl_wax) > 100000000 &&
    Number(aigodLiveToken.direct_pair_liquidity_wax) > 100000000 &&
    Number(aigodLiveToken.bubble_liquidity_wax) === 200 &&
    Number(aigodLiveToken.bubble_tvl_wax) === 200 &&
    Number(aigodLiveToken.direct_wax_pair_liquidity_wax) === 200 &&
    Number(aigodLiveToken.direct_waxcash_pair_liquidity_wax) > 100000000 &&
    aigodLiveToken.suspicious_liquidity_pair_count == null &&
    aigodLiveToken.bubble_suspicious_liquidity_pair_count === 1 &&
    Number(aigodLiveToken.selected_metric_value) < Number(wufLiveToken.selected_metric_value));
  ok('WaxOnEdge visible token liquidity uses full graph liquidity, not only direct WAXCASH pair liquidity',
    wufLiveToken &&
    wufLiveToken.visible_in_waxcash_bubbles === true &&
    Number(wufLiveToken.graph_liquidity_wax) === Number(wufLiveToken.liquidity_wax) &&
    Number(wufLiveToken.graph_liquidity_wax) > 0 &&
    wufLiveToken.liquidity_confidence === 'good',
    JSON.stringify(wufLiveToken));
  const searchedLiveResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    { DB: graphDb },
    new URLSearchParams('search=WUF'),
    {},
  );
  const searchedLiveBody = await searchedLiveResponse.json();
  const searchedLiveKeys = searchedLiveBody.tokens.map((token) => token.token_key);
  ok('/api/waxonedge/live search filters by token text inside the WAXCASH graph only',
    searchedLiveResponse.status === 200 &&
    searchedLiveBody.ok === true &&
    searchedLiveKeys.includes('wuffi::WUF') &&
    !searchedLiveKeys.includes('qqq.core::QQQCORE'));
  const searchedWaxcashResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    { DB: graphDb },
    new URLSearchParams('search=WAXCASH'),
    {},
  );
  const searchedWaxcashBody = await searchedWaxcashResponse.json();
  const searchedWaxcashKeys = searchedWaxcashBody.tokens.map((token) => token.token_key);
  ok('/api/waxonedge/live search returns WAXCASH and direct WAXCASH-paired tokens only',
    searchedWaxcashResponse.status === 200 &&
    searchedWaxcashBody.ok === true &&
    searchedWaxcashKeys.includes('graffitiking::WAXCASH') &&
    searchedWaxcashKeys.includes('wuffi::WUF') &&
    searchedWaxcashKeys.includes('route.token::ROUTE') &&
    searchedWaxcashKeys.includes('aigodtokenwx::AIGOD') &&
    !searchedWaxcashKeys.includes('help.token::HELP') &&
    !searchedWaxcashKeys.includes('qqq.core::QQQCORE'));
  ok('/api/waxonedge/live handler passes search query into the graph-scoped live snapshot loader',
    route.includes("search: query.get('search') || query.get('q')") &&
    route.includes("const search = safeString(options.search) || ''") &&
    route.includes('function matchesSearch(row)') &&
    route.includes('const graph = await loadWaxcashGraphTokenRows(db)'));
  const badCursorResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    { DB: fakeLiveDb([]) },
    new URLSearchParams('cursor=bad-cursor'),
    {},
  );
  const badCursorBody = await badCursorResponse.json();
  ok('/api/waxonedge/live cursor parse errors return safe JSON instead of throwing',
    badCursorResponse.status === 200 &&
    badCursorBody.ok === true &&
    badCursorBody.tokens.length === 1 &&
    badCursorBody.tokens[0].token_key === 'graffitiking::WAXCASH' &&
    badCursorBody.warnings.includes('Invalid live cursor ignored.'));
  const errorResponse = await __waxonedgeTestHooks.handleLiveSnapshot(
    {
      DB: {
        prepare() {
          throw new Error('mock D1 exploded');
        },
      },
    },
    new URLSearchParams(),
    {},
  );
  const errorBody = await errorResponse.json();
  ok('/api/waxonedge/live catches runtime errors as JSON diagnostics',
    errorResponse.status === 503 &&
    errorBody.ok === false &&
    errorBody.source === 'moonboys-api/waxonedge-live' &&
    errorBody.mode === 'snapshot' &&
    errorBody.error === 'live snapshot unavailable' &&
    errorBody.diagnostic.includes('mock D1 exploded') &&
    errorBody.uses_fake_live_data === false);
}
ok('indexer health exposes live update contract metadata',
  route.includes('live_updates') &&
  route.includes('snapshot_endpoint: WAXONEDGE_LIVE_SNAPSHOT_ENDPOINT') &&
  route.includes('stream_endpoint: WAXONEDGE_LIVE_STREAM_ENDPOINT') &&
  route.includes("transport: liveIndexerProbe?.reachable ? 'sse' : 'snapshot-polling-fallback'") &&
  route.includes('vps_stream_required: !liveIndexerProbe?.reachable') &&
  route.includes('instant_market_cap_recompute: liveIndexerProbe?.reachable === true') &&
  route.includes('browser_hyperion_fetch: false') &&
  route.includes('live_indexer: waxonedgeLiveIndexerConfig(env)') &&
  route.includes('live_indexer_probe: liveIndexerProbe') &&
  route.includes('cachedProbeWaxonedgeLiveIndexer(env)') &&
  route.includes("redirect: 'manual'") &&
  !route.includes('token_key_format: \'contract::symbol\',\n    },\n    live_indexer_probe: liveIndexerProbe') &&
  route.includes('const WAXONEDGE_LIVE_SECRET_HEADER'));
{
  const noConfig = __waxonedgeTestHooks.waxonedgeLiveIndexerConfig({});
  const configured = __waxonedgeTestHooks.waxonedgeLiveIndexerConfig({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
  });
  ok('Worker health exposes live indexer config state without leaking secrets',
    noConfig.vps_indexer_url_configured === false &&
    noConfig.shared_secret_configured === false &&
    noConfig.proxy_enabled === false &&
    noConfig.worker_stream_endpoint === null &&
    noConfig.secret_header === 'x-waxonedge-live-secret' &&
    configured.vps_indexer_url_configured === true &&
    configured.shared_secret_configured === true &&
    configured.proxy_enabled === true &&
    configured.worker_stream_endpoint === '/api/waxonedge/live/stream' &&
    configured.secret_header === 'x-waxonedge-live-secret' &&
    JSON.stringify(configured).includes('do-not-leak') === false);
  ok('Worker rejects unsafe live indexer URL config shapes',
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'ftp://live.example' }) === false &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'https://user:pass@live.example' }) === false &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'https://live.example/?x=1' }) === false &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'https://live.example/#frag' }) === false &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://live.example' }) === false);
  ok('Worker live indexer URL policy allows loopback HTTP and non-loopback HTTPS only',
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://127.0.0.1:8789' }) === true &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://127.0.0.2:8789' }) === true &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://127.1.2.3:8789' }) === true &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://localhost:8789' }) === true &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://[::1]:8789' }) === true &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://128.0.0.1:8789' }) === false &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'http://10.0.0.1:8789' }) === false &&
    __waxonedgeTestHooks.waxonedgeLiveIndexerUrlConfigured({ WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal' }) === true &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('127.0.0.1') === true &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('127.0.0.2') === true &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('127.1.2.3') === true &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('127.255.255.255') === true &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('128.0.0.1') === false &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('10.0.0.1') === false &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('127.0.0.256') === false &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('127.0.0.x') === false &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('localhost') === true &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('::1') === true &&
    __waxonedgeTestHooks.isLoopbackLiveIndexerHost('[::1]') === true);
}
{
  const notConfigured = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({}, async () => {
    throw new Error('fetch should not run');
  });
  const emptyConfigured = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: '',
  }, async () => {
    throw new Error('fetch should not run');
  });
  const unsafeConfigured = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://user:pass@live.example',
  }, async () => {
    throw new Error('fetch should not run');
  });
  const nonLoopbackHttpConfigured = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'http://live.example',
    WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
  }, async () => {
    throw new Error('fetch should not run');
  });
  ok('Worker live indexer probe reports not_configured for missing or unsafe URL',
    notConfigured.configured === false &&
    notConfigured.reachable === false &&
    notConfigured.status === 'not_configured' &&
    emptyConfigured.configured === false &&
    emptyConfigured.reachable === false &&
    emptyConfigured.status === 'not_configured' &&
    unsafeConfigured.configured === false &&
    unsafeConfigured.reachable === false &&
    unsafeConfigured.status === 'not_configured' &&
    nonLoopbackHttpConfigured.configured === false &&
    nonLoopbackHttpConfigured.reachable === false &&
    nonLoopbackHttpConfigured.status === 'not_configured');
}
{
  let requestedUrl = '';
  let receivedSecret = '';
  const probe = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal/',
    WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
  }, async (url, options) => {
    requestedUrl = url;
    receivedSecret = options.headers['x-waxonedge-live-secret'];
    return new Response(JSON.stringify({
      service: 'waxonedge-live-indexer',
      status: 'not_connected',
      uses_fake_live_data: false,
      browser_hyperion_fetch: false,
      emits_fake_token_updates: false,
    }), { status: 200 });
  });
  ok('Worker live indexer probe sends secret header and does not leak secret',
    requestedUrl === 'https://live-indexer.example.internal/health' &&
    receivedSecret === 'do-not-leak' &&
    probe.configured === true &&
    probe.reachable === true &&
    probe.status === 'not_connected' &&
    probe.service === 'waxonedge-live-indexer' &&
    probe.shared_secret_configured === true &&
    Object.prototype.hasOwnProperty.call(probe, 'secret_configured') === false &&
    probe.secret_leaked === false &&
    JSON.stringify(probe).includes('do-not-leak') === false);
}
{
  let requestedUrl = '';
  let redirectMode = '';
  let receivedSecret = '';
  const redirected = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
  }, async (url, options) => {
    requestedUrl = url;
    redirectMode = options.redirect;
    receivedSecret = options.headers['x-waxonedge-live-secret'];
    return new Response('', {
      status: 302,
      headers: { Location: 'https://evil.example/health' },
    });
  });
  ok('Worker live indexer probe does not follow redirects or leak secret across origins',
    requestedUrl === 'https://live-indexer.example.internal/health' &&
    redirectMode === 'manual' &&
    receivedSecret === 'do-not-leak' &&
    redirected.configured === true &&
    redirected.reachable === false &&
    redirected.status === 'probe_failed' &&
    redirected.last_error === 'live indexer health redirected' &&
    JSON.stringify(redirected).includes('do-not-leak') === false);
}
{
  const redirects = await Promise.all([301, 302, 307, 308].map((status) =>
    __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    }, async () => new Response('', { status, headers: { Location: 'https://other.example/health' } }))));
  ok('Worker live indexer probe treats all redirect status codes as failed probes',
    redirects.every((probe) =>
      probe.configured === true &&
      probe.reachable === false &&
      probe.status === 'probe_failed' &&
      probe.last_error === 'live indexer health redirected'));
}
{
  const goodHealth = {
    service: 'waxonedge-live-indexer',
    status: 'not_connected',
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  };
  let fetchCount = 0;
  const fetcher = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(goodHealth), { status: 200 });
  };
  __waxonedgeTestHooks.resetWaxonedgeLiveIndexerProbeCache();
  const first = await __waxonedgeTestHooks.cachedProbeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
  }, fetcher, 1000);
  const second = await __waxonedgeTestHooks.cachedProbeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
  }, fetcher, 2000);
  const afterTtl = await __waxonedgeTestHooks.cachedProbeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
  }, fetcher, 32000);
  ok('Worker live indexer probe cache reuses sanitized result within TTL and refreshes after TTL',
    fetchCount === 2 &&
    first.reachable === true &&
    second.reachable === true &&
    afterTtl.reachable === true &&
    JSON.stringify(second).includes('do-not-leak') === false);
}
{
  const goodHealth = {
    service: 'waxonedge-live-indexer',
    status: 'not_connected',
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  };
  const urls = [];
  __waxonedgeTestHooks.resetWaxonedgeLiveIndexerProbeCache();
  await __waxonedgeTestHooks.cachedProbeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer-a.example.internal',
  }, async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(goodHealth), { status: 200 });
  }, 1000);
  await __waxonedgeTestHooks.cachedProbeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer-b.example.internal',
  }, async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(goodHealth), { status: 200 });
  }, 2000);
  ok('Worker live indexer probe cache key changes when configured URL changes',
    urls.length === 2 &&
    urls[0] === 'https://live-indexer-a.example.internal/health' &&
    urls[1] === 'https://live-indexer-b.example.internal/health' &&
    __waxonedgeTestHooks.liveIndexerProbeCacheKey({
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer-a.example.internal',
      WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
    }).startsWith('https://live-indexer-a.example.internal|secret:fnv1a:') &&
    __waxonedgeTestHooks.liveIndexerProbeCacheKey({
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer-a.example.internal',
      WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
    }).includes('do-not-leak') === false);
}
{
  const goodHealth = {
    service: 'waxonedge-live-indexer',
    status: 'not_connected',
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  };
  const secrets = [];
  __waxonedgeTestHooks.resetWaxonedgeLiveIndexerProbeCache();
  await __waxonedgeTestHooks.cachedProbeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'old-secret',
  }, async (_url, options) => {
    secrets.push(options.headers['x-waxonedge-live-secret']);
    return new Response(JSON.stringify(goodHealth), { status: 200 });
  }, 1000);
  await __waxonedgeTestHooks.cachedProbeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'new-secret',
  }, async (_url, options) => {
    secrets.push(options.headers['x-waxonedge-live-secret']);
    return new Response(JSON.stringify(goodHealth), { status: 200 });
  }, 2000);
  const oldKey = __waxonedgeTestHooks.liveIndexerProbeCacheKey({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'old-secret',
  });
  const newKey = __waxonedgeTestHooks.liveIndexerProbeCacheKey({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
    WAXONEDGE_LIVE_SHARED_SECRET: 'new-secret',
  });
  ok('Worker live indexer probe cache invalidates on shared secret fingerprint changes',
    secrets.length === 2 &&
    secrets[0] === 'old-secret' &&
    secrets[1] === 'new-secret' &&
    oldKey !== newKey &&
    oldKey.includes('old-secret') === false &&
    newKey.includes('new-secret') === false &&
    __waxonedgeTestHooks.liveIndexerSecretFingerprint('old-secret') !== __waxonedgeTestHooks.liveIndexerSecretFingerprint('new-secret'));
}
{
  const goodHealth = {
    service: 'waxonedge-live-indexer',
    status: 'not_connected',
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  };
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  let fetchCount = 0;
  try {
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response(JSON.stringify(goodHealth), { status: 200 });
    };
    const db = createEmptyWaxonedgeHealthDb();
    __waxonedgeTestHooks.resetWaxonedgeLiveIndexerProbeCache();
    Date.now = () => 1000;
    const first = await __waxonedgeTestHooks.getIndexerHealth(db, {
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
      WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
    });
    Date.now = () => 2000;
    const second = await __waxonedgeTestHooks.getIndexerHealth(db, {
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
      WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
    });
    Date.now = () => 32000;
    const third = await __waxonedgeTestHooks.getIndexerHealth(db, {
      WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
      WAXONEDGE_LIVE_SHARED_SECRET: 'do-not-leak',
    });
    ok('public indexer health uses cached live indexer probe without leaking secret',
      fetchCount === 2 &&
      first.live_updates.live_indexer_probe.reachable === true &&
      second.live_updates.live_indexer_probe.reachable === true &&
      third.live_updates.live_indexer_probe.reachable === true &&
      first.live_updates.live_indexer.shared_secret_configured === true &&
      first.live_updates.live_indexer_probe.shared_secret_configured === true &&
      Object.prototype.hasOwnProperty.call(first.live_updates.live_indexer_probe, 'secret_configured') === false &&
      Object.prototype.hasOwnProperty.call(first, 'live_indexer_probe') === false &&
      /"secret_configured"\s*:/.test(JSON.stringify(first)) === false &&
      JSON.stringify(first).includes('do-not-leak') === false);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
    __waxonedgeTestHooks.resetWaxonedgeLiveIndexerProbeCache();
  }
}
{
  const probeWithPayload = (payload) => __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
  }, async () => new Response(JSON.stringify({
    service: 'waxonedge-live-indexer',
    status: 'not_connected',
    ...payload,
  }), { status: 200 }));
  const missingFakeFlag = await probeWithPayload({
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  });
  const missingBrowserFlag = await probeWithPayload({
    uses_fake_live_data: false,
    emits_fake_token_updates: false,
  });
  const missingTokenFlag = await probeWithPayload({
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
  });
  const stringFalse = await probeWithPayload({
    uses_fake_live_data: 'false',
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  });
  const numericZero = await probeWithPayload({
    uses_fake_live_data: 0,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  });
  const explicitTrue = await probeWithPayload({
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: true,
  });
  ok('Worker live indexer probe requires explicit boolean false no-fake flags',
    missingFakeFlag.reachable === false &&
    missingBrowserFlag.reachable === false &&
    missingTokenFlag.reachable === false &&
    stringFalse.reachable === false &&
    numericZero.reachable === false &&
    explicitTrue.reachable === false &&
    [missingFakeFlag, missingBrowserFlag, missingTokenFlag, stringFalse, numericZero, explicitTrue]
      .every((probe) => probe.status === 'probe_failed' && /identity/.test(probe.last_error || '')));
}
{
  const wrongService = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
  }, async () => new Response(JSON.stringify({
    service: 'other-service',
    uses_fake_live_data: false,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  }), { status: 200 }));
  const fakeData = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
  }, async () => new Response(JSON.stringify({
    service: 'waxonedge-live-indexer',
    uses_fake_live_data: true,
    browser_hyperion_fetch: false,
    emits_fake_token_updates: false,
  }), { status: 200 }));
  const browserHyperion = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
  }, async () => new Response(JSON.stringify({
    service: 'waxonedge-live-indexer',
    uses_fake_live_data: false,
    browser_hyperion_fetch: true,
    emits_fake_token_updates: false,
  }), { status: 200 }));
  ok('Worker live indexer probe rejects wrong identity, fake data, and browser Hyperion fetching',
    wrongService.reachable === false &&
    wrongService.status === 'probe_failed' &&
    /identity/.test(wrongService.last_error || '') &&
    fakeData.reachable === false &&
    fakeData.status === 'probe_failed' &&
    fakeData.uses_fake_live_data === true &&
    browserHyperion.reachable === false &&
    browserHyperion.status === 'probe_failed' &&
    browserHyperion.browser_hyperion_fetch === true);
}
{
  const failure = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
  }, async () => {
    throw new Error('fetch failed');
  });
  const invalidJson = await __waxonedgeTestHooks.probeWaxonedgeLiveIndexer({
    WAXONEDGE_LIVE_INDEXER_URL: 'https://live-indexer.example.internal',
  }, async () => new Response('not-json', { status: 200 }));
  ok('Worker live indexer probe reports safe probe_failed diagnostics for fetch and payload failures',
    failure.configured === true &&
    failure.reachable === false &&
    failure.status === 'probe_failed' &&
    failure.last_error === 'fetch failed' &&
    invalidJson.configured === true &&
    invalidJson.reachable === false &&
    invalidJson.status === 'probe_failed' &&
    /invalid JSON/.test(invalidJson.last_error || ''));
}
{
  const streamResponse = await __waxonedgeTestHooks.handleLiveStream({}, {});
  const streamBody = await streamResponse.json();
  ok('Worker live stream falls back honestly when VPS stream is not configured',
    streamResponse.status === 503 &&
    streamBody.ok === false &&
    streamBody.unavailable === 'live stream requires configured WAXONEDGE_LIVE_INDEXER_URL' &&
    streamBody.fallback === '/api/waxonedge/live' &&
    streamBody.live_indexer.vps_indexer_url_configured === false &&
    streamBody.live_indexer.proxy_enabled === false &&
    streamBody.uses_fake_live_data === false &&
    streamBody.browser_hyperion_fetch === false);
}
ok('route exposes token detail family', route.includes('const tokenMatch = path.match'));
ok('route exposes token debug diagnostics without raw wallet/swap actions',
  route.includes("child === 'debug'") &&
  route.includes('function getTokenDebug') &&
  route.includes('function diagnoseTokenAggregate') &&
  !route.includes('/swapRoutes'));

ok('route syncs Alcor public API sources',
  route.includes('/tokens') && route.includes('/pairs') && route.includes('/tickers') && route.includes('/analytics/global'));
ok('route declares all core WAX DEX adapters',
  route.includes('CORE_DEX_ADAPTERS') &&
  ['swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box'].every((source) => route.includes(source)));
ok('route maps core adapters to public WaxOnEdge reference source labels and DEX codes',
  route.includes("referenceSource: 'alcorv2'") &&
  route.includes("dexCode: 'a2'") &&
  route.includes("poolType: 'poolsv3'") &&
  route.includes("referenceSource: 'taco'") &&
  route.includes("dexCode: 't'") &&
  route.includes("referenceSource: 'neftyblocks'") &&
  route.includes("dexCode: 'n'") &&
  route.includes("referenceSource: 'defibox'") &&
  route.includes("dexCode: 'd'"));
ok('route uses public WaxOnEdge table and reserve mappings for core adapters',
  route.includes("table: 'pools'") &&
  route.includes("normalizer: 'tokenA-tokenB'") &&
  route.includes("table: 'pairs'") &&
  route.includes("normalizer: 'pool1-pool2'") &&
  route.includes("normalizer: 'reserve0-reserve1'") &&
  route.includes("normalizer: 'box-pairs'") &&
  route.includes('row.token0?.contract') &&
  route.includes('row.reserve0'));
ok('route handles reference fee semantics and inactive Nefty rows',
  route.includes('function adapterFeeBps') &&
  route.includes('adapter.feeScale ? rawFee / adapter.feeScale : rawFee') &&
  route.includes('defaultFeeBps: 30') &&
  route.includes('function isFalseLike') &&
  route.includes('if (isFalseLike(row.active)) return null') &&
  route.includes('fee_bps: adapterFeeBps(adapter, row)'));
ok('route quote priority mirrors public WaxOnEdge pair direction list',
  route.includes('REFERENCE_QUOTE_TOKENS') &&
  ['USDT', 'WAXUSDT', 'WAXUSDC', 'WAXDAI', 'WAXBUSD', 'WAXWBTC', 'ARBTC', 'WAXRBTC', 'WAXWETH', 'WAX'].every((symbol) => route.includes("'" + symbol + "'")) &&
  route.includes('PREFERRED_QUOTES = Object.freeze') &&
  route.includes('REFERENCE_QUOTE_TOKENS.map'));
ok('route performs ABI-first table detection for core adapters',
  route.includes('async function getAbiTableNames') &&
  route.includes('/v1/chain/get_abi') &&
  route.includes('detected_tables') &&
  route.includes('if (!tables.includes(adapter.table))'));
ok('route normalizes core DEX pool rows before analytics',
  route.includes('function normalizeCoreDexPair') &&
  route.includes('syncCoreDexAdapters') &&
  route.includes('aggregateTokenAnalytics') &&
  route.includes('MIN_TRUSTED_WAX_LIQUIDITY'));
ok('bootstrap exposes core adapter statuses and token aggregate count',
  route.includes('token_aggregate_count') &&
  route.includes("const key = adapter.source.replaceAll('.', '_')") &&
  route.includes('coreSources[`${key}_${adapter.table}`]'));
ok('scheduled sync indexes core adapters, not only Alcor',
  route.includes('syncCoreDexAdapters(env, syncCycleId)') &&
  route.includes("syncAlcorMarketData(env, 'alcor_five_minute_market_data', syncCycleId)"));
ok('aggregate migration adds real indexed metric columns as TEXT',
  ['liquidity_wax TEXT', 'liquidity_usd TEXT', 'tvl_wax TEXT', 'tvl_usd TEXT', 'selected_price_wax TEXT', 'selected_price_usd TEXT', 'selected_pair_source TEXT'].every((column) => aggregateMigration.includes(column)) &&
  !hasRealColumn(aggregateMigration));
ok('source coverage migration adds canonical aggregate coverage columns',
  ['volume_24h_wax TEXT', 'volume_24h_usd TEXT', 'change_24h TEXT', 'source_count INTEGER', 'indexed_pair_count INTEGER', 'source_keys TEXT', 'aggregate_complete INTEGER', 'aggregate_sources_required TEXT', 'aggregate_sources_present TEXT', 'aggregate_sources_processed TEXT', 'aggregate_sources_failed TEXT', 'aggregate_truncated INTEGER', 'aggregate_sources_truncated TEXT'].every((column) => sourceCoverageMigration.includes(column)));
ok('pair storage is not capped to a 250-row global sample',
  !route.includes('MAX_SYNC_ROWS') &&
  !route.includes('.slice(0, MAX_SYNC_ROWS)') &&
  route.includes('MAX_CHAIN_TABLE_PAGES') &&
  route.includes('lower_bound') &&
  route.includes('data?.next_key') &&
  route.includes('truncated'));
ok('aggregateTokenAnalytics is canonical across configured WAX DEX sources',
  route.includes('WAXONEDGE_AGGREGATE_SOURCES') &&
  ['alcor', 'swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box'].every((source) => route.includes("'" + source + "'")) &&
  route.includes('source_count') &&
  route.includes('indexed_pair_count') &&
  route.includes('volume_24h_wax') &&
  route.includes('aggregate_sources_processed') &&
  route.includes('aggregate_sources_failed') &&
  route.includes('aggregate_truncated') &&
  route.includes('aggregate_sources_truncated'));
ok('backend normalizes pair volume before aggregating token WAX volume',
  route.includes('volume_24h_wax') &&
  route.includes('function normalizeTokenAVolume') &&
  route.includes('volume24Raw * priceA.priceWax') &&
  route.includes('volumeWax = volume24Raw;') &&
  route.includes('volumeWax = volume24Raw * price;') &&
  route.includes('const volume24Wax = asNumber(pair.volume_24h_wax);') &&
  route.includes('volume_24h_wax = excluded.volume_24h_wax') &&
  !route.includes('agg.volume24 += volume24;'));
ok('backend persists aggregate 24h change without deriving it from selected-pair proof',
  route.includes('change_24h = excluded.change_24h') &&
  route.includes('metrics.change_24h = safeDecimal(metrics.change_24h)') &&
  route.includes('metrics.price_change_24h = metrics.change_24h') &&
  !route.includes('change24: asNumber(pair.change_24h)') &&
  route.includes('SELECT holder_count, circulating_supply, volume_24h, volume_24h_wax, volume_24h_usd') &&
  route.includes('change_24h, selected_pair_source'));
ok('aggregate completeness is source-run completeness, separate from token source coverage',
  route.includes('async function getAggregateRunStatus') &&
  route.includes('FROM waxonedge_source_index_state') &&
  route.includes('sameCycle') &&
  route.includes('runStatus.complete ? 1 : 0') &&
  route.includes('detailStats.source_keys') &&
  !route.includes('missingSources.length === 0 ? 1 : 0'));
ok('partial source pagination marks aggregate incomplete without hard failure',
  route.includes('truncated: /truncated/i.test') &&
  route.includes("status = complete ? 'success' : 'partial'") &&
  route.includes("await recordSyncRun(env.DB, adapter.source, 'partial'") &&
  route.includes('runStatus.truncated ? 1 : 0') &&
  route.includes('runStatus.truncatedSources.join'));
ok('large source snapshot safety avoids overlarge D1 raw row blobs',
  route.includes('LARGE_SNAPSHOT_SOURCES') &&
  route.includes('Refusing oversized raw DEX snapshot') &&
  route.includes('async function writeCompactDexSnapshot') &&
  route.includes('compact: true') &&
  !/writeSnapshot\(env\.DB, `\$\{adapter\.source\}_\$\{adapter\.table\}`,[\s\S]*rows,/.test(route));
ok('source cursor checkpointing processes large adapters in bounded pages',
  route.includes('CORE_DEX_PAGES_PER_INVOCATION') &&
  route.includes('CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE') &&
  route.includes('async function readSourceIndexState') &&
  route.includes('async function upsertSourceIndexState') &&
  route.includes('lowerBound: state.cursor ||') &&
  route.includes('cursor: complete ?') &&
  route.includes("status = complete ? 'success' : 'partial'") &&
  route.includes('let activeCycleId = syncCycleId ||') &&
  route.includes('sync_cycle_id: activeCycleId') &&
  !route.includes('async function markSourceComplete'));
ok('source cursor progresses across bounded Worker runs',
  route.includes('requestBudget: options.requestBudget || coreDexRpcBudgetPerSource(env)') &&
  route.includes('request_count: tableResult.request_count') &&
  route.includes('Resuming stale running state from saved cursor') &&
  route.includes('Partial source sync checkpoint saved after') &&
  route.includes("cursor: complete ? '' : savedCursor") &&
  route.includes('previous_cursor') &&
  route.includes('current_cursor') &&
  route.includes('cursor_changed_at') &&
  route.includes('chunks_completed'));
ok('stale partial swap.taco resumes from saved cursor without wiping rows',
  route.includes("referenceSource: 'taco'") &&
  route.includes('lowerBound: state.cursor ||') &&
  route.includes('const previousCursor = state.cursor ||') &&
  route.includes("cursor: complete ? '' : savedCursor") &&
  route.includes('const isNewCycle = !state || state.sync_cycle_id !== activeCycleId || state.status === \'failed\''));
ok('repeated stuck Taco cursor is detected and safely skipped by one numeric cursor',
  route.includes('const STUCK_CURSOR_RETRY_LIMIT = 3') &&
  route.includes('function incrementNumericCursor(cursor)') &&
  route.includes('BigInt(text) + 1n') &&
  route.includes('const sameSnapshotCycle = previousSnapshot.data?.sync_cycle_id === activeCycleId') &&
  route.includes('retryCount >= STUCK_CURSOR_RETRY_LIMIT') &&
  route.includes('savedCursor = advancedCursor') &&
  route.includes('skipped_cursor_count') &&
  route.includes('skipped_cursor_reason') &&
  route.includes('stuck_cursor: ${adapter.source} cursor ${reportedCursor} repeated ${retryCount} time(s); next cron will resume at ${advancedCursor}'));
ok('skipped cursor diagnostics clear when cursor advances or sync cycle changes',
  route.includes('const sameSnapshotCycle = previousSnapshot.data?.sync_cycle_id === activeCycleId') &&
  route.includes('const previousRetryCount = sameSnapshotCycle ?') &&
  route.includes('const previousSkippedCursorCount = sameSnapshotCycle && !cursorChanged') &&
  route.includes('let skippedCursorReason = null') &&
  !route.includes('let skippedCursorReason = previousSnapshot.data?.skipped_cursor_reason || null'));
ok('skipped cursor count resets when progress resumes',
  route.includes('const previousSkippedCursorCount = sameSnapshotCycle && !cursorChanged') &&
  route.includes('? (asNumber(previousSnapshot.data?.skipped_cursor_count) || 0)') &&
  route.includes(': 0') &&
  route.includes('const effectiveCursorChanged = previousCursor !== savedCursor'));
ok('swap.alcor and swap.taco cursor progress is visible in health',
  route.includes('source_progress') &&
  route.includes('previous_cursor: previousCursor') &&
  route.includes('current_cursor: cursor') &&
  route.includes('stuck_for_minutes') &&
  route.includes('const stuckForMinutes = Number.isFinite(measuredStuckForMinutes) ? measuredStuckForMinutes : 0') &&
  route.includes('retry_count: retryCount') &&
  route.includes('skipped_cursor_count: skippedCursorCount') &&
  route.includes('skipped_cursor_reason: skippedCursorReason') &&
  route.includes("nextAction = asNumber(row.complete) === 1") &&
  route.includes('next_action: nextAction') &&
  route.includes('resume from saved cursor or reset stuck source'));
ok('missing cursorChangedAt returns numeric zero stuck minutes',
  route.includes('const measuredStuckForMinutes =') &&
  route.includes('minutesSince(cursorChangedAt)') &&
  route.includes('Number.isFinite(measuredStuckForMinutes) ? measuredStuckForMinutes : 0') &&
  !route.includes('stuck_for_minutes: minutesSince(cursorChangedAt)'));
ok('chunks_completed zero remains zero',
  route.includes('chunks_completed: asNumber(snapshot.data?.chunks_completed) ?? asNumber(row.page_count) ?? 0') &&
  !route.includes('chunks_completed: asNumber(snapshot.data?.chunks_completed) || asNumber(row.page_count) || 0'));
ok('source pagination can index tokens beyond the first source page',
  route.includes('lower_bound: lowerBound') &&
  route.includes('data?.next_key') &&
  route.includes('maxPages: options.maxPages || coreDexPagesPerInvocation(env)') &&
  route.includes('cursor: complete ?') &&
  route.includes('row_count: nextRowCount') &&
  !route.includes('first 250'));
ok('aggregate gating requires same-cycle complete source states',
  route.includes('FROM waxonedge_source_index_state') &&
  route.includes('sameCycle') &&
  route.includes('row.sync_cycle_id === syncCycleId') &&
  route.includes('complete: sameCycle && failed.length === 0 && partialSources.length === 0 && truncatedSources.length === 0') &&
  route.includes("await upsertSourceIndexState(env.DB, 'token_aggregates'"));
ok('token aggregates can record partial_success after partial source sync',
  route.includes("partialSources.push(source)") &&
  route.includes('partialSuccess: processed.length > 0') &&
  route.includes("const aggregateStatus = runStatus.complete ? 'success' : (aggregates.size > 0 ? 'partial_success' : 'failed')") &&
  route.includes('sourceErrorSummary') &&
  route.includes("await recordSyncRun(env.DB, 'token_aggregates', aggregateStatus") &&
  route.includes("status: aggregateStatus"));
ok('aggregate rebuild becomes partial_success when usable rows exist despite source errors',
  route.includes('sourceErrorSummary: failed.length ?') &&
  route.includes("Aggregate failed: no usable source rows or D1 write failed") &&
  route.includes("aggregates.size > 0 ? 'partial_success' : 'failed'") &&
  !route.includes('one or more configured sources had true errors'));
ok('partial_success aggregate after latest pair sync can count as fresh',
  route.includes("status IN ('success', 'partial_success')") &&
  route.includes("status IN ('success', 'partial')") &&
  route.includes('fresh_after_latest_pair_sync: aggregateFresh') &&
  route.includes('tasks.push(aggregateTokenAnalytics(env))') &&
  route.includes('const needsAggregateRefresh = await aggregateNeedsRefreshAfterPairSync(env.DB)'));
ok('aggregate rebuild runs after latest pair sync if freshness drifts',
  route.includes('async function aggregateNeedsRefreshAfterPairSync') &&
  route.includes('latestAggregateRunRow(db)') &&
  route.includes('latestPairSyncRunRow(db)') &&
  route.includes('latestPairSourceStateUpdateRow(db)') &&
  route.includes('parseTimestampMillis(pairSync?.finished_at)') &&
  route.includes('parseTimestampMillis(sourceState?.finished_at)') &&
  route.includes('if (!pairSyncFinishedAt) return false') &&
  route.includes('if (aggregateFinishedAt == null) return true') &&
  route.includes('return aggregateFinishedAt < pairSyncFinishedAt') &&
  route.includes('const needsAggregateRefresh = await aggregateNeedsRefreshAfterPairSync(env.DB)') &&
  route.includes('postSyncAggregate = await maybeRefreshAggregateAfterSourceSync(env') &&
  route.includes('post_sync_aggregate: postSyncAggregate'));
ok('aggregate refresh timestamp parsing covers invalid and ordered timestamp cases',
  route.includes('function parseTimestampMillis(value)') &&
  route.includes('if (!pairSyncFinishedAt) return false') &&
  route.includes('if (aggregateFinishedAt == null) return true') &&
  route.includes('return aggregateFinishedAt < pairSyncFinishedAt') &&
  !route.includes('return Date.parse(aggregate.finished_at) < Date.parse(pairSync.finished_at)'));
ok('aggregate refresh is triggered after source cursor state advances',
  route.includes('async function latestPairSourceStateUpdateRow(db)') &&
  route.includes('FROM waxonedge_source_index_state') &&
  route.includes("status IN ('success', 'partial', 'running')") &&
  route.includes('latestPairSourceStateUpdateRow(db)') &&
  ['alcor', 'swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box', 'swap.adex', 'dapp.fusion']
    .every((source) => route.includes(`'${source}'`)));
ok('aggregate refresh is not triggered when no source state changed',
  route.includes('if (!pairSyncFinishedAt) return false') &&
  route.includes('if (!needsAggregateRefresh)') &&
  route.includes('if (!freeSafeMode)') &&
  route.includes('aggregate_refresh_pending: false') &&
  route.includes('aggregate_refresh_deferred_budget: false'));
ok('stale aggregate health exposes pending and budget-deferred status',
  route.includes('aggregate_refresh_pending: aggregateRefreshPending') &&
  route.includes('aggregate_refresh_deferred_budget: aggregateRefreshPending && aggregateSnapshot.data?.aggregate_refresh_deferred_budget === true') &&
  route.includes('source_sync_in_progress: sourceSyncInProgress') &&
  route.includes('aggregate_fresh_after_latest_pair_sync: aggregateFresh'));
ok('budget-deferred aggregate refresh does not mark aggregate successful',
  route.includes('async function recordAggregateRefreshDeferred') &&
  route.includes("recordSyncRun(db, 'token_aggregates', 'skipped'") &&
  !route.includes("recordSyncRun(db, 'token_aggregates', 'success', startedAt, reason)") &&
  route.includes('deferForBudget') &&
  route.includes('maybeRefreshAggregateAfterSourceSync(env'));
ok('free-safe post-source aggregate refresh records skipped budget deferral',
  route.includes('const freeSafeMode = waxonedgeFreeSafeMode(env)') &&
  route.includes('if (freeSafeMode || options.deferForBudget)') &&
  route.includes("return recordAggregateRefreshDeferred(env.DB, options.reason || 'Aggregate refresh deferred after source sync to avoid Worker budget pressure')") &&
  route.includes('aggregate_refresh_pending: true') &&
  route.includes('aggregate_refresh_deferred_budget: true'));
ok('non-free-safe mode can run post-source aggregate refresh when stale',
  route.includes('if (freeSafeMode || options.deferForBudget)') &&
  route.includes('const aggregates = await aggregateTokenAnalytics(env)') &&
  route.includes('refreshed_after_source_sync: true') &&
  route.includes('status: aggregates.status'));
ok('bootstrap compact source metadata does not mark missing snapshots complete',
  route.includes('row_count: tableSnapshot.data?.row_count || (Array.isArray(tableSnapshot.data?.rows) ? tableSnapshot.data.rows.length : 0)') &&
  route.includes('complete: !!tableSnapshot.data && (tableSnapshot.data?.truncated ? false : !tableSnapshot.data?.cursor)'));
ok('regression guard for live source-sync failures',
  route.includes('writeCompactDexSnapshot(env.DB, adapter') &&
  route.includes('syncCycleId') &&
  route.includes('Partial source sync checkpoint saved') &&
  route.includes('isSubrequestBudgetError'));
ok('free-safe cron only runs one heavy WaxOnEdge workload per invocation',
  route.includes('const freeSafeMode = waxonedgeFreeSafeMode(env)') &&
  route.includes('if (isMinuteCron && freeSafeMode)') &&
  route.includes('const rotationSlot = minute % 5') &&
  route.includes('tasks.push(syncAlcorMarketData(env, \'alcor_minute_market_data\'))') &&
  route.includes('tasks.push(aggregateTokenAnalytics(env))') &&
  route.includes('tasks.push(planWaxOnEdgeCandleBackfill(env))') &&
  route.includes('tasks.push(syncSupplyInputs(env))') &&
  route.includes('selectCoreDexAdapterForCron(minute)') &&
  route.includes('!freeSafeMode && (!cron || cron === \'*/15 * * * *\'') &&
  route.includes('const deferForBudget = freeSafeMode ||') &&
  route.includes('const sourceWorkRan = results.some') &&
  route.includes('postSyncAggregate = await maybeRefreshAggregateAfterSourceSync(env'));
ok('free-safe source sync runs one DEX source chunk with conservative budgets',
  route.includes('WAXONEDGE_FREE_SAFE_MODE_DEFAULT = true') &&
  route.includes('FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION = 1') &&
  route.includes('FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE = 1') &&
  route.includes('source: adapter.source') &&
  route.includes('maxPages: FREE_SAFE_CORE_DEX_PAGES_PER_INVOCATION') &&
  route.includes('requestBudget: FREE_SAFE_CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE'));
ok('free-safe mode does not permanently prevent supply sync',
  route.includes('const rotationSlot = minute % 5') &&
  route.includes('} else {') &&
  route.includes('tasks.push(syncSupplyInputs(env))') &&
  route.includes('!freeSafeMode && (!cron || cron === \'*/15 * * * *\'') &&
  route.indexOf('tasks.push(syncSupplyInputs(env))') > route.indexOf('tasks.push(planWaxOnEdgeCandleBackfill(env))'));
ok('free-safe supply sync runs as isolated cron workload',
  route.includes('if (isMinuteCron && freeSafeMode)') &&
  route.includes('tasks.push(syncAlcorMarketData(env, \'alcor_minute_market_data\'))') &&
  route.includes('tasks.push(aggregateTokenAnalytics(env))') &&
  route.includes('tasks.push(planWaxOnEdgeCandleBackfill(env))') &&
  route.includes('tasks.push(syncSupplyInputs(env))') &&
  !route.includes('tasks.push(planWaxOnEdgeCandleBackfill(env));\n      tasks.push(syncSupplyInputs(env))'));
ok('supply sync rotates across indexed pair tokens with a nonzero bounded limit',
  route.includes('function supplySyncLimit(env)') &&
  route.includes('return Math.max(1, Math.min(250, Math.floor(configured)))') &&
  route.includes('return waxonedgeFreeSafeMode(env) ? FREE_SAFE_SUPPLY_SYNC_LIMIT : DEFAULT_SUPPLY_SYNC_LIMIT') &&
  route.includes('const state = await readSourceIndexState(env.DB, SUPPLY_SYNC_SOURCE)') &&
  route.includes('WHERE COALESCE(s.indexed_pair_count, t.pair_count, 0) > 0') &&
  route.includes('ORDER BY token_key ASC') &&
  route.includes('LIMIT ?'));
ok('supply sync cursor SQL uses the same single-quoted token key expression',
  route.includes('const tokenKeyExpression = "(t.contract || \'::\' || t.symbol)"') &&
  route.includes('const cursorFilter = afterCursor ? "AND (t.contract || \'::\' || t.symbol) > ?" : \'\'') &&
  route.includes('SELECT t.contract, t.symbol, ${tokenKeyExpression} AS token_key') &&
  !route.includes('|| "::" ||'));
ok('supply sync reports honest bounded rotation status',
  route.includes('addTarget(waxcashSupplyTarget())') &&
  route.includes('const rotatingRows = (rows.results || []).slice(0, limit)') &&
  route.includes('const complete = totalSupplyTargets > 0 && totalPairTokens <= limit && rotatingRows.length >= totalPairTokens && failed === 0 ? 1 : 0') &&
  route.includes('const truncated = complete ? 0 : (totalPairTokens > limit && rotatingRows.length >= limit ? 1 : 0)') &&
  route.includes("(complete === 1 ? 'success' : (updated > 0 ? 'partial' : 'failed'))") &&
  route.includes('waxcashSupplyError || (failed > 0 ? `${failed} supply target(s) failed` : null)') &&
  route.includes('waxcash_target_included: seenTargets.has(WAXCASH_TOKEN_REF.token_key)') &&
  route.includes('waxcash_error: waxcashSupplyError') &&
  route.includes('await upsertSourceIndexState(env.DB, SUPPLY_SYNC_SOURCE'));
ok('scheduled full index can still run legacy combined workflow when free-safe is disabled',
  route.includes('} else if (shouldRunFullIndex) {') &&
  route.includes('const [alcor, core, nefty, pinned] = await Promise.all') &&
  route.lastIndexOf('const aggregates = await aggregateTokenAnalytics(env);') > route.indexOf('const [alcor, core, nefty, pinned] = await Promise.all'));
ok('aggregate backfill can run as a focused cron/admin pathway',
  route.includes('export async function runWaxOnEdgeAggregateBackfill') &&
  route.includes("cron === 'waxonedge-backfill'") &&
  route.includes('const aggregates = await aggregateTokenAnalytics(env);') &&
  route.includes('backfill: true'));
ok('candle backfill has honest planned status without fake candle inserts',
  route.includes('CANDLE_BACKFILL_SOURCE') &&
  route.includes('export async function runWaxOnEdgeCandleBackfillPlan') &&
  route.includes("cron === 'waxonedge-candle-backfill'") &&
  route.includes('candidate_pair_count') &&
  route.includes('no_fake_candles: true') &&
  route.includes('CANDLE_BACKFILL_PLAN') &&
  route.includes('buildInternalDailyCandlesForPair') &&
  route.includes('buildDailyCandlesFromTradeRows') &&
  route.includes('writeChartCandles') &&
  route.includes('INSERT INTO waxonedge_chart_candles') &&
  !route.includes('synthesized candle') &&
  !route.includes('fallback candle'));
ok('candle backfill writes only real internal 1D candles in bounded chunks',
  route.includes('SELECT source, trade_id, pair_id, contract, symbol, side, price, amount, volume, tx_id, traded_at, raw_json') &&
  route.includes('FROM waxonedge_trades') &&
  route.includes('DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT = 24') &&
  route.includes('FREE_SAFE_CANDLE_BACKFILL_PAIR_LIMIT = 2') &&
  route.includes('candleBackfillPairLimit(env)') &&
  route.includes('CANDLE_BACKFILL_LOOKBACK_DAYS') &&
  route.includes('CANDLE_BACKFILL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000') &&
  route.includes('buildInternalDailyCandlesForPair(env.DB, pair)') &&
  route.includes("writeChartCandles(db, source, pairId, '1D', candles)") &&
  !route.includes('const to = Date.now()') &&
  !route.includes('/markets/${encodeURIComponent(pair.pair_id)}/charts?resolution=1D') &&
  route.includes('cursor: complete ?') &&
  route.includes('candles_written'));
ok('candle_backfill cron actually attempts candidate pairs',
  route.includes("cron === 'waxonedge-candle-backfill'") &&
  route.includes('const candleBackfill = await planWaxOnEdgeCandleBackfill(env);') &&
  route.includes('const candidateRows = candidates.results || []') &&
  route.includes('let attemptedPairCount = 0') &&
  route.includes('for (const pair of candidateRows)') &&
  route.includes('attempted_pair_count: totalAttemptedPairCount'));
ok('candle_backfill does not remain planned forever after scheduled run',
  route.includes("const status = budgetExhausted") &&
  route.includes("'budget_limited'") &&
  route.includes("attemptedPairCount > 0 ? 'partial'") &&
  route.includes("status === 'planned' ? CANDLE_BACKFILL_PLAN : null") &&
  route.includes("const candleBackfill = await planWaxOnEdgeCandleBackfill(env);"));
ok('candle backfill waits for indexed trade rows without fake attempted progress',
  route.includes('const candleTradeSources = indexedCandleTradeSources()') &&
  route.includes('const candlePairSourceNames = [...new Set(candleTradeSources.flatMap(candleTradeSourceNamesFor))]') &&
  route.includes('FROM waxonedge_trades') &&
  route.includes('WHERE source IN') &&
  route.includes('const tradeLookbackCutoffIso = candleBackfillLookbackCutoffIso()') &&
  route.includes('AND traded_at >= ?') &&
  !route.includes("SELECT COUNT(*) AS count FROM waxonedge_trades WHERE source = 'alcor'") &&
  route.includes('if (!indexedAlcorTradeRow)') &&
  route.includes("status: 'skipped'") &&
  route.includes("const error = 'waiting for indexed trade rows'") &&
  route.includes('attempted_pair_count: asNumber(previousData.attempted_pair_count) || 0') &&
  route.includes('processed_pair_count: asNumber(previousData.processed_pair_count) || 0') &&
  route.includes('cursor: state?.cursor ||') &&
  route.includes('return { ok: true, ...snapshot, indexed_1d_candle_count: existingCandleCount }'));
ok('candle backfill reports remaining candidate-pair trade gaps after candles are written',
  route.includes("lastError = 'waiting for indexed trade rows for remaining candidate pairs'") &&
  route.includes('const diagnosticLastError = candlesWritten > 0 && (tradeRowsNotIndexedCount > 0 || swapRowsNotIndexedCount > 0)') &&
  route.includes("? 'waiting for indexed trade rows for remaining candidate pairs'") &&
  route.includes('last_error: diagnosticLastError') &&
  route.includes('const error = diagnosticLastError ||'));
ok('internal candle builder replaces external Alcor chart URL dependency',
  route.includes('function buildInternalDailyCandlesForPair') &&
  route.includes("const mismatch = hasSourceRows && source !== 'alcor'") &&
  route.includes("reason: 'candles_built_from_trade_rows'") &&
  route.includes('external_chart_endpoint_unsupported') &&
  !route.includes('/markets/${encodeURIComponent(pair.pair_id)}/charts?resolution=1D'));
ok('candle candidate source aliases normalize correctly',
  __waxonedgeTestHooks.moonboysCandleSource('alcormarket') === 'alcor' &&
  __waxonedgeTestHooks.moonboysCandleSource('alcorv2') === 'swap.alcor' &&
  __waxonedgeTestHooks.moonboysCandleSource('defibox') === 'swap.box' &&
  __waxonedgeTestHooks.moonboysCandleSource('neftyblocks') === 'swap.nefty' &&
  __waxonedgeTestHooks.moonboysCandleSource('taco') === 'swap.taco');
ok('candle alias matching is source-specific',
  __waxonedgeTestHooks.candleTradeSourceNamesFor('alcor').includes('alcormarket') &&
  !__waxonedgeTestHooks.candleTradeSourceNamesFor('alcor').includes('alcorv2') &&
  __waxonedgeTestHooks.candleTradeSourceNamesFor('swap.alcor').includes('alcorv2') &&
  !__waxonedgeTestHooks.candleTradeSourceNamesFor('swap.alcor').includes('alcormarket'));
ok('candle backfill readiness uses same lookback cutoff as per-pair trade loading',
  route.includes('function candleBackfillLookbackCutoffIso') &&
  route.includes('const startIso = candleBackfillLookbackCutoffIso()') &&
  route.includes('const tradeLookbackCutoffIso = candleBackfillLookbackCutoffIso()') &&
  route.includes(').bind(...candlePairSourceNames, tradeLookbackCutoffIso)') &&
  !route.includes('SELECT 1 FROM waxonedge_trades WHERE source IN (${candleTradeSourcePlaceholders}) LIMIT 1'));
ok('old source trade rows do not create pair mismatch diagnostics',
  route.includes('async function indexedTradeRowsExistForSource') &&
  route.match(/async function indexedTradeRowsExistForSource[\s\S]*AND traded_at >= \?[\s\S]*LIMIT 1/) &&
  route.includes("const mismatch = hasSourceRows && source !== 'alcor'"));
ok('AMM pair-id mismatch diagnostics include compact examples',
  route.includes('const hasSourceRows = await indexedTradeRowsExistForSource(db, source)') &&
  route.includes("const mismatch = hasSourceRows && source !== 'alcor'") &&
  route.includes("source === 'alcor' ? 'trade_rows_not_indexed' : 'swap_rows_not_indexed'") &&
  route.includes('pair_id_mismatch_count_by_source') &&
  route.includes('pair_id_mismatch_examples_by_source') &&
  route.includes('function indexedTradePairIdExampleForSource') &&
  route.includes("reason: 'recent trade rows exist for source but not for candidate pair_id'") &&
  !route.includes('swap_alcor_pair_id_mapping_unverified') &&
  !route.includes('pair_id_mapping_unverified_by_source'));
{
  const oldA = { source: 'swap.alcor', candidate_pair_id: 'old-a', observed_trade_pair_id: 'trade-a', reason: 'pair_id_mismatch' };
  const oldB = { source: 'swap.alcor', candidate_pair_id: 'old-b', observed_trade_pair_id: 'trade-b', reason: 'pair_id_mismatch' };
  const oldC = { source: 'swap.alcor', candidate_pair_id: 'old-c', observed_trade_pair_id: 'trade-c', reason: 'pair_id_mismatch' };
  const fresh = { source: 'swap.alcor', candidate_pair_id: 'fresh', observed_trade_pair_id: 'trade-fresh', reason: 'pair_id_mismatch' };
  const merged = __waxonedgeTestHooks.mergeSourceExamples(
    { 'swap.alcor': [oldA, oldB, oldC] },
    { 'swap.alcor': [fresh] },
    3
  );
  ok('current pair-id mismatch examples replace stale full previous list',
    merged['swap.alcor'].length === 3 &&
    merged['swap.alcor'][0] === fresh &&
    merged['swap.alcor'].includes(oldA) &&
    merged['swap.alcor'].includes(oldB) &&
    !merged['swap.alcor'].includes(oldC));
}
{
  const currentA = { source: 'swap.taco', candidate_pair_id: 'current-a', observed_trade_pair_id: 'trade-a', reason: 'pair_id_mismatch' };
  const currentB = { source: 'swap.taco', candidate_pair_id: 'current-b', observed_trade_pair_id: 'trade-b', reason: 'pair_id_mismatch' };
  const previousA = { source: 'swap.taco', candidate_pair_id: 'previous-a', observed_trade_pair_id: 'trade-c', reason: 'pair_id_mismatch' };
  const previousB = { source: 'swap.taco', candidate_pair_id: 'previous-b', observed_trade_pair_id: 'trade-d', reason: 'pair_id_mismatch' };
  const previousC = { source: 'swap.taco', candidate_pair_id: 'previous-c', observed_trade_pair_id: 'trade-e', reason: 'pair_id_mismatch' };
  const merged = __waxonedgeTestHooks.mergeSourceExamples(
    { 'swap.taco': [previousA, previousB, previousC] },
    { 'swap.taco': [currentA, currentB] },
    3
  );
  ok('current pair-id mismatch examples fill first then previous examples fill remaining slots',
    merged['swap.taco'].length === 3 &&
    merged['swap.taco'][0] === currentA &&
    merged['swap.taco'][1] === currentB &&
    merged['swap.taco'][2] === previousA);
}
{
  const duplicateCurrent = { source: 'swap.box', candidate_pair_id: '42', observed_trade_pair_id: '0042', reason: 'pair_id_mismatch' };
  const duplicatePrevious = { source: 'swap.box', candidate_pair_id: '42', observed_trade_pair_id: '0042', reason: 'pair_id_mismatch' };
  const previousOnly = { source: 'swap.box', candidate_pair_id: '43', observed_trade_pair_id: '0043', reason: 'pair_id_mismatch' };
  const merged = __waxonedgeTestHooks.mergeSourceExamples(
    { 'swap.box': [duplicatePrevious, previousOnly] },
    { 'swap.box': [duplicateCurrent] },
    3
  );
  ok('duplicate current and previous pair-id mismatch examples are not repeated',
    merged['swap.box'].length === 2 &&
    merged['swap.box'][0] === duplicateCurrent &&
    merged['swap.box'][1] === previousOnly);
}
ok('candle backfill excludes table-only sources from trade sources',
  __waxonedgeTestHooks.indexedCandleTradeSources().includes('swap.nefty') &&
  !__waxonedgeTestHooks.indexedCandleTradeSources().includes('swap.adex') &&
  !__waxonedgeTestHooks.indexedCandleTradeSources().includes('dapp.fusion') &&
  route.includes('const CANDLE_TRADE_SOURCES = Object.freeze') &&
  route.includes('const TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS = Object.freeze'));
ok('table-only unavailable sources do not inflate broken candle trade rows',
  route.includes('trade_stream_not_verified_from_og_refs: candleBackfillSnapshot.data?.trade_stream_not_verified_from_og_refs || TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS') &&
  route.includes('const candlePairSourceNames = [...new Set(candleTradeSources.flatMap(candleTradeSourceNamesFor))]') &&
  !route.includes("const candleTradeSources = ['alcor', ...AMM_TRADE_SOURCES, 'swap.adex'") &&
  !route.includes("const candleTradeSources = ['alcor', ...AMM_TRADE_SOURCES, 'dapp.fusion'"));
ok('candle backfill reports source-level pair matching diagnostics',
  route.includes('candle_candidate_count_by_source') &&
  route.includes('trade_rows_indexed_by_source') &&
  route.includes('candles_written_by_source') &&
  route.includes('trade_rows_not_indexed_by_source') &&
  route.includes('pair_id_mismatch_count_by_source') &&
  route.includes('source_alias_normalized_count'));
ok('candle URL example prefers a real indexed candle when possible',
  route.includes('FROM waxonedge_chart_candles') &&
  route.includes("WHERE interval = '1D'") &&
  route.includes('has_real_indexed_candle_example: !!chartExamplePair') &&
  route.includes("unavailable: chartExamplePair ? null : 'No real indexed 1D candle rows available yet.'") &&
  !route.includes("dapp.fusion' candle examples"));
ok('candle normalization preserves real zero OHLCV values',
  route.includes('item.open ?? item.o') &&
  route.includes('item.high ?? item.h') &&
  route.includes('item.low ?? item.l') &&
  route.includes('item.close ?? item.c') &&
  route.includes('item.volume ?? item.v') &&
  route.includes('bar.open ?? bar.o') &&
  route.includes('bar.high ?? bar.h') &&
  route.includes('bar.low ?? bar.l') &&
  route.includes('bar.close ?? bar.c') &&
  route.includes('bar.volume ?? bar.v') &&
  route.includes('data.o?.[i]') &&
  !route.includes('item.volume || item.v') &&
  !route.includes('bar.volume || bar.v'));
ok('candle normalization still falls back only for nullish alternate fields',
  route.includes('item.time ?? item.t ?? item.timestamp') &&
  route.includes('item.open ?? item.o') &&
  route.includes('bar.time ?? bar.t') &&
  !route.includes('item.time || item.t || item.timestamp') &&
  !route.includes('bar.time || bar.t'));
const alcorDailyCandles = __waxonedgeTestHooks.buildDailyCandlesFromTradeRows([
  { source: 'alcormarket', pair_id: '29', traded_at: '2026-06-12T01:00:00.000Z', raw_json: JSON.stringify({ unit_price: 1000000 }), volume: '3' },
  { source: 'alcormarket', pair_id: '29', traded_at: '2026-06-12T02:00:00.000Z', raw_json: JSON.stringify({ unit_price: 2500000 }), volume: '7' },
  { source: 'alcormarket', pair_id: '29', traded_at: '2026-06-12T03:00:00.000Z', raw_json: JSON.stringify({ unit_price: 500000 }), volume: '11' },
  { source: 'alcormarket', pair_id: '29', traded_at: '2026-06-13T01:00:00.000Z', raw_json: JSON.stringify({ unit_price: 1500000 }), volume: '13' },
], { source: 'alcor' });
ok('internal 1D candle is built from mocked Alcor market match rows',
  alcorDailyCandles.length === 2 &&
  alcorDailyCandles[0].bucket_time === '2026-06-12T00:00:00.000Z' &&
  alcorDailyCandles[0].trade_count === 3);
ok('unit_price / 10^8 price conversion is used for Alcor market trades',
  __waxonedgeTestHooks.priceFromIndexedTradeRow({
    raw_json: JSON.stringify({ unit_price: 123456789 }),
  }, 'alcor') === 1.23456789);
ok('daily OHLC and volume are derived from ordered real trades',
  alcorDailyCandles[0].open === '0.01' &&
  alcorDailyCandles[0].high === '0.025' &&
  alcorDailyCandles[0].low === '0.005' &&
  alcorDailyCandles[0].close === '0.005' &&
  alcorDailyCandles[0].volume === '21');
const newestFirstDailyCandles = __waxonedgeTestHooks.buildDailyCandlesFromTradeRows([
  { source: 'alcormarket', pair_id: '29', traded_at: '2026-06-12T03:00:00.000Z', raw_json: JSON.stringify({ unit_price: 3000000 }), volume: '1' },
  { source: 'alcormarket', pair_id: '29', traded_at: '2026-06-12T01:00:00.000Z', raw_json: JSON.stringify({ unit_price: 1000000 }), volume: '1' },
  { source: 'alcormarket', pair_id: '29', traded_at: '2026-06-12T02:00:00.000Z', raw_json: JSON.stringify({ unit_price: 5000000 }), volume: '1' },
], { source: 'alcor' });
ok('trade query selects newest rows while builder sorts ascending for OHLC',
  route.includes('ORDER BY traded_at DESC') &&
  route.includes('LIMIT 5000') &&
  route.includes('.sort((a, b) => a.millis - b.millis)') &&
  !route.includes('ORDER BY traded_at ASC') &&
  newestFirstDailyCandles[0].open === '0.01' &&
  newestFirstDailyCandles[0].high === '0.05' &&
  newestFirstDailyCandles[0].low === '0.01' &&
  newestFirstDailyCandles[0].close === '0.03');
ok('no internal candle is produced without trade or swap rows',
  __waxonedgeTestHooks.buildDailyCandlesFromTradeRows([], { source: 'alcor' }).length === 0);
ok('WaxOnEdge source names map alcormarket to Moonboys alcor rows',
  __waxonedgeTestHooks.moonboysCandleSource('alcormarket') === 'alcor' &&
  __waxonedgeTestHooks.referenceCandleSource('alcor') === 'alcormarket');
const normalizedAlcorTrade = __waxonedgeTestHooks.normalizeAlcorMarketTradeRow({
  id: '12345',
  unit_price: 858589,
  ask: '12.3456 WAXCASH',
  bid: '0.1059 WAX',
  trx_id: 'abc123',
  created_at: '2026-06-13T12:34:56.000Z',
}, {
  pair_id: '29',
  token_a_contract: 'graffitiking',
  token_a_symbol: 'WAXCASH',
  token_b_contract: 'eosio.token',
  token_b_symbol: 'WAX',
});
ok('Alcor market match rows normalize into waxonedge_trades shape',
  normalizedAlcorTrade.source === 'alcor' &&
  normalizedAlcorTrade.trade_id === '29:match:12345' &&
  normalizedAlcorTrade.pair_id === '29' &&
  normalizedAlcorTrade.contract === 'graffitiking' &&
  normalizedAlcorTrade.symbol === 'WAXCASH' &&
  normalizedAlcorTrade.price === '0.00858589' &&
  normalizedAlcorTrade.volume === '0.1059' &&
  normalizedAlcorTrade.tx_id === 'abc123' &&
  normalizedAlcorTrade.traded_at === '2026-06-13T12:34:56.000Z' &&
  JSON.parse(normalizedAlcorTrade.raw_json).reference_src === 'alcormarket');
ok('Alcor trade-row indexer upserts real rows and exposes source diagnostics',
  route.includes('const ALCOR_TRADE_INDEX_SOURCE =') &&
  route.includes('async function syncAlcorMarketTradeRows') &&
  route.includes('const actionStreams = defaultAlcorTradeActionStreams()') &&
  route.includes('fetchAlcorMarketMatchStreamRows(env, actionName, rowsPerMarket, streamCursor)') &&
  route.includes('normalizeAlcorMarketTradeRow(row)') &&
  route.includes('INSERT INTO waxonedge_trades') &&
  route.includes('ON CONFLICT(source, trade_id) DO UPDATE SET') &&
  route.includes("source: 'alcor'") &&
  route.includes("reference_src: 'alcormarket'") &&
  route.includes('TRADE_HISTORY_NOT_AVAILABLE_SOURCES') &&
  route.includes('no_fake_trades: true'));
ok('route registers remaining OG WaxOnEdge table sources for aggregate coverage',
  route.includes("source: 'swap.adex'") &&
  route.includes("referenceSource: 'adex'") &&
  route.includes("contract: 'swap.adex'") &&
  route.includes("table: 'pools'") &&
  route.includes("normalizer: 'adex-pools'") &&
  route.includes("source: 'dapp.fusion'") &&
  route.includes("referenceSource: 'waxfusion'") &&
  route.includes("contract: 'dapp.fusion'") &&
  route.includes("table: 'global'") &&
  route.includes("normalizer: 'waxfusion-global'") &&
  route.includes("poolType: 'poolsSpecial'"));
ok('aggregate source list includes swap.adex and dapp.fusion without dropping existing sources',
  ['alcor', 'swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box', 'swap.adex', 'dapp.fusion']
    .every((source) => route.includes("'" + source + "'")) &&
  route.includes('swap_adex: keys.has(\'swap.adex\')') &&
  route.includes('dapp_fusion: keys.has(\'dapp.fusion\')'));
{
  const priceIndex = new Map([
    ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
  ]);
  const adapter = {
    source: 'swap.adex',
    normalizer: 'adex-pools',
  };
  const pair = __waxonedgeTestHooks.normalizeCoreDexPair(adapter, {
    id: 29,
    code: 'ADEXLP',
    base_token: { quantity: '100.00000000 WAX', contract: 'eosio.token' },
    quote_token: { quantity: '250.0000 FOO', contract: 'foo.token' },
    pool_fee: '0.2500 FEE',
    platform_fee: '0.0500 FEE',
  }, priceIndex, '2026-06-14T00:00:00.000Z');
  ok('swap.adex verified pools rows normalize without fake reserves',
    pair &&
    pair.source === 'swap.adex' &&
    pair.pair_id === '29' &&
    pair.token_a_contract === 'eosio.token' &&
    pair.token_a_symbol === 'WAX' &&
    pair.token_b_contract === 'foo.token' &&
    pair.token_b_symbol === 'FOO' &&
    pair.reserve_a === '100' &&
    pair.reserve_b === '250' &&
    pair.price === null &&
    pair.proof_status === 'unavailable' &&
    pair.reason_codes.includes('adapter_swap_action_not_verified') &&
    pair.fee_bps === '30');
  const driftFeePair = __waxonedgeTestHooks.normalizeCoreDexPair(adapter, {
    id: 31,
    base_token: { quantity: '100.00000000 WAX', contract: 'eosio.token' },
    quote_token: { quantity: '250.0000 FOO', contract: 'foo.token' },
    pool_fee: '0.2000 FEE',
    platform_fee: '0.1001 FEE',
  }, priceIndex, '2026-06-14T00:00:00.000Z');
  ok('swap.adex fee bps are rounded away from floating precision drift',
    driftFeePair &&
    driftFeePair.fee_bps === '30.01' &&
    driftFeePair.fee_bps !== '30.009999999999998' &&
    driftFeePair.fee_bps !== '30.010000000000005');
  ok('unparseable swap.adex rows are skipped instead of faked',
    __waxonedgeTestHooks.normalizeCoreDexPair(adapter, {
      id: 30,
      base_token: { quantity: '0.00000000 WAX', contract: 'eosio.token' },
      quote_token: { quantity: '250.0000 FOO', contract: 'foo.token' },
    }, priceIndex, '2026-06-14T00:00:00.000Z') === null);
}
{
  const priceIndex = new Map([
    ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
    ['foo.token::FOO', { priceWax: 0.4, priceUsd: 0.0024 }],
  ]);
  const parsedWax = __waxonedgeTestHooks.parseAsset('100.00000000 WAX');
  const parsedFoo = __waxonedgeTestHooks.parseAsset('250.0000 FOO');
  const rawWaxSide = __waxonedgeTestHooks.getTokenSideInfo({
    amount: '10000000000',
    decimals: 8,
    symbol: '8,WAX',
    contract: 'eosio.token',
  });
  const decimalWaxSide = __waxonedgeTestHooks.getTokenSideInfo({
    amount: '100.5',
    decimals: 8,
    symbol: '8,WAX',
    contract: 'eosio.token',
  });
  const zeroDecimalSide = __waxonedgeTestHooks.getTokenSideInfo({
    amount: '250',
    decimals: 0,
    symbol: '0,FOO',
    contract: 'foo.token',
  });
  ok('WaxOnEdge reserve parser applies token precision exactly once',
    parsedWax.amount === 100 &&
    parsedFoo.amount === 250 &&
    rawWaxSide.amount === 100 &&
    decimalWaxSide.amount === 100.5 &&
    zeroDecimalSide.amount === 250);
  const normalLiquidity = __waxonedgeTestHooks.liquidityFromSides(
    { contract: 'eosio.token', symbol: 'WAX', amount: 100 },
    { contract: 'foo.token', symbol: 'FOO', amount: 250 },
    priceIndex,
  );
  ok('WaxOnEdge TVL derives from scaled reserves and real WAX/USD price',
    normalLiquidity.liquidityWax === '200' &&
    normalLiquidity.liquidityUsd === '1.2');
  const legacyHugePair = {
    source: 'swap.adex',
    pair_id: '29',
    token_a_contract: 'eosio.token',
    token_a_symbol: 'WAX',
    token_b_contract: 'foo.token',
    token_b_symbol: 'FOO',
    reserve_a: '100',
    reserve_b: '250',
    liquidity_wax: '999999999999',
    liquidity_usd: '999999999999',
  };
  ok('aggregate TVL prefers reserve-derived liquidity over stale impossible stored liquidity',
    __waxonedgeTestHooks.liquidityWaxFromIndexedPair(legacyHugePair, priceIndex) === 200 &&
    __waxonedgeTestHooks.liquidityUsdFromWax(200, legacyHugePair, priceIndex) === 1.2);
  const impossibleReservePair = {
    source: 'swap.adex',
    pair_id: '30',
    token_a_contract: 'eosio.token',
    token_a_symbol: 'WAX',
    token_b_contract: 'foo.token',
    token_b_symbol: 'FOO',
    reserve_a: '100000000000',
    reserve_b: '250',
  };
  ok('impossible pair TVL is unavailable instead of clipped or displayed as real',
    __waxonedgeTestHooks.liquidityWaxFromIndexedPair(impossibleReservePair, priceIndex) === null &&
    __waxonedgeTestHooks.isReasonablePairTvlUsd(1798450000000) === false &&
    __waxonedgeTestHooks.isReasonablePairTvlUsd(-1) === false &&
    route.match(/CAST\(liquidity_usd AS NUMERIC\) < 0[\s\S]*CAST\(liquidity_usd AS NUMERIC\) > \?/) &&
    route.includes('tvl_precision_diagnostics') &&
    route.includes('MAX_REASONABLE_PAIR_TVL_USD') &&
    route.includes('impossible_tvl_rows_skipped'));
  ok('bubble scanner displays backend TVL without independent frontend rescaling',
    frontendBubbles.includes("return record.tvlUsd != null ? record.tvlUsd : record.tvlWax") &&
    frontendBubbles.includes("return '$' + fmtNum(record.tvlUsd)") &&
    !/record\.tvlUsd\s*[*/]\s*(?:1e\d+|1000|1000000|100000000)/.test(frontendBubbles) &&
    !/record\.tvlWax\s*[*/]\s*(?:1e\d+|1000|1000000|100000000)/.test(frontendBubbles));
}
{
  const priceIndex = new Map([
    ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
  ]);
  const adapter = {
    source: 'dapp.fusion',
    normalizer: 'waxfusion-global',
    pricingType: 'waxfusion_special',
    defaultFeeBps: 0,
  };
  const pair = __waxonedgeTestHooks.normalizeCoreDexPair(adapter, {
    wax_available_for_rentals: '50.00000000 WAX',
    liquified_swax: '105.00000000 LSWAX',
    swax_currently_backing_lswax: '100.00000000 SWAX',
  }, priceIndex, '2026-06-14T00:00:00.000Z');
  ok('dapp.fusion global row normalizes as special WaxFusion WAX/LSWAX source',
    pair &&
    pair.source === 'dapp.fusion' &&
    pair.pair_id === 'dapp.fusion' &&
    pair.token_a_contract === 'eosio.token' &&
    pair.token_a_symbol === 'WAX' &&
    pair.token_b_contract === 'token.fusion' &&
    pair.token_b_symbol === 'LSWAX' &&
    pair.reserve_a === '50' &&
    pair.reserve_b === '105' &&
    pair.price === '1.05' &&
    pair.fee_bps === '0');
  ok('unparseable dapp.fusion global rows are skipped instead of faked',
    __waxonedgeTestHooks.normalizeCoreDexPair(adapter, {
      liquified_swax: '105.00000000 LSWAX',
    }, priceIndex, '2026-06-14T00:00:00.000Z') === null);
}
ok('AMM stream config includes verified WaxOnEdge swap action sources',
  route.includes('const AMM_TRADE_INDEX_SOURCE =') &&
  route.includes('const AMM_SWAP_ACTION_STREAMS = Object.freeze') &&
  route.includes("source: 'swap.alcor'") &&
  route.includes("referenceSource: 'alcorv2'") &&
  route.includes("account: 'swap.alcor'") &&
  route.includes("action: 'logswap'") &&
  route.includes("source: 'swap.taco'") &&
  route.includes("account: 'swap.taco'") &&
  route.includes("action: 'exchangelog'") &&
  route.includes("source: 'swap.box'") &&
  route.includes("account: 'swap.box'") &&
  route.includes("action: 'swaplog'") &&
  route.includes("source: 'swap.nefty'") &&
  route.includes("account: 'swap.nefty'") &&
  route.includes("action: 'logswap'") &&
  route.includes("trade_history_not_available_for_source: TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice()") &&
  route.includes("'swap.adex'") &&
  route.includes("'dapp.fusion'"));
const ammStreamBlock = route.slice(
  route.indexOf('const AMM_SWAP_ACTION_STREAMS = Object.freeze'),
  route.indexOf('const AMM_TRADE_SOURCES = Object.freeze'),
);
ok('swap.adex and dapp.fusion are not guessed into AMM trade streams or candle sources',
  !ammStreamBlock.includes("source: 'swap.adex'") &&
  !ammStreamBlock.includes("source: 'dapp.fusion'") &&
  route.includes('const CANDLE_TRADE_SOURCES = Object.freeze') &&
  route.includes('function indexedCandleTradeSources()') &&
  !route.includes("const candleTradeSources = ['alcor', ...AMM_TRADE_SOURCES, 'swap.adex'") &&
  !route.includes("const candleTradeSources = ['alcor', ...AMM_TRADE_SOURCES, 'dapp.fusion'"));
ok('unverified swap.adex and dapp.fusion trade streams are reported honestly in health',
  route.includes('const TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS = Object.freeze') &&
  route.includes("verified_listing_action: 'createpool'") &&
  route.includes('no SwapOrderRow trade action stream') &&
  route.includes('dapp.fusion global special pool rows') &&
  route.includes('not indexed as kline trade rows') &&
  route.includes('trade_history_not_available_for_source: tradeIndexSnapshot.data?.trade_history_not_available_for_source || TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice()') &&
  route.includes('trade_history_not_available_for_source: ammTradeIndexSnapshot.data?.trade_history_not_available_for_source || TRADE_HISTORY_NOT_AVAILABLE_SOURCES.slice()') &&
  route.includes('trade_stream_not_verified_from_og_refs: TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS') &&
  route.includes('trade_stream_not_verified_from_og_refs: ammTradeIndexSnapshot.data?.trade_stream_not_verified_from_og_refs || TRADE_STREAM_NOT_VERIFIED_FROM_OG_REFS'));
const ammSwapStreamUrlBody = normalizedRoute.match(/function ammSwapStreamUrl[\s\S]*?\n  }\n/)?.[0] || '';
ok('AMM Hyperion URLs use account and act.name without pair_id or market_id filters',
  ammSwapStreamUrlBody.includes('function ammSwapStreamUrl') &&
  ammSwapStreamUrlBody.includes('`account=${encodeURIComponent(stream.account)}`') &&
  ammSwapStreamUrlBody.includes('`act.name=${encodeURIComponent(stream.action)}`') &&
  ammSwapStreamUrlBody.includes("'sort=desc'") &&
  ammSwapStreamUrlBody.includes("'simple=true'") &&
  ammSwapStreamUrlBody.includes('if (cursor) params.push(`skip=${encodeURIComponent(String(cursor))}`)') &&
  !ammSwapStreamUrlBody.includes('pair_id=') &&
  !ammSwapStreamUrlBody.includes('market_id='));
{
  const stream = { source: 'swap.alcor', referenceSource: 'alcorv2', account: 'swap.alcor', action: 'logswap', parser: 'swap-v3' };
  const priceIndex = new Map([
    ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
    ['foo.token::FOO', { priceWax: 0.4, priceUsd: 0.0024 }],
  ]);
  const tablePair = __waxonedgeTestHooks.normalizeCoreDexPair({
    source: 'swap.alcor',
    normalizer: 'tokenA-tokenB',
    feeScale: 100,
  }, {
    id: 2668,
    tokenA: { quantity: '100.00000000 WAX', contract: 'eosio.token' },
    tokenB: { quantity: '250.0000 FOO', contract: 'foo.token' },
    fee: 30,
  }, priceIndex, '2026-06-14T00:00:00.000Z');
  const parsedLogswap = __waxonedgeTestHooks.parseAmmSwapAction({
    trx_id: 'alcorv2trx',
    global_sequence: '333',
    block_num: 444,
    '@timestamp': '2026-06-14T03:04:05.000Z',
    act: {
      name: 'logswap',
      data: {
        poolId: 2668,
        sender: 'swapper',
        recipient: 'swapper',
        tokenA: '-1.00000000 WAX',
        tokenB: '2.5000 FOO',
        reserveA: '100.00000000 WAX',
        reserveB: '250.0000 FOO',
        sqrtPriceX64: '1',
        liquidity: '1000',
        tick: 1,
      },
    },
  }, stream);
  const normalizedLogswap = __waxonedgeTestHooks.normalizeAmmSwapTradeRow(parsedLogswap, stream);
  ok('swap.alcor table pools and logswap rows use the same canonical pool id',
    __waxonedgeTestHooks.canonicalSwapAlcorPoolId({ id: 2668 }) === '2668' &&
    __waxonedgeTestHooks.canonicalSwapAlcorActionPoolId({ poolId: 2668 }) === '2668' &&
    __waxonedgeTestHooks.canonicalAmmPairId('swap.alcor', { id: 2668 }) === '2668' &&
    __waxonedgeTestHooks.canonicalAmmActionPairId('swap.alcor', { poolId: 2668 }) === '2668' &&
    tablePair &&
    tablePair.source === 'swap.alcor' &&
    tablePair.pair_id === '2668' &&
    parsedLogswap &&
    parsedLogswap.pair_id === '2668' &&
    normalizedLogswap &&
    normalizedLogswap.pair_id === tablePair.pair_id &&
    normalizedLogswap.trade_id === 'swap.alcor:logswap:2668:333' &&
    __waxonedgeTestHooks.moonboysCandleSource('alcorv2') === 'swap.alcor');
  ok('Worker pins swap.alcor #8388 discovery for the WAXCASH display chart feed',
    route.includes('async function syncPinnedWaxcashPairs') &&
    route.includes("pins = [{ source: 'swap.alcor', pair_id: '8388', reason: 'waxcash_display_chart_feed' }]") &&
    route.includes("lowerBound: '8388'") &&
    route.includes('alcor_8388_indexed') &&
    route.includes('source_coverage: pairs.map((pair) => pair.source)'));
  const alcorWaxcash8388 = __waxonedgeTestHooks.normalizeCoreDexPair({
    source: 'swap.alcor',
    normalizer: 'tokenA-tokenB',
    feeScale: 100,
  }, {
    pool_id: 8388,
    token_a: { contract: 'eosio.token', symbol: 'WAX', precision: 8 },
    token_b: { contract: 'graffitiking', symbol: 'WAXCASH', precision: 8 },
    reserve_a: '1138621.39085541',
    reserve_b: '119457846.68648227',
    fee: 100,
  }, priceIndex, '2026-06-17T00:00:00.000Z');
  const waxcash8388Proof = __waxonedgeTestHooks.buildWaxcashOgParityProof([alcorWaxcash8388], priceIndex, []);
  ok('swap.alcor pool #8388 snake_case row normalizes as direct WAX/WAXCASH V3 candidate but not price proof',
    alcorWaxcash8388 &&
    alcorWaxcash8388.source === 'swap.alcor' &&
    alcorWaxcash8388.pair_id === '8388' &&
    alcorWaxcash8388.token_a_contract === 'eosio.token' &&
    alcorWaxcash8388.token_a_symbol === 'WAX' &&
    alcorWaxcash8388.token_b_contract === 'graffitiking' &&
    alcorWaxcash8388.token_b_symbol === 'WAXCASH' &&
    Number(alcorWaxcash8388.reserve_a) === 1138621.39085541 &&
    Number(alcorWaxcash8388.reserve_b) === 119457846.68648227 &&
    waxcash8388Proof.headline_price.v3_direct_wax_candidate_count === 1 &&
    waxcash8388Proof.headline_price.legacy_direct_wax_selected === false &&
    waxcash8388Proof.headline_price.v3_direct_wax_selected === false &&
    waxcash8388Proof.headline_price.og_headline_price_source === null &&
    waxcash8388Proof.headline_price.og_headline_price_pair_id === null &&
    waxcash8388Proof.headline_price.og_headline_price_wax === null &&
    waxcash8388Proof.headline_price.og_headline_reason_codes.includes('no_direct_wax_pool_with_usable_price_proof') &&
    waxcash8388Proof.headline_price.direct_wax_candidates.some((candidate) =>
      candidate.pair_id === '8388' &&
      candidate.reason_codes.includes('v3_poolv3_getprice_proof_unavailable')));
  const alcorOrderbookWaxcash = {
    source: 'alcor',
    pair_id: 'ORDERBOOK-WAXCASH-WAX',
    token_a_contract: 'graffitiking',
    token_a_symbol: 'WAXCASH',
    token_b_contract: 'eosio.token',
    token_b_symbol: 'WAX',
    price: '0.002',
    liquidity_wax: '4000',
  };
  const waxcashOrderbookProof = __waxonedgeTestHooks.buildWaxcashOgParityProof([alcorOrderbookWaxcash], priceIndex, []);
  ok('Alcor orderbook WAXCASH/WAX rows use the OG market-match price proof path',
    waxcashOrderbookProof.headline_price.og_headline_price_wax === '0.002' &&
    waxcashOrderbookProof.headline_price.og_headline_price_source === 'alcor' &&
    waxcashOrderbookProof.headline_price.og_headline_price_pair_id === 'ORDERBOOK-WAXCASH-WAX' &&
    waxcashOrderbookProof.headline_price.direct_wax_candidates.some((candidate) =>
      candidate.source === 'alcor' &&
      candidate.adapter_type === 'alcor_orderbook_market_match' &&
      candidate.formula === 'price_wax = alcordexmain market match price' &&
      candidate.usable === true) &&
    waxcashOrderbookProof.all_pairs.some((pair) =>
      pair.pair_id === 'ORDERBOOK-WAXCASH-WAX' &&
      pair.direct_wax_pair === true &&
      pair.pair_liquidity_wax === '4000' &&
      pair.pair_price_relative_to_waxcash === '0.002'));
  const unusableOrderbookProof = __waxonedgeTestHooks.buildWaxcashOgParityProof([{
    ...alcorOrderbookWaxcash,
    pair_id: 'ORDERBOOK-WAXCASH-WAX-NOPRICE',
    price: null,
    liquidity_wax: null,
  }], priceIndex, []);
  ok('Alcor orderbook WAXCASH/WAX rows remain unavailable when market-match price or depth proof is missing',
    unusableOrderbookProof.headline_price.og_headline_price_wax === null &&
    unusableOrderbookProof.headline_price.direct_wax_candidates.some((candidate) =>
      candidate.source === 'alcor' &&
      candidate.reason_codes.includes('orderbook_match_price_unavailable') &&
      candidate.reason_codes.includes('orderbook_liquidity_depth_unavailable')));
}
{
  const stream = { source: 'swap.taco', referenceSource: 'taco', account: 'swap.taco', action: 'exchangelog', parser: 'swap-v2-taco' };
  const priceIndex = new Map([
    ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
    ['foo.token::FOO', { priceWax: 0.4, priceUsd: 0.0024 }],
  ]);
  const tablePair = __waxonedgeTestHooks.normalizeCoreDexPair({
    source: 'swap.taco',
    normalizer: 'pool1-pool2',
    defaultFeeBps: 30,
  }, {
    id: 'WAXFOO',
    pool1: { quantity: '100.00000000 WAX', contract: 'eosio.token' },
    pool2: { quantity: '500.0000 FOO', contract: 'foo.token' },
  }, priceIndex, '2026-06-14T00:00:00.000Z');
  const parsed = __waxonedgeTestHooks.parseAmmSwapAction({
    trx_id: 'ammtrx',
    global_sequence: '111',
    block_num: 222,
    '@timestamp': '2026-06-14T01:02:03.000Z',
    act: {
      name: 'exchangelog',
      data: {
        id: 'WAXFOO',
        maker: 'swapper',
        quantity_in: '2.00000000 WAX',
        quantity_out: '10.0000 FOO',
        pool1: '100.00000000 WAX',
        pool2: '500.0000 FOO',
      },
    },
  }, stream);
  const normalized = __waxonedgeTestHooks.normalizeAmmSwapTradeRow(parsed, stream);
  ok('swap.taco table/action pair IDs normalize consistently',
    __waxonedgeTestHooks.canonicalTacoPairId({ id: 'WAXFOO' }) === 'WAXFOO' &&
    __waxonedgeTestHooks.canonicalTacoActionPairId({ id: 'WAXFOO' }) === 'WAXFOO' &&
    tablePair &&
    tablePair.pair_id === 'WAXFOO' &&
    parsed &&
    parsed.source === 'swap.taco' &&
    parsed.action_name === 'exchangelog' &&
    parsed.pair_id === 'WAXFOO' &&
    parsed.amount_in === 2 &&
    parsed.amount_out === 10 &&
    normalized &&
    normalized.source === 'swap.taco' &&
    normalized.trade_id === 'swap.taco:exchangelog:WAXFOO:111' &&
    normalized.pair_id === tablePair.pair_id &&
    normalized.symbol === 'WAX' &&
    normalized.side === 'swap' &&
    normalized.price === '0.2' &&
    normalized.volume === '2' &&
    normalized.traded_at === '2026-06-14T01:02:03.000Z' &&
    JSON.parse(normalized.raw_json).reference_src === 'taco');
}
{
  const stream = { source: 'swap.box', referenceSource: 'defibox', account: 'swap.box', action: 'swaplog', parser: 'swap-v2-defibox' };
  const priceIndex = new Map([
    ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
    ['box.token::BOX', { priceWax: 0.5, priceUsd: 0.003 }],
  ]);
  const tablePair = __waxonedgeTestHooks.normalizeCoreDexPair({
    source: 'swap.box',
    normalizer: 'box-pairs',
    defaultFeeBps: 30,
  }, {
    pair_id: '12',
    token0: { contract: 'eosio.token', symbol: 'WAX' },
    token1: { contract: 'box.token', symbol: 'BOX' },
    reserve0: '100.0000 WAX',
    reserve1: '200.0000 BOX',
  }, priceIndex, '2026-06-14T00:00:00.000Z');
  const validParsed = __waxonedgeTestHooks.parseAmmSwapAction({
    trx_id: 'boxtrx',
    global_sequence: '222',
    block_num: 333,
    '@timestamp': '2026-06-14T01:02:03.000Z',
    act: { name: 'swaplog', data: { pair_id: '12', owner: 'swapper', quantity_in: '1.0000 WAX', quantity_out: '2.0000 BOX', reserve0: '100.0000 WAX', reserve1: '200.0000 BOX' } },
  }, stream);
  ok('swap.box table/action pair IDs normalize consistently',
    __waxonedgeTestHooks.canonicalDefiboxPairId({ pair_id: '12' }) === '12' &&
    __waxonedgeTestHooks.canonicalDefiboxActionPairId({ pair_id: '12' }) === '12' &&
    tablePair &&
    validParsed &&
    tablePair.pair_id === validParsed.pair_id &&
    __waxonedgeTestHooks.normalizeAmmSwapTradeRow(validParsed, stream)?.pair_id === tablePair.pair_id);
  const parsed = __waxonedgeTestHooks.parseAmmSwapAction({
    act: { name: 'swaplog', data: { pair_id: '12', owner: 'swapper', quantity_in: '0.0000 WAX', quantity_out: '1.0000 BOX', reserve0: '1.0000 WAX', reserve1: '2.0000 BOX' } },
  }, stream);
  ok('unparseable AMM rows are skipped instead of faked',
    parsed &&
    parsed.amount_in === 0 &&
    __waxonedgeTestHooks.normalizeAmmSwapTradeRow(parsed, stream) === null);
}
{
  const stream = { source: 'swap.nefty', referenceSource: 'neftyblocks', account: 'swap.nefty', action: 'logswap', parser: 'swap-v2-nefty' };
  const priceIndex = new Map([
    ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
    ['foo.token::FOO', { priceWax: 0.4, priceUsd: 0.0024 }],
  ]);
  const tablePair = __waxonedgeTestHooks.normalizeCoreDexPair({
    source: 'swap.nefty',
    normalizer: 'reserve0-reserve1',
    defaultFeeBps: 30,
  }, {
    code: 'WAXFOO',
    reserve0: { quantity: '100.00000000 WAX', contract: 'eosio.token' },
    reserve1: { quantity: '250.0000 FOO', contract: 'foo.token' },
  }, priceIndex, '2026-06-14T00:00:00.000Z');
  const parsed = __waxonedgeTestHooks.parseAmmSwapAction({
    trx_id: 'neftytrx',
    global_sequence: '444',
    block_num: 555,
    '@timestamp': '2026-06-14T01:02:03.000Z',
    act: {
      name: 'logswap',
      data: {
        code: 'WAXFOO',
        owner: 'swapper',
        quantity_in: '1.00000000 WAX',
        quantity_out: '2.5000 FOO',
        reserve0: { quantity: '100.00000000 WAX' },
        reserve1: { quantity: '250.0000 FOO' },
      },
    },
  }, stream);
  ok('swap.nefty table/action pair IDs normalize consistently',
    __waxonedgeTestHooks.canonicalNeftyPairId({ code: 'WAXFOO' }) === 'WAXFOO' &&
    __waxonedgeTestHooks.canonicalNeftyActionPairId({ code: 'WAXFOO' }) === 'WAXFOO' &&
    tablePair &&
    parsed &&
    tablePair.pair_id === parsed.pair_id &&
    __waxonedgeTestHooks.normalizeAmmSwapTradeRow(parsed, stream)?.pair_id === tablePair.pair_id);
}
{
  const originalFetch = globalThis.fetch;
  const stream = { source: 'swap.box', referenceSource: 'defibox', account: 'swap.box', action: 'swaplog', parser: 'swap-v2-defibox' };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      actions: [{
        trx_id: 'bad-amm-row',
        global_sequence: '123',
        block_num: 456,
        '@timestamp': '2026-06-14T02:03:04.000Z',
        act: { name: 'swaplog', data: { pair_id: '12', owner: 'swapper' } },
      }],
    }), { status: 200 });
    const result = await __waxonedgeTestHooks.fetchAmmSwapStreamRows(
      { WAXONEDGE_HYPERION_API: 'https://wax.example/v2' },
      stream,
      1,
    );
    ok('raw AMM rows rejected by parser are schema failures, not no-trade completion',
      result.failed === true &&
      result.tradeRowsNotUsable === true &&
      result.noTradeRows !== true &&
      result.diagnostic.failure_type === 'amm_rows_unparseable' &&
      result.diagnostic.raw_row_count === 1 &&
      result.diagnostic.parsed_row_count === 0 &&
      result.diagnostic.source === 'swap.box' &&
      result.diagnostic.account === 'swap.box' &&
      result.diagnostic.action_name === 'swaplog' &&
      route.includes("failure_type: 'amm_rows_unparseable'") &&
      route.includes('if (result.tradeRowsNotUsable || result.diagnostic?.failure_type === \'amm_rows_unparseable\') tradeRowsNotUsableCount += 1') &&
      route.includes("actionState.status = 'failed'"));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
ok('AMM trade indexer exposes progress and duplicate-safe row accounting',
  route.includes('async function syncAmmSwapTradeRows') &&
  route.includes('fetchAmmSwapStreamRows(env, stream, rowsPerMarket, streamCursor)') &&
  route.includes('normalizeAmmSwapTradeRow(row, stream)') &&
  route.includes('const written = await upsertTrades(env.DB, trades)') &&
  route.includes('duplicateRowsSkipped += Math.max(0, trades.length - written)') &&
  route.includes('amm_trade_indexing: {') &&
  route.includes('configured_streams: ammTradeIndexSnapshot.data?.configured_streams || AMM_SWAP_ACTION_STREAMS') &&
  route.includes('trade_rows_not_usable_count') &&
  route.includes('no_fake_trades: true'));
ok('candle backfill can build from AMM waxonedge_trades rows',
  route.includes('const candleTradeSources = indexedCandleTradeSources()') &&
  route.includes('const candlePairSourceNames = [...new Set(candleTradeSources.flatMap(candleTradeSourceNamesFor))]') &&
  route.includes('FROM waxonedge_trades') &&
  route.includes('AND traded_at >= ?') &&
  route.includes('FROM waxonedge_pairs') &&
  route.includes('WHERE source IN') &&
  route.includes("const mismatch = hasSourceRows && source !== 'alcor'") &&
  route.includes("source === 'alcor' ? 'trade_rows_not_indexed' : 'swap_rows_not_indexed'") &&
  __waxonedgeTestHooks.buildDailyCandlesFromTradeRows([
    { source: 'swap.taco', pair_id: 'WAXFOO', traded_at: '2026-06-14T00:00:00.000Z', price: '0.2', volume: '2' },
    { source: 'swap.taco', pair_id: 'WAXFOO', traded_at: '2026-06-14T01:00:00.000Z', price: '0.25', volume: '3' },
  ], { source: 'swap.taco' })[0].close === '0.25');
const internalCandleBuilderStart = route.indexOf('async function buildInternalDailyCandlesForPair');
const internalCandleBuilderEnd = route.indexOf('async function writeChartCandles', internalCandleBuilderStart);
const internalCandleBuilderBody = internalCandleBuilderStart >= 0 && internalCandleBuilderEnd > internalCandleBuilderStart
  ? route.slice(internalCandleBuilderStart, internalCandleBuilderEnd)
  : '';
ok('candle backfill uses canonical AMM IDs and does not derive candles from reserves',
  route.includes('function canonicalAmmPairId') &&
  route.includes('function canonicalAmmActionPairId') &&
  route.includes('const pairId = canonicalAmmPairId(adapter.source, row)') &&
  route.includes('pairId = canonicalAmmActionPairId(stream.source, record, row)') &&
  route.includes('const rows = await loadIndexedTradeRowsForPair(db, source, pairId)') &&
  route.includes('if (!rows.length)') &&
  internalCandleBuilderBody.includes('loadIndexedTradeRowsForPair(db, source, pairId)') &&
  !internalCandleBuilderBody.includes('reserve_a') &&
  !internalCandleBuilderBody.includes('reserve_b') &&
  !route.includes('public chart fallback'));
ok('Alcor marketMatches pagination reports per-action skip progress without full-history completion claims',
  route.includes('function normalizeActionStreamProgressMap') &&
  route.includes('const streamProgress = normalizeActionStreamProgressMap(previousData.action_streams, actionStreams)') &&
  route.includes('const HYPERION_SKIP_WINDOW_LIMIT = 10000') &&
  route.includes('function hyperionSkipWindowState') &&
  route.includes('pagination_mode: \'skip\'') &&
  route.includes('bounded_skip_window_exhausted') &&
  route.includes('hyperion_skip_window_limit: HYPERION_SKIP_WINDOW_LIMIT') &&
  route.includes('last_valid_skip_cursor') &&
  route.includes('action_streams: streamProgress') &&
  route.includes('last_stream_cursor: lastStreamCursor') &&
  route.includes('last_stream_sequence: lastStreamSequence') &&
  route.includes('last_stream_block: lastStreamBlock') &&
  route.includes('const streamRunLimit = Math.min(limit, pagesPerRun, actionStreams.length)') &&
  route.includes('candidateRows.length < streamRunLimit') &&
  route.includes('active_stream_pages_per_run: pagesPerRun') &&
  route.includes('bounded_history_seed: false') &&
  route.includes('history_pagination_complete: false') &&
  route.includes('HYPERION_SKIP_WINDOW_NEXT_ACTION') &&
  route.includes('const nextCursor = \'\';') &&
  route.includes('const complete = false;') &&
  !route.includes("complete && failedPairCount === 0 ? 'success'"));
ok('Alcor Hyperion skip window guard allows the last valid page and blocks invalid windows',
  __waxonedgeTestHooks.hyperionSkipWindowState(9750, 250).bounded_skip_window_exhausted === false &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9751, 250).bounded_skip_window_exhausted === true &&
  __waxonedgeTestHooks.hyperionSkipWindowState(10000, 250).bounded_skip_window_exhausted === true &&
  __waxonedgeTestHooks.hyperionSkipWindowState(10000, 250).last_valid_skip_cursor === 9750 &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9900, 50).bounded_skip_window_exhausted === false &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9901, 50).bounded_skip_window_exhausted === true &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9950, 50).bounded_skip_window_exhausted === true &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9900, 50).last_valid_skip_cursor === 9900);
ok('bounded skip exhaustion is handled before Alcor fetch attempt accounting',
  route.indexOf('const skipWindow = hyperionSkipWindowState(streamCursor, rowsPerMarket)') > -1 &&
  route.indexOf('const skipWindow = hyperionSkipWindowState(streamCursor, rowsPerMarket)') < route.indexOf('attemptedPairCount += 1') &&
  route.includes('if (skipWindow.bounded_skip_window_exhausted)') &&
  route.includes('actionState.status = \'partial\'') &&
  route.includes('actionState.complete = false') &&
  route.includes('actionState.next_action = HYPERION_SKIP_WINDOW_NEXT_ACTION') &&
  normalizedRoute.includes('continue;\n    }\n    attemptedPairCount += 1') &&
  !/bounded_skip_window_exhausted[\s\S]{0,800}failedPairCount \+= 1/.test(route) &&
  !/bounded_skip_window_exhausted[\s\S]{0,800}upstream5xxCount \+= 1/.test(route));
ok('bounded skip exhaustion keeps existing rows and does not fake completion',
  route.includes('const anyBoundedSkipWindowExhausted = boundedSkipWindowExhausted || actionStreams.some') &&
  route.includes('attemptedPairCount > 0 || allStreamsCompleteBeforeRun || allStreamsComplete || anyBoundedSkipWindowExhausted') &&
  route.includes('trade_rows_indexed: totalRowsIndexed') &&
  route.includes('rows_written: totalRowsWritten') &&
  route.includes('history_pagination_complete: false') &&
  route.includes('no_fake_trades: true') &&
  route.includes('status !== \'failed\'') &&
  !route.includes('history_pagination_complete: anyBoundedSkipWindowExhausted'));
ok('AMM Hyperion skip window guard mirrors Alcor bounded-window handling',
  route.indexOf('async function syncAmmSwapTradeRows') > -1 &&
  normalizedRoute.slice(
    normalizedRoute.indexOf('async function syncAmmSwapTradeRows'),
    normalizedRoute.indexOf('async function readSourceIndexState'),
  ).includes('hyperionSkipWindowState') &&
  normalizedRoute.slice(
    normalizedRoute.indexOf('async function syncAmmSwapTradeRows'),
    normalizedRoute.indexOf('async function readSourceIndexState'),
  ).includes('if (skipWindow.bounded_skip_window_exhausted)') &&
  normalizedRoute.slice(
    normalizedRoute.indexOf('async function syncAmmSwapTradeRows'),
    normalizedRoute.indexOf('async function readSourceIndexState'),
  ).includes('actionState.status = \'partial\'') &&
  normalizedRoute.slice(
    normalizedRoute.indexOf('async function syncAmmSwapTradeRows'),
    normalizedRoute.indexOf('async function readSourceIndexState'),
  ).includes('actionState.next_action = HYPERION_SKIP_WINDOW_NEXT_ACTION') &&
  normalizedRoute.slice(
    normalizedRoute.indexOf('async function syncAmmSwapTradeRows'),
    normalizedRoute.indexOf('async function readSourceIndexState'),
  ).includes('continue;\n    }\n    attemptedPairCount += 1') &&
  route.includes('continue per-source AMM Hyperion skip pagination'));
ok('AMM skip guard allows last valid page and blocks invalid windows using real request limit',
  __waxonedgeTestHooks.hyperionSkipWindowState(9900, 50).bounded_skip_window_exhausted === false &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9901, 50).bounded_skip_window_exhausted === true &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9950, 50).bounded_skip_window_exhausted === true &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9900, 50).page_limit === 100 &&
  __waxonedgeTestHooks.hyperionSkipWindowState(9900, 50).last_valid_skip_cursor === 9900);
{
  const ammBlock = normalizedRoute.slice(
    normalizedRoute.indexOf('async function syncAmmSwapTradeRows'),
    normalizedRoute.indexOf('async function readSourceIndexState'),
  );
  const ammSkipGuard = ammBlock.match(/if \(skipWindow\.bounded_skip_window_exhausted\) \{([\s\S]*?)\n    \}\n    attemptedPairCount \+= 1/)?.[1] || '';
  ok('bounded AMM skip exhaustion is partial and does not log expected 400s as failures',
    route.includes('const anyBoundedSkipWindowExhausted = boundedSkipWindowExhausted || actionStreams.some') &&
    route.includes('bounded_skip_window_exhausted: anyBoundedSkipWindowExhausted') &&
    route.includes('last_valid_skip_cursor: lastValidSkipCursor') &&
    route.includes('next_action: hyperionNotConfigured') &&
    route.includes(': (anyBoundedSkipWindowExhausted') &&
    route.includes('trade_rows_indexed: totalRowsIndexed') &&
    route.includes('rows_written: totalRowsWritten') &&
    ammSkipGuard.includes("actionState.status = 'partial'") &&
    ammSkipGuard.includes('actionState.next_action = HYPERION_SKIP_WINDOW_NEXT_ACTION') &&
    ammSkipGuard.includes('continue;') &&
    !ammSkipGuard.includes('failedPairCount += 1') &&
    !ammSkipGuard.includes('fetchAmmSwapStreamRows') &&
    !ammSkipGuard.includes('upstream5xxCount += 1'));
}
ok('candidate stream selection respects smaller trade index and pages-per-run limits',
  route.indexOf('const streamRunLimit = Math.min(limit, pagesPerRun, actionStreams.length)') > -1 &&
  route.indexOf('const streamRunLimit = Math.min(limit, pagesPerRun, actionStreams.length)') < route.indexOf('candidateRows.length < streamRunLimit') &&
  route.includes('const limit = Math.max(1, Math.min(tradeIndexPairLimit(env), actionStreams.length))') &&
  route.includes('const pagesPerRun = tradeStreamPagesPerRun(env)') &&
  !route.includes('candidateRows.length < Math.min(pagesPerRun, actionStreams.length)'));
ok('trade-row sync does not inflate indexed/written counters on conflict-only upserts',
  route.includes('const uniqueTrades = []') &&
  route.includes('SELECT source, trade_id FROM waxonedge_trades WHERE') &&
  route.includes('const newRowCount = uniqueTrades.reduce') &&
  route.includes('return newRowCount') &&
  route.includes('const totalRowsIndexed = (asNumber(previousData.trade_rows_indexed) || 0) + rowsWritten') &&
  route.includes('last_run_rows_fetched: rowsIndexed') &&
  route.includes('last_run_rows_written: rowsWritten') &&
  route.includes('duplicate_rows_skipped: totalDuplicateRowsSkipped'));
{
  const alcorSyncBlock = route.slice(
    route.indexOf('async function syncAlcorMarketTradeRows'),
    route.indexOf('async function syncAmmSwapTradeRows'),
  );
  const ammSyncBlock = route.slice(
    route.indexOf('async function syncAmmSwapTradeRows'),
    route.indexOf('async function readSourceIndexState'),
  );
  ok('trade-row sync refreshes newest Hyperion pages before stale skip-cursor backfill',
    alcorSyncBlock.includes('fetchAlcorMarketMatchStreamRows(env, actionName, rowsPerMarket, 0)') &&
    alcorSyncBlock.includes('fetchAlcorMarketMatchStreamRows(env, actionName, rowsPerMarket, streamCursor)') &&
    alcorSyncBlock.indexOf('fetchAlcorMarketMatchStreamRows(env, actionName, rowsPerMarket, 0)') < alcorSyncBlock.indexOf('fetchAlcorMarketMatchStreamRows(env, actionName, rowsPerMarket, streamCursor)') &&
    ammSyncBlock.includes('fetchAmmSwapStreamRows(env, stream, rowsPerMarket, 0)') &&
    ammSyncBlock.includes('fetchAmmSwapStreamRows(env, stream, rowsPerMarket, streamCursor)') &&
    ammSyncBlock.indexOf('fetchAmmSwapStreamRows(env, stream, rowsPerMarket, 0)') < ammSyncBlock.indexOf('fetchAmmSwapStreamRows(env, stream, rowsPerMarket, streamCursor)'));
  ok('trade-row head refresh keeps historical skip cursors intact and remains duplicate-safe',
    route.includes('head_refresh_enabled: true') &&
    route.includes('head_refresh_rows_fetched') &&
    route.includes('head_refresh_rows_written') &&
    route.includes('head_refresh_duplicate_rows_skipped') &&
    route.includes('head_refresh_latest_indexed_timestamp') &&
    route.includes('newestIsoTimestamp(actionState.last_indexed_timestamp, result.last_indexed_timestamp)') &&
    alcorSyncBlock.includes('actionState.skip_cursor = Math.max(actionState.skip_cursor, Math.floor(nextSkipCursor))') &&
    ammSyncBlock.includes('actionState.skip_cursor = Math.max(actionState.skip_cursor, Math.floor(nextSkipCursor))') &&
    !/fetchAlcorMarketMatchStreamRows\(env, actionName, rowsPerMarket, 0\)[\s\S]{0,1600}actionState\.skip_cursor =/.test(alcorSyncBlock) &&
    !/fetchAmmSwapStreamRows\(env, stream, rowsPerMarket, 0\)[\s\S]{0,1600}actionState\.skip_cursor =/.test(ammSyncBlock));
  ok('trade-index health exposes head-refresh freshness diagnostics',
    route.includes('head_refresh_enabled: tradeIndexSnapshot.data?.head_refresh_enabled === true') &&
    route.includes('head_refresh_latest_indexed_timestamp: tradeIndexSnapshot.data?.head_refresh_latest_indexed_timestamp || null') &&
    route.includes('head_refresh_enabled: ammTradeIndexSnapshot.data?.head_refresh_enabled === true') &&
    route.includes('head_refresh_latest_indexed_timestamp: ammTradeIndexSnapshot.data?.head_refresh_latest_indexed_timestamp || null'));
}
ok('next_cursor zero is preserved instead of replaced by fallback math',
  route.includes('const parsedNextCursor = asNumber(result.next_cursor)') &&
  route.includes('const nextSkipCursor = parsedNextCursor ?? (streamCursor + result.rows.length)') &&
  route.includes('Math.floor(nextSkipCursor)') &&
  !route.includes('asNumber(result.next_cursor) || (streamCursor + result.rows.length)'));
ok('trade-row index state treats normal cursoring as non-truncated progress',
  route.includes('const sourceStateTruncated = status === \'failed\' ? 1 : 0') &&
  route.includes('truncated: sourceStateTruncated') &&
  route.includes('const sourceStateError = status === \'failed\' ? visibleError : null') &&
  route.includes('error: sourceStateError') &&
  route.includes("error: Object.prototype.hasOwnProperty.call(patch, 'error') ? patch.error : existing?.error ?? null") &&
  !route.includes('truncated: complete ? 0 : 1'));
ok('successful trade-row index runs clear stale-looking errors',
  route.includes('const hasCurrentFailure = hyperionNotConfigured || budgetExhausted || failedPairCount > 0 || temporarilyFailedPairCount > 0') &&
  route.includes("const visibleError = (status === 'success' || (rowsWritten > 0 && !hasCurrentFailure))") &&
  route.includes('last_error: visibleError') &&
  route.includes('recordSyncRun(env.DB, ALCOR_TRADE_INDEX_SOURCE, status, startedAt, visibleError)'));
ok('sourceStateStale does not treat normal trade_indexing partial cursor as stale',
  __waxonedgeTestHooks.sourceStateStale({
    source: 'alcor_trade_rows',
    status: 'partial',
    truncated: 0,
    complete: 0,
    cursor: '24',
    updated_at: new Date().toISOString(),
  }) === false);
ok('sourceStateStale still reports true trade_indexing failures',
  __waxonedgeTestHooks.sourceStateStale({
    source: 'alcor_trade_rows',
    status: 'failed',
    truncated: 1,
    complete: 0,
    cursor: '24',
    updated_at: new Date().toISOString(),
  }) === true);
const alcor502Diagnostic = __waxonedgeTestHooks.tradeFetchDiagnostic({
  url: 'https://wax.example/v2/history/get_actions?account=alcordexmain&act.name=buymatch',
  pairId: '29',
  status: 502,
  body: '<html>Bad Gateway</html>',
  retryCount: 2,
});
ok('502 trade fetch response is classified as upstream_5xx temporary failure',
  __waxonedgeTestHooks.isUpstreamServerErrorStatus(502) &&
  alcor502Diagnostic.failure_type === 'upstream_5xx' &&
  alcor502Diagnostic.source === 'alcor' &&
  alcor502Diagnostic.pair_id === '29' &&
  alcor502Diagnostic.endpoint_path === '/v2/history/get_actions?account=alcordexmain&act.name=buymatch' &&
  alcor502Diagnostic.http_status === 502 &&
  alcor502Diagnostic.retry_count === 2 &&
  alcor502Diagnostic.response_body_snippet === '<html>Bad Gateway</html>' &&
  alcor502Diagnostic.upstream_server_error === true &&
  alcor502Diagnostic.unsupported === false);
{
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  try {
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      return new Response(JSON.stringify({ actions: [] }), { status: 200 });
    };
    await __waxonedgeTestHooks.fetchAlcorMarketMatchHistoryRows({ WAXONEDGE_HYPERION_API: 'https://wax.example/v2' }, '29', 250);
    ok('legacy public Alcor trade endpoints are not an alternate ingestion path',
      !('fetchAlcorMarketTradeRows' in __waxonedgeTestHooks) &&
      !route.includes('function fetchAlcorMarketTradeRows') &&
      !route.includes('function alcorMarketTradeUrls') &&
      !route.includes('/markets/${id}/deals') &&
      !route.includes('/markets/${id}/matches') &&
      !route.includes('/markets/${id}/trades') &&
      requestedUrls.length === 2 &&
      requestedUrls.every((url) => url.includes('/history/get_actions')) &&
      requestedUrls.every((url) => !url.includes('/api/v2/markets/')));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
{
  const actionRow = {
    trx_id: 'abc123',
    global_sequence: '987654',
    block_num: 123,
    '@timestamp': '2026-06-13T00:00:00.000Z',
    act: {
      name: 'buymatch',
      data: {
        record: {
          id: 44,
          asker: 'seller',
          bidder: 'buyer',
          unit_price: '250000000',
          ask: '10.00000000 WAXCASH',
          bid: '25.00000000 WAX',
          market: {
            id: 253,
            base_token: { contract: 'graffitiking', sym: '8,WAXCASH' },
            quote_token: { contract: 'eosio.token', sym: '8,WAX' },
          },
        },
      },
    },
  };
  const parsed = __waxonedgeTestHooks.parseAlcorMarketMatchAction(actionRow);
  const normalized = __waxonedgeTestHooks.normalizeAlcorMarketTradeRow(actionRow, {
    pair_id: '253',
    token_a_contract: 'graffitiking',
    token_a_symbol: 'WAXCASH',
  });
  ok('Hyperion/state-history alcordexmain market match rows normalize into waxonedge_trades',
    parsed &&
    parsed.src === 'alcor_buy' &&
    String(parsed.market_id) === '253' &&
    normalized &&
    normalized.source === 'alcor' &&
    normalized.pair_id === '253' &&
    normalized.price === '2.5' &&
    normalized.volume === '25' &&
    JSON.parse(normalized.raw_json).volume_wax === '25' &&
    normalized.raw_json.includes('Hyperion/state-history alcordexmain buymatch/sellmatch') &&
    normalized.raw_json.includes('marketMatches'));
  const legacyMarketVolumeProof = __waxonedgeTestHooks.waxcashTradeVolumeWax({
    source: 'alcor',
    pair_id: '253',
    contract: 'graffitiking',
    symbol: 'WAXCASH',
    amount: '10',
    volume: '10',
    raw_json: JSON.stringify({
      reference_src: 'alcormarket',
      amount_ask: '10',
      code_ask: 'WAXCASH',
      amount_bid: '25',
      code_bid: 'WAX',
    }),
  }, new Map(), '0.0025');
  ok('OG-style alcordexmain amount_bid/code_bid rows normalize rolling volume in WAX',
    legacyMarketVolumeProof.volumeWax === 25 &&
    legacyMarketVolumeProof.basis === 'indexed_trade_rows_window_wax_denominated');
}
{
  const eosusaRow = {
    contract: 'alcordexmain',
    action: 'buymatch',
    transaction_id: 'eosusa-trx',
    block: 439856858,
    timestamp: '2026-06-14T05:28:12.000',
    data: {
      record: {
        id: '690094',
        market: {
          id: '26',
          base_token: { sym: '8,WAX', contract: 'eosio.token' },
          quote_token: { sym: '4,TLM', contract: 'alien.worlds' },
        },
        bidder: 'downplayedco',
        asker: 'eeejo.wam',
        bid: '0.00160539 WAX',
        ask: '0.0070 TLM',
        unit_price: '22979999',
        timestamp: '1781414892',
      },
    },
  };
  const parsed = __waxonedgeTestHooks.parseAlcorMarketMatchAction(eosusaRow);
  const normalized = __waxonedgeTestHooks.normalizeAlcorMarketTradeRow(eosusaRow);
  const raw = JSON.parse(normalized.raw_json);
  ok('EOSUSA simple_actions buymatch rows parse marketMatches fields without act.name',
    parsed &&
    parsed.action_name === 'buymatch' &&
    parsed.src === 'alcor_buy' &&
    parsed.side === 'buy' &&
    String(parsed.market_id) === '26' &&
    String(parsed.order_id) === '690094' &&
    parsed.trx_id === 'eosusa-trx' &&
    String(parsed.block_num) === '439856858' &&
    normalized.trade_id === '26:buymatch:690094' &&
    normalized.pair_id === '26' &&
    normalized.contract === 'eosio.token' &&
    normalized.symbol === 'WAX' &&
    normalized.price === '0.22979999' &&
    normalized.volume === '0.00160539' &&
    normalized.tx_id === 'eosusa-trx' &&
    normalized.traded_at === '2026-06-14T05:28:12.000Z' &&
    raw.src === 'alcor_buy' &&
    raw.global_sequence === null &&
    raw.block_num === 439856858);
}
{
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  try {
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      const isSell = String(url).includes('sellmatch');
      return new Response(JSON.stringify({
        actions: isSell ? [] : [{
          trx_id: 'hyperion-trx',
          global_sequence: '111',
          '@timestamp': '2026-06-13T00:00:00.000Z',
          act: {
            name: 'buymatch',
            data: {
              record: {
                id: 1,
                unit_price: 100000000,
                ask: '1.00000000 TOKEN',
                bid: '1.00000000 WAX',
                market: { id: 29 },
              },
            },
          },
        }],
      }), { status: 200 });
    };
    const result = await __waxonedgeTestHooks.fetchAlcorMarketMatchStreamRows({ WAXONEDGE_HYPERION_API: 'https://wax.example/v2/' }, 'buymatch', 50, 7);
    ok('Alcor trade index fetches Hyperion/state-history marketMatches as action streams',
      result.rows.length === 1 &&
      result.ingestion_path === 'hyperion_marketMatches' &&
      result.diagnostic.action_name === 'buymatch' &&
      result.pagination_mode === 'skip' &&
      result.next_cursor === '8' &&
      result.last_sequence === 111 &&
      requestedUrls.every((url) => url.includes('/v2/history/get_actions')) &&
      requestedUrls.every((url) => url.includes('act.name=buymatch')) &&
      requestedUrls.every((url) => url.includes('skip=7')) &&
      requestedUrls.every((url) => !url.includes('market_id=')) &&
      requestedUrls.length === 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
{
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    };
    const result = await __waxonedgeTestHooks.fetchAlcorMarketMatchHistoryRows({}, '29', 50);
    ok('missing WAXONEDGE_HYPERION_API skips trade indexing without WAX RPC fallback',
      fetchCalled === false &&
      result.skipped === true &&
      result.hyperionNotConfigured === true &&
      result.diagnostic.failure_type === 'hyperion_not_configured' &&
      __waxonedgeTestHooks.hyperionApiBase({}) === '' &&
      __waxonedgeTestHooks.hyperionConfigured({}) === false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
ok('invalid WAXONEDGE_HYPERION_API skips trade indexing like missing config',
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'wax.example/v2' }) === '' &&
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'ftp://wax.example/v2' }) === '' &&
  __waxonedgeTestHooks.hyperionConfigured({ WAXONEDGE_HYPERION_API: 'wax.example/v2' }) === false);
ok('Hyperion API base rejects credentials, query strings, and fragments',
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'https://user:pass@host/v2' }) === '' &&
  __waxonedgeTestHooks.hyperionConfigured({ WAXONEDGE_HYPERION_API: 'https://user:pass@host/v2' }) === false &&
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'https://host/v2?x=y' }) === '' &&
  __waxonedgeTestHooks.hyperionConfigured({ WAXONEDGE_HYPERION_API: 'https://host/v2?x=y' }) === false &&
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'https://host/v2#frag' }) === '' &&
  __waxonedgeTestHooks.hyperionConfigured({ WAXONEDGE_HYPERION_API: 'https://host/v2#frag' }) === false &&
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'https://host/v2/' }) === 'https://host/v2' &&
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'https://host/' }) === 'https://host' &&
  __waxonedgeTestHooks.hyperionApiBase({ WAXONEDGE_HYPERION_API: 'https://host' }) === 'https://host');
ok('Hyperion history endpoint builder is deterministic and idempotent',
  __waxonedgeTestHooks.hyperionHistoryActionsEndpoint({ WAXONEDGE_HYPERION_API: 'https://host/v2/' }) === 'https://host/v2/history/get_actions' &&
  __waxonedgeTestHooks.hyperionHistoryActionsEndpoint({ WAXONEDGE_HYPERION_API: 'https://host/v2/history/get_actions' }) === 'https://host/v2/history/get_actions' &&
  __waxonedgeTestHooks.hyperionConfigured({ WAXONEDGE_HYPERION_API: 'https://host/v2/history/get_actions' }) === true &&
  __waxonedgeTestHooks.hyperionHistoryActionsEndpoint({ WAXONEDGE_HYPERION_API: 'https://host/v2/history/get_actions/extra' }) === '' &&
  __waxonedgeTestHooks.hyperionConfigured({ WAXONEDGE_HYPERION_API: 'https://host/v2/history/get_actions/extra' }) === false);
ok('Hyperion marketMatches URL uses OG account/act.name query and filters market_id locally',
  __waxonedgeTestHooks.alcorMarketMatchHistoryUrls({ WAXONEDGE_HYPERION_API: 'https://wax.example/v2/' }, '29', 50).every((url) =>
    url.startsWith('https://wax.example/v2/history/get_actions?') &&
    url.includes('account=alcordexmain') &&
    url.includes('act.name=') &&
    url.includes('sort=desc') &&
    !url.includes('sort=asc') &&
    !url.includes('filter=') &&
    !url.includes('market_id=')) &&
  __waxonedgeTestHooks.hyperionHistoryActionsEndpoint({ WAXONEDGE_HYPERION_API: 'https://wax.example/v2/' }) === 'https://wax.example/v2/history/get_actions' &&
  route.includes('safeString(row.market_id) === safeString(pairId)'));
{
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    const result = await __waxonedgeTestHooks.fetchAlcorMarketMatchStreamRows({ WAXONEDGE_HYPERION_API: 'https://wax.example/v2' }, 'sellmatch', 50);
    ok('Hyperion 502 uses upstream_5xx taxonomy and is temporary',
      result.temporaryFailure === true &&
      result.failed !== true &&
      result.diagnostic.failure_type === 'upstream_5xx' &&
      result.diagnostic.upstream_server_error === true &&
      result.diagnostic.pair_id === null &&
      result.diagnostic.action_name === 'sellmatch' &&
      __waxonedgeTestHooks.isTemporaryTradeFailureType(result.diagnostic.failure_type) === true);
    ok('stream non-2xx diagnostics have pair_id null and action_name set',
      result.diagnostic.pair_id === null &&
      result.diagnostic.action_name === 'sellmatch' &&
      result.attempted_endpoints.every((item) => item.action_name === 'sellmatch'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
{
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<not-json>', { status: 200 });
    const result = await __waxonedgeTestHooks.fetchAlcorMarketMatchStreamRows({ WAXONEDGE_HYPERION_API: 'https://wax.example/v2' }, 'buymatch', 50);
    ok('Hyperion invalid JSON is invalid_payload, not temporary or no_trade_rows',
      result.invalidPayload === true &&
      result.failed === true &&
      result.temporaryFailure !== true &&
      result.noTradeRows !== true &&
      result.unsupported !== true &&
      result.rows.length === 0 &&
      result.diagnostic.failure_type === 'invalid_payload' &&
      result.diagnostic.pair_id === null &&
      result.diagnostic.action_name === 'buymatch' &&
      __waxonedgeTestHooks.isTemporaryTradeFailureType(result.diagnostic.failure_type) === false);
    ok('invalid JSON stream diagnostics have pair_id null and action_name set',
      result.diagnostic.pair_id === null &&
      result.diagnostic.action_name === 'buymatch' &&
      result.attempted_endpoints.every((item) => item.action_name === 'buymatch'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
{
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('network socket closed with token abc123'); };
    const result = await __waxonedgeTestHooks.fetchAlcorMarketMatchStreamRows({ WAXONEDGE_HYPERION_API: 'https://wax.example/v2' }, 'sellmatch', 50);
    ok('Hyperion thrown fetch exception uses failed taxonomy and safe endpoint diagnostics',
      result.failed === true &&
      result.temporaryFailure !== true &&
      result.unsupported !== true &&
      result.rows.length === 0 &&
      result.diagnostic.failure_type === 'failed' &&
      result.diagnostic.endpoint_path.includes('/v2/history/get_actions') &&
      result.diagnostic.response_body_snippet.includes('network socket closed') &&
      result.diagnostic.pair_id === null &&
      result.diagnostic.action_name === 'sellmatch' &&
      __waxonedgeTestHooks.isTemporaryTradeFailureType(result.diagnostic.failure_type) === false);
    ok('thrown fetch stream diagnostics have pair_id null and action_name set',
      result.diagnostic.pair_id === null &&
      result.diagnostic.action_name === 'sellmatch' &&
      result.attempted_endpoints.every((item) => item.action_name === 'sellmatch'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
{
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('Not Found', { status: 404, statusText: 'Not Found' });
    const result = await __waxonedgeTestHooks.fetchAlcorMarketMatchHistoryRows({ WAXONEDGE_HYPERION_API: 'https://wax.example' }, '29', 50);
    ok('Hyperion 404 is unsupported, not temporary',
      result.unsupported === true &&
      result.temporaryFailure !== true &&
      result.failed !== true &&
      result.rows.length === 0 &&
      result.diagnostic.failure_type === 'unsupported');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
ok('trade-row fetch separates temporary 5xx from unsupported history',
  route.includes('let temporarilyFailedPairCount = 0') &&
  route.includes('let upstream5xxCount = 0') &&
  route.includes('let upstreamBadPayloadCount = 0') &&
  route.includes('let hyperionScanNoRowsCount = 0') &&
  route.includes('let noTradeRowsCount = 0') &&
  route.includes('if (result.temporaryFailure)') &&
  route.includes('temporarilyFailedPairCount += 1') &&
  route.includes("result.diagnostic?.failure_type === 'upstream_5xx'") &&
  route.includes('upstream5xxCount += 1') &&
  route.includes('if (result.invalidPayload || result.diagnostic?.failure_type === \'invalid_payload\') upstreamBadPayloadCount += 1') &&
  route.indexOf('if (result.temporaryFailure)') < route.indexOf('if (result.unsupported)') &&
  !/if \(result\.temporaryFailure\)[\s\S]{0,240}unsupportedPairCount \+= 1/.test(route));
ok('one failed Alcor trade market does not stop the whole batch',
  /if \(result\.temporaryFailure\)[\s\S]*?continue;\s*}\s*if \(result\.failed\)/.test(route) &&
  /if \(result\.failed\)[\s\S]*?continue;\s*}\s*if \(result\.unsupported\)/.test(route) &&
  route.includes('rowsWritten += written') &&
  route.includes('processedPairCount += 1') &&
  route.includes('const nextStreamIndex = candidateRows.length'));
ok('trade-row sync is stream-based and does not query Hyperion once per pair',
  route.includes('const actionStreams = defaultAlcorTradeActionStreams()') &&
  route.includes('candidateRows.push(actionName)') &&
  route.includes('for (const actionName of candidateRows)') &&
  !/async function syncAlcorMarketTradeRows[\s\S]*FROM waxonedge_pairs[\s\S]*ORDER BY CAST\(pair_id AS NUMERIC\), pair_id[\s\S]*LIMIT \? OFFSET \?[\s\S]*async function readSourceIndexState/.test(route) &&
  !route.includes('fetchAlcorMarketMatchHistoryRows(env, pair.pair_id, rowsPerMarket)') &&
  !route.includes('.map((row) => normalizeAlcorMarketTradeRow(row, pair))'));
ok('trade-row health exposes endpoint/status diagnostics',
  route.includes('sample_trade_fetch_failure') &&
  route.includes('sample_trade_fetch_success') &&
  route.includes('upstream_bad_payload_count') &&
  route.includes('hyperion_scan_no_market_matches_count') &&
  route.includes('endpoint_path') &&
  route.includes('http_status') &&
  route.includes('response_body_snippet') &&
  route.includes('retry_count') &&
  route.includes('reference_trade_source'));
ok('trade-row health reports explicit Hyperion configuration instead of WAX RPC fallback',
  route.includes('hyperion_not_configured') &&
  route.includes('active_hyperion_endpoint') &&
  route.includes('hyperion_query_shape') &&
  route.includes('hyperion_configured') &&
  route.includes('const totalHyperionNotConfiguredCount = (asNumber(previousData.hyperion_not_configured_count) || 0) + hyperionNotConfiguredCount') &&
  route.includes('active_hyperion_endpoint: hyperionHistoryActionsEndpoint(env) || tradeIndexSnapshot.data?.active_hyperion_endpoint || null') &&
  route.includes('act.name=buymatch|sellmatch') &&
  !route.includes('env?.WAXONEDGE_HYPERION_API || WAX_RPC') &&
  !route.includes('market_id=${encodeURIComponent(String(pairId))}'));
ok('missing Hyperion config skips trade indexing without fake attempted progress',
  route.indexOf('if (!hyperionConfigured(env))') > -1 &&
  route.indexOf('if (!hyperionConfigured(env))') < route.indexOf('const candidateRows = []') &&
  route.indexOf('if (!hyperionConfigured(env))') < route.indexOf('for (const actionName of candidateRows)') &&
  route.includes('status: \'skipped\'') &&
  route.includes('attempted_pair_count: asNumber(previousData.attempted_pair_count) || 0') &&
  route.includes('processed_pair_count: asNumber(previousData.processed_pair_count) || 0') &&
  route.includes('rows_written: asNumber(previousData.rows_written) || 0') &&
  route.includes("next_action: 'configure WAXONEDGE_HYPERION_API'") &&
  route.includes('cursor,') &&
  route.includes('const totalAttemptedPairCount = (asNumber(previousData.attempted_pair_count) || 0) + attemptedPairCount'));
ok('trade-row sync clears stale pre-stream diagnostics',
  route.includes('function isLegacyTradeFetchDiagnostic') &&
  route.includes('filter=alcordexmain|market_id=|\\/api\\/v2\\/markets\\/') &&
  route.includes('sampleTradeFetchFailure = null') &&
  route.includes('sample_trade_fetch_failure: isLegacyTradeFetchDiagnostic(previousData.sample_trade_fetch_failure) ? null'));
ok('Wapaca reference path for alcormarket trades is documented honestly',
  route.includes('Hyperion/state-history alcordexmain buymatch/sellmatch -> marketMatches') &&
  route.includes('guessed_public_alcor_http_source_of_truth: false') &&
  referenceAudit.includes('Hyperion') &&
  referenceAudit.includes('marketMatches'));
ok('scheduled sync can index trade rows before candle backfill',
  route.includes("cron === 'waxonedge-trade-backfill'") &&
  route.includes('runWaxOnEdgeTradeBackfill') &&
  /const liveIndexerHistory = await syncLiveIndexerHistory\(env\);\s*const alcorTradeBackfill = await syncAlcorMarketTradeRows\(env\);\s*const ammTradeBackfill = await syncAmmSwapTradeRows\(env\);/.test(route) &&
  !route.includes('const [alcorTradeBackfill, ammTradeBackfill] = await Promise.all') &&
  /const tradeBackfill = await runWaxOnEdgeTradeBackfill\(env\);\s*const holders = await syncWaxcashHolderSnapshot\(env\);\s*const aggregates = await aggregateTokenAnalytics\(env\);\s*const candleBackfill = await planWaxOnEdgeCandleBackfill\(env\)/.test(route));
ok('candle endpoint examples expose selected chart source and pair id',
  __waxonedgeTestHooks.candleUrlExample('alcor', '29') === '/api/waxonedge/candles?duration=1d&src=alcor&pair_id=29' &&
  route.includes('chart_src') &&
  route.includes('chart_pair_id') &&
  route.includes('candle_url_example') &&
  route.includes('reference_candle_url_example') &&
  route.includes('candle_url_examples'));
const cachedRawJsonRow = {
  source: 'alcormarket',
  traded_at: null,
  raw_json: JSON.stringify({ unit_price: 456000000, volume: 12, created_at: '2026-06-12T04:00:00.000Z' }),
};
const originalJsonParse = JSON.parse;
let rawJsonParseCount = 0;
try {
  JSON.parse = (...args) => {
    rawJsonParseCount += 1;
    return originalJsonParse(...args);
  };
  __waxonedgeTestHooks.tradeTimestampMillis(cachedRawJsonRow);
  __waxonedgeTestHooks.priceFromIndexedTradeRow(cachedRawJsonRow, 'alcor');
  __waxonedgeTestHooks.volumeFromIndexedTradeRow(cachedRawJsonRow);
} finally {
  JSON.parse = originalJsonParse;
}
ok('trade raw_json is cached per row across timestamp, price, and volume helpers',
  rawJsonParseCount === 1 &&
  route.includes('TRADE_RAW_JSON_CACHE') &&
  route.includes('Object.defineProperty(row, TRADE_RAW_JSON_CACHE'));
ok('candle backfill advances cursor by attempted pairs and records failures',
  route.includes('let attemptedPairCount = 0') &&
  route.includes('attemptedPairCount += 1') &&
  route.includes('failedPairCount += 1') &&
  route.includes('const nextCursor = Math.min(candidatePairCount, cursorOffset + attemptedPairCount)') &&
  route.includes('attempted_pair_count: totalAttemptedPairCount') &&
  route.includes('failed_pair_count: totalFailedPairCount') &&
  route.includes('last_error: diagnosticLastError') &&
  !route.includes('const nextCursor = Math.min(candidatePairCount, cursorOffset + processedPairCount)'));
ok('candle batch stops before budget exhaustion and reports budget separately',
  route.includes('DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT = 24') &&
  route.includes('FREE_SAFE_CANDLE_SUBREQUEST_BUDGET = 2') &&
  route.includes('const requestBudget = candleSubrequestBudget(env)') &&
  route.includes('if (attemptedPairCount >= requestBudget)') &&
  route.includes('budgetExhausted = true') &&
  route.includes("status = budgetExhausted") &&
  route.includes('budget_exhausted: budgetExhausted'));
ok('candle backfill limit respects free-safe and paid mode',
  route.includes('function candleBackfillPairLimit(env)') &&
  route.includes('waxonedgeFreeSafeMode(env) ? FREE_SAFE_CANDLE_BACKFILL_PAIR_LIMIT : DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT') &&
  route.includes('function candleSubrequestBudget(env)') &&
  route.includes('waxonedgeFreeSafeMode(env) ? FREE_SAFE_CANDLE_SUBREQUEST_BUDGET : DEFAULT_CANDLE_BACKFILL_PAIR_LIMIT') &&
  !route.includes('const CANDLE_BACKFILL_PAIR_LIMIT = FREE_SAFE_CANDLE_BACKFILL_PAIR_LIMIT'));
ok('WAXONEDGE_FREE_SAFE_MODE=false uses paid candle limit',
  __waxonedgeTestHooks.candleBackfillPairLimit({ WAXONEDGE_FREE_SAFE_MODE: 'false' }) === 24 &&
  __waxonedgeTestHooks.candleBackfillPairLimit({ WAXONEDGE_FREE_SAFE_MODE: 'true' }) === 2);
ok('WAXONEDGE_FREE_SAFE_MODE=false is configured for paid WaxOnEdge runtime',
  wrangler.includes('WAXONEDGE_FREE_SAFE_MODE = "false"') &&
  __waxonedgeTestHooks.tradeIndexPairLimit({ WAXONEDGE_FREE_SAFE_MODE: 'false' }) === 24 &&
  __waxonedgeTestHooks.tradeIndexPairLimit({ WAXONEDGE_FREE_SAFE_MODE: 'true' }) === 2 &&
  __waxonedgeTestHooks.tradeRowsPerMarketLimit({ WAXONEDGE_FREE_SAFE_MODE: 'false' }) === 250 &&
  __waxonedgeTestHooks.tradeRowsPerMarketLimit({ WAXONEDGE_FREE_SAFE_MODE: 'true' }) === 50);
ok('candle_backfill budget_limited is benign progress for stale health',
  route.includes("['planned', 'partial_success', 'skipped', 'budget_limited'].includes(row.status)") &&
  route.includes('budget_exhausted: !!candleBackfillSnapshot.data?.budget_exhausted'));
ok('budget exhaustion does not inflate failed_pair_count for every candidate',
  route.includes('if (isSubrequestBudgetError(error))') &&
  route.includes('budgetExhausted = true') &&
  route.includes('break') &&
  route.indexOf('if (isSubrequestBudgetError(error))') < route.indexOf('failedPairCount += 1') &&
  route.includes('const totalFailedPairCount = (asNumber(previousData.failed_pair_count) || 0) + failedPairCount'));
ok('404 candle pair is skipped as unsupported without retrying forever',
  route.includes('function isNotFoundError(error)') &&
  route.includes('if (isNotFoundError(error))') &&
  route.includes('unsupportedPairCount += 1') &&
  route.includes('unsupportedReason = `no_chart_endpoint: alcor pair ${pair.pair_id} returned 404`') &&
  route.includes('continue') &&
  route.includes('unsupported_pair_count: totalUnsupportedPairCount'));
ok('unsupported external endpoint handling does not block internal candle builder',
  route.indexOf('buildInternalDailyCandlesForPair(env.DB, pair)') > -1 &&
  route.indexOf('buildInternalDailyCandlesForPair(env.DB, pair)') < route.indexOf('if (isNotFoundError(error))') &&
  route.includes('trade_rows_not_indexed_count') &&
  route.includes('candles_built_from_trade_rows'));
ok('external chart unsupported diagnostic is separate from internal unsupported totals',
  route.includes('let externalUnsupportedPairCount = 0') &&
  route.includes('externalUnsupportedPairCount += 1') &&
  route.includes('const totalExternalUnsupportedPairCount =') &&
  route.includes('trade_rows_not_usable_for_ohlcv_count') &&
  route.includes('unsupported_pair_count_total') &&
  route.includes('external_chart_endpoint_unsupported: totalExternalUnsupportedPairCount') &&
  !route.includes('external_chart_endpoint_unsupported: totalUnsupportedPairCount'));
ok('candle backfill cumulative counters separate cursor from success/failure counts',
  route.includes('const totalAttemptedPairCount = (asNumber(previousData.attempted_pair_count) || 0) + attemptedPairCount') &&
  route.includes('const totalProcessedPairCount = (asNumber(previousData.processed_pair_count) || 0) + processedPairCount') &&
  route.includes('const totalFailedPairCount = (asNumber(previousData.failed_pair_count) || 0) + failedPairCount') &&
  route.includes('const totalUnsupportedPairCount = (asNumber(previousData.unsupported_pair_count) || 0) + unsupportedPairCount') &&
  route.includes('processed_pair_count: totalProcessedPairCount') &&
  route.includes('cursor: complete ?') &&
  !route.includes('processed_pair_count: nextCursor'));
ok('aggregate selected price uses the shared WAX route graph instead of a direct-WAX-only selector',
  route.includes('function buildOgWaxRouteGraph') &&
  route.includes('const routeIndex = options.routeIndex || buildOgWaxRouteGraph(graphPairRows, priceIndex)') &&
  route.includes('const aggregateRouteIndex = buildOgWaxRouteGraph(pairRows.results || [], priceIndex)') &&
  route.includes('{ routeIndex: aggregateRouteIndex }') &&
  route.includes('const selected = selectLiquidityWeightedMedianPrice(contract, symbol, pairRows, priceIndex, routeIndex)') &&
  !route.includes('selectLiquidityWeightedMedianPrice(contract, symbol, pairRows, priceIndex, routeIndex) ||') &&
  route.includes('routeLiquidityScore > existing.route_liquidity_score') &&
  !route.includes('const trusted = liquidityWax >= MIN_TRUSTED_WAX_LIQUIDITY'));
ok('aggregate rebuild persists all computable token metrics from indexed pairs',
  route.includes('const detailStats = deriveTokenPairMetrics') &&
  route.includes('detailStats.selected_price_wax') &&
  route.includes('detailStats.selected_price_usd') &&
  route.includes('detailStats.liquidity_wax') &&
  route.includes('detailStats.tvl_wax') &&
  route.includes('detailStats.circulating_supply') &&
  route.includes('detailStats.market_cap_wax') &&
  route.includes('detailStats.market_cap_usd') &&
  route.includes('circulating_supply = excluded.circulating_supply') &&
  route.includes('market_cap_wax = excluded.market_cap_wax') &&
  route.includes('market_cap_usd = excluded.market_cap_usd') &&
  route.includes('detailStats.fdv_wax') &&
  route.includes('fdv_wax = excluded.fdv_wax') &&
  route.includes('fdv_usd = excluded.fdv_usd'));
ok('route selects chart source only from indexed candle rows',
  route.includes('async function listBestChartCandles') &&
  route.includes('JOIN waxonedge_chart_candles') &&
  route.includes('ORDER BY CAST(COALESCE(p.liquidity_wax') &&
  route.includes('CAST(COALESCE(p.volume_24h'));
ok('chart endpoint returns stored 1D candle rows with WaxOnEdge-compatible params',
  route.includes('async function listChartCandlesBySource') &&
  route.includes("path === `${WAXONEDGE_API_PREFIX}/candles`") &&
  route.includes('query.duration || query.interval') &&
  route.includes('query.src || query.source') &&
  route.includes('query.pair_id || query.pairId') &&
  route.includes('query.is_reversed || query.isReversed') &&
  route.includes('FROM waxonedge_chart_candles') &&
  route.includes('ORDER BY bucket_time DESC') &&
  route.includes('SOURCE_NOT_INDEXED'));
ok('token pair endpoint returns all selected-token pairs by liquidity then volume',
  route.includes('async function listTokenPairs') &&
  route.includes('ORDER BY CAST(COALESCE(liquidity_wax') &&
  route.includes('CAST(COALESCE(volume_24h_wax') &&
  route.includes('next_cursor') &&
  route.includes('complete: !hasMore') &&
  route.includes('LIMIT ? OFFSET ?') &&
  route.includes('const TOKEN_PAIR_MAX_PAGE_LIMIT = 1000'));
ok('token detail endpoint returns canonical stats and source coverage',
  route.includes('source_coverage: sourceCoverageFromKeys') &&
  route.includes('selected_price_wax') &&
  route.includes('selected_pair_source') &&
  route.includes('volume_24h_wax') &&
  route.includes('aggregate_sources_required') &&
  route.includes('aggregate_sources_processed') &&
  route.includes('aggregate_sources_failed') &&
  route.includes('aggregate_sources_truncated'));
ok('token detail derives partial aggregate metrics from indexed pair rows',
  route.includes('function deriveTokenPairMetrics') &&
  route.includes('function loadTokenPriceRowsForPairs') &&
  route.includes('selected_price_source') &&
  route.includes('cumulated_pair_liquidity_wax') &&
  route.includes('metrics.tvl_wax = safeDecimal(liquidityWax)') &&
  route.includes('metrics.tvl_usd = safeDecimal(liquidityUsd)') &&
  route.includes('strongest_pair') &&
  route.includes('unavailable_reasons') &&
  route.includes('Pair liquidity indexed; holder/candle metrics pending'));
ok('token debug exposes all-pair aggregate contribution totals',
  route.includes('function aggregatePairContributionTotals') &&
  route.includes('aggregate_totals: aggregateTotals') &&
  route.includes('total_liquidity_wax') &&
  route.includes('total_liquidity_usd') &&
  route.includes('total_tvl_wax') &&
  route.includes('total_tvl_usd') &&
  route.includes('unresolved_pair_count'));
ok('WAXCASH OG WOE parity proof endpoint is narrow and exact-token scoped',
  route.includes("const WAXCASH_CONTRACT = 'graffitiking'") &&
  route.includes("const WAXCASH_SYMBOL = 'WAXCASH'") &&
  route.includes("child === 'og-proof'") &&
  route.includes('getWaxcashOgProof(env.DB)') &&
  route.includes('OG parity proof is only available for graffitiking::WAXCASH') &&
  route.includes('og_woe_parity'));
ok('WAXCASH OG WOE parity proof uses narrow fee_bps loader',
  route.includes('async function loadWaxcashOgPairRows') &&
  /async function loadWaxcashOgPairRows[\s\S]*volume_7d, volume_7d_wax, volume_7d_usd, volume_30d, volume_30d_wax, volume_30d_usd[\s\S]*fee_bps, updated_at[\s\S]*FROM waxonedge_pairs[\s\S]*WAXCASH_CONTRACT, WAXCASH_SYMBOL/.test(route) &&
  route.includes('const rawPairRows = await loadWaxcashOgPairRows(db)'));
ok('WAXCASH OG WOE parity proof uses deepest usable direct WAX pool with verified V3 support',
  route.includes('function buildWaxcashOgParityProof') &&
  route.includes('function waxcashHeadlinePrice') &&
  route.includes('function isOldWoeLegacyWaxcashDirectPair') &&
  route.includes('function isAlcorWaxcashDirectPair') &&
  route.includes('function waxcashDirectWaxCandidateProof') &&
  route.includes("headline_price_source_policy: 'og_woe_deepest_usable_direct_wax_pool'") &&
  route.includes('direct_wax_candidate_count') &&
  route.includes('usable_direct_wax_candidate_count') &&
  route.includes('legacy_direct_wax_candidate_count') &&
  route.includes('legacy_direct_wax_selected') &&
  route.includes('v3_direct_wax_candidate_count') &&
  route.includes('v3_direct_wax_selected') &&
  route.includes('headline_fallback_used') &&
  route.includes('no_direct_wax_pool_with_usable_price_proof') &&
  route.includes('function ogDirectWaxTokenPrice') &&
  route.includes('function ogV3DirectWaxTokenPrice') &&
  route.includes('function hasPoolV3GetPriceProof') &&
  route.includes('(asNumber(b.depth_score) || 0) - (asNumber(a.depth_score) || 0)') &&
  route.includes('price_wax = wax_reserve / token_reserve') &&
  route.includes('price_wax = 1 / PoolV3.getPrice(pool)') &&
  route.includes('v3_poolv3_getprice_proof_unavailable') &&
  route.includes('og_headline_passes_100_wax_threshold') &&
  route.includes('selected_largest_wax_reserve_pool') &&
  !route.includes('selected_' + 'deep' + 'est_wax_pool') &&
  route.includes('largest verified WAX reserve') &&
  !route.includes('deep' + 'est direct WAX pool') &&
  route.includes('Stored pair.price, TVL, market cap, volume, and multi-hop routes are not headline-price inputs') &&
  !route.includes("headline_price_source_policy: 'alcor_" + "preferred_direct_wax'") &&
  !route.slice(route.indexOf('function waxcashHeadlinePrice'), route.indexOf('function buildWaxcashOgParityProof')).includes('pair.price'));
ok('WAXCASH OG WOE parity proof exposes all exact pair rows with unavailable reason codes',
  route.includes('all_pairs: allPairs') &&
  route.includes('rejected_pairs: rejectedPairs') &&
  route.includes('pair_summary: pairSummary') &&
  route.includes('function waxcashPairSummary') &&
  route.includes("pairedIsWax ? { price_wax: '1' } : null") &&
  route.includes('const parsed = asNumber(pair[field])') &&
  route.includes('if (parsed != null) proof[field] = safeDecimal(parsed)') &&
  route.includes('fee_bps: safeDecimal(asNumber(pair.fee_bps))') &&
  route.includes('pair_price_relative_to_waxcash') &&
  route.includes('pair_price_usd') &&
  route.includes('token_a_icon') &&
  route.includes('token_b_icon') &&
  route.includes('pair_liquidity_wax') &&
  route.includes('paired_token_wax_price_unavailable') &&
  route.includes('missing_or_zero_reserves') &&
  route.includes('total_pair_liquidity_wax') &&
  route.includes('unavailable_reason_counts') &&
  route.includes('exact contract::symbol scoped') &&
  !route.slice(route.indexOf('function waxcashPairProof'), route.indexOf('function waxcashHeadlinePrice')).includes('active_status') &&
  route.slice(route.indexOf('function waxcashPairProof'), route.indexOf('function waxcashHeadlinePrice')).includes('volume_7d_wax') &&
  route.slice(route.indexOf('function waxcashPairProof'), route.indexOf('function waxcashHeadlinePrice')).includes('volume_30d_wax') &&
  !route.slice(route.indexOf('function waxcashPairProof'), route.indexOf('function waxcashHeadlinePrice')).includes('fee:'));
ok('WAXCASH pair table backend enriches token icons and pair-level indexed volume windows',
  route.includes('function buildDbTokenIconIndex') &&
  route.includes('function enrichPairsWithTokenIcons') &&
  route.includes('function collectTokenRefsForPairs') &&
  route.includes('async function indexedTradeWindowVolumesByPair') &&
  route.includes('async function fetchWaxcashOgLastStats') &&
  route.includes('function applyOgLastStatsToWaxcashPairs') &&
  route.includes("ogTokenVolume(ogLastStats.lastVolumes, '24h')") &&
  route.includes("ogPairChange24h(ogLastStats.lastPriceChanges, selectedWaxPool)") &&
  route.includes('og_waxonedge_lastVolumes') &&
  route.includes('og_waxonedge_lastVolumes_native_pair_volume') &&
  route.includes('og_waxonedge_lastVolumes_route_converted_wax') &&
  route.includes('og_waxonedge_lastPriceChanges') &&
  route.includes('function applyIndexedPairWindowVolumes') &&
  route.includes('indexed_pair_volume_window_source') &&
  route.includes('metric_debug') &&
  route.includes('change_24h_reason') &&
  route.includes('latest_indexed_trade_time') &&
  route.includes('indexedPairTablePairs = applyIndexedPairWindowVolumes') &&
  route.includes('pairTablePairs = applyOgLastStatsToWaxcashPairs(indexedPairTablePairs, ogLastStats, waxUsd)') &&
  route.includes('const existingChange24h = asNumber(pair?.change_24h)') &&
  route.includes('const tradeChange24h = asNumber(window?.change_24h)') &&
  route.includes('const change24h = existingChange24h ?? tradeChange24h') &&
  route.includes('indexed_trade_price_window_insufficient_samples') &&
  !route.includes('indexedCandleChange24hByPair(db, proof.all_pairs') &&
  !route.includes('const candleChange24h = asNumber(candleChange?.change_24h)') &&
  !route.includes('existingChange24h ?? tradeChange24h ?? candleChange24h') &&
  route.includes('pair_table: waxcashBuildPairTableSection(pairTablePairs, selectedWaxPool)'));
ok('WAXCASH exposes live LastStats diagnostics for env, bucket, D1 ID backfill, and source sync state',
  route.includes('async function getWaxcashLastStatsDiagnostics') &&
  route.includes('async function waxcashTradeRowDiagnostics') &&
  route.includes('/waxcash-analytics/laststats-diagnostics') &&
  route.includes('sanitizedWaxonedgeOgBase') &&
  route.includes('lastVolumes_fetch') &&
  route.includes('top_level_keys') &&
  route.includes('keys_24h_pools') &&
  route.includes('buckets.neftyblocks.exists') &&
  route.includes('buckets.taco.exists') &&
  route.includes('migration_027_applied') &&
  route.includes('og_laststats_pair_id_not_null') &&
  route.includes('og_laststats_pair_id_null') &&
  route.includes('total_trade_rows') &&
  route.includes('waxcash_related_trade_rows') &&
  route.includes('rows_by_source') &&
  route.includes('latest_traded_at_by_source') &&
  route.includes('sample_waxcash_trade_rows') &&
  route.includes('pair_id_matches_current_pair_id_count') &&
  route.includes('pair_id_matches_og_laststats_pair_id_count') &&
  route.includes('WAXCASH_TRADE_QUERY_PAIR_ID_CHUNK_SIZE') &&
  route.includes('function waxcashTradeQueryChunks') &&
  route.includes('source = ? AND pair_id IN') &&
  route.includes('query_chunk_count') &&
  route.includes('trade_rows_query_error') &&
  route.includes('source_sync'));
ok('WAXCASH route restores OG WaxOnEdge endpoint shapes for indexed stats and source rows',
  route.includes("'/lastVolumes'") &&
  route.includes("'/lastPriceChanges'") &&
  route.includes("'/markets'") &&
  route.includes("'/market'") &&
  route.includes("'/pools'") &&
  route.includes("'/pool'") &&
  route.includes("'/poolsv3'") &&
  route.includes("'/poolv3'") &&
  route.includes('fetchWaxonedgeOgJson(env, endpoint)') &&
  route.includes('WAXONEDGE_OG_API_BASE'));
{
  const originalFetch = globalThis.fetch;
  const fakeDb = {
    prepare(sql) {
      const statement = {
        bind() { return statement; },
        async all() {
          if (sql.includes('PRAGMA table_info(waxonedge_pairs)')) {
            return { results: [{ name: 'pair_id' }, { name: 'og_laststats_pair_id' }] };
          }
          if (sql.includes('FROM waxonedge_source_index_state')) {
            return { results: [
              { source: 'swap.nefty', sync_cycle_id: 'woe-test', row_count: 42, complete: 1, status: 'success', error: null, updated_at: '2026-06-20T00:00:00Z' },
              { source: 'swap.taco', sync_cycle_id: 'woe-test', row_count: 18, complete: 1, status: 'success', error: null, updated_at: '2026-06-20T00:00:00Z' },
            ] };
          }
          if (sql.includes('FROM waxonedge_sync_runs')) {
            return { results: [
              { source: 'swap.nefty', status: 'success', started_at: '2026-06-20T00:00:00Z', finished_at: '2026-06-20T00:01:00Z', error: null },
              { source: 'swap.taco', status: 'success', started_at: '2026-06-20T00:00:00Z', finished_at: '2026-06-20T00:01:00Z', error: null },
            ] };
          }
          return { results: [] };
        },
        async first() {
          if (sql.includes('COUNT(*) AS total_waxcash_pair_rows')) {
            return {
              total_waxcash_pair_rows: 60,
              og_laststats_pair_id_not_null: 0,
              og_laststats_pair_id_null: 60,
            };
          }
          if (sql.includes('COUNT(*) AS count FROM waxonedge_trades')) {
            return { count: 0 };
          }
          if (sql.includes('COUNT(*) AS row_count') && sql.includes('FROM waxonedge_trades')) {
            return { row_count: 0, latest_traded_at: null };
          }
          return null;
        },
      };
      return statement;
    },
  };
  try {
    globalThis.fetch = async (url) => {
      return new Response(JSON.stringify({
        '24h': {
          pools: {
            neftyblocks: {
              '144-117': { volumeA: '10', volumeB: '20' },
            },
            taco: {
              'AA-WAXCASH': { volumeA: '5', volumeB: '9' },
            },
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const diagnostic = await __waxonedgeTestHooks.getWaxcashLastStatsDiagnostics({
      DB: fakeDb,
      WAXONEDGE_OG_API_BASE: 'https://og.example/api',
    });
    ok('WAXCASH LastStats diagnostic reports configured OG base, buckets, null OG IDs, and sync state',
      diagnostic.og_api_base.configured === true &&
      diagnostic.og_api_base.host === 'og.example' &&
      diagnostic.lastVolumes_fetch.ok === true &&
      diagnostic.lastVolumes_shape.buckets.neftyblocks.exists === true &&
      diagnostic.lastVolumes_shape.buckets.taco.exists === true &&
      diagnostic.d1.migration_027_applied === true &&
      diagnostic.d1.og_laststats_pair_id_not_null === 0 &&
      diagnostic.d1.og_laststats_pair_id_null === 60 &&
      diagnostic.trade_rows.total_trade_rows === 0 &&
      diagnostic.trade_rows.waxcash_related_trade_rows === 0 &&
      diagnostic.trade_rows.reason === 'no_waxcash_trade_rows_indexed' &&
      diagnostic.interpretation.trade_rows_indexing_required === true &&
      diagnostic.interpretation.og_laststats_pair_ids_need_backfill === true &&
      diagnostic.source_sync['swap.nefty'].source_index_state.status === 'success' &&
      diagnostic.source_sync['swap.taco'].latest_sync_run.status === 'success');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
ok('WAXCASH analytics restores a real holder count source instead of accepting unavailable-only holder state',
  route.includes('async function fetchWaxcashAlcorTokenAnalytics') &&
  route.includes('https://wax.alcor.exchange/api/v3/analytics/tokens/waxcash-graffitiking?window=30d&hide_scam=true') &&
  route.includes('data?.token?.holders?.count') &&
  route.includes('data?.token?.holders?.truncated === true') &&
  route.includes('alcor_token_analytics_holders') &&
  route.includes('holder_count_live'));
ok('token detail exposes backend metric proof fields without frontend changes',
  route.includes('function tokenMetricProof') &&
  route.includes('selected_price_proof') &&
  route.includes('metric_status') &&
  route.includes('selected_price_confidence') &&
  route.includes('liquidity_confidence') &&
  route.includes('tvl_confidence') &&
  route.includes('metric_reason_codes') &&
  route.includes('metric_sources') &&
  route.includes('tvl_basis') &&
  route.includes('liquidity_basis') &&
  route.includes('tvl_liquidity_same_basis') &&
  route.includes('has_market_cap') &&
  route.includes('circulating_supply_x_selected_price') &&
  route.includes('total_supply_x_selected_price'));
ok('token pair endpoint exposes pair contribution proof fields',
  route.includes('function pairContributionProof') &&
  route.includes('pair_contribution_proof') &&
  route.includes('contributes_to_liquidity') &&
  route.includes('contributes_to_tvl') &&
  route.includes('contribution_wax') &&
  route.includes('contribution_usd') &&
  route.includes('valuation_route') &&
  route.includes('route_type') &&
  route.includes('token_side') &&
  route.includes('reserve_side_wax_values') &&
  route.includes('reason_codes'));
ok('bootstrap exposes frontend metric capability flags from backend truth',
  route.includes('function metricCapabilitiesFromTokens') &&
  route.includes('metric_capabilities: metricCapabilities') &&
  route.includes('market_cap: marketCapLive') &&
  route.includes('mcap: marketCapLive') &&
  route.includes('volume_7d') &&
  route.includes('volume_30d'));
ok('indexer health reports systemic dead-token and source health counts',
  route.includes('async function getIndexerHealth') &&
  route.includes('total_indexed_tokens') &&
  route.includes('tokens_with_selected_price') &&
  route.includes('tokens_without_selected_price') &&
  route.includes('tokens_with_indexed_pairs') &&
  route.includes('tokens_with_zero_indexed_pairs') &&
  route.includes('tokens_with_liquidity') &&
  route.includes('tokens_with_24h_volume') &&
  route.includes('tokens_with_chart_candles') &&
  route.includes('per_source_row_counts') &&
  route.includes('stale_sync_rows') &&
  route.includes('last_success_at') &&
  route.includes('dead_token_reason_counts'));
ok('indexer health pair-token counts are scoped to indexed tokens',
  route.includes('FROM waxonedge_tokens t') &&
  route.includes('SELECT COUNT(*) AS count FROM pair_tokens') &&
  route.includes('JOIN pair_tokens pt') &&
  route.includes('FROM scoped_pairs p') &&
  !route.includes('SELECT token_a_contract AS contract, token_a_symbol AS symbol FROM waxonedge_pairs'));
ok('indexer health and debug chart readiness only count 1D candles',
  (route.match(/c\.interval = '1D'/g) || []).length >= 2 &&
  route.includes('WITH candle_tokens AS') &&
  route.includes('JOIN waxonedge_chart_candles c ON c.source = p.source AND c.pair_id = p.pair_id') &&
  route.includes('tokens_with_chart_candles') &&
  route.includes('tokens_with_chart_candidate_but_no_candles'));
ok('indexer health reports partial source progress and candle backfill status',
  route.includes('source_progress') &&
  route.includes('stale_running') &&
  route.includes("status: lastAggregateSuccess?.status || 'failed'") &&
  route.includes('fresh_after_latest_pair_sync: aggregateFresh') &&
  route.includes('candle_backfill') &&
  route.includes('latest_1d_candle_count') &&
  route.includes('chart_candles_indexed_count: chartCandleCount1d') &&
  route.includes('processed_pair_count') &&
  route.includes('attempted_pair_count') &&
  route.includes('failed_pair_count') &&
  route.includes('unsupported_pair_count') &&
  route.includes('budget_exhausted') &&
  route.includes('candles_written') &&
  route.includes('last_error'));
ok('indexer health exposes active runtime mode and internal kline diagnostics',
  route.includes('runtime_config') &&
  route.includes('free_safe_mode: waxonedgeFreeSafeMode(env)') &&
  route.includes('active_candle_backfill_pair_limit: candleBackfillPairLimit(env)') &&
  route.includes('active_trade_index_pair_limit: tradeIndexPairLimit(env)') &&
  route.includes('active_trade_rows_per_market_limit: tradeRowsPerMarketLimit(env)') &&
  route.includes('active_source_page_limit: coreDexPagesPerInvocation(env)') &&
  route.includes('active_cron_rotation_mode') &&
  route.includes('trade_indexing') &&
  route.includes('trade_rows_indexed') &&
  route.includes('no_fake_trades') &&
  route.includes('external_chart_endpoint_unsupported') &&
  route.includes('trade_rows_not_indexed') &&
  route.includes('swap_rows_not_indexed') &&
  route.includes('candles_built_from_trade_rows'));
ok('selected-pair health counts are scoped to indexed tokens',
  route.includes('FROM waxonedge_tokens t') &&
  route.includes('JOIN waxonedge_token_stats s ON s.contract = t.contract AND s.symbol = t.symbol') &&
  route.includes('WHERE s.selected_pair_source IS NOT NULL AND s.selected_pair_id IS NOT NULL') &&
  route.includes('tokens_without_selected_pair: Math.max(0, totalTokens - tokensWithSelectedPair)'));
ok('selected price health counts are scoped to indexed tokens',
  route.includes('FROM waxonedge_tokens t') &&
  route.includes('JOIN waxonedge_token_stats s ON s.contract = t.contract AND s.symbol = t.symbol') &&
  route.includes('WHERE s.selected_price_wax IS NOT NULL OR s.selected_price_usd IS NOT NULL') &&
  route.includes('tokens_without_selected_price: Math.max(0, totalTokens - tokensWithSelectedPrice)'));
ok('token detail loads the bounded indexed-pair route graph without an all-priced-token scan',
  route.includes('function collectTokenPriceKeysForPairs') &&
  route.includes('async function loadRouteGraphRowsForToken') &&
  route.includes('const frontierPredicates = frontierBatch.map') &&
  route.includes("`((token_a_contract = ? AND token_a_symbol = ?) OR (token_b_contract = ? AND token_b_symbol = ?))`") &&
  route.includes('const frontierParams = frontierBatch.flatMap') &&
  route.includes('(token_a_contract = ? AND token_a_symbol = ?)') &&
  route.includes('(token_b_contract = ? AND token_b_symbol = ?)') &&
  route.includes("CAST(COALESCE(liquidity_wax, '0') AS NUMERIC) DESC") &&
  route.includes('updated_at DESC') &&
  route.includes('source ASC') &&
  route.includes('pair_id ASC') &&
  route.includes("AND CAST(COALESCE(reserve_a, '0') AS NUMERIC) > 0") &&
  route.includes("AND CAST(COALESCE(reserve_b, '0') AS NUMERIC) > 0") &&
  /async function loadRouteGraphRowsForToken[\s\S]*WHERE \$\{frontierPredicates\}[\s\S]*CAST\(COALESCE\(reserve_a, '0'\) AS NUMERIC\) > 0[\s\S]*CAST\(COALESCE\(reserve_b, '0'\) AS NUMERIC\) > 0[\s\S]*ORDER BY[\s\S]*CAST\(COALESCE\(liquidity_wax, '0'\) AS NUMERIC\) DESC[\s\S]*LIMIT \?`/.test(route) &&
  route.includes('const graphRows = options.graphRows || await loadRouteGraphRowsForToken(db, contract, symbol)') &&
  route.includes('const priceRows = await loadTokenPriceRowsForPairs(db, graphRows)') &&
  route.includes('const detail = await getToken(db, contract, symbol, { includeRouteContext: true })') &&
  route.includes('delete detail.route_context') &&
  route.includes('const routeIndex = routeContext.routeIndex || buildOgWaxRouteGraph(graphRows, priceIndex)') &&
  route.includes('const routeIndex = options.routeIndex || buildOgWaxRouteGraph(graphPairRows, priceIndex)') &&
  route.includes('{ routeIndex: aggregateRouteIndex }') &&
  !route.includes('async function loadAllPairRowsForGraph') &&
  !route.includes("(token_a_contract || '::' || token_a_symbol) IN") &&
  !route.includes("(token_b_contract || '::' || token_b_symbol) IN") &&
  !route.includes('queue.shift()') &&
  !route.includes('WHERE price_wax IS NOT NULL OR price_usd IS NOT NULL'));
{
  const directWaxPair = {
    source: 'swap.nefty',
    pair_id: 'WAXWUFB',
    token_a_contract: 'eosio.token',
    token_a_symbol: 'WAX',
    token_b_contract: 'wuffi',
    token_b_symbol: 'WUF',
    price: '500',
    change_24h: null,
    volume_24h_wax: '50',
    liquidity_wax: '999999999',
    liquidity_usd: '999999',
    reserve_a: '1000',
    reserve_b: '500000',
  };
  const wufAbcPair = {
    source: 'swap.taco',
    pair_id: 'WUFABC',
    token_a_contract: 'wuffi',
    token_a_symbol: 'WUF',
    token_b_contract: 'abc.token',
    token_b_symbol: 'ABC',
    price: '0.001',
    change_24h: null,
    volume_24h_wax: '10',
    liquidity_wax: '999999999',
    liquidity_usd: '999999',
    reserve_a: '100000',
    reserve_b: '100',
  };
  const abcWaxPair = {
    source: 'swap.box',
    pair_id: 'ABCWAX',
    token_a_contract: 'abc.token',
    token_a_symbol: 'ABC',
    token_b_contract: 'eosio.token',
    token_b_symbol: 'WAX',
    price: '2',
    reserve_a: '100',
    reserve_b: '200',
  };
  const routePriceRows = [
    { contract: 'eosio.token', symbol: 'WAX', price_wax: '1', price_usd: '0.006' },
  ];
  const routePriceIndex = new Map([['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }]]);
  const graphRows = [directWaxPair, wufAbcPair, abcWaxPair];
  const routeIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph(graphRows, routePriceIndex);
  const waxRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('eosio.token::WAX', routeIndex);
  const wufRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('wuffi::WUF', routeIndex);
  const abcRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('abc.token::ABC', routeIndex);
  ok('OG WAX route graph keeps WAX as the 1 WAX root and derives direct route prices',
    waxRoute?.priceWax === 1 &&
    waxRoute.route_type === 'wax_self' &&
    Number(wufRoute?.priceWax) === 0.002 &&
    wufRoute.route_type === 'direct_wax' &&
    Number(abcRoute?.priceWax) === 2);
  const wufStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    {
      contract: 'wuffi',
      symbol: 'WUF',
      total_supply: '8846134110430.9018',
    },
    {
      aggregate_complete: 0,
      aggregate_truncated: 0,
    },
    [directWaxPair, wufAbcPair],
    routePriceRows,
    graphRows,
  );
  ok('WUF-style partial aggregate uses OG route-graph price and sane direct reserve liquidity',
    wufStats.aggregate_status === 'Pair liquidity indexed; holder/candle metrics pending' &&
    wufStats.selected_pair_source === 'swap.nefty' &&
    wufStats.selected_pair_id === 'WAXWUFB' &&
    wufStats.selected_price_proof.live === true &&
    wufStats.selected_price_proof.route_type === 'liquidity_weighted_median_verified_pair' &&
    wufStats.selected_price_proof.valuation_route === 'liquidity_weighted_median_verified_pair' &&
    wufStats.selected_price_proof.route_hops.length === 1 &&
    Number(wufStats.selected_price_wax) === 0.002 &&
    wufStats.metric_status.fdv.live === true &&
    wufStats.metric_status.market_cap.live === false &&
    wufStats.metric_status.market_cap.requires_circulating_supply === true &&
    wufStats.tvl_basis === 'direct_indexed_pair_reserves' &&
    wufStats.liquidity_basis === 'direct_indexed_pair_reserves' &&
    wufStats.tvl_liquidity_same_basis === true &&
    wufStats.selected_price_source.includes('swap.nefty') &&
    wufStats.indexed_pair_count === 2 &&
    wufStats.source_count === 2 &&
    Number(wufStats.liquidity_wax) === 2400 &&
    Number(wufStats.cumulated_pair_liquidity_wax) === 2400 &&
    Number(wufStats.tvl_wax) === 2400 &&
    Number(wufStats.tvl_usd) === 14.4 &&
    wufStats.strongest_pair.liquidity_wax != null &&
    'liquidity_usd' in wufStats.strongest_pair &&
    Number(wufStats.strongest_pair.liquidity_wax) === 2000 &&
    wufStats.strongest_pair.liquidity_usd === null &&
    Number(wufStats.strongest_pair.route_liquidity_score) === 2000 &&
    Number(wufStats.volume_24h_wax) === 60 &&
    wufStats.change_24h == null &&
    Number(wufStats.fdv_wax) > 0 &&
    wufStats.unavailable_reasons.price_change_24h === 'Requires indexed 24h price-change data');
  const rawNonWaxVolumeStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    {
      contract: 'wuffi',
      symbol: 'WUF',
      total_supply: '1000000',
    },
    {
      aggregate_complete: 0,
    },
    [
      {
        ...wufAbcPair,
        pair_id: 'WUFABC_RAW_VOLUME',
        volume_24h: '2500',
        volume_24h_wax: null,
        volume_24h_usd: null,
      },
    ],
    [
      { contract: 'eosio.token', symbol: 'WAX', price_wax: '1', price_usd: '0.006' },
      { contract: 'wuffi', symbol: 'WUF', price_wax: '0.002', price_usd: '0.000012' },
      { contract: 'abc.token', symbol: 'ABC', price_wax: '2', price_usd: '0.012' },
    ],
    graphRows,
  );
  ok('non-WAX pair raw volume converts through token price rows when volume_24h_wax is missing',
    Number(rawNonWaxVolumeStats.volume_24h_wax) === 5 &&
    Number(rawNonWaxVolumeStats.volume_24h_usd) === 0.03);
  const staleTvlStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    {
      contract: 'wuffi',
      symbol: 'WUF',
      total_supply: '1000000',
    },
    {
      aggregate_complete: 0,
      liquidity_wax: '999999',
      liquidity_usd: '9999',
      tvl_wax: '888888',
      tvl_usd: '8888',
    },
    [directWaxPair, wufAbcPair],
    routePriceRows,
    graphRows,
  );
  ok('same-basis TVL is recomputed from OG reserve value instead of stale stored stats',
    Number(staleTvlStats.liquidity_wax) === 2400 &&
    Number(staleTvlStats.tvl_wax) === 2400 &&
    Number(staleTvlStats.liquidity_usd) === 14.4 &&
    Number(staleTvlStats.tvl_usd) === 14.4 &&
    staleTvlStats.liquidity_wax !== '999999' &&
    staleTvlStats.liquidity_usd !== '9999' &&
    staleTvlStats.tvl_liquidity_same_basis === true);
  const staleStoredProof = __waxonedgeTestHooks.tokenMetricProof({
    selected_price_wax: '1',
    selected_price_source: 'stored',
    liquidity_wax: '999999999',
    liquidity_usd: '999999',
    tvl_wax: '888888888',
    tvl_usd: '888888',
  });
  ok('stored impossible liquidity and TVL are not proof-backed without reserve basis',
    staleStoredProof.liquidity_confidence === 'unavailable' &&
    staleStoredProof.tvl_confidence === 'unavailable' &&
    staleStoredProof.has_liquidity === false &&
    staleStoredProof.has_tvl === false &&
    staleStoredProof.metric_status.liquidity.reason === 'Requires valued indexed pair reserves' &&
    staleStoredProof.metric_status.tvl.reason === 'Requires valued indexed pair reserves');
  const lowWaxDirectStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    { contract: 'wuffi', symbol: 'WUF', total_supply: '1000000' },
    { selected_price_wax: '9', selected_price_usd: '9', selected_pair_source: 'stale', selected_pair_id: 'stale' },
    [
      {
        source: 'swap.taco',
        pair_id: 'LOWWAX',
        token_a_contract: 'eosio.token',
        token_a_symbol: 'WAX',
        token_b_contract: 'wuffi',
        token_b_symbol: 'WUF',
        reserve_a: '50',
        reserve_b: '5000',
        liquidity_wax: '999999',
        liquidity_usd: '8888',
      },
    ],
    routePriceRows,
  );
  ok('low-liquidity direct WAX route is allowed and no fixed 100 WAX threshold blocks price',
    Number(lowWaxDirectStats.selected_price_wax) === 0.01 &&
    Number(lowWaxDirectStats.selected_price_usd) === 0.00006 &&
    lowWaxDirectStats.selected_pair_source === 'swap.taco' &&
    lowWaxDirectStats.selected_pair_id === 'LOWWAX' &&
    Number(lowWaxDirectStats.liquidity_wax) === 100 &&
    Number(lowWaxDirectStats.liquidity_usd) === 0.6);
  const waxpWaxPair = {
    source: 'swap.taco',
    pair_id: 'WAXPWAX',
    token_a_contract: 'token.waxp',
    token_a_symbol: 'WAXP',
    token_b_contract: 'eosio.token',
    token_b_symbol: 'WAX',
    reserve_a: '1000',
    reserve_b: '1000',
  };
  const waxpWaxcashPair = {
    source: 'swap.nefty',
    pair_id: 'WAXPWAXCASH_BAD',
    token_a_contract: 'token.waxp',
    token_a_symbol: 'WAXP',
    token_b_contract: 'graffitiking',
    token_b_symbol: 'WAXCASH',
    reserve_a: '1',
    reserve_b: '500000',
  };
  const waxpStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    { contract: 'token.waxp', symbol: 'WAXP', circulating_supply: '1000000', total_supply: '1000000' },
    { aggregate_complete: 0 },
    [waxpWaxcashPair, waxpWaxPair],
    routePriceRows,
    [waxpWaxcashPair, waxpWaxPair],
  );
  ok('WAXP visible bubble uses its own clean selected market price instead of contaminated WAXCASH route price',
    Number(waxpStats.selected_price_wax) === 1 &&
    Number(waxpStats.market_cap_wax) === 1000000 &&
    waxpStats.selected_pair_id === 'WAXPWAX' &&
    waxpStats.selected_price_route === 'liquidity_weighted_median_verified_pair' &&
    waxpStats.selected_price_rejection_reason == null &&
    waxpStats.market_cap_rejection_reason == null);
  const stableWaxPair = {
    source: 'swap.box',
    pair_id: 'WAXUSDCWAX',
    token_a_contract: 'eth.token',
    token_a_symbol: 'WAXUSDC',
    token_b_contract: 'eosio.token',
    token_b_symbol: 'WAX',
    reserve_a: '100',
    reserve_b: '22500',
  };
  const stableWaxcashPair = {
    source: 'swap.nefty',
    pair_id: 'WAXUSDCWAXCASH_BAD',
    token_a_contract: 'eth.token',
    token_a_symbol: 'WAXUSDC',
    token_b_contract: 'graffitiking',
    token_b_symbol: 'WAXCASH',
    reserve_a: '1',
    reserve_b: '900000',
  };
  const stableStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    { contract: 'eth.token', symbol: 'WAXUSDC', circulating_supply: '1000', total_supply: '1000' },
    { aggregate_complete: 0 },
    [stableWaxcashPair, stableWaxPair],
    routePriceRows,
    [stableWaxcashPair, stableWaxPair],
  );
  ok('WAXUSDC-style stable token rejects circular WAXCASH route artefacts and keeps sane WAX market price',
    Number(stableStats.selected_price_wax) === 225 &&
    Number(stableStats.selected_price_usd) === 1.35 &&
    Number(stableStats.market_cap_wax) === 225000 &&
    stableStats.selected_pair_id === 'WAXUSDCWAX' &&
    Number(stableStats.selected_price_wax) < 1000);
  const badWaxcashOnlyStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    { contract: 'bad.route', symbol: 'BAD', circulating_supply: '1000', total_supply: '1000' },
    { aggregate_complete: 0 },
    [{
      source: 'swap.taco',
      pair_id: 'BADWAXCASH',
      token_a_contract: 'bad.route',
      token_a_symbol: 'BAD',
      token_b_contract: 'graffitiking',
      token_b_symbol: 'WAXCASH',
      reserve_a: '1',
      reserve_b: '1000000',
    }],
    routePriceRows,
    [
      {
        source: 'swap.taco',
        pair_id: 'BADWAXCASH',
        token_a_contract: 'bad.route',
        token_a_symbol: 'BAD',
        token_b_contract: 'graffitiking',
        token_b_symbol: 'WAXCASH',
        reserve_a: '1',
        reserve_b: '1000000',
      },
      {
        source: 'swap.box',
        pair_id: 'BADWAX',
        token_a_contract: 'bad.route',
        token_a_symbol: 'BAD',
        token_b_contract: 'eosio.token',
        token_b_symbol: 'WAX',
        reserve_a: '1',
        reserve_b: '1',
      },
    ],
  );
  ok('WAXCASH direct pair token with bad recursive route shows unavailable instead of fake market cap',
    badWaxcashOnlyStats.selected_price_wax == null &&
    badWaxcashOnlyStats.market_cap_wax == null &&
    badWaxcashOnlyStats.selected_price_confidence === 'unavailable' &&
    badWaxcashOnlyStats.metric_status.market_cap.live === false &&
    badWaxcashOnlyStats.selected_price_rejection_reason.includes('quote_route_touches_selected_token') &&
    badWaxcashOnlyStats.market_cap_rejection_reason === 'selected_price_unavailable');
  const multiHopStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    { contract: 'wuffi', symbol: 'WUF', total_supply: '1000000' },
    { selected_price_wax: '9', selected_price_usd: '9' },
    [wufAbcPair],
    routePriceRows,
    [wufAbcPair, abcWaxPair],
  );
  ok('token with no direct WAX pool gets selected price through a provable multi-hop WAX route',
    Number(multiHopStats.selected_price_wax) === 0.002 &&
    Number(multiHopStats.selected_price_usd) === 0.000012 &&
    multiHopStats.selected_price_proof.route_type === 'liquidity_weighted_median_verified_pair' &&
    multiHopStats.selected_pair_id === 'WUFABC' &&
    multiHopStats.selected_price_proof.route_hops.length === 1 &&
    Number(multiHopStats.liquidity_wax) === 400 &&
    Number(multiHopStats.liquidity_usd) === 2.4);
  const longRouteRows = [
    {
      source: 'swap.taco',
      pair_id: 'WUFAAA',
      token_a_contract: 'wuffi',
      token_a_symbol: 'WUF',
      token_b_contract: 'aaa.token',
      token_b_symbol: 'AAA',
      price: '2',
      reserve_a: '100',
      reserve_b: '200',
    },
    {
      source: 'swap.nefty',
      pair_id: 'AAABBB',
      token_a_contract: 'aaa.token',
      token_a_symbol: 'AAA',
      token_b_contract: 'bbb.token',
      token_b_symbol: 'BBB',
      price: '3',
      reserve_a: '100',
      reserve_b: '300',
    },
    {
      source: 'swap.box',
      pair_id: 'BBBWAX',
      token_a_contract: 'bbb.token',
      token_a_symbol: 'BBB',
      token_b_contract: 'eosio.token',
      token_b_symbol: 'WAX',
      price: '6',
      reserve_a: '100',
      reserve_b: '600',
    },
  ];
  const longRouteIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph(longRouteRows, routePriceIndex);
  const longWufRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('wuffi::WUF', longRouteIndex);
  ok('long but valid bounded multi-hop WAX route is accepted with hop proof',
    Number(longWufRoute?.priceWax) === 36 &&
    longWufRoute.route_type === 'multi_hop_wax' &&
    longWufRoute.route_hops.length === 3);
  const aggregateTotals = __waxonedgeTestHooks.aggregatePairContributionTotals(
    [
      directWaxPair,
      wufAbcPair,
      {
        source: 'swap.box',
        pair_id: 'WUFZZZ',
        token_a_contract: 'wuffi',
        token_a_symbol: 'WUF',
        token_b_contract: 'zzz.token',
        token_b_symbol: 'ZZZ',
        price: '0.001',
        reserve_a: '1',
        reserve_b: '1',
      },
    ],
    'wuffi',
    'WUF',
    routePriceIndex,
    graphRows,
  );
  ok('aggregate pair contribution totals sum all route-valued pairs and count unresolved pairs',
    aggregateTotals.indexed_pair_count === 3 &&
    aggregateTotals.source_count === 3 &&
    aggregateTotals.contributing_pair_count === 2 &&
    aggregateTotals.liquidity_contribution_count === 2 &&
    aggregateTotals.tvl_contribution_count === 2 &&
    aggregateTotals.unresolved_pair_count === 1 &&
    Number(aggregateTotals.total_liquidity_wax) === 2400 &&
    Number(aggregateTotals.total_tvl_wax) === 2400 &&
    Number(aggregateTotals.total_liquidity_usd) === 14.4 &&
    Number(aggregateTotals.total_tvl_usd) === 14.4 &&
    aggregateTotals.liquidity_basis === 'og_wax_route_pool_graph' &&
    aggregateTotals.tvl_basis === 'og_wax_route_pool_graph');
  const noWaxUsdTotals = __waxonedgeTestHooks.aggregatePairContributionTotals(
    [{ ...directWaxPair, liquidity_usd: '1234' }],
    'wuffi',
    'WUF',
    new Map([['eosio.token::WAX', { priceWax: 1, priceUsd: null }]]),
  );
  ok('unknown WAX/USD keeps USD totals null instead of falling back to stored USD',
    Number(noWaxUsdTotals.total_liquidity_wax) === 2000 &&
    noWaxUsdTotals.total_liquidity_usd === null &&
    noWaxUsdTotals.total_tvl_usd === null);
  const unknownTotals = __waxonedgeTestHooks.aggregatePairContributionTotals(
    [
      {
        source: 'swap.box',
        pair_id: 'NODIRECT',
        token_a_contract: 'wuffi',
        token_a_symbol: 'WUF',
        token_b_contract: 'abc.token',
        token_b_symbol: 'ABC',
        reserve_a: '10',
        reserve_b: '20',
        liquidity_wax: '444',
        liquidity_usd: '555',
      },
      {
        source: 'swap.taco',
        pair_id: 'NORESERVE',
        token_a_contract: 'eosio.token',
        token_a_symbol: 'WAX',
        token_b_contract: 'wuffi',
        token_b_symbol: 'WUF',
        reserve_a: null,
        reserve_b: null,
        liquidity_wax: '999',
        liquidity_usd: '111',
      },
    ],
    'wuffi',
    'WUF',
    routePriceIndex,
  );
  ok('unknown aggregate totals stay null instead of fake zero or stored fallback',
    unknownTotals.indexed_pair_count === 2 &&
    unknownTotals.contributing_pair_count === 0 &&
    unknownTotals.unresolved_pair_count === 2 &&
    unknownTotals.total_liquidity_wax === null &&
    unknownTotals.total_liquidity_usd === null &&
    unknownTotals.total_tvl_wax === null &&
    unknownTotals.total_tvl_usd === null &&
    unknownTotals.liquidity_basis === null &&
    unknownTotals.tvl_basis === null &&
    unknownTotals.tvl_liquidity_same_basis === false);
  ok('aggregate totals track known currencies explicitly and preserve real computed zero checks',
    route.includes('let hasLiquidityWax = false') &&
    route.includes('let hasLiquidityUsd = false') &&
    route.includes('if (wax != null)') &&
    route.includes('if (usd != null)') &&
    route.includes('total_liquidity_wax: hasLiquidityWax ? safeDecimal(liquidityWax) : null') &&
    route.includes('total_liquidity_usd: hasLiquidityUsd ? safeDecimal(liquidityUsd) : null') &&
    !route.includes('total_liquidity_wax: liquidityCount ? safeDecimal(liquidityWax) : null') &&
    !route.includes('total_liquidity_usd: liquidityCount ? safeDecimal(liquidityUsd) : null'));
  ok('bootstrap/debug/pairs valuation totals use the same OG proof result shape',
    Number(wufStats.liquidity_wax) === Number(aggregateTotals.total_liquidity_wax) &&
    Number(wufStats.liquidity_usd) === Number(aggregateTotals.total_liquidity_usd) &&
    Number(wufStats.tvl_wax) === Number(aggregateTotals.total_tvl_wax) &&
    Number(wufStats.tvl_usd) === Number(aggregateTotals.total_tvl_usd));
  const marketCapProofWithoutCirculating = __waxonedgeTestHooks.tokenMetricProof({
    selected_price_wax: '2',
    market_cap_wax: '200',
    fdv_wax: '1000',
  });
  const marketCapProofWithCirculating = __waxonedgeTestHooks.tokenMetricProof({
    selected_price_wax: '2',
    circulating_supply: '100',
    market_cap_wax: '200',
    fdv_wax: '1000',
  });
  const marketCapDerivedStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    { contract: 'wuffi', symbol: 'WUF', total_supply: '500', circulating_supply: '100' },
    {},
    [directWaxPair],
    routePriceRows,
    graphRows,
    { routeIndex },
  );
  ok('market cap proof requires circulating supply while FDV remains total-supply based',
    marketCapProofWithoutCirculating.has_market_cap === false &&
    marketCapProofWithoutCirculating.metric_status.market_cap.live === false &&
    marketCapProofWithoutCirculating.metric_status.fdv.basis === 'total_supply_x_selected_price' &&
    marketCapProofWithCirculating.has_market_cap === true &&
    marketCapProofWithCirculating.metric_status.market_cap.basis === 'circulating_supply_x_selected_price');
  ok('backend derives market cap from circulating supply and verified selected price',
    Number(marketCapDerivedStats.selected_price_wax) === 0.002 &&
    Number(marketCapDerivedStats.market_cap_wax) === 0.2 &&
    Number(marketCapDerivedStats.fdv_wax) === 1 &&
    marketCapDerivedStats.metric_status.market_cap.live === true &&
    marketCapDerivedStats.metric_status.market_cap.basis === 'circulating_supply_x_selected_price');
  const changedDirectWaxPair = {
    ...directWaxPair,
    pair_id: 'WAXWUFA',
    reserve_a: '2000',
    reserve_b: '500000',
    updated_at: '2026-06-18T12:00:00.000Z',
  };
  const instantUpdates = __waxonedgeTestHooks.instantLiveTokenUpdatesForVerifiedPairEvent({
    changedPair: changedDirectWaxPair,
    tokenRows: [
      { contract: 'wuffi', symbol: 'WUF', total_supply: '500', circulating_supply: '100' },
      { contract: 'eosio.token', symbol: 'WAX', total_supply: '1000000', circulating_supply: '1000000' },
      { contract: 'abc.token', symbol: 'ABC', total_supply: '1000', circulating_supply: '10' },
    ],
    pairRows: [changedDirectWaxPair, wufAbcPair],
    priceRows: routePriceRows,
    updatedAt: '2026-06-18T12:00:00.000Z',
  });
  const instantWuf = instantUpdates.find((update) => update.token_key === 'wuffi::WUF');
  const instantAbc = instantUpdates.find((update) => update.token_key === 'abc.token::ABC');
  ok('instant live token_update recomputes market_cap_wax from changed verified pair reserves',
    instantWuf &&
    Math.abs(Number(instantWuf.selected_price_wax) - 0.004) < 0.0000000001 &&
    Math.abs(Number(instantWuf.market_cap_wax) - 0.4) < 0.0000000001 &&
    instantWuf.market_cap_confidence === 'good' &&
    instantWuf.proof_status === 'verified' &&
    !!instantWuf.selected_pair_source &&
    !!instantWuf.selected_pair_id &&
    instantWuf.updated_at === '2026-06-18T12:00:00.000Z',
    JSON.stringify(instantWuf));
  ok('instant live token_update emits graph_liquidity_wax separately from market_cap_wax',
    instantWuf &&
    Number(instantWuf.graph_liquidity_wax) === 4800 &&
    Number(instantWuf.market_cap_wax) === 0.4 &&
    Number(instantWuf.graph_liquidity_wax) !== Number(instantWuf.market_cap_wax));
  ok('instant live recompute includes dependent graph nodes whose selected route uses the changed pair',
    instantAbc &&
    instantAbc.token_key === 'abc.token::ABC' &&
    Number(instantAbc.selected_price_wax) > 0 &&
    Number(instantAbc.market_cap_wax) > 0 &&
    instantAbc.selected_price_confidence === 'good',
    JSON.stringify({ instantAbc, tokenKeys: instantUpdates.map((update) => update.token_key) }));
  const noSupplyInstantUpdate = __waxonedgeTestHooks.instantLiveTokenUpdatesForVerifiedPairEvent({
    changedPair: changedDirectWaxPair,
    tokenRows: [
      { contract: 'wuffi', symbol: 'WUF', total_supply: '500' },
    ],
    pairRows: [changedDirectWaxPair],
    priceRows: routePriceRows,
    updatedAt: '2026-06-18T12:00:01.000Z',
  }).find((update) => update.token_key === 'wuffi::WUF');
  ok('instant live token_update leaves market_cap_wax unavailable when circulating supply is missing',
    noSupplyInstantUpdate &&
    Math.abs(Number(noSupplyInstantUpdate.selected_price_wax) - 0.004) < 0.0000000001 &&
    noSupplyInstantUpdate.market_cap_wax === null &&
    noSupplyInstantUpdate.market_cap_usd === null &&
    noSupplyInstantUpdate.market_cap_confidence === 'unavailable' &&
    Number(noSupplyInstantUpdate.graph_liquidity_wax) === 4000,
    JSON.stringify(noSupplyInstantUpdate));
  const noPriceInstantUpdate = __waxonedgeTestHooks.instantLiveTokenUpdatesForVerifiedPairEvent({
    changedPair: { ...changedDirectWaxPair, reserve_a: null, reserve_b: null },
    tokenRows: [
      { contract: 'wuffi', symbol: 'WUF', total_supply: '500', circulating_supply: '100' },
    ],
    pairRows: [{ ...changedDirectWaxPair, reserve_a: null, reserve_b: null }],
    priceRows: routePriceRows,
    updatedAt: '2026-06-18T12:00:02.000Z',
  }).find((update) => update.token_key === 'wuffi::WUF');
  ok('instant live token_update does not emit fake market cap when verified selected price is unavailable',
    noPriceInstantUpdate == null);
  const pairProof = __waxonedgeTestHooks.pairContributionProof(
    directWaxPair,
    'wuffi',
    'WUF',
    routePriceIndex,
    routeIndex,
  );
  ok('pair contribution proof reports route, side, contribution, and reserve values',
    pairProof.token_side === 'b' &&
    pairProof.route_type === 'direct_wax' &&
    pairProof.valuation_route === 'selected_price_route_pool' &&
    pairProof.contributes_to_liquidity === true &&
    pairProof.contributes_to_tvl === true &&
    Number(pairProof.contribution_wax) === 2000 &&
    Number(pairProof.contribution_usd) === 12 &&
    pairProof.basis === 'og_wax_route_pool_graph' &&
    pairProof.reserve_side_wax_values.token != null &&
    pairProof.reserve_side_wax_values.quote != null &&
    Array.isArray(pairProof.reason_codes) &&
    pairProof.reason_codes.length === 0);
  const waxPairProof = __waxonedgeTestHooks.pairContributionProof(
    directWaxPair,
    'eosio.token',
    'WAX',
    routePriceIndex,
    routeIndex,
  );
  ok('WAX token pool proof treats WAX as the graph root and values both reserve sides',
    waxPairProof.token_side === 'a' &&
    waxPairProof.route_type === 'wax_self' &&
    waxPairProof.contributes_to_liquidity === true &&
    waxPairProof.contributes_to_tvl === true &&
    Number(waxPairProof.contribution_wax) === 2000 &&
    Number(waxPairProof.contribution_usd) === 12 &&
    waxPairProof.wax_price_used === '1' &&
    Array.isArray(waxPairProof.reason_codes) &&
    waxPairProof.reason_codes.length === 0);
  const waxOnlyRouteIndex = new Map([['eosio.token::WAX', {
    priceWax: 1,
    priceUsd: 0.006,
    route_type: 'wax_self',
    route_hops: [],
    route_liquidity_score: null,
  }]]);
  const waxAwareProof = __waxonedgeTestHooks.pairContributionProof(
    {
      source: 'swap.taco',
      pair_id: 'WAXNOQUOTE',
      token_a_contract: 'eosio.token',
      token_a_symbol: 'WAX',
      token_b_contract: 'no.route',
      token_b_symbol: 'NOROUTE',
      reserve_a: '42',
      reserve_b: '1000000',
      liquidity_wax: '999999',
      liquidity_usd: '999999',
    },
    'eosio.token',
    'WAX',
    routePriceIndex,
    waxOnlyRouteIndex,
  );
  ok('WAX-aware valuation derives WAX pool value from WAX-side reserve without requiring a non-WAX route',
    waxAwareProof.token_side === 'a' &&
    waxAwareProof.route_type === 'wax_self' &&
    Number(waxAwareProof.contribution_wax) === 84 &&
    Number(waxAwareProof.contribution_usd) === 0.504 &&
    Number(waxAwareProof.reserve_side_wax_values.token) === 42 &&
    waxAwareProof.reserve_side_wax_values.quote === null &&
    !waxAwareProof.reason_codes.includes('token_b_no_wax_route') &&
    !waxAwareProof.reason_codes.includes('not_direct_wax_pair'));
  const multiHopPairProof = __waxonedgeTestHooks.pairContributionProof(
    wufAbcPair,
    'wuffi',
    'WUF',
    routePriceIndex,
    routeIndex,
  );
  ok('non-direct pair contributes when both sides route to WAX through the graph',
    multiHopPairProof.route_type === 'direct_wax' &&
    multiHopPairProof.valuation_route === 'routed_wax_pool_value' &&
    Number(multiHopPairProof.contribution_wax) === 400 &&
    Number(multiHopPairProof.contribution_usd) === 2.4 &&
    multiHopPairProof.reason_codes.length === 0);
  const unresolvedPairProof = __waxonedgeTestHooks.pairContributionProof(
    wufAbcPair,
    'wuffi',
    'WUF',
    routePriceIndex,
  );
  ok('unresolved pair without a WAX route is listed with reason and no stored-liquidity contribution',
    unresolvedPairProof.route_type === 'unresolved' &&
    unresolvedPairProof.valuation_route === 'unresolved' &&
    unresolvedPairProof.unresolved_reason === 'token_a_no_wax_route' &&
    unresolvedPairProof.contribution_wax === null &&
    unresolvedPairProof.contribution_usd === null &&
    unresolvedPairProof.reason_codes.includes('token_a_no_wax_route'));
  const badReserveIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph([
    { ...directWaxPair, pair_id: 'ZERO', reserve_a: '0', reserve_b: '500000' },
    { ...directWaxPair, pair_id: 'NEGATIVE_RESERVE', reserve_a: '-1', reserve_b: '500000', price: '-1' },
  ], routePriceIndex);
  ok('zero and negative reserve pairs are rejected from route graph',
    __waxonedgeTestHooks.selectOgWaxRoutePrice('wuffi::WUF', badReserveIndex) == null);
  const suppliedRouteStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    { contract: 'wuffi', symbol: 'WUF', total_supply: '1000000' },
    { aggregate_complete: 0 },
    [wufAbcPair],
    routePriceRows,
    [],
    { routeIndex },
  );
  ok('deriveTokenPairMetrics reuses supplied aggregate route graph instead of rebuilding per token',
    Number(suppliedRouteStats.selected_price_wax) === 0.002 &&
    Number(suppliedRouteStats.liquidity_wax) === 400 &&
    suppliedRouteStats.selected_price_proof.route_type === 'liquidity_weighted_median_verified_pair' &&
    suppliedRouteStats.selected_pair_id === 'WUFABC');
  const caps = __waxonedgeTestHooks.metricCapabilitiesFromTokens([
    { selected_price_wax: '1', market_cap_wax: '20', fdv_wax: '50', volume_7d: null },
    { selected_price_wax: '2', circulating_supply: '10', market_cap_wax: '20', volume_7d: '7', volume_30d: null },
  ]);
  ok('bootstrap metric capabilities require circulating supply for market cap',
    caps.price === true &&
    caps.market_cap === true &&
    caps.mcap === true &&
    caps.volume_7d === true &&
    caps.volume_30d === false);
  const preservedChangeStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
    {
      contract: 'wuffi',
      symbol: 'WUF',
      total_supply: '8846134110430.9018',
    },
    {
      aggregate_complete: 0,
      change_24h: '1.23',
    },
    [
      {
        source: 'swap.nefty',
        pair_id: 'WAXWUFB',
        token_a_contract: 'eosio.token',
        token_a_symbol: 'WAX',
        token_b_contract: 'wuffi',
        token_b_symbol: 'WUF',
        price: '500',
        change_24h: null,
        volume_24h_wax: '50',
        liquidity_wax: '2000',
        reserve_a: '1000',
        reserve_b: '500000',
      },
    ],
    [
      { contract: 'eosio.token', symbol: 'WAX', price_wax: '1', price_usd: '0.006' },
    ],
  );
  ok('token detail preserves aggregate change_24h when selected pair change is missing',
    preservedChangeStats.selected_pair_id === 'WAXWUFB' &&
    preservedChangeStats.change_24h === '1.23' &&
    preservedChangeStats.price_change_24h === '1.23');
  const priceKeys = __waxonedgeTestHooks.collectTokenPriceKeysForPairs([
    {
      token_a_contract: 'wuffi',
      token_a_symbol: 'WUF',
      token_b_contract: 'abc.token',
      token_b_symbol: 'ABC',
    },
  ]).map((entry) => entry.contract + '::' + entry.symbol);
  ok('token detail price lookup key set is bounded to WAX, preferred quotes, and selected pair tokens',
    priceKeys.includes('eosio.token::WAX') &&
    priceKeys.includes('wuffi::WUF') &&
    priceKeys.includes('abc.token::ABC') &&
    priceKeys.includes('usdt.alcor::USDT') &&
    !priceKeys.includes('random.token::RANDOM'));
  const deadDiagnostics = __waxonedgeTestHooks.diagnoseTokenAggregate(
    'dead.token',
    'DEAD',
    {},
    [],
    0,
    false,
  );
  ok('dead token diagnostics return clear unavailable reasons',
    deadDiagnostics.reasons.includes('no indexed pairs found') &&
    deadDiagnostics.reasons.includes('chart candles missing') &&
    deadDiagnostics.reasons.includes('aggregate rebuild not run after pair sync') &&
    deadDiagnostics.facts.indexed_pair_count === 0);
  const derivedLiquidityDiagnostics = __waxonedgeTestHooks.diagnoseTokenAggregate(
    'wuffi',
    'WUF',
    {
      selected_price_wax: '0.002',
      selected_price_usd: '0.000012',
      strongest_pair: { liquidity_wax: '2000' },
    },
    [
      {
        source: 'swap.nefty',
        pair_id: 'WAXWUFB',
        token_a_contract: 'eosio.token',
        token_a_symbol: 'WAX',
        token_b_contract: 'wuffi',
        token_b_symbol: 'WUF',
        liquidity_wax: null,
        reserve_a: '1000',
        reserve_b: '500000',
      },
    ],
    1,
    true,
  );
  ok('dead token diagnostics use derived strongest liquidity fallback',
    Number(derivedLiquidityDiagnostics.facts.strongest_liquidity_wax) === 2000 &&
    !derivedLiquidityDiagnostics.reasons.includes('liquidity found but below threshold') &&
    !derivedLiquidityDiagnostics.reasons.includes('pairs found but no usable reserves'));
}
ok('route has no unused bootstrap source key mirror',
  !route.includes('CORE_BOOTSTRAP_SOURCE_KEYS'));
ok('route does not fake holder distribution', route.includes('Holder distribution requires indexed balance snapshots') && route.includes('REQUIRES_INDEXED_BACKEND'));
ok('route marks chart/trades unavailable unless indexed', route.includes('SOURCE_NOT_INDEXED') && route.includes("child === 'chart'") && route.includes("child === 'trades'"));
ok('token debug explains missing candles, stale aggregates, and partial source sync',
  route.includes('sync_diagnostics') &&
  route.includes('selected_price_exists') &&
  route.includes('selected_pair_exists') &&
  route.includes('pair_rows_exist') &&
  route.includes('source_sync_partial') &&
  route.includes('aggregate_stale') &&
  route.includes('has_1d_candles') &&
  route.includes("nextAction = 'waiting for candle backfill'") &&
  route.includes("nextAction = 'source cursor still partial'"));
ok('frontend calls /api/waxonedge/bootstrap first', frontend.includes("waxonedgeApi('/bootstrap')"));
ok('frontend direct source fetch is diagnostic fallback', frontend.includes('loadDiagnosticFallback') && frontend.includes('Backend bootstrap unavailable'));
ok('frontend does not use Alcor chart fallback in backend mode',
  frontend.includes("loadSelectedTokenChart(context.selection)") &&
  frontend.includes("loadChartData('backend:' + selection.key)") &&
  frontend.includes('renderChartUnavailable(context') &&
  frontend.includes('No fake candles are shown'));
ok('frontend backend chart request captures selection before async call and clears pending',
  frontend.includes('var backendChartKey = marketId') &&
  frontend.includes('var chartContract = state.selected.contract') &&
  frontend.includes('var chartSymbol = state.selected.symbol') &&
  frontend.includes("delete state.chartPending[backendChartKey]") &&
  frontend.includes('.finally(function ()'));
ok('frontend renders backend candle bundles without context.chartMarket',
  frontend.includes('return renderChartBundle(backendBundle, backendMarket, backendChartMeta)') &&
  frontend.includes('function renderChartBundle(bundle, market, chartMetaLabel)'));
ok('frontend renders indexed candles with Lightweight Charts and no full TradingView widget',
  tokenHtml.includes('lightweight-charts@5.2.0') &&
  frontend.includes('window.LightweightCharts') &&
  frontend.includes('tv.createChart') &&
  frontend.includes('CandlestickSeries') &&
  !frontend.includes('TradingView.widget'));
ok('frontend token stats use canonical selected-token detail stats',
  frontend.includes('function loadSelectedTokenDetail(selection)') &&
  frontend.includes('function loadSelectedTokenPairs(selection)') &&
  frontend.includes('function loadSelectedTokenChart(selection)') &&
  frontend.includes('var stats = context.stats || {};') &&
  frontend.includes('var currentPriceWax = asNum(stats.selected_price_wax);') &&
  frontend.includes('var volume24 = asNum(stats.volume_24h_wax);') &&
  frontend.includes('stats.aggregate_status') &&
  frontend.includes('tokenStatReason(stats') &&
  !frontend.includes('var currentPriceWax = token.systemPrice'));
ok('frontend selected-token pairs endpoint loads paginated proof rows',
  frontend.includes("selectedTokenApiPath(selection, 'pairs') + '?limit=100'") &&
  frontend.includes('data.next_cursor') &&
  frontend.includes('return loadPage(data.next_cursor)'));
ok('frontend does not label raw base volume as WAX',
  frontend.includes('rawVolume24: row.volume_24h') &&
  frontend.includes('volume24: asNum(row.volume_24h_wax)') &&
  frontend.includes("volume24Text: row.volume_24h_wax != null ? String(row.volume_24h_wax) + ' WAX' : UNAVAILABLE_TEXT"));
ok('/waxcash.html pair table follows OG-style pair detail columns without status or reserves',
  !waxcashHtml.includes('<th>Pair Reserve Ratio</th>') &&
  !waxcashHtml.includes('<th>Relative Pair Price</th>') &&
  !waxcashHtml.includes('<th>Pair price</th>') &&
  !waxcashHtml.includes('<th>Source</th>') &&
  !waxcashHtml.includes('<th>Fee</th>') &&
  !waxcashHtml.includes('<th>Status</th>') &&
  !waxcashHtml.includes('<th>Reserves</th>') &&
  waxcashHtml.includes('<th>Rank</th>') &&
  waxcashHtml.includes('<th>Exchange</th>') &&
  waxcashHtml.includes('<th>Price</th>') &&
  waxcashHtml.includes('<th>24h price change</th>') &&
  waxcashHtml.includes('<th>7d volume</th>') &&
  waxcashHtml.includes('<th>30d volume</th>') &&
  waxcashHtml.includes('<td colspan="9"'));
ok('WAXCASH analytics frontend renders backend sections instead of raw proof-row guesses',
  waxcashAnalyticsFrontend.includes('payload.sections || {}') &&
  waxcashAnalyticsFrontend.includes('sections.token_stats') &&
  waxcashAnalyticsFrontend.includes('sections.pair_table') &&
  !waxcashAnalyticsFrontend.includes('sections.chart_external') &&
  waxcashAnalyticsFrontend.includes('Unavailable') &&
  waxcashAnalyticsFrontend.includes('row.reason') &&
  !waxcashAnalyticsFrontend.includes('pair_price_relative_to_waxcash'));
ok('WAXCASH analytics frontend keeps values compact and proof reasons in tooltip/detail text',
  waxcashAnalyticsFrontend.includes('function humanReason(reason)') &&
  waxcashAnalyticsFrontend.includes("paired_token_wax_price_unavailable: 'Paired token WAX price unavailable'") &&
  waxcashAnalyticsFrontend.includes("missing_or_zero_reserves: 'Missing or zero reserves'") &&
  waxcashAnalyticsFrontend.includes("direct_wax_price_unavailable: 'Direct WAX price unavailable'") &&
  waxcashAnalyticsFrontend.includes("selected_price_unavailable: 'Selected price unavailable'") &&
  waxcashAnalyticsFrontend.includes('function proofDot(row)') &&
  waxcashAnalyticsFrontend.includes('title=\"') &&
  waxcashAnalyticsFrontend.includes('wx-subvalue') &&
  !waxcashAnalyticsFrontend.includes('Low liquidity') &&
  waxcashHtml.includes('.wx-reason-dot') &&
  !waxcashHtml.includes('.wx-value .wx-reason') &&
  waxcashHtml.includes('table-layout: fixed') &&
  waxcashHtml.includes('white-space: normal') &&
  waxcashHtml.includes('overflow-wrap: anywhere'));
ok('WAXCASH analytics frontend uses TradingView Charting Library with Alcor WAXCASH/WAX feed and no backend chart dependency',
  waxcashHtml.includes('https://alcor.exchange/charting_library/charting_library.standalone.js') &&
  waxcashHtml.includes('new window.TradingView.widget') &&
  waxcashHtml.includes('https://wax.alcor.exchange/api/v2/swap/candles') &&
  waxcashHtml.includes("TOKEN_A = 'waxcash-graffitiking'") &&
  waxcashHtml.includes("TOKEN_B = 'wax-eosio.token'") &&
  waxcashHtml.includes("symbol: 'WAXCASH_WAX'") &&
  waxcashHtml.includes('var subscriptions = {}') &&
  waxcashHtml.includes('function alcorMillis(value)') &&
  waxcashHtml.includes('return time < 100000000000 ? time * 1000 : time') &&
  waxcashHtml.includes('function tradingViewSecondsToAlcorMillis(value)') &&
  waxcashHtml.includes('var fromMs = tradingViewSecondsToAlcorMillis(from)') &&
  waxcashHtml.includes('fetch(candleUrl({ resolution: resolution, from: fromMs, to: toMs }))') &&
  !waxcashHtml.includes('time: Number(candle.time)') &&
  !waxcashHtml.includes('from: from * 1000, to: to * 1000') &&
  waxcashHtml.includes('function fetchLatestBar(resolution)') &&
  waxcashHtml.includes('subscribeBars: function (symbolInfo, resolution, onRealtime, subscriberUID)') &&
  waxcashHtml.includes("symbolInfo.ticker !== 'WAXCASH_WAX'") &&
  waxcashHtml.includes('subscription.timer = setInterval(pollLatestBar') &&
  waxcashHtml.includes('onRealtime(bar)') &&
  waxcashHtml.includes('unsubscribeBars: function (subscriberUID)') &&
  waxcashHtml.includes('clearInterval(subscription.timer)') &&
  !waxcashHtml.includes('Native TradingView Alcor WAXCASH/WAX symbol unavailable') &&
  !waxcashHtml.includes('"symbol": "ALCOR:WAXCASHWAX"') &&
  !waxcashAnalyticsFrontend.includes('sections.chart_external') &&
  !waxcashAnalyticsFrontend.includes('DEFAULT_EXTERNAL_CHART') &&
  !waxcashAnalyticsFrontend.includes('function renderExternalChart(payload)') &&
  !waxcashAnalyticsFrontend.includes('geckoterminal.com') &&
  !waxcashAnalyticsFrontend.includes('https://alcor.exchange/v/wax/analytics/pools/8388') &&
  !waxcashAnalyticsFrontend.includes('wx-external-chart-frame') &&
  !waxcashAnalyticsFrontend.includes('Open external chart') &&
  !waxcashAnalyticsFrontend.includes('wx-external-chart-link') &&
  !waxcashAnalyticsFrontend.includes('renderExternalChart(state.payload)') &&
  !waxcashAnalyticsFrontend.includes('/api/waxonedge/waxcash-analytics/chart-feed') &&
  !waxcashAnalyticsFrontend.includes('loadChartFeed') &&
  !waxcashAnalyticsFrontend.includes('chartFeedUrl') &&
  !waxcashAnalyticsFrontend.includes('renderLightweightCandles') &&
  !waxcashAnalyticsFrontend.includes('tradingViewFeedCandles') &&
  !waxcashAnalyticsFrontend.includes('window.LightweightCharts') &&
  !waxcashAnalyticsFrontend.includes('chartCandles(feed)') &&
  !waxcashAnalyticsFrontend.includes('Array.isArray(chart.candles)') &&
  !waxcashAnalyticsFrontend.includes('renderChart(state.payload') &&
  !waxcashAnalyticsFrontend.includes('WAXP/WAXCASH') &&
  !waxcashAnalyticsFrontend.includes("'Alcor pool #' + external.pool_id + ' display feed'") &&
  !waxcashAnalyticsFrontend.includes('External WAXCASH/WAX display feed') &&
  !waxcashAnalyticsFrontend.includes('pickPoolViews(rows)') &&
  !waxcashAnalyticsFrontend.includes("view.label + ' detail'") &&
  !waxcashAnalyticsFrontend.includes('Best liquidity pool') &&
  !waxcashAnalyticsFrontend.includes('Worst/low liquidity pool') &&
  !waxcashAnalyticsFrontend.includes('Weighted/valued pool view') &&
  !waxcashAnalyticsFrontend.includes('Alcor pool #') &&
  !waxcashHtml.includes('lightweight-charts@5.2.0') &&
  !waxcashHtml.includes('Backend feed only') &&
  !waxcashHtml.includes('Worker UDF-shaped feed') &&
  !waxcashHtml.includes('Lightweight Charts renderer') &&
  !waxcashHtml.includes('wx-lightweight-chart') &&
  !waxcashHtml.includes('Full embedded chart') &&
  !waxcashHtml.includes('Single WAXCASH/WAX feed') &&
  !waxcashHtml.includes('Display-only') &&
  !waxcashHtml.includes('wx-external-chart-frame') &&
  !waxcashHtml.includes('geckoterminal.com') &&
  !waxcashHtml.includes('WAXCASH/WAX GeckoTerminal candle chart') &&
  !waxcashHtml.includes('<iframe') &&
  !waxcashAnalyticsFrontend.includes('<iframe') &&
  !waxcashHtml.includes('https://alcor.exchange/v/wax/analytics/pools/8388') &&
  !waxcashHtml.includes('Open external chart') &&
  !waxcashHtml.includes('wx-external-chart-link') &&
  waxcashHtml.includes('height: 660px') &&
  waxcashHtml.includes('min-height: 660px') &&
  !waxcashHtml.includes('wx-view-controls') &&
  !waxcashHtml.includes('Display-only pair detail views') &&
  !waxcashHtml.includes('Standalone chart display, separate from WaxOnEdge token detail proof.') &&
  waxcashHtml.includes('allowProductionFallback: false') &&
  waxcashHtml.includes('API base URL unavailable — MOONBOYS_API not configured.') &&
  !waxcashHtml.includes('Display-only source-backed pair detail views') &&
  !waxcashHtml.includes('allowProductionFallback: true') &&
  !waxcashHtml.includes('api.PRODUCTION_BASE_URL') &&
  !waxcashHtml.includes('1D source-backed candles') &&
  !waxcashAnalyticsFrontend.includes('Open Alcor chart') &&
  !waxcashAnalyticsFrontend.includes('wx-external-chart-linkcard') &&
  !waxcashAnalyticsFrontend.includes('sandbox=') &&
  !waxcashAnalyticsFrontend.includes('allow-popups') &&
  !waxcashAnalyticsFrontend.includes("var iframe = host.querySelector('.wx-external-chart-frame')") &&
  !waxcashAnalyticsFrontend.includes("if (!iframe) {") &&
  !waxcashAnalyticsFrontend.includes("if (iframe.getAttribute('src') !== external.url) iframe.setAttribute('src', external.url)") &&
  !waxcashHtml.includes('.wx-external-chart-frame') &&
  !waxcashAnalyticsFrontend.includes('External Alcor chart unavailable in embed.') &&
  !/(>|\bvalue=["'])(Deposit|Add Liquidity|Swap|Trade on Swap|Connect Wallet|wallet selector)(<|["'])|transact\(/i.test(waxcashHtml + waxcashAnalyticsFrontend));
ok('WAXCASH analytics frontend keeps pair table and adds WAX-only liquidity/24h volume sorting',
  waxcashHtml.includes('id="wx-sort-liquidity"') &&
  waxcashHtml.includes('data-sort="liquidity"') &&
  waxcashHtml.includes('id="wx-sort-volume24"') &&
  waxcashHtml.includes('data-sort="volume24"') &&
  waxcashHtml.includes('.wx-source-logo') &&
  waxcashHtml.includes('.wx-token-logo') &&
  waxcashHtml.includes('.wx-fee-badge') &&
  waxcashAnalyticsFrontend.includes('function sortedPairRows(rows)') &&
  waxcashAnalyticsFrontend.includes('function defaultPairSort(rows)') &&
  waxcashAnalyticsFrontend.includes('function sourceLogoUrl(row)') &&
  waxcashAnalyticsFrontend.includes('function sourceCell(row)') &&
  waxcashAnalyticsFrontend.includes('function tokenIconUrl(row, side)') &&
  waxcashAnalyticsFrontend.includes('function tokenSideLabel(row, side)') &&
  waxcashAnalyticsFrontend.includes('function pairCell(row)') &&
  waxcashAnalyticsFrontend.includes("'swap.nefty': '/img/waxonedge/dex/neftyblocks.png'") &&
  waxcashAnalyticsFrontend.includes("'swap.alcor': '/img/waxonedge/dex/alcor.png'") &&
  waxcashAnalyticsFrontend.includes("'alcordexmain': '/img/waxonedge/dex/alcor.png'") &&
  waxcashAnalyticsFrontend.includes("'swap.taco': '/img/waxonedge/dex/taco.png'") &&
  waxcashAnalyticsFrontend.includes("'swap.box': '/img/waxonedge/dex/defibox.png'") &&
  waxcashAnalyticsFrontend.includes("'swap.adex': '/img/waxonedge/dex/adex.png'") &&
  waxcashAnalyticsFrontend.includes("'dapp.fusion': '/img/waxonedge/dex/waxfusion.png'") &&
  waxcashAnalyticsFrontend.includes('<img class="wx-source-logo" src="') &&
  waxcashAnalyticsFrontend.includes('<img class="wx-token-logo" src="') &&
  waxcashAnalyticsFrontend.includes('wx-fee-badge') &&
  waxcashAnalyticsFrontend.includes("'<td>' + sourceCell(row) + '</td>'") &&
  waxcashAnalyticsFrontend.includes('return num(row && row.liquidity_wax)') &&
  waxcashAnalyticsFrontend.includes('return num(row && row.volume_24h_wax)') &&
  waxcashAnalyticsFrontend.includes("volumeCell(row, 'volume_24h')") &&
  waxcashAnalyticsFrontend.includes("volumeCell(row, 'volume_7d')") &&
  waxcashAnalyticsFrontend.includes("volumeCell(row, 'volume_30d')") &&
  waxcashAnalyticsFrontend.includes("row[prefix + '_a_native']") &&
  waxcashAnalyticsFrontend.includes('changeCell(row.change_24h)') &&
  waxcashAnalyticsFrontend.includes('priceCell(row)') &&
  !waxcashAnalyticsFrontend.includes('pairStatus(row)') &&
  !waxcashAnalyticsFrontend.includes('row.reserves_label') &&
  !waxcashAnalyticsFrontend.includes('function metricValue(row, usdKey, waxKey)') &&
  !waxcashAnalyticsFrontend.includes("metricValue(row, 'liquidity_usd', 'liquidity_wax')") &&
  !waxcashAnalyticsFrontend.includes("metricValue(row, 'volume_24h_usd', 'volume_24h_wax')") &&
  waxcashAnalyticsFrontend.includes("state.pairSort || defaultPairSort(rows)") &&
  waxcashAnalyticsFrontend.includes('if (a.metric != null && b.metric == null) return -1') &&
  waxcashAnalyticsFrontend.includes('if (a.metric == null && b.metric != null) return 1') &&
  waxcashAnalyticsFrontend.includes('if (!state.payload)') &&
  waxcashAnalyticsFrontend.includes('updateSortButtons([])') &&
  waxcashAnalyticsFrontend.includes('renderPairs(state.payload)') &&
  !waxcashAnalyticsFrontend.includes('renderPairs(state.payload || {})') &&
  waxcashAnalyticsFrontend.includes("button.classList.toggle('is-active', isActive)") &&
  waxcashAnalyticsFrontend.includes("button.textContent = isActive ? label + ' ' + String.fromCharCode(8595) : label") &&
  !waxcashHtml.includes('wx-pair-detail') &&
  !waxcashAnalyticsFrontend.includes('renderPairDetail'));
ok('WAXCASH analytics backend uses chart-feed labels and alias-aware trade volume matching',
  route.includes("pair_label: 'WAXCASH/WAX'") &&
  route.includes('const sourceNames = candleTradeSourceNamesFor(pair?.source)') &&
  route.includes('source IN (${sourceNames.map(() => \'?\').join(\',\')})') &&
  route.includes('No indexed holder snapshot exists for ${contract}::${symbol}') &&
  !route.includes('No indexed holder snapshot exists for graffitiking::WAXCASH'));
ok('WAXCASH graph metric modes use USD price labels and WAX liquidity/volume',
  waxcashGraphFrontend.includes("if (metric === 'volume') return firstNumber(records, ['volume_24h_wax'])") &&
  waxcashGraphFrontend.includes("if (metric === 'price') return firstNumber(records, ['price_usd'])") &&
  waxcashGraphFrontend.includes("return firstNumber(records, ['liquidity_wax'])") &&
  waxcashGraphFrontend.includes("if (metric === 'price') return formatUsd(firstNumber(records, ['price_usd']))") &&
  waxcashGraphFrontend.includes("var wax = firstNumber(records, ['price_wax'])") &&
  waxcashGraphFrontend.includes("renderPriceMetric(records)") &&
  waxcashGraphFrontend.includes("renderWaxMetric(records, 'volume_24h_wax')") &&
  !waxcashGraphFrontend.includes('console.log(') &&
  !waxcashGraphFrontend.includes("if (metric === 'price') return firstNumber(records, ['price_wax'])") &&
  !waxcashGraphFrontend.includes("if (metric === 'price') return firstNumber(records, ['selected_price_wax', 'selected_price_usd'])") &&
  !waxcashGraphFrontend.includes("if (metric === 'volume') return firstNumber(records, ['volume_24h_wax', 'volume_24h_usd'])") &&
  !waxcashGraphFrontend.includes("renderMetric(records, 'selected_price_wax', 'selected_price_usd')") &&
  !waxcashGraphFrontend.includes("renderMetric(records, 'volume_24h_wax', 'volume_24h_usd')"));
ok('WAXCASH graph root bubble opens the details panel',
  waxcashGraphFrontend.includes('rootNode = node') &&
  waxcashGraphFrontend.includes('root.pairs = edges.slice()') &&
  waxcashGraphFrontend.includes('data-core="true" data-key="') &&
  waxcashGraphFrontend.includes('aria-label="Show WAXCASH details"') &&
  waxcashGraphFrontend.includes("var core = board.querySelector('.wxcash-core')") &&
  waxcashGraphFrontend.includes('state.selected = state.root.key') &&
  waxcashGraphFrontend.includes('state.selected === state.root.key') &&
  waxcashGraphFrontend.includes('z-index:20') &&
  waxcashGraphFrontend.includes('.wxcash-core:hover,.wxcash-core.is-selected'));
ok('frontend only displays 7d/30d volume when backend metric proof marks it live',
  frontend.includes("var hasVolume7d = metricStatusLive(stats, 'volume_7d') && volume7d != null") &&
  frontend.includes("var hasVolume30d = metricStatusLive(stats, 'volume_30d') && volume30d != null") &&
  frontend.includes("statsHtml += statRow('7d volume', hasVolume7d") &&
  frontend.includes("statsHtml += statRow('30d volume', hasVolume30d") &&
  !frontend.includes('canUseHistoricalVolumes && historicalVolumes && historicalVolumes.sevenDay != null') &&
  !frontend.includes('canUseHistoricalVolumes && historicalVolumes && historicalVolumes.thirtyDay != null'));
ok('frontend fallback mode does not claim indexed backend adapters',
  frontend.includes('Diagnostic fallback active') &&
  frontend.includes('Backend adapter status unavailable') &&
  frontend.includes("if (state.backend.mode === 'backend')") &&
  !frontend.includes('Adapters active: Alcor API + swap.alcor + swap.taco + swap.nefty + swap.box'));
ok('frontend source panel names all core backend adapters',
  ['swap-alcor', 'swap-taco', 'nefty-contract', 'swap-box'].every((id) => frontendSources.includes(id)));
ok('frontend maps backend adapter source labels',
  frontend.includes('backendSourceMeta') &&
  ['swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box'].every((source) => frontend.includes(source)));
ok('frontend has no fake all-DEX claims',
  !/all\s+DEXs|all\s+DEXes|every\s+DEX/i.test(frontend + html + tokenHtml + route));
ok('Node/Wrangler versions are aligned on Node 22',
  ci.includes('node-version: 22') &&
  packageJson.engines &&
  packageJson.engines.node === '>=22' &&
  packageLock.packages[''].engines &&
  packageLock.packages[''].engines.node === '>=22' &&
  packageJson.devDependencies &&
  packageJson.devDependencies.wrangler === '^4.100.0');
ok('frontend featured-token scanner allows eosio.token/WAX only by explicit allowlist',
  featuredTokens.includes("['WAXP', 'eosio.token', 'WAX']") &&
  frontend.includes('WAXONEDGE_FEATURED_TOKEN_MAP[key]') &&
  frontendBubbles.includes('WAXONEDGE_FEATURED_TOKEN_MAP[key]') &&
  !frontend.includes('key === WAX_NATIVE_KEY'));
ok('frontend scanner front door and token analytics route are present',
  html.includes('woe-bubble-board') &&
  !html.includes('woe-token-rank-grid') &&
  tokenHtml.includes('woe-token-analytics-page') &&
  tokenHtml.includes('woe-analytics-chart-panel') &&
  frontend.includes("'/analytics/token/?token='") &&
  frontend.includes("state.filters.bubbleMetric === 'volume'") &&
  frontend.includes('hasRealSignal'));
ok('frontend bubbles bootstrap first and then starts live updates',
  frontendBubbles.indexOf('apiJson(BOOTSTRAP_API)') > -1 &&
  frontendBubbles.indexOf('apiJson(BOOTSTRAP_API)') < frontendBubbles.lastIndexOf('startLiveUpdates();') &&
  frontendBubbles.includes("var LIVE_API = '/api/waxonedge/live'") &&
  frontendBubbles.includes("var LIVE_STREAM_API = '/api/waxonedge/live/stream'"));
ok('frontend live hook uses EventSource only when enabled and safe polling fallback',
  frontendBubbles.includes('window.EventSource') &&
  frontendBubbles.includes("live.transport === 'sse'") &&
  frontendBubbles.includes('scheduleLivePolling(1000)') &&
  frontendBubbles.includes('var LIVE_POLL_MS = 1000') &&
  !frontendBubbles.includes('var LIVE_POLL_MS = 10000'));
ok('frontend uses live next_cursor instead of timestamp-only since cursor',
  frontendBubbles.includes("LIVE_API + '?cursor=' + encodeURIComponent(state.live.cursor)") &&
  frontendBubbles.includes('var nextCursor = data.next_cursor || snapshot.next_cursor || null') &&
  frontendBubbles.includes('if (nextCursor) setBackendLiveCursor(nextCursor)') &&
  frontendBubbles.includes('state.live.cursor && state.live.cursorFromBackend') &&
  frontendBubbles.includes('state.live.cursorFromBackend = true') &&
  !frontendBubbles.includes('state.live.cursor = state.lastUpdated') &&
  !frontendBubbles.includes('state.lastUpdated = state.live.cursor') &&
  !frontendBubbles.includes("LIVE_API + '?since='"));
ok('frontend live updates records by stable token key',
  frontendBubbles.includes('update.token_key || tokenKey(update.contract, update.symbol)') &&
  frontendBubbles.includes("state.records.forEach(function (record) { byKey[record.key] = record; })") &&
  frontendBubbles.includes('applyLiveTokenUpdate(record, update)'));
ok('frontend live empty source_keys clears stale source badges',
  frontendBubbles.includes("Object.prototype.hasOwnProperty.call(update, 'source_keys')") &&
  frontendBubbles.includes('var sources = parseSourceKeys(update.source_keys)') &&
  !frontendBubbles.includes('if (update.source_keys)'));
ok('frontend live cursor remains backend-provided while display time advances for unmatched updates',
  frontendBubbles.indexOf('if (nextCursor) setBackendLiveCursor(nextCursor)') > -1 &&
  frontendBubbles.indexOf('if (nextCursor) setBackendLiveCursor(nextCursor)') < frontendBubbles.indexOf('if (!tokens.length) return') &&
  frontendBubbles.includes('function advanceLiveDisplayTimestamp(value)') &&
  frontendBubbles.indexOf('advanceLiveDisplayTimestamp(displayTimestamp)') > -1 &&
  frontendBubbles.indexOf('advanceLiveDisplayTimestamp(displayTimestamp)') < frontendBubbles.indexOf('if (!tokens.length) return') &&
  frontendBubbles.includes('function latestTokenUpdatedAt(tokens)') &&
  !frontendBubbles.includes('function advanceLiveFallbackCursor(update)'));
ok('frontend live update path changes bubble target radius without full reload',
  frontendBubbles.includes('function refreshLiveTargetRadii') &&
  frontendBubbles.includes('node.targetRadius = radii[index] || node.targetRadius') &&
  frontendBubbles.includes('syncNodes()') &&
  !frontendBubbles.includes('window.location.reload'));
ok('frontend live hook does not fetch Hyperion or DEX APIs directly',
  !/history\/get_actions|wax\.alcor\.exchange|WAXONEDGE_HYPERION_API|Hyperion/i.test(frontendBubbles) &&
  !/fetch\(\s*['"]https?:\/\//.test(frontendBubbles));
ok('frontend live hook has no fake live ticks or random movement',
  !/fake live|fake tick|Math\.random|random movement/i.test(frontendBubbles));
ok('frontend has no wallet/swap/liquidity action buttons',
  !/(>|\bvalue=["'])(Connect Wallet|Add Liquidity|Remove Liquidity|Trade on Swap)(<|["'])/.test(frontend + html + tokenHtml));
ok('WaxOnEdge route exposes analytics only and no swap quote or execution API',
  !/\/api\/waxonedge\/(?:swap|trade|wallet|quote|execute|transaction|orderbook|aggregator)(?:\/|\?|$)/i.test(route) &&
  !/child\s*===\s*['"](?:swap|quote|execute|transaction|orderbook|aggregator)['"]/.test(route) &&
  !/build(?:Swap|Transaction)|execute(?:Swap|Route)|submit(?:Transaction|Swap)|swapQuote|quoteSwap|routeExecution/i.test(route));
ok('WaxOnEdge backend has no wallet signing, slippage, receiver, or aggregator execution surface',
  !/\b(waxjs|eosjs|anchor-link|SigningRequest|wallet\.sign|api\.transact|signTransaction)\b/i.test(route) &&
  !/\b(slippage|receiver|swap modal|orderbook trading|aggregator contract)\b/i.test(route));
ok('Layer 1 adapter contract document locks verified WaxOnEdge DEX sources',
  adapterContractDoc.includes('Alcor orderbook') &&
  adapterContractDoc.includes('`alcordexmain`') &&
  adapterContractDoc.includes('`sellmatch`, `buymatch`') &&
  adapterContractDoc.includes('concentrated liquidity, not V2 reserve ratio') &&
  adapterContractDoc.includes('`swap.taco`') &&
  adapterContractDoc.includes('`swap.box`') &&
  adapterContractDoc.includes('`swap.nefty`') &&
  adapterContractDoc.includes('table-only until swap action verified') &&
  adapterContractDoc.includes('special staking-rate source, not a DEX pair'));
ok('backend exposes adapter-specific pricing functions instead of one universal reserve formula',
  route.includes('function priceAlcorOrderbook(') &&
  route.includes('function priceAlcorConcentratedPool(') &&
  route.includes('function priceV2ConstantProductPool(') &&
  route.includes('function priceWaxFusionSpecial(') &&
  route.includes("adapter.pricingType === 'concentrated_liquidity'") &&
  route.includes("adapter.pricingType === 'v2_constant_product'") &&
  !route.includes("const price = explicitPrice || (tokenA.amount > 0 ? safeDecimal(tokenB.amount / tokenA.amount) : null)"));
const layer1PriceIndex = new Map([
  ['eosio.token::WAX', { priceWax: 1, priceUsd: 0.006 }],
  ['graffitiking::WAXCASH', { priceWax: 0.01, priceUsd: 0.00006 }],
]);
const waxcashWaxLayer1Pair = {
  source: 'swap.taco',
  pair_id: 'WAXCASH-WAX',
  token_a_contract: 'graffitiking',
  token_a_symbol: 'WAXCASH',
  token_b_contract: 'eosio.token',
  token_b_symbol: 'WAX',
  reserve_a: '1000',
  reserve_b: '10',
};
const waxcashNbgLayer1Pair = {
  source: 'swap.box',
  pair_id: 'WAXCASH-NBG',
  token_a_contract: 'graffitiking',
  token_a_symbol: 'WAXCASH',
  token_b_contract: 'niftyblocksd',
  token_b_symbol: 'NBG',
  reserve_a: '300',
  reserve_b: '600',
};
const nbgWaxLayer1Pair = {
  source: 'swap.taco',
  pair_id: 'NBG-WAX',
  token_a_contract: 'niftyblocksd',
  token_a_symbol: 'NBG',
  token_b_contract: 'eosio.token',
  token_b_symbol: 'WAX',
  reserve_a: '1000',
  reserve_b: '20',
};
const waxcashWufLayer1Pair = {
  source: 'swap.nefty',
  pair_id: 'WUF-WAXCASH',
  token_a_contract: 'wuffi',
  token_a_symbol: 'WUF',
  token_b_contract: 'graffitiking',
  token_b_symbol: 'WAXCASH',
  reserve_a: '4000',
  reserve_b: '200',
};
const wufWaxLayer1Pair = {
  source: 'swap.taco',
  pair_id: 'WUF-WAX',
  token_a_contract: 'wuffi',
  token_a_symbol: 'WUF',
  token_b_contract: 'eosio.token',
  token_b_symbol: 'WAX',
  reserve_a: '10000',
  reserve_b: '30',
};
const layer1Rows = [
  waxcashWaxLayer1Pair,
  waxcashNbgLayer1Pair,
  nbgWaxLayer1Pair,
  waxcashWufLayer1Pair,
  wufWaxLayer1Pair,
];
const layer1RouteIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph(layer1Rows, layer1PriceIndex);
const waxcashLayer1Selection = __waxonedgeTestHooks.selectLiquidityWeightedMedianPrice('graffitiking', 'WAXCASH', layer1Rows, layer1PriceIndex, layer1RouteIndex);
const nbgLayer1Selection = __waxonedgeTestHooks.selectLiquidityWeightedMedianPrice('niftyblocksd', 'NBG', layer1Rows, layer1PriceIndex, layer1RouteIndex);
const wufLayer1Selection = __waxonedgeTestHooks.selectLiquidityWeightedMedianPrice('wuffi', 'WUF', layer1Rows, layer1PriceIndex, layer1RouteIndex);
const waxcashWufOnlyRouteIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph([waxcashWufLayer1Pair, wufWaxLayer1Pair], layer1PriceIndex);
const waxcashWufOnlySelection = __waxonedgeTestHooks.selectLiquidityWeightedMedianPrice(
  'graffitiking',
  'WAXCASH',
  [waxcashWufLayer1Pair],
  layer1PriceIndex,
  waxcashWufOnlyRouteIndex,
);
const swapAlcorV2TrapPair = {
  source: 'swap.alcor',
  pair_id: 'ALCOR-CL-TRAP',
  token_a_contract: 'graffitiking',
  token_a_symbol: 'WAXCASH',
  token_b_contract: 'eosio.token',
  token_b_symbol: 'WAX',
  reserve_a: '1',
  reserve_b: '1000000',
};
const alcorOnlyLayer1Selection = __waxonedgeTestHooks.selectLiquidityWeightedMedianPrice(
  'graffitiking',
  'WAXCASH',
  [swapAlcorV2TrapPair],
  layer1PriceIndex,
  __waxonedgeTestHooks.buildOgWaxRouteGraph([swapAlcorV2TrapPair], layer1PriceIndex),
);
const mixedAlcorTrapSelection = __waxonedgeTestHooks.selectLiquidityWeightedMedianPrice(
  'graffitiking',
  'WAXCASH',
  [swapAlcorV2TrapPair, waxcashWaxLayer1Pair],
  layer1PriceIndex,
  __waxonedgeTestHooks.buildOgWaxRouteGraph([swapAlcorV2TrapPair, waxcashWaxLayer1Pair], layer1PriceIndex),
);
const noFallbackRouteIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph([waxcashWaxLayer1Pair], layer1PriceIndex);
const noFallbackRoutePrice = __waxonedgeTestHooks.selectOgWaxRoutePrice('graffitiking::WAXCASH', noFallbackRouteIndex);
const noFallbackStats = __waxonedgeTestHooks.deriveTokenPairMetrics(
  { contract: 'graffitiking', symbol: 'WAXCASH', total_supply: '1000000' },
  { aggregate_complete: 0 },
  [swapAlcorV2TrapPair],
  [{ contract: 'eosio.token', symbol: 'WAX', price_wax: '1', price_usd: '0.006' }],
  [waxcashWaxLayer1Pair],
  { routeIndex: noFallbackRouteIndex },
);
ok('Layer 1 known WAXCASH/WAX price direction is not reversed',
  waxcashLayer1Selection.pair_id !== 'WAXCASH-WAX' || almostEqual(waxcashLayer1Selection.priceWax, 0.01));
ok('Layer 1 known WAXCASH/NBG price direction uses quote reserve value over token reserve',
  almostEqual(nbgLayer1Selection.priceWax, 0.02) &&
  !almostEqual(nbgLayer1Selection.priceWax, 50));
ok('Layer 1 known WAXCASH/WUF price direction uses paired WAX route without reversing reserves',
  almostEqual(wufLayer1Selection.priceWax, 0.003) &&
  !almostEqual(wufLayer1Selection.priceWax, 333.3333333333333));
ok('Layer 1 WAXCASH/WUF route hop price is WAXCASH-denominated while selected price is WAX-denominated',
  waxcashWufOnlySelection.pair_id === 'WUF-WAXCASH' &&
  waxcashWufOnlySelection.route_hops[0].from === 'graffitiking::WAXCASH' &&
  waxcashWufOnlySelection.route_hops[0].to === 'wuffi::WUF' &&
  almostEqual(waxcashWufOnlySelection.route_hops[0].price_from_to, 20) &&
  almostEqual(waxcashWufOnlySelection.route_hops[0].selected_price_wax, 0.06) &&
  !almostEqual(waxcashWufOnlySelection.route_hops[0].price_from_to, waxcashWufOnlySelection.priceWax));
ok('Layer 1 route hop price_from_to is not a WAX price unless the quote token is WAX',
  [waxcashLayer1Selection, nbgLayer1Selection, wufLayer1Selection].every((selection) => {
    const hop = selection.route_hops[0];
    return hop.to === 'eosio.token::WAX' || !almostEqual(hop.price_from_to, selection.priceWax);
  }));
ok('Layer 1 weighted median excludes swap.alcor concentrated pools from V2 reserve candidates',
  alcorOnlyLayer1Selection?.route_type === 'unavailable' &&
  alcorOnlyLayer1Selection.priceWax === null &&
  alcorOnlyLayer1Selection.rejection_reason === 'adapter_unavailable_for_selected_price' &&
  mixedAlcorTrapSelection.pair_id === 'WAXCASH-WAX' &&
  almostEqual(mixedAlcorTrapSelection.priceWax, 0.01) &&
  mixedAlcorTrapSelection.source !== 'swap.alcor');
ok('Layer 1 deriveTokenPairMetrics does not fall back to old route price when weighted-median candidates are unavailable',
  noFallbackRoutePrice != null &&
  almostEqual(noFallbackRoutePrice.priceWax, 0.01) &&
  noFallbackStats.selected_price_wax === null &&
  noFallbackStats.selected_price_usd === null &&
  noFallbackStats.selected_pair_id === null &&
  noFallbackStats.selected_price_proof.live === false &&
  noFallbackStats.selected_price_proof.route_hops.length === 0 &&
  noFallbackStats.strongest_pair === null &&
  noFallbackStats.selected_price_rejection_reason === 'adapter_unavailable_for_selected_price' &&
  noFallbackStats.unavailable_reasons.selected_price === 'adapter_unavailable_for_selected_price');
ok('Layer 1 selected price proof route hops have complete real pair identity',
  [waxcashLayer1Selection, nbgLayer1Selection, wufLayer1Selection, mixedAlcorTrapSelection].every((selection) =>
    selection &&
    Array.isArray(selection.route_hops) &&
    selection.route_hops.length > 0 &&
    selection.route_hops.every((hop) => hop.from && hop.to && hop.source && hop.pair_id)));
const concentratedProof = __waxonedgeTestHooks.priceAdapterPair(
  { source: 'swap.alcor', pricingType: 'concentrated_liquidity' },
  { contract: 'graffitiking', symbol: 'WAXCASH', amount: 1000 },
  { contract: 'eosio.token', symbol: 'WAX', amount: 10 },
  layer1PriceIndex
);
ok('Layer 1 Alcor swap.alcor concentrated pool is not priced as Taco/Defibox/Nefty V2',
  concentratedProof.price === null &&
  concentratedProof.proof_status === 'weak' &&
  concentratedProof.reason_codes.includes('concentrated_liquidity_price_requires_tick_sqrt_price_proof'));
const adexProof = __waxonedgeTestHooks.priceAdapterPair(
  { source: 'swap.adex', pricingType: 'table_only_until_swap_verified' },
  { contract: 'token.a', symbol: 'AAA', amount: 100 },
  { contract: 'eosio.token', symbol: 'WAX', amount: 100 },
  layer1PriceIndex
);
ok('Layer 1 unavailable adapter proof does not generate fake price or liquidity',
  adexProof.price === null &&
  adexProof.liquidityWax === null &&
  adexProof.proof_status === 'unavailable' &&
  adexProof.reason_codes.includes('adapter_swap_action_not_verified'));
ok('frontend market-cap bubble sizing uses verified market cap WAX without liquidity fallback',
  frontendBubbles.includes("metric: 'mcap'") &&
  frontendBubbles.includes('function verifiedBubbleSizeValue(record)') &&
  frontendBubbles.includes("record.marketCapConfidence === 'good' && record.marketCapWax != null") &&
  !frontendBubbles.includes("if (record.liquidityConfidence === 'good') {\n      if (record.bubbleLiquidityWax != null)") &&
  frontendBubbles.includes("var value = metric === 'mcap'") &&
  frontendBubbles.includes('verifiedBubbleSizeValue(record)') &&
  frontendBubbles.includes('refreshLiveTargetRadii();'));
ok('frontend market-cap and liquidity bubble modes use separate verified fields',
  frontendBubbles.includes("if (metric === 'liquidity')") &&
  frontendBubbles.includes('return record.graphLiquidityWax') &&
  frontendBubbles.includes("if (metric === 'mcap')") &&
  frontendBubbles.includes('return record.marketCapWax') &&
  frontendBubbles.includes('graphLiquidityWax: asNum(token.graph_liquidity_wax)') &&
  !frontendBubbles.includes('return record.liquidityUsd != null ? record.liquidityUsd : record.liquidityWax') &&
  !frontendBubbles.includes('return record.marketCapUsd != null ? record.marketCapUsd : record.marketCapWax'));
ok('frontend renders backend graph tokens beyond the old featured allowlist',
  frontendBubbles.includes('return Object.keys(byKey).map(function (key)') &&
  frontendBubbles.includes('displaySymbol: featured ? featured.label : symbol') &&
  !frontendBubbles.includes('if (!key || !featured) return;'));
ok('frontend bubble click resolves to the full static token analytics route',
  frontendBubbles.includes("return '/analytics/token/?token=' + encodeURIComponent(record.symbol) + '&contract=' + encodeURIComponent(record.contract)") &&
  frontendBubbles.includes('openTokenAnalytics(node.record)'));
ok('waxonedge.html remains the live bubble scanner product path',
  html.includes('id="woe-bubble-board"') &&
  html.includes('/js/waxonedge-bubbles-v2.js') &&
  !html.includes('waxcash.html') &&
  !html.includes('waxcash-graph.js'));
ok('live indexer dispatches adapter parsers without replacing existing feeds',
  liveIndexerSource.includes('function parseAlcorConcentratedSwap(') &&
  liveIndexerSource.includes('function parseV2ConstantProductSwap(') &&
  liveIndexerSource.includes("stream.parser === 'swap-v3'") &&
  liveIndexerSource.includes("stream.parser === 'swap-v2-taco'") &&
  liveIndexerSource.includes("stream.parser === 'swap-v2-defibox'") &&
  liveIndexerSource.includes("stream.parser === 'swap-v2-nefty'") &&
  liveIndexerSource.includes("account: 'swap.alcor'") &&
  liveIndexerSource.includes("account: 'swap.taco'") &&
  liveIndexerSource.includes("account: 'swap.box'") &&
  liveIndexerSource.includes("account: 'swap.nefty'"));
ok('real reference audit documents license and endpoint comparison',
  referenceAudit.includes('MIT licenses') &&
  referenceAudit.includes('/candles') &&
  referenceAudit.includes('/trades') &&
  referenceAudit.includes('/lastVolumes') &&
  referenceAudit.includes('/lastPriceChanges') &&
  referenceAudit.includes('/swapRoutes'));
ok('real reference audit documents adapter table mappings',
  ['swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box', 'alcordexmain', 'swap.adex', 'dapp.fusion'].every((source) => referenceAudit.includes(source)) &&
  ['tokenA', 'tokenB', 'pool1', 'pool2', 'reserve0', 'reserve1', 'liquidity_token', 'active'].every((field) => referenceAudit.includes(field)));
ok('real reference audit documents candle and volume parity gaps honestly',
  ['klines_${src}_${pair_id}', 'reverseCandles', 'countBack', 'volumeA', 'volumeB', 'previous-close opens'].every((term) => referenceAudit.includes(term)) &&
  referenceAudit.includes('does not fully reproduce concentrated liquidity pricing') &&
  referenceAudit.includes('never fabricates missing candles'));
ok('real reference audit keeps swap execution out of this analytics PR',
  referenceAudit.includes('Wallet swap execution and route-building are out of scope') &&
  referenceAudit.includes('does not add wallet transaction flows'));

try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'workers/moonboys-api/routes/waxonedge.js')], { encoding: 'utf8' });
  ok('waxonedge route module passes node --check', true);
} catch (error) {
  ok('waxonedge route module passes node --check', false, error.message);
}

console.log('\nwaxonedge-live-backend.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
