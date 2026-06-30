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
  renderBattleHeatMediaTemplate,
  renderArticleMiddle,
  runImport,
} from './import-website-publish-payloads.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(ROOT, 'test-fixtures', 'website-publish-payloads');

function loadFixture(fileName) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, fileName), 'utf8'));
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

console.log('\nvalidate-website-publish-payloads.test.mjs passed');
