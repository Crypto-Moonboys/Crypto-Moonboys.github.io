import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LEADERS } from '../../../js/waterfront-faction-identities.mjs';
import { createFactionConversations, factionQuestion } from '../waterfront/faction-conversations.mjs';
import { localClanCanonReply } from '../../../workers/moonboys-api/shared/clan-leader-canon-library.js';

test('the nine representatives each have distinct identities, owning pages and 240 local questions', () => {
  const roster = Object.entries(LEADERS);
  assert.deepEqual(roster.map(([, voice]) => voice.character), [
    'Jack the Bull', 'Nine Toes Joe', 'Nobby', 'Jimmy Rugpull', 'ZARAH8',
    'Danny Rankz', 'Eddie Stax', 'Chada Boi', 'Teddy Boi Jones',
  ]);
  assert.equal(new Set(roster.map(([, voice]) => voice.callSign)).size, 9);
  for (const [index, [id, voice]] of roster.entries()) {
    assert.ok(existsSync(new URL('../../..' + voice.wiki, import.meta.url)), voice.wiki);
    assert.ok(existsSync(new URL('../../..' + voice.bio, import.meta.url)), voice.bio);
    assert.ok(existsSync(new URL('../../../battle-chamber/factions/' + id + '.html', import.meta.url)), id);
    assert.equal(localClanCanonReply(voice.name.toLowerCase())?.sources[0].path, voice.wiki);
    const lines = Array.from({ length: 240 }, (_, i) => factionQuestion(index, i).text);
    assert.equal(new Set(lines).size, 240);
    assert.ok(lines.every(line => line.startsWith(voice.motto + '.')));
  }
});

test('a pair can start, pass and resume across reloads and an avatar handoff', () => {
  let json;
  const storage = { getItem: () => json, setItem: (_, value) => { json = value; } };
  const now = Date.UTC(2026, 10, 24);
  const actors = [{ index: 0, x: 2, y: 3 }, { index: 1, x: 9, y: 3 }];
  const engine = createFactionConversations(storage);
  const first = engine.tick(actors, now);
  const topic = factionQuestion(0, ((Math.floor(now / 86400000) % 240) * 13 + 1) % 240).topic;
  assert.ok(first.text.includes(topic));
  assert.ok(engine.holds(0) && engine.holds(1));
  assert.match(engine.tick(actors, now + 4500).text, /\.$/);
  const joe = LEADERS['nomad-bears'];
  assert.ok([joe.intro, joe.agenda].includes(engine.tick(actors, now + 9000).text));
  assert.equal(engine.tick(actors, now + 18000), null);
  assert.equal(engine.tick(actors, now + 20001), null, 'stationary pairs do not retrigger');
  const restored = createFactionConversations(storage);
  const withAvatar = [{ ...actors[0], controlled: true }, actors[1]];
  const passing = restored.tick(withAvatar, now + 21000);
  assert.match(passing.text, /DM|catch you|holla|clock|stop to make/i);
  assert.equal(restored.tick(withAvatar, now + 25501), null);
  restored.tick([], now + 27502);
  assert.match(restored.tick(withAvatar, now + 29000).text, new RegExp(topic));
  restored.tick(withAvatar, now + 43000);
  const tomorrow = createFactionConversations(storage).tick(actors, now + 86_400_000);
  assert.notEqual(tomorrow.text, first.text);
});

test('a conversation aborted by a departing actor does not create a remembered exchange', () => {
  let writes = 0;
  const engine = createFactionConversations({ getItem: () => '{bad', setItem: () => { writes++; } });
  const actors = [{ index: 5, x: 2, y: 3 }, { index: 7, x: 9, y: 3 }];
  assert.ok(engine.tick(actors, 0));
  assert.equal(engine.tick(actors.slice(1), 1000), null);
  assert.equal(writes, 0);
  assert.ok(engine.tick(actors, 4000).text.endsWith('?'));
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
