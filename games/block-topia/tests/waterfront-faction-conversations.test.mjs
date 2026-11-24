import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LEADERS } from '../../../js/waterfront-faction-identities.mjs';
import { createFactionConversations, factionQuestion } from '../waterfront/faction-conversations.mjs';
import { localClanCanonReply } from '../../../workers/moonboys-api/shared/clan-leader-canon-library.js';

test('the nine representatives each have distinct identities, owning pages and 80 unique local questions', () => {
  const roster = Object.entries(LEADERS);
  assert.deepEqual(roster.map(([, voice]) => voice.character), [
    'Jack the Bull', 'Nine Toes Joe', 'Nobby', 'Jimmy Rugpull', 'ZARAH8',
    'Danny Rankz', 'Eddie Stax', 'Chada Boi', 'Teddy Boi Jones',
  ]);
  assert.equal(new Set(roster.map(([, voice]) => voice.callSign)).size, 9);
  const allQuestions = new Set();
  for (const [index, [id, voice]] of roster.entries()) {
    assert.ok(existsSync(new URL('../../..' + voice.wiki, import.meta.url)), voice.wiki);
    assert.ok(existsSync(new URL('../../..' + voice.bio, import.meta.url)), voice.bio);
    assert.ok(existsSync(new URL('../../../battle-chamber/factions/' + id + '.html', import.meta.url)), id);
    assert.equal(localClanCanonReply(voice.name.toLowerCase())?.sources[0].path, voice.wiki);
    const lines = Array.from({ length: 240 }, (_, i) => factionQuestion(index, i).text);
    assert.equal(new Set(lines).size, 80);
    for (const line of lines) allQuestions.add(line);
  }
  assert.equal(allQuestions.size, 720);
});

test('a pair can start, pass and resume across reloads and an avatar handoff', () => {
  let json;
  const storage = { getItem: () => json, setItem: (_, value) => { json = value; } };
  const now = Date.UTC(2026, 10, 24);
  const actors = [{ index: 0, x: 2, y: 3 }, { index: 1, x: 9, y: 3 }];
  const engine = createFactionConversations(storage);
  const first = engine.tick(actors, now)[0];
  const topic = factionQuestion(0, ((Math.floor(now / 86400000) % 240) * 13 + 1) % 240).topic;
  assert.ok(first.text.includes(topic));
  assert.ok(engine.holds(0) && engine.holds(1));
  assert.match(engine.tick(actors, now + 4500)[0].text, /\.$/);
  const joe = LEADERS['nomad-bears'];
  assert.ok([joe.intro, joe.agenda].includes(engine.tick(actors, now + 9000)[0].text));
  assert.match(engine.tick(actors, now + 13500)[0].text, /whole crew|gets a say/);
  assert.equal(engine.tick(actors, now + 18000)[0], undefined);
  assert.equal(engine.tick(actors, now + 20001)[0], undefined, 'stationary pairs do not retrigger');
  const restored = createFactionConversations(storage);
  const withAvatar = [{ ...actors[0], controlled: true }, actors[1]];
  const passing = restored.tick(withAvatar, now + 21000)[0];
  assert.deepEqual(passing, { actor: 1, text: 'I’ve got a route to check. I’ll find you on the way back.' });
  assert.equal(restored.tick(withAvatar, now + 25501)[0], undefined);
  restored.tick([], now + 27502);
  const resumed = restored.tick(withAvatar, now + 29000)[0];
  assert.equal(resumed.text, `Give me one result we can check on ${topic}?`);
  restored.tick(withAvatar, now + 43000);
  const tomorrow = createFactionConversations(storage).tick(actors, now + 86_400_000)[0];
  assert.notEqual(tomorrow.text, first.text);
});

test('a conversation aborted by a departing actor does not create a remembered exchange', () => {
  let writes = 0;
  const engine = createFactionConversations({ getItem: () => '{bad', setItem: () => { writes++; } });
  const actors = [{ index: 5, x: 2, y: 3 }, { index: 7, x: 9, y: 3 }];
  assert.ok(engine.tick(actors, 0)[0]);
  assert.deepEqual(engine.tick(actors.slice(1), 1000), []);
  assert.equal(writes, 0);
  assert.ok(engine.tick(actors, 4000)[0].text.endsWith('?'));
});

test('separate pairs start and finish encounters at the same time', () => {
  const engine = createFactionConversations();
  const actors = [{ index: 0, x: 0, y: 0 }, { index: 1, x: 2, y: 0 },
    { index: 6, x: 150, y: 0 }, { index: 8, x: 152, y: 0 }];
  assert.deepEqual(engine.tick(actors.slice(0, 2), 0).map(line => line.actor), [0]);
  assert.deepEqual(engine.tick(actors, 1000).map(line => line.actor), [0, 6]);
  assert.ok(actors.every(actor => engine.holds(actor.index)));
  assert.deepEqual(engine.tick(actors, 19000), []);
});

test('a third leader waits for a busy pair and gets its own encounter', () => {
  const engine = createFactionConversations();
  const actors = [{ index: 0, x: 0, y: 0 }, { index: 1, x: 30, y: 0 },
    { index: 2, x: 60, y: 0 }];
  engine.tick(actors.slice(0, 2), 0);
  assert.deepEqual(engine.tick(actors, 1000).map(line => line.actor), [0]);
  assert.ok(engine.holds(2));
  assert.deepEqual(engine.tick(actors, 18000).map(line => line.actor), [1]);
});

test('Gemini receives the character bio, faction pages and a named page while local biographies spend no fetches', async t => {
  const { answerClanLeaderLore } = await import('../../../workers/moonboys-api/shared/clan-leader-lore.js');
  const leader = LEADERS['nomad-bears'];
  const home = '/battle-chamber/factions/nomad-bears.html';
  const guide = '/community.html';
  const calls = [];
  const env = {
    CLAN_LEADER_LORE_PROVIDER: 'gemini', CLAN_LEADER_LORE_ENABLED: 'true',
    CLAN_LEADER_GEMINI_KEY: 'fixture', CLAN_LEADER_GATEWAY_TOKEN: 'fixture',
    CLAN_LEADER_GEMINI_GATEWAY: 'https://gateway.ai.cloudflare.com/v1/' + '1'.repeat(32) + '/fixture',
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ questions: 1 }) }) }) },
  };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const { origin, pathname } = new URL(url);
    calls.push(pathname);
    if (origin === 'https://gateway.ai.cloudflare.com') {
      const payload = JSON.parse(init.body);
      assert.match(payload.systemInstruction.parts[0].text, /Nine Toes Joe, the Bears scout/);
      const refs = JSON.parse(payload.contents[0].parts[0].text).publicReferences;
      for (const title of ['Nine Toes Joe Wiki', 'Nomad Bears Wiki', 'Nomad Bears Faction Chamber', 'community']) {
        assert.ok(refs.some(ref => ref.title === title), title);
      }
      assert.match(refs.find(ref => ref.title === 'Nine Toes Joe Wiki').excerpt, /repairs small boats/);
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text:
        JSON.stringify({ mode: 'canon', reply: 'The guide explains the Battle Chamber.', sources: [1] }) }] } }] });
    }
    assert.equal(origin, 'https://cryptomoonboys.com');
    if (pathname === '/js/wiki-index.json') return Response.json([]);
    if (pathname === '/sitemap.xml') return new Response('<urlset></urlset>');
    if (pathname === '/js/leader-lore-sources.json') return Response.json([guide]);
    if (pathname === leader.bio) return new Response('<main><p>Nine Toes Joe repairs small boats and keeps a way home open.</p></main>');
    assert.ok([guide, home, leader.wiki].includes(pathname));
    return new Response('<main><p>The guide explains the Battle Chamber and how the crew can find its next destination.</p></main>');
  });
  const answer = question => answerClanLeaderLore(env, '1', { npc: 'nomad-bears', question }, new Date('2026-11-24'));
  const identity = await answer('Tell me about your clan');
  assert.match(identity.reply, /Bears scout.*wanderers/);
  assert.deepEqual(identity.sources.map(source => source.path), [leader.bio, leader.wiki, home]);
  for (const [npc, profile] of Object.entries(LEADERS)) {
    const ask = question => answerClanLeaderLore(env, '1', { npc, question }, new Date('2026-11-24'));
    const intro = await ask("What's your name?");
    assert.ok(intro.reply.includes(profile.character));
    assert.ok(intro.reply.includes(profile.intro));
    assert.equal(intro.sources[0].path, profile.bio);
    const plan = await ask('What are you working on?');
    assert.ok(plan.reply.includes(profile.agenda));
    assert.equal(plan.sources[0].path, profile.bio);
  }
  assert.deepEqual(calls, []);
  assert.equal((await answer('What is explained at /community.html?')).ok, true);
  assert.ok(calls.includes(home) && calls.includes(leader.wiki) && calls.includes(guide));
});

test('street cast gets 100 distinct voiced variants and its own local question and reply', async () => {
  const { streetExchange, streetProfiles, STREET_VARIANTS } = await import('../waterfront/street-dialogue.mjs');
  assert.equal(STREET_VARIANTS, 100);
  assert.equal(Object.keys(streetProfiles).length, 35);
  const answers = new Set();
  const questions = new Set();
  const counters = new Set();
  for (const [id, profile] of Object.entries(streetProfiles)) {
    if (profile.wiki) assert.ok(existsSync(new URL('../../..' + profile.wiki, import.meta.url)), id);
    const initiator = profile.role === 'police' ? id : 'police-robot';
    const listener = profile.role === 'police' ? 'burglar-bear' : id;
    const lines = Array.from({ length: STREET_VARIANTS }, (_, i) => streetExchange(initiator, listener, i));
    assert.equal(new Set(lines.map(turns => turns[0].text)).size, 100, id);
    assert.equal(new Set(lines.map(turns => turns[1].text)).size, 100, id);
    assert.equal(new Set(lines.map(turns => turns[2].text)).size, 100, id);
    if (profile.role === 'police') {
      questions.add(lines[0][0].text);
      assert.equal(new Set(lines.map(turns => turns[3].text)).size, 100, id);
    }
    else {
      answers.add(lines[0][1].text);
      counters.add(lines[0][2].text);
    }
  }
  assert.equal(questions.size, 3);
  assert.equal(answers.size, 32);
  assert.equal(counters.size, 32);
});

test('bear approaches have two intents and 240 voiced questions and replies', async () => {
  const { streetExchange, streetProfiles, BEAR_VARIANTS } = await import('../waterfront/street-dialogue.mjs');
  const bearIds = Object.keys(streetProfiles).filter(id => streetProfiles[id].role === 'bear');
  assert.equal(BEAR_VARIANTS, 240);
  const questions = new Set();
  const replies = new Set();
  for (const speaker of bearIds) {
    for (let i = 0; i < BEAR_VARIANTS; i++) {
      const [opening] = streetExchange(speaker, 'boombox', i);
      assert.match(opening.text, i % 2 ? /police|coppers/i : /buy|looking to buy/i);
      questions.add(opening.text);
    }
  }
  for (const listener of Object.keys(streetProfiles)) {
    const speaker = bearIds.find(id => id !== listener);
    for (let i = 0; i < BEAR_VARIANTS; i++) {
      replies.add(streetExchange(speaker, listener, i)[1].text);
    }
  }
  assert.equal(questions.size, 9 * 240);
  assert.equal(replies.size, 35 * 240);
});

test('local patrol stops and bear chats obey pairing, chance and release', async () => {
  const { createStreetEncounters } = await import('../waterfront/street-encounters.mjs');
  const actor = (id, x = 0) => ({ id, x, y: 0 });
  const bear = actor('roamer:graff-bear');
  const witness = actor('roamer:boombox');
  const otherBear = actor('roamer:camo-bear', 10);
  const cop = actor('roamer:police-bike', 10);
  const engine = createStreetEncounters(() => 0);
  assert.deepEqual(engine.tick([bear, actor('patrol:0'), actor('crew:1'), actor('freight:0')], 0), []);
  assert.equal(engine.tick([bear, witness], 1)[0].id, bear.id);
  assert.ok(engine.holds(witness.id));
  assert.match(engine.tick([bear, witness], 2701)[0].text, /putain/);
  assert.deepEqual(engine.tick([bear, witness], 8101), []);
  assert.equal(engine.holds(bear.id), false);
  engine.tick([], 27000);
  assert.deepEqual(engine.tick([cop, witness], 27001, () => true), []);
  engine.tick([], 27002);
  assert.equal(engine.tick([cop, witness], 27003)[0].id, cop.id);
  assert.equal(engine.tick([cop, witness], 29703)[0].id, witness.id);
  assert.deepEqual(createStreetEncounters(() => 0.99).tick([cop, witness], 0), []);
  const values = [0.8, 0, 0];
  const reversed = createStreetEncounters(() => values.shift());
  assert.equal(reversed.tick([cop, bear], 0)[0].id, bear.id);
  assert.match(reversed.tick([cop, bear], 2700)[0].text, /police rider/);
  assert.equal(reversed.tick([cop, bear], 5400)[0].id, cop.id);
  assert.equal(createStreetEncounters(() => 0).tick([bear, otherBear], 0)[0].id, bear.id);
});
