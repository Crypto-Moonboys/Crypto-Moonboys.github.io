#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  CANONICAL_CONTENT_BEGIN,
  CANONICAL_CONTENT_END,
  CONTENT_STATE_MANIFEST_FILE,
  ContentOwnershipError,
  FeedSyncError,
  PUBLISH_TRANSACTION_LOCK,
  assertPayloadUrlsSynced,
  assertRequiredRealRootSyncScripts,
  consumeAbsentStubAuthorizations,
  MANUAL_CONTENT_BEGIN,
  MANUAL_CONTENT_END,
  SAM_CONTENT_BEGIN,
  SAM_CONTENT_END,
  getManualContentBlock,
  getManualContentBlocks,
  hasRootWikiStubMarker as importerHasRootWikiStubMarker,
  planContentOwnershipUpdates,
  renderBattleHeatMediaTemplate,
  renderArticleMiddle,
  renderPageFromTemplate,
  refreshContentStateArtifacts,
  runImport,
  sanitizeRelationshipHints,
  sha256Content,
  syncFeedSurfaces,
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

function gitBlobOid(bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes ?? ''), 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${content.length}\0`, 'utf8'))
    .update(content)
    .digest('hex');
}

function copyFixtures(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURE_DIR, 'sample-lore-page.json'), path.join(targetDir, 'sample-lore-page.json'));
  fs.copyFileSync(path.join(FIXTURE_DIR, 'sample-nft-template.json'), path.join(targetDir, 'sample-nft-template.json'));
}

function authorizePayloadDirectory(rootDir, payloadDir, { policies = {}, legacy = {} } = {}) {
  const pages = [];
  for (const fileName of fs.readdirSync(payloadDir).filter((name) => name.endsWith('.json')).sort()) {
    const payloadPath = path.join(payloadDir, fileName);
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    const pagePath = path.join(rootDir, 'wiki', `${payload.slug}.html`);
    const pageExists = fs.existsSync(pagePath);
    const bytes = pageExists ? fs.readFileSync(pagePath) : Buffer.alloc(0);
    const automationPolicy = policies[payload.slug] || (pageExists ? 'replace-sam-block' : 'stub-allowed');

    payload.expected_content_hash = pageExists ? sha256Content(bytes) : null;
    if (!pageExists && payload.publish_mode === 'middle_content_only') payload.stub = true;
    writeJson(payloadPath, payload);
    pages.push({
      slug: payload.slug,
      path: `wiki/${payload.slug}.html`,
      page_exists: pageExists,
      content_hash: payload.expected_content_hash,
      article_content_hash: pageExists ? sha256Content(bytes) : null,
      article_markup_hash: pageExists ? sha256Content(bytes) : null,
      git_blob_oid: pageExists ? gitBlobOid(bytes) : null,
      automation_policy: automationPolicy,
      legacy_unmarked_content: legacy[payload.slug] === true,
    });
  }
  writeJson(path.join(rootDir, 'brand-canon', 'wiki-content-state.json'), {
    schema_version: 1,
    pages,
  });
  writeJson(path.join(rootDir, 'brand-canon', 'wiki-absent-stubs.json'), {
    schema_version: 1,
    absent_stub_slugs: pages.filter((page) => page.page_exists === false).map((page) => page.slug),
  });
  return pages;
}

function refreshTestContentState(rootDir) {
  const manifestPath = path.join(rootDir, 'brand-canon', 'wiki-content-state.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const page of manifest.pages) {
    const pagePath = path.join(rootDir, page.path || `wiki/${page.slug}.html`);
    const exists = fs.existsSync(pagePath);
    const html = exists ? fs.readFileSync(pagePath, 'utf8') : '';
    page.page_exists = exists;
    page.content_hash = exists ? sha256Content(Buffer.from(html, 'utf8')) : null;
    page.article_content_hash = exists ? sha256Content(Buffer.from(html, 'utf8')) : null;
    page.article_markup_hash = exists ? sha256Content(Buffer.from(html, 'utf8')) : null;
    page.git_blob_oid = exists ? gitBlobOid(Buffer.from(html, 'utf8')) : null;
    page.manual_content_block_count = (html.match(/<!-- MANUAL_CONTENT:BEGIN -->/g) || []).length;
    page.sam_content_block_count = (html.match(/<!-- SAM_CONTENT:BEGIN -->/g) || []).length;
    page.canonical_content_block_count = (html.match(/<!-- CANONICAL_CONTENT:BEGIN -->/g) || []).length;
    page.legacy_unmarked_content = false;
  }
  writeJson(manifestPath, manifest);
  const reportPath = path.join(rootDir, 'brand-canon', 'wiki-rewrite-audit.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, '# Refreshed test content-state report\n', 'utf8');
  return { files: ['brand-canon/wiki-content-state.json', 'brand-canon/wiki-rewrite-audit.md'] };
}

function ownershipFixture({
  slug = 'ownership-case',
  html = `<article class="wiki-content">${SAM_CONTENT_BEGIN}\n<p>OLD SAM CONTENT.</p>\n${SAM_CONTENT_END}</article>`,
  automationPolicy = 'replace-sam-block',
  payload: payloadOverrides = {},
  manifestHash,
  pageExists,
} = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-ownership-'));
  const payloadDir = path.join(rootDir, 'website-publish-payloads');
  fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(rootDir, '_article-template.html'));
  const exists = pageExists ?? html !== null;
  if (exists) {
    const pagePath = path.join(rootDir, 'wiki', `${slug}.html`);
    fs.mkdirSync(path.dirname(pagePath), { recursive: true });
    fs.writeFileSync(pagePath, html, 'utf8');
  }
  const actualHash = sha256Content(exists ? Buffer.from(html, 'utf8') : Buffer.alloc(0));
  const contentHash = manifestHash === undefined ? (exists ? actualHash : null) : manifestHash;
  const payload = {
    ...lorePayload,
    slug,
    title: slug,
    expected_content_hash: contentHash,
    ...payloadOverrides,
  };
  writeJson(path.join(payloadDir, `${slug}.json`), payload);
  writeJson(path.join(rootDir, 'brand-canon', 'wiki-content-state.json'), {
    schema_version: 1,
    pages: [{
      slug,
      path: `wiki/${slug}.html`,
      page_exists: exists,
      content_hash: contentHash,
      article_content_hash: exists ? actualHash : null,
      article_markup_hash: exists ? actualHash : null,
      git_blob_oid: exists ? gitBlobOid(Buffer.from(html, 'utf8')) : null,
      automation_policy: automationPolicy,
      legacy_unmarked_content: false,
    }],
  });
  return { rootDir, payloadDir, payload, actualHash };
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

for (const [payload, expectedMessage] of [
  [{ ...lorePayload, citations: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] }, 'citations[0].url must not include dangerous URL scheme'],
  [{ ...lorePayload, citations: [{ title: 'Unsafe', href: 'java\tscript:alert(1)' }] }, 'citations[0].href must not include dangerous URL scheme'],
  [{ ...lorePayload, citations: [null] }, 'citations[0] must be a string or object'],
  [{ ...lorePayload, citations: [42] }, 'citations[0] must be a string or object'],
  [{ ...lorePayload, source_refs: [{ url: 'data:text/html,<script>alert(1)</script>' }] }, 'source_refs[0].url must not include unsafe data URL'],
  [{ ...lorePayload, see_also: ['vbscript:msgbox(1)'] }, 'see_also[0] must not include dangerous URL scheme'],
  [{ ...nftPayload, media: { ...nftPayload.media, image_url: 'javascript:alert(1)' } }, 'media.image_url must not include dangerous URL scheme'],
  [{ ...nftPayload, media: { ...nftPayload.media, image_url: 'java\u0000script:alert(1)' } }, 'media.image_url must not include dangerous URL scheme'],
  [{ ...nftPayload, media: { ...nftPayload.media, fallback_urls: ['vbscript:msgbox(1)'] } }, 'media.fallback_urls[0] must not include dangerous URL scheme'],
  [{ ...nftPayload, media: { ...nftPayload.media, fallback_urls: ['https://example.com/safe.png', 'data:image/svg+xml,<svg></svg>'] } }, 'media.fallback_urls[1] must not include unsafe data URL'],
  [{ ...nftPayload, media: { ...nftPayload.media, fallback_urls: ['https://example.com/safe.png', { url: 'https://example.com/not-a-string' }] } }, 'media.fallback_urls[1] must be a non-empty URL string'],
]) {
  assertValidationFails(payload, expectedMessage);
}
validatePayload({
  ...nftPayload,
  citations: [{ title: 'Safe URL', url: 'https://example.com/source', href: 'https://example.com/alternate' }],
  source_refs: [{ url: 'https://example.com/source-ref' }],
  see_also: [{ href: '/wiki/sample-lore-page.html' }],
  media: {
    ...nftPayload.media,
    image_url: 'https://example.com/safe.png',
    fallback_urls: ['https://example.com/fallback.webp', 'data:image/png;base64,iVBORw0KGgo='],
  },
}, '<safe-url-payload>');
console.log('PASS rendered and consumed payload URLs reject executable schemes');

assertValidationFails(
  {
    ...lorePayload,
    article_html: '<article><p>Legacy shell content</p></article><script src="/js/site-shell.js"></script>',
  },
  'article_html must not include <script'
);
console.log('PASS agent legacy shell is rejected');

assertValidationFails(
  {
    ...lorePayload,
    relationship_hints: {
      project_hubs: ['crypto-moonboys'],
    },
  },
  'relationship_hints.project_hubs[0] must be an object'
);
console.log('PASS relationship_hints must keep object-shaped hints');

validatePayload({
  ...lorePayload,
  publish_mode: 'metadata_only',
  article_html: undefined,
}, 'metadata-only.json');
console.log('PASS metadata-only payload may omit article_html');

assertValidationFails(
  { ...lorePayload, publish_mode: 'metadata_only' },
  'metadata_only payloads must not include article_html prose'
);
assertValidationFails(
  { ...lorePayload, publish_mode: 'metadata_only', article_html: { hidden: 'prose' } },
  'metadata_only payloads must not include article_html prose'
);
assertValidationFails(
  { ...lorePayload, expected_content_hash: 'not-a-sha256' },
  'expected_content_hash must use sha256:'
);
assertValidationFails(
  { ...lorePayload, content_hash: `sha256:${'A'.repeat(64)}` },
  'content_hash must use sha256:'
);
console.log('PASS payload modes and revision hashes fail closed');

for (const [articleHtml, expectedMessage] of [
  ['<!-- manual_content:begin --><p>Injected</p><!-- manual_content:end -->', 'MANUAL_CONTENT marker'],
  ['<!-- SaM_CoNtEnT:BeGiN --><p>Injected</p><!-- SAM_CONTENT:END -->', 'SAM_CONTENT marker'],
  ['<!-- canonical_content:begin --><p>Injected</p><!-- canonical_content:end -->', 'CANONICAL_CONTENT marker'],
  ['<!-- related_wiki_paths:begin --><p>Injected</p><!-- related_wiki_paths:end -->', 'RELATED_WIKI_PATHS marker'],
  ['<section DATA-CANONICAL-CONTENT="true">Injected</section>', 'data-canonical-content attribute'],
  ['<section DATA-WIKI-STUB="true">Injected</section>', 'data-wiki-stub attribute'],
  ['<div ID="bible-content"></div>', 'reserved bible-content container'],
  ['<div id=bible-content></div>', 'reserved bible-content container'],
  ['<div id=bible-content />', 'reserved bible-content container'],
  ['<div\nid\f=\"bible&#45;content\"></div>', 'reserved bible-content container'],
  ['<div ID = bible&#x2d;content></div>', 'reserved bible-content container'],
  ['</article><section>Escaped the owned article.</section><article>', '<article boundary'],
  ['<style>article { display: none }</style>', '<style boundary'],
  ['<meta HTTP-EQUIV=\"refresh\" content=\"0;url=/wiki/other.html\">', '<meta control'],
  ['<meta HTTP-EQUIV=\"refresh\" content=\"0;url=/wiki/other.html\"/>', '<meta control'],
  ['<link href=\"/wiki/other.html\" rel=\"canonical\">', '<link control'],
  ['<link href=\"/wiki/other.html\" rel=\"canonical\"/>', '<link control'],
  ['<base href=\"/wiki/other/\"/>', '<base control'],
  ['<html/>', '<html boundary'],
  ['<head/>', '<head boundary'],
  ['<body/>', '<body boundary'],
  ['<article/>', '<article boundary'],
  ['<svg><a id="target"><text>Click</text></a><animate href="#target" attributeName="href" values="javascript:alert(1)"></animate></svg>', '<animate executable control'],
  ['<svg><a id="target"><text>Click</text></a><set href="#target" attributeName="href" to="javascript:alert(1)"></set></svg>', '<set executable control'],
  ['<svg><foreignObject><p>Foreign HTML</p></foreignObject></svg>', '<svg foreign-content boundary'],
  ['<math><annotation-xml encoding="text/html"><p>Foreign HTML</p></annotation-xml></math>', '<math foreign-content boundary'],
]) {
  assertValidationFails({ ...lorePayload, article_html: articleHtml }, expectedMessage);
}
console.log('PASS prose payloads reject ownership and generated-control injection');

for (const [open, close] of [
  ['<script>', '</script>'],
  ['<style>', '</style>'],
  ['<template>', '</template>'],
  ['<textarea>', '</textarea>'],
  ['<xmp>', '</xmp>'],
]) {
  const spoofed = `${open}<body data-wiki-stub="true"><article data-wiki-stub="true"></article>${close}` +
    '<body><article><p>Real page.</p></article></body>';
  assert.equal(importerHasRootWikiStubMarker(spoofed), false, `${open} must not spoof a root stub marker`);
}
assert.equal(
  importerHasRootWikiStubMarker('<template><template></template><article data-wiki-stub="true"></article></template><article><p>Real.</p></article>'),
  false
);
assert.equal(
  importerHasRootWikiStubMarker('<body data-wiki-stub="true"><article><p>Actual stub.</p></article></body>'),
  true
);
assert.equal(
  importerHasRootWikiStubMarker('<body><main><p>Real prose.</p></main><article data-wiki-stub="true"></article></body>'),
  false,
  'an article marker cannot authorize whole-page replacement'
);
assert.equal(importerHasRootWikiStubMarker('<body data-wiki-stub><article></article></body>'), false);
assert.equal(importerHasRootWikiStubMarker('<body data-wiki-stub=true><article></article></body>'), false);
assert.equal(
  importerHasRootWikiStubMarker('<body data-wiki-stub="true" data-wiki-stub="false"><article></article></body>'),
  false
);
assert.equal(
  importerHasRootWikiStubMarker(
    '<select><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></select>' +
      '<article><p>Real page.</p></article>'
  ),
  false,
  'select insertion mode must not invent an active body root or stub authority'
);
console.log('PASS importer root-stub detection ignores inert and raw-text spoofing');

const duplicatePayloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-duplicate-slug-'));
writeJson(path.join(duplicatePayloadDir, 'first.json'), lorePayload);
writeJson(path.join(duplicatePayloadDir, 'second.json'), { ...lorePayload, title: 'Duplicate source' });
assert.throws(
  () => validatePayloadDirectory(duplicatePayloadDir),
  (error) => error instanceof PayloadValidationError &&
    error.failures.some((failure) => failure.includes('duplicate slug sample-lore-page'))
);
console.log('PASS payload directory rejects duplicate slugs');

const missingDir = path.join(os.tmpdir(), `missing-website-payloads-${Date.now()}`);
const missingResult = validatePayloadDirectory(missingDir);
assert.equal(missingResult.skipped, true);
assert.match(missingResult.message, /does not exist/);
console.log('PASS missing live payload folder skips');

const dryRunOutput = [];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-'));
const tempWikiDir = path.join(tempRoot, 'wiki');
const tempPayloadDir = path.join(tempRoot, 'website-publish-payloads');
fs.mkdirSync(tempWikiDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(tempRoot, '_article-template.html'));
copyFixtures(tempPayloadDir);
authorizePayloadDirectory(tempRoot, tempPayloadDir);

const importResult = runImport({
  payloadDir: tempPayloadDir,
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
authorizePayloadDirectory(writeRoot, writePayloadDir);

const writeOutput = [];
const writeResult = runImport({
  payloadDir: writePayloadDir,
  rootDir: writeRoot,
  write: true,
  logger: (line) => writeOutput.push(line),
  refreshContentStateFn: (rootDir) => {
    assert.notEqual(path.resolve(rootDir), path.resolve(writeRoot), 'custom refresh must receive only an isolated workspace');
    assert.ok(fs.statSync(path.join(rootDir, PUBLISH_TRANSACTION_LOCK)).isDirectory());
    return refreshTestContentState(rootDir);
  },
});
assert.equal(fs.existsSync(path.join(writeRoot, PUBLISH_TRANSACTION_LOCK)), false, 'publish lock must be released after success');

const lorePagePath = path.join(writeRoot, 'wiki', 'sample-lore-page.html');
const nftPagePath = path.join(writeRoot, 'wiki', 'sample-nft-template.html');
assert.ok(fs.existsSync(lorePagePath), '--write must create sample lore page in temp root');
assert.ok(fs.existsSync(nftPagePath), '--write must create sample NFT page in temp root');

const lorePageHtml = fs.readFileSync(lorePagePath, 'utf8');
const nftPageHtml = fs.readFileSync(nftPagePath, 'utf8');
assert.match(lorePageHtml, /\/js\/core\/daily-loop-state\.js/);
assert.match(nftPageHtml, /\/js\/core\/daily-loop-state\.js/);
assert.ok(lorePageHtml.includes('wiki/<article-slug>.html'), 'stub rendering must not corrupt template comments');
assert.match(lorePageHtml, /<body\b[^>]*\bdata-wiki-stub="true"/i);
assert.match(lorePageHtml, /<article\b[^>]*\bdata-wiki-stub="true"[^>]*\bclass="wiki-content"/i);
assert.match(lorePageHtml, /<meta name="robots" content="noindex, nofollow">/i);
assert.match(lorePageHtml, /Unverified stub/);
assert.match(lorePageHtml, /class="wiki-stub-notice"/);
assert.doesNotMatch(lorePageHtml, /<span class="article-badge">✅ Verified<\/span>/);
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
assert.doesNotMatch(nftPageHtml, /function\s+injectBattleMedia\b/);
assert.doesNotMatch(nftPageHtml, /function\s+battleMediaTemplate\b/);

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
  'brand-canon/wiki-content-state.json',
  'brand-canon/wiki-rewrite-audit.md',
  'sitemap.xml',
]) {
  assert.ok(fs.existsSync(path.join(writeRoot, requiredFile)), `--write must update ${requiredFile}`);
}

const tempWikiIndex = JSON.parse(fs.readFileSync(path.join(writeRoot, 'js', 'wiki-index.json'), 'utf8'));
const tempWikiUrls = new Set(tempWikiIndex.map((entry) => entry.url));
assert.ok(!tempWikiUrls.has('/wiki/sample-lore-page.html'), 'noindex stub must stay out of the portable search index');
assert.ok(!tempWikiUrls.has('/wiki/sample-nft-template.html'), 'noindex NFT stub must stay out of the portable search index');
assert.doesNotMatch(fs.readFileSync(path.join(writeRoot, 'sitemap.xml'), 'utf8'), /https:\/\/cryptomoonboys\.com\/wiki\/sample-nft-template\.html/);
assert.ok(writeOutput.some((line) => line.includes('Synced portable feed surfaces')));
assert.deepEqual(
  JSON.parse(fs.readFileSync(path.join(writeRoot, 'brand-canon', 'wiki-absent-stubs.json'), 'utf8')).absent_stub_slugs,
  [],
  'successful stub creation must consume its one-time absent-stub authorization'
);
console.log('PASS write-mode creates pages and syncs all required temp surfaces');

const firstWriteLoreBytes = fs.readFileSync(lorePagePath);
const firstWriteGraphBytes = fs.readFileSync(path.join(writeRoot, 'js', 'graph-data.json'));
const secondWriteResult = runImport({
  payloadDir: writePayloadDir,
  rootDir: writeRoot,
  write: true,
  logger: () => {},
  refreshContentStateFn: refreshTestContentState,
});
assert.ok(secondWriteResult.ownershipActions.every(({ action }) => action === 'no-op'));
assert.equal(secondWriteResult.contentStateRefresh, null, 'same-hash replay must not regenerate content state');
assert.equal(secondWriteResult.sync, null, 'an all-no-op retry must not run feed synchronization');
assert.deepEqual(fs.readFileSync(lorePagePath), firstWriteLoreBytes, 'same-hash replay must not rewrite page bytes');
assert.deepEqual(fs.readFileSync(path.join(writeRoot, 'js', 'graph-data.json')), firstWriteGraphBytes, 'same-hash replay must not rewrite timestamped feeds');
assert.equal(fs.existsSync(path.join(writeRoot, PUBLISH_TRANSACTION_LOCK)), false, 'same-hash replay must release the publish lock');
console.log('PASS refreshed manifest makes a second identical import a same-hash no-op');

const legacyStubHtml = fs.readFileSync(lorePagePath, 'utf8')
  .replace(/<meta name="robots" content="noindex, nofollow">/i, '<meta name="robots" content="index, follow">')
  .replace(/<aside class="wiki-stub-notice"[\s\S]*?<\/aside>\s*/i, '')
  .replace(
    '<span class="article-badge wiki-stub-badge">⚠️ Unverified stub</span>',
    '<span class="article-badge">✅ Verified</span>'
  );
fs.writeFileSync(lorePagePath, legacyStubHtml, 'utf8');
refreshTestContentState(writeRoot);
const legacyStubHash = JSON.parse(
  fs.readFileSync(path.join(writeRoot, 'brand-canon', 'wiki-content-state.json'), 'utf8')
).pages.find(({ slug }) => slug === 'sample-lore-page').content_hash;
const lorePayloadPath = path.join(writePayloadDir, 'sample-lore-page.json');
writeJson(lorePayloadPath, {
  ...JSON.parse(fs.readFileSync(lorePayloadPath, 'utf8')),
  expected_content_hash: legacyStubHash,
});
writeJson(path.join(writeRoot, 'js', 'wiki-index.json'), [{
  title: 'STALE LEGACY STUB INDEX ENTRY',
  url: '/wiki/sample-lore-page.html',
  category: 'lore',
  rank_score: 999,
}]);
const legacyCategoryPath = path.join(writeRoot, 'categories', 'lore.html');
fs.writeFileSync(
  legacyCategoryPath,
  '<main><div class="article-list"><a class="article-list-item" href="/wiki/sample-lore-page.html">STALE STUB LINK</a></div></main>',
  'utf8'
);

const repairedStubResult = runImport({
  payloadDir: writePayloadDir,
  rootDir: writeRoot,
  write: true,
  logger: () => {},
  refreshContentStateFn: refreshTestContentState,
});
assert.equal(
  repairedStubResult.ownershipActions.find(({ path: pagePath }) => pagePath === 'wiki/sample-lore-page.html').action,
  'write',
  'same-SAM legacy stubs must be rewritten until their shell is hardened'
);
const repairedStubHtml = fs.readFileSync(lorePagePath, 'utf8');
assert.match(repairedStubHtml, /<meta name="robots" content="noindex, nofollow">/i);
assert.match(repairedStubHtml, /class="wiki-stub-notice"[^>]*>[\s\S]*?\bunverified\b/i);
assert.doesNotMatch(repairedStubHtml, /<span class="article-badge">✅ Verified<\/span>/);
assert.ok(
  !JSON.parse(fs.readFileSync(path.join(writeRoot, 'js', 'wiki-index.json'), 'utf8'))
    .some(({ url }) => url === '/wiki/sample-lore-page.html'),
  'portable sync must delete a stale pre-indexed stub URL before merging the index'
);
assert.doesNotMatch(
  fs.readFileSync(legacyCategoryPath, 'utf8'),
  /\/wiki\/sample-lore-page\.html/,
  'portable category sync must remove a stale excluded-stub article link'
);
console.log('PASS same-SAM legacy stub shells are repaired and de-indexed');

const stubShellReplaySlug = 'stub-shell-replay';
const stubShellReplayPayload = {
  ...lorePayload,
  slug: stubShellReplaySlug,
  title: stubShellReplaySlug,
  stub: true,
};
const exactGeneratedStubShell = renderPageFromTemplate(stubShellReplayPayload, ROOT, '');
const exactStubReplayFixture = ownershipFixture({
  slug: stubShellReplaySlug,
  html: exactGeneratedStubShell,
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assert.equal(
  planContentOwnershipUpdates(
    [exactStubReplayFixture.payload],
    exactStubReplayFixture.rootDir
  )[0].action,
  'no-op',
  'an exact generated stub replay must remain idempotent'
);

const generatedStubNotice = '<aside class="wiki-stub-notice" role="status" data-generated-wiki-stub-notice="true"><strong>Stub page:</strong> This short entry is unverified and is not a canonical article.</aside>';
for (const [label, hiddenShell] of [
  [
    'hidden main',
    exactGeneratedStubShell.replace(
      '<main id="content" role="main">',
      '<main id="content" role="main" hidden>'
    ),
  ],
  [
    'opacity-zero body',
    exactGeneratedStubShell.replace(
      '<body data-wiki-stub="true" class="page-article page-standard-shell">',
      '<body data-wiki-stub="true" class="page-article page-standard-shell" style="opacity: 0">'
    ),
  ],
  [
    'aria-hidden document',
    exactGeneratedStubShell.replace('<html lang="en">', '<html lang="en" aria-hidden="true">'),
  ],
  [
    'hidden notice wrapper',
    exactGeneratedStubShell.replace(generatedStubNotice, `<div hidden>${generatedStubNotice}</div>`),
  ],
  [
    'robots meta after an implicit head close',
    exactGeneratedStubShell.replace(
      '<meta name="robots" content="noindex, nofollow">',
      '<p></p><meta name="robots" content="noindex, nofollow">'
    ),
  ],
]) {
  const fixture = ownershipFixture({
    slug: stubShellReplaySlug,
    html: hiddenShell,
    automationPolicy: 'stub-allowed',
    payload: { stub: true },
  });
  assert.equal(
    planContentOwnershipUpdates([fixture.payload], fixture.rootDir)[0].action,
    'write',
    `${label} must prevent same-SAM stub no-op`
  );
}
console.log('PASS same-SAM stub replay requires a genuinely visible generated notice shell');

const lockedFixture = ownershipFixture();
const lockedPath = path.join(lockedFixture.rootDir, PUBLISH_TRANSACTION_LOCK);
fs.mkdirSync(lockedPath);
try {
  assert.throws(
    () => runImport({
      payloadDir: lockedFixture.payloadDir,
      rootDir: lockedFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError && error.code === 'PUBLISH_TRANSACTION_LOCKED'
  );
  assert.ok(fs.existsSync(lockedPath), 'a contender must not remove the active publisher lock');
} finally {
  fs.rmdirSync(lockedPath);
}
console.log('PASS write mode fails closed when another publish transaction holds the lock');

const symlinkRootTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-root-target-'));
const symlinkRootPath = `${symlinkRootTarget}-link`;
fs.symlinkSync(symlinkRootTarget, symlinkRootPath, 'dir');
assert.throws(
  () => runImport({
    payloadDir: path.join(symlinkRootPath, 'missing-payloads'),
    rootDir: symlinkRootPath,
    write: true,
    logger: () => {},
  }),
  (error) => error instanceof ContentOwnershipError && error.code === 'UNSAFE_PUBLISH_PATH'
);
assert.equal(
  fs.existsSync(path.join(symlinkRootTarget, PUBLISH_TRANSACTION_LOCK)),
  false,
  'a symlinked repository root must be rejected before lock creation'
);
console.log('PASS transaction lock acquisition rejects a symlinked repository root');

const rootReplacementFixture = ownershipFixture();
const rootReplacementOriginalPage = fs.readFileSync(
  path.join(rootReplacementFixture.rootDir, 'wiki', 'ownership-case.html')
);
const detachedOriginalRoot = `${rootReplacementFixture.rootDir}-detached`;
const replacementRootPage = Buffer.from(
  '<article class="wiki-content"><p>REPLACEMENT ROOT MUST REMAIN UNTOUCHED.</p></article>',
  'utf8'
);
let rootReplacementInjected = false;
assert.throws(
  () => runImport({
    payloadDir: rootReplacementFixture.payloadDir,
    rootDir: rootReplacementFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (isolatedRoot) => {
      const result = refreshTestContentState(isolatedRoot);
      fs.renameSync(rootReplacementFixture.rootDir, detachedOriginalRoot);
      fs.mkdirSync(path.join(rootReplacementFixture.rootDir, 'wiki'), { recursive: true });
      fs.writeFileSync(
        path.join(rootReplacementFixture.rootDir, 'wiki', 'ownership-case.html'),
        replacementRootPage
      );
      fs.writeFileSync(
        path.join(rootReplacementFixture.rootDir, 'replacement-root-sentinel.txt'),
        'replacement root sentinel\n',
        'utf8'
      );
      rootReplacementInjected = true;
      return result;
    },
  }),
  (error) => error instanceof ContentOwnershipError && error.code === 'UNSAFE_PUBLISH_PATH'
);
assert.equal(rootReplacementInjected, true, 'fixture must replace the named root after the page write');
assert.deepEqual(
  fs.readFileSync(path.join(detachedOriginalRoot, 'wiki', 'ownership-case.html')),
  rootReplacementOriginalPage,
  'rollback must restore the originally locked root through its held descriptor'
);
assert.deepEqual(
  fs.readFileSync(path.join(rootReplacementFixture.rootDir, 'wiki', 'ownership-case.html')),
  replacementRootPage,
  'the replacement root must never receive transaction writes or rollback bytes'
);
assert.equal(
  fs.existsSync(path.join(detachedOriginalRoot, PUBLISH_TRANSACTION_LOCK)),
  false,
  'the original root lock must be released through the held root descriptor'
);
assert.equal(
  fs.existsSync(path.join(rootReplacementFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'cleanup must not create or remove a lock in the replacement root'
);
console.log('PASS repository root replacement fails closed and rolls back only the held root inode');

const lockReplacementFixture = ownershipFixture();
const lockReplacementPagePath = path.join(
  lockReplacementFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const lockReplacementOriginalPage = fs.readFileSync(lockReplacementPagePath);
const replacementLockPath = path.join(lockReplacementFixture.rootDir, PUBLISH_TRANSACTION_LOCK);
let lockReplacementInjected = false;
assert.throws(
  () => runImport({
    payloadDir: lockReplacementFixture.payloadDir,
    rootDir: lockReplacementFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (isolatedRoot) => {
      const result = refreshTestContentState(isolatedRoot);
      fs.rmdirSync(replacementLockPath);
      fs.mkdirSync(replacementLockPath);
      fs.writeFileSync(
        path.join(replacementLockPath, 'replacement-owner.txt'),
        'replacement lock must survive\n',
        'utf8'
      );
      lockReplacementInjected = true;
      return result;
    },
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'PUBLISH_TRANSACTION_LOCK_CLEANUP_FAILED'
);
assert.equal(lockReplacementInjected, true, 'fixture must remove and recreate the held lock path');
assert.deepEqual(
  fs.readFileSync(lockReplacementPagePath),
  lockReplacementOriginalPage,
  'lock identity loss must roll the page mutation back before cleanup'
);
assert.equal(
  fs.readFileSync(path.join(replacementLockPath, 'replacement-owner.txt'), 'utf8'),
  'replacement lock must survive\n',
  'cleanup must not remove a lock directory with a different inode'
);
console.log('PASS lock remove/recreate is detected, rolled back, and never removed as ours');

const racedFixture = ownershipFixture();
const racedPagePath = path.join(racedFixture.rootDir, 'wiki', 'ownership-case.html');
const concurrentHtml = '<article class="wiki-content"><p>CONCURRENT RESET CONTENT.</p></article>';
let mutatedAfterPlan = false;
assert.throws(
  () => runImport({
    payloadDir: racedFixture.payloadDir,
    rootDir: racedFixture.rootDir,
    write: true,
    logger: (line) => {
      if (!mutatedAfterPlan && line.includes('Intended page path:')) {
        mutatedAfterPlan = true;
        fs.writeFileSync(racedPagePath, concurrentHtml, 'utf8');
      }
    },
    refreshContentStateFn: refreshTestContentState,
  }),
  (error) => error instanceof ContentOwnershipError && error.code === 'STALE_CONTENT_STATE'
);
assert.equal(mutatedAfterPlan, true);
assert.equal(fs.readFileSync(racedPagePath, 'utf8'), concurrentHtml, 'concurrent reset bytes must not be overwritten');
assert.equal(fs.existsSync(path.join(racedFixture.rootDir, PUBLISH_TRANSACTION_LOCK)), false, 'failed race preflight must release the lock');
console.log('PASS final live-base recheck blocks a deterministic post-plan reset race');

const metadataRevocationFixture = ownershipFixture();
const metadataRevocationPagePath = path.join(
  metadataRevocationFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const metadataRevocationManifestPath = path.join(
  metadataRevocationFixture.rootDir,
  CONTENT_STATE_MANIFEST_FILE
);
const metadataRevocationPageBefore = fs.readFileSync(metadataRevocationPagePath);
let metadataRevocationManifestBytes = null;
let metadataRevocationInjected = false;
assert.throws(
  () => runImport({
    payloadDir: metadataRevocationFixture.payloadDir,
    rootDir: metadataRevocationFixture.rootDir,
    write: true,
    logger: (line) => {
      if (!metadataRevocationInjected && line.includes('Intended page path:')) {
        const manifest = JSON.parse(fs.readFileSync(metadataRevocationManifestPath, 'utf8'));
        manifest.pages[0].automation_policy = 'metadata-only';
        writeJson(metadataRevocationManifestPath, manifest);
        metadataRevocationManifestBytes = fs.readFileSync(metadataRevocationManifestPath);
        metadataRevocationInjected = true;
      }
    },
    refreshContentStateFn: refreshTestContentState,
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'STALE_CONTENT_STATE' &&
    error.message.includes('authorizing manifest changed after ownership planning')
);
assert.equal(metadataRevocationInjected, true, 'fixture must revoke prose authorization after planning');
assert.deepEqual(
  fs.readFileSync(metadataRevocationPagePath),
  metadataRevocationPageBefore,
  'metadata-only revocation must fail before changing otherwise-stable page bytes'
);
assert.deepEqual(
  fs.readFileSync(metadataRevocationManifestPath),
  metadataRevocationManifestBytes,
  'failed prose write must preserve the newer metadata-only manifest'
);
console.log('PASS post-plan metadata-only revocation invalidates the exact authorizing manifest');

const canonRevocationFixture = ownershipFixture();
const canonRevocationPagePath = path.join(
  canonRevocationFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const canonRevocationManifestPath = path.join(
  canonRevocationFixture.rootDir,
  CONTENT_STATE_MANIFEST_FILE
);
const canonRevocationPageBefore = fs.readFileSync(canonRevocationPagePath);
let canonRevocationManifestBytes = null;
let canonRevocationManifestOpens = 0;
let canonRevocationInjected = false;
const openSyncBeforeCanonRevocation = fs.openSync;
fs.openSync = function interceptCanonRevocationSnapshot(filePath, ...args) {
  let anchoredParent = '';
  try {
    anchoredParent = fs.realpathSync.native(path.dirname(String(filePath)));
  } catch {
    // Ignore unrelated non-file-descriptor paths.
  }
  if (
    path.basename(String(filePath)) === path.basename(canonRevocationManifestPath) &&
    path.resolve(anchoredParent) === path.dirname(path.resolve(canonRevocationManifestPath))
  ) {
    canonRevocationManifestOpens += 1;
    if (canonRevocationManifestOpens === 3 && !canonRevocationInjected) {
      canonRevocationInjected = true;
      const manifest = JSON.parse(fs.readFileSync(canonRevocationManifestPath, 'utf8'));
      manifest.pages[0].automation_policy = 'canon-locked';
      writeJson(canonRevocationManifestPath, manifest);
      canonRevocationManifestBytes = fs.readFileSync(canonRevocationManifestPath);
    }
  }
  return openSyncBeforeCanonRevocation.call(fs, filePath, ...args);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: canonRevocationFixture.payloadDir,
      rootDir: canonRevocationFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'STALE_CONTENT_STATE' &&
      error.message.includes('authorizing manifest changed after ownership planning')
  );
} finally {
  fs.openSync = openSyncBeforeCanonRevocation;
}
assert.ok(canonRevocationManifestOpens >= 3, 'fixture must revoke prose authorization during manifest snapshot capture');
assert.equal(canonRevocationInjected, true);
assert.deepEqual(
  fs.readFileSync(canonRevocationPagePath),
  canonRevocationPageBefore,
  'canon-lock revocation during snapshot must fail before changing stable page bytes'
);
assert.deepEqual(
  fs.readFileSync(canonRevocationManifestPath),
  canonRevocationManifestBytes,
  'snapshot rejection must not adopt or roll back the newer canon-locked manifest'
);
console.log('PASS snapshot-time canon-lock revocation cannot become the transaction rollback base');

const snapshotRaceFixture = ownershipFixture();
const snapshotRacePagePath = path.join(snapshotRaceFixture.rootDir, 'wiki', 'ownership-case.html');
const snapshotRaceHtml = '<article class="wiki-content"><p>CONCURRENT CHANGE DURING SNAPSHOT.</p></article>';
const originalOpenSync = fs.openSync;
let snapshotRacePageOpens = 0;
fs.openSync = function interceptedOpenSync(filePath, ...args) {
  let anchoredParent = '';
  try {
    anchoredParent = fs.realpathSync.native(path.dirname(String(filePath)));
  } catch {
    // Ignore non-file-descriptor paths that are unrelated to the page.
  }
  if (
    path.basename(String(filePath)) === path.basename(snapshotRacePagePath) &&
    path.resolve(anchoredParent) === path.dirname(path.resolve(snapshotRacePagePath))
  ) {
    snapshotRacePageOpens += 1;
    if (snapshotRacePageOpens === 3) {
      fs.writeFileSync(snapshotRacePagePath, snapshotRaceHtml, 'utf8');
    }
  }
  return originalOpenSync.call(fs, filePath, ...args);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: snapshotRaceFixture.payloadDir,
      rootDir: snapshotRaceFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError && error.code === 'STALE_CONTENT_STATE'
  );
} finally {
  fs.openSync = originalOpenSync;
}
assert.equal(snapshotRacePageOpens, 3, 'fixture must mutate the page during snapshot capture');
assert.equal(fs.readFileSync(snapshotRacePagePath, 'utf8'), snapshotRaceHtml, 'snapshot race bytes must not be overwritten or rolled back');
console.log('PASS captured snapshot is compared with the planned base before atomic writes');

const forwardCommitRaceFixture = ownershipFixture();
const forwardCommitRacePagePath = path.join(
  forwardCommitRaceFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const forwardCommitRaceHtml = '<article class="wiki-content"><p>CONCURRENT CHANGE AT FORWARD COMMIT.</p></article>';
const renameSyncBeforeForwardRace = fs.renameSync;
let forwardCommitDetachRenames = 0;
fs.renameSync = function interceptForwardDetach(sourcePath, destinationPath) {
  const normalizedDestination = String(destinationPath).replaceAll('\\', '/');
  let anchoredSourceParent = '';
  try {
    anchoredSourceParent = fs.realpathSync.native(path.dirname(String(sourcePath)));
  } catch {
    // Ignore unrelated renames.
  }
  if (
    path.basename(String(sourcePath)) === path.basename(forwardCommitRacePagePath) &&
    path.resolve(anchoredSourceParent) === path.dirname(path.resolve(forwardCommitRacePagePath)) &&
    /\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedDestination)
  ) {
    forwardCommitDetachRenames += 1;
    fs.writeFileSync(forwardCommitRacePagePath, forwardCommitRaceHtml, 'utf8');
  }
  return renameSyncBeforeForwardRace.call(fs, sourcePath, destinationPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: forwardCommitRaceFixture.payloadDir,
      rootDir: forwardCommitRaceFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError && error.code === 'STALE_CONTENT_STATE'
  );
} finally {
  fs.renameSync = renameSyncBeforeForwardRace;
}
assert.equal(forwardCommitDetachRenames, 1, 'fixture must mutate immediately before forward detachment');
assert.equal(
  fs.readFileSync(forwardCommitRacePagePath, 'utf8'),
  forwardCommitRaceHtml,
  'conditional forward commit must preserve the last-moment concurrent page bytes'
);
console.log('PASS forward page commit atomically detaches and preserves a last-moment concurrent edit');

const pagePreinstallFailureFixture = ownershipFixture();
const pagePreinstallFailurePath = path.join(
  pagePreinstallFailureFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const pagePreinstallFailurePreimage = fs.readFileSync(pagePreinstallFailurePath);
const [pagePreinstallFailurePlan] = planContentOwnershipUpdates(
  [pagePreinstallFailureFixture.payload],
  pagePreinstallFailureFixture.rootDir
);
const pagePreinstallConcurrentBytes = Buffer.from(pagePreinstallFailurePlan.html, 'utf8');
assert.notDeepEqual(
  pagePreinstallConcurrentBytes,
  pagePreinstallFailurePreimage,
  'planned concurrent bytes must differ from the page snapshot for this regression'
);
let pagePreinstallFailureHookCount = 0;
const mkdtempSyncBeforePagePreinstallFailure = fs.mkdtempSync;
fs.mkdtempSync = function interceptPagePreinstallStage(prefix, ...args) {
  const normalizedPrefix = String(prefix).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]*$/.test(normalizedPrefix)) {
    pagePreinstallFailureHookCount += 1;
    fs.writeFileSync(pagePreinstallFailurePath, pagePreinstallConcurrentBytes);
    const error = new Error('injected generic failure before page staging');
    error.code = 'EACCES';
    throw error;
  }
  return mkdtempSyncBeforePagePreinstallFailure.call(fs, prefix, ...args);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: pagePreinstallFailureFixture.payloadDir,
      rootDir: pagePreinstallFailureFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error?.code === 'EACCES' &&
      error.message.includes('injected generic failure before page staging')
  );
} finally {
  fs.mkdtempSync = mkdtempSyncBeforePagePreinstallFailure;
}
assert.equal(pagePreinstallFailureHookCount, 1, 'pre-install page staging hook must fire exactly once');
assert.deepEqual(
  fs.readFileSync(pagePreinstallFailurePath),
  pagePreinstallConcurrentBytes,
  'generic pre-install failure must not authorize rollback of identical concurrent planned bytes'
);
assert.equal(
  fs.existsSync(path.join(pagePreinstallFailureFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'generic pre-install failure must release the transaction lock'
);
console.log('PASS generic pre-install page failure cannot bless identical concurrent planned bytes');

const detachedRecoveryFailureFixture = ownershipFixture();
const detachedRecoveryFailurePagePath = path.join(
  detachedRecoveryFailureFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const detachedRecoveryFailurePageBefore = fs.readFileSync(detachedRecoveryFailurePagePath);
let detachedRecoveryInstallFailures = 0;
let detachedRecoveryLinkFailures = 0;
const linkSyncBeforeDetachedRecoveryFailure = fs.linkSync;
fs.linkSync = function interceptDetachedPageRecovery(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    detachedRecoveryInstallFailures += 1;
    const error = new Error('injected staged page install failure after detachment');
    error.code = 'EACCES';
    throw error;
  }
  if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    detachedRecoveryLinkFailures += 1;
    const error = new Error('injected detached page recovery failure');
    error.code = 'EACCES';
    throw error;
  }
  return linkSyncBeforeDetachedRecoveryFailure.call(fs, sourcePath, targetPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: detachedRecoveryFailureFixture.payloadDir,
      rootDir: detachedRecoveryFailureFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error?.code === 'EACCES' &&
      error.message.includes('injected staged page install failure after detachment')
  );
} finally {
  fs.linkSync = linkSyncBeforeDetachedRecoveryFailure;
}
assert.equal(detachedRecoveryInstallFailures, 1, 'fixture must fail the staged page install exactly once');
assert.equal(detachedRecoveryLinkFailures, 1, 'fixture must fail detached-page link-back exactly once');
assert.deepEqual(
  fs.readFileSync(detachedRecoveryFailurePagePath),
  detachedRecoveryFailurePageBefore,
  'rollback must reinstall the page snapshot after attributable detachment leaves the live path absent'
);
assert.equal(
  fs.existsSync(path.join(detachedRecoveryFailureFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'failed detached-page recovery must release the transaction lock'
);
console.log('PASS failed detached-page recovery retains exact absence attribution for rollback');

const detachedParentSwapFixture = ownershipFixture();
const detachedParentSwapWikiPath = path.join(detachedParentSwapFixture.rootDir, 'wiki');
const detachedParentSwapMovedWikiPath = path.join(
  detachedParentSwapFixture.rootDir,
  'wiki-detached-original'
);
const detachedParentSwapPagePath = path.join(detachedParentSwapWikiPath, 'ownership-case.html');
const detachedParentSwapSentinelPath = path.join(detachedParentSwapWikiPath, 'replacement-owner.txt');
const detachedParentSwapSentinelBytes = Buffer.from('REAL DIRECTORY REPLACEMENT MUST SURVIVE\n', 'utf8');
let detachedParentSwapInstallFailures = 0;
let detachedParentSwapRecoveryFailures = 0;
const linkSyncBeforeDetachedParentSwap = fs.linkSync;
fs.linkSync = function interceptDetachedParentSwap(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    detachedParentSwapInstallFailures += 1;
    const error = new Error('injected staged install failure before parent swap');
    error.code = 'EACCES';
    throw error;
  }
  if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    detachedParentSwapRecoveryFailures += 1;
    fs.renameSync(detachedParentSwapWikiPath, detachedParentSwapMovedWikiPath);
    fs.mkdirSync(detachedParentSwapWikiPath);
    fs.writeFileSync(detachedParentSwapSentinelPath, detachedParentSwapSentinelBytes);
    const error = new Error('injected detached recovery failure after real parent swap');
    error.code = 'EACCES';
    throw error;
  }
  return linkSyncBeforeDetachedParentSwap.call(fs, sourcePath, targetPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: detachedParentSwapFixture.payloadDir,
      rootDir: detachedParentSwapFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.message.includes('injected staged install failure before parent swap') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html'
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeDetachedParentSwap;
}
assert.equal(detachedParentSwapInstallFailures, 1);
assert.equal(detachedParentSwapRecoveryFailures, 1);
assert.equal(
  fs.existsSync(detachedParentSwapPagePath),
  false,
  'rollback must not install the snapshot into a replacement real directory'
);
assert.deepEqual(
  fs.readFileSync(detachedParentSwapSentinelPath),
  detachedParentSwapSentinelBytes,
  'replacement real directory contents must remain untouched'
);
console.log('PASS rollback parent identity blocks page restore into a swapped real directory');

const detachedConcurrentWinnerFixture = ownershipFixture();
const detachedConcurrentWinnerPagePath = path.join(
  detachedConcurrentWinnerFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const detachedConcurrentWinnerBytes = Buffer.from(
  '<article class="wiki-content"><p>CONCURRENT WINNER AFTER PAGE DETACH.</p></article>',
  'utf8'
);
let detachedConcurrentWinnerInjected = 0;
const linkSyncBeforeDetachedConcurrentWinner = fs.linkSync;
fs.linkSync = function interceptDetachedConcurrentWinner(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    detachedConcurrentWinnerInjected += 1;
    fs.writeFileSync(detachedConcurrentWinnerPagePath, detachedConcurrentWinnerBytes);
  }
  return linkSyncBeforeDetachedConcurrentWinner.call(fs, sourcePath, targetPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: detachedConcurrentWinnerFixture.payloadDir,
      rootDir: detachedConcurrentWinnerFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'STALE_CONTENT_STATE' &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeDetachedConcurrentWinner;
}
assert.equal(detachedConcurrentWinnerInjected, 1, 'fixture must win the detached target exactly once');
assert.deepEqual(
  fs.readFileSync(detachedConcurrentWinnerPagePath),
  detachedConcurrentWinnerBytes,
  'rollback must preserve a concurrent page that wins after the old page is detached'
);
console.log('PASS concurrent page winning detached install remains unattributed and preserved');

const deletedConcurrentWinnerFixture = ownershipFixture();
const deletedConcurrentWinnerPagePath = path.join(
  deletedConcurrentWinnerFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const deletedConcurrentWinnerBytes = Buffer.from(
  '<article class="wiki-content"><p>CONCURRENT WINNER DELETED DURING DETACHED CLEANUP.</p></article>',
  'utf8'
);
let deletedConcurrentWinnerInstalls = 0;
let deletedConcurrentWinnerCleanupDeletions = 0;
const linkSyncBeforeDeletedConcurrentWinner = fs.linkSync;
const unlinkSyncBeforeDeletedConcurrentWinner = fs.unlinkSync;
fs.linkSync = function interceptDeletedConcurrentWinner(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    deletedConcurrentWinnerInstalls += 1;
    fs.writeFileSync(deletedConcurrentWinnerPagePath, deletedConcurrentWinnerBytes);
  }
  return linkSyncBeforeDeletedConcurrentWinner.call(fs, sourcePath, targetPath);
};
fs.unlinkSync = function interceptDeletedConcurrentWinnerCleanup(filePath) {
  const normalizedPath = String(filePath).replaceAll('\\', '/');
  if (
    deletedConcurrentWinnerInstalls > 0 &&
    deletedConcurrentWinnerCleanupDeletions === 0 &&
    /\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedPath)
  ) {
    deletedConcurrentWinnerCleanupDeletions += 1;
    assert.deepEqual(
      fs.readFileSync(deletedConcurrentWinnerPagePath),
      deletedConcurrentWinnerBytes,
      'the concurrent winner must still occupy the live path before detached cleanup'
    );
    unlinkSyncBeforeDeletedConcurrentWinner.call(fs, deletedConcurrentWinnerPagePath);
  }
  return unlinkSyncBeforeDeletedConcurrentWinner.call(fs, filePath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: deletedConcurrentWinnerFixture.payloadDir,
      rootDir: deletedConcurrentWinnerFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'STALE_CONTENT_STATE' &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeDeletedConcurrentWinner;
  fs.unlinkSync = unlinkSyncBeforeDeletedConcurrentWinner;
}
assert.equal(
  deletedConcurrentWinnerInstalls,
  1,
  'fixture must install one concurrent winner before the staged page commit'
);
assert.equal(
  deletedConcurrentWinnerCleanupDeletions,
  1,
  'fixture must delete the concurrent winner during detached-preimage cleanup'
);
assert.equal(
  fs.existsSync(deletedConcurrentWinnerPagePath),
  false,
  'rollback must preserve absence after a concurrent winner is subsequently deleted'
);
assert.equal(
  fs.existsSync(path.join(deletedConcurrentWinnerFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'deleted-winner conflict must release the publish transaction lock'
);
console.log('PASS deleted concurrent install winner cannot become importer-owned absence');

const failedCleanupDeletedWinnerFixture = ownershipFixture();
const failedCleanupDeletedWinnerWikiPath = path.join(
  failedCleanupDeletedWinnerFixture.rootDir,
  'wiki'
);
const failedCleanupDeletedWinnerPagePath = path.join(
  failedCleanupDeletedWinnerWikiPath,
  'ownership-case.html'
);
const failedCleanupDeletedWinnerBytes = Buffer.from(
  '<article class="wiki-content"><p>CONCURRENT WINNER DELETED BEFORE CLEANUP FAILURE.</p></article>',
  'utf8'
);
let failedCleanupDeletedWinnerInstalls = 0;
let failedCleanupDeletedWinnerDeletions = 0;
let failedCleanupDeletedWinnerRecoveryLinks = 0;
const linkSyncBeforeFailedCleanupDeletedWinner = fs.linkSync;
const unlinkSyncBeforeFailedCleanupDeletedWinner = fs.unlinkSync;
fs.linkSync = function interceptFailedCleanupDeletedWinner(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    failedCleanupDeletedWinnerInstalls += 1;
    fs.writeFileSync(
      failedCleanupDeletedWinnerPagePath,
      failedCleanupDeletedWinnerBytes
    );
  } else if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    failedCleanupDeletedWinnerRecoveryLinks += 1;
  }
  return linkSyncBeforeFailedCleanupDeletedWinner.call(fs, sourcePath, targetPath);
};
fs.unlinkSync = function interceptFailedDetachedCleanup(filePath) {
  const normalizedPath = String(filePath).replaceAll('\\', '/');
  if (
    failedCleanupDeletedWinnerInstalls > 0 &&
    failedCleanupDeletedWinnerDeletions === 0 &&
    /\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedPath)
  ) {
    failedCleanupDeletedWinnerDeletions += 1;
    unlinkSyncBeforeFailedCleanupDeletedWinner.call(
      fs,
      failedCleanupDeletedWinnerPagePath
    );
    const error = new Error('injected detached cleanup failure after concurrent winner deletion');
    error.code = 'EACCES';
    throw error;
  }
  return unlinkSyncBeforeFailedCleanupDeletedWinner.call(fs, filePath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: failedCleanupDeletedWinnerFixture.payloadDir,
      rootDir: failedCleanupDeletedWinnerFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes(
        'injected detached cleanup failure after concurrent winner deletion'
      ) &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeFailedCleanupDeletedWinner;
  fs.unlinkSync = unlinkSyncBeforeFailedCleanupDeletedWinner;
}
assert.equal(failedCleanupDeletedWinnerInstalls, 1);
assert.equal(failedCleanupDeletedWinnerDeletions, 1);
assert.equal(
  failedCleanupDeletedWinnerRecoveryLinks,
  0,
  'catch recovery must not relink the old preimage after a concurrent winner was observed'
);
assert.equal(
  fs.existsSync(failedCleanupDeletedWinnerPagePath),
  false,
  'failed cleanup must preserve the concurrent winner deletion'
);
const failedCleanupDeletedWinnerQuarantines = fs.readdirSync(
  failedCleanupDeletedWinnerWikiPath,
  { withFileTypes: true }
).filter((entry) =>
  entry.isDirectory() && entry.name.startsWith('.ownership-case.html.forward-')
);
assert.equal(
  failedCleanupDeletedWinnerQuarantines.length,
  1,
  'the detached old preimage must remain quarantined after cleanup fails'
);
assert.equal(
  fs.existsSync(path.join(
    failedCleanupDeletedWinnerFixture.rootDir,
    PUBLISH_TRANSACTION_LOCK
  )),
  false,
  'failed detached cleanup conflict must release the publish transaction lock'
);
console.log('PASS failed detached cleanup cannot relink after a deleted concurrent winner');

const deletedRecoveryLinkFixture = ownershipFixture();
const deletedRecoveryLinkWikiPath = path.join(
  deletedRecoveryLinkFixture.rootDir,
  'wiki'
);
const deletedRecoveryLinkPagePath = path.join(
  deletedRecoveryLinkWikiPath,
  'ownership-case.html'
);
const deletedRecoveryLinkPageBefore = fs.readFileSync(deletedRecoveryLinkPagePath);
let deletedRecoveryLinkInstallFailures = 0;
let deletedRecoveryLinkInstalls = 0;
let deletedRecoveryLinkCleanupFailures = 0;
const linkSyncBeforeDeletedRecoveryLink = fs.linkSync;
const unlinkSyncBeforeDeletedRecoveryLink = fs.unlinkSync;
fs.linkSync = function interceptDeletedRecoveryLink(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    deletedRecoveryLinkInstallFailures += 1;
    const error = new Error('injected staged install failure before recovery link');
    error.code = 'EACCES';
    throw error;
  }
  if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    deletedRecoveryLinkInstalls += 1;
  }
  return linkSyncBeforeDeletedRecoveryLink.call(fs, sourcePath, targetPath);
};
fs.unlinkSync = function interceptDeletedRecoveryLinkCleanup(filePath) {
  const normalizedPath = String(filePath).replaceAll('\\', '/');
  if (
    deletedRecoveryLinkInstalls > 0 &&
    deletedRecoveryLinkCleanupFailures === 0 &&
    /\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedPath)
  ) {
    deletedRecoveryLinkCleanupFailures += 1;
    assert.deepEqual(
      fs.readFileSync(deletedRecoveryLinkPagePath),
      deletedRecoveryLinkPageBefore,
      'the exact old preimage must be live before recovery-link cleanup'
    );
    unlinkSyncBeforeDeletedRecoveryLink.call(fs, deletedRecoveryLinkPagePath);
    const error = new Error('injected cleanup failure after recovery link deletion');
    error.code = 'EIO';
    throw error;
  }
  return unlinkSyncBeforeDeletedRecoveryLink.call(fs, filePath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: deletedRecoveryLinkFixture.payloadDir,
      rootDir: deletedRecoveryLinkFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes('injected staged install failure before recovery link') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeDeletedRecoveryLink;
  fs.unlinkSync = unlinkSyncBeforeDeletedRecoveryLink;
}
assert.equal(deletedRecoveryLinkInstallFailures, 1);
assert.equal(
  deletedRecoveryLinkInstalls,
  1,
  'catch recovery must install the detached preimage exactly once'
);
assert.equal(
  deletedRecoveryLinkCleanupFailures,
  1,
  'fixture must delete that recovery link before detached cleanup fails'
);
assert.equal(
  fs.existsSync(deletedRecoveryLinkPagePath),
  false,
  'rollback must preserve deletion of a successfully installed recovery link'
);
const deletedRecoveryLinkQuarantines = fs.readdirSync(
  deletedRecoveryLinkWikiPath,
  { withFileTypes: true }
).filter((entry) =>
  entry.isDirectory() && entry.name.startsWith('.ownership-case.html.forward-')
);
assert.equal(deletedRecoveryLinkQuarantines.length, 1);
const deletedRecoveryLinkQuarantinePath = path.join(
  deletedRecoveryLinkWikiPath,
  deletedRecoveryLinkQuarantines[0].name
);
assert.deepEqual(
  fs.readdirSync(deletedRecoveryLinkQuarantinePath).sort(),
  ['detached'],
  'failed recovery cleanup must retain only the detached preimage quarantine'
);
assert.deepEqual(
  fs.readFileSync(path.join(deletedRecoveryLinkQuarantinePath, 'detached')),
  deletedRecoveryLinkPageBefore,
  'the detached preimage must remain recoverable after cleanup failure'
);
assert.equal(
  fs.existsSync(path.join(deletedRecoveryLinkFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'recovery-link cleanup conflict must release the publish transaction lock'
);
console.log('PASS deleted recovery link cannot become importer-owned absence');

const recoveryCollisionFixture = ownershipFixture();
const recoveryCollisionWikiPath = path.join(recoveryCollisionFixture.rootDir, 'wiki');
const recoveryCollisionPagePath = path.join(
  recoveryCollisionWikiPath,
  'ownership-case.html'
);
const recoveryCollisionPageBefore = fs.readFileSync(recoveryCollisionPagePath);
const recoveryCollisionBytes = Buffer.from(
  '<article class="wiki-content"><p>RECOVERY LINK EEXIST COLLISION.</p></article>',
  'utf8'
);
let recoveryCollisionStageFailures = 0;
let recoveryCollisionAttempts = 0;
const linkSyncBeforeRecoveryCollision = fs.linkSync;
fs.linkSync = function interceptRecoveryCollision(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    recoveryCollisionStageFailures += 1;
    const error = new Error('injected staged install failure before recovery collision');
    error.code = 'EACCES';
    throw error;
  }
  if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    recoveryCollisionAttempts += 1;
    fs.writeFileSync(recoveryCollisionPagePath, recoveryCollisionBytes);
    try {
      return linkSyncBeforeRecoveryCollision.call(fs, sourcePath, targetPath);
    } finally {
      fs.unlinkSync(recoveryCollisionPagePath);
    }
  }
  return linkSyncBeforeRecoveryCollision.call(fs, sourcePath, targetPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: recoveryCollisionFixture.payloadDir,
      rootDir: recoveryCollisionFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes('staged install failure before recovery collision') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeRecoveryCollision;
}
assert.equal(recoveryCollisionStageFailures, 1);
assert.equal(
  recoveryCollisionAttempts,
  1,
  'detached recovery must observe exactly one EEXIST collision'
);
assert.equal(
  fs.existsSync(recoveryCollisionPagePath),
  false,
  'rollback must preserve deletion of the recovery-link collision target'
);
const recoveryCollisionQuarantines = fs.readdirSync(
  recoveryCollisionWikiPath,
  { withFileTypes: true }
).filter((entry) =>
  entry.isDirectory() && entry.name.startsWith('.ownership-case.html.forward-')
);
assert.equal(recoveryCollisionQuarantines.length, 1);
const recoveryCollisionQuarantinePath = path.join(
  recoveryCollisionWikiPath,
  recoveryCollisionQuarantines[0].name
);
assert.deepEqual(
  fs.readdirSync(recoveryCollisionQuarantinePath).sort(),
  ['detached'],
  'recovery collision must retain only the detached preimage quarantine'
);
assert.deepEqual(
  fs.readFileSync(path.join(recoveryCollisionQuarantinePath, 'detached')),
  recoveryCollisionPageBefore,
  'recovery EEXIST must preserve the detached preimage byte-for-byte'
);
assert.equal(
  fs.existsSync(path.join(recoveryCollisionFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'recovery collision conflict must release the publish transaction lock'
);
console.log('PASS recovery-link EEXIST provenance survives concurrent target deletion');

const catchProbePresenceFixture = ownershipFixture();
const catchProbePresenceWikiPath = path.join(catchProbePresenceFixture.rootDir, 'wiki');
const catchProbePresencePagePath = path.join(
  catchProbePresenceWikiPath,
  'ownership-case.html'
);
const catchProbePresencePageBefore = fs.readFileSync(catchProbePresencePagePath);
const catchProbePresenceBytes = Buffer.from(
  '<article class="wiki-content"><p>CONCURRENT TARGET OBSERVED BY CATCH PROBE.</p></article>',
  'utf8'
);
let catchProbePresenceStageFailures = 0;
let catchProbePresenceObservations = 0;
const linkSyncBeforeCatchProbePresence = fs.linkSync;
const lstatSyncBeforeCatchProbePresence = fs.lstatSync;
fs.linkSync = function interceptCatchProbePresenceInstall(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    catchProbePresenceStageFailures += 1;
    fs.writeFileSync(catchProbePresencePagePath, catchProbePresenceBytes);
    const error = new Error('injected staged install failure with concurrent target');
    error.code = 'EACCES';
    throw error;
  }
  return linkSyncBeforeCatchProbePresence.call(fs, sourcePath, targetPath);
};
fs.lstatSync = function interceptCatchProbePresence(filePath, ...args) {
  const normalizedPath = String(filePath).replaceAll('\\', '/');
  if (
    catchProbePresenceStageFailures > 0 &&
    catchProbePresenceObservations === 0 &&
    /\/proc\/self\/fd\/\d+\/ownership-case\.html$/.test(normalizedPath)
  ) {
    const stat = lstatSyncBeforeCatchProbePresence.call(fs, filePath, ...args);
    catchProbePresenceObservations += 1;
    fs.unlinkSync(catchProbePresencePagePath);
    return stat;
  }
  return lstatSyncBeforeCatchProbePresence.call(fs, filePath, ...args);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: catchProbePresenceFixture.payloadDir,
      rootDir: catchProbePresenceFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes('staged install failure with concurrent target') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeCatchProbePresence;
  fs.lstatSync = lstatSyncBeforeCatchProbePresence;
}
assert.equal(catchProbePresenceStageFailures, 1);
assert.equal(
  catchProbePresenceObservations,
  1,
  'catch must successfully observe the concurrent target before it is deleted'
);
assert.equal(
  fs.existsSync(catchProbePresencePagePath),
  false,
  'rollback must preserve deletion of a target observed by the catch probe'
);
const catchProbePresenceQuarantines = fs.readdirSync(
  catchProbePresenceWikiPath,
  { withFileTypes: true }
).filter((entry) =>
  entry.isDirectory() && entry.name.startsWith('.ownership-case.html.forward-')
);
assert.equal(catchProbePresenceQuarantines.length, 1);
const catchProbePresenceQuarantinePath = path.join(
  catchProbePresenceWikiPath,
  catchProbePresenceQuarantines[0].name
);
assert.deepEqual(
  fs.readdirSync(catchProbePresenceQuarantinePath).sort(),
  ['detached'],
  'catch-probe race must retain only the detached preimage quarantine'
);
assert.deepEqual(
  fs.readFileSync(path.join(catchProbePresenceQuarantinePath, 'detached')),
  catchProbePresencePageBefore,
  'catch-probe race must preserve the detached preimage byte-for-byte'
);
assert.equal(
  fs.existsSync(path.join(catchProbePresenceFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'catch-probe conflict must release the publish transaction lock'
);
console.log('PASS catch-probe presence provenance survives concurrent target deletion');

const catchProbeFailureFixture = ownershipFixture();
const catchProbeFailureWikiPath = path.join(catchProbeFailureFixture.rootDir, 'wiki');
const catchProbeFailurePagePath = path.join(
  catchProbeFailureWikiPath,
  'ownership-case.html'
);
const catchProbeFailurePageBefore = fs.readFileSync(catchProbeFailurePagePath);
const catchProbeFailureConcurrentBytes = Buffer.from(
  '<article class="wiki-content"><p>TARGET DELETED DURING FAILED CATCH PROBE.</p></article>',
  'utf8'
);
let catchProbeFailureStageFailures = 0;
let catchProbeFailureProbeErrors = 0;
let catchProbeFailureRecoveryLinks = 0;
const linkSyncBeforeCatchProbeFailure = fs.linkSync;
const lstatSyncBeforeCatchProbeFailure = fs.lstatSync;
const unlinkSyncBeforeCatchProbeFailure = fs.unlinkSync;
fs.linkSync = function interceptCatchProbeFailureInstall(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    catchProbeFailureStageFailures += 1;
    fs.writeFileSync(
      catchProbeFailurePagePath,
      catchProbeFailureConcurrentBytes
    );
    const error = new Error('injected staged install failure before uncertain probe');
    error.code = 'EACCES';
    throw error;
  }
  if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    catchProbeFailureRecoveryLinks += 1;
  }
  return linkSyncBeforeCatchProbeFailure.call(fs, sourcePath, targetPath);
};
fs.lstatSync = function interceptCatchProbeFailure(filePath, ...args) {
  const normalizedPath = String(filePath).replaceAll('\\', '/');
  if (
    catchProbeFailureStageFailures > 0 &&
    catchProbeFailureProbeErrors === 0 &&
    /\/proc\/self\/fd\/\d+\/ownership-case\.html$/.test(normalizedPath)
  ) {
    catchProbeFailureProbeErrors += 1;
    assert.deepEqual(
      fs.readFileSync(catchProbeFailurePagePath),
      catchProbeFailureConcurrentBytes,
      'the concurrent target must exist when the first catch probe begins'
    );
    unlinkSyncBeforeCatchProbeFailure.call(fs, catchProbeFailurePagePath);
    const error = new Error('injected catch-boundary target probe failure');
    error.code = 'EIO';
    throw error;
  }
  return lstatSyncBeforeCatchProbeFailure.call(fs, filePath, ...args);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: catchProbeFailureFixture.payloadDir,
      rootDir: catchProbeFailureFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EIO' &&
      error.cause.message.includes('injected catch-boundary target probe failure') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeCatchProbeFailure;
  fs.lstatSync = lstatSyncBeforeCatchProbeFailure;
}
assert.equal(catchProbeFailureStageFailures, 1);
assert.equal(catchProbeFailureProbeErrors, 1);
assert.equal(
  catchProbeFailureRecoveryLinks,
  0,
  'an uncertain catch probe must not authorize detached-page recovery'
);
assert.equal(
  fs.existsSync(catchProbeFailurePagePath),
  false,
  'rollback must preserve absence after the failed probe deletes a concurrent target'
);
const catchProbeFailureQuarantines = fs.readdirSync(
  catchProbeFailureWikiPath,
  { withFileTypes: true }
).filter((entry) =>
  entry.isDirectory() && entry.name.startsWith('.ownership-case.html.forward-')
);
assert.equal(catchProbeFailureQuarantines.length, 1);
const catchProbeFailureQuarantinePath = path.join(
  catchProbeFailureWikiPath,
  catchProbeFailureQuarantines[0].name
);
assert.deepEqual(
  fs.readdirSync(catchProbeFailureQuarantinePath).sort(),
  ['detached'],
  'failed-probe race must retain only the detached preimage quarantine'
);
assert.deepEqual(
  fs.readFileSync(path.join(catchProbeFailureQuarantinePath, 'detached')),
  catchProbeFailurePageBefore,
  'failed-probe race must preserve the detached preimage byte-for-byte'
);
assert.equal(
  fs.existsSync(path.join(catchProbeFailureFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'failed catch-probe conflict must release the publish transaction lock'
);
console.log('PASS catch-probe uncertainty revokes absence ownership');

const detachedRecheckFixture = ownershipFixture();
const detachedRecheckWikiPath = path.join(detachedRecheckFixture.rootDir, 'wiki');
const detachedRecheckPagePath = path.join(
  detachedRecheckWikiPath,
  'ownership-case.html'
);
const detachedRecheckPageBefore = fs.readFileSync(detachedRecheckPagePath);
const detachedRecheckConcurrentBytes = Buffer.from(
  '<article class="wiki-content"><p>OPEN FD MUTATED THE DETACHED INODE.</p></article>',
  'utf8'
);
let detachedRecheckStageFailures = 0;
let detachedRecheckMutations = 0;
let detachedRecheckRecoveryFailures = 0;
const linkSyncBeforeDetachedRecheck = fs.linkSync;
fs.linkSync = function interceptDetachedRecheck(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    detachedRecheckStageFailures += 1;
    const siblingDetachedPath = path.join(path.dirname(String(sourcePath)), 'detached');
    assert.deepEqual(
      fs.readFileSync(siblingDetachedPath),
      detachedRecheckPageBefore,
      'the initially verified detached inode must still contain the expected preimage'
    );
    fs.writeFileSync(siblingDetachedPath, detachedRecheckConcurrentBytes);
    detachedRecheckMutations += 1;
    const error = new Error('injected staged install failure after detached mutation');
    error.code = 'EACCES';
    throw error;
  }
  if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    detachedRecheckRecoveryFailures += 1;
    const error = new Error('injected recovery failure for mutated detached inode');
    error.code = 'EPERM';
    throw error;
  }
  return linkSyncBeforeDetachedRecheck.call(fs, sourcePath, targetPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: detachedRecheckFixture.payloadDir,
      rootDir: detachedRecheckFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes('staged install failure after detached mutation') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeDetachedRecheck;
}
assert.equal(detachedRecheckStageFailures, 1);
assert.equal(detachedRecheckMutations, 1);
assert.equal(
  detachedRecheckRecoveryFailures,
  1,
  'catch recovery must fail once after the detached inode is mutated'
);
assert.equal(
  fs.existsSync(detachedRecheckPagePath),
  false,
  'rollback must not resurrect the stale snapshot after detached inode mutation'
);
const detachedRecheckQuarantines = fs.readdirSync(
  detachedRecheckWikiPath,
  { withFileTypes: true }
).filter((entry) =>
  entry.isDirectory() && entry.name.startsWith('.ownership-case.html.forward-')
);
assert.equal(detachedRecheckQuarantines.length, 1);
const detachedRecheckQuarantinePath = path.join(
  detachedRecheckWikiPath,
  detachedRecheckQuarantines[0].name
);
assert.deepEqual(
  fs.readdirSync(detachedRecheckQuarantinePath).sort(),
  ['detached'],
  'detached-inode race must retain only the quarantined concurrent preimage'
);
assert.deepEqual(
  fs.readFileSync(path.join(detachedRecheckQuarantinePath, 'detached')),
  detachedRecheckConcurrentBytes,
  'the newer detached inode bytes must remain recoverable byte-for-byte'
);
assert.equal(
  fs.existsSync(path.join(detachedRecheckFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'detached-inode recheck conflict must release the publish transaction lock'
);
console.log('PASS final detached-preimage recheck rejects open-fd mutation');

const mismatchedDetachedRecoveryFixture = ownershipFixture();
const mismatchedDetachedRecoveryWikiPath = path.join(
  mismatchedDetachedRecoveryFixture.rootDir,
  'wiki'
);
const mismatchedDetachedRecoveryPagePath = path.join(
  mismatchedDetachedRecoveryWikiPath,
  'ownership-case.html'
);
const mismatchedDetachedRecoveryBytes = Buffer.from(
  '<article class="wiki-content"><p>CONCURRENT EDIT DETACHED BEFORE COMMIT.</p></article>',
  'utf8'
);
let mismatchedDetachedRecoveryEdits = 0;
let mismatchedDetachedRecoveryLinkFailures = 0;
const renameSyncBeforeMismatchedDetachedRecovery = fs.renameSync;
const linkSyncBeforeMismatchedDetachedRecovery = fs.linkSync;
fs.renameSync = function interceptMismatchedDetachedPage(sourcePath, destinationPath) {
  const normalizedDestination = String(destinationPath).replaceAll('\\', '/');
  if (
    mismatchedDetachedRecoveryEdits === 0 &&
    /\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedDestination)
  ) {
    mismatchedDetachedRecoveryEdits += 1;
    fs.writeFileSync(
      mismatchedDetachedRecoveryPagePath,
      mismatchedDetachedRecoveryBytes
    );
  }
  return renameSyncBeforeMismatchedDetachedRecovery.call(fs, sourcePath, destinationPath);
};
fs.linkSync = function interceptMismatchedDetachedRecovery(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/detached$/.test(normalizedSource)) {
    mismatchedDetachedRecoveryLinkFailures += 1;
    const error = new Error(
      `injected mismatched detached-page link-back failure ${mismatchedDetachedRecoveryLinkFailures}`
    );
    error.code = 'EACCES';
    throw error;
  }
  return linkSyncBeforeMismatchedDetachedRecovery.call(fs, sourcePath, targetPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: mismatchedDetachedRecoveryFixture.payloadDir,
      rootDir: mismatchedDetachedRecoveryFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes('mismatched detached-page link-back failure 1') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath, reason }) =>
          conflictPath === 'wiki/ownership-case.html' &&
          reason.includes('transaction postimage was not captured')
      )
  );
} finally {
  fs.renameSync = renameSyncBeforeMismatchedDetachedRecovery;
  fs.linkSync = linkSyncBeforeMismatchedDetachedRecovery;
}
assert.equal(
  mismatchedDetachedRecoveryEdits,
  1,
  'fixture must replace the expected preimage immediately before detachment'
);
assert.equal(
  mismatchedDetachedRecoveryLinkFailures,
  2,
  'both immediate and catch-boundary detached link-back attempts must fail'
);
assert.equal(
  fs.existsSync(mismatchedDetachedRecoveryPagePath),
  false,
  'rollback must not restore the stale snapshot when the detached preimage was mismatched'
);
const mismatchedDetachedRecoveryQuarantines = fs.readdirSync(
  mismatchedDetachedRecoveryWikiPath,
  { withFileTypes: true }
).filter((entry) =>
  entry.isDirectory() && entry.name.startsWith('.ownership-case.html.forward-')
);
assert.equal(
  mismatchedDetachedRecoveryQuarantines.length,
  1,
  'the mismatched detached preimage must remain in one recovery quarantine'
);
const mismatchedDetachedRecoveryQuarantinePath = path.join(
  mismatchedDetachedRecoveryWikiPath,
  mismatchedDetachedRecoveryQuarantines[0].name
);
assert.deepEqual(
  fs.readdirSync(mismatchedDetachedRecoveryQuarantinePath).sort(),
  ['detached'],
  'cleanup must remove the uncommitted staged page and retain only the detached concurrent edit'
);
assert.deepEqual(
  fs.readFileSync(path.join(mismatchedDetachedRecoveryQuarantinePath, 'detached')),
  mismatchedDetachedRecoveryBytes,
  'the concurrent detached edit must be preserved byte-for-byte for recovery'
);
assert.equal(
  fs.existsSync(path.join(
    mismatchedDetachedRecoveryFixture.rootDir,
    PUBLISH_TRANSACTION_LOCK
  )),
  false,
  'mismatched-preimage conflict must release the publish transaction lock'
);
console.log('PASS mismatched detached preimage cannot authorize stale snapshot restoration');

const detachedProbeFailureFixture = ownershipFixture();
const detachedProbeFailurePagePath = path.join(
  detachedProbeFailureFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const [detachedProbeFailurePlan] = planContentOwnershipUpdates(
  [detachedProbeFailureFixture.payload],
  detachedProbeFailureFixture.rootDir
);
const detachedProbeConcurrentBytes = Buffer.from(detachedProbeFailurePlan.html, 'utf8');
let detachedProbeConcurrentInstalls = 0;
let detachedProbeFailures = 0;
let detachedProbeConcurrentInstalled = false;
const linkSyncBeforeDetachedProbeFailure = fs.linkSync;
const lstatSyncBeforeDetachedProbeFailure = fs.lstatSync;
fs.linkSync = function interceptDetachedProbeConcurrentWinner(sourcePath, targetPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  if (/\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalizedSource)) {
    detachedProbeConcurrentInstalls += 1;
    fs.writeFileSync(detachedProbeFailurePagePath, detachedProbeConcurrentBytes);
    detachedProbeConcurrentInstalled = true;
  }
  return linkSyncBeforeDetachedProbeFailure.call(fs, sourcePath, targetPath);
};
fs.lstatSync = function interceptDetachedProbe(filePath, ...args) {
  const normalizedPath = String(filePath).replaceAll('\\', '/');
  if (
    detachedProbeConcurrentInstalled &&
    detachedProbeFailures === 0 &&
    /\/proc\/self\/fd\/\d+\/ownership-case\.html$/.test(normalizedPath)
  ) {
    detachedProbeFailures += 1;
    const error = new Error('injected anchored page probe failure');
    error.code = 'EACCES';
    throw error;
  }
  return lstatSyncBeforeDetachedProbeFailure.call(fs, filePath, ...args);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: detachedProbeFailureFixture.payloadDir,
      rootDir: detachedProbeFailureFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes('injected anchored page probe failure') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html'
      )
  );
} finally {
  fs.linkSync = linkSyncBeforeDetachedProbeFailure;
  fs.lstatSync = lstatSyncBeforeDetachedProbeFailure;
}
assert.equal(detachedProbeConcurrentInstalls, 1);
assert.equal(detachedProbeFailures, 1);
assert.deepEqual(
  fs.readFileSync(detachedProbeFailurePagePath),
  detachedProbeConcurrentBytes,
  'probe failure must clear planned attribution and preserve identical concurrent page bytes'
);
console.log('PASS failed detached-page probe cannot bless planned-identical concurrent bytes');

const forwardCleanupFailureFixture = ownershipFixture();
const forwardCleanupFailurePagePath = path.join(
  forwardCleanupFailureFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const forwardCleanupFailurePageBefore = fs.readFileSync(forwardCleanupFailurePagePath);
const [forwardCleanupFailurePlan] = planContentOwnershipUpdates(
  [forwardCleanupFailureFixture.payload],
  forwardCleanupFailureFixture.rootDir
);
const forwardCleanupFailurePlannedBytes = Buffer.from(forwardCleanupFailurePlan.html, 'utf8');
assert.notDeepEqual(
  forwardCleanupFailurePlannedBytes,
  forwardCleanupFailurePageBefore,
  'cleanup regression requires a real page replacement'
);
const unlinkSyncBeforeForwardCleanupFailure = fs.unlinkSync;
let forwardCleanupFailureInjected = false;
let forwardCleanupObservedInstalledBytes = null;
fs.unlinkSync = function interceptForwardCleanupUnlink(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  if (
    !forwardCleanupFailureInjected &&
    /\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalized)
  ) {
    forwardCleanupFailureInjected = true;
    forwardCleanupObservedInstalledBytes = fs.readFileSync(forwardCleanupFailurePagePath);
    assert.deepEqual(
      forwardCleanupObservedInstalledBytes,
      forwardCleanupFailurePlannedBytes,
      'planned page bytes must already be live before staged-link cleanup begins'
    );
    const error = new Error('injected forward staging cleanup failure');
    error.code = 'EACCES';
    throw error;
  }
  return unlinkSyncBeforeForwardCleanupFailure.call(fs, filePath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: forwardCleanupFailureFixture.payloadDir,
      rootDir: forwardCleanupFailureFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error?.code === 'EACCES' && error.message.includes('injected forward staging cleanup failure')
  );
} finally {
  fs.unlinkSync = unlinkSyncBeforeForwardCleanupFailure;
}
assert.equal(forwardCleanupFailureInjected, true, 'fixture must fail after the new page inode is installed');
assert.deepEqual(forwardCleanupObservedInstalledBytes, forwardCleanupFailurePlannedBytes);
assert.deepEqual(
  fs.readFileSync(forwardCleanupFailurePagePath),
  forwardCleanupFailurePageBefore,
  'a post-install cleanup failure must roll the registered page mutation back'
);
assert.equal(
  fs.existsSync(path.join(forwardCleanupFailureFixture.rootDir, PUBLISH_TRANSACTION_LOCK)),
  false,
  'post-install cleanup failure must release the transaction lock'
);
console.log('PASS post-install forward cleanup failures roll the page mutation back');

const forwardCleanupParentSwapFixture = ownershipFixture();
const forwardCleanupParentSwapWikiPath = path.join(
  forwardCleanupParentSwapFixture.rootDir,
  'wiki'
);
const forwardCleanupParentSwapMovedWikiPath = path.join(
  forwardCleanupParentSwapFixture.rootDir,
  'wiki-forward-installed-original'
);
const forwardCleanupParentSwapPagePath = path.join(
  forwardCleanupParentSwapWikiPath,
  'ownership-case.html'
);
const forwardCleanupParentSwapPageBefore = fs.readFileSync(
  forwardCleanupParentSwapPagePath
);
const forwardCleanupParentSwapSentinelPath = path.join(
  forwardCleanupParentSwapWikiPath,
  'replacement-owner.txt'
);
const forwardCleanupParentSwapSentinelBytes = Buffer.from(
  'POST-INSTALL REAL DIRECTORY REPLACEMENT MUST SURVIVE\n',
  'utf8'
);
const [forwardCleanupParentSwapPlan] = planContentOwnershipUpdates(
  [forwardCleanupParentSwapFixture.payload],
  forwardCleanupParentSwapFixture.rootDir
);
const forwardCleanupParentSwapPlannedBytes = Buffer.from(
  forwardCleanupParentSwapPlan.html,
  'utf8'
);
assert.notDeepEqual(
  forwardCleanupParentSwapPlannedBytes,
  forwardCleanupParentSwapPageBefore,
  'parent-swap regression requires planned bytes distinct from the snapshot'
);
let forwardCleanupParentSwapInjected = 0;
const unlinkSyncBeforeForwardCleanupParentSwap = fs.unlinkSync;
fs.unlinkSync = function interceptForwardCleanupParentSwap(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  if (
    forwardCleanupParentSwapInjected === 0 &&
    /\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalized)
  ) {
    forwardCleanupParentSwapInjected += 1;
    assert.deepEqual(
      fs.readFileSync(forwardCleanupParentSwapPagePath),
      forwardCleanupParentSwapPlannedBytes,
      'the planned page must be installed before the cleanup-time parent swap'
    );
    fs.renameSync(
      forwardCleanupParentSwapWikiPath,
      forwardCleanupParentSwapMovedWikiPath
    );
    fs.mkdirSync(forwardCleanupParentSwapWikiPath);
    fs.writeFileSync(
      forwardCleanupParentSwapPagePath,
      forwardCleanupParentSwapPlannedBytes
    );
    fs.writeFileSync(
      forwardCleanupParentSwapSentinelPath,
      forwardCleanupParentSwapSentinelBytes
    );
    const error = new Error('injected cleanup failure after installed-page parent swap');
    error.code = 'EACCES';
    throw error;
  }
  return unlinkSyncBeforeForwardCleanupParentSwap.call(fs, filePath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: forwardCleanupParentSwapFixture.payloadDir,
      rootDir: forwardCleanupParentSwapFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes('injected cleanup failure after installed-page parent swap') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html'
      )
  );
} finally {
  fs.unlinkSync = unlinkSyncBeforeForwardCleanupParentSwap;
}
assert.equal(
  forwardCleanupParentSwapInjected,
  1,
  'fixture must swap the real wiki parent exactly once after page install'
);
assert.deepEqual(
  fs.readFileSync(forwardCleanupParentSwapPagePath),
  forwardCleanupParentSwapPlannedBytes,
  'rollback must preserve planned-identical bytes owned by the replacement directory'
);
assert.deepEqual(
  fs.readFileSync(forwardCleanupParentSwapSentinelPath),
  forwardCleanupParentSwapSentinelBytes,
  'rollback must preserve the replacement directory sentinel'
);
console.log('PASS post-install parent swap cannot redirect page rollback into a replacement directory');

const forwardCleanupDeletionFixture = ownershipFixture();
const forwardCleanupDeletionPagePath = path.join(
  forwardCleanupDeletionFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const [forwardCleanupDeletionPlan] = planContentOwnershipUpdates(
  [forwardCleanupDeletionFixture.payload],
  forwardCleanupDeletionFixture.rootDir
);
const forwardCleanupDeletionPlannedBytes = Buffer.from(
  forwardCleanupDeletionPlan.html,
  'utf8'
);
let forwardCleanupDeletionInjected = 0;
const unlinkSyncBeforeForwardCleanupDeletion = fs.unlinkSync;
fs.unlinkSync = function interceptForwardCleanupDeletion(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  if (
    forwardCleanupDeletionInjected === 0 &&
    /\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalized)
  ) {
    forwardCleanupDeletionInjected += 1;
    assert.deepEqual(
      fs.readFileSync(forwardCleanupDeletionPagePath),
      forwardCleanupDeletionPlannedBytes,
      'the planned page must be installed before the cleanup-time deletion'
    );
    unlinkSyncBeforeForwardCleanupDeletion.call(fs, forwardCleanupDeletionPagePath);
    const error = new Error('injected cleanup failure after concurrent installed-page deletion');
    error.code = 'EACCES';
    throw error;
  }
  return unlinkSyncBeforeForwardCleanupDeletion.call(fs, filePath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: forwardCleanupDeletionFixture.payloadDir,
      rootDir: forwardCleanupDeletionFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'EACCES' &&
      error.cause.message.includes(
        'injected cleanup failure after concurrent installed-page deletion'
      ) &&
      error.rollbackConflicts.some(
        ({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html'
      )
  );
} finally {
  fs.unlinkSync = unlinkSyncBeforeForwardCleanupDeletion;
}
assert.equal(
  forwardCleanupDeletionInjected,
  1,
  'fixture must delete the installed page exactly once during cleanup'
);
assert.equal(
  fs.existsSync(forwardCleanupDeletionPagePath),
  false,
  'post-install recovery must not resurrect a page deleted by a concurrent writer'
);
console.log('PASS post-install concurrent page deletion remains absent and preserves cleanup failure');

const forwardPostimageRaceFixture = ownershipFixture();
const forwardPostimageRacePagePath = path.join(
  forwardPostimageRaceFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const forwardPostimageRaceBytes = Buffer.from(
  '<article class="wiki-content"><p>CONCURRENT CHANGE AFTER FORWARD INSTALL.</p></article>',
  'utf8'
);
const unlinkSyncBeforeForwardPostimageRace = fs.unlinkSync;
let forwardPostimageRaceInjected = false;
fs.unlinkSync = function interceptForwardPostimageCleanup(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  const result = unlinkSyncBeforeForwardPostimageRace.call(fs, filePath);
  if (
    !forwardPostimageRaceInjected &&
    /\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalized)
  ) {
    forwardPostimageRaceInjected = true;
    fs.writeFileSync(forwardPostimageRacePagePath, forwardPostimageRaceBytes);
  }
  return result;
};
try {
  assert.throws(
    () => runImport({
      payloadDir: forwardPostimageRaceFixture.payloadDir,
      rootDir: forwardPostimageRaceFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: () => {
        throw new Error('injected refresh failure after concurrent page edit');
      },
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT'
  );
} finally {
  fs.unlinkSync = unlinkSyncBeforeForwardPostimageRace;
}
assert.equal(forwardPostimageRaceInjected, true, 'fixture must edit the page after its forward install');
assert.deepEqual(
  fs.readFileSync(forwardPostimageRacePagePath),
  forwardPostimageRaceBytes,
  'post-install concurrent bytes must not be blessed as the transaction postimage or rolled back'
);
console.log('PASS forward page postimages remain exact across a post-install concurrent edit');

const syncArtifactCasFixture = ownershipFixture({
  automationPolicy: 'metadata-only',
  payload: {
    publish_mode: 'metadata_only',
    article_html: undefined,
  },
});
const syncArtifactWikiIndexPath = path.join(syncArtifactCasFixture.rootDir, 'js', 'wiki-index.json');
fs.mkdirSync(path.dirname(syncArtifactWikiIndexPath), { recursive: true });
fs.writeFileSync(syncArtifactWikiIndexPath, '[]\n', 'utf8');
const concurrentWikiIndexBytes = Buffer.from('[{"url":"/wiki/concurrent-editor.html"}]\n', 'utf8');
const renameSyncBeforeSyncArtifactCas = fs.renameSync;
let syncArtifactCasInjected = false;
fs.renameSync = function interceptWikiIndexDetach(sourcePath, destinationPath) {
  const normalizedDestination = String(destinationPath).replaceAll('\\', '/');
  if (
    !syncArtifactCasInjected &&
    path.basename(String(sourcePath)) === 'wiki-index.json' &&
    /\/\.wiki-index\.json\.publish-[^/]+\/detached$/.test(normalizedDestination)
  ) {
    syncArtifactCasInjected = true;
    fs.writeFileSync(syncArtifactWikiIndexPath, concurrentWikiIndexBytes);
  }
  return renameSyncBeforeSyncArtifactCas.call(fs, sourcePath, destinationPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: syncArtifactCasFixture.payloadDir,
      rootDir: syncArtifactCasFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT'
  );
} finally {
  fs.renameSync = renameSyncBeforeSyncArtifactCas;
}
assert.equal(syncArtifactCasInjected, true, 'fixture must edit wiki-index at its conditional commit');
assert.deepEqual(
  fs.readFileSync(syncArtifactWikiIndexPath),
  concurrentWikiIndexBytes,
  'conditional sync artifact commits must preserve last-moment concurrent bytes'
);
console.log('PASS sync artifact commits preserve a concurrent wiki-index edit');

const identicalSyncCasFixture = ownershipFixture({
  automationPolicy: 'metadata-only',
  payload: {
    publish_mode: 'metadata_only',
    article_html: undefined,
  },
});
const identicalSyncCasIndexPath = path.join(identicalSyncCasFixture.rootDir, 'js', 'wiki-index.json');
fs.mkdirSync(path.dirname(identicalSyncCasIndexPath), { recursive: true });
fs.writeFileSync(identicalSyncCasIndexPath, '[]\n', 'utf8');
let identicalSyncCasBytes = null;
let identicalSyncCasInjected = false;
const renameSyncBeforeIdenticalSyncCas = fs.renameSync;
fs.renameSync = function interceptIdenticalWikiIndexDetach(sourcePath, destinationPath) {
  const normalizedDestination = String(destinationPath).replaceAll('\\', '/');
  if (
    !identicalSyncCasInjected &&
    path.basename(String(sourcePath)) === 'wiki-index.json' &&
    /\/\.wiki-index\.json\.publish-[^/]+\/detached$/.test(normalizedDestination)
  ) {
    identicalSyncCasInjected = true;
    identicalSyncCasBytes = fs.readFileSync(path.join(path.dirname(String(destinationPath)), 'staged'));
    fs.writeFileSync(identicalSyncCasIndexPath, identicalSyncCasBytes);
  }
  return renameSyncBeforeIdenticalSyncCas.call(fs, sourcePath, destinationPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: identicalSyncCasFixture.payloadDir,
      rootDir: identicalSyncCasFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.code === 'STALE_CONTENT_STATE' &&
      error.rollbackConflicts.some(({ path: conflictPath }) => conflictPath === 'js/wiki-index.json')
  );
} finally {
  fs.renameSync = renameSyncBeforeIdenticalSyncCas;
}
assert.equal(identicalSyncCasInjected, true, 'fixture must install bytes identical to the staged artifact before CAS');
assert.deepEqual(
  fs.readFileSync(identicalSyncCasIndexPath),
  identicalSyncCasBytes,
  'an uncommitted intended postimage must not authorize rollback of identical concurrent bytes'
);
console.log('PASS failed artifact CAS cannot bless identical concurrent bytes as importer-owned');

const repeatedArtifactFixture = ownershipFixture();
const repeatedArtifactPagePath = path.join(
  repeatedArtifactFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const repeatedArtifactPageBefore = fs.readFileSync(repeatedArtifactPagePath);
const repeatedArtifactCategoryPath = path.join(
  repeatedArtifactFixture.rootDir,
  'categories',
  'lore.html'
);
const repeatedArtifactCategoryBefore = Buffer.from(`<!DOCTYPE html><html><body><main>
<div class="article-list"><a class="article-list-item" href="/wiki/ownership-case.html"><span>OLD CATEGORY ITEM</span></a></div>
</main></body></html>`, 'utf8');
fs.mkdirSync(path.dirname(repeatedArtifactCategoryPath), { recursive: true });
fs.writeFileSync(repeatedArtifactCategoryPath, repeatedArtifactCategoryBefore);
let repeatedArtifactStageAttempts = 0;
const mkdtempSyncBeforeRepeatedArtifact = fs.mkdtempSync;
fs.mkdtempSync = function interceptRepeatedCategoryStage(prefix, ...args) {
  const normalizedPrefix = String(prefix).replaceAll('\\', '/');
  if (/\/\.lore\.html\.publish-[^/]*$/.test(normalizedPrefix)) {
    repeatedArtifactStageAttempts += 1;
    if (repeatedArtifactStageAttempts === 2) {
      const error = new Error('injected failure before repeated category install');
      error.code = 'EACCES';
      throw error;
    }
  }
  return mkdtempSyncBeforeRepeatedArtifact.call(fs, prefix, ...args);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: repeatedArtifactFixture.payloadDir,
      rootDir: repeatedArtifactFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error?.code === 'EACCES' &&
      error.message.includes('injected failure before repeated category install')
  );
} finally {
  fs.mkdtempSync = mkdtempSyncBeforeRepeatedArtifact;
}
assert.equal(repeatedArtifactStageAttempts, 2, 'category cleanup and upsert must write the same artifact twice');
assert.deepEqual(
  fs.readFileSync(repeatedArtifactPagePath),
  repeatedArtifactPageBefore,
  'repeated artifact failure must roll the article write back'
);
assert.deepEqual(
  fs.readFileSync(repeatedArtifactCategoryPath),
  repeatedArtifactCategoryBefore,
  'a failed second write must retain the first writer journal so rollback restores the original artifact'
);
console.log('PASS failed repeated artifact write restores the prior committed journal postimage');

const registryCasRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-registry-cas-'));
const registryCasPayloadDir = path.join(registryCasRoot, 'website-publish-payloads');
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(registryCasRoot, '_article-template.html'));
fs.mkdirSync(registryCasPayloadDir, { recursive: true });
fs.copyFileSync(
  path.join(FIXTURE_DIR, 'sample-lore-page.json'),
  path.join(registryCasPayloadDir, 'sample-lore-page.json')
);
authorizePayloadDirectory(registryCasRoot, registryCasPayloadDir);
const registryCasPath = path.join(registryCasRoot, 'brand-canon', 'wiki-absent-stubs.json');
const concurrentRegistryBytes = Buffer.from(
  JSON.stringify({ schema_version: 1, absent_stub_slugs: ['concurrent-editor-stub'] }, null, 2) + '\n',
  'utf8'
);
const renameSyncBeforeRegistryCas = fs.renameSync;
let registryCasInjected = false;
fs.renameSync = function interceptRegistryDetach(sourcePath, destinationPath) {
  const normalizedDestination = String(destinationPath).replaceAll('\\', '/');
  if (
    !registryCasInjected &&
    path.basename(String(sourcePath)) === 'wiki-absent-stubs.json' &&
    /\/\.wiki-absent-stubs\.json\.publish-[^/]+\/detached$/.test(normalizedDestination)
  ) {
    registryCasInjected = true;
    fs.writeFileSync(registryCasPath, concurrentRegistryBytes);
  }
  return renameSyncBeforeRegistryCas.call(fs, sourcePath, destinationPath);
};
try {
  assert.throws(
    () => runImport({
      payloadDir: registryCasPayloadDir,
      rootDir: registryCasRoot,
      write: true,
      logger: () => {},
      refreshContentStateFn: refreshTestContentState,
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT'
  );
} finally {
  fs.renameSync = renameSyncBeforeRegistryCas;
}
assert.equal(registryCasInjected, true, 'fixture must edit the absent-stub registry at commit');
assert.deepEqual(
  fs.readFileSync(registryCasPath),
  concurrentRegistryBytes,
  'conditional registry commit must preserve last-moment concurrent bytes'
);
assert.equal(
  fs.existsSync(path.join(registryCasRoot, 'wiki', 'sample-lore-page.html')),
  false,
  'registry conflict must roll back the page created earlier in the transaction'
);
console.log('PASS absent-stub registry commits preserve concurrent bytes and roll back pages');

const symlinkFixture = ownershipFixture();
const symlinkPagePath = path.join(symlinkFixture.rootDir, 'wiki', 'ownership-case.html');
const symlinkVictimPath = `${symlinkFixture.rootDir}-outside-victim.html`;
const symlinkVictimHtml = fs.readFileSync(symlinkPagePath, 'utf8');
fs.writeFileSync(symlinkVictimPath, symlinkVictimHtml, 'utf8');
fs.unlinkSync(symlinkPagePath);
fs.symlinkSync(symlinkVictimPath, symlinkPagePath);
assert.throws(
  () => runImport({
    payloadDir: symlinkFixture.payloadDir,
    rootDir: symlinkFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
  }),
  (error) => error instanceof ContentOwnershipError && error.code === 'UNSAFE_PUBLISH_PATH'
);
assert.equal(fs.readFileSync(symlinkVictimPath, 'utf8'), symlinkVictimHtml, 'out-of-root symlink victim must not be modified');
assert.ok(fs.lstatSync(symlinkPagePath).isSymbolicLink(), 'rejected page symlink must remain untouched');
assert.equal(fs.existsSync(path.join(symlinkFixture.rootDir, PUBLISH_TRANSACTION_LOCK)), false);
console.log('PASS wiki output symlinks cannot escape the locked repository');

const parentSwapFixture = ownershipFixture();
const parentSwapWikiPath = path.join(parentSwapFixture.rootDir, 'wiki');
const parentSwapMovedWikiPath = path.join(parentSwapFixture.rootDir, 'wiki-real');
const parentSwapOutsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-parent-swap-outside-'));
const parentSwapVictimPath = path.join(parentSwapOutsideDir, 'ownership-case.html');
const parentSwapVictimBytes = Buffer.from('OUTSIDE VICTIM MUST NEVER CHANGE\n', 'utf8');
fs.writeFileSync(parentSwapVictimPath, parentSwapVictimBytes);
const openSyncBeforeParentSwap = fs.openSync;
let parentSwapTriggered = false;
fs.openSync = function interceptAnchoredPageTempOpen(filePath, ...args) {
  const normalized = String(filePath).replaceAll('\\', '/');
  if (
    !parentSwapTriggered &&
    /\/proc\/self\/fd\/\d+\/\.ownership-case\.html\.forward-[^/]+\/staged$/.test(normalized)
  ) {
    let anchoredParent = '';
    try {
      anchoredParent = fs.realpathSync.native(path.dirname(path.dirname(String(filePath))));
    } catch {
      // Ignore unrelated file descriptors.
    }
    if (path.resolve(anchoredParent) === path.resolve(parentSwapWikiPath)) {
      fs.renameSync(parentSwapWikiPath, parentSwapMovedWikiPath);
      fs.symlinkSync(parentSwapOutsideDir, parentSwapWikiPath, 'dir');
      parentSwapTriggered = true;
    }
  }
  return openSyncBeforeParentSwap.call(fs, filePath, ...args);
};
let parentSwapError = null;
try {
  runImport({
    payloadDir: parentSwapFixture.payloadDir,
    rootDir: parentSwapFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
  });
} catch (error) {
  parentSwapError = error;
} finally {
  fs.openSync = openSyncBeforeParentSwap;
  if (fs.lstatSync(parentSwapWikiPath).isSymbolicLink()) fs.unlinkSync(parentSwapWikiPath);
  if (fs.existsSync(parentSwapMovedWikiPath)) fs.renameSync(parentSwapMovedWikiPath, parentSwapWikiPath);
}
assert.equal(parentSwapTriggered, true, 'fixture must swap the validated wiki parent before temp open');
assert.ok(parentSwapError instanceof ContentOwnershipError);
assert.deepEqual(
  fs.readFileSync(parentSwapVictimPath),
  parentSwapVictimBytes,
  'dirfd-anchored page writes must never follow a swapped wiki parent to an outside victim'
);
console.log('PASS wiki page writes stay anchored across a parent-directory symlink swap');

const stagedRefreshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-staged-refresh-'));
const stagedRefreshScriptsDir = path.join(stagedRefreshRoot, 'scripts');
const stagedRefreshBrandDir = path.join(stagedRefreshRoot, 'brand-canon');
const stagedRefreshMovedBrandDir = path.join(stagedRefreshRoot, 'brand-canon-original');
const stagedRefreshOutsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-refresh-outside-'));
fs.mkdirSync(stagedRefreshScriptsDir, { recursive: true });
fs.mkdirSync(stagedRefreshBrandDir, { recursive: true });
const stagedRefreshManifestName = 'wiki-content-state.json';
const stagedRefreshReportName = 'wiki-rewrite-audit.md';
const stagedRefreshOutsideManifest = Buffer.from('OUTSIDE MANIFEST MUST NOT CHANGE\n', 'utf8');
const stagedRefreshOutsideReport = Buffer.from('OUTSIDE REPORT MUST NOT CHANGE\n', 'utf8');
fs.writeFileSync(
  path.join(stagedRefreshOutsideDir, stagedRefreshManifestName),
  stagedRefreshOutsideManifest
);
fs.writeFileSync(
  path.join(stagedRefreshOutsideDir, stagedRefreshReportName),
  stagedRefreshOutsideReport
);
fs.writeFileSync(
  path.join(stagedRefreshBrandDir, stagedRefreshManifestName),
  '{"schema_version":1,"pages":[]}\n',
  'utf8'
);
fs.writeFileSync(
  path.join(stagedRefreshBrandDir, stagedRefreshReportName),
  '# old report\n',
  'utf8'
);
fs.writeFileSync(
  path.join(stagedRefreshScriptsDir, 'generate-wiki-content-state.mjs'),
  `import fs from 'node:fs';
const optionIndex = process.argv.indexOf('--output-fd');
const outputFd = Number(process.argv[optionIndex + 1]);
const outputRoot = \`/proc/self/fd/\${outputFd}\`;
fs.writeFileSync(\`\${outputRoot}/${stagedRefreshManifestName}\`, '{"schema_version":1,"pages":[]}\\n', { flag: 'wx', mode: 0o600 });
fs.writeFileSync(\`\${outputRoot}/${stagedRefreshReportName}\`, '# staged report\\n', { flag: 'wx', mode: 0o600 });
console.log('staged refresh outputs');
`,
  'utf8'
);
let stagedRefreshSwapTriggered = false;
let stagedRefreshError = null;
const openSyncBeforeStagedRefreshSwap = fs.openSync;
fs.openSync = function interceptStagedRefreshRead(filePath, ...args) {
  const normalized = String(filePath).replaceAll('\\', '/');
  if (
    !stagedRefreshSwapTriggered &&
    path.basename(String(filePath)) === stagedRefreshManifestName &&
    /\/proc\/self\/fd\/\d+\/wiki-content-state\.json$/.test(normalized)
  ) {
    fs.renameSync(stagedRefreshBrandDir, stagedRefreshMovedBrandDir);
    fs.symlinkSync(stagedRefreshOutsideDir, stagedRefreshBrandDir, 'dir');
    stagedRefreshSwapTriggered = true;
  }
  return openSyncBeforeStagedRefreshSwap.call(fs, filePath, ...args);
};
try {
  refreshContentStateArtifacts(stagedRefreshRoot, () => {});
} catch (error) {
  stagedRefreshError = error;
} finally {
  fs.openSync = openSyncBeforeStagedRefreshSwap;
  if (fs.lstatSync(stagedRefreshBrandDir).isSymbolicLink()) fs.unlinkSync(stagedRefreshBrandDir);
  if (fs.existsSync(stagedRefreshMovedBrandDir)) {
    fs.renameSync(stagedRefreshMovedBrandDir, stagedRefreshBrandDir);
  }
}
assert.equal(stagedRefreshSwapTriggered, true, 'fixture must swap brand-canon after child staging');
assert.ok(
  stagedRefreshError instanceof ContentOwnershipError && stagedRefreshError.code === 'UNSAFE_PUBLISH_PATH',
  'the staged refresh must reject a swapped live artifact parent'
);
assert.deepEqual(
  fs.readFileSync(path.join(stagedRefreshOutsideDir, stagedRefreshManifestName)),
  stagedRefreshOutsideManifest,
  'staged refresh must never write the outside manifest through a swapped parent'
);
assert.deepEqual(
  fs.readFileSync(path.join(stagedRefreshOutsideDir, stagedRefreshReportName)),
  stagedRefreshOutsideReport,
  'staged refresh must never write the outside report through a swapped parent'
);
assert.equal(
  fs.readdirSync(stagedRefreshRoot).some((name) => name.startsWith('.wiki-content-state-refresh-')),
  false,
  'private refresh staging directories must be cleaned after a rejected commit'
);
console.log('PASS default refresh stages outputs before rejecting a swapped brand-canon parent');

const stagedFeedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-staged-feed-'));
const stagedFeedScriptsDir = path.join(stagedFeedRoot, 'scripts');
const stagedFeedOutsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-feed-outside-'));
const stagedFeedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-feed-stage-'));
fs.mkdirSync(stagedFeedScriptsDir, { recursive: true });
const stagedFeedOutsideIndex = path.join(stagedFeedOutsideDir, 'wiki-index.json');
const stagedFeedOutsideBytes = Buffer.from('OUTSIDE FEED MUST NOT CHANGE\n', 'utf8');
fs.writeFileSync(stagedFeedOutsideIndex, stagedFeedOutsideBytes);
fs.symlinkSync(stagedFeedOutsideDir, path.join(stagedFeedRoot, 'js'), 'dir');
const stagedFeedGenerator = path.join(stagedFeedScriptsDir, 'fake-generator.cjs');
fs.writeFileSync(
  stagedFeedGenerator,
  `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(process.env.TEST_WIKI_ROOT, 'js', 'wiki-index.json');
fs.writeFileSync(target, '[{"url":"/wiki/staged-child.html"}]\\n', 'utf8');
if (!fs.readFileSync(target, 'utf8').includes('staged-child')) process.exitCode = 9;
`,
  'utf8'
);
const stagedFeedDescriptor = fs.openSync(
  stagedFeedDirectory,
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | (fs.constants.O_NOFOLLOW || 0)
);
const stagedFeedResult = spawnSync(
  process.execPath,
  ['--require', path.join(ROOT, 'scripts', 'wiki-publish-staged-fs.cjs'), stagedFeedGenerator],
  {
    cwd: stagedFeedRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe', stagedFeedDescriptor],
    env: {
      ...process.env,
      TEST_WIKI_ROOT: stagedFeedRoot,
      WIKI_PUBLISH_ROOT: stagedFeedRoot,
      WIKI_PUBLISH_STAGE_FD: '3',
      WIKI_PUBLISH_STAGED_OUTPUTS: JSON.stringify(['js/wiki-index.json']),
    },
  }
);
fs.closeSync(stagedFeedDescriptor);
assert.equal(stagedFeedResult.status, 0, stagedFeedResult.stderr || 'staged feed child must succeed');
assert.deepEqual(
  fs.readFileSync(stagedFeedOutsideIndex),
  stagedFeedOutsideBytes,
  'real-root generator staging must not follow a live output-parent symlink'
);
assert.match(
  fs.readFileSync(path.join(stagedFeedDirectory, 'js', 'wiki-index.json'), 'utf8'),
  /staged-child/,
  'generator writes and dependent reads must resolve through the inherited staging view'
);
console.log('PASS real-root child generators write and read only their inherited staging view');

const artifactSymlinkFixture = ownershipFixture();
const artifactSymlinkPagePath = path.join(artifactSymlinkFixture.rootDir, 'wiki', 'ownership-case.html');
const artifactSymlinkPageBefore = fs.readFileSync(artifactSymlinkPagePath);
const artifactSymlinkPath = path.join(artifactSymlinkFixture.rootDir, 'js', 'wiki-index.json');
const artifactVictimPath = `${artifactSymlinkFixture.rootDir}-outside-index.json`;
fs.mkdirSync(path.dirname(artifactSymlinkPath), { recursive: true });
fs.writeFileSync(artifactVictimPath, '[]\n', 'utf8');
fs.symlinkSync(artifactVictimPath, artifactSymlinkPath);
assert.throws(
  () => runImport({
    payloadDir: artifactSymlinkFixture.payloadDir,
    rootDir: artifactSymlinkFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
  }),
  (error) => error instanceof ContentOwnershipError && error.code === 'UNSAFE_PUBLISH_PATH'
);
assert.equal(fs.readFileSync(artifactVictimPath, 'utf8'), '[]\n', 'out-of-root snapshot victim must not be modified');
assert.deepEqual(fs.readFileSync(artifactSymlinkPagePath), artifactSymlinkPageBefore, 'snapshot rejection must occur before page writes');
assert.ok(fs.lstatSync(artifactSymlinkPath).isSymbolicLink(), 'rejected artifact symlink must remain untouched');
assert.equal(fs.existsSync(path.join(artifactSymlinkFixture.rootDir, PUBLISH_TRANSACTION_LOCK)), false);
console.log('PASS transaction artifact snapshots reject symlinks before mutation');

for (const discoveryTargetType of ['symlink', 'directory']) {
  const discoveryFixture = ownershipFixture({
    automationPolicy: 'metadata-only',
    payload: {
      publish_mode: 'metadata_only',
      article_html: undefined,
    },
  });
  const unsafeWikiPath = path.join(discoveryFixture.rootDir, 'wiki', `unsafe-${discoveryTargetType}.html`);
  let outsideDiscoveryPath = null;
  if (discoveryTargetType === 'symlink') {
    outsideDiscoveryPath = `${discoveryFixture.rootDir}-outside-discovery.html`;
    fs.writeFileSync(
      outsideDiscoveryPath,
      '<html><head><title>OUTSIDE DISCOVERY CONTENT</title></head><body><article>secret</article></body></html>',
      'utf8'
    );
    fs.symlinkSync(outsideDiscoveryPath, unsafeWikiPath);
  } else {
    fs.mkdirSync(unsafeWikiPath);
  }

  assert.throws(
    () => runImport({
      payloadDir: discoveryFixture.payloadDir,
      rootDir: discoveryFixture.rootDir,
      write: true,
      logger: () => {},
    }),
    (error) => error instanceof ContentOwnershipError && error.code === 'UNSAFE_PUBLISH_PATH'
  );
  if (outsideDiscoveryPath) {
    assert.equal(
      fs.readFileSync(outsideDiscoveryPath, 'utf8'),
      '<html><head><title>OUTSIDE DISCOVERY CONTENT</title></head><body><article>secret</article></body></html>',
      'portable discovery must not follow an out-of-root wiki symlink'
    );
    assert.ok(fs.lstatSync(unsafeWikiPath).isSymbolicLink());
  } else {
    assert.ok(fs.lstatSync(unsafeWikiPath).isDirectory());
  }
  assert.equal(fs.existsSync(path.join(discoveryFixture.rootDir, PUBLISH_TRANSACTION_LOCK)), false);
}
console.log('PASS portable wiki discovery rejects symlinked and non-regular HTML entries');

for (const exclusionCase of [
  {
    label: 'root stub marker without noindex',
    slug: 'metadata-root-stub-only',
    html: '<!DOCTYPE html><html><head><meta name="robots" content="index, follow"><title>Root stub only</title></head><body data-wiki-stub="true"><main><article class="wiki-content"><p>ROOT STUB ONLY.</p></article></main></body></html>',
    verifyRollback: true,
  },
  {
    label: 'noindex without root stub marker',
    slug: 'metadata-noindex-only',
    html: '<!DOCTYPE html><html><head><meta name="robots" content="noindex, follow"><title>Noindex only</title></head><body><main><article class="wiki-content"><p>NOINDEX ONLY.</p></article></main></body></html>',
    verifyRollback: false,
  },
]) {
  const fixture = ownershipFixture({
    slug: exclusionCase.slug,
    html: exclusionCase.html,
    automationPolicy: 'metadata-only',
    payload: {
      publish_mode: 'metadata_only',
      article_html: undefined,
      category: 'New Category',
    },
  });
  const excludedUrl = `/wiki/${exclusionCase.slug}.html`;
  writeJson(path.join(fixture.rootDir, 'js', 'wiki-index.json'), [{
    title: `STALE ${exclusionCase.label}`,
    url: excludedUrl,
    category: 'old-category',
    rank_score: 999,
  }]);
  const oldCategoryPath = path.join(fixture.rootDir, 'categories', 'old-category.html');
  const oldCategoryBefore = `<main><div class="article-list"><a class="article-list-item" href="${excludedUrl}">STALE OLD-CATEGORY LINK</a></div></main>`;
  fs.mkdirSync(path.dirname(oldCategoryPath), { recursive: true });
  fs.writeFileSync(oldCategoryPath, oldCategoryBefore, 'utf8');

  if (exclusionCase.verifyRollback) {
    assert.throws(
      () => runImport({
        payloadDir: fixture.payloadDir,
        rootDir: fixture.rootDir,
        write: true,
        logger: () => {},
        syncFeedSurfacesFn: (...args) => {
          syncFeedSurfaces(...args);
          throw new FeedSyncError('category', 'injected failure after global category cleanup');
        },
      }),
      (error) => error instanceof FeedSyncError &&
        error.message.includes('injected failure after global category cleanup')
    );
    assert.equal(
      fs.readFileSync(oldCategoryPath, 'utf8'),
      oldCategoryBefore,
      'transaction rollback must restore every existing category changed by global exclusion cleanup'
    );
  }

  runImport({
    payloadDir: fixture.payloadDir,
    rootDir: fixture.rootDir,
    write: true,
    logger: () => {},
  });
  assert.ok(
    !JSON.parse(fs.readFileSync(path.join(fixture.rootDir, 'js', 'wiki-index.json'), 'utf8'))
      .some(({ url }) => url === excludedUrl),
    `${exclusionCase.label} must stay out of the portable search index`
  );
  assert.ok(
    !fs.readFileSync(path.join(fixture.rootDir, 'sitemap.xml'), 'utf8').includes(excludedUrl),
    `${exclusionCase.label} must stay out of the portable sitemap`
  );
  assert.ok(
    !fs.readFileSync(oldCategoryPath, 'utf8').includes(excludedUrl),
    `${exclusionCase.label} must be removed from an old category outside the payload category`
  );
}
console.log('PASS metadata-only root-stub/noindex exclusions clean every category and roll back atomically');

const categoryMoveFixture = ownershipFixture({
  slug: 'metadata-category-move',
  html: '<!DOCTYPE html><html><head><meta name="robots" content="index, follow"><title>Category move</title></head><body><main><article class="wiki-content"><a href="/categories/old-category.html">Old category</a><p>NORMAL INDEXABLE PAGE.</p></article></main></body></html>',
  automationPolicy: 'metadata-only',
  payload: {
    publish_mode: 'metadata_only',
    article_html: undefined,
    category: 'New Category',
  },
});
const categoryMoveUrl = '/wiki/metadata-category-move.html';
writeJson(path.join(categoryMoveFixture.rootDir, 'js', 'wiki-index.json'), [{
  title: 'STALE OLD-CATEGORY INDEX ENTRY',
  url: categoryMoveUrl,
  category: 'old-category',
  rank_score: 999,
}]);
const movedFromCategoryPath = path.join(categoryMoveFixture.rootDir, 'categories', 'old-category.html');
fs.mkdirSync(path.dirname(movedFromCategoryPath), { recursive: true });
fs.writeFileSync(
  movedFromCategoryPath,
  `<main><div class="article-list"><a class="article-list-item" href="${categoryMoveUrl}">STALE OLD-CATEGORY LINK</a></div></main>`,
  'utf8'
);
runImport({
  payloadDir: categoryMoveFixture.payloadDir,
  rootDir: categoryMoveFixture.rootDir,
  write: true,
  logger: () => {},
});
assert.ok(
  !fs.readFileSync(movedFromCategoryPath, 'utf8').includes(categoryMoveUrl),
  'a normal metadata-only category move must remove the incoming URL from its old category'
);
assert.ok(
  fs.readFileSync(path.join(categoryMoveFixture.rootDir, 'categories', 'new-category.html'), 'utf8')
    .includes(categoryMoveUrl),
  'a normal metadata-only category move must re-add the incoming URL to its current category'
);
assert.equal(
  JSON.parse(fs.readFileSync(path.join(categoryMoveFixture.rootDir, 'js', 'wiki-index.json'), 'utf8'))
    .find(({ url }) => url === categoryMoveUrl)?.category,
  'new-category',
  'payload metadata must replace the discovered page\'s stale category'
);
console.log('PASS metadata-only category moves remove stale old-category links before current-category upsert');

const hintRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-hints-'));
const hintPayloadDir = path.join(hintRoot, 'website-publish-payloads');
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(hintRoot, '_article-template.html'));
const hintPagePath = path.join(hintRoot, 'wiki', 'sample-lore-page.html');
fs.mkdirSync(path.dirname(hintPagePath), { recursive: true });
fs.writeFileSync(hintPagePath, '<article class="wiki-content"><p>MANUAL HINT PAGE TEXT MUST SURVIVE.</p><!-- RELATED_WIKI_PATHS:BEGIN --><p>old generated links</p><!-- RELATED_WIKI_PATHS:END --></article>', 'utf8');
writeJson(path.join(hintPayloadDir, 'sample-lore-page.json'), {
  ...lorePayload,
  publish_mode: 'metadata_only',
  article_html: undefined,
  relationship_hints: {
    project_hubs: [
      { url: '/wiki/crypto-moonboys.html.html', name: 'Crypto Moonboys', relationship: 'core hub' },
      { url: 'https://example.com/external', name: 'External ignored' },
    ],
    collections: [{ slug: 'gkniftyheads-nft-collection', name: 'GKniftyHEADS NFT Collection' }],
    categories: [{ slug: 'nfts', name: 'NFTs' }],
  },
});
authorizePayloadDirectory(hintRoot, hintPayloadDir, {
  policies: { 'sample-lore-page': 'metadata-only' },
});

runImport({
  payloadDir: hintPayloadDir,
  rootDir: hintRoot,
  write: true,
  logger: () => {},
  refreshContentStateFn: refreshTestContentState,
});

const persistedHints = JSON.parse(fs.readFileSync(path.join(hintRoot, 'js', 'wiki-relationship-hints.json'), 'utf8'));
assert.ok(persistedHints['/wiki/sample-lore-page.html'], 'relationship hints must be persisted by URL');
assert.equal(persistedHints['/wiki/sample-lore-page.html'].relationship_hints.project_hubs[0].url, '/wiki/crypto-moonboys.html');
assert.ok(!JSON.stringify(persistedHints).includes('https://example.com/external'), 'external relationship hint URLs must not persist');
assert.ok(!JSON.stringify(persistedHints).includes('.html.html'), 'persisted relationship hints must not contain .html.html URLs');
const hintRenderedHtml = fs.readFileSync(hintPagePath, 'utf8');
assert.ok(hintRenderedHtml.includes('MANUAL HINT PAGE TEXT MUST SURVIVE.'), 'relationship hint update must not overwrite manual content');
assert.ok(hintRenderedHtml.includes('old generated links'), 'metadata-only relationship update must not render or rewrite article HTML');
assert.deepEqual(Object.keys(sanitizeRelationshipHints({ bad: [{ url: '/wiki/nope.html' }] })), [], 'unknown hint groups are ignored by sanitizer');
console.log('PASS relationship_hints persist without overwriting manual content');

const manualRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-manual-'));
const manualPayloadDir = path.join(manualRoot, 'website-publish-payloads');
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(manualRoot, '_article-template.html'));
writeJson(path.join(manualPayloadDir, 'sample-lore-page.json'), lorePayload);
const manualPagePath = path.join(manualRoot, 'wiki', 'sample-lore-page.html');
fs.mkdirSync(path.dirname(manualPagePath), { recursive: true });
fs.writeFileSync(manualPagePath, `<!DOCTYPE html><html><body><main id="content"><article class="wiki-content">
<h1>Manual owner truth</h1>
<p>MANUAL OWNER TEXT MUST SURVIVE.</p>
<!-- RELATED_WIKI_PATHS:BEGIN --><section>Generated links can move.</section><!-- RELATED_WIKI_PATHS:END -->
<div id="bible-content"></div>
</article><div class="wiki-comments" data-page-id="sample-lore-page"></div></main></body></html>`, 'utf8');
authorizePayloadDirectory(manualRoot, manualPayloadDir, {
  policies: { 'sample-lore-page': 'replace-sam-block' },
  legacy: { 'sample-lore-page': true },
});

assert.throws(
  () => runImport({
    payloadDir: manualPayloadDir,
    rootDir: manualRoot,
    write: true,
    logger: () => {},
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'LEGACY_UNMARKED_CONTENT_REVIEW_REQUIRED'
);
assert.equal(
  fs.readFileSync(manualPagePath, 'utf8').includes(SAM_CONTENT_BEGIN),
  false,
  'legacy unmarked content must not receive an appended SAM block'
);
console.log('PASS legacy unmarked article is routed to review instead of automated append');

function assertOwnershipRejects(fixture, code) {
  assert.throws(
    () => runImport({
      payloadDir: fixture.payloadDir,
      rootDir: fixture.rootDir,
      write: false,
      logger: () => {},
    }),
    (error) => error instanceof ContentOwnershipError && error.code === code,
    `expected content ownership rejection ${code}`
  );
}

const missingManifestFixture = ownershipFixture();
fs.unlinkSync(path.join(missingManifestFixture.rootDir, 'brand-canon', 'wiki-content-state.json'));
assertOwnershipRejects(missingManifestFixture, 'MISSING_CONTENT_STATE_MANIFEST');

const missingStateFixture = ownershipFixture();
writeJson(path.join(missingStateFixture.rootDir, 'brand-canon', 'wiki-content-state.json'), {
  schema_version: 1,
  pages: [],
});
assertOwnershipRejects(missingStateFixture, 'MISSING_CONTENT_STATE_ENTRY');

function mutateContentStatePage(fixture, mutate) {
  const manifestPath = path.join(fixture.rootDir, 'brand-canon', 'wiki-content-state.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  mutate(manifest.pages[0]);
  writeJson(manifestPath, manifest);
}

for (const invalidPageExists of [undefined, 'true']) {
  const fixture = ownershipFixture();
  mutateContentStatePage(fixture, (page) => {
    if (invalidPageExists === undefined) delete page.page_exists;
    else page.page_exists = invalidPageExists;
  });
  assertOwnershipRejects(fixture, 'INVALID_CONTENT_STATE_ENTRY');
}

for (const field of ['content_hash', 'article_content_hash', 'article_markup_hash', 'git_blob_oid']) {
  const fixture = ownershipFixture({
    html: null,
    pageExists: false,
    automationPolicy: 'stub-allowed',
    payload: { stub: true, expected_content_hash: null },
  });
  mutateContentStatePage(fixture, (page) => {
    page[field] = field === 'git_blob_oid'
      ? '0'.repeat(40)
      : `sha256:${'0'.repeat(64)}`;
  });
  assertOwnershipRejects(fixture, 'INVALID_CONTENT_STATE_ENTRY');
}

for (const [field, value, code] of [
  ['article_content_hash', null, 'INVALID_CONTENT_STATE_HASH'],
  ['article_markup_hash', null, 'INVALID_CONTENT_STATE_HASH'],
  ['git_blob_oid', null, 'INVALID_CONTENT_STATE_ENTRY'],
]) {
  const fixture = ownershipFixture();
  mutateContentStatePage(fixture, (page) => { page[field] = value; });
  assertOwnershipRejects(fixture, code);
}
console.log('PASS content-state entries require explicit existence and coherent identities');

for (const invalidSlugs of [
  ['authorized-stub', 'authorized-stub'],
  ['authorized-stub', '../unsafe'],
  ['authorized-stub', 42],
]) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-stub-registry-'));
  writeJson(path.join(rootDir, 'brand-canon', 'wiki-absent-stubs.json'), {
    schema_version: 1,
    absent_stub_slugs: invalidSlugs,
  });
  assert.throws(
    () => consumeAbsentStubAuthorizations(rootDir, [{
      state: { page_exists: false },
      payload: { slug: 'authorized-stub' },
    }]),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'ABSENT_STUB_AUTHORIZATION_INVALID'
  );
}
console.log('PASS absent-stub authorization registry rejects invalid or duplicate slugs');

const duplicatePlanFixture = ownershipFixture();
assert.throws(
  () => planContentOwnershipUpdates(
    [duplicatePlanFixture.payload, { ...duplicatePlanFixture.payload }],
    duplicatePlanFixture.rootDir
  ),
  (error) => error instanceof ContentOwnershipError && error.code === 'DUPLICATE_PAYLOAD_SLUG'
);
assert.throws(
  () => planContentOwnershipUpdates([{
    ...duplicatePlanFixture.payload,
    article_html: '<p DATA-WIKI-STUB="true">Injected policy marker.</p>',
  }], duplicatePlanFixture.rootDir),
  (error) => error instanceof PayloadValidationError &&
    error.failures.some((failure) => failure.includes('data-wiki-stub attribute'))
);
console.log('PASS prose writes require repository content-state, never bot memory');

for (const automationPolicy of ['metadata-only', 'canon-locked']) {
  assertOwnershipRejects(
    ownershipFixture({ automationPolicy }),
    'ARTICLE_WRITE_FORBIDDEN'
  );
}
console.log('PASS metadata-only and canon-locked policies reject prose writes');

assertOwnershipRejects(
  ownershipFixture({
    html: `<article class="wiki-content">${MANUAL_CONTENT_BEGIN}\n<p>Manual only.</p>\n${MANUAL_CONTENT_END}</article>`,
  }),
  'SAM_BLOCK_REQUIRED_FOR_REPLACEMENT'
);
console.log('PASS replace-sam-block cannot append a first SAM block');

assertOwnershipRejects(
  ownershipFixture({ payload: { stub: true } }),
  'STUB_POLICY_ESCALATION'
);
assertOwnershipRejects(
  ownershipFixture({
    html: `<body data-wiki-stub="true"><article>${SAM_CONTENT_BEGIN}<p>old</p>${SAM_CONTENT_END}</article></body>`,
  }),
  'STUB_POLICY_ESCALATION'
);
console.log('PASS replace-sam-block cannot escalate itself into stub ownership');

const staleExpectedFixture = ownershipFixture({
  payload: { expected_content_hash: `sha256:${'0'.repeat(64)}` },
});
assertOwnershipRejects(staleExpectedFixture, 'STALE_EXPECTED_CONTENT_HASH');

const missingExpectedFixture = ownershipFixture({
  payload: { expected_content_hash: undefined },
});
assertOwnershipRejects(missingExpectedFixture, 'MISSING_EXPECTED_CONTENT_HASH');

const staleManifestFixture = ownershipFixture({
  manifestHash: `sha256:${'1'.repeat(64)}`,
});
assertOwnershipRejects(staleManifestFixture, 'STALE_CONTENT_STATE');

const mismatchedProposedHashFixture = ownershipFixture({
  payload: { content_hash: `sha256:${'2'.repeat(64)}` },
});
assertOwnershipRejects(mismatchedProposedHashFixture, 'PROPOSED_CONTENT_HASH_MISMATCH');
console.log('PASS stale payload and stale manifest revisions are rejected');

const sameHashFixture = ownershipFixture({
  html: `<article class="wiki-content">${SAM_CONTENT_BEGIN}\n${lorePayload.article_html.trim()}\n${SAM_CONTENT_END}</article>`,
});
const sameHashResult = runImport({
  payloadDir: sameHashFixture.payloadDir,
  rootDir: sameHashFixture.rootDir,
  write: false,
  logger: () => {},
});
assert.deepEqual(sameHashResult.ownershipActions, [{
  action: 'no-op',
  reason: 'same-sam-content-hash',
  path: 'wiki/ownership-case.html',
}]);
console.log('PASS same SAM content hash is a no-op');

const staleSameHashFixture = ownershipFixture({
  html: `<article class="wiki-content">${SAM_CONTENT_BEGIN}\n${lorePayload.article_html.trim()}\n${SAM_CONTENT_END}</article>`,
  payload: {
    expected_content_hash: `sha256:${'0'.repeat(64)}`,
    relationship_hints: { lore: [{ url: '/wiki/stale-target.html', name: 'STALE HINT' }] },
  },
});
const staleHintsPath = path.join(staleSameHashFixture.rootDir, 'js', 'wiki-relationship-hints.json');
writeJson(staleHintsPath, { sentinel: 'must remain byte-for-byte unchanged' });
const staleHintsBefore = fs.readFileSync(staleHintsPath);
let staleNoOpSyncCalls = 0;
const staleSameHashResult = runImport({
  payloadDir: staleSameHashFixture.payloadDir,
  rootDir: staleSameHashFixture.rootDir,
  write: true,
  logger: () => {},
  syncFeedSurfacesFn: () => {
    staleNoOpSyncCalls += 1;
    throw new Error('same-SAM no-op must not reach feed sync');
  },
});
assert.equal(staleSameHashResult.ownershipActions[0].action, 'no-op');
assert.equal(staleSameHashResult.sync, null);
assert.equal(staleNoOpSyncCalls, 0);
assert.deepEqual(fs.readFileSync(staleHintsPath), staleHintsBefore);
console.log('PASS stale same-SAM replay is side-effect-free while remaining idempotent');

const racedNoOpFixture = ownershipFixture({
  html: `<article class="wiki-content">${SAM_CONTENT_BEGIN}\n${lorePayload.article_html.trim()}\n${SAM_CONTENT_END}</article>`,
});
const racedNoOpPath = path.join(racedNoOpFixture.rootDir, 'wiki', 'ownership-case.html');
const racedNoOpReplacement = '<article><p>CONCURRENT NO-OP RESET.</p></article>';
let racedNoOpMutated = false;
assert.throws(
  () => runImport({
    payloadDir: racedNoOpFixture.payloadDir,
    rootDir: racedNoOpFixture.rootDir,
    write: true,
    logger: (line) => {
      if (!racedNoOpMutated && line.includes('Intended page path:')) {
        racedNoOpMutated = true;
        fs.writeFileSync(racedNoOpPath, racedNoOpReplacement, 'utf8');
      }
    },
  }),
  (error) => error instanceof ContentOwnershipError && error.code === 'STALE_CONTENT_STATE'
);
assert.equal(fs.readFileSync(racedNoOpPath, 'utf8'), racedNoOpReplacement);
console.log('PASS no-op retries still perform the final live-base race check');

assertOwnershipRejects(
  ownershipFixture({
    html: `<article class="wiki-content">${SAM_CONTENT_BEGIN}<p>one</p>${SAM_CONTENT_END}${SAM_CONTENT_BEGIN}<p>two</p>${SAM_CONTENT_END}</article>`,
  }),
  'MULTIPLE_SAM_BLOCKS'
);
assertOwnershipRejects(
  ownershipFixture({
    html: `<article class="wiki-content">${CANONICAL_CONTENT_BEGIN}<p>one</p>${CANONICAL_CONTENT_END}${CANONICAL_CONTENT_BEGIN}<p>two</p>${CANONICAL_CONTENT_END}${SAM_CONTENT_BEGIN}<p>old</p>${SAM_CONTENT_END}</article>`,
  }),
  'MULTIPLE_CANONICAL_BLOCKS'
);
assertOwnershipRejects(
  ownershipFixture({
    html: '<article data-canonical-content="true"><p>Attribute-owned canon.</p></article>',
  }),
  'CANONICAL_BLOCK_NOT_MARKER_OWNED'
);
assertOwnershipRejects(
  ownershipFixture({
    html: '<article><section data-canonical-content="true">one</section><section data-canonical-content="true">two</section></article>',
  }),
  'MULTIPLE_CANONICAL_BLOCKS'
);
console.log('PASS multiple SAM or canonical blocks are invalid');

assertOwnershipRejects(
  ownershipFixture({
    html: `${SAM_CONTENT_BEGIN}<article class="wiki-content"><p>Outside owner.</p></article>${SAM_CONTENT_END}`,
  }),
  'INVALID_CONTENT_TOPOLOGY'
);
assertOwnershipRejects(
  ownershipFixture({
    html: `<article class="wiki-content">${MANUAL_CONTENT_BEGIN}${SAM_CONTENT_BEGIN}<p>Overlap.</p>${MANUAL_CONTENT_END}${SAM_CONTENT_END}</article>`,
  }),
  'INVALID_CONTENT_TOPOLOGY'
);
assertOwnershipRejects(
  ownershipFixture({
    html: `<div class="wiki-content">${SAM_CONTENT_BEGIN}<article><p>Wrapped article.</p></article>${SAM_CONTENT_END}</div>`,
  }),
  'INVALID_CONTENT_TOPOLOGY'
);
for (const parserOnlyOwnershipRoot of [
  '<template shadowrootmode="open"><article class="wiki-content">' +
    `${SAM_CONTENT_BEGIN}<p>Shadow-only owner.</p>${SAM_CONTENT_END}</article></template>`,
  '<svg><article>' +
    `${SAM_CONTENT_BEGIN}<text>Foreign-only owner.</text>${SAM_CONTENT_END}</article></svg>`,
  '<p class="wiki-content">' +
    `${SAM_CONTENT_BEGIN}<div>Outside the browser p root.</div>${SAM_CONTENT_END}</p>`,
  '<frameset><article>' +
    `${SAM_CONTENT_BEGIN}<span>Ignored frameset owner.</span>${SAM_CONTENT_END}</article></frameset>`,
  '<table><article class="wiki-content">' +
    `${SAM_CONTENT_BEGIN}<span>Foster-parented owner.</span>${SAM_CONTENT_END}</article></table>`,
  '<table><tbody><tr><div class="wiki-content">' +
    `${SAM_CONTENT_BEGIN}<span>Row-mode foster parent.</span>${SAM_CONTENT_END}</div></tr></tbody></table>`,
  '<table><tbody><tr><td><article class="wiki-content">' +
    `${SAM_CONTENT_BEGIN}<span>Cell-scoped owner.</span>${SAM_CONTENT_END}</article></td></tr></tbody></table>`,
  '<table><caption><article class="wiki-content">' +
    `${SAM_CONTENT_BEGIN}<span>Caption-scoped owner.</span>${SAM_CONTENT_END}</article></caption></table>`,
  '<article class="wiki-content"><script><!--<script></script>' +
    `${SAM_CONTENT_BEGIN}<p>Still double-escaped script data.</p>${SAM_CONTENT_END}` +
    '</article></script>',
]) {
  assertOwnershipRejects(
    ownershipFixture({ html: parserOnlyOwnershipRoot }),
    'INVALID_CONTENT_TOPOLOGY'
  );
}
console.log('PASS ownership blocks stay inside one canonical root and never overlap or wrap articles');

assertOwnershipRejects(
  ownershipFixture({ slug: 'first-witness-origin' }),
  'FIRST_WITNESS_PROSE_LOCKED'
);
console.log('PASS First Witness prose remains hard-locked even under replace policy');

const redirectStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/wiki/real-page.html"></head><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assertOwnershipRejects(redirectStubFixture, 'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE');

for (const redirectControl of [
  '<script>window.location="/wiki/real-page.html"</script>',
  '<script>location.assign("/wiki/real-page.html")</script>',
  '<script>window["loc" + "ation"]="/wiki/real-page.html"</script>',
  '<script>window/* parser bypass */.location="/wiki/real-page.html"</script>',
  '<script>window["locat\\u0069on"]="/wiki/real-page.html"</script>',
  '<select><script>window["loc" + "ation"]="/wiki/real-page.html"</script></select>',
  '<script src="data:text/javascript,top.location=\'/wiki/real-page.html\'"></script>',
  '<script src="https://evil.example/redirect.js"></script>',
  '<script>0</script/><meta http-equiv=refresh content="0;url=/wiki/real-page.html">',
  '<!doctype "><meta http-equiv=refresh content="0;url=/wiki/real-page.html">',
  '<meta/http-equiv=refresh content="0;url=/wiki/real-page.html">',
  '<meta title=" http-equiv=no" http-equiv=refresh content="0;url=/wiki/real-page.html">',
]) {
  assertOwnershipRejects(
    ownershipFixture({
      html: `<!DOCTYPE html><html><head>${redirectControl}</head><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></html>`,
      automationPolicy: 'stub-allowed',
      payload: { stub: true },
    }),
    'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE'
  );
}

assertOwnershipRejects(
  ownershipFixture({
    html: '<!DOCTYPE html><html><body data-wiki-stub="true"><article data-wiki-stub="true"></article>' +
      '<select><textarea></textarea><meta http-equiv=refresh content="0;url=/wiki/real-page.html"></select>' +
      '</body></html>',
    automationPolicy: 'stub-allowed',
    payload: { stub: true },
  }),
  'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE'
);
assertOwnershipRejects(
  ownershipFixture({
    html: '<!DOCTYPE html><html><body data-wiki-stub="true"><article data-wiki-stub="true"></article>' +
      '<img src=x onerror="top[\'location\'][\'href\']=\'/wiki/real-page.html\'">' +
      '</body></html>',
    automationPolicy: 'stub-allowed',
    payload: { stub: true },
  }),
  'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE'
);

for (const executableParserControl of [
  '<svg><template><foreignObject><img src=x onerror="location.href=\'/wiki/protected.html\'"></foreignObject></template></svg>',
  '<svg><title><foreignObject><img src=x onerror="location.href=\'/wiki/protected.html\'"></foreignObject></title></svg>',
  '<div><template shadowrootmode="open"><img src=x onerror="location.href=\'/wiki/protected.html\'"></template></div>',
]) {
  assertOwnershipRejects(
    ownershipFixture({
      html: '<!DOCTYPE html><html><head></head><body data-wiki-stub="true">' +
        '<article class="wiki-content" data-wiki-stub="true"></article>' +
        `${executableParserControl}</body></html>`,
      automationPolicy: 'stub-allowed',
      payload: { stub: true },
    }),
    'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE'
  );
}

const framesetBodySpoofFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head></head><frameset>' +
    '<frame src="/wiki/protected.html"><body data-wiki-stub="true"></body>' +
    '</frameset></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assertOwnershipRejects(framesetBodySpoofFixture, 'REAL_PAGE_BLOCKS_STUB_WRITE');

const nonExecutableScriptStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head></head><body data-wiki-stub="true"><article class="wiki-content" data-wiki-stub="true"></article><template><img src=x onerror="location.href=\'/wiki/inert.html\'"></template><script src="/js/site-shell.js"></script><script type="application/ld+json">{"location":"/wiki/descriptive-only.html"}</script></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assert.doesNotThrow(() => planContentOwnershipUpdates(
  [nonExecutableScriptStubFixture.payload],
  nonExecutableScriptStubFixture.rootDir
));

const aliasStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head><link rel="canonical" href="/wiki/real-page.html"></head><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
fs.mkdirSync(path.join(aliasStubFixture.rootDir, 'wiki'), { recursive: true });
fs.writeFileSync(path.join(aliasStubFixture.rootDir, 'wiki', 'real-page.html'), '<article><p>Real page.</p></article>', 'utf8');
assertOwnershipRejects(aliasStubFixture, 'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE');

const missingAliasStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head><link rel=canonical href=/wiki/not-created.html></head><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assertOwnershipRejects(missingAliasStubFixture, 'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE');

const externalSameSlugAliasFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head><link rel=canonical href="https://evil.example/wiki/ownership-case.html"></head><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assertOwnershipRejects(externalSameSlugAliasFixture, 'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE');

const conditionalRedirectStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head><noscript><meta http-equiv=refresh content="0;url=/wiki/real-page.html"></noscript></head><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assertOwnershipRejects(conditionalRedirectStubFixture, 'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE');

const baseControlStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><head><base href="https://evil.example/"></head><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assertOwnershipRejects(baseControlStubFixture, 'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE');

const longStubFixture = ownershipFixture({
  html: null,
  automationPolicy: 'stub-allowed',
  pageExists: false,
  payload: {
    stub: true,
    article_html: `<p>${Array.from({ length: 251 }, () => 'word').join(' ')}</p>`,
  },
});
assertOwnershipRejects(longStubFixture, 'STUB_CONTENT_TOO_LARGE');

const encodedLongStubFixture = ownershipFixture({
  html: null,
  automationPolicy: 'stub-allowed',
  pageExists: false,
  payload: {
    stub: true,
    expected_content_hash: null,
    article_html: `<p>${Array.from({ length: 251 }, () => 'word').join('&#32;')}</p>`,
  },
});
assertOwnershipRejects(encodedLongStubFixture, 'STUB_CONTENT_TOO_LARGE');

const absentStubFixture = ownershipFixture({
  html: null,
  automationPolicy: 'stub-allowed',
  pageExists: false,
  manifestHash: null,
  payload: {
    stub: true,
    expected_content_hash: null,
    article_html: '<p>This is an explicitly authorized short metadata stub.</p>',
  },
});
const absentStubResult = runImport({
  payloadDir: absentStubFixture.payloadDir,
  rootDir: absentStubFixture.rootDir,
  write: false,
  logger: () => {},
});
assert.equal(absentStubResult.ownershipActions[0].action, 'write');
console.log('PASS stub flow rejects redirects, canonical aliases, and full-length prose');

const realSyncStubRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-real-sync-stub-'));
fs.mkdirSync(path.join(realSyncStubRoot, 'wiki'), { recursive: true });
fs.mkdirSync(path.join(realSyncStubRoot, 'js'), { recursive: true });
fs.writeFileSync(
  path.join(realSyncStubRoot, 'wiki', 'intentional-stub.html'),
  '<!doctype html><html><head><meta name="robots" content="noindex, nofollow"></head><body data-wiki-stub="true"><main><aside class="wiki-stub-notice" role="status" data-generated-wiki-stub-notice="true"><strong>Stub page:</strong> This short entry is unverified and is not a canonical article.</aside><article data-wiki-stub="true"><p>Short stub.</p></article></main></body></html>',
  'utf8'
);
writeJson(path.join(realSyncStubRoot, 'js', 'wiki-index.json'), []);
fs.writeFileSync(
  path.join(realSyncStubRoot, 'sitemap.xml'),
  '<?xml version="1.0"?><urlset><url><loc>https://cryptomoonboys.com/</loc></url></urlset>',
  'utf8'
);
assert.doesNotThrow(() => assertPayloadUrlsSynced(realSyncStubRoot, [{
  ...lorePayload,
  slug: 'intentional-stub',
  page_type: 'stub',
  stub: true,
}]));
assert.throws(
  () => assertPayloadUrlsSynced(realSyncStubRoot, [{ ...lorePayload, slug: 'missing-real-page' }]),
  (error) => error instanceof FeedSyncError && error.surface === 'search'
);
fs.writeFileSync(
  path.join(realSyncStubRoot, 'wiki', 'payload-flag-only.html'),
  '<!doctype html><head><meta name="robots" content="index, follow"></head><body><article><p>Real page.</p></article></body>',
  'utf8'
);
assert.throws(
  () => assertPayloadUrlsSynced(realSyncStubRoot, [{
    ...lorePayload,
    slug: 'payload-flag-only',
    page_type: 'stub',
    stub: true,
  }]),
  (error) => error instanceof FeedSyncError && error.surface === 'search',
  'payload stub flags alone must not weaken the normal search sync assertion'
);
console.log('PASS real-root sync requires real pages while accepting intentional noindex stub exclusion');

const staleStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><body data-wiki-stub="true"><article data-wiki-stub="true"><p>STALE STUB PROSE MUST DISAPPEAR.</p></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: {
    stub: true,
    article_html: '<p>Fresh short stub prose.</p>',
  },
});
const [staleStubPlan] = planContentOwnershipUpdates([staleStubFixture.payload], staleStubFixture.rootDir);
assert.equal(staleStubPlan.action, 'write');
assert.equal(
  getManualContentBlock(fs.readFileSync(path.join(staleStubFixture.rootDir, 'wiki', 'ownership-case.html'), 'utf8')),
  '',
  'unmarked stub prose must never be promoted into MANUAL_CONTENT'
);
assert.ok(!staleStubPlan.html.includes('STALE STUB PROSE MUST DISAPPEAR.'));
assert.equal((staleStubPlan.html.match(/<!-- SAM_CONTENT:BEGIN -->/g) || []).length, 1);
assert.ok(staleStubPlan.html.includes('Fresh short stub prose.'));
console.log('PASS stub refresh replaces the old stub as one owned unit');

const contaminatedSameSamStubFixture = ownershipFixture({
  html: `<!DOCTYPE html><html><body data-wiki-stub="true"><article class="wiki-content" data-wiki-stub="true"><p>STALE UNOWNED STUB PROSE MUST DISAPPEAR.</p>${SAM_CONTENT_BEGIN}\n${lorePayload.article_html.trim()}\n${SAM_CONTENT_END}<div id="bible-content"></div></article></body></html>`,
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
const [contaminatedSameSamStubPlan] = planContentOwnershipUpdates(
  [contaminatedSameSamStubFixture.payload],
  contaminatedSameSamStubFixture.rootDir
);
assert.equal(contaminatedSameSamStubPlan.action, 'write', 'unowned stub prose must defeat same-SAM no-op');
assert.ok(!contaminatedSameSamStubPlan.html.includes('STALE UNOWNED STUB PROSE MUST DISAPPEAR.'));
assert.equal((contaminatedSameSamStubPlan.html.match(/<!-- SAM_CONTENT:BEGIN -->/g) || []).length, 1);
console.log('PASS same-SAM stub refresh still removes coexisting stale unowned prose');

const descendantStubFixture = ownershipFixture({
  html: '<!DOCTYPE html><html><body><article><span data-wiki-stub="true"></span></article></body></html>',
  automationPolicy: 'stub-allowed',
  payload: { stub: true },
});
assertOwnershipRejects(descendantStubFixture, 'REAL_PAGE_BLOCKS_STUB_WRITE');
console.log('PASS descendant data-wiki-stub cannot reclassify a page root');

const existingMarkedHtml = `<!DOCTYPE html><html><body><main id="content"><article class="wiki-content">
${MANUAL_CONTENT_BEGIN}
<p>KEEP THIS MANUAL SECTION.</p>
${MANUAL_CONTENT_END}
${SAM_CONTENT_BEGIN}
<p>OLD SAM SECTION MUST BE REPLACED.</p>
${SAM_CONTENT_END}
</article></main></body></html>`;
const rerenderedMarkedHtml = renderPageFromTemplate(lorePayload, manualRoot, existingMarkedHtml);
assert.ok(rerenderedMarkedHtml.includes('KEEP THIS MANUAL SECTION.'), 'marked manual section must survive render');
assert.ok(!rerenderedMarkedHtml.includes('OLD SAM SECTION MUST BE REPLACED.'), 'old SAM section must be replaced');
assert.ok(rerenderedMarkedHtml.includes(lorePayload.article_html.trim()), 'new SAM payload article_html must be present');
console.log('PASS existing SAM page updates SAM section without deleting manual section');

const firstManualBlock = `${MANUAL_CONTENT_BEGIN}\n<p>FIRST MANUAL BLOCK.</p>\n${MANUAL_CONTENT_END}`;
const secondManualBlock = `${MANUAL_CONTENT_BEGIN}\n<p>SECOND MANUAL BLOCK.</p>\n${MANUAL_CONTENT_END}`;
const multiManualFixture = ownershipFixture({
  html: `<article class="wiki-content">${firstManualBlock}${SAM_CONTENT_BEGIN}<p>OLD SAM</p>${SAM_CONTENT_END}${secondManualBlock}</article>`,
});
const [multiManualPlan] = planContentOwnershipUpdates([multiManualFixture.payload], multiManualFixture.rootDir);
assert.equal(multiManualPlan.action, 'write');
assert.ok(multiManualPlan.html.includes(firstManualBlock));
assert.ok(multiManualPlan.html.includes(secondManualBlock));
assert.equal(getManualContentBlocks(multiManualPlan.html).length, 2);
assert.ok(!multiManualPlan.html.includes('<p>OLD SAM</p>'));
console.log('PASS in-place SAM replacement preserves every manual content block');

const canonicalBlock = `${CANONICAL_CONTENT_BEGIN}\n<p>LOCKED CANONICAL BYTES.</p>\n${CANONICAL_CONTENT_END}`;
const canonicalExistingHtml = `<article class="wiki-content">${canonicalBlock}${SAM_CONTENT_BEGIN}<p>OLD SAM</p>${SAM_CONTENT_END}</article>`;
const canonicalRerender = renderPageFromTemplate(lorePayload, manualRoot, canonicalExistingHtml);
assert.ok(canonicalRerender.includes(canonicalBlock), 'canonical content block must survive SAM replacement byte-for-byte');
console.log('PASS canonical content block is preserved during authorized SAM replacement');

const manualOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-manual-feed-'));
const manualOnlyPayloadDir = path.join(manualOnlyRoot, 'website-publish-payloads');
copyFixtures(manualOnlyPayloadDir);
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(manualOnlyRoot, '_article-template.html'));
const manualOnlyPath = path.join(manualOnlyRoot, 'wiki', 'manual-only-page.html');
fs.mkdirSync(path.dirname(manualOnlyPath), { recursive: true });
fs.writeFileSync(manualOnlyPath, `<!DOCTYPE html><html><head><title>Manual Only Page</title><meta name="description" content="Owner-written manual only page."></head><body><main id="content"><article class="wiki-content">
${MANUAL_CONTENT_BEGIN}
<h1>Manual Only Page</h1>
<p>Manual-only page exists without an incoming payload.</p>
${MANUAL_CONTENT_END}
</article><div class="category-tags"><a href="/categories/lore.html">Lore</a></div></main></body></html>`, 'utf8');
authorizePayloadDirectory(manualOnlyRoot, manualOnlyPayloadDir);

runImport({
  payloadDir: manualOnlyPayloadDir,
  rootDir: manualOnlyRoot,
  write: true,
  logger: () => {},
  refreshContentStateFn: refreshTestContentState,
});

const manualOnlyWikiIndex = JSON.parse(fs.readFileSync(path.join(manualOnlyRoot, 'js', 'wiki-index.json'), 'utf8'));
const manualOnlyUrls = new Set(manualOnlyWikiIndex.map((entry) => entry.url));
assert.ok(manualOnlyUrls.has('/wiki/manual-only-page.html'), 'manual-only page must be included in portable search index');
assert.match(fs.readFileSync(path.join(manualOnlyRoot, 'js', 'timeline-data.json'), 'utf8'), /manual-only-page/);
assert.match(fs.readFileSync(path.join(manualOnlyRoot, 'js', 'graph-data.json'), 'utf8'), /manual-only-page/);
assert.match(fs.readFileSync(path.join(manualOnlyRoot, 'categories', 'lore.html'), 'utf8'), /\/wiki\/manual-only-page\.html/);
console.log('PASS manual-only pages remain in search, timeline, graph, and category sync');

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
const restoredLoreHtml = `<article class="wiki-content">${SAM_CONTENT_BEGIN}<p>ORIGINAL LORE PAGE</p>${SAM_CONTENT_END}</article>`;
fs.writeFileSync(restoredLorePath, restoredLoreHtml, 'utf8');
fs.chmodSync(restoredLorePath, 0o640);
authorizePayloadDirectory(rollbackRoot, rollbackPayloadDir);
const rollbackManifestPath = path.join(rollbackRoot, 'brand-canon', 'wiki-content-state.json');
const rollbackReportPath = path.join(rollbackRoot, 'brand-canon', 'wiki-rewrite-audit.md');
const rollbackStubRegistryPath = path.join(rollbackRoot, 'brand-canon', 'wiki-absent-stubs.json');
const rollbackManifestBefore = fs.readFileSync(rollbackManifestPath, 'utf8');
const rollbackStubRegistryBefore = fs.readFileSync(rollbackStubRegistryPath, 'utf8');
fs.writeFileSync(rollbackReportPath, '# ORIGINAL REPORT\n', 'utf8');
const rollbackIndexPath = path.join(rollbackRoot, 'js', 'wiki-index.json');
fs.mkdirSync(path.dirname(rollbackIndexPath), { recursive: true });
fs.writeFileSync(rollbackIndexPath, 'ORIGINAL INDEX BYTES\n', 'utf8');

assert.throws(
  () => runImport({
    payloadDir: rollbackPayloadDir,
    rootDir: rollbackRoot,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
    syncFeedSurfacesFn: (isolatedRoot) => {
      assert.notEqual(path.resolve(isolatedRoot), path.resolve(rollbackRoot), 'custom sync must receive only an isolated workspace');
      fs.writeFileSync(
        path.join(isolatedRoot, 'js', 'wiki-index.json'),
        'PARTIAL TRANSACTION OUTPUT\n',
        'utf8'
      );
      throw new FeedSyncError('graph', 'feed sync failed for graph: injected failure');
    },
  }),
  (error) => error instanceof FeedSyncError &&
    error.message.includes('feed sync failed for graph')
);
assert.equal(fs.readFileSync(restoredLorePath, 'utf8'), restoredLoreHtml);
assert.equal(fs.existsSync(path.join(rollbackRoot, 'wiki', 'sample-nft-template.html')), false);
assert.equal(fs.readFileSync(rollbackManifestPath, 'utf8'), rollbackManifestBefore);
assert.equal(fs.readFileSync(rollbackReportPath, 'utf8'), '# ORIGINAL REPORT\n');
assert.equal(fs.readFileSync(rollbackStubRegistryPath, 'utf8'), rollbackStubRegistryBefore);
assert.equal(fs.readFileSync(rollbackIndexPath, 'utf8'), 'ORIGINAL INDEX BYTES\n');
assert.equal(fs.statSync(restoredLorePath).mode & 0o777, 0o640, 'rollback must preserve the original page mode');
console.log('PASS partial feed sync failure rolls back page, artifact, and mode changes');

const partialRefreshFixture = ownershipFixture();
const partialRefreshPagePath = path.join(partialRefreshFixture.rootDir, 'wiki', 'ownership-case.html');
const partialRefreshPageBefore = fs.readFileSync(partialRefreshPagePath);
const partialRefreshManifestPath = path.join(
  partialRefreshFixture.rootDir,
  'brand-canon',
  'wiki-content-state.json'
);
const partialRefreshManifestBefore = fs.readFileSync(partialRefreshManifestPath);
assert.throws(
  () => runImport({
    payloadDir: partialRefreshFixture.payloadDir,
    rootDir: partialRefreshFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (isolatedRoot) => {
      assert.notEqual(path.resolve(isolatedRoot), path.resolve(partialRefreshFixture.rootDir));
      fs.writeFileSync(
        path.join(isolatedRoot, CONTENT_STATE_MANIFEST_FILE),
        'PARTIAL CONTENT STATE\n',
        'utf8'
      );
      throw new Error('injected partial content-state refresh failure');
    },
  }),
  /injected partial content-state refresh failure/
);
assert.deepEqual(fs.readFileSync(partialRefreshPagePath), partialRefreshPageBefore);
assert.deepEqual(fs.readFileSync(partialRefreshManifestPath), partialRefreshManifestBefore);
console.log('PASS partial content-state refresh failure rolls back its own output');

const preinstallManifestRevocationFixture = ownershipFixture();
const preinstallManifestRevocationPagePath = path.join(
  preinstallManifestRevocationFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const preinstallManifestRevocationManifestPath = path.join(
  preinstallManifestRevocationFixture.rootDir,
  CONTENT_STATE_MANIFEST_FILE
);
const preinstallManifestRevocationPageBefore = fs.readFileSync(
  preinstallManifestRevocationPagePath
);
let preinstallManifestRevocationBytes = null;
assert.throws(
  () => runImport({
    payloadDir: preinstallManifestRevocationFixture.payloadDir,
    rootDir: preinstallManifestRevocationFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (isolatedRoot) => {
      assert.notEqual(
        path.resolve(isolatedRoot),
        path.resolve(preinstallManifestRevocationFixture.rootDir)
      );
      const liveManifest = JSON.parse(
        fs.readFileSync(preinstallManifestRevocationManifestPath, 'utf8')
      );
      liveManifest.pages[0].automation_policy = 'canon-locked';
      writeJson(preinstallManifestRevocationManifestPath, liveManifest);
      preinstallManifestRevocationBytes = fs.readFileSync(
        preinstallManifestRevocationManifestPath
      );
      throw new Error('injected refresh failure before artifact installation');
    },
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
    error.cause?.message === 'injected refresh failure before artifact installation' &&
    error.rollbackConflicts.some(
      ({ path: conflictPath }) => conflictPath === CONTENT_STATE_MANIFEST_FILE
    )
);
assert.deepEqual(
  fs.readFileSync(preinstallManifestRevocationPagePath),
  preinstallManifestRevocationPageBefore,
  'pre-install refresh failure must roll the already-written page back'
);
assert.deepEqual(
  fs.readFileSync(preinstallManifestRevocationManifestPath),
  preinstallManifestRevocationBytes,
  'rollback must not attribute or overwrite a concurrent pre-install canon-lock revocation'
);
console.log('PASS failed pre-install refresh preserves an unjournaled concurrent manifest revocation');

const partialPrefixRefreshFixture = ownershipFixture();
const partialPrefixRefreshPagePath = path.join(
  partialPrefixRefreshFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const partialPrefixRefreshManifestPath = path.join(
  partialPrefixRefreshFixture.rootDir,
  CONTENT_STATE_MANIFEST_FILE
);
const partialPrefixRefreshReportPath = path.join(
  partialPrefixRefreshFixture.rootDir,
  'brand-canon',
  'wiki-rewrite-audit.md'
);
const partialPrefixRefreshPageBefore = fs.readFileSync(partialPrefixRefreshPagePath);
const partialPrefixRefreshManifestBefore = fs.readFileSync(partialPrefixRefreshManifestPath);
const partialPrefixConcurrentReport = Buffer.from('# CONCURRENT REPORT BEFORE SECOND COMMIT\n', 'utf8');
assert.throws(
  () => runImport({
    payloadDir: partialPrefixRefreshFixture.payloadDir,
    rootDir: partialPrefixRefreshFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (isolatedRoot) => {
      const result = refreshTestContentState(isolatedRoot);
      fs.writeFileSync(partialPrefixRefreshReportPath, partialPrefixConcurrentReport);
      return result;
    },
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
    error.cause?.code === 'STALE_CONTENT_STATE' &&
    error.rollbackConflicts.some(
      ({ path: conflictPath }) => conflictPath === 'brand-canon/wiki-rewrite-audit.md'
    )
);
assert.deepEqual(
  fs.readFileSync(partialPrefixRefreshPagePath),
  partialPrefixRefreshPageBefore,
  'second-output CAS failure must roll the article write back'
);
assert.deepEqual(
  fs.readFileSync(partialPrefixRefreshManifestPath),
  partialPrefixRefreshManifestBefore,
  'second-output CAS failure must roll the first committed refresh output back'
);
assert.deepEqual(
  fs.readFileSync(partialPrefixRefreshReportPath),
  partialPrefixConcurrentReport,
  'second-output CAS failure must preserve the exact concurrent report bytes'
);
console.log('PASS partial-prefix refresh rolls back journaled outputs and preserves the concurrent CAS winner');

const unjournaledReportFixture = ownershipFixture();
const unjournaledReportPagePath = path.join(
  unjournaledReportFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const unjournaledReportManifestPath = path.join(
  unjournaledReportFixture.rootDir,
  CONTENT_STATE_MANIFEST_FILE
);
const unjournaledReportPath = path.join(
  unjournaledReportFixture.rootDir,
  'brand-canon',
  'wiki-rewrite-audit.md'
);
const unjournaledReportPageBefore = fs.readFileSync(unjournaledReportPagePath);
const unjournaledReportManifestBefore = fs.readFileSync(unjournaledReportManifestPath);
const concurrentReportBytes = Buffer.from('# CONCURRENT HUMAN AUDIT\n', 'utf8');
assert.equal(fs.existsSync(unjournaledReportPath), false);
assert.throws(
  () => runImport({
    payloadDir: unjournaledReportFixture.payloadDir,
    rootDir: unjournaledReportFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (isolatedRoot) => {
      const result = refreshTestContentState(isolatedRoot);
      fs.unlinkSync(path.join(isolatedRoot, 'brand-canon', 'wiki-rewrite-audit.md'));
      fs.writeFileSync(unjournaledReportPath, concurrentReportBytes);
      return result;
    },
    syncFeedSurfacesFn: () => {
      throw new FeedSyncError('graph', 'injected failure after manifest-only refresh');
    },
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
    error.cause instanceof FeedSyncError &&
    error.cause.message.includes('injected failure after manifest-only refresh') &&
    error.rollbackConflicts.some(
      ({ path: conflictPath }) => conflictPath === 'brand-canon/wiki-rewrite-audit.md'
    )
);
assert.deepEqual(
  fs.readFileSync(unjournaledReportPagePath),
  unjournaledReportPageBefore,
  'later failure must roll the planned page write back'
);
assert.deepEqual(
  fs.readFileSync(unjournaledReportManifestPath),
  unjournaledReportManifestBefore,
  'later failure must roll the writer-journaled manifest refresh back'
);
assert.deepEqual(
  fs.readFileSync(unjournaledReportPath),
  concurrentReportBytes,
  'rollback must preserve a concurrent report that no importer writer journaled'
);
console.log('PASS successful refresh cannot bless an unjournaled concurrent report for later rollback');

const refreshManifestRevocationFixture = ownershipFixture();
const refreshManifestRevocationPagePath = path.join(
  refreshManifestRevocationFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const refreshManifestRevocationManifestPath = path.join(
  refreshManifestRevocationFixture.rootDir,
  CONTENT_STATE_MANIFEST_FILE
);
const refreshManifestRevocationPageBefore = fs.readFileSync(refreshManifestRevocationPagePath);
let refreshManifestRevocationBytes = null;
assert.throws(
  () => runImport({
    payloadDir: refreshManifestRevocationFixture.payloadDir,
    rootDir: refreshManifestRevocationFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (isolatedRoot) => {
      const liveManifest = JSON.parse(
        fs.readFileSync(refreshManifestRevocationManifestPath, 'utf8')
      );
      liveManifest.pages[0].automation_policy = 'canon-locked';
      writeJson(refreshManifestRevocationManifestPath, liveManifest);
      refreshManifestRevocationBytes = fs.readFileSync(refreshManifestRevocationManifestPath);
      return refreshTestContentState(isolatedRoot);
    },
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
    error.cause?.code === 'STALE_CONTENT_STATE'
);
assert.deepEqual(
  fs.readFileSync(refreshManifestRevocationPagePath),
  refreshManifestRevocationPageBefore,
  'manifest refresh conflict must roll the planned page write back'
);
assert.deepEqual(
  fs.readFileSync(refreshManifestRevocationManifestPath),
  refreshManifestRevocationBytes,
  'content-state refresh must preserve a concurrent canon-lock revocation'
);
console.log('PASS content-state refresh cannot overwrite a concurrent manifest policy revocation');

const refreshConcurrentFixture = ownershipFixture();
const refreshConcurrentPagePath = path.join(
  refreshConcurrentFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const refreshConcurrentHtml = '<article class="wiki-content"><p>CONCURRENT EDIT DURING CONTENT-STATE REFRESH.</p></article>';
let refreshConcurrentError = null;
try {
  runImport({
    payloadDir: refreshConcurrentFixture.payloadDir,
    rootDir: refreshConcurrentFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: (rootDir) => {
      fs.writeFileSync(refreshConcurrentPagePath, refreshConcurrentHtml, 'utf8');
      return refreshTestContentState(rootDir);
    },
  });
} catch (error) {
  refreshConcurrentError = error;
}
assert.ok(refreshConcurrentError instanceof ContentOwnershipError);
assert.equal(refreshConcurrentError.code, 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT');
assert.equal(refreshConcurrentError.cause?.code, 'STALE_CONTENT_STATE');
assert.equal(
  fs.readFileSync(refreshConcurrentPagePath, 'utf8'),
  refreshConcurrentHtml,
  'a manifest matching concurrent bytes must not make those bytes the successful planned write or let rollback clobber them'
);
console.log('PASS post-refresh verification compares live bytes to the exact planned page');

const refreshParentSwapFixture = ownershipFixture();
const refreshParentWikiPath = path.join(refreshParentSwapFixture.rootDir, 'wiki');
const refreshParentMovedPath = path.join(refreshParentSwapFixture.rootDir, 'wiki-real');
const refreshParentOutsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-refresh-swap-outside-'));
const refreshParentOutsideVictim = path.join(refreshParentOutsideDir, 'ownership-case.html');
const refreshParentOutsideBytes = Buffer.from('REFRESH SWAP OUTSIDE VICTIM\n', 'utf8');
fs.writeFileSync(refreshParentOutsideVictim, refreshParentOutsideBytes);
let refreshParentSwapError = null;
try {
  runImport({
    payloadDir: refreshParentSwapFixture.payloadDir,
    rootDir: refreshParentSwapFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: () => {
      fs.renameSync(refreshParentWikiPath, refreshParentMovedPath);
      fs.symlinkSync(refreshParentOutsideDir, refreshParentWikiPath, 'dir');
      throw new Error('injected wiki parent swap during refresh');
    },
  });
} catch (error) {
  refreshParentSwapError = error;
} finally {
  if (fs.lstatSync(refreshParentWikiPath).isSymbolicLink()) fs.unlinkSync(refreshParentWikiPath);
  if (fs.existsSync(refreshParentMovedPath)) fs.renameSync(refreshParentMovedPath, refreshParentWikiPath);
}
assert.ok(refreshParentSwapError instanceof ContentOwnershipError);
assert.equal(refreshParentSwapError.code, 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT');
assert.deepEqual(
  fs.readFileSync(refreshParentOutsideVictim),
  refreshParentOutsideBytes,
  'rollback must never follow a wiki parent symlink installed during refresh'
);
assert.equal(fs.existsSync(path.join(refreshParentSwapFixture.rootDir, PUBLISH_TRANSACTION_LOCK)), false);
console.log('PASS refresh-time wiki parent swaps cannot redirect rollback outside the repository');

const rollbackConflictFixture = ownershipFixture();
const rollbackConflictPagePath = path.join(rollbackConflictFixture.rootDir, 'wiki', 'ownership-case.html');
const concurrentRollbackHtml = '<article class="wiki-content"><p>CONCURRENT POST-WRITE CONTENT MUST SURVIVE.</p></article>';
let observedRollbackConflict = null;
try {
  runImport({
    payloadDir: rollbackConflictFixture.payloadDir,
    rootDir: rollbackConflictFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
    syncFeedSurfacesFn: () => {
      fs.writeFileSync(rollbackConflictPagePath, concurrentRollbackHtml, 'utf8');
      throw new FeedSyncError('graph', 'injected failure after a concurrent page replacement');
    },
  });
} catch (error) {
  observedRollbackConflict = error;
}
assert.ok(observedRollbackConflict instanceof ContentOwnershipError);
assert.equal(observedRollbackConflict.code, 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT');
assert.match(observedRollbackConflict.message, /injected failure after a concurrent page replacement/);
assert.ok(
  observedRollbackConflict.rollbackConflicts.some(({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html')
);
assert.equal(
  fs.readFileSync(rollbackConflictPagePath, 'utf8'),
  concurrentRollbackHtml,
  'rollback must not overwrite bytes installed after the transaction page write'
);
assert.equal(fs.existsSync(path.join(rollbackConflictFixture.rootDir, PUBLISH_TRANSACTION_LOCK)), false);
console.log('PASS rollback preserves and reports a concurrent post-write page replacement');

const rollbackDeletionFixture = ownershipFixture();
const rollbackDeletionPagePath = path.join(
  rollbackDeletionFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
let rollbackDeletionError = null;
try {
  runImport({
    payloadDir: rollbackDeletionFixture.payloadDir,
    rootDir: rollbackDeletionFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
    syncFeedSurfacesFn: () => {
      fs.unlinkSync(rollbackDeletionPagePath);
      throw new FeedSyncError('graph', 'injected failure after concurrent page deletion');
    },
  });
} catch (error) {
  rollbackDeletionError = error;
}
assert.ok(rollbackDeletionError instanceof ContentOwnershipError);
assert.equal(rollbackDeletionError.code, 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT');
assert.ok(
  rollbackDeletionError.rollbackConflicts.some(({ path: conflictPath }) =>
    conflictPath === 'wiki/ownership-case.html'
  )
);
assert.equal(
  fs.existsSync(rollbackDeletionPagePath),
  false,
  'rollback must preserve a concurrent deletion instead of recreating the preimage'
);
console.log('PASS rollback preserves and reports a concurrent post-write page deletion');

const rollbackCommitRaceFixture = ownershipFixture();
const rollbackCommitRacePagePath = path.join(
  rollbackCommitRaceFixture.rootDir,
  'wiki',
  'ownership-case.html'
);
const rollbackCommitRaceHtml = '<article class="wiki-content"><p>CONCURRENT CHANGE DURING ROLLBACK COMMIT.</p></article>';
const renameSyncBeforeRollbackRace = fs.renameSync;
let rollbackPageDetachRenames = 0;
fs.renameSync = function interceptRollbackDetach(sourcePath, destinationPath) {
  const normalizedSource = String(sourcePath).replaceAll('\\', '/');
  const normalizedDestination = String(destinationPath).replaceAll('\\', '/');
  let anchoredSourceParent = '';
  try {
    anchoredSourceParent = fs.realpathSync.native(path.dirname(String(sourcePath)));
  } catch {
    // Non-anchored renames are unrelated to this rollback race fixture.
  }
  if (
    path.basename(normalizedSource) === path.basename(rollbackCommitRacePagePath) &&
    path.resolve(anchoredSourceParent) === path.dirname(path.resolve(rollbackCommitRacePagePath)) &&
    /\/\.ownership-case\.html\.rollback-[^/]+\/detached$/.test(normalizedDestination)
  ) {
    rollbackPageDetachRenames += 1;
    fs.writeFileSync(rollbackCommitRacePagePath, rollbackCommitRaceHtml, 'utf8');
  }
  return renameSyncBeforeRollbackRace.call(fs, sourcePath, destinationPath);
};
let rollbackCommitRaceError = null;
try {
  runImport({
    payloadDir: rollbackCommitRaceFixture.payloadDir,
    rootDir: rollbackCommitRaceFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
    syncFeedSurfacesFn: () => {
      throw new FeedSyncError('graph', 'injected rollback commit race');
    },
  });
} catch (error) {
  rollbackCommitRaceError = error;
} finally {
  fs.renameSync = renameSyncBeforeRollbackRace;
}
assert.equal(rollbackPageDetachRenames, 1, 'fixture must replace the page immediately before atomic detachment');
assert.ok(rollbackCommitRaceError instanceof ContentOwnershipError);
assert.equal(rollbackCommitRaceError.code, 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT');
assert.ok(
  rollbackCommitRaceError.rollbackConflicts.some(
    ({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html'
  )
);
assert.equal(fs.readFileSync(rollbackCommitRacePagePath, 'utf8'), rollbackCommitRaceHtml);
console.log('PASS rollback commit rechecks and preserves a last-moment concurrent page change');

const rollbackParentRecheckFixture = ownershipFixture();
const rollbackParentRecheckWikiPath = path.join(
  rollbackParentRecheckFixture.rootDir,
  'wiki'
);
const rollbackParentRecheckMovedWikiPath = path.join(
  rollbackParentRecheckFixture.rootDir,
  'wiki-rollback-restored-original'
);
const rollbackParentRecheckPagePath = path.join(
  rollbackParentRecheckWikiPath,
  'ownership-case.html'
);
const rollbackParentRecheckPageBefore = fs.readFileSync(rollbackParentRecheckPagePath);
const rollbackParentRecheckSentinelPath = path.join(
  rollbackParentRecheckWikiPath,
  'replacement-owner.txt'
);
const rollbackParentRecheckSentinelBytes = Buffer.from(
  'MID-ROLLBACK REAL DIRECTORY REPLACEMENT MUST SURVIVE\n',
  'utf8'
);
let rollbackParentRecheckInjected = 0;
const unlinkSyncBeforeRollbackParentRecheck = fs.unlinkSync;
fs.unlinkSync = function interceptRollbackParentRecheck(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  const result = unlinkSyncBeforeRollbackParentRecheck.call(fs, filePath);
  if (
    rollbackParentRecheckInjected === 0 &&
    /\/\.ownership-case\.html\.rollback-[^/]+\/detached$/.test(normalized)
  ) {
    rollbackParentRecheckInjected += 1;
    fs.renameSync(rollbackParentRecheckWikiPath, rollbackParentRecheckMovedWikiPath);
    fs.mkdirSync(rollbackParentRecheckWikiPath);
    fs.writeFileSync(
      rollbackParentRecheckSentinelPath,
      rollbackParentRecheckSentinelBytes
    );
  }
  return result;
};
try {
  assert.throws(
    () => runImport({
      payloadDir: rollbackParentRecheckFixture.payloadDir,
      rootDir: rollbackParentRecheckFixture.rootDir,
      write: true,
      logger: () => {},
      refreshContentStateFn: () => {
        throw new Error('injected failure before rollback parent recheck');
      },
    }),
    (error) => error instanceof ContentOwnershipError &&
      error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
      error.cause?.message.includes('injected failure before rollback parent recheck') &&
      error.rollbackConflicts.some(
        ({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html'
      )
  );
} finally {
  fs.unlinkSync = unlinkSyncBeforeRollbackParentRecheck;
}
assert.equal(
  rollbackParentRecheckInjected,
  1,
  'fixture must swap the selected page parent after rollback reinstalls the preimage'
);
assert.equal(
  fs.existsSync(rollbackParentRecheckPagePath),
  false,
  'rollback must not touch the replacement directory after its identity changes'
);
assert.deepEqual(
  fs.readFileSync(rollbackParentRecheckSentinelPath),
  rollbackParentRecheckSentinelBytes,
  'rollback must preserve the directory that replaces the selected parent mid-commit'
);
assert.deepEqual(
  fs.readFileSync(
    path.join(rollbackParentRecheckMovedWikiPath, 'ownership-case.html')
  ),
  rollbackParentRecheckPageBefore,
  'the preimage must be restored only through the original held parent descriptor'
);
console.log('PASS rollback rechecks parent identity after reinstalling the page preimage');

const rollbackCreateConflictFixture = ownershipFixture({
  html: null,
  automationPolicy: 'stub-allowed',
  pageExists: false,
  payload: {
    stub: true,
    expected_content_hash: null,
  },
});
writeJson(path.join(rollbackCreateConflictFixture.rootDir, 'brand-canon', 'wiki-absent-stubs.json'), {
  schema_version: 1,
  absent_stub_slugs: [rollbackCreateConflictFixture.payload.slug],
});
const rollbackCreatedPagePath = path.join(rollbackCreateConflictFixture.rootDir, 'wiki', 'ownership-case.html');
const concurrentCreatedHtml = '<article class="wiki-content"><p>CONCURRENT FILE AT A NEW PAGE PATH MUST NOT BE DELETED.</p></article>';
assert.throws(
  () => runImport({
    payloadDir: rollbackCreateConflictFixture.payloadDir,
    rootDir: rollbackCreateConflictFixture.rootDir,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
    syncFeedSurfacesFn: () => {
      fs.writeFileSync(rollbackCreatedPagePath, concurrentCreatedHtml, 'utf8');
      throw new FeedSyncError('search', 'injected failure after replacing a transaction-created page');
    },
  }),
  (error) => error instanceof ContentOwnershipError &&
    error.code === 'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT' &&
    error.rollbackConflicts.some(({ path: conflictPath }) => conflictPath === 'wiki/ownership-case.html')
);
assert.equal(
  fs.readFileSync(rollbackCreatedPagePath, 'utf8'),
  concurrentCreatedHtml,
  'rollback must not delete concurrent bytes at a path that was absent in the pre-transaction snapshot'
);
assert.equal(fs.existsSync(path.join(rollbackCreateConflictFixture.rootDir, PUBLISH_TRANSACTION_LOCK)), false);
console.log('PASS rollback never deletes a concurrent replacement of a transaction-created page');

const manualRollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-manual-rollback-'));
const manualRollbackPayloadDir = path.join(manualRollbackRoot, 'website-publish-payloads');
writeJson(path.join(manualRollbackPayloadDir, 'sample-lore-page.json'), lorePayload);
fs.copyFileSync(path.join(ROOT, '_article-template.html'), path.join(manualRollbackRoot, '_article-template.html'));
const manualRollbackPagePath = path.join(manualRollbackRoot, 'wiki', 'sample-lore-page.html');
fs.mkdirSync(path.dirname(manualRollbackPagePath), { recursive: true });
const markedRollbackHtml = `<article class="wiki-content">${MANUAL_CONTENT_BEGIN}<p>ORIGINAL MANUAL TRUTH</p>${MANUAL_CONTENT_END}${SAM_CONTENT_BEGIN}<p>OLD SAM CONTENT</p>${SAM_CONTENT_END}</article>`;
fs.writeFileSync(manualRollbackPagePath, markedRollbackHtml, 'utf8');
authorizePayloadDirectory(manualRollbackRoot, manualRollbackPayloadDir);
assert.throws(
  () => runImport({
    payloadDir: manualRollbackPayloadDir,
    rootDir: manualRollbackRoot,
    write: true,
    logger: () => {},
    refreshContentStateFn: refreshTestContentState,
    syncFeedSurfacesFn: () => {
      throw new FeedSyncError('search', 'feed sync failed for search: injected manual rollback failure');
    },
  }),
  (error) => error instanceof FeedSyncError
);
assert.equal(fs.readFileSync(manualRollbackPagePath, 'utf8'), markedRollbackHtml);
console.log('PASS manual page preservation rolls back with write-mode failure');

const missingScriptsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'website-importer-missing-scripts-'));
assert.throws(
  () => assertRequiredRealRootSyncScripts(missingScriptsRoot),
  (error) => error instanceof FeedSyncError &&
    error.message === 'feed sync not implemented for search'
);
console.log('PASS real-root feed sync preflight fails loudly for missing scripts');

assert.ok(FeedSyncError, 'FeedSyncError export is available for feed sync failures');
assert.ok(getManualContentBlock(existingMarkedHtml).includes('KEEP THIS MANUAL SECTION.'), 'manual content helper exposes marked manual truth');

console.log('\nvalidate-website-publish-payloads.test.mjs passed');
