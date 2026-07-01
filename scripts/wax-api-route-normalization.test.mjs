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

function asset(id, owner = 'holder.gm', collection = 'gkniftyheads', templateId = 101) {
  return {
    asset_id: String(id),
    owner,
    burned: false,
    template_mint: '1',
    collection: { collection_name: collection },
    template: template(templateId, collection),
  };
}

function staticPayload(file) {
  if (file.endsWith('template-rarity.json')) {
    return {
      collection: 'gkniftyheads',
      live_data_status: 'atomicassets live asset count',
      ranked_templates: [{
        template_id: 101,
        title: 'Template 101',
        rank: 1,
        rarity_band: 'Legendary',
        image_url: 'https://ipfs.hivebp.io/ipfs/QmQ9CwboL2gj4NK12Yr49FiL7zQxyMWD7LAEYeDaqFRbY4',
      }],
      utility_open_mint_templates: [],
      unissued_templates: [],
    };
  }
  if (file.endsWith('trait-exposure.json')) return { schemas: [{ schema_name: 'testschema', templates: 1, live_supply: 2 }] };
  if (file.endsWith('holder-leaderboard.json')) return { holders: [{ owner: 'holder.gm', live_assets: 1 }] };
  if (file.endsWith('asset-rarity-leaderboard.json') || file.endsWith('live-asset-rarity.json')) return { assets: [{ asset_id: '123', template_id: 101, original_mint_number: 1, surviving_mint_rank: 1 }] };
  if (file.endsWith('sync-status.json')) return { status: 'ok' };
  return {};
}

function makeFetchRecorder() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const parsed = new URL(url);
    if (parsed.hostname === 'cryptomoonboys.com') return jsonResponse(staticPayload(parsed.pathname));
    if (parsed.pathname.endsWith('/collections/gkniftyheads/stats') || parsed.pathname.endsWith('/collections/noballgamess/stats')) {
      return jsonResponse({ data: { assets: 99, templates: 3 } });
    }
    if (parsed.pathname.endsWith('/templates')) {
      const collection = parsed.searchParams.get('collection_name');
      const ids = String(parsed.searchParams.get('ids') || '101,102,103').split(',').filter(Boolean);
      return jsonResponse({ data: ids.map((id) => template(id, collection)) });
    }
    if (parsed.pathname.endsWith('/assets/_count')) return jsonResponse({ data: '2' });
    if (/\/assets\/123$/.test(parsed.pathname)) return jsonResponse({ data: asset(123) });
    if (parsed.pathname.endsWith('/assets')) {
      const collection = parsed.searchParams.get('collection_name') || 'gkniftyheads';
      const owner = parsed.searchParams.get('owner') || 'holder.gm';
      const templateId = Number(parsed.searchParams.get('template_id') || 101);
      return jsonResponse({ data: [asset(123, owner, collection, templateId)] });
    }
    return jsonResponse({ data: [] });
  };
  return { calls, fetchImpl };
}

async function bridge(path, options = {}) {
  const init = { method: options.method || 'GET' };
  if (options.body) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const request = new Request(`https://api.example.test${path}`, init);
  const response = await handleWaxBridgeRoute(request, {}, { 'Access-Control-Allow-Origin': 'https://cryptomoonboys.com' }, options);
  return { response, body: await response.json() };
}

const health = await bridge('/api/wax/health');
assert.equal(health.response.status, 200, '/api/wax/health should return 200');
assert.equal(health.body.ok, true, '/api/wax/health should return ok');
assert.equal(health.body.source, 'worker', '/api/wax/health should report worker source');
assert.deepEqual(health.body.data.supported_collections, ['gkniftyheads', 'noballgamess'], '/api/wax/health should list supported collections');
assert.ok(health.body.data.routes.includes('POST /api/wax/verify-ownership'), '/api/wax/health should list active routes');

for (const collection of ['gkniftyheads', 'noballgamess']) {
  const statsRecorder = makeFetchRecorder();
  const stats = await bridge(`/api/wax/collections/${collection}/stats`, { fetchImpl: statsRecorder.fetchImpl });
  assert.equal(stats.body.ok, true, `${collection} stats should return useful envelope`);
  assert.ok(stats.body.data.source_urls.length >= 2, `${collection} stats should include source URLs`);
  assert.equal(stats.body.data.assets_count, 2, `${collection} stats should include asset count`);

  const templatesRecorder = makeFetchRecorder();
  const templates = await bridge(`/api/wax/collections/${collection}/templates`, { fetchImpl: templatesRecorder.fetchImpl });
  assert.equal(templates.body.ok, true, `${collection} collection templates should be active`);
  assert.ok(templates.body.data.templates.length > 0, `${collection} collection templates should return rows`);
  assert.equal(templates.body.data.templates[0].image.url.startsWith('https://ipfs.hivebp.io/ipfs/'), true, 'template images should normalize');

  const batchRecorder = makeFetchRecorder();
  const batch = await bridge(`/api/wax/templates?collection=${collection}&ids=101,102,103`, { fetchImpl: batchRecorder.fetchImpl });
  assert.equal(batch.body.ok, true, `${collection} batch route should be ok`);
  assert.equal(batch.body.data.templates.length, 3, `${collection} batch route should return requested rows`);
  assert.match(batchRecorder.calls[0], /\/atomicassets\/v1\/templates\?/, `${collection} should use AtomicAssets templates endpoint`);
  assert.match(batchRecorder.calls[0], /ids=101%2C102%2C103|ids=101,102,103/, `${collection} should preserve comma ID batching`);
}

const pageRecorder = makeFetchRecorder();
const pageData = await bridge('/api/wax/collections/gkniftyheads/page-data', { fetchImpl: pageRecorder.fetchImpl });
assert.equal(pageData.body.ok, true, 'collection page-data should return clean envelope');
assert.equal(pageData.body.data.collection, 'gkniftyheads', 'page-data should include collection name');
assert.ok(pageData.body.data.templates.length > 0, 'page-data should not return empty templates when static data exists');
assert.ok(pageData.body.data.template_rarity.ranked_templates.length > 0, 'page-data should include static template rarity payload');
assert.ok(pageData.body.data.source_urls.length > 0, 'page-data should include source URLs');

const missingCollection = await bridge('/api/wax/templates/101/stats', { fetchImpl: makeFetchRecorder().fetchImpl });
assert.equal(missingCollection.response.status, 400, 'template stats must require collection');
const templateStats = await bridge('/api/wax/templates/101/stats?collection=gkniftyheads', { fetchImpl: makeFetchRecorder().fetchImpl });
assert.equal(templateStats.body.ok, true, 'template stats should be active when collection is supplied');
assert.equal(templateStats.body.data.live_supply, 2, 'template stats should include live supply count');

const assetResult = await bridge('/api/wax/assets/123', { fetchImpl: makeFetchRecorder().fetchImpl });
assert.equal(assetResult.body.ok, true, 'asset route should return normalized asset');
assert.equal(assetResult.body.data.asset.asset_id, '123', 'asset route should include asset id');
assert.equal(assetResult.body.data.asset.image.url.startsWith('https://ipfs.hivebp.io/ipfs/'), true, 'asset route should normalize image');

const assetImage = await bridge('/api/wax/assets/123/image', { fetchImpl: makeFetchRecorder().fetchImpl });
assert.equal(assetImage.body.ok, true, 'asset image route should return normalized image');
assert.equal(assetImage.body.data.image.url.startsWith('https://ipfs.hivebp.io/ipfs/'), true, 'asset image route should expose browser URL');

const walletAssets = await bridge('/api/wax/wallets/holder.gm/nfts?collection=gkniftyheads', { fetchImpl: makeFetchRecorder().fetchImpl });
assert.equal(walletAssets.body.ok, true, 'wallet NFTs route should be active');
assert.equal(walletAssets.body.data.assets.length, 1, 'wallet NFTs route should return owned assets');

const verifyAsset = await bridge('/api/wax/verify-ownership', {
  method: 'POST',
  fetchImpl: makeFetchRecorder().fetchImpl,
  body: { account: 'holder.gm', collection: 'gkniftyheads', asset_id: '123' },
});
assert.equal(verifyAsset.body.ok, true, 'verify ownership asset check should return ok');
assert.equal(verifyAsset.body.data.verified, true, 'verify ownership should be true for matching live asset owner');
assert.equal(verifyAsset.body.data.read_only, true, 'verify ownership must remain read-only');

const verifyWrongOwner = await bridge('/api/wax/verify-ownership', {
  method: 'POST',
  fetchImpl: makeFetchRecorder().fetchImpl,
  body: { account: 'wrong.gm', collection: 'gkniftyheads', asset_id: '123' },
});
assert.equal(verifyWrongOwner.body.data.verified, false, 'verify ownership should be false for wrong owner');

const verifyTemplate = await bridge('/api/wax/verify-ownership', {
  method: 'POST',
  fetchImpl: makeFetchRecorder().fetchImpl,
  body: { account: 'holder.gm', collection: 'noballgamess', template_id: 401767 },
});
assert.equal(verifyTemplate.body.data.verified, true, 'verify ownership should be true for matching owner/template');

assert.equal(WAX_BRIDGE_CONTRACT.read_only, true, 'WAX bridge contract must be read-only');
assert.ok(WAX_BRIDGE_CONTRACT.scoring_exclusions.includes('price'), 'price must remain excluded from WAX rarity scoring');
assert.ok(WAX_BRIDGE_CONTRACT.scoring_exclusions.includes('listings'), 'listings must remain excluded from WAX rarity scoring');

console.log('WAX API route normalization regression passed.');

