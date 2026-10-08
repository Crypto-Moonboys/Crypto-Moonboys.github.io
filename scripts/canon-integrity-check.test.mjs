import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { checkPage, checkRegister, checkLockChanges, narrativeParagraphs, checkNarrativePreservation } from './canon-integrity-check.mjs';

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
  assert.deepEqual(scan('W15.txt claims the Final Fork has concluded.'), []);
  assert.deepEqual(scan('decision:GK-1458-FINAL-FORK-CONTINUITY describes the Final Fork has concluded.'), []);
  assert.deepEqual(scan('The Final Fork is not resolved.'), []);
  assert.deepEqual(scan('The Triple Fork occurred in 2880.'), []);
  assert.deepEqual(checkPage('<section data-canon-status="archive-variant" data-canon-source="M16.txt"><p>The Triple Fork occurred in 2198.</p></section>', locks, decisions), []);
});
test('all six visible heading levels reject locked claims and retain exact attribution', () => {
  for (let level = 1; level <= 6; level++) {
    const heading = `h${level}`;
    for (const claim of ['The Final Fork has concluded.', 'The Triple Fork occurred in 2198.',
      'Bitcoin Kids are the same as Bitcoin X Kids.', 'DREAMWARS is now live.']) {
      assert.equal(checkPage(`<article><${heading}>${claim}</${heading}></article>`, locks, decisions).length, 1, `${heading}: ${claim}`);
      assert.deepEqual(checkPage(`<section data-canon-status="disputed" data-canon-source="W15.txt"><${heading}>${claim}</${heading}></section>`, locks, decisions), []);
    }
    assert.deepEqual(checkPage(`<${heading}>The Triple Fork occurred in 2880.</${heading}>`, locks, decisions), []);
  }
  assert.equal(checkPage('<H2>The Final <em>Fork</em> has concluded.</H2>', locks, decisions).length, 1);
  assert.deepEqual(checkPage('<template><h2>The Final Fork has concluded.</h2></template><!-- <h3>The Final Fork has concluded.</h3> -->', locks, decisions), []);
});
test('generic, invented and lookalike sources cannot attribute alternative canon', () => {
  for (const source of ['The archive', 'The source', 'A witness', 'The tradition', 'The prophecy',
    'The manifesto', 'The broadsheet', 'W999.txt', 'M17', 'W15.txt.bak',
    'decision:GK-1458-NOT-RECORDED', 'decision:GK-1458-FINAL-FORK-CONTINUITY-FAKE']) {
    assert.equal(scan(`${source} claims the Final Fork has concluded.`).length, 1, source);
  }
  assert.deepEqual(scan('w15 claims the Final Fork has concluded.'), []);
  assert.equal(scan('W15.txt describes a mural. The archive claims the Final Fork has concluded.').length, 1);
  assert.equal(checkPage('<section data-canon-status="disputed" data-canon-source="decision:invented"><h2>The Final Fork has concluded.</h2></section>', locks, decisions).length, 2);
});
test('an existing discussion of disputed source endings requires its local source receipt', () => {
  const warning = 'Source passages using earlier incompatible dates or speaking as though the Final Fork has already resolved every conflict cannot reset that frame.';
  assert.equal(scan(warning).length, 1);
  const sourced = `<p data-canon-status="disputed" data-canon-source="w23.txt">${warning}</p>`;
  assert.deepEqual(checkPage(sourced, locks, decisions), []);
  assert.equal(checkPage(`${sourced}<h2>The Final Fork has concluded.</h2>`, locks, decisions).length, 1);
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

test('a genuine story consequence cannot disappear behind otherwise valid canon vocabulary', () => {
  const before = '<article><p>The victim refused the invitation to thank the court; the suspended unit kept operating under another signature.</p></article>';
  const after = '<article><p>The victim thanked the court; the suspended unit kept operating under another signature.</p></article>';
  assert.deepEqual(checkPage(after, locks, decisions), []);
  assert.equal(checkNarrativePreservation(before, after, decisions, 'wiki/queen-sarah-p-fly.html').length, 1);
  assert.equal(checkNarrativePreservation(before, '<article><!-- the victim refused the invitation to thank the court --></article>', decisions, 'wiki/queen-sarah-p-fly.html').length, 1);
});
test('markup and additions preserve a scene; a sourced exact replacement remains deliberate', () => {
  const old = 'The cook refused the commander another portion because the receiving kitchen had no fuel left for the night.';
  const next = 'The cook refused the commander another portion because the receiving kitchen had no food left for the night.';
  const wrap = p => `<article><p>${p}</p></article>`;
  assert.deepEqual(checkNarrativePreservation(wrap(old), wrap(old.replace('cook', '<strong>cook</strong>')) + '<p>A new scene follows.</p>', decisions, 'wiki/agent-sam.html'), []);
  const receipt = { decisions: [{ status: 'implemented', sources: ['W12.txt'], reason: 'Correct the specific copied resource', affected_paths: ['wiki/agent-sam.html'], paragraph_changes: [{ old_sha256: [...narrativeParagraphs(wrap(old)).keys()][0], new_sha256: [...narrativeParagraphs(wrap(next)).keys()][0], reason: 'Exact source comparison supports the replacement' }] }] };
  assert.deepEqual(checkNarrativePreservation(wrap(old), wrap(next), receipt, 'wiki/agent-sam.html'), []);
  assert.equal(checkNarrativePreservation(wrap(old), wrap(next), receipt, 'wiki/house-of-rackinsats.html').length, 1);
  receipt.decisions[0].paragraph_changes[0].new_sha256 = 'sha256:invented';
  assert.equal(checkNarrativePreservation(wrap(old), wrap(next), receipt, 'wiki/agent-sam.html').length, 1);
});
