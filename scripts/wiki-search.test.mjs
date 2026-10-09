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
    setTimeout: (callback) => callback(),
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

async function selectMatches(indexData, query, options = {}) {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    fetch: async () => ({ ok: true, status: 200, json: async () => indexData }),
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
  await sandbox.loadWikiIndex();
  return sandbox.selectSearchMatches(query, options);
}

async function renderSearchResults(indexData, query) {
  const elements = {
    'search-results-page': { innerHTML: '' },
    'search-heading': { textContent: '' }
  };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    fetch: async () => ({ ok: true, status: 200, json: async () => indexData }),
    history: { replaceState() {} },
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getElementById(id) { return elements[id] || null; }
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
  await sandbox.loadWikiIndex();
  sandbox.renderSearchPage(query);
  return {
    html: elements['search-results-page'].innerHTML,
    heading: elements['search-heading'].textContent
  };
}

async function renderSearchAfterFailedIndexLoad(query) {
  const elements = {
    'search-results-page': { innerHTML: '' },
    'search-heading': { textContent: '' }
  };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout: (callback) => callback(),
    fetch: async () => ({ ok: false, status: 503, json: async () => [] }),
    history: { replaceState() {} },
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getElementById(id) { return elements[id] || null; }
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
  await sandbox.loadWikiIndex();
  sandbox.renderSearchPage(query);
  return {
    html: elements['search-results-page'].innerHTML,
    heading: elements['search-heading'].textContent
  };
}

const sb = makeSandbox();
const scoreResult = sb.scoreResult;
const selectSearchMatches = sb.selectSearchMatches;

assert.equal(typeof scoreResult, 'function', 'scoreResult must be callable from sandbox');
assert.equal(typeof selectSearchMatches, 'function', 'selectSearchMatches must be callable from sandbox');

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

const graffpunksStopwordOnly = {
  title: 'GraffPUNKS and the Alley Echoes — Crypto Moonboys Wiki',
  desc: 'A short profile of GraffPUNKS culture.',
  url: '/wiki/graffpunks-alley-echoes.html',
  tags: ['graffpunks', 'alley'],
  category: 'characters',
  rank_score: 200,
  search_index: {
    normalized_title: 'graffpunks and the alley echoes crypto moonboys wiki',
    tokens: ['graffpunks', 'and', 'the', 'alley', 'echoes', 'crypto', 'moonboys', 'wiki'],
    keyword_bag: ['graffpunks', 'alley', 'echoes']
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

  const r2 = scoreResult(graffpunks247Radio, 'GRAFFPUNKS');
  assert.ok(r2.queryScore > 0,
    'Single-word GRAFFPUNKS must still find graffpunks-247-radio article');
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
  assert.equal(r.matchedTokenCount, 0,
    'Empty query must return matchedTokenCount: 0');
  assert.equal(r.totalTokenCount, 0,
    'Empty query must return totalTokenCount: 0');
  assert.equal(r.rankScore, graffpunks247Radio.rank_score,
    'Empty query must return correct rankScore');
  assert.equal(r.finalScore, graffpunks247Radio.rank_score,
    'Empty query: finalScore must equal rank_score');
}

// ── 9. Search page falls back to partial matches when all-token matches are empty ──────────────
{
  const onlyPartial = {
    ...graffpunksMain,
    search_index: {
      ...graffpunksMain.search_index,
      keyword_bag: ['graffpunks', 'street', 'art']
    }
  };
  const { html, heading } = await renderSearchResults([onlyPartial], 'graffpunks radio');
  assert.ok(html.includes('GraffPUNKS — Crypto Moonboys Wiki'),
    'Search page must render partial matches when no result matches all tokens');
  assert.equal(heading, 'Results for "graffpunks radio" (1)',
    'Fallback branch should still report the rendered partial result count');
}

// ── 10. Partial fallback excludes stopword-only weak matches on long queries ───
{
  const { scored } = await selectMatches([graffpunksStopwordOnly], 'graffpunks radio rebellion and the', {
    allowPartialFallback: true
  });
  assert.equal(scored.length, 0,
    'Long query partial fallback must not pass results that only match one meaningful token plus stopwords');
}

{
  const { html, heading } = await renderSearchAfterFailedIndexLoad('bitcoin');
  assert.ok(
    html.includes('Search index failed to load. Refresh the page or try again later.'),
    'Search page must render a clear failed-load message when wiki-index.json fails'
  );
  assert.equal(heading, 'All Articles', 'Failed-load search page keeps the all-articles heading');
}

// ── 11. Real wiki-index: GRAFFPUNKS RADIO finds relevant articles ──────────────
{
  let callCount = 0;
  const elements = {
    'search-results-page': { innerHTML: '' },
    'search-heading': { textContent: '' }
  };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    fetch: async () => {
      callCount++;
      if (callCount === 1) return { ok: false, status: 404, json: async () => [] };
      return { ok: true, status: 200, json: async () => [graffpunksMain] };
    },
    history: { replaceState() {} },
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getElementById(id) { return elements[id] || null; }
    },
    window: {
      location: {
        pathname: '/search.html',
        search: '?q=graffpunks',
        href: 'https://example.test/search.html?q=graffpunks'
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(wikiJs, sandbox, { filename: 'wiki.js' });
  await sandbox.loadWikiIndex();
  assert.equal(sandbox.window.MOONBOYS_WIKI_SEARCH.getIndexLoadState(), 'failed',
    'Failed wiki-index load must expose failed state');
  assert.equal(typeof sandbox.window.MOONBOYS_WIKI_SEARCH.retryIndexLoad, 'function',
    'Wiki search must expose a retry hook');
  const retryState = await sandbox.window.MOONBOYS_WIKI_SEARCH.retryIndexLoad('graffpunks');
  assert.equal(retryState, 'loaded', 'Retry hook must restore loaded state after a successful fetch');
  assert.ok(elements['search-results-page'].innerHTML.includes('GraffPUNKS'),
    'Retry hook must re-render search results after reloading the index');

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

// ── 12. Real wiki-index: GRAFFPUNKS alone finds GraffPUNKS articles ──────────
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

// ── 13. Header autocomplete: GRAFFPUNKS RADIO returns relevant article ────────
{
  const wikiIndex = JSON.parse(
    await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8')
  );
  const { scored } = await selectMatches(wikiIndex, 'GRAFFPUNKS RADIO', {
    allowPartialFallback: true,
    limit: 5
  });

  assert.ok(scored.length > 0, 'Header autocomplete should return suggestions for GRAFFPUNKS RADIO');
  const hasRadioArticle = scored.some(r =>
    r.item.url.toLowerCase().includes('graffpunk') &&
    (r.item.url.toLowerCase().includes('radio') || String(r.item.title || '').toLowerCase().includes('radio'))
  );
  assert.ok(hasRadioArticle, 'Header autocomplete should include the GraffPUNKS radio article');
}

// ── 14. Full search and header autocomplete agree on top ordering ──────────────
{
  const wikiIndex = JSON.parse(
    await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8')
  );
  const keyQueries = ['GRAFFPUNKS RADIO', 'bitcoin'];

  for (const query of keyQueries) {
    const full = await selectMatches(wikiIndex, query, { allowPartialFallback: true });
    const header = await selectMatches(wikiIndex, query, {
      allowPartialFallback: true,
      limit: 5
    });

    if (!full.scored.length) continue;
    assert.equal(
      header.scored[0] && header.scored[0].item.url,
      full.scored[0].item.url,
      `Header and full search should share top result for query: ${query}`
    );
  }
}

// ── 15. Header autocomplete handles lowercase/punctuation variants ─────────────
{
  const wikiIndex = JSON.parse(
    await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8')
  );
  const lower = await selectMatches(wikiIndex, 'graffpunks radio', {
    allowPartialFallback: true,
    limit: 5
  });
  const punct = await selectMatches(wikiIndex, 'GRAFFPUNKS, RADIO!', {
    allowPartialFallback: true,
    limit: 5
  });

  const lowerTop = lower.scored[0] && lower.scored[0].item.url;
  const punctTop = punct.scored[0] && punct.scored[0].item.url;
  assert.equal(lowerTop, punctTop,
    'Header autocomplete top result should be stable for lowercase/punctuation variants');
}

// ── 16. Header autocomplete returns no suggestions for nonsense ────────────────
{
  const wikiIndex = JSON.parse(
    await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8')
  );
  const { scored } = await selectMatches(wikiIndex, 'zzzxqv-no-hit-000999', {
    allowPartialFallback: true,
    limit: 5
  });
  assert.equal(scored.length, 0, 'Nonsense query should return no header autocomplete suggestions');
}

// Wiki-index loading retries transient 503 responses without masking bad assets.
{
  let callCount = 0;
  const delays = [];
  const sandbox = makeSandbox();
  sandbox.setTimeout = (callback, delay) => {
    delays.push(delay);
    callback();
  };
  sandbox.fetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: false, status: 503, json: async () => [] };
    return { ok: true, status: 200, json: async () => [graffpunksMain] };
  };

  await sandbox.loadWikiIndex();
  assert.equal(callCount, 2, 'A transient 503 must be retried');
  assert.deepEqual(delays, [150], 'The first retry must wait before fetching again');
  assert.equal(sandbox.window.MOONBOYS_WIKI_SEARCH.getIndexLoadState(), 'loaded',
    'Wiki-index load must succeed when a retry returns valid JSON');
}

{
  let callCount = 0;
  const delays = [];
  const sandbox = makeSandbox();
  sandbox.setTimeout = (callback, delay) => {
    delays.push(delay);
    callback();
  };
  sandbox.fetch = async () => {
    callCount++;
    return { ok: false, status: 503, json: async () => [] };
  };

  await sandbox.loadWikiIndex();
  assert.equal(callCount, 3, 'Persistent 503 responses must stop after three attempts');
  assert.deepEqual(delays, [150, 300], 'Retry delays must increase between attempts');
  assert.equal(sandbox.window.MOONBOYS_WIKI_SEARCH.getIndexLoadState(), 'failed',
    'Persistent 503 responses must leave the loader in a clean failed state');
}

{
  let callCount = 0;
  const sandbox = makeSandbox();
  sandbox.fetch = async () => {
    callCount++;
    return { ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON'); } };
  };

  await sandbox.loadWikiIndex();
  assert.equal(callCount, 1, 'Invalid JSON must not be retried');
  assert.equal(sandbox.window.MOONBOYS_WIKI_SEARCH.getIndexLoadState(), 'failed',
    'Invalid JSON must leave the loader in a clean failed state');
}

// Newly authored people and institutions must be discoverable through the real
// search selector, including header autocomplete. Every meaningful query word
// must match; stopwords and short words may use the existing production fallback.
{
  const wikiIndex = JSON.parse(
    await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8')
  );
  const subjectsByPage = {
    'sacred-chain': [
      'Three-Custody Rule', 'THREE CUSTODY RULE!', 'Etta Reed', 'etta reed',
      'Grey Pump Hearing', 'Borrowed Name Dispute', 'Open Margin Compact',
      'Hollow Seal scandal', 'threshold table', 'carried packet'
    ],
    'triple-fork-event': [
      'Pell Moss', 'Red Ledger House', 'Three Heirs case', 'Night of Open Shelves',
      'Crossing House Three', 'provisional receipt', 'Unsettled Register',
      'Common Kitchen agreements', 'Continuation Oath'
    ],
    'genesis-kernel': [
      'Mara Venn', 'Orin Silt', 'Workshop Nine', 'Unanswered Voice',
      'Red Thread Fragment', 'No-Second-Copy Hearing', 'NO SECOND COPY HEARING!',
      'Deep Memory Vaults', 'Fragment Census', 'Empty Chair convention',
      'Glassweather', 'Chorus problem', 'Anchor Card', 'response window'
    ],
    'graffiti-nexus': [
      'Ivo Chalk', 'Sena Thread', 'Daro Penn', 'Receiving Room', 'Ink Hall',
      'Repair Bench', 'Listening Room', 'Warm Shelf', 'Quiet Table',
      'Unfinished Wall', 'False Mother Piece', 'Blue Cup Register',
      'Copy Ledger', 'Three Empty Frames', 'Wreckwork', 'late-night print room'
    ],
    'hard-fork-games': [
      'Tessa Coil', 'Rook Vale', 'Nemi Ash', 'Mira Latch', 'Withdrawal Ledger',
      'Returned List', 'Parkour Gauntlet', 'Spray Cipher', 'Final Hardfork duel'
    ]
  };
  const stopWords = vm.runInContext('SEARCH_TEXT_STOP_WORDS', sb);
  let checked = 0;
  for (const [slug, subjects] of Object.entries(subjectsByPage)) {
    const expectedUrl = `/wiki/${slug}.html`;
    for (const query of subjects) {
      const meaningfulTokens = sb.tokenizeSearchQuery(query)
        .filter(token => token.length >= 3 && !stopWords.has(token));
      for (const limit of [5, 10]) {
        const result = await selectMatches(wikiIndex, query, {
          allowPartialFallback: true,
          limit
        });
        const match = result.scored.find(({ item }) => item.url === expectedUrl);
        assert.ok(match,
          `New lore query "${query}" must find ${expectedUrl} in the first ${limit} results`);
        assert.equal(match.meaningfulMatchedTokenCount, meaningfulTokens.length,
          `Every meaningful subject word must match for "${query}"`);
        if (result.usedPartialFallback) {
          const strict = await selectMatches(wikiIndex, meaningfulTokens.join(' '), {
            allowPartialFallback: false,
            limit
          });
          assert.ok(strict.scored.some(({ item }) => item.url === expectedUrl),
            `Meaningful subject words must find ${expectedUrl} without partial fallback`);
        }
      }
      checked++;
    }
  }
  const rendered = await renderSearchResults(wikiIndex, 'Etta Reed');
  assert.ok(rendered.html.includes('/wiki/sacred-chain.html'),
    'The full search page must render the chapter containing Etta Reed');
  console.log(`New core-history search subjects: ${checked} queries pass`);
}

// The next batch uses the same real selector; subject metadata must never
// become relationship tokens. Keep the earlier 58-query contract above intact.
{
  const wikiIndex = JSON.parse(await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8'));
  const entities = JSON.parse(await fs.readFile(path.join(ROOT, 'js', 'entity-map.json'), 'utf8'));
  const kids = entities.find(entity => entity.entity_id === 'bitcoin_kids');
  const xKids = entities.find(entity => entity.entity_id === 'bitcoin_x_kids');
  const warriors = entities.find(entity => entity.entity_id === 'hodl_warriors');
  const xWarriors = entities.find(entity => entity.entity_id === 'hodl_x_warriors');
  assert.ok(kids && xKids && warriors && xWarriors, 'Both distinct Kid and HODL entity pairs exist');
  const entityKey = value => sb.normalizeEntityKey(value);
  for (const [left, right, label] of [[kids, xKids, 'Bitcoin Kid'], [warriors, xWarriors, 'HODL']]) {
    const leftKeys = new Set([left.canonical_title, ...left.aliases].map(entityKey));
    const rightKeys = new Set([right.canonical_title, ...right.aliases].map(entityKey));
    assert.deepEqual([...leftKeys].filter(key => rightKeys.has(key)), [], `${label} traditions share no canonical or alias lookup keys`);
  }
  for (const entity of [kids, xKids, warriors, xWarriors]) {
    for (const limit of [5, 10]) {
      const result = await selectMatches(wikiIndex, entity.canonical_title, { allowPartialFallback: true, limit });
      assert.equal(result.scored[0]?.item.url, entity.canonical_url,
        `${entity.canonical_title} resolves first in autocomplete and full search without changing short-word rules`);
    }
  }
  for (const ordered of [[kids, xKids, warriors, xWarriors], [xWarriors, warriors, xKids, kids]]) {
    sb.entityFixtures = ordered;
    vm.runInContext('ENTITY_MAP = Object.fromEntries(entityFixtures.map(entity => [entity.entity_id, entity])); buildEntityLookup();', sb);
    for (const entity of ordered) {
      for (const name of [entity.canonical_title, ...entity.aliases]) {
        sb.entityQuery = name;
        assert.equal(vm.runInContext('ENTITY_LOOKUP[normalizeEntityKey(entityQuery)].canonical_url', sb), entity.canonical_url,
          `Entity lookup resolves ${name} independently of record order`);
      }
    }
  }
  const subjectsByPage = {
    'bitcoin-kids': ['Mina Patch', 'MINA PATCH!', 'Tavi Rill', 'Borrowed Rooms', 'Backstep School', 'Three Pump stoppage', 'Grey Return', 'Mnemonic Whispers'],
    'bitcoin-x-kids': ['Ada Wren', 'Esme Sorn', 'Len Arc', 'Glass Court', 'Measure Hall', 'Blank Bonnet day', 'Quiet Window exchange', 'encoded irises'],
    'bitcoin-kid-army': ['Cal Vetch', 'Jalen Rusk', 'Load Table', 'Unfinished Roll', 'North Sluice Stand', 'Protocol HODL-9000'],
    'the-bitcoin-kid-army': ['Neon Breakout', 'Genesis Shard', 'Silas Shard', 'Iris escape accounts', 'Thera escape accounts', 'disputed escape accounts'],
    'hodl-warriors': ['Osa Flint', 'Quiet Muster', 'Release Table', 'Holdfast Depot', 'Protocol Unity', 'HODL Council'],
    'hodl-x-warriors': ['Hester Brake', 'Cass Nine', 'CASS NINE!', 'Repair Gallery', 'Plate Book', 'service debt', 'bonnet collection'],
    'hodl-wars': ['Beren Toll', 'Dima Voss', 'Ferry Ledger', 'Narrow Peace', 'Red Tariff Week', 'charcoal notices', 'publicity crossing']
  };
  Object.assign(subjectsByPage, {
    'maidstone-base': ['Wet Wall Book', 'Orchard Relay', 'Borrowed Address dispute', 'River Sheet', 'Nia Form'],
    'croydon-tower-blocks': ['Grey Landing', 'Lift Book', 'Window Witnesses', 'Chalk Kitchen', 'Seven Stair dispute', 'Marlo Quist'],
    'street-kingdoms': ['Lantern Courts', 'Borough Thread', 'Water Truce', 'Slate Market', 'Roof Census', 'Nine Door winter', 'Imani Rook', 'Sol Mercer', 'successor escort'],
    'block-topia': ['Civic Measure', 'Air Ledger', 'Glass Kitchens', 'Petition Hour', 'Borough Exchange', 'Mira Quoin', 'Tern Vale', 'White Shutter', 'ceramic valve seats'],
    'spraycode-writcode-mechanics': ['Exchange door'],
    'null-the-prophet': ['Sena Rill', 'Roe Fen', 'Holdfast incident'],
    'the-finance-guild': ['Open Crate advance', 'reserved output'],
    'first-witness-forty-paths': ['faction classification'],
    'first-witness-faction-commentaries': ['faction register', 'thirty-four readings', 'forty cultures',
      'NoBallGames Legion', 'Wildstyle Collective', 'Fractal Taggers', 'Porch Poets',
      'Resin Relic Keepers', 'Bone Idol Ink Ritualists', 'Room Vote', 'Open Verse', 'Two Lamps']
  });
  const institutionSubjects = {
    'first-witness-long-transmission': ['Blue Stair', 'Eda Senn', 'Hollow Bell', 'Second Gloss', 'Dara Ilex'],
    'first-witness-sects-schools-schisms': ['Low Bell houses', 'Keeper apprenticeship'],
    'first-witness-leadership-councils-succession': ['Blue Stair succession', 'Low Bell custody'],
    'street-kingdoms': ['broken hoist', 'Venn Krail', 'Ira Noll', 'Lantern recognition agreements'],
    'first-witness-justice-mercy-restitution': ['broken hoist restitution'],
    'first-witness-prisons-punishment-return': ['Tor Pell', 'Dry Step holding room', 'supervised return'],
    'first-witness-mediation-witness-circles': ['Dry Step talks'],
    'first-witness-faction-ritual-variations': ['Backlight supper'],
    'first-witness-songs-chants-responses': ['Backlight chorus'],
    'the-blockstars': ['Double Supper'],
    'the-high-hats': ['storm knot', 'lean brim'],
    // Search corpus matching deliberately excludes two-letter words such as "me".
    'the-crypto-stoned-boys': ['Last Spoon', 'Borrow minute'],
    'maidstone-base': ['Operation Echo comparison'],
    'croydon-tower-blocks': ['Grey Landing reception']
  };
  for (const [slug, subjects] of Object.entries(institutionSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const programmeSubjects = {
    'hard-fork-games': ['Lower Walk', 'Return Valve exercise', 'Mira placement', 'Lysa Trent', 'Ground Array Office', 'Three Lamps test', 'conditional roster'],
    'block-topia': ['ground preparation'],
    'queen-sarah-p-fly': ['Ascension allocation'],
    'the-squeaky-pinks': ['Pinkline disc'],
    'squeaky-pinks-enforcers': ['Hessa disc receipt'],
    'bitcoin-x-kids': ['Len ground demonstration', 'instrument placement'],
    'hodl-x-warriors': ['Cass ground assignment', 'ground service credit'],
    'the-allcity-bulls': ['Milo placement display'],
    'genesis-kernel': ['Workshop Nine request', 'missing assignment sheet'],
    'sacred-chain': ['Mira Lower Walk packet'],
    'first-witness-master-chronology': ['Lower Walk chronology'],
    'first-witness-block-topia-reading': ['Ground Array reading']
  };
  for (const [slug, subjects] of Object.entries(programmeSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const adultSubjects = {
    "the-moonlords": [
        "Red Ledger Night",
        "Daro Sile",
        "Ione Vey",
        "Perr Senn",
        "Hala departure",
        "Vela back room"
    ],
    "the-information-mercenaries": [
        "Crimson Packet",
        "Ula Marr",
        "private voice",
        "Fen refusal",
        "Heard not owned"
    ],
    "the-bally-boys": [
        "supper booking",
        "dirty fee",
        "Ione commission",
        "Jex wages",
        "Last Price party"
    ],
    "the-rugpull-miners": [
        "Rafe red case",
        "porter door killing",
        "Jex Sable",
        "Bex bottle",
        "Nella lodging",
        "Dala Sable"
    ],
    "the-hard-fork-rockers": [
        "paid rebellion",
        "Sixth Glass",
        "Glasswake Eno",
        "roof instalment",
        "Red Ledger performance"
    ],
    "the-crypto-stoned-boys": [
        "Low Tide afterparty",
        "Rill Soot",
        "Glasswake argument",
        "empty glasses installation",
        "Dala lamp"
    ],
    "the-gasless-ghosts": [
        "Ione Rest Bell",
        "Kett Morn",
        "Arlo refusal",
        "borrowed red coat",
        "Ione next room"
    ],
    "the-blockchain-furies": [
        "Jex Ash Desk",
        "Nessa public name",
        "Dala refusal",
        "porter hearing",
        "Ione notice"
    ]
};
  for (const [slug, subjects] of Object.entries(adultSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const dividendSubjects = {
    "hodl-wars": [
        "Black Dividend",
        "Night Cover",
        "Rovan Drell",
        "Teren Pike",
        "Sevrin Holt",
        "Beren withdrawal"
    ],
    "street-kingdoms": [
        "Nine Rung",
        "Etta Lorn",
        "Sella Harn",
        "fear rent",
        "gate notice",
        "injury debt"
    ],
    "the-finance-guild": [
        "Night Cover account",
        "Black Dividend column",
        "Tala late payment",
        "freight reserve",
        "Meren priority"
    ],
    "the-salvagers": [
        "Cinder Shed load",
        "Borrowed Grip",
        "Etta sorting",
        "Rattle night money",
        "Leda bench"
    ],
    "the-high-hats": [
        "Aster Kesh",
        "Ilar Vane",
        "Long Window fire",
        "cover coat refusal",
        "last invitation"
    ],
    "the-allcity-bulls": [
        "Night Heat",
        "Vexa Row",
        "winner debt",
        "Neri Bask",
        "Milo sponsorship",
        "Glasswake runner"
    ],
    "the-blockstars": [
        "Warm Picture",
        "camera after fire",
        "Aven Coil",
        "Backlight dirty morning",
        "cover correction",
        "Sevrin interview"
    ]
};
  for (const [slug, subjects] of Object.entries(dividendSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const livedWorldSubjects = {
  "block-topia": [
    "Split Current Night",
    "Mara Kett",
    "Bright Mouth",
    "cracked lamp bright teeth",
    "service quarter households"
  ],
  "metropolis": [
    "Eska Thrum",
    "Split Current Night song",
    "night noise dirty glamour",
    "Bright Mouth performance"
  ],
  "street-kingdoms": [
    "Sorn Rill",
    "Split Current outside tables",
    "Slate Market appetite",
    "resold collection interval"
  ],
  "the-evm-punks": [
    "Dax Vanta",
    "Hard Smile",
    "Tessa Brunt",
    "Bright Mouth contract",
    "gold jaw plate"
  ],
  "the-squeaky-pinks": [
    "Derren Glaze",
    "polished snout",
    "Bright Mouth landing",
    "Nela Hask removal"
  ],
  "the-aztec-raiders": [
    "Varka Coil",
    "Fan Teeth",
    "occupied supper",
    "Halen Trove",
    "Dera Trove",
    "Fan of Teeth procession",
    "Dera Trove",
    "occupied hall mourning tune"
  ],
  "the-code-alchemists": [
    "Ixa Vell",
    "Velvet Surgeon",
    "purchased farewell",
    "Vey Lark",
    "Eron Silt",
    "room of borrowed grief",
    "dark panel recollections"
  ],
  "samaelexe": [
    "Leth Orra",
    "Bell Bride",
    "Naro Orra",
    "Godseed wanted lie"
  ],
  "the-tuskon-ogs": [
    "Brak Sennel",
    "Old Iron",
    "Iska Ren",
    "seat nobody borrows"
  ],
  "the-ducky-boys": [
    "Socket Queen",
    "stolen hour",
    "five priority jobs",
    "Bea Socket icon"
  ],
  "the-nomad-bears": [
    "Kel Dusk coat",
    "Varn Sedge",
    "Reva Moss",
    "coat full of yesterday"
  ],
  "the-og-pixel-saints": [
    "Last Credit halo",
    "Oriel Dot halo",
    "Penn Flick",
    "arcade relic argument"
  ],
  "the-chain-scribes": [
    "Ruva Marg red thumb",
    "red thumb marginalia",
    "donor dry storage"
  ],
  "the-shard-mothers-of-manhattan": [
    "Mended Crown",
    "Bela Lumen crown",
    "Hearth bed dispute"
  ],
  "the-nice-easy-bois": [
    "Tavren Ease",
    "Smiling Knife",
    "Lesser Door freight settlement"
  ],
  "the-bally-boys": [
    "Sera supper mask",
    "mask that pays for supper",
    "Margin House future commission"
  ],
  "the-blockstars": [
    "Lio Velvet collar",
    "borrowed face",
    "Backlight dirty money performance"
  ],
  "the-blockchain-furies": [
    "Nessa broken red stroke",
    "name that burns back",
    "Ash Desk slower release"
  ],
  "the-rugpull-miners": [
    "Rafe red case icon",
    "temporary belonging",
    "Miner later gathering"
  ],
  "the-finance-guild": [
    "Meren white line",
    "Closing Room Seven cuff",
    "completed recognition"
  ],
  "the-high-hats": [
    "Aster long-window silhouette",
    "Perrin admired dependence",
    "Long Window later supper"
  ],
  "the-moonlords": [
    "Vela second key",
    "second key motif",
    "gratitude public humiliation"
  ],
  "the-crypto-stoned-boys": [
    "Laughing Lamp icon",
    "Low Tide fashionable destination",
    "counterculture customers"
  ],
  "the-hard-fork-rockers": [
    "Tamsin cut coat",
    "cut coat bright lining",
    "Cutover return set"
  ],
  "the-information-mercenaries": [
    "Idra closed eye",
    "Third Ear bright slit",
    "public shortage advance packet"
  ],
  "the-salvagers": [
    "Leda copper hand",
    "Rattle Yard decorative fitting",
    "material limit faction"
  ],
  "the-gasless-ghosts": [
    "Empty Hem",
    "Arlo Hush coat",
    "Rest Bell priority offer"
  ],
  "the-allcity-bulls": [
    "Fast Crown",
    "Vexa Row icon",
    "champions never stop"
  ],
  "bitcoin-kid-army": [
    "broken bonnet mark",
    "Alfie name recruitment",
    "Cal Vetch unauthorised notice"
  ],
  "graffpunks": [
    "Black Mouth painter",
    "wall that talks back",
    "hostile public image"
  ],
  "gkniftyheads": [
    "Glass Face",
    "Rell Morrow",
    "face dark vertical gap"
  ],
  "whale-lords": [
    "Junn Cress",
    "Quiet Weight",
    "dark ring reserve",
    "receiving roof refusal"
  ],
  "m1ntr-k1ll": [
    "Feast Man",
    "Varnish Dole",
    "Orin Fer",
    "completed-work plates"
  ],
  "the-whitewasher": [
    "White Morning",
    "Bren Pale",
    "protected photograph",
    "removable mourning panel"
  ],
  "sister-halcyon": [
    "Halcyon unopened vessel silhouette",
    "Ceryn Lace",
    "Tala Reed",
    "cloth proximity claim"
  ],
  "first-witness-faction-commentaries": [
    "Unbroken Line",
    "Sava Crest",
    "Nix Bounce",
    "Scarlet Door",
    "Vessa Rook",
    "Raze Morrow",
    "Throatfire",
    "Moth Vey",
    "two unequal lamps",
    "factions recognisable powers"
  ]
};
  for (const [slug, subjects] of Object.entries(livedWorldSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const adultCultureSubjects = {
  "the-evm-punks": [
    "Borrowed Jaw wager",
    "Competence, exhibition and private loyalties",
    "Sella Grip"
  ],
  "the-squeaky-pinks": [
    "Pardon Ball that pardoned nobody",
    "spotless glove and the dirty invitation",
    "Ulda Brass"
  ],
  "the-aztec-raiders": [
    "Feast of Nine Doors",
    "Victory as taste, intimacy and inheritance"
  ],
  "the-code-alchemists": [
    "Original Face salon",
    "taste alteration",
    "Neris Fold",
    "Jorra Splice"
  ],
  "the-tuskon-ogs": [
    "Black Salt table",
    "Love that expects you to stay",
    "Dovra Pan"
  ],
  "the-ducky-boys": [
    "Naked Wrench evening",
    "Craft, courtship and territorial hands"
  ],
  "the-nomad-bears": [
    "Abandoned Coat vow",
    "Lovers, hosts and the vanity of departure",
    "Elda Soot"
  ],
  "the-og-pixel-saints": [
    "Broken Continue vigil",
    "Ecstasy, costume and the right to change"
  ],
  "the-chain-scribes": [
    "Lovers’ Margin case",
    "Ink, gossip and the power of an introduction",
    "Pell Vellum"
  ],
  "the-shard-mothers-of-manhattan": [
    "Unmothering supper",
    "right to be wanted without being needed"
  ],
  "the-nice-easy-bois": [
    "Three Clean Cups and a dirty settlement",
    "Seduction without a raised voice"
  ],
  "the-bally-boys": [
    "Kiss Before Commission story",
    "Taste that makes a stranger useful"
  ],
  "the-blockstars": [
    "Borrowed Bed tour",
    "A personality people can wear"
  ],
  "the-blockchain-furies": [
    "Scarlet Intermission",
    "Rage does not make everybody kin",
    "Korr Sable"
  ],
  "the-rugpull-miners": [
    "Velvet Descent club",
    "red case and the fear of going back",
    "Ruld Ash"
  ],
  "the-finance-guild": [
    "Mourning White Line",
    "Desire for the settled account",
    "Hesta Loom"
  ],
  "the-high-hats": [
    "Uninvited Tasting",
    "Taste as a gatekeeping language",
    "Verren Peel"
  ],
  "the-moonlords": [
    "Borrowed Honeymoon",
    "Warm rooms and possessive generosity"
  ],
  "the-crypto-stoned-boys": [
    "Four-Day Thursday",
    "Idleness, desire and the people who clean up",
    "Sulo Haze"
  ],
  "the-hard-fork-rockers": [
    "Cut Coat wedding",
    "terrible glamour of a clean break"
  ],
  "the-information-mercenaries": [
    "Blindfold Hour and the name withheld",
    "erotic glamour of knowing first",
    "Lossa Cairn"
  ],
  "the-salvagers": [
    "Second Funeral dance",
    "Magnificence made from somebody else’s yesterday"
  ],
  "the-gasless-ghosts": [
    "Unburial meal",
    "appeal of being difficult to claim",
    "Jeth Vale"
  ],
  "the-allcity-bulls": [
    "Loser Crown night",
    "body everybody wants to remember winning",
    "Rovik Dust"
  ],
  "bitcoin-kid-army": [
    "Last Civilian Dance",
    "A borrowed command and an unborrowed life",
    "Dessa Flint"
  ],
  "graffpunks": [
    "Beautiful Vandal argument",
    "Desire, imitation and the wall afterwards",
    "Kiva Brash"
  ],
  "gkniftyheads": [
    "Imperfect Remembrance gathering",
    "Affection for what answers incompletely",
    "Omra Pell"
  ],
  "whale-lords": [
    "Empty Chair banquet",
    "expensive pleasure of never being hurried",
    "Sarren Deep"
  ],
  "first-witness-faction-commentaries": [
    "Crypto Moongirls  the Last Button inspection",
    "XRP Kids  the Zero Score evening",
    "PU55IES  the Bad Guest table",
    "Slam GiRL$  the Stolen Applause night",
    "Creepto Gals  the Unlit Anniversary",
    "JPEG Bloodline  the Bearer’s ordinary evening"
  ]
};
  for (const [slug, subjects] of Object.entries(adultCultureSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const adultCharacterSubjects = {
  "alfie-bitcoin-kid-blaze": [
    "Orange Room night",
    "hungry cheer",
    "Dera Slate"
  ],
  "queen-sarah-p-fly": [
    "Velvet Stair supper",
    "Company that can answer"
  ],
  "jodie-zoom-2000": [
    "Last Lamp at home",
    "portrait she wants",
    "Orsa Clove"
  ],
  "aleema-child-of-the-shard": [
    "Two glasses and a promise",
    "voice after Split Bowl",
    "Neth Aster"
  ],
  "thera-9": [
    "coat she kept",
    "Ungenerous Night"
  ],
  "lady-ink": [
    "Red Rucksack argument",
    "Jealousy of the vanishing mark"
  ],
  "snipey-d-man-sirus": [
    "No laugh at the back table",
    "Fifth Empty Cup"
  ],
  "billy-the-goat-kid": [
    "Sleeper Verse",
    "Applause and the morning road"
  ],
  "bit-cap-5000": [
    "Soft bed, heavy hands",
    "Split Cup boast"
  ],
  "grit42": [
    "Victory takes the other chair",
    "Broken Toast"
  ],
  "rune-tag": [
    "letter kept for style",
    "When the Elder wants a turn"
  ],
  "elder-codex-7": [
    "Last Survivor supper",
    "Memory of the person who left"
  ],
  "quell": [
    "answer he cannot mediate",
    "Anger with good handwriting"
  ],
  "sister-halcyon": [
    "person who wants her",
    "night she wants to be bad",
    "Vey Darn"
  ],
  "patchwork": [
    "good chair he will not sell",
    "scavenger's private shelf"
  ],
  "hex-tagger-prime": [
    "fan who wants the scar",
    "Small Ugly Choice"
  ],
  "the-princess": [
    "dress after the rain",
    "person outside the title"
  ],
  "null-the-prophet": [
    "Betrayer's Holiday",
    "A mouth for every relief"
  ],
  "the-whitewasher": [
    "bedroom-facing wall",
    "man who likes the noise"
  ],
  "thorne-the-architect": [
    "room with two exits",
    "pleasure of being needed"
  ],
  "forksplit": [
    "Unannounced Couple",
    "Rage without a battle"
  ],
  "m1ntr-k1ll": [
    "Honeymoon Interval",
    "Pleasure counted as maintenance"
  ],
  "samaelexe": [
    "Sweet Voice session",
    "Godseed wants the last word"
  ],
  "grit": [
    "Red Shirt audience",
    "anger that will not love you"
  ],
  "pyralith": [
    "Gallery Lover's evening",
    "colour that demands a sacrifice"
  ],
  "dragan-volkov": [
    "letter in the cold case",
    "Appetite after the interview"
  ],
  "ava-chen": [
    "Interview Dress",
    "private price of a scoop"
  ],
  "loopfiend": [
    "Last Good Night",
    "apology exit"
  ]
};
  for (const [slug, subjects] of Object.entries(adultCharacterSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const blackDividendStorySubjects = {
  "hodl-wars": [
    "Last Loading: four days left at Nine Rung",
    "Counterprice meeting",
    "Second Screening and the lost smaller host",
    "Dry Supper and the dangerous ordinary load",
    "Last Loading at the gate",
    "An open yard with a dead man in its history",
    "What stands after Black Dividend",
    "Black Dividend Last Loading",
    "Last Loading gate fight",
    "Rovan death Nine Rung"
  ],
  "street-kingdoms": [
    "Nine Rung's working circuit",
    "Counterprice home Etta Sella",
    "hosts at Dry Supper",
    "room after Last Loading",
    "Etta Sella Last Loading room"
  ],
  "the-finance-guild": [
    "receiving advance at Last Loading",
    "Tala and the person behind the white line",
    "different debts after the last receipt",
    "Last Loading wage offset"
  ],
  "the-salvagers": [
    "Etta at the receiving bench",
    "Rattle Yard's price at Dry Supper",
    "Borrowed Curtain return"
  ],
  "the-high-hats": [
    "Aster's Last Loading appointment",
    "Ilar and the unpaid supper argument"
  ],
  "the-blockstars": [
    "Making the Second Screening",
    "Sevrin without a clean close-up",
    "last picture is work"
  ]
};
  for (const [slug, subjects] of Object.entries(blackDividendStorySubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const necessaryMonstersSubjects = {
    'queen-sarah-p-fly': [
      'Sarah need chosen', 'appointment becomes order',
      'Bellwether Court refused proof', 'Necessary Transfer',
      'Hesta Dorn', 'Venn Silt', 'Olan Reef',
      'Queen Night Bench', 'Empty Place smaller jurisdiction',
      'Sarah Second Morning'
    ],
    'alfie-bitcoin-kid-blaze': [
      'Freedom nobody calls', 'Bram Rooke withheld complaint',
      'Tessa Brine', 'Noll Ferrin', 'second assault',
      'speech Tessa', 'severed pledge', 'orange sleeve crowd',
      'bargain neither clean'
    ],
    'jodie-zoom-2000': [
      'Jodie appetite missing piece', 'dream borrows Tessa face',
      'Witness Supper borrowed voice', 'Aleema comforting account',
      'wall painter answer', 'Not Your Dream', 'Orsa evening ordinary'
    ],
    'null-the-prophet': [
      'Unburdening Room', 'Ulen Nacre', 'Aro Kest',
      'Three mercies coexist', 'names door', 'fear own voice'
    ],
    'satorebel': [
      'Fork refusal meeting', 'Author Supper',
      'maker name somebody decision', 'replica after Bellwether'
    ]
  };
  for (const [slug, subjects] of Object.entries(necessaryMonstersSubjects)) {
    subjectsByPage[slug] = [...(subjectsByPage[slug] || []), ...subjects];
  }
  const stopWords = vm.runInContext('SEARCH_TEXT_STOP_WORDS', sb);
  let checked = 0;
  for (const [slug, subjects] of Object.entries(subjectsByPage)) {
    const url = `/wiki/${slug}.html`;
    const entry = wikiIndex.find(item => item.url === url);
    assert.ok(entry, `${slug} stays indexed, including the substantive history companion`);
    if (['the-bitcoin-kid-army', 'hodl-wars'].includes(slug)) assert.equal(entry.category, 'core', `${slug} is a history reference, not a second faction`);
    for (const query of subjects) {
      const meaningful = sb.tokenizeSearchQuery(query).filter(token => token.length >= 3 && !stopWords.has(token));
      for (const limit of [5, 10]) {
        const result = await selectMatches(wikiIndex, query, { allowPartialFallback: true, limit });
        const match = result.scored.find(({ item }) => item.url === url);
        assert.ok(match, `War subject "${query}" must find ${url} in the first ${limit} results`);
        assert.equal(match.meaningfulMatchedTokenCount, meaningful.length, `Every meaningful word matches "${query}"`);
        if (result.usedPartialFallback) {
          const strict = await selectMatches(wikiIndex, meaningful.join(' '), { allowPartialFallback: false, limit });
          assert.ok(strict.scored.some(({ item }) => item.url === url), `Strict subject match required for "${query}"`);
        }
      }
      checked++;
    }
    const rendered = await renderSearchResults(wikiIndex, subjects[0]);
    assert.ok(rendered.html.includes(url), `Full search renders the article for ${subjects[0]}`);
  }
  for (const [slug, token] of [['bitcoin-kids', 'mina'], ['bitcoin-x-kids', 'esme'], ['bitcoin-kid-army', 'vetch'], ['the-bitcoin-kid-army', 'neon'], ['hodl-warriors', 'flint'], ['hodl-x-warriors', 'hester'], ['hodl-wars', 'beren']]) {
    const entry = wikiIndex.find(item => item.url === `/wiki/${slug}.html`);
    assert.ok(entry.search_index.keyword_bag.includes(token), `${token} is searchable`);
    assert.ok(!entry.search_index.tokens.includes(token), `${token} must not leak into title-only relationship tokens`);
  }
  for (const [slug, token] of [['block-topia', 'shutter'], ['null-the-prophet', 'sena'], ['the-finance-guild', 'crate'], ['first-witness-faction-commentaries', 'jpeg'], ['first-witness-long-transmission', 'eda'], ['street-kingdoms', 'krail'], ['the-blockstars', 'supper'], ['the-high-hats', 'storm'], ['hard-fork-games', 'lysa'], ['block-topia', 'rack'], ['bitcoin-x-kids', 'instrument'], ['the-squeaky-pinks', 'disc'], ['the-moonlords', 'daro'], ['the-information-mercenaries', 'crimson'], ['the-hard-fork-rockers', 'glasswake'], ['the-gasless-ghosts', 'kett'], ['hodl-wars', 'dividend'], ['street-kingdoms', 'sella'], ['the-allcity-bulls', 'vexa'], ['the-blockstars', 'aven']]) {
    const entry = wikiIndex.find(item => item.url === `/wiki/${slug}.html`);
    assert.ok(entry.search_index.keyword_bag.includes(token), `${slug}: ${token} remains discoverable`);
    assert.ok(!entry.search_index.tokens.includes(token), `${slug}: search-only ${token} cannot create relationship tags`);
  }
  for (const [query, slug] of [['Iris-7', 'iris-7'], ['Thera-9', 'thera-9']]) {
    const result = await selectMatches(wikiIndex, query, { allowPartialFallback: true, limit: 5 });
    assert.ok(result.scored.some(({ item }) => item.url === `/wiki/${slug}.html`), `${query} retains its dedicated short-number title match`);
  }
  for (const slug of Object.keys(necessaryMonstersSubjects)) {
    const entry = wikiIndex.find(item => item.url === `/wiki/${slug}.html`);
    assert.ok(entry.search_index.keyword_bag.includes('bellwether'), `${slug}: new shared story stays searchable`);
    assert.ok(!entry.search_index.tokens.includes('bellwether'), `${slug}: shared story subject cannot create relationship tags`);
  }
  const absent = await selectMatches(wikiIndex, 'Mina Unrelatedzzzzz', { allowPartialFallback: false, limit: 10 });
  assert.ok(!absent.scored.some(({ item }) => item.url === '/wiki/bitcoin-kids.html'), 'An unrelated meaningful query word must prevent a strict subject match');
  console.log(`New war-spine search subjects: ${checked} queries pass`);
}

// Public snippets must reflect the same geography as the revised articles.
// Check the actual HTML and generated search cards so obsolete claims cannot
// survive in social previews or structured data after a prose rewrite.
{
  const descriptions = {
    'maidstone-base': 'Maidstone Base as a present-day Kent working association and a disputed place-memory in later Crypto Moonboys lore.',
    'croydon-tower-blocks': 'Croydon walls as inhabited origin memory: residents, artists, contested archives and later Year 3008 interpretations.',
    'street-kingdoms': 'The Street Kingdoms beyond Block Topia: borough routes, household economies, the nine-day Exchange closure and an independent escort after Alfie’s coalition splits.',
    'block-topia': 'Block Topia in Year 3008: Queens geography, life-support labour, the White Shutter closure and Sarah’s contested Open Crate Compact.'
  };
  const index = JSON.parse(await fs.readFile(path.join(ROOT, 'js', 'wiki-index.json'), 'utf8'));
  for (const [slug, description] of Object.entries(descriptions)) {
    const html = await fs.readFile(path.join(ROOT, 'wiki', `${slug}.html`), 'utf8');
    assert.equal([...html.matchAll(/<h1\b/gi)].length, 1,
      `${slug} has one article title even without JavaScript`);
    assert.equal(html.match(/<meta name="description" content="([^"]*)">/)?.[1], description,
      `${slug} has an accurate public description`);
    assert.equal(html.match(/<meta property="og:description" content="([^"]*)">/)?.[1], description,
      `${slug} social previews agree with the article description`);
    const articles = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(match => JSON.parse(match[1])).filter(data => data['@type'] === 'Article');
    if (slug !== 'block-topia') assert.equal(articles.length, 1, `${slug} retains its Article structured data`);
    for (const article of articles) assert.equal(article.description, description,
      `${slug} structured data agrees with its public description`);
    assert.equal(index.find(entry => entry.url === `/wiki/${slug}.html`)?.desc, description,
      `${slug} search cards agree with its public description`);
  }
}


// A named subject must not be buried by substrings inside unrelated corpus
// words as the reference expands. Title-prefix autocomplete stays available.
{
  const repairLedger = {
    title: 'Workshop Notes', url: '/wiki/workshop-notes.html', tags: [], category: 'misc', rank_score: 999,
    desc: 'Memory repair and the final ledger.',
    search_index: { normalized_title: 'workshop notes', tokens: ['workshop', 'notes'], keyword_bag: ['repair', 'ledger'] }
  };
  const airLedger = {
    title: 'Block Topia', url: '/wiki/block-topia.html', tags: [], category: 'core', rank_score: 100,
    desc: 'City administration.',
    search_index: { normalized_title: 'block topia', tokens: ['block', 'topia'], keyword_bag: ['air', 'ledger'] }
  };
  const matches = await selectMatches([repairLedger, airLedger], 'Air Ledger', { allowPartialFallback: true, limit: 5 });
  assert.deepEqual(matches.scored.map(row => row.item.url), ['/wiki/block-topia.html']);
  assert.equal(scoreResult(repairLedger, 'air ledger').matchedTokenCount, 1, 'air must not match repair');
  assert.equal(scoreResult(repairLedger, 'repair ledger').matchedTokenCount, 2, 'whole corpus words remain searchable');
  const prefix = await selectMatches([airLedger], 'block top', { allowPartialFallback: true, limit: 5 });
  assert.equal(prefix.scored[0]?.item.url, airLedger.url, 'title-prefix autocomplete remains unchanged');
}

console.log('wiki-search.test: PASS');
