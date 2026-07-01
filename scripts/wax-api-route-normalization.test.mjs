import assert from 'node:assert/strict';
import { handleWaxBridgeRoute, WAX_BRIDGE_CONTRACT } from '../workers/moonboys-api/routes/wax/index.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function template(id, collection) {
  return {
    template_id: String(id),
    issued_supply: '3',
    max_supply: '3',
    collection: { collection_name: collection },
    schema: { schema_name: 'testschema' },
    immutable_data: {
      name: `Template ${id}`,
      img: 'QmQ9CwboL2gj4NK12Yr49FiL7zQxyMWD7LAEYeDaqFRbY4',
    },
  };
}

function makeFetchRecorder() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/templates')) {
      const collection = parsed.searchParams.get('collection_name');
      const ids = String(parsed.searchParams.get('ids') || '101,102').split(',').filter(Boolean);
      return jsonResponse({ data: ids.map((id) => template(id, collection)) });
    }
    if (parsed.pathname.endsWith('/assets/_count')) {
      return jsonResponse({ data: '2' });
    }
    if (/\/assets\/\d+$/.test(parsed.pathname)) {
      return jsonResponse({ data: {
        asset_id: '123',
        owner: 'holder.gm',
        template_mint: '1',
        template: template(101, 'gkniftyheads'),
      } });
    }
    return jsonResponse({ data: [] });
  };
  return { calls, fetchImpl };
}

async function bridge(path, options = {}) {
  const request = new Request(`https://api.example.test${path}`, { method: options.method || 'GET' });
  const response = await handleWaxBridgeRoute(request, {}, { 'Access-Control-Allow-Origin': 'https://cryptomoonboys.com' }, options);
  return {
    response,
    body: await response.json(),
  };
}

const health = await bridge('/api/wax/health');
assert.equal(health.response.status, 200, '/api/wax/health should return 200');
assert.equal(health.body.ok, true, '/api/wax/health should return ok');
assert.equal(health.body.data.read_only, true, '/api/wax/health should declare read-only mode');

for (const collection of ['gkniftyheads', 'noballgamess']) {
  const recorder = makeFetchRecorder();
  const result = await bridge(`/api/wax/templates?collection=${collection}&ids=101,102,103`, { fetchImpl: recorder.fetchImpl });
  assert.equal(result.response.status, 200, `${collection} batch route should return 200`);
  assert.equal(result.body.ok, true, `${collection} batch route should be ok`);
  assert.equal(result.body.data.templates.length, 3, `${collection} batch route should return requested rows`);
  assert.match(recorder.calls[0], /\/atomicassets\/v1\/templates\?/, `${collection} should use AtomicAssets templates endpoint`);
  assert.match(recorder.calls[0], /ids=101%2C102%2C103|ids=101,102,103/, `${collection} should preserve comma ID batching`);
  assert.equal(result.body.data.templates[0].image.url.startsWith('https://ipfs.hivebp.io/ipfs/'), true, 'template images should normalize to browser URLs');
}

const pageRecorder = makeFetchRecorder();
const pageData = await bridge('/api/wax/collections/gkniftyheads/page-data', { fetchImpl: pageRecorder.fetchImpl });
assert.equal(pageData.body.ok, true, 'collection page-data should return clean envelope');
assert.equal(pageData.body.data.collection, 'gkniftyheads', 'page-data should include collection name');
assert.ok(Array.isArray(pageData.body.data.templates), 'page-data should include templates array');

const verify = await bridge('/api/wax/verify-ownership', { method: 'POST' });
assert.equal(verify.response.status, 200, 'verify-ownership facade should be present');
assert.equal(verify.body.data.read_only, true, 'verify-ownership must remain read-only');
assert.equal(verify.body.data.verified, false, 'verify-ownership must not invent ownership');

assert.equal(WAX_BRIDGE_CONTRACT.read_only, true, 'WAX bridge contract must be read-only');
assert.ok(WAX_BRIDGE_CONTRACT.scoring_exclusions.includes('price'), 'price must remain excluded from WAX rarity scoring');
assert.ok(WAX_BRIDGE_CONTRACT.scoring_exclusions.includes('listings'), 'listings must remain excluded from WAX rarity scoring');

console.log('WAX API route normalization regression passed.');

