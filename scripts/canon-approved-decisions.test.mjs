import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { checkApprovedDecisions, checkFortyPublication, checkPage, checkEditorialIntent } from './canon-integrity-check.mjs';
import { EDITORIAL_ONLY_PATHS, checkPublicDisclosure } from './public-canon-disclosure.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const locks = JSON.parse(read('brand-canon/canon-locks.json'));
const decisions = JSON.parse(read('brand-canon/reconciliation-decisions.json'));

test('accepted dates, forty cultures and distinct institutions reject corruption', () => {
  assert.deepEqual(checkApprovedDecisions(locks, decisions), []);
  for (const key of ['world_chain_triple_fork', 'sam_upload', 'sam_council', 'sam_reset', 'sam_bridge', 'sam_disappearance', 'sam_climax']) {
    const bad = structuredClone(locks); bad.anchors[key]--;
    assert.ok(checkApprovedDecisions(bad, decisions).some(e => e.includes(key)));
  }
  for (const mutation of [l => l.forty.named_readings.pop(), l => l.forty.unassigned = 6,
    l => l.forty.membership_institutions[1].institution = l.forty.membership_institutions[0].institution,
    l => l.identity_boundaries = l.identity_boundaries.filter(pair => pair[0] !== 'Porch Poets'),
    l => l.anchors.major_city_loss = l.anchors.secure_regions]) {
    const bad = structuredClone(locks); mutation(bad);
    assert.ok(checkApprovedDecisions(bad, decisions).length);
  }
  const unapproved = structuredClone(decisions);
  delete unapproved.decisions.find(d => d.id === 'GK-1458-FORTY').approval;
  assert.ok(checkApprovedDecisions(locks, unapproved).length);
  const replaced = structuredClone(locks); replaced.forty.named_readings[0] = 'Legion Arena Team';
  assert.ok(checkApprovedDecisions(replaced, decisions).length);
});

test('published count cannot replace an original culture with a duplicate or role', () => {
  const register = read('wiki/first-witness-forty-paths.html');
  assert.deepEqual(checkFortyPublication(register, locks), []);
  for (const replacement of ['NoBallGames Legion', 'Legion Arena Team']) {
    assert.ok(checkFortyPublication(register.replace('data-canon-culture="Nomad Bears"', `data-canon-culture="${replacement}"`), locks).length);
  }
  const commentary = read('wiki/first-witness-faction-commentaries.html');
  for (const culture of locks.forty.membership_institutions) {
    assert.ok(commentary.includes(`data-canon-culture="${culture.name}" data-membership-institution="${culture.institution}"`));
    assert.ok(commentary.includes(`id="${culture.id}"`));
  }
  for (const claim of ['NoBallGames Legion are the same as XRP Kids.', 'Wildstyle Collective is the same as GraffPUNKS.',
    'Fractal Taggers are the same as Crypto Moongirls.', 'Porch Poets are the same as Chain Scribes.',
    'Resin Relic Keepers are the same as Salvagers.', 'Bone Idol Ink Ritualists are the same as Resin Relic Keepers.']) {
    assert.ok(checkPage(`<p>${claim}</p>`, locks, decisions).length, claim);
  }
});

test('old fictional artifact dates stay damaged evidence beside the accepted calendar', () => {
  for (const p of ['wiki/block-topia.html', 'wiki/croydon-tower-blocks.html']) {
    const source = read(p);
    assert.match(source, /2036/); assert.match(source, /2030 Reset/);
  }
  const source = read('wiki/agent-sam.html');
  for (const year of [2036, 2039, 2040, 2041, 2042, 2045, 2029, 2030, 2031, 2032, 2035]) assert.ok(source.includes(String(year)));
  for (const claim of ['SAM uploaded in 2035.', 'The SAM council met in 2029.', 'The Stabilisation/Reset occurred in 2030.', 'The household disappearance occurred in 2032.']) {
    assert.ok(checkPage(`<p>${claim}</p>`, locks, decisions).length, claim);
    assert.deepEqual(checkPage(`<p data-canon-status="disputed" data-canon-source="W12.txt">${claim}</p>`, locks, decisions), []);
  }
});

test('editorial intent may exist in master records but not public prose or discovery payloads', () => {
  const ending = "Approved intended outcome: the physical universe survives; compulsory convergence is defeated; no single sovereign owns humanity's future; irreversible consequences remain.";
  assert.deepEqual(checkPublicDisclosure(ending, EDITORIAL_ONLY_PATHS[0]), []);
  for (const payload of [`<p>${ending}</p>`, `<p hidden>${ending}</p>`, `<!-- ${ending} -->`,
    `<meta name="description" content="${ending}">`, JSON.stringify({ description: ending }),
    '<a href="/brand-canon/reconciliation-decisions.json">Ending</a>']) {
    assert.ok(checkPublicDisclosure(payload, 'wiki/future.html').length);
    assert.ok(checkPublicDisclosure(payload, 'js/wiki-index.json').length);
  }
  assert.deepEqual(checkPublicDisclosure('<p>The Final Fork remains future and unresolved.</p><p>W15 describes a repeated mercy loop.</p>', 'wiki/block-topia.html'), []);
  assert.match(read(EDITORIAL_ONLY_PATHS[0]), /physical universe survives; compulsory convergence is defeated/);
  const master = read(EDITORIAL_ONLY_PATHS[0]);
  assert.deepEqual(checkEditorialIntent(master, decisions), []);
  for (const term of ['physical universe survives', 'compulsory convergence is defeated',
    "no single sovereign owns humanity's future", 'irreversible consequences remain']) {
    assert.ok(checkEditorialIntent(master.replaceAll(term, 'redacted'), decisions).length);
  }
});

test('relative HTML and Markdown targets cannot link to excluded editorial records', () => {
  const filename = 'brand-canon/wiki-rewrites/public-note.md';
  for (const payload of ['[Master](../story-bibles/gk-master-canon.md)',
    '[Companion](../story-bibles/w81-continuity-companion-20261008.md#history "Reference")',
    '[Decisions](../reconciliation-decisions.json?view=all)', '[Proposals](<./issue-1458-proposals.md>)',
    '[Master][canon]\n[canon]: ../story-bibles/gk-master-canon.md "Editorial"',
    '<a href="../story-bibles/gk-master-canon.md#history">Master</a>',
    "<a href='../reconciliation-decisions.json?view=all&amp;mode=history'>Decisions</a>",
    '<a href=./issue-1458-proposals.md>Proposals</a>',
    '[Master](../story-bibles/%67k-master-canon.md)',
    '<a href="../../brand-canon/story-bibles/./gk-master-canon.md">Master</a>']) {
    assert.ok(checkPublicDisclosure(payload, filename).some(e => e.includes('public link to editorial-only record')), payload);
  }
  for (const payload of ['[Chronology](../../wiki/first-witness-master-chronology.html#sam-calendar)',
    '<a href="../../wiki/first-witness-concordance.html">Concordance</a>',
    '[External](https://example.com/history.md)', 'The editorial master remains a repository record.']) {
    assert.deepEqual(checkPublicDisclosure(payload, filename), [], payload);
  }
});

test('the actual Pages builder excludes all ending records and retains public components', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-disclosure-'));
  try {
    const write = (p, content) => { const f = path.join(fixture, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
    for (const p of ['scripts/prepare-pages-artifact.mjs', 'scripts/public-canon-disclosure.mjs']) write(p, read(p));
    for (const p of EDITORIAL_ONLY_PATHS) write(p, read(p));
    for (const p of ['index.html', 'js/wiki.js', 'css/wiki.css', 'games/index.html', 'sam-memory.json',
      'wiki/agent-sam.html', 'brand-canon/wiki-rewrites/w81-archive-retirement-20261004.md']) write(p, read(p));
    execFileSync(process.execPath, ['scripts/prepare-pages-artifact.mjs', 'public-site'], { cwd: fixture });
    for (const p of EDITORIAL_ONLY_PATHS) assert.equal(fs.existsSync(path.join(fixture, 'public-site', p)), false, p);
    for (const p of ['js/wiki.js', 'wiki/agent-sam.html', 'games/index.html', 'brand-canon/wiki-rewrites/w81-archive-retirement-20261004.md']) {
      assert.equal(fs.readFileSync(path.join(fixture, 'public-site', p), 'utf8'), read(p));
    }
    write('wiki/accidental-ending.html', '<p hidden>The physical universe survives; compulsory convergence is defeated.</p>');
    assert.throws(() => execFileSync(process.execPath, ['scripts/prepare-pages-artifact.mjs', 'public-site'], { cwd: fixture, stdio: 'pipe' }),
      /editorial Final Fork outcome disclosed/u);
    fs.unlinkSync(path.join(fixture, 'wiki/accidental-ending.html'));
    write('brand-canon/wiki-rewrites/public-note.md', '[Companion](../story-bibles/w81-continuity-companion-20261008.md)');
    assert.throws(() => execFileSync(process.execPath, ['scripts/prepare-pages-artifact.mjs', 'public-site'], { cwd: fixture, stdio: 'pipe' }),
      /public link to editorial-only record/u);
    write('brand-canon/wiki-rewrites/public-note.md', '[Chronology](../../wiki/first-witness-master-chronology.html)');
    execFileSync(process.execPath, ['scripts/prepare-pages-artifact.mjs', 'public-site'], { cwd: fixture });
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});
