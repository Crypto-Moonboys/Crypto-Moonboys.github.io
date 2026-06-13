#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const wikiDir = path.join(ROOT, 'wiki');

const requiredProtected = [
  'hodl-x-warriors',
  'hodl-warriors',
  'hodl-wars',
  'graffpunks',
  'graffpunks-24-7-radio',
  'midevilpunks',
  '1m-free-nfts-program',
];

const deletedNoiseSlugs = [
  '1m-free-nfts-programme',
  'blockchain-graffpunks',
  'fork-graffpunks',
  'fork',
  'free',
  'games-nfts',
  'games',
  'gk-graffpunks',
  'kid',
  'midevil-hero-arena',
  'one-million-free-nfts',
  'the-graffpunks',
  'the-hodl-warriors',
];

const purgeSummaryPath = path.join(ROOT, 'js', 'wiki-purge-summary.json');
const auditPath = path.join(ROOT, 'js', 'wiki-publish-audit.json');
const approvedCanonPath = path.join(ROOT, 'brand-canon', 'approved-pages.json');
const wikiIndexPath = path.join(ROOT, 'js', 'wiki-index.json');
const entityMapPath = path.join(ROOT, 'js', 'entity-map.json');
const entityGraphPath = path.join(ROOT, 'js', 'entity-graph.json');
const sitemapPath = path.join(ROOT, 'sitemap.xml');
const questionPack1Path = path.join(ROOT, 'games', 'data', 'question_pack_001.json');
const questionPack2Path = path.join(ROOT, 'games', 'data', 'question_pack_002.json');
const crystalTrailPath = path.join(ROOT, 'games', 'data', 'crystal-maze-seed.json');

const wikiFiles = fs.readdirSync(wikiDir).filter((file) => file.endsWith('.html') && file !== 'index.html');
const wikiSlugs = new Set(wikiFiles.map((file) => file.replace(/\.html$/, '')));

for (const slug of requiredProtected) {
  assert.ok(wikiSlugs.has(slug), `required protected page missing from wiki/: ${slug}.html`);
}

const approvedCanon = JSON.parse(fs.readFileSync(approvedCanonPath, 'utf8'));
const approvedSet = new Set((approvedCanon.approved_slugs || []).map((slug) => String(slug)));
for (const slug of requiredProtected) {
  assert.ok(approvedSet.has(slug), `required protected page missing from approved canon: ${slug}`);
}

assert.equal(
  wikiFiles.filter((file) => file.includes('-via-')).length,
  0,
  'all *-via-* pages must be deleted from wiki/'
);
assert.equal(
  wikiFiles.filter((file) => file.startsWith('sam-')).length,
  0,
  'all sam-* pages must be deleted from wiki/'
);

for (const slug of deletedNoiseSlugs) {
  assert.ok(!wikiSlugs.has(slug), `deleted noise page still exists in wiki/: ${slug}.html`);
}

const deletedUrls = deletedNoiseSlugs.map((slug) => `/wiki/${slug}.html`);
const wikiIndexText = fs.readFileSync(wikiIndexPath, 'utf8');
const entityMapText = fs.readFileSync(entityMapPath, 'utf8');
const entityGraphText = fs.readFileSync(entityGraphPath, 'utf8');
const sitemapText = fs.readFileSync(sitemapPath, 'utf8');
const q1Text = fs.readFileSync(questionPack1Path, 'utf8');
const q2Text = fs.readFileSync(questionPack2Path, 'utf8');
const crystalTrailText = fs.readFileSync(crystalTrailPath, 'utf8');

for (const url of deletedUrls) {
  assert.ok(!wikiIndexText.includes(url), `deleted URL still present in js/wiki-index.json: ${url}`);
  assert.ok(!entityMapText.includes(url), `deleted URL still present in js/entity-map.json: ${url}`);
  assert.ok(!entityGraphText.includes(url), `deleted URL still present in js/entity-graph.json: ${url}`);
  assert.ok(!sitemapText.includes(url), `deleted URL still present in sitemap.xml: ${url}`);
  assert.ok(!q1Text.includes(url), `deleted URL still present in games/data/question_pack_001.json: ${url}`);
  assert.ok(!q2Text.includes(url), `deleted URL still present in games/data/question_pack_002.json: ${url}`);
  assert.ok(!crystalTrailText.includes(url), `deleted URL still present in games/data/crystal-maze-seed.json: ${url}`);
}

const purgeSummary = JSON.parse(fs.readFileSync(purgeSummaryPath, 'utf8'));
assert.deepEqual(
  Object.keys(purgeSummary).sort(),
  ['deleted_noise_pages', 'protected_pages', 'scanned_pages', 'stale_references_remaining'],
  'wiki-purge-summary.json must be counts-only'
);
assert.equal(purgeSummary.stale_references_remaining, 0, 'stale_references_remaining must be 0');
assert.ok(purgeSummary.deleted_noise_pages >= 0, 'deleted_noise_pages count must be non-negative');
assert.ok(!Object.prototype.hasOwnProperty.call(purgeSummary, 'deleted'), 'summary must not include deleted slug list');
assert.ok(!Object.prototype.hasOwnProperty.call(purgeSummary, 'skipped_aliases'), 'summary must not include skipped alias list');
assert.ok(!Object.prototype.hasOwnProperty.call(purgeSummary, 'blocked'), 'summary must not include blocked slug list');

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
assert.equal(audit.summary.total, wikiFiles.length, 'wiki publish audit total must match current wiki file count');
assert.equal(audit.summary.blocked, 0, 'wiki publish audit blocked count must be 0 after purge');
assert.equal(audit.summary.needs_review, 0, 'wiki publish audit review count must be 0 after purge');

console.log('audit-and-purge-stale-sam-noise: passed');
