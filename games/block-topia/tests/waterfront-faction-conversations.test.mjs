import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LEADERS } from '../../../js/waterfront-faction-identities.mjs';
import { createFactionConversations } from '../waterfront/faction-conversations.mjs';
import { createCrewSpeech, createNpcDialogue, DIALOGUE_VARIANTS, loreTopics, npcLine } from '../waterfront/npc-dialogue.mjs';
import { npcVoices } from '../waterfront/npc-voices.mjs';
import { createStreetEncounters } from '../waterfront/street-encounters.mjs';
import { streetProfiles } from '../waterfront/street-dialogue.mjs';
import { localClanCanonReply } from '../../../workers/moonboys-api/shared/clan-leader-canon-library.js';

test('the nine representatives each have distinct identities, owning pages', () => {
  const roster = Object.entries(LEADERS);
  assert.deepEqual(roster.map(([, voice]) => voice.character), [
    'Jack the Bull', 'Nine Toes Joe', 'Nobby', 'Jimmy Rugpull', 'ZARAH8',
    'Danny Rankz', 'Eddie Stax', 'Chada Boi', 'Teddy Boi Jones',
  ]);
  assert.equal(new Set(roster.map(([, voice]) => voice.callSign)).size, 9);
  for (const [id, voice] of roster) {
    assert.ok(existsSync(new URL('../../..' + voice.wiki, import.meta.url)), voice.wiki);
    assert.ok(existsSync(new URL('../../..' + voice.bio, import.meta.url)), voice.bio);
    assert.ok(existsSync(new URL('../../../battle-chamber/factions/' + id + '.html', import.meta.url)), id);
    assert.equal(localClanCanonReply(voice.name.toLowerCase())?.sources[0].path, voice.wiki);
  }
});

test('a pair can start, pass and resume across reloads and an avatar handoff', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const now = Date.UTC(2026, 10, 24);
  const actors = [{ index: 0, x: 2, y: 3 }, { index: 1, x: 9, y: 3 }];
  const engine = createFactionConversations(storage);
  const first = engine.tick(actors, now)[0];
  const topic = loreTopics.findLast(topic => first.text.includes(topic));
  assert.ok(topic);
  assert.ok(engine.holds(0) && engine.holds(1));
  assert.match(engine.tick(actors, now + 4500)[0].text, /\.$/);
  assert.equal(engine.tick(actors, now + 9000)[0].actor, 0);
  assert.ok(engine.tick(actors, now + 13500)[0].text.includes(topic));
  assert.equal(engine.tick(actors, now + 18000)[0], undefined);
  assert.equal(engine.tick(actors, now + 20001)[0], undefined, 'stationary pairs do not retrigger');
  const restored = createFactionConversations(storage);
  const withAvatar = [{ ...actors[0], controlled: true }, actors[1]];
  const passing = restored.tick(withAvatar, now + 21000)[0];
  assert.equal(passing.actor, 1);
  assert.ok(passing.text.includes(topic));
  assert.match(passing.text, /\.$/);
  assert.equal(restored.tick(withAvatar, now + 25501)[0], undefined);
  restored.tick([], now + 27502);
  const resumed = restored.tick(withAvatar, now + 29000)[0];
  assert.ok(resumed.text.includes(topic));
  assert.notEqual(resumed.text, first.text);
  restored.tick(withAvatar, now + 43000);
  const tomorrow = createFactionConversations(storage).tick(actors, now + 86_400_000)[0];
  assert.notEqual(tomorrow.text, first.text);
});

test('a conversation aborted by a departing actor does not create a remembered exchange', () => {
  let writes = 0;
  const engine = createFactionConversations({ getItem: () => '{bad', setItem: key => { if (key === 'waterfront.faction-encounters.v1') writes++; } });
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

test('all 37 voices have 240 distinct lines per phase, with no repeated sentences between phases or speakers', () => {
  assert.equal(Object.keys(streetProfiles).length, 35);
  assert.equal(Object.keys(npcVoices).length, 37);
  assert.equal(DIALOGUE_VARIANTS, 240);
  const all = new Set();
  for (const id of Object.keys(npcVoices)) {
    assert.equal(npcVoices[id].length, 6, id);
    for (const phase of ['open', 'middle', 'end']) {
      const lines = Array.from({ length: DIALOGUE_VARIANTS }, (_, i) => npcLine(id, phase, i));
      assert.equal(new Set(lines).size, 240, id + ' ' + phase);
      for (const line of lines) {
        assert.match(line, phase === 'open' ? /^[^.!?]+\?$/u : /^[^.!?]+\.$/u, id + ' ' + phase);
        assert.ok(!all.has(line), 'Repeated line: ' + line);
        all.add(line);
      }
    }
  }
});

test('police checks, bear deals, and lookout questions also have 240 distinct lines per role', () => {
  for (const [id, role] of Object.entries(streetProfiles)) {
    const scenes = role === 'bear' ? ['offer', 'watch'] : role === 'police' ? ['patrol'] : [];
    for (const scene of scenes) {
      const lines = Array.from({ length: DIALOGUE_VARIANTS }, (_, index) => npcLine(id, 'open', index, scene));
      assert.equal(new Set(lines).size, 240, id + ' ' + scene);
      assert.ok(lines.every(line => (scene === 'offer' ? /buy|buying/i : scene === 'watch' ? /police|coppers/i : /\?$/).test(line)));
    }
  }
});

test('the local dialogue library rotates every opening and each reply on a shared topic across reloads', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  let dialogue = createNpcDialogue(storage);
  const opening = dialogue.take('leader:1', 'open', 'lore');
  const reply = dialogue.take('leader:1', 'middle', 'lore', opening.topic);
  dialogue.save();
  dialogue = createNpcDialogue(storage);
  const openings = new Set([opening.text]);
  for (let i = 1; i < DIALOGUE_VARIANTS; i++) openings.add(dialogue.take('leader:1', 'open', 'lore').text);
  assert.equal(openings.size, DIALOGUE_VARIANTS);
  const replySet = new Set([reply.text]);
  for (let i = 1; i < 10; i++) replySet.add(dialogue.take('leader:1', 'middle', 'lore', opening.topic).text);
  assert.equal(replySet.size, 10);
  assert.equal(dialogue.take('leader:1', 'open', 'lore').text, opening.text);
});

test('build crew alternates who starts and ends, pauses, and keeps its dialogue local', t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('NPCs must not make network requests'); });
  const speech = createCrewSpeech(createNpcDialogue());
  assert.equal(speech(null).speaker, 0);
  const first = speech(0);
  assert.equal(speech(1), first);
  assert.equal(speech(12).speaker, 1);
  assert.equal(speech(24).speaker, 0);
  assert.equal(speech(36), null);
  assert.equal(speech(48).speaker, 1);
  assert.notEqual(speech(96).text, first.text);
});

test('local patrol stops and bear chats obey pairing, chance and release', () => {
  const actor = (id, x = 0) => ({ id, x, y: 0 });
  const bear = actor('roamer:graff-bear');
  const witness = actor('roamer:boombox');
  const otherBear = actor('roamer:camo-bear', 10);
  const cop = actor('roamer:police-bike', 10);
  const engine = createStreetEncounters(() => 0);
  assert.deepEqual(engine.tick([bear, actor('patrol:0'), actor('crew:1'), actor('freight:0')], 0), []);
  assert.equal(engine.tick([bear, witness], 1)[0].id, bear.id);
  assert.ok(engine.holds(witness.id));
  assert.match(engine.tick([bear, witness], 2701)[0].text, /passing on the deal/);
  assert.deepEqual(engine.tick([bear, witness], 10801), []);
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
  assert.match(reversed.tick([cop, bear], 2700)[0].text, /logging that offer/);
  assert.equal(reversed.tick([cop, bear], 8100)[0].id, cop.id);
  assert.equal(createStreetEncounters(() => 0).tick([bear, otherBear], 0)[0].id, bear.id);
});

test('civilian roamers can start their own exchanges while NPC dialogue never fetches', t => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('NPCs must not make network requests'); });
  const actors = [{ id: 'roamer:samurai', x: 0, y: 0 }, { id: 'roamer:electric-green', x: 4, y: 0 }];
  const engine = createStreetEncounters(() => 0);
  assert.equal(engine.tick(actors, 0)[0].id, actors[0].id);
  assert.equal(engine.tick(actors, 2700)[0].id, actors[1].id);
  assert.equal(engine.tick(actors, 8100)[0].id, actors[0].id);
  assert.equal(engine.tick(actors, 10800).length, 0);
});
