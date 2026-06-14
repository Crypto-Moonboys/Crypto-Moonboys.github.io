import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

ok('moonboys-api WaxOnEdge route module exists', exists('workers/moonboys-api/routes/waxonedge.js'));
ok('moonboys-api WaxOnEdge migration exists', exists('workers/moonboys-api/migrations/022_waxonedge_live_indexer.sql'));
ok('moonboys-api WaxOnEdge aggregate migration exists', exists('workers/moonboys-api/migrations/023_waxonedge_token_aggregate_stats.sql'));
ok('moonboys-api WaxOnEdge aggregate source coverage migration exists', exists('workers/moonboys-api/migrations/024_waxonedge_aggregate_source_coverage.sql'));
ok('moonboys-api WaxOnEdge source index state migration exists', exists('workers/moonboys-api/migrations/025_waxonedge_source_index_state.sql'));
ok('WaxOnEdge real reference audit exists', exists('docs/waxonedge-real-reference-audit.md'));

const route = read('workers/moonboys-api/routes/waxonedge.js');
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
const frontendSources = read('js/waxonedge-sources.js');
const html = read('waxonedge.html');
const tokenHtml = read('analytics/token/index.html');
const { __waxonedgeTestHooks } = await import(pathToFileURL(path.join(ROOT, 'workers/moonboys-api/routes/waxonedge.js')).href);
const referenceAudit = read('docs/waxonedge-real-reference-audit.md');

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
  '/indexer-health',
]) {
  ok('route exposes ' + endpoint, route.includes(endpoint));
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
ok('backend persists selected-pair 24h change from aggregate stats only',
  route.includes('change_24h = excluded.change_24h') &&
  route.includes('change24: asNumber(pair.change_24h)') &&
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
  route.includes("const pairSyncFinishedAt = Date.parse(pairSync?.finished_at || '')") &&
  route.includes('if (!Number.isFinite(pairSyncFinishedAt)) return false') &&
  route.includes("const aggregateFinishedAt = Date.parse(aggregate?.finished_at || '')") &&
  route.includes('if (!Number.isFinite(aggregateFinishedAt)) return true') &&
  route.includes('return aggregateFinishedAt < pairSyncFinishedAt') &&
  route.includes('const needsAggregateRefresh = await aggregateNeedsRefreshAfterPairSync(env.DB)') &&
  route.includes('postSyncAggregate = await aggregateTokenAnalytics(env)') &&
  route.includes('post_sync_aggregate: postSyncAggregate'));
ok('aggregate refresh timestamp parsing covers invalid and ordered timestamp cases',
  route.includes('if (!Number.isFinite(pairSyncFinishedAt)) return false') &&
  route.includes('if (!Number.isFinite(aggregateFinishedAt)) return true') &&
  route.includes('return aggregateFinishedAt < pairSyncFinishedAt') &&
  !route.includes('return Date.parse(aggregate.finished_at) < Date.parse(pairSync.finished_at)'));
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
  route.includes('!freeSafeMode && (!cron || isMinuteCron || shouldRunFullIndex)'));
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
ok('scheduled full index can still run legacy combined workflow when free-safe is disabled',
  route.includes('} else if (shouldRunFullIndex) {') &&
  route.includes('const [alcor, core, nefty] = await Promise.all') &&
  route.lastIndexOf('const aggregates = await aggregateTokenAnalytics(env);') > route.indexOf('const [alcor, core, nefty] = await Promise.all'));
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
  route.includes("const candleTradeSources = ['alcor', ...AMM_TRADE_SOURCES]") &&
  route.includes('SELECT 1 FROM waxonedge_trades WHERE source IN') &&
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
  route.includes("reason: source === 'alcor' ? 'trade_rows_not_indexed' : 'swap_rows_not_indexed'") &&
  route.includes("reason: 'candles_built_from_trade_rows'") &&
  route.includes('external_chart_endpoint_unsupported') &&
  !route.includes('/markets/${encodeURIComponent(pair.pair_id)}/charts?resolution=1D'));
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
    pair.price === '2.5' &&
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
  ]);
  const adapter = {
    source: 'dapp.fusion',
    normalizer: 'waxfusion-global',
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
  route.includes("const candleTradeSources = ['alcor', ...AMM_TRADE_SOURCES]") &&
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
ok('AMM Hyperion URLs use account and act.name without pair_id or market_id filters',
  route.includes('function ammSwapStreamUrl') &&
  route.includes('`account=${encodeURIComponent(stream.account)}`') &&
  route.includes('`act.name=${encodeURIComponent(stream.action)}`') &&
  route.includes("'sort=desc'") &&
  route.includes("'simple=true'") &&
  route.includes('if (cursor) params.push(`skip=${encodeURIComponent(String(cursor))}`)') &&
  !route.match(/function ammSwapStreamUrl[\s\S]*pair_id=/) &&
  !route.match(/function ammSwapStreamUrl[\s\S]*market_id=/));
{
  const stream = { source: 'swap.taco', referenceSource: 'taco', account: 'swap.taco', action: 'exchangelog', parser: 'swap-v2-taco' };
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
  ok('AMM logswap-style rows normalize into waxonedge_trades with correct source',
    parsed &&
    parsed.source === 'swap.taco' &&
    parsed.action_name === 'exchangelog' &&
    parsed.pair_id === 'WAXFOO' &&
    parsed.amount_in === 2 &&
    parsed.amount_out === 10 &&
    normalized &&
    normalized.source === 'swap.taco' &&
    normalized.trade_id === 'swap.taco:exchangelog:WAXFOO:111' &&
    normalized.pair_id === 'WAXFOO' &&
    normalized.symbol === 'WAX' &&
    normalized.side === 'swap' &&
    normalized.price === '0.2' &&
    normalized.volume === '2' &&
    normalized.traded_at === '2026-06-14T01:02:03.000Z' &&
    JSON.parse(normalized.raw_json).reference_src === 'taco');
}
{
  const stream = { source: 'swap.box', referenceSource: 'defibox', account: 'swap.box', action: 'swaplog', parser: 'swap-v2-defibox' };
  const parsed = __waxonedgeTestHooks.parseAmmSwapAction({
    act: { name: 'swaplog', data: { pair_id: '12', owner: 'swapper', quantity_in: '0.0000 WAX', quantity_out: '1.0000 BOX', reserve0: '1.0000 WAX', reserve1: '2.0000 BOX' } },
  }, stream);
  ok('unparseable AMM rows are skipped instead of faked',
    parsed &&
    parsed.amount_in === 0 &&
    __waxonedgeTestHooks.normalizeAmmSwapTradeRow(parsed, stream) === null);
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
  route.includes("const candleTradeSources = ['alcor', ...AMM_TRADE_SOURCES]") &&
  route.includes('SELECT 1 FROM waxonedge_trades WHERE source IN') &&
  route.includes('FROM waxonedge_pairs') &&
  route.includes('WHERE source IN') &&
  route.includes("reason: source === 'alcor' ? 'trade_rows_not_indexed' : 'swap_rows_not_indexed'") &&
  __waxonedgeTestHooks.buildDailyCandlesFromTradeRows([
    { source: 'swap.taco', pair_id: 'WAXFOO', traded_at: '2026-06-14T00:00:00.000Z', price: '0.2', volume: '2' },
    { source: 'swap.taco', pair_id: 'WAXFOO', traded_at: '2026-06-14T01:00:00.000Z', price: '0.25', volume: '3' },
  ], { source: 'swap.taco' })[0].close === '0.25');
ok('Alcor marketMatches pagination reports per-action skip progress without full-history completion claims',
  route.includes('function normalizeActionStreamProgressMap') &&
  route.includes('const streamProgress = normalizeActionStreamProgressMap(previousData.action_streams, actionStreams)') &&
  route.includes('pagination_mode: \'skip\'') &&
  route.includes('action_streams: streamProgress') &&
  route.includes('last_stream_cursor: lastStreamCursor') &&
  route.includes('last_stream_sequence: lastStreamSequence') &&
  route.includes('last_stream_block: lastStreamBlock') &&
  route.includes('const streamRunLimit = Math.min(limit, pagesPerRun, actionStreams.length)') &&
  route.includes('candidateRows.length < streamRunLimit') &&
  route.includes('active_stream_pages_per_run: pagesPerRun') &&
  route.includes('bounded_history_seed: false') &&
  route.includes('history_pagination_complete: false') &&
  route.includes("next_action: hyperionNotConfigured ? 'configure WAXONEDGE_HYPERION_API with a real WAX Hyperion endpoint' : (allStreamsComplete ? 'skip pagination exhausted; sequence-complete replay not claimed' : 'continue per-action Hyperion skip pagination')") &&
  route.includes('const nextCursor = \'\';') &&
  route.includes('const complete = false;') &&
  !route.includes("complete && failedPairCount === 0 ? 'success'"));
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
    normalized.raw_json.includes('Hyperion/state-history alcordexmain buymatch/sellmatch') &&
    normalized.raw_json.includes('marketMatches'));
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
  route.includes('continue;\n      }\n      if (result.failed)') &&
  route.includes('continue;\n      }\n      if (result.unsupported)') &&
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
  route.includes('const alcorTradeBackfill = await syncAlcorMarketTradeRows(env);\n  const ammTradeBackfill = await syncAmmSwapTradeRows(env);') &&
  !route.includes('const [alcorTradeBackfill, ammTradeBackfill] = await Promise.all') &&
  route.includes('const tradeBackfill = await runWaxOnEdgeTradeBackfill(env);\n      const aggregates = await aggregateTokenAnalytics(env);\n      const candleBackfill = await planWaxOnEdgeCandleBackfill(env)'));
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
ok('aggregate selected price uses strongest real WAX quote liquidity',
  route.includes('hasWaxQuoteForToken(pair, side.contract, side.symbol)') &&
  route.includes('hasRealPairReserves(pair)') &&
  route.includes('score = liquidityWax') &&
  route.includes('MIN_TRUSTED_WAX_LIQUIDITY'));
ok('aggregate rebuild persists all computable token metrics from indexed pairs',
  route.includes('const detailStats = deriveTokenPairMetrics') &&
  route.includes('detailStats.selected_price_wax') &&
  route.includes('detailStats.selected_price_usd') &&
  route.includes('detailStats.liquidity_wax') &&
  route.includes('detailStats.tvl_wax') &&
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
ok('token detail derives partial aggregate metrics from indexed pair rows',
  route.includes('function deriveTokenPairMetrics') &&
  route.includes('function loadTokenPriceRowsForPairs') &&
  route.includes('selected_price_source') &&
  route.includes('cumulated_pair_liquidity_wax') &&
  route.includes('strongest_pair') &&
  route.includes('unavailable_reasons') &&
  route.includes('Pair liquidity indexed; holder/candle metrics pending'));
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
ok('token detail avoids unbounded all-priced-token scan',
  route.includes('function collectTokenPriceKeysForPairs') &&
  route.includes('const priceRows = await loadTokenPriceRowsForPairs(db, pairRows)') &&
  !route.includes('WHERE price_wax IS NOT NULL OR price_usd IS NOT NULL'));
{
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
        liquidity_usd: '12',
        reserve_a: '1000',
        reserve_b: '500000',
      },
      {
        source: 'swap.taco',
        pair_id: 'WUFABC',
        token_a_contract: 'wuffi',
        token_a_symbol: 'WUF',
        token_b_contract: 'abc.token',
        token_b_symbol: 'ABC',
        price: '0.001',
        change_24h: null,
        volume_24h_wax: '10',
        liquidity_wax: '100',
        liquidity_usd: '0.6',
        reserve_a: '100000',
        reserve_b: '100',
      },
    ],
    [
      { contract: 'eosio.token', symbol: 'WAX', price_wax: '1', price_usd: '0.006' },
      { contract: 'abc.token', symbol: 'ABC', price_wax: '2', price_usd: '0.012' },
    ],
  );
  ok('WUF-style partial aggregate keeps useful indexed pair stats',
    wufStats.aggregate_status === 'Pair liquidity indexed; holder/candle metrics pending' &&
    wufStats.selected_pair_source === 'swap.nefty' &&
    wufStats.selected_pair_id === 'WAXWUFB' &&
    wufStats.selected_price_source.includes('swap.nefty') &&
    wufStats.indexed_pair_count === 2 &&
    wufStats.source_count === 2 &&
    Number(wufStats.liquidity_wax) === 2100 &&
    Number(wufStats.cumulated_pair_liquidity_wax) === 2100 &&
    Number(wufStats.volume_24h_wax) === 60 &&
    wufStats.change_24h == null &&
    Number(wufStats.fdv_wax) > 0 &&
    wufStats.unavailable_reasons.price_change_24h === 'Requires indexed 24h price-change data');
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
