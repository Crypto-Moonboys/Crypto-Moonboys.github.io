import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'data/waxonedge/waxcash-bubbles-bootstrap.json');
const DEFAULT_SOURCE_URL = 'https://cryptomoonboys.com/api/waxonedge/waxcash-bubbles-lite?mode=membership';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function payloadData(value) {
  return value && value.data ? value.data : value;
}

function sourceRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.value)) return value.value;
  return [];
}

function staticBootstrapPayload(payload) {
  const data = payloadData(payload) || {};
  const tokens = sourceRows(data.tokens);
  const pairs = sourceRows(data.pairs);
  if (!tokens.length) throw new Error('canonical membership source returned no tokens');
  if (!pairs.length) throw new Error('canonical membership source returned no pairs');
  const generatedAt = data.generated_at || data.updated_at || new Date().toISOString();
  return {
    ok: true,
    data_available: true,
    mode: 'membership',
    source: 'waxcash_bubbles_static_bootstrap',
    generated_at: generatedAt,
    updated_at: data.updated_at || generatedAt,
    tokens,
    pairs,
    summary: {
      ...(data.summary || {}),
      mode: 'membership',
      generated_at: generatedAt,
      updated_at: data.updated_at || generatedAt,
      data_available: true,
      indexed_pair_count: data.summary?.indexed_pair_count ?? pairs.length,
      source_feed: '/data/waxonedge/waxcash-bubbles-bootstrap.json',
    },
    payload_policy: {
      ...(data.payload_policy || {}),
      static_first_paint: true,
      membership_only: true,
      no_worker_required_for_first_paint: true,
      no_fake_value: true,
    },
    no_fake_value: true,
  };
}

const sourceUrl = argValue('--source') || process.env.WAXONEDGE_BOOTSTRAP_SOURCE_URL || DEFAULT_SOURCE_URL;
const outputPath = path.resolve(ROOT, argValue('--out') || OUTPUT_PATH);

const response = await fetch(sourceUrl, {
  headers: { Accept: 'application/json' },
  cache: 'no-store',
});
if (!response.ok) throw new Error(`bootstrap source failed: ${response.status} ${response.statusText}`);

const payload = staticBootstrapPayload(await response.json());
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${path.relative(ROOT, outputPath)} from ${sourceUrl}`);
