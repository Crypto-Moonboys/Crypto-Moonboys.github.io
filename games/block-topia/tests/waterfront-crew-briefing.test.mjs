import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = name => readFile(new URL('../waterfront/' + name, import.meta.url), 'utf8');

test('the Waterfront crew has a distinct, bubble-sized conversation for each UTC weekday', async () => {
  const window = {};
  runInNewContext(await script('crew-briefing.js'), { window });
  const topics = new Set();
  for (let day = 0; day < 7; day++) {
    const { title, turns } = window.waterfrontCrewBriefing(day);
    topics.add(title);
    assert.equal(turns.length, 4);
    for (const [index, turn] of turns.entries()) {
      assert.equal(turn.speaker, index % 2);
      assert.ok(turn.text.length > 0 && turn.text.length <= 76, turn.text);
    }
  }
  assert.equal(topics.size, 7);
});

test('the map keeps authored and recorded turns separate and retains them through fetch failures', async () => {
  const window = {};
  runInNewContext(await script('crew-briefing.js'), { window });
  const elements = new Map();
  const panel = {
    querySelector(id) {
      if (!elements.has(id)) elements.set(id, { replaceChildren(...children) { this.children = children; } });
      return elements.get(id);
    },
  };
  const document = {
    querySelector: () => panel,
    createElement: () => ({}),
  };
  const sandbox = {
    window, document, paintMap() {}, Date, response: [{ speaker: 1, text: 'Recorded review' }],
    fetch() {
      if (!sandbox.response) throw new Error('fetch unavailable');
      return { ok: true, json: async () => sandbox.response };
    },
  };
  const map = await script('map.js');
  const start = map.indexOf('let discussionElapsed =');
  const end = map.indexOf('let factionHits =', start);
  const { load, update } = runInNewContext(
    map.slice(start, end) + '\n({ load: loadBuildDiscussion, update: updateBuildDiscussion })', sandbox);
  await load();
  assert.equal(elements.get('#crew-briefing-lines').children.length, 4);
  assert.equal(elements.get('#recorded-build-lines').children[0].textContent, 'Reviewer — Recorded review');
  const recorded = window.waterfrontBuildDiscussion.at(-1);
  sandbox.response = null;
  await load();
  assert.equal(window.waterfrontBuildDiscussion.at(-1), recorded);
  update(new Date('2026-11-22T23:59:59Z'));
  const sunday = elements.get('#crew-briefing-topic').textContent;
  update(new Date('2026-11-23T00:00:00Z'));
  assert.notEqual(elements.get('#crew-briefing-topic').textContent, sunday);
  assert.equal(window.waterfrontBuildDiscussion.at(-1), recorded);
});
