import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { checkPage, checkRegister, checkLockChanges } from './canon-integrity-check.mjs';

const locks = JSON.parse(fs.readFileSync(new URL('../brand-canon/canon-locks.json', import.meta.url)));
const decisions = JSON.parse(fs.readFileSync(new URL('../brand-canon/reconciliation-decisions.json', import.meta.url)));
const scan = text => checkPage(`<article><p>${text}</p></article>`, locks, decisions);

test('explicit chronology, ending, identity and live-game drift fail', () => {
  for (const claim of ['The Triple Fork occurred in 2198.', 'The Triple Fork occurred in 2700.', 'In 2588 the Triple Fork destroyed the World Chain.',
    'The Sacred Fork occurred in 2030.', 'By 2765 fewer than a dozen secure regions remained.',
    'The Final Fork has concluded.', 'Bitcoin Kids are the same as Bitcoin X Kids.',
    'HODL X Warriors are also known as HODL Warriors.', 'The Sacred Chain is the same as the World Chain.',
    'DREAMWARS is now live.', 'The Great Concord was the 2030 Reset.', 'HyroSAM Blake is deployed SAM.']) {
    assert.equal(scan(claim).length, 1, claim);
  }
});
test('attributed alternatives and negative statements remain valid', () => {
  assert.deepEqual(scan('M16 places the Triple Fork in 2198.'), []);
  assert.deepEqual(scan('The archive claims the Final Fork has concluded.'), []);
  assert.deepEqual(scan('The Final Fork is not resolved.'), []);
  assert.deepEqual(scan('The Triple Fork occurred in 2880.'), []);
  assert.deepEqual(checkPage('<section data-canon-status="archive-variant" data-canon-source="M16.txt"><p>The Triple Fork occurred in 2198.</p></section>', locks, decisions), []);
});
test('unrelated attribution and inert markers cannot hide a new assertion', () => {
  assert.equal(scan('The archive is uncertain. The Final Fork has concluded.').length, 1);
  assert.equal(scan('<!-- M16 claims -->The Triple Fork occurred in 2198.').length, 1);
  assert.equal(checkPage('<template><section data-canon-status="archive-variant" data-canon-source="M16.txt"></section></template><p>The Triple Fork occurred in 2198.</p>', locks, decisions).length, 1);
  assert.equal(checkPage('<section data-canon-status="archive-variant" data-canon-source="invented.txt"><p>The Triple Fork occurred in 2198.</p></section>', locks, decisions).length, 2);
});
test('attribution closes with its section', () => {
  assert.equal(checkPage('<section data-canon-status="disputed" data-canon-source="W1.txt"><p>The Final Fork has concluded.</p></section><p>The Final Fork has concluded.</p>', locks, decisions).length, 1);
});
test('roster duplicates and unsupported schema are rejected', () => {
  assert.deepEqual(checkRegister(locks, decisions), []);
  const changed = structuredClone(locks);
  changed.forty.named_readings[1] = changed.forty.named_readings[0];
  assert.ok(checkRegister(changed, decisions).some(e => /duplicate/.test(e)));
});
test('specific approved old/new receipt is required for a lock change', () => {
  const after = structuredClone(locks); after.anchors.world_chain_triple_fork = 2198;
  assert.equal(checkLockChanges(locks, after, decisions).length, 1);
  const approved = structuredClone(decisions);
  approved.decisions.push({ id: 'fixture', status: 'approved', lock_field: 'anchors', old: locks.anchors,
    new: structuredClone(after.anchors), approval: { date: '2026-10-08', quote: 'Approve this exact fixture correction', url: 'https://example.com/fixture' } });
  assert.deepEqual(checkLockChanges(locks, after, approved), []);
  approved.decisions.at(-1).new.world_chain_triple_fork = 2588;
  assert.equal(checkLockChanges(locks, after, approved).length, 1);
});
