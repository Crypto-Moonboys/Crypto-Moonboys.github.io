import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const wikiPath = path.join(ROOT, 'js', 'wiki.js');
const wikiJs = await fs.readFile(wikiPath, 'utf8');

function functionBlock(src, name) {
  const start = src ? src.indexOf(`function ${name}`) : -1;
  if (start === -1) return '';
  const remainder = src.slice(start + 1);
  const nextMatch = remainder.match(/\n\s*function\s+/);
  const next = nextMatch ? start + 1 + nextMatch.index : -1;
  return src.slice(start, next === -1 ? src.length : next);
}

const renderSearchPageBlock = functionBlock(wikiJs, 'renderSearchPage');
const scoreResultBlock = functionBlock(wikiJs, 'scoreResult');

assert.ok(
  /function\s+getArticleSummary\s*\(/.test(wikiJs),
  'wiki.js must define getArticleSummary(item)',
);

assert.ok(
  renderSearchPageBlock.includes('getArticleSummary(item)'),
  'renderSearchPage() must use getArticleSummary(item)',
);

assert.ok(
  wikiJs.includes('article-card-summary'),
  'search cards must render article-card-summary',
);

assert.ok(
  wikiJs.includes('article-card-meta') && wikiJs.includes('article-card-path'),
  'search cards must render metadata and subtle path classes',
);

assert.ok(
  /return\s*\{\s*queryScore:\s*0,\s*rankScore:\s*item\.rank_score,\s*finalScore:\s*item\.rank_score\s*\};/.test(scoreResultBlock) &&
  /finalScore:\s*\(queryScore\s*\*\s*FINAL_QUERY_WEIGHT\)\s*\+\s*\(rankScore\s*\*\s*FINAL_RANK_WEIGHT\)/.test(scoreResultBlock),
  'scoreResult/rank_score contract must remain unchanged',
);

const sandbox = {
  console,
  URL,
  URLSearchParams,
  fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
  history: { replaceState() {} },
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    querySelector() { return null; }
  },
  window: {
    location: {
      pathname: '/search.html',
      search: '',
      href: 'https://example.test/search.html'
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(wikiJs, sandbox, { filename: 'wiki.js' });

assert.equal(typeof sandbox.getArticleSummary, 'function', 'getArticleSummary must be executable');

const slugFallback = sandbox.getArticleSummary({
  title: 'HODL Wars',
  summary: 'hodlwarscryptomoonboyswiki',
  tags: [],
  url: '/wiki/hodl-wars.html'
});
assert.equal(
  slugFallback,
  'Explore this Crypto Moonboys Wiki article covering HODL Wars.',
  'compressed slug-like summary must not be used as visible description',
);

const tagsFallback = sandbox.getArticleSummary({
  title: 'HODL Wars',
  tags: ['HODL', 'Moonboys', 'Crypto', 'Lore']
});
assert.equal(
  tagsFallback,
  'Explore this Crypto Moonboys Wiki article covering HODL Wars, with links to HODL, Moonboys, Crypto.',
  'fallback summary with tags should include first three tags',
);

const thresholdFallback = sandbox.getArticleSummary({
  title: 'Moonboys Lore',
  summary: 'cryptomoonboyswiki',
  tags: []
});
assert.equal(
  thresholdFallback,
  'Explore this Crypto Moonboys Wiki article covering Moonboys Lore.',
  'minimum-length compressed keyword slug text should fall back to readable copy',
);

const preferredField = sandbox.getArticleSummary({
  title: 'HODL Wars',
  desc: 'A readable lore summary.'
});
assert.equal(
  preferredField,
  'A readable lore summary.',
  'getArticleSummary should pick a readable preferred description field',
);

console.log('search-page-card-rendering.test: PASS');
