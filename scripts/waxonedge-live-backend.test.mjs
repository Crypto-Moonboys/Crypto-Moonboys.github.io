import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

ok('moonboys-api WaxOnEdge route module exists', exists('workers/moonboys-api/routes/waxonedge.js'));
ok('moonboys-api WaxOnEdge migration exists', exists('workers/moonboys-api/migrations/022_waxonedge_live_indexer.sql'));
ok('moonboys-api WaxOnEdge aggregate migration exists', exists('workers/moonboys-api/migrations/023_waxonedge_token_aggregate_stats.sql'));
ok('moonboys-api WaxOnEdge aggregate source coverage migration exists', exists('workers/moonboys-api/migrations/024_waxonedge_aggregate_source_coverage.sql'));

const route = read('workers/moonboys-api/routes/waxonedge.js');
const worker = read('workers/moonboys-api/worker.js');
const wrangler = read('workers/moonboys-api/wrangler.toml');
const ci = read('.github/workflows/ci.yml');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const migration = read('workers/moonboys-api/migrations/022_waxonedge_live_indexer.sql');
const aggregateMigration = read('workers/moonboys-api/migrations/023_waxonedge_token_aggregate_stats.sql');
const sourceCoverageMigration = read('workers/moonboys-api/migrations/024_waxonedge_aggregate_source_coverage.sql');
const frontend = read('js/waxonedge.js');
const frontendSources = read('js/waxonedge-sources.js');
const html = read('waxonedge.html');
const tokenHtml = read('analytics/token/index.html');

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
ok('worker computes WaxOnEdge 5/15 minute and holder-snapshot sub-cadences',
  route.includes('minute % 5 === 0') &&
  route.includes('minute % 15 === 0') &&
  route.includes('hour % 2 === 0'));
ok('wrangler wires same-origin WaxOnEdge route',
  wrangler.includes('cryptomoonboys.com/api/waxonedge/*') &&
  wrangler.includes('zone_name = "cryptomoonboys.com"'));

for (const endpoint of [
  '/bootstrap',
  '/summary',
  '/tokens/top',
  '/pairs/top',
  '/sync-status',
]) {
  ok('route exposes ' + endpoint, route.includes(endpoint));
}
ok('route exposes token detail family', route.includes('const tokenMatch = path.match'));

ok('route syncs Alcor public API sources',
  route.includes('/tokens') && route.includes('/pairs') && route.includes('/tickers') && route.includes('/analytics/global'));
ok('route declares all core WAX DEX adapters',
  route.includes('CORE_DEX_ADAPTERS') &&
  ['swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box'].every((source) => route.includes(source)));
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
  route.includes('syncCoreDexAdapters(env)') &&
  route.includes('syncAlcorMarketData(env, \'alcor_five_minute_market_data\')'));
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
ok('backend persists selected-pair 24h change from aggregate stats only',
  route.includes('change_24h = excluded.change_24h') &&
  route.includes('change24: asNumber(pair.change_24h)') &&
  route.includes('SELECT holder_count, circulating_supply, volume_24h, volume_24h_wax, volume_24h_usd') &&
  route.includes('change_24h, selected_pair_source'));
ok('aggregate completeness is source-run completeness, separate from token source coverage',
  route.includes('async function getAggregateRunStatus') &&
  route.includes('SELECT MAX(started_at)') &&
  route.includes('runStatus.complete ? 1 : 0') &&
  route.includes('sourceKeys.join') &&
  !route.includes('missingSources.length === 0 ? 1 : 0'));
ok('truncated source pagination marks aggregate incomplete',
  route.includes('tableResult.truncated') &&
  route.includes("recordSyncRun(env.DB, adapter.source, 'failed'") &&
  route.includes('runStatus.truncated ? 1 : 0') &&
  route.includes('runStatus.truncatedSources.join'));
ok('scheduled full index runs sources in parallel and aggregates after statuses are known',
  route.includes('const [alcor, core, nefty] = await Promise.all') &&
  route.indexOf('const aggregates = await aggregateTokenAnalytics(env);') > route.indexOf('const [alcor, core, nefty] = await Promise.all'));
ok('aggregate selected price uses strongest real WAX quote liquidity',
  route.includes('hasWaxQuoteForToken(pair, side.contract, side.symbol)') &&
  route.includes('hasRealPairReserves(pair)') &&
  route.includes('score = liquidityWax') &&
  route.includes('MIN_TRUSTED_WAX_LIQUIDITY'));
ok('route selects chart source only from indexed candle rows',
  route.includes('async function listBestChartCandles') &&
  route.includes('JOIN waxonedge_chart_candles') &&
  route.includes('ORDER BY CAST(COALESCE(p.liquidity_wax') &&
  route.includes('CAST(COALESCE(p.volume_24h'));
ok('token pair endpoint returns all selected-token pairs by liquidity then volume',
  route.includes('async function listTokenPairs') &&
  route.includes('ORDER BY CAST(COALESCE(liquidity_wax') &&
  route.includes('CAST(COALESCE(volume_24h_wax') &&
  route.includes('next_cursor') &&
  route.includes('complete: !hasMore') &&
  route.includes('LIMIT ? OFFSET ?'));
ok('token detail endpoint returns canonical stats and source coverage',
  route.includes('source_coverage: sourceCoverageFromKeys') &&
  route.includes('selected_price_wax') &&
  route.includes('selected_pair_source') &&
  route.includes('volume_24h_wax') &&
  route.includes('aggregate_sources_required') &&
  route.includes('aggregate_sources_processed') &&
  route.includes('aggregate_sources_failed') &&
  route.includes('aggregate_sources_truncated'));
ok('route has no unused bootstrap source key mirror',
  !route.includes('CORE_BOOTSTRAP_SOURCE_KEYS'));
ok('route does not fake holder distribution', route.includes('Holder distribution requires indexed balance snapshots') && route.includes('REQUIRES_INDEXED_BACKEND'));
ok('route marks chart/trades unavailable unless indexed', route.includes('SOURCE_NOT_INDEXED') && route.includes("child === 'chart'") && route.includes("child === 'trades'"));
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
ok('frontend renders indexed candles with TradingView Lightweight Charts, not symbol widgets',
  tokenHtml.includes('lightweight-charts@5.2.0') &&
  frontend.includes('window.LightweightCharts') &&
  frontend.includes('tv.createChart') &&
  frontend.includes('CandlestickSeries') &&
  !frontend.includes('TradingView.widget'));
ok('frontend token stats use canonical selected-token detail stats',
  frontend.includes('function loadSelectedTokenDetail(selection)') &&
  frontend.includes('function loadSelectedTokenPairs(selection)') &&
  frontend.includes('function loadSelectedTokenChart(selection)') &&
  frontend.includes('function isCanonicalAggregateValid(stats)') &&
  frontend.includes('var stats = context.stats || {};') &&
  frontend.includes('var currentPriceWax = canonicalValid ? asNum(stats.selected_price_wax) : null;') &&
  frontend.includes('var volume24 = canonicalValid ? asNum(stats.volume_24h_wax) : null;') &&
  !frontend.includes('var currentPriceWax = token.systemPrice'));
ok('frontend selected-token pairs endpoint loads paginated proof rows',
  frontend.includes("selectedTokenApiPath(selection, 'pairs') + '?limit=100'") &&
  frontend.includes('data.next_cursor') &&
  frontend.includes('return loadPage(data.next_cursor)'));
ok('frontend does not label raw base volume as WAX',
  frontend.includes('rawVolume24: row.volume_24h') &&
  frontend.includes('volume24: asNum(row.volume_24h_wax)') &&
  frontend.includes("volume24Text: row.volume_24h_wax != null ? String(row.volume_24h_wax) + ' WAX' : UNAVAILABLE_TEXT"));
ok('frontend only labels historical candle volume when chart source tokenA matches selection',
  frontend.includes('function chartBundleHasSelectedBaseVolume(chartBundle, context)') &&
  frontend.includes('var canUseHistoricalVolumes = chartBundleHasSelectedBaseVolume(chartBundle, context)') &&
  frontend.includes('canUseHistoricalVolumes && historicalVolumes && historicalVolumes.sevenDay != null') &&
  frontend.includes('canUseHistoricalVolumes && historicalVolumes && historicalVolumes.thirtyDay != null'));
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
ok('frontend default state still avoids eosio.token/WAX dead detail', frontend.includes('WAX_NATIVE_KEY') && frontend.includes('key === WAX_NATIVE_KEY'));
ok('frontend scanner front door and token analytics route are present',
  html.includes('woe-bubble-board') &&
  !html.includes('woe-token-rank-grid') &&
  tokenHtml.includes('woe-token-analytics-page') &&
  tokenHtml.includes('woe-analytics-chart-panel') &&
  frontend.includes("'/analytics/token/?token='") &&
  frontend.includes("state.filters.bubbleMetric === 'volume'") &&
  frontend.includes('hasRealSignal'));
ok('frontend has no wallet/swap/liquidity action buttons',
  !/(>|\bvalue=["'])(Connect Wallet|Add Liquidity|Remove Liquidity|Trade on Swap)(<|["'])/.test(frontend + html + tokenHtml));

try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'workers/moonboys-api/routes/waxonedge.js')], { encoding: 'utf8' });
  ok('waxonedge route module passes node --check', true);
} catch (error) {
  ok('waxonedge route module passes node --check', false, error.message);
}

console.log('\nwaxonedge-live-backend.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
