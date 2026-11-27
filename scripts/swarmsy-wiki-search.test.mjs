import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { handleSwarmsyWikiSearch } from '../workers/moonboys-api/routes/swarmsy-wiki-search.js';

const origin = 'https://cryptomoonboys.com';
const api = 'https://api.cryptomoonboys.com/swarmsy/wiki-search';
const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
const question = 'Who are the GKniftyHEADS?';
const source = { title: 'GKniftyHEADS Wiki', path: '/wiki/gkniftyheads.html', kind: 'page',
  body: 'The GKniftyHEADS are the underworld good guys in Crypto Moonboys canon.' };

function request(body, method = 'POST') {
  return new Request(api, { method, headers: { Origin: origin, 'Content-Type': 'application/json',
    'CF-Connecting-IP': '192.0.2.1' }, body: body ? JSON.stringify(body) : undefined });
}

function wikiFeed(context, failure, document = source) {
  const record = JSON.stringify(document);
  const sha256 = createHash('sha256').update(record).digest('hex');
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === origin + '/brain-feed/index.json') {
      assert.equal(options.cache, 'no-store');
      assert.equal(options.cf?.cacheTtl, undefined, 'Workers reject cacheTtl when cache is no-store');
      if (failure === 'index') return new Response(null, { status: 502 });
      if (failure === 'no-match') return Response.json({
        schema_version: 1, revision: '1'.repeat(40), records: [{
          path: '/wiki/unrelated.html', title: 'Unrelated', kind: 'page', description: '', sha256, bytes: 10,
        }],
      });
      return Response.json({
      schema_version: 1, revision: '1'.repeat(40), records: [{
        path: document.path, title: document.title, kind: document.kind, description: document.body, sha256, bytes: Buffer.byteLength(record),
      }],
      });
    }
    assert.equal(url, origin + '/brain-feed/records/' + sha256 + '.json');
    if (failure === 'record') return new Response(null, { status: 502 });
    return new Response(record);
  });
}

test('retrieval failures return 503 without calling Workers AI', async context => {
  const run = context.mock.fn(async () => ({ response: 'Unexpected model call' }));
  const env = environment({ run });
  for (const failure of ['index', 'record']) {
    await context.test(failure, async scenario => {
      wikiFeed(scenario, failure);
      const res = await handleSwarmsyWikiSearch(request({ question }), env, cors);
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: 'search_unavailable', wiki_sources: [] });
    });
  }
  assert.equal(run.mock.callCount(), 0);
});

function environment({ allow = true, available = true, run } = {}) {
  const bucket = { limit: async ({ key }) => {
    assert.match(key, /^wiki-search(?::192\.0\.2\.1)?$/);
    return { success: allow };
  } };
  return {
    SWARMSY_USER_LIMIT: bucket, SWARMSY_SITE_LIMIT: bucket, SWARMSY_SEARCH_AI: { run },
    DB: { prepare(query) {
      assert.match(query, /WHERE questions < \?3/);
      return { bind(day, actor, limit) {
        assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(actor, 'swarmsy-wiki-search-budget');
        assert.equal(limit, 100);
        return { first: async () => available ? { questions: 1 } : null };
      } };
    } },
  };
}

test('anonymous search sends only the question and published Wiki references to Workers AI', async context => {
  wikiFeed(context);
  const text = 'The GKniftyHEADS are the underworld good guys.';
  let calls = 0;
  const env = environment({ run: async (model, body, options) => {
    calls += 1;
    assert.equal(model, '@cf/meta/llama-3.1-8b-instruct-fast');
    assert.equal(options, undefined);
    assert.equal(body.tools, undefined);
    const input = JSON.parse(body.messages[1].content);
    assert.equal(input.question, question);
    assert.equal(input.publicWiki[0].excerpt, source.body);
    assert.deepEqual(Object.keys(input), ['question', 'publicWiki']);
    return { response: text };
  } });
  const res = await handleSwarmsyWikiSearch(request({ question }), env, cors);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls, 1);
  assert.deepEqual(await res.json(), { answer: text,
    wiki_sources: [{ title: source.title, url: origin + source.path }],
  });
});

test('standalone greetings go to Workers AI within the same daily budget', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected Wiki lookup'); });
  const greeting = 'Hello, SWARMSY!';
  const text = 'Hey! Ask me anything about the Crypto Moonboys Wiki.';
  const run = context.mock.fn(async (model, body) => {
    assert.equal(model, '@cf/meta/llama-3.1-8b-instruct-fast');
    assert.match(body.messages[0].content, /Acknowledge greetings/);
    assert.deepEqual(JSON.parse(body.messages[1].content), { question: greeting, publicWiki: [] });
    return { response: text };
  });
  const res = await handleSwarmsyWikiSearch(request({ question: greeting }), environment({ run }), cors);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: text, wiki_sources: [] });

  const limited = await handleSwarmsyWikiSearch(request({ question: 'hello' }), environment({ available: false, run }), cors);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, 'daily_limit');
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(run.mock.callCount(), 1);
});

test('broad Moonboys questions send the official overview to Workers AI', async context => {
  const overview = {
    title: 'Crypto Moonboys — The Story, Realms and Timeline',
    path: '/wiki/crypto-moonboys.html',
    kind: 'page',
    body: 'The Crypto Moonboys Wiki introduces the project and chronicles its fictional world.',
  };
  wikiFeed(context, null, overview);
  const run = context.mock.fn(async (_model, body) => {
    const input = JSON.parse(body.messages[1].content);
    assert.equal(input.publicWiki[0].excerpt, overview.body);
    return { response: 'The Wiki introduces the Crypto Moonboys project and its fictional world.' };
  });
  for (const question of ['who are the moonboys?', 'What is Crypto Moonboys?']) {
    const res = await handleSwarmsyWikiSearch(request({ question }), environment({ run }), cors);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).wiki_sources, [{ title: overview.title, url: origin + overview.path }]);
  }
  assert.equal(run.mock.callCount(), 2);
});

test('unmatched visitor questions get AI guidance within the existing budget', async context => {
  wikiFeed(context, 'no-match');
  const replies = new Map([
    ['what is this?', 'I’m SWARMSY, your guide to the Crypto Moonboys Wiki. Ask me about a story, person, NFT or game.'],
    ['how does that work?', 'Which part do you mean: a game, an NFT, or something else you saw on the site?'],
    ['Zyzzyva?', 'I couldn’t find a Wiki source for that. Is it a character, collection or game name?'],
  ]);
  const run = context.mock.fn(async (model, body) => {
    assert.equal(model, '@cf/meta/llama-3.1-8b-instruct-fast');
    assert.match(body.messages[0].content, /introduce the chat/);
    assert.match(body.messages[0].content, /Do not invent facts/);
    const input = JSON.parse(body.messages[1].content);
    assert.deepEqual(input.publicWiki, []);
    return { response: replies.get(input.question) };
  });
  for (const [message, answer] of replies) {
    const res = await handleSwarmsyWikiSearch(request({ question: message }), environment({ run }), cors);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { answer, wiki_sources: [] });
  }
  const limited = await handleSwarmsyWikiSearch(request({ question: 'what is this?' }),
    environment({ available: false, run }), cors);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, 'daily_limit');
  assert.equal(run.mock.callCount(), replies.size);
});

test('validates public requests and preserves Wiki discovery if the AI budget or provider fails', async context => {
  wikiFeed(context);
  const run = () => { throw new Error('provider unavailable'); };
  const env = environment({ run });
  assert.equal((await handleSwarmsyWikiSearch(request(null, 'OPTIONS'), env, cors)).status, 204);
  assert.equal((await handleSwarmsyWikiSearch(request(null, 'GET'), env, cors)).status, 405);
  assert.equal((await handleSwarmsyWikiSearch(request({ question }), env, {})).status, 403);
  assert.equal((await handleSwarmsyWikiSearch(request({ question: 'a'.repeat(601) }), env, cors)).status, 400);
  assert.equal((await handleSwarmsyWikiSearch(request({ question, padding: 'x'.repeat(5_000) }), env, cors)).status, 400);
  const rate = await handleSwarmsyWikiSearch(request({ question }), environment({ allow: false, run }), cors);
  assert.equal(rate.status, 429);
  assert.equal(rate.headers.get('Retry-After'), '60');
  const daily = await handleSwarmsyWikiSearch(request({ question }), environment({ available: false, run }), cors);
  assert.equal(daily.status, 429);
  assert.equal((await daily.json()).error, 'daily_limit');
  const failure = await handleSwarmsyWikiSearch(request({ question }), env, cors);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: 'search_unavailable',
    wiki_sources: [{ title: source.title, url: origin + source.path }] });
});
