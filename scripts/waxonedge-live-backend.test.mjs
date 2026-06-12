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

const route = read('workers/moonboys-api/routes/waxonedge.js');
const worker = read('workers/moonboys-api/worker.js');
const wrangler = read('workers/moonboys-api/wrangler.toml');
const ci = read('.github/workflows/ci.yml');
const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
const migration = read('workers/moonboys-api/migrations/022_waxonedge_live_indexer.sql');
const aggregateMigration = read('workers/moonboys-api/migrations/023_waxonedge_token_aggregate_stats.sql');
const frontend = read('js/waxonedge.js');
const frontendSources = read('js/waxonedge-sources.js');
const html = read('waxonedge.html');

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
ok('route selects chart source only from indexed candle rows',
  route.includes('async function listBestChartCandles') &&
  route.includes('JOIN waxonedge_chart_candles') &&
  route.includes('ORDER BY CAST(COALESCE(p.volume_24h') &&
  route.includes('CAST(COALESCE(p.liquidity_wax'));
ok('route has no unused bootstrap source key mirror',
  !route.includes('CORE_BOOTSTRAP_SOURCE_KEYS'));
ok('route does not fake holder distribution', route.includes('Holder distribution requires indexed balance snapshots') && route.includes('REQUIRES_INDEXED_BACKEND'));
ok('route marks chart/trades unavailable unless indexed', route.includes('SOURCE_NOT_INDEXED') && route.includes("child === 'chart'") && route.includes("child === 'trades'"));
ok('frontend calls /api/waxonedge/bootstrap first', frontend.includes("waxonedgeApi('/bootstrap')"));
ok('frontend direct source fetch is diagnostic fallback', frontend.includes('loadDiagnosticFallback') && frontend.includes('Backend bootstrap unavailable'));
ok('frontend does not use Alcor chart fallback in backend mode',
  frontend.includes("loadChartData('backend:' + context.selection.key)") &&
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
  html.includes('lightweight-charts@5.2.0') &&
  frontend.includes('window.LightweightCharts') &&
  frontend.includes('tv.createChart') &&
  frontend.includes('CandlestickSeries') &&
  !frontend.includes('TradingView.widget'));
ok('frontend only labels 24h volume when selected token is base/tokenA',
  frontend.includes('function isSelectedTokenBaseMarket(market, selection)') &&
  frontend.includes('market.volume24 != null && isSelectedTokenBaseMarket(market, selection)') &&
  frontend.includes('context.primaryVolumeMarket.volume24 != null && isSelectedTokenBaseMarket(context.primaryVolumeMarket, selection)'));
ok('frontend only labels historical candle volume when chart source tokenA matches selection',
  frontend.includes('function chartBundleHasSelectedBaseVolume(chartBundle, context)') &&
  frontend.includes('var canUseHistoricalVolumes = chartBundleHasSelectedBaseVolume(chartBundle, context)') &&
  frontend.includes('canUseHistoricalVolumes && historicalVolumes && historicalVolumes.sevenDay != null') &&
  frontend.includes('canUseHistoricalVolumes && historicalVolumes && historicalVolumes.thirtyDay != null'));
ok('frontend fallback mode does not claim indexed backend adapters',
  frontend.includes('Diagnostic fallback active - backend adapter status unavailable') &&
  frontend.includes("if (state.backend.mode === 'backend')") &&
  !frontend.includes('Adapters active: Alcor API + swap.alcor + swap.taco + swap.nefty + swap.box'));
ok('frontend source panel names all core backend adapters',
  ['swap-alcor', 'swap-taco', 'nefty-contract', 'swap-box'].every((id) => frontendSources.includes(id)));
ok('frontend maps backend adapter source labels',
  frontend.includes('backendSourceMeta') &&
  ['swap.alcor', 'swap.taco', 'swap.nefty', 'swap.box'].every((source) => frontend.includes(source)));
ok('frontend has no fake all-DEX claims',
  !/all\s+DEXs|all\s+DEXes|every\s+DEX/i.test(frontend + html + route));
ok('Node/Wrangler versions are aligned on Node 22',
  ci.includes('node-version: 22') &&
  packageJson.engines &&
  packageJson.engines.node === '>=22' &&
  packageLock.packages[''].engines &&
  packageLock.packages[''].engines.node === '>=22' &&
  packageJson.devDependencies &&
  packageJson.devDependencies.wrangler === '^4.100.0');
ok('frontend default state still avoids eosio.token/WAX dead detail', frontend.includes('WAX_NATIVE_KEY') && frontend.includes('key === WAX_NATIVE_KEY'));
ok('frontend dashboard-first polish is present',
  html.includes('woe-dashboard-shell') &&
  frontend.includes('renderDashboard()') &&
  frontend.includes('selectedPair && liquidity > 0 && volume > 0'));
ok('frontend has no wallet/swap/liquidity action buttons',
  !/(>|\bvalue=["'])(Connect Wallet|Add Liquidity|Remove Liquidity|Trade on Swap)(<|["'])/.test(frontend + html));

try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'workers/moonboys-api/routes/waxonedge.js')], { encoding: 'utf8' });
  ok('waxonedge route module passes node --check', true);
} catch (error) {
  ok('waxonedge route module passes node --check', false, error.message);
}

console.log('\nwaxonedge-live-backend.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
