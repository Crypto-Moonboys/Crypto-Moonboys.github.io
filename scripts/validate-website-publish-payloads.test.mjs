#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PayloadValidationError,
  validatePayload,
  validatePayloadDirectory,
} from './validate-website-publish-payloads.mjs';
import {
  AFFECTED_SYNC_SURFACES,
  FeedSyncError,
  assertRequiredRealRootSyncScripts,
  renderBattleHeatMediaTemplate,
  renderArticleMiddle,
  runImport,
} from './import-website-publish-payloads.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(ROOT, 'test-fixtures', 'website-publish-payloads');

function loadFixture(fileName) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, fileName), 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function copyFixtures(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURE_DIR, 'sample-lore-page.json'), path.join(targetDir, 'sample-lore-page.json'));
  fs.copyFileSync(path.join(FIXTURE_DIR, 'sample-nft-template.json'), path.join(targetDir, 'sample-nft-template.json'));
}

function assertValidationFails(payload, expectedMessage) {
  assert.throws(
    () => validatePayload(payload, '<test-payload>'),
    (error) => error instanceof PayloadValidationError &&
      error.failures.some((failure) => failure.includes(expectedMessage))
  );
}

const lorePayload = loadFixture('sample-lore-page.json');
const nftPayload = loadFixture('sample-nft-template.json');

validatePayload(lorePayload, 'sample-lore-page.json');
console.log('PASS valid lore payload');

validatePayload(nftPayload, 'sample-nft-template.json');
console.log('PASS valid NFT payload');

assertValidationFails(
  {
    ...lorePayload,
    article_html: '<!DOCTYPE html><html><head><title>Bad</title></head><body><p>Full shell</p></body></html>',
  },
  'article_html must not include <!DOCTYPE'
);
console.log('PASS full HTML shell fails');

assertValidationFails(
  {
    ...lorePayload,
    article_html: '<p>Copy</p><script src="/js/wiki.js"></script>',
  },
  'article_html must not include <script'
);
console.log('PASS script tag fails');

assertValidationFails(
  {
    ...nftPayload,
    media: undefined,
  },
  'media object is required'
);
console.log('PASS NFT without Battle Heat media fails');

assertValidationFails(
  {
    ...nftPayload,
    media: {
      ...nftPayload.media,
      placement: 'loose_body',
    },
  },
  'media.placement must be battle_heat'
);
console.log('PASS loose_body NFT media placement fails');

assertValidationFails(
  {
    ...lorePayload,
    article_html: '<article><p>Legacy shell content</p></article><script src="/js/site-shell.js"></script>',
  },
  'article_html must not include <script'
);
console.log('PASS agent legacy shell is rejected');

const missingDir = path.join(os.tmpdir(), `missing-website-payloads-${Date.now()}`);
const missingResult = validatePayloadDirectory(missingDir);
assert.equal(missingResult.skipped, true);
assert.match(missingResult.message, /does not exist/);
console.log('PASS missing live payload folder skips');

const dryRunOutput = [];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-'));
const tempWikiDir = path.join(tempRoot, 'wiki');
fs.mkdirSync(tempWikiDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(tempRoot, '_article-template.html'));

const importResult = runImport({
  payloadDir: FIXTURE_DIR,
  rootDir: tempRoot,
  write: false,
  logger: (line) => dryRunOutput.push(line),
});

for (const surface of AFFECTED_SYNC_SURFACES) {
  assert.ok(importResult.affectedSyncSurfaces.includes(surface), `Importer must know affected surface: ${surface}`);
  assert.ok(dryRunOutput.some((line) => line.includes(surface)), `Dry-run output must report affected surface: ${surface}`);
}
assert.ok(dryRunOutput.some((line) => line.includes('wiki/sample-lore-page.html')));
assert.ok(dryRunOutput.some((line) => line.includes('wiki/sample-nft-template.html')));
assert.equal(fs.existsSync(path.join(tempRoot, 'wiki', 'sample-lore-page.html')), false);
assert.equal(fs.existsSync(path.join(tempRoot, 'wiki', 'sample-nft-template.html')), false);
console.log('PASS dry-run reports affected surfaces and writes no files');

const battleMediaTemplate = renderBattleHeatMediaTemplate(nftPayload);
assert.match(
  battleMediaTemplate,
  /<template class="nft-battle-media-template" data-battle-media="nft" data-page-id="sample-nft-template">/
);
assert.match(battleMediaTemplate, /<figure class="battle-page-media nft-template-media-card">/);
assert.match(
  battleMediaTemplate,
  /<img class="wiki-hero-image nft-image" src="https:\/\/example.com\/sample-nft.png" alt="Sample NFT fixture image" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback-srcs='\[&quot;https:\/\/example.com\/sample-nft.webp&quot;\]'>/
);
assert.doesNotMatch(battleMediaTemplate, /<picture\b/);
assert.doesNotMatch(battleMediaTemplate, /<source\b/);
const renderedNftMiddle = renderArticleMiddle(nftPayload);
const nftTemplateBlock = renderedNftMiddle.match(/<template class="nft-battle-media-template"[\s\S]*?<\/template>/)?.[0] || '';
assert.ok(nftTemplateBlock.includes('<img class="wiki-hero-image nft-image"'));
assert.doesNotMatch(renderedNftMiddle.replace(nftTemplateBlock, ''), /<img\b[^>]*\bnft-image\b/);
console.log('PASS NFT Battle Heat media template is preserved');

const writeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-write-'));
const writePayloadDir = path.join(writeRoot, 'website-publish-payloads');
copyFixtures(writePayloadDir);
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(writeRoot, '_article-template.html'));

const writeOutput = [];
const writeResult = runImport({
  payloadDir: writePayloadDir,
  rootDir: writeRoot,
  write: true,
  logger: (line) => writeOutput.push(line),
});

const lorePagePath = path.join(writeRoot, 'wiki', 'sample-lore-page.html');
const nftPagePath = path.join(writeRoot, 'wiki', 'sample-nft-template.html');
assert.ok(fs.existsSync(lorePagePath), '--write must create sample lore page in temp root');
assert.ok(fs.existsSync(nftPagePath), '--write must create sample NFT page in temp root');

const lorePageHtml = fs.readFileSync(lorePagePath, 'utf8');
const nftPageHtml = fs.readFileSync(nftPagePath, 'utf8');
assert.match(lorePageHtml, /\/js\/core\/daily-loop-state\.js/);
assert.match(nftPageHtml, /\/js\/core\/daily-loop-state\.js/);
assert.match(lorePageHtml, /<div class="wiki-comments" data-page-id="sample-lore-page"><\/div>/);
assert.match(nftPageHtml, /<div class="wiki-comments" data-page-id="sample-nft-template"><\/div>/);

const generatedTemplateBlock = nftPageHtml.match(/<template class="nft-battle-media-template"[\s\S]*?<\/template>/)?.[0] || '';
assert.match(generatedTemplateBlock, /data-battle-media="nft"/);
assert.match(generatedTemplateBlock, /data-page-id="sample-nft-template"/);
assert.match(generatedTemplateBlock, /<figure class="battle-page-media nft-template-media-card">/);
assert.match(generatedTemplateBlock, /<img class="wiki-hero-image nft-image"/);
assert.match(generatedTemplateBlock, /loading="lazy"/);
assert.match(generatedTemplateBlock, /decoding="async"/);
assert.match(generatedTemplateBlock, /referrerpolicy="no-referrer"/);
assert.match(generatedTemplateBlock, /data-fallback-srcs=/);
assert.doesNotMatch(nftPageHtml.replace(generatedTemplateBlock, ''), /<img\b[^>]*\bnft-image\b/);

for (const surface of AFFECTED_SYNC_SURFACES) {
  assert.ok(writeResult.sync.updatedSurfaces.includes(surface), `--write must update affected surface: ${surface}`);
}
for (const requiredFile of [
  'categories/lore.html',
  'categories/nfts-digital-art.html',
  'js/wiki-index.json',
  'js/timeline-data.json',
  'js/timeline-intelligence.json',
  'js/entity-map.json',
  'sam-memory.json',
  'js/entity-graph.json',
  'js/graph-data.json',
  'js/site-stats.json',
  'js/cluster-health.json',
  'js/publishing-readiness.json',
  'sitemap.xml',
]) {
  assert.ok(fs.existsSync(path.join(writeRoot, requiredFile)), `--write must update ${requiredFile}`);
}

const tempWikiIndex = JSON.parse(fs.readFileSync(path.join(writeRoot, 'js', 'wiki-index.json'), 'utf8'));
const tempWikiUrls = new Set(tempWikiIndex.map((entry) => entry.url));
assert.ok(tempWikiUrls.has('/wiki/sample-lore-page.html'));
assert.ok(tempWikiUrls.has('/wiki/sample-nft-template.html'));
assert.match(fs.readFileSync(path.join(writeRoot, 'sitemap.xml'), 'utf8'), /https:\/\/cryptomoonboys\.com\/wiki\/sample-nft-template\.html/);
assert.ok(writeOutput.some((line) => line.includes('Synced portable feed surfaces')));
console.log('PASS write-mode creates pages and syncs all required temp surfaces');

const badRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-bad-'));
const badPayloadDir = path.join(badRoot, 'website-publish-payloads');
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(badRoot, '_article-template.html'));
writeJson(path.join(badPayloadDir, 'good-before-bad.json'), lorePayload);
writeJson(path.join(badPayloadDir, 'bad-full-shell.json'), {
  ...lorePayload,
  slug: 'bad-full-shell',
  article_html: '<!DOCTYPE html><html><body><p>Bad shell</p></body></html>',
});

assert.throws(
  () => runImport({
    payloadDir: badPayloadDir,
    rootDir: badRoot,
    write: true,
    logger: () => {},
  }),
  (error) => error instanceof PayloadValidationError
);
assert.equal(fs.existsSync(path.join(badRoot, 'wiki', 'sample-lore-page.html')), false);
assert.equal(fs.existsSync(path.join(badRoot, 'wiki', 'bad-full-shell.html')), false);
console.log('PASS bad payloads fail before write-mode creates files');

const rollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-rollback-'));
const rollbackPayloadDir = path.join(rollbackRoot, 'website-publish-payloads');
copyFixtures(rollbackPayloadDir);
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(rollbackRoot, '_article-template.html'));
const restoredLorePath = path.join(rollbackRoot, 'wiki', 'sample-lore-page.html');
fs.mkdirSync(path.dirname(restoredLorePath), { recursive: true });
fs.writeFileSync(restoredLorePath, 'ORIGINAL LORE PAGE', 'utf8');

assert.throws(
  () => runImport({
    payloadDir: rollbackPayloadDir,
    rootDir: rollbackRoot,
    write: true,
    logger: () => {},
    syncFeedSurfacesFn: () => {
      throw new FeedSyncError('graph', 'feed sync failed for graph: injected failure');
    },
  }),
  (error) => error instanceof FeedSyncError &&
    error.message.includes('feed sync failed for graph')
);
assert.equal(fs.readFileSync(restoredLorePath, 'utf8'), 'ORIGINAL LORE PAGE');
assert.equal(fs.existsSync(path.join(rollbackRoot, 'wiki', 'sample-nft-template.html')), false);
console.log('PASS feed sync failure rolls back write-mode page writes');

const missingScriptsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-missing-scripts-'));
assert.throws(
  () => assertRequiredRealRootSyncScripts(missingScriptsRoot),
  (error) => error instanceof FeedSyncError &&
    error.message === 'feed sync not implemented for search'
);
console.log('PASS real-root feed sync preflight fails loudly for missing scripts');

assert.ok(FeedSyncError, 'FeedSyncError export is available for feed sync failures');

console.log('\nvalidate-website-publish-payloads.test.mjs passed');
