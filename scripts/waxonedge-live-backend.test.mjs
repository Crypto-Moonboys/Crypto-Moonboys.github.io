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
  route.includes('requestBudget: CORE_DEX_RPC_FETCH_BUDGET_PER_SOURCE') &&
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
  route.includes('maxPages: CORE_DEX_PAGES_PER_INVOCATION') &&
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
  route.includes('partialSuccess: sameCycle && failed.length === 0 && partialSources.length > 0') &&
  route.includes("const aggregateStatus = runStatus.complete ? 'success' : (runStatus.partialSuccess && aggregates.size > 0 ? 'partial_success' : 'failed')") &&
  route.includes("await recordSyncRun(env.DB, 'token_aggregates', aggregateStatus") &&
  route.includes("status: aggregateStatus"));
ok('partial_success aggregate after latest pair sync can count as fresh',
  route.includes("status IN ('success', 'partial_success')") &&
  route.includes("status IN ('success', 'partial')") &&
  route.includes('fresh_after_latest_pair_sync: aggregateFresh') &&
  route.includes("const alcor = await syncAlcorMarketData(env, 'alcor_minute_market_data')") &&
  route.includes('const aggregates = await aggregateTokenAnalytics(env);') &&
  route.includes('const candleBackfill = await planWaxOnEdgeCandleBackfill(env);') &&
  route.includes('return { ok: alcor.ok && aggregates.ok && candleBackfill.ok, alcor, aggregates, candleBackfill };'));
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
  route.includes('Too many subrequests') === false);
ok('scheduled full index runs sources in parallel and aggregates after statuses are known',
  route.includes('const syncCycleId = await getActiveSourceCycleId(env.DB);') &&
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
  route.includes('normalizeAlcorChartCandles') &&
  route.includes('writeChartCandles') &&
  route.includes('INSERT INTO waxonedge_chart_candles') &&
  !route.includes('synthesized candle') &&
  !route.includes('fallback candle'));
ok('candle backfill writes only real Alcor 1D candles in bounded chunks',
  route.includes('/markets/${encodeURIComponent(pair.pair_id)}/charts?resolution=1D') &&
  route.includes('CANDLE_BACKFILL_PAIR_LIMIT') &&
  route.includes('CANDLE_BACKFILL_LOOKBACK_DAYS') &&
  route.includes('const nowSeconds = Math.floor(Date.now() / 1000)') &&
  route.includes('const from = nowSeconds - (CANDLE_BACKFILL_LOOKBACK_DAYS * 24 * 60 * 60)') &&
  route.includes('from=${from}&to=${to}') &&
  !route.includes('const to = Date.now()') &&
  !route.includes('24 * 60 * 60 * 1000') &&
  route.includes('if (ts == null || o == null || h == null || l == null || c == null || v == null) return;') &&
  route.includes("writeChartCandles(env.DB, 'alcor', String(pair.pair_id), '1D', candles)") &&
  route.includes('cursor: complete ?') &&
  route.includes('candles_written'));
ok('candle_backfill cron actually attempts candidate pairs',
  route.includes("cron === 'waxonedge-candle-backfill'") &&
  route.includes('const candleBackfill = await planWaxOnEdgeCandleBackfill(env);') &&
  route.includes('const candidateRows = candidates.results || []') &&
  route.includes('const attemptedPairCount = candidateRows.length') &&
  route.includes('for (const pair of candidateRows)') &&
  route.includes('attempted_pair_count: totalAttemptedPairCount'));
ok('candle_backfill does not remain planned forever after scheduled run',
  route.includes("const status = complete && failedPairCount === 0") &&
  route.includes("attemptedPairCount > 0 ? 'partial'") &&
  route.includes("status === 'planned' ? CANDLE_BACKFILL_PLAN : null") &&
  route.includes("const candleBackfill = await planWaxOnEdgeCandleBackfill(env);") &&
  route.includes('return { ok: alcor.ok && aggregates.ok && candleBackfill.ok, alcor, aggregates, candleBackfill };'));
ok('Alcor chart URL uses 10-digit UNIX seconds instead of millisecond timestamps',
  route.includes('const nowSeconds = Math.floor(Date.now() / 1000)') &&
  route.includes('const to = nowSeconds') &&
  route.includes('const from = nowSeconds - (CANDLE_BACKFILL_LOOKBACK_DAYS * 24 * 60 * 60)') &&
  !route.includes('const from = to - (CANDLE_BACKFILL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)'));
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
ok('candle backfill advances cursor by attempted pairs and records failures',
  route.includes('const attemptedPairCount = candidateRows.length') &&
  route.includes('failedPairCount += 1') &&
  route.includes('const nextCursor = Math.min(candidatePairCount, cursorOffset + attemptedPairCount)') &&
  route.includes('attempted_pair_count: totalAttemptedPairCount') &&
  route.includes('failed_pair_count: totalFailedPairCount') &&
  route.includes('last_error: lastError') &&
  !route.includes('const nextCursor = Math.min(candidatePairCount, cursorOffset + processedPairCount)'));
ok('candle backfill cumulative counters separate cursor from success/failure counts',
  route.includes('const totalAttemptedPairCount = (asNumber(previousSnapshot.data?.attempted_pair_count) || 0) + attemptedPairCount') &&
  route.includes('const totalProcessedPairCount = (asNumber(previousSnapshot.data?.processed_pair_count) || 0) + processedPairCount') &&
  route.includes('const totalFailedPairCount = (asNumber(previousSnapshot.data?.failed_pair_count) || 0) + failedPairCount') &&
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
  route.includes('candles_written') &&
  route.includes('last_error'));
ok('selected-pair health counts are scoped to indexed tokens',
  route.includes('FROM waxonedge_tokens t') &&
  route.includes('JOIN waxonedge_token_stats s ON s.contract = t.contract AND s.symbol = t.symbol') &&
  route.includes('WHERE s.selected_pair_source IS NOT NULL AND s.selected_pair_id IS NOT NULL') &&
  route.includes('tokens_without_selected_pair: Math.max(0, totalTokens - tokensWithSelectedPair)'));
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
