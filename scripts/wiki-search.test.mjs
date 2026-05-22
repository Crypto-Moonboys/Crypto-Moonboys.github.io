/**
 * wiki-search.test.mjs
 * Tests for token-based multi-word wiki search (scoreResult / renderSearchPage).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const wikiJs = await fs.readFile(path.join(ROOT, 'js', 'wiki.js'), 'utf8');

function makeSandbox() {
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
  return sandbox;
}

const sb = makeSandbox();
const scoreResult = sb.scoreResult;

assert.equal(typeof scoreResult, 'function', 'scoreResult must be callable from sandbox');

// ── Test fixtures ─────────────────────────────────────────────────────────────

const graffpunks247Radio = {
  title: 'GraffPUNKS 247 Radio — Crypto Moonboys Wiki',
  desc: 'GraffPUNKS 24/7 is the unrelenting sonic heartbeat of rebellion in the Crypto Moonboys universe, a blockchain radio station that pumps underground beats.',
  url: '/wiki/graffpunks-247-radio.html',
  tags: ['graffpunks', '247', 'radio', 'crypto', 'moonboys', 'wiki'],
  category: 'characters',
  rank_score: 445,
  search_index: {
    normalized_title: 'graffpunks 247 radio crypto moonboys wiki',
    tokens: ['graffpunks', '247', 'radio', 'crypto', 'moonboys', 'wiki'],
    keyword_bag: ['graffpunks', '247', 'radio', 'crypto', 'moonboys', 'wiki',
      'blockchain', 'station', 'underground', 'beats', 'rebellion']
  }
};

const graffpunksMain = {
  title: 'GraffPUNKS — Crypto Moonboys Wiki',
  desc: 'The GraffPUNKS are the pulsating core of the Crypto Moonboys universe.',
  url: '/wiki/graffpunks.html',
  tags: ['graffpunks', 'crypto', 'moonboys', 'wiki'],
  category: 'characters',
  rank_score: 799,
  search_index: {
    normalized_title: 'graffpunks crypto moonboys wiki',
    tokens: ['graffpunks', 'crypto', 'moonboys', 'wiki'],
    keyword_bag: ['graffpunks', 'crypto', 'moonboys', 'wiki', 'faction', 'street', 'art']
  }
};

const bitcoinArticle = {
  title: 'Bitcoin — Crypto Moonboys Wiki',
  desc: 'The original cryptocurrency.',
  url: '/wiki/bitcoin.html',
  tags: ['bitcoin', 'crypto', 'moonboys', 'wiki'],
  category: 'cryptocurrencies',
  rank_score: 500,
  search_index: {
    normalized_title: 'bitcoin crypto moonboys wiki',
    tokens: ['bitcoin', 'crypto', 'moonboys', 'wiki'],
    keyword_bag: ['bitcoin', 'crypto', 'digital', 'currency']
  }
};

// ── 1. GRAFFPUNKS RADIO finds the radio article ───────────────────────────────
{
  const r = scoreResult(graffpunks247Radio, 'GRAFFPUNKS RADIO');
  assert.ok(r.queryScore > 0,
    'GRAFFPUNKS RADIO must match graffpunks-247-radio article (queryScore > 0)');
  assert.equal(r.matchedTokenCount, 2,
    'GRAFFPUNKS RADIO: both tokens "graffpunks" and "radio" must be matched');
  assert.equal(r.totalTokenCount, 2,
    'GRAFFPUNKS RADIO: query must have 2 tokens');
}

// ── 2. GRAFFPUNKS RADIO does NOT match an unrelated article ─────────────────
{
  const r = scoreResult(bitcoinArticle, 'GRAFFPUNKS RADIO');
  assert.equal(r.queryScore, 0,
    'GRAFFPUNKS RADIO must not match the bitcoin article');
}

// ── 3. GRAFFPUNKS (single word) still finds GraffPUNKS pages ────────────────
{
  const r = scoreResult(graffpunksMain, 'GRAFFPUNKS');
  assert.ok(r.queryScore > 0,
    'Single-word GRAFFPUNKS must still find the main GraffPUNKS article');
  assert.ok(r.queryScore > 0,
    'Single-word GRAFFPUNKS must still find graffpunks-247-radio article');

  const r2 = scoreResult(graffpunks247Radio, 'GRAFFPUNKS');
  assert.ok(r2.queryScore > 0,
    'Single-word GRAFFPUNKS must still find graffpunks-247-radio');
}

// ── 4. Lowercase query produces same score as uppercase ───────────────────────
{
  const lower = scoreResult(graffpunks247Radio, 'graffpunks radio');
  const upper = scoreResult(graffpunks247Radio, 'GRAFFPUNKS RADIO');
  assert.equal(lower.queryScore, upper.queryScore,
    'Lowercase and uppercase queries must produce identical scores');
}

// ── 5. Punctuation in query does not break search ────────────────────────────
{
  const clean   = scoreResult(graffpunks247Radio, 'GRAFFPUNKS RADIO');
  const punct   = scoreResult(graffpunks247Radio, 'GRAFFPUNKS, RADIO!');
  const spaces  = scoreResult(graffpunks247Radio, '  GRAFFPUNKS   RADIO  ');
  assert.equal(punct.queryScore, clean.queryScore,
    'Punctuation in query must not change the match score');
  assert.equal(spaces.queryScore, clean.queryScore,
    'Extra whitespace in query must not change the match score');
}

// ── 6. Nonsense query returns zero results for all tested articles ─────────────
{
  const r1 = scoreResult(graffpunks247Radio, 'XYZFOO123NONSENSE');
  const r2 = scoreResult(bitcoinArticle, 'XYZFOO123NONSENSE');
  const r3 = scoreResult(graffpunksMain, 'XYZFOO123NONSENSE');
  assert.equal(r1.queryScore, 0, 'Nonsense must not match graffpunks-247-radio');
  assert.equal(r2.queryScore, 0, 'Nonsense must not match bitcoin article');
  assert.equal(r3.queryScore, 0, 'Nonsense must not match graffpunks main article');
}

// ── 7. Multi-word query matches across different fields ───────────────────────
{
  // "radio blockchain" — "radio" is in title/tags, "blockchain" only in desc/keyword_bag
  const r = scoreResult(graffpunks247Radio, 'radio blockchain');
  assert.ok(r.queryScore > 0,
    '"radio blockchain" must match graffpunks-247-radio (cross-field token match)');
  assert.equal(r.matchedTokenCount, 2,
    '"radio blockchain": both tokens must be matched across different fields');
}

// ── 8. Empty query returns zero queryScore and preserves rank_score ───────────
{
  const r = scoreResult(graffpunks247Radio, '');
  assert.equal(r.queryScore, 0,
    'Empty query must return queryScore: 0');
  assert.equal(r.rankScore, graffpunks247Radio.rank_score,
    'Empty query must return correct rankScore');
  assert.equal(r.finalScore, graffpunks247Radio.rank_score,
    'Empty query: finalScore must equal rank_score');
}

// ── 9. Real wiki-index: GRAFFPUNKS RADIO finds relevant articles ──────────────
{
  const wikiIndex = JSON.parse(
    await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8')
  );

  const scored = wikiIndex.map(item => ({
    url: item.url,
    title: item.title,
    ...scoreResult(item, 'GRAFFPUNKS RADIO')
  }));

  const allTokenMatches = scored.filter(
    r => r.queryScore > 0 && r.matchedTokenCount >= r.totalTokenCount
  );

  assert.ok(
    allTokenMatches.length > 0,
    'GRAFFPUNKS RADIO must find at least one article in the real wiki-index'
  );

  const hasRadioArticle = allTokenMatches.some(r =>
    r.url.toLowerCase().includes('graffpunk') &&
    (r.url.toLowerCase().includes('radio') || r.title.toLowerCase().includes('radio'))
  );
  assert.ok(
    hasRadioArticle,
    'GRAFFPUNKS RADIO must find a GraffPUNKS radio article in the real wiki-index'
  );
}

// ── 10. Real wiki-index: GRAFFPUNKS alone finds GraffPUNKS articles ──────────
{
  const wikiIndex = JSON.parse(
    await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8')
  );

  const scored = wikiIndex.map(item => ({
    url: item.url,
    ...scoreResult(item, 'GRAFFPUNKS')
  }));

  const matches = scored.filter(r => r.queryScore > 0);
  assert.ok(matches.length > 0,
    'GRAFFPUNKS must still find GraffPUNKS articles in real wiki-index');

  const hasGraffpunksMain = matches.some(r => r.url.includes('graffpunks'));
  assert.ok(hasGraffpunksMain,
    'GRAFFPUNKS must find articles with graffpunks in URL');
}

console.log('wiki-search.test: PASS');
