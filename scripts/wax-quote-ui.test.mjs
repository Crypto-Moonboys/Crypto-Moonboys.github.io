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

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`PASS: ${label}`);
    passed += 1;
  } else {
    console.error(`FAIL: ${label}${detail ? ` - ${detail}` : ''}`);
    failed += 1;
  }
}

ok('quote.html exists', exists('quote.html'));
ok('quote CSS exists', exists('css/wax-quote-ui.css'));
ok('quote route engine exists', exists('js/wax-route-engine.js'));
ok('quote UI exists', exists('js/wax-quote-ui.js'));

const html = exists('quote.html') ? read('quote.html') : '';
const engine = exists('js/wax-route-engine.js') ? read('js/wax-route-engine.js') : '';
const ui = exists('js/wax-quote-ui.js') ? read('js/wax-quote-ui.js') : '';

execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/wax-route-engine.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'js/wax-quote-ui.js')], { stdio: 'inherit' });

ok('quote.html loads route engine before UI',
  html.includes('/js/wax-route-engine.js') &&
  html.includes('/js/wax-quote-ui.js') &&
  html.indexOf('/js/wax-route-engine.js') < html.indexOf('/js/wax-quote-ui.js'));

ok('route engine exposes provided function names',
  engine.includes('fetchAllPools') &&
  engine.includes('getSwapResult') &&
  engine.includes('findOptimalSplit') &&
  engine.includes('calculateOrderBookOutput') &&
  engine.includes('window.WAX_ROUTE_ENGINE'));

ok('route engine keeps multi-source pool loaders',
  engine.includes('fetchAlcorPools') &&
  engine.includes('fetchTacoPools') &&
  engine.includes('fetchNeftyPools') &&
  engine.includes("code: 'swap.taco'") &&
  engine.includes("code: 'swap.nefty'"));

ok('route engine keeps split path',
  engine.includes('function getSplitCandidate') &&
  engine.includes("type: 'split'") &&
  engine.includes('PxSmart Split'));

ok('route engine keeps spot/orderbook function as dormant support',
  engine.includes('function calculateOrderBookOutput') &&
  engine.includes('function spotCandidate') &&
  engine.includes('orderbook'));

ok('route engine does not auto-bridge through arbitrary token list',
  engine.includes('const CORE_BRIDGES') &&
  !engine.includes('findBridgeTokens'));

ok('quote UI only calls route engine for route computation',
  ui.includes('const engine = window.WAX_ROUTE_ENGINE') &&
  ui.includes('engine.fetchAllPools') &&
  ui.includes('engine.findOptimalSplit') &&
  !ui.includes('function getSwapResult') &&
  !ui.includes('function fetchAllPools'));

ok('quote UI has no signing/runtime libraries',
  !html.includes('waxjs') &&
  !html.includes('anchor-link') &&
  !engine.includes('waxjs') &&
  !engine.includes('anchor-link') &&
  !ui.includes('waxjs') &&
  !ui.includes('anchor-link'));

if (failed) {
  console.error(`wax-quote-ui smoke failed: ${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`wax-quote-ui smoke passed: ${passed} checks`);
