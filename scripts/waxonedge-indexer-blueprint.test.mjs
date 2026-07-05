import { readFileSync, existsSync } from 'node:fs';
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

let failed = 0;
let passed = 0;

function ok(label, condition) {
  if (condition) {
    console.log('PASS: ' + label);
    passed++;
  } else {
    console.error('FAIL: ' + label);
    failed++;
  }
}

ok('indexer blueprint doc exists', exists('docs/waxonedge-og-indexer-blueprint.md'));
ok('worker scaffold README exists', exists('workers/waxonedge/README.md'));
ok('worker schema exists', exists('workers/waxonedge/schema.sql'));
ok('worker API scaffold exists', exists('workers/waxonedge/src/index.js'));

const blueprint = exists('docs/waxonedge-og-indexer-blueprint.md') ? read('docs/waxonedge-og-indexer-blueprint.md') : '';
const schema = exists('workers/waxonedge/schema.sql') ? read('workers/waxonedge/schema.sql') : '';
const worker = exists('workers/waxonedge/src/index.js') ? read('workers/waxonedge/src/index.js') : '';
const readme = exists('workers/waxonedge/README.md') ? read('workers/waxonedge/README.md') : '';

ok('blueprint states no invented-data rule', blueprint.includes('must never infer or fabricate'));
ok('blueprint defines Cloudflare Worker and D1 architecture', blueprint.includes('Cloudflare Worker') && blueprint.includes('D1'));
ok('blueprint lists read-only API routes', blueprint.includes('/api/waxonedge/summary') && blueprint.includes('/api/waxonedge/token/:contract/:symbol'));
ok('blueprint requires ABI-first swap.nefty handling', blueprint.includes('get_abi') && blueprint.includes('swap.nefty'));
ok('blueprint warns against broad DEX claims before adapters are active', blueprint.includes('must not say “all WAX DEXs”'));

ok('schema defines tokens table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_tokens'));
ok('schema defines pairs table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_pairs'));
ok('schema defines token stats table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_token_stats'));
ok('schema defines holders table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_holders'));
ok('schema defines chart candles table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_chart_candles'));
ok('schema defines snapshots table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_snapshots'));
ok('schema defines trades table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_trades'));
ok('schema documents decimal TEXT precision policy', schema.includes('Precision policy') && schema.includes('decimal strings in TEXT'));
ok('schema avoids REAL column types', !hasRealColumn(schema));
ok('schema stores token prices as TEXT', schema.includes('price_wax TEXT') && schema.includes('price_usd TEXT'));
ok('schema stores pair volume and liquidity as TEXT', schema.includes('volume_24h TEXT') && schema.includes('liquidity_usd TEXT'));
ok('schema stores candle OHLC as TEXT', schema.includes('open TEXT') && schema.includes('close TEXT'));

ok('worker returns unavailable state instead of invented data', worker.includes('Requires indexed backend') && worker.includes('unavailable('));
ok('worker exposes summary endpoint', worker.includes('/api/waxonedge/summary'));
ok('worker exposes top tokens endpoint', worker.includes('/api/waxonedge/tokens/top'));
ok('worker exposes top pairs endpoint', worker.includes('/api/waxonedge/pairs/top'));
ok('worker scaffold is route-only and does not declare a scheduled cron owner',
  !worker.includes('async scheduled(') &&
  !worker.includes('recordSkippedSchedule') &&
  !readme.includes('[triggers]') &&
  !readme.includes('crons =') &&
  readme.includes('scheduled cron triggers owned by `workers/moonboys-api`'));
ok('worker uses compact JSON', !worker.includes('JSON.stringify(payload, null, 2)'));
ok('worker 404 uses notFound helper', worker.includes('function notFound(') && worker.includes('return notFound(path)'));
ok('worker 405 uses methodNotAllowed helper', worker.includes('function methodNotAllowed(') && worker.includes('return methodNotAllowed(request.method)'));
ok('worker read functions handle DB setup errors', worker.includes('} catch (error) {') && worker.includes('dbUnavailable('));

console.log('\nwaxonedge-indexer-blueprint.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
