import { __waxonedgeTestHooks } from '../workers/moonboys-api/routes/waxonedge.js';

let passed = 0;
let failed = 0;

function ok(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

function num(value) {
  return value == null ? null : Number(value);
}

function almostEqual(actual, expected, epsilon = 1e-9) {
  return Math.abs(Number(actual) - Number(expected)) <= epsilon;
}

const waxUsd = 0.006;
const priceIndex = new Map([['eosio.token::WAX', { priceWax: 1, priceUsd: waxUsd }]]);

const directWaxPair = {
  source: 'swap.nefty',
  pair_id: 'WAXWUF',
  token_a_contract: 'eosio.token',
  token_a_symbol: 'WAX',
  token_b_contract: 'wuffi',
  token_b_symbol: 'WUF',
  price: '999',
  reserve_a: '1000',
  reserve_b: '500000',
  liquidity_wax: '999999999',
  liquidity_usd: '999999',
};

const wufAbcPair = {
  source: 'swap.taco',
  pair_id: 'WUFABC',
  token_a_contract: 'wuffi',
  token_a_symbol: 'WUF',
  token_b_contract: 'abc.token',
  token_b_symbol: 'ABC',
  price: 'malformed-price',
  reserve_a: '100000',
  reserve_b: '100',
  liquidity_wax: '888888888',
  liquidity_usd: '888888',
};

const abcWaxPair = {
  source: 'swap.box',
  pair_id: 'ABCWAX',
  token_a_contract: 'abc.token',
  token_a_symbol: 'ABC',
  token_b_contract: 'eosio.token',
  token_b_symbol: 'WAX',
  price: '2',
  reserve_a: '100',
  reserve_b: '200',
};

const isolatedPair = {
  source: 'swap.alcor',
  pair_id: 'XXXZZZ',
  token_a_contract: 'xxx.token',
  token_a_symbol: 'XXX',
  token_b_contract: 'zzz.token',
  token_b_symbol: 'ZZZ',
  price: '0.001',
  reserve_a: '1',
  reserve_b: '1',
  liquidity_wax: '777777',
  liquidity_usd: '777',
};

const noReserveWufPair = {
  source: 'swap.alcor',
  pair_id: 'WUFBAD',
  token_a_contract: 'wuffi',
  token_a_symbol: 'WUF',
  token_b_contract: 'bad.token',
  token_b_symbol: 'BAD',
  price: '0.001',
  reserve_a: null,
  reserve_b: null,
  liquidity_wax: '777777',
  liquidity_usd: '777',
};

const graphRows = [directWaxPair, wufAbcPair, abcWaxPair, isolatedPair, noReserveWufPair];
const routeIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph(graphRows, priceIndex);

const waxRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('eosio.token::WAX', routeIndex);
const wufRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('wuffi::WUF', routeIndex);
const abcRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('abc.token::ABC', routeIndex);
const zzzRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('zzz.token::ZZZ', routeIndex);

ok('WAX self price is exactly 1 WAX',
  waxRoute?.route_type === 'wax_self' &&
  waxRoute.priceWax === 1);

ok('direct WAX route derives token WAX price from real reserves',
  wufRoute?.route_type === 'direct_wax' &&
  almostEqual(wufRoute.priceWax, 0.002));

ok('pairEdgePrice uses reserve ratio even when pair.price is present',
  directWaxPair.price !== '500' &&
  almostEqual(wufRoute.priceWax, 0.002));

const multiHopOnlyRouteIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph([wufAbcPair, abcWaxPair], priceIndex);
const multiHopWufRoute = __waxonedgeTestHooks.selectOgWaxRoutePrice('wuffi::WUF', multiHopOnlyRouteIndex);
ok('multi-hop WAX route is valid without direct WAX pair',
  multiHopWufRoute?.route_type === 'multi_hop_wax' &&
  multiHopWufRoute.route_hops.length === 2 &&
  almostEqual(multiHopWufRoute.priceWax, 0.002));

ok('malformed pair.price does not discard a valid reserve-backed edge',
  wufAbcPair.price === 'malformed-price' &&
  almostEqual(multiHopWufRoute.priceWax, 0.002));

ok('token with no direct WAX pool can still be valued through the graph',
  abcRoute?.route_type === 'direct_wax' &&
  almostEqual(abcRoute.priceWax, 2));

ok('unresolved token remains null instead of worthless or guessed',
  zzzRoute == null);

const directProof = __waxonedgeTestHooks.pairContributionProof(
  directWaxPair,
  'wuffi',
  'WUF',
  priceIndex,
  routeIndex,
);
const multiHopProof = __waxonedgeTestHooks.pairContributionProof(
  wufAbcPair,
  'wuffi',
  'WUF',
  priceIndex,
  routeIndex,
);
const unresolvedProof = __waxonedgeTestHooks.pairContributionProof(
  noReserveWufPair,
  'wuffi',
  'WUF',
  priceIndex,
  routeIndex,
);

ok('stored liquidity_wax is ignored in direct pair contribution',
  almostEqual(directProof.contribution_wax, 2000) &&
  directProof.contribution_wax !== directWaxPair.liquidity_wax);

ok('stored liquidity_usd is ignored and USD comes from WAX times live WAX/USD',
  almostEqual(directProof.contribution_usd, 12) &&
  directProof.contribution_usd !== directWaxPair.liquidity_usd);

const badReserveRouteIndex = __waxonedgeTestHooks.buildOgWaxRouteGraph([
  { ...directWaxPair, pair_id: 'ZERO', reserve_a: '0', reserve_b: '500000' },
  { ...abcWaxPair, pair_id: 'NEGATIVE', reserve_a: '-1', reserve_b: '200' },
], priceIndex);
ok('zero and negative reserves are rejected from the WAX route graph',
  __waxonedgeTestHooks.selectOgWaxRoutePrice('wuffi::WUF', badReserveRouteIndex) == null &&
  __waxonedgeTestHooks.selectOgWaxRoutePrice('abc.token::ABC', badReserveRouteIndex) == null);

ok('unresolved contribution has null values and reason codes',
  unresolvedProof.contributes_to_liquidity === false &&
  unresolvedProof.contribution_wax === null &&
  unresolvedProof.contribution_usd === null &&
  unresolvedProof.reason_codes.length > 0);

const aggregate = __waxonedgeTestHooks.aggregatePairContributionTotals(
  [directWaxPair, wufAbcPair, noReserveWufPair],
  'wuffi',
  'WUF',
  priceIndex,
  graphRows,
  { routeIndex },
);
const contributionSumWax = num(directProof.contribution_wax) + num(multiHopProof.contribution_wax);
const contributionSumUsd = num(directProof.contribution_usd) + num(multiHopProof.contribution_usd);
ok('all-pairs aggregate equals sum of contributing proof rows',
  aggregate.indexed_pair_count === 3 &&
  aggregate.contributing_pair_count === 2 &&
  aggregate.unresolved_pair_count === 1 &&
  almostEqual(aggregate.total_liquidity_wax, contributionSumWax) &&
  almostEqual(aggregate.total_liquidity_usd, contributionSumUsd) &&
  almostEqual(aggregate.total_tvl_wax, contributionSumWax) &&
  almostEqual(aggregate.total_tvl_usd, contributionSumUsd));

const waxOnlyRouteIndex = new Map([['eosio.token::WAX', {
  priceWax: 1,
  priceUsd: 0.006,
  route_type: 'wax_self',
  route_hops: [],
  route_liquidity_score: null,
}]]);
const waxPoolProof = __waxonedgeTestHooks.pairContributionProof(
  {
    source: 'swap.taco',
    pair_id: 'WAXUNROUTED',
    token_a_contract: 'eosio.token',
    token_a_symbol: 'WAX',
    token_b_contract: 'unrouted',
    token_b_symbol: 'NOROUTE',
    reserve_a: '25',
    reserve_b: '250000',
    liquidity_wax: '999999',
    liquidity_usd: '999999',
  },
  'eosio.token',
  'WAX',
  priceIndex,
  waxOnlyRouteIndex,
);
ok('WAX-aware pair valuation uses WAX-side reserve without requiring counter-token route',
  waxPoolProof.route_type === 'wax_self' &&
  Number(waxPoolProof.contribution_wax) === 50 &&
  Number(waxPoolProof.contribution_usd) === 0.3 &&
  Number(waxPoolProof.reserve_side_wax_values.token) === 25 &&
  waxPoolProof.reserve_side_wax_values.quote === null &&
  waxPoolProof.reason_codes.length === 0);

console.log(`\nwaxonedge-valuation-contract.test: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
