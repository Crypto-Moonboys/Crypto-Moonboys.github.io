#!/usr/bin/env node

import assert from 'node:assert/strict';
import { renderMarketAnalyticsSection } from './nft-market-analytics.mjs';

const html = renderMarketAnalyticsSection({
  analytics_status: 'degraded',
  days: 30,
  endpoint_status: {
    num_assets: { ok: true },
    marketcap: { ok: true },
    volume: { ok: true },
    top_templates: { ok: true },
    top_users: { ok: false, error: 'HTTP 500' },
  },
  data: {
    num_assets: { numberOfAssets: 123352 },
    marketcap: { usdMarketCap: 34528.35825610309, waxMarketCap: 458438.5664333417 },
    volume: { waxVolume: 6604.12684003, usdVolume: 31.326696148816993 },
    top_templates: [
      { template: { name: 'GKniftyHEADS FUN COUPON', template_id: 782888 }, collection: { name: 'gkniftyheads' } },
      { template: { name: 'Drift Doodle', template_id: 783252 }, collection: { name: 'gkniftyheads' } },
    ],
  },
});

assert.match(html, />123,352</, 'total assets should use numberOfAssets');
assert.match(html, />US\$34,528\.36</, 'market cap should use usdMarketCap');
assert.match(html, />6,604\.13 WAXP</, 'volume should use waxVolume');
assert.match(html, /GKniftyHEADS FUN COUPON, Drift Doodle/, 'top templates should use nested template names');
assert.doesNotMatch(html, /gkniftyheads, gkniftyheads/, 'collection name must not replace template labels');
assert.match(html, /Temporarily unavailable<\/strong><span>Top users/, 'only failed top users should be unavailable');
assert.match(html, /Temporarily unavailable: top users/, 'degraded copy should identify the failed optional endpoint');
assert.doesNotMatch(html, /https:\/\/wax-api\.hivebp\.io/, 'raw endpoint URLs should not be exposed in the page card');
assert.doesNotMatch(html, /failed: HTTP 500/, 'raw upstream errors should not be exposed in the page card');

console.log('nft-market-analytics-render.test.mjs passed');
