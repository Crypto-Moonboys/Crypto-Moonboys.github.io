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

ok('blueprint states no-fake-data rule', blueprint.includes('must never infer or fabricate'));
ok('blueprint defines Cloudflare Worker + D1 architecture', blueprint.includes('Cloudflare Worker') && blueprint.includes('D1'));
ok('blueprint lists read-only API routes', blueprint.includes('/api/waxonedge/summary') && blueprint.includes('/api/waxonedge/token/:contract/:symbol'));
ok('blueprint requires ABI-first swap.nefty handling', blueprint.includes('get_abi') && blueprint.includes('swap.nefty'));
ok('blueprint warns against all DEX claims before adapters are active', blueprint.includes('must not say “all WAX DEXs”'));

ok('schema defines tokens table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_tokens'));
ok('schema defines pairs table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_pairs'));
ok('schema defines token stats table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_token_stats'));
ok('schema defines holders table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_holders'));
ok('schema defines chart candles table', schema.includes('CREATE TABLE IF NOT EXISTS waxonedge_chart_candles'));

ok('worker returns unavailable instead of fake data', worker.includes('Requires indexed backend') && worker.includes('unavailable('));
ok('worker exposes summary endpoint', worker.includes("/api/waxonedge/summary"));
ok('worker exposes top tokens endpoint', worker.includes("/api/waxonedge/tokens/top"));
ok('worker exposes top pairs endpoint', worker.includes("/api/waxonedge/pairs/top"));
ok('worker does not implement fake scheduled sync', worker.includes('Sync implementation pending confirmed source adapters'));

console.log('\nwaxonedge-indexer-blueprint.test: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
