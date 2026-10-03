#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_CONTENT_BEGIN,
  CANONICAL_CONTENT_END,
  MANUAL_CONTENT_BEGIN,
  MANUAL_CONTENT_END,
  SAM_CONTENT_BEGIN,
  SAM_CONTENT_END,
  absentStubPage,
  articleContentHash,
  articleMarkupHash,
  assertValidStubAtRest,
  assertValidWikiContentTopology,
  buildWikiAudit,
  countWords,
  extractArticleHtml,
  hasLegacyUnmarkedArticleContent,
  hasRootWikiStubMarker,
  htmlToVisibleText,
  listTopLevelWikiHtmlFiles,
  loadAbsentStubDeclarations,
  readTopLevelWikiHtmlFile,
  renderRewriteAudit,
  runCli,
  sourceTreeHashForPages,
  validateAbsentStubDeclarations,
  writeGeneratedArtifactsToDirectory,
} from './generate-wiki-content-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CLI can stage generated artifacts without touching brand-canon outputs', (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-content-state-output-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const manifestPath = path.join(ROOT, 'brand-canon', 'wiki-content-state.json');
  const reportPath = path.join(ROOT, 'brand-canon', 'wiki-rewrite-audit.md');
  const manifestBefore = fs.readFileSync(manifestPath);
  const reportBefore = fs.readFileSync(reportPath);

  assert.equal(runCli(['--write', '--output-dir', outputDir]), 0);

  const expected = buildWikiAudit();
  assert.equal(
    fs.readFileSync(path.join(outputDir, 'wiki-content-state.json'), 'utf8'),
    `${JSON.stringify(expected, null, 2)}\n`
  );
  assert.equal(
    fs.readFileSync(path.join(outputDir, 'wiki-rewrite-audit.md'), 'utf8'),
    renderRewriteAudit(expected)
  );
  assert.deepEqual(fs.readFileSync(manifestPath), manifestBefore);
  assert.deepEqual(fs.readFileSync(reportPath), reportBefore);
});

test('CLI can stage generated artifacts through an inherited directory descriptor', (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-content-state-output-fd-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const descriptor = fs.openSync(
    outputDir,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | (fs.constants.O_NOFOLLOW || 0)
  );
  t.after(() => fs.closeSync(descriptor));

  assert.equal(runCli(['--write', '--output-fd', String(descriptor)]), 0);
  assert.ok(fs.statSync(path.join(outputDir, 'wiki-content-state.json')).isFile());
  assert.ok(fs.statSync(path.join(outputDir, 'wiki-rewrite-audit.md')).isFile());
});

test('generated artifact writes remain anchored across an output-parent swap', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-content-state-parent-swap-'));
  const outputDir = path.join(tempDir, 'brand-canon');
  const movedOutputDir = path.join(tempDir, 'brand-canon-original');
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-content-state-outside-'));
  fs.mkdirSync(outputDir);
  const outsideManifest = path.join(outsideDir, 'wiki-content-state.json');
  const outsideReport = path.join(outsideDir, 'wiki-rewrite-audit.md');
  fs.writeFileSync(outsideManifest, 'OUTSIDE MANIFEST\n');
  fs.writeFileSync(outsideReport, 'OUTSIDE REPORT\n');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }));

  const originalOpenSync = fs.openSync;
  let swapped = false;
  fs.openSync = function interceptFirstAnchoredTemporary(filePath, ...args) {
    const normalized = String(filePath).replaceAll('\\', '/');
    if (
      !swapped &&
      /\/proc\/self\/fd\/\d+\/\.wiki-content-state\.json\.generate-[^/]+\.tmp$/.test(normalized)
    ) {
      fs.renameSync(outputDir, movedOutputDir);
      fs.symlinkSync(outsideDir, outputDir, 'dir');
      swapped = true;
    }
    return originalOpenSync.call(fs, filePath, ...args);
  };
  try {
    writeGeneratedArtifactsToDirectory(outputDir, {
      json: 'NEW MANIFEST\n',
      markdown: 'NEW REPORT\n',
    });
  } finally {
    fs.openSync = originalOpenSync;
  }

  assert.equal(swapped, true);
  assert.equal(fs.readFileSync(path.join(movedOutputDir, 'wiki-content-state.json'), 'utf8'), 'NEW MANIFEST\n');
  assert.equal(fs.readFileSync(path.join(movedOutputDir, 'wiki-rewrite-audit.md'), 'utf8'), 'NEW REPORT\n');
  assert.equal(fs.readFileSync(outsideManifest, 'utf8'), 'OUTSIDE MANIFEST\n');
  assert.equal(fs.readFileSync(outsideReport, 'utf8'), 'OUTSIDE REPORT\n');
});

test('generated artifact writes reject symlinked output directories and leaves', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-content-state-symlink-output-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-content-state-symlink-victim-'));
  const outsideManifest = path.join(outsideDir, 'manifest-victim.json');
  fs.writeFileSync(outsideManifest, 'OUTSIDE SENTINEL\n');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }));

  const linkedDirectory = path.join(tempDir, 'linked-output');
  fs.symlinkSync(outsideDir, linkedDirectory, 'dir');
  assert.throws(
    () => writeGeneratedArtifactsToDirectory(linkedDirectory, { json: 'NEW\n', markdown: 'NEW\n' }),
    /existing real directory/
  );

  const outputDir = path.join(tempDir, 'real-output');
  fs.mkdirSync(outputDir);
  fs.symlinkSync(outsideManifest, path.join(outputDir, 'wiki-content-state.json'));
  assert.throws(
    () => writeGeneratedArtifactsToDirectory(outputDir, { json: 'NEW\n', markdown: 'NEW\n' }),
    /regular file, not a symlink/
  );
  assert.equal(fs.readFileSync(outsideManifest, 'utf8'), 'OUTSIDE SENTINEL\n');
});

test('article extraction ignores article-like text in template comments', () => {
  const html = '<!-- Copy this file to wiki/<article-slug>.html -->\n<article class="wiki-content"><p>Real article prose.</p></article>';
  assert.equal(extractArticleHtml(html), '<p>Real article prose.</p>');
});

test('whole-page stub authority requires the active body root', () => {
  const descendantMarker = '<body><article><p>Archive prose.</p><span data-wiki-stub="true"></span></article></body>';
  assert.equal(hasRootWikiStubMarker(descendantMarker), false);
  assert.equal(hasLegacyUnmarkedArticleContent(descendantMarker), true);

  const articleOnlyMarker = '<body><main><p>Real prose.</p></main><article data-wiki-stub="true"><p>Short generated stub.</p></article></body>';
  assert.equal(hasRootWikiStubMarker(articleOnlyMarker), false);
  assert.equal(hasLegacyUnmarkedArticleContent(articleOnlyMarker), true);

  const rootMarker = '<body data-wiki-stub="true"><article data-wiki-stub="true"><p>Short generated stub.</p></article></body>';
  assert.equal(hasRootWikiStubMarker(rootMarker), true);
  assert.equal(hasLegacyUnmarkedArticleContent(rootMarker), false);
  assert.equal(hasRootWikiStubMarker('<body data-wiki-stub><article><p>Real prose.</p></article></body>'), false);
  assert.equal(hasRootWikiStubMarker('<body data-wiki-stub=true><article><p>Real prose.</p></article></body>'), false);
  assert.equal(hasRootWikiStubMarker('<body data-wiki-stub="true" data-wiki-stub="false"><article></article></body>'), false);
  assert.equal(
    hasRootWikiStubMarker(
      '<select><body data-wiki-stub="true"><article data-wiki-stub="true"></article></body></select>' +
        '<article><p>Real archive prose.</p></article>'
    ),
    false,
    'select insertion mode must not invent an active body root or stub authority'
  );
  assert.equal(
    hasRootWikiStubMarker(
      '<script><!--<script></script><body data-wiki-stub="true"></script>' +
        '<body><article><p>Real archive prose.</p></article></body>'
    ),
    false,
    'ambiguous script double-escaped state before body must fail closed for stub authority'
  );
  assert.equal(
    hasRootWikiStubMarker(
      '<svg><body data-wiki-stub="true"></body></svg>' +
        '<body><article><p>Real archive prose.</p></article></body>'
    ),
    false,
    'foreign-content body tokens must not grant stub authority'
  );
  assert.equal(
    hasRootWikiStubMarker(
      '<frameset><frame src="/wiki/protected.html"><body data-wiki-stub="true"></body></frameset>'
    ),
    false,
    'frameset-ignored body tokens must not grant stub authority'
  );

  const commentMarker = '<!-- <article data-wiki-stub="true"> --><article><p>Archive prose.</p></article>';
  assert.equal(hasRootWikiStubMarker(commentMarker), false);

  for (const [open, close] of [
    ['<script>', '</script>'],
    ['<style>', '</style>'],
    ['<template>', '</template>'],
    ['<textarea>', '</textarea>'],
    ['<title>', '</title>'],
    ['<xmp>', '</xmp>'],
    ['<noscript>', '</noscript>'],
  ]) {
    const spoofed = `${open}<body data-wiki-stub="true"><article data-wiki-stub="true"></article>${close}` +
      '<body><article><p>Real archive prose.</p></article></body>';
    assert.equal(hasRootWikiStubMarker(spoofed), false, `${open} contents must not grant stub authority`);
  }

  const nestedTemplateSpoof = '<template><template></template><article data-wiki-stub="true"></article></template>' +
    '<article><p>Real archive prose.</p></article>';
  assert.equal(hasRootWikiStubMarker(nestedTemplateSpoof), false);
});

test('balanced canonical-root extraction includes nested article cards and trailing prose', () => {
  const html = '<main><article class="wiki-content"><p>Before.</p>' +
    '<article class="card"><p>Nested card.</p></article><p>Trailing prose one.</p></article></main>';
  const article = extractArticleHtml(html);
  assert.match(article, /Nested card/);
  assert.match(article, /Trailing prose one/);
  assert.notEqual(
    articleContentHash(html),
    articleContentHash(html.replace('Trailing prose one.', 'Trailing prose two.')),
    'prose after a nested article must remain inside the protected article hash'
  );
  assert.doesNotThrow(() => assertValidWikiContentTopology(html, 'nested-cards.html'));
});

test('protected article identities retain browser-visible raw text and root visibility markup', () => {
  const oldRawText = '<article><p>Alpha < old protected wording > omega.</p></article>';
  const newRawText = '<article><p>Alpha < new replacement wording > omega.</p></article>';
  assert.equal(articleContentHash(oldRawText), articleContentHash(newRawText));
  assert.notEqual(articleMarkupHash(oldRawText), articleMarkupHash(newRawText));

  const visible = '<article><p>Canon remains visible.</p></article>';
  const hidden = '<article hidden><p>Canon remains visible.</p></article>';
  assert.equal(articleContentHash(visible), articleContentHash(hidden));
  assert.notEqual(articleMarkupHash(visible), articleMarkupHash(hidden));

  const relatedA = '<article><p>Canon.</p><!-- RELATED_WIKI_PATHS:BEGIN --><p>Path A</p><!-- RELATED_WIKI_PATHS:END --></article>';
  const relatedB = relatedA.replace('Path A', 'Path B');
  assert.equal(articleMarkupHash(relatedA), articleMarkupHash(relatedB), 'generated relationship maintenance stays outside the protected markup identity');
});

test('wiki HTML enumeration rejects symlinks before hashing', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-html-symlink-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const wikiDir = path.join(tempDir, 'wiki');
  fs.mkdirSync(wikiDir);
  const outside = path.join(tempDir, 'outside.html');
  fs.writeFileSync(outside, '<article><p>Outside prose.</p></article>', 'utf8');
  fs.symlinkSync(outside, path.join(wikiDir, 'linked.html'));
  assert.throws(() => listTopLevelWikiHtmlFiles(wikiDir), /symlinked wiki HTML is forbidden/);
  assert.throws(() => readTopLevelWikiHtmlFile(wikiDir, 'linked.html'), /symlinked wiki HTML is forbidden/);
});

test('content topology rejects sibling roots, overlapping owners, and SAM-wrapped articles', () => {
  assert.throws(
    () => assertValidWikiContentTopology(
      '<article class="wiki-content"><p>Protected.</p></article><article><p>Injected sibling.</p></article>',
      'sibling.html'
    ),
    /multiple sibling article\/wiki-content roots/
  );
  assert.throws(
    () => assertValidWikiContentTopology(
      `<article>${MANUAL_CONTENT_BEGIN}${SAM_CONTENT_BEGIN}<p>Overlap.</p>${MANUAL_CONTENT_END}${SAM_CONTENT_END}</article>`,
      'overlap.html'
    ),
    /ownership blocks overlap/
  );
  assert.throws(
    () => assertValidWikiContentTopology(
      `<div class="wiki-content">${SAM_CONTENT_BEGIN}<article><p>Nested owner.</p></article>${SAM_CONTENT_END}</div>`,
      'wrapped-article.html'
    ),
    /SAM_CONTENT block must not wrap an article element/
  );
  assert.throws(
    () => assertValidWikiContentTopology(
      `${CANONICAL_CONTENT_BEGIN}<article><p>Canon.</p></article>${CANONICAL_CONTENT_END}`,
      'outside.html'
    ),
    /must be wholly inside/
  );
});

test('at-rest stub validation counts decoded prose and rejects protected ownership', () => {
  const encodedLongStub = Array.from({ length: 251 }, () => 'word').join('&#32;');
  const wordCount = countWords(htmlToVisibleText(`<p>${encodedLongStub}</p>`));
  assert.equal(wordCount, 251);
  assert.throws(
    () => assertValidStubAtRest({ relPath: 'stub.html', stub: true, currentWordCount: wordCount }),
    /maximum is 250/
  );
  assert.throws(
    () => assertValidStubAtRest({ relPath: 'stub.html', stub: true, manualBlockCount: 1 }),
    /must not contain MANUAL_CONTENT or CANONICAL_CONTENT/
  );
  assert.throws(
    () => assertValidStubAtRest({ relPath: 'stub.html', stub: true, canonicalBlockCount: 1 }),
    /must not contain MANUAL_CONTENT or CANONICAL_CONTENT/
  );
  assert.doesNotThrow(() => assertValidStubAtRest({ relPath: 'stub.html', stub: true }));
  assert.doesNotThrow(() => assertValidWikiContentTopology(
    `<article data-wiki-stub="true">${SAM_CONTENT_BEGIN}<p>Short stub.</p>${SAM_CONTENT_END}</article>`,
    'sam-stub.html'
  ));
});

test('absent-stub declaration file is required and must match its schema', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-absent-stubs-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const declarationPath = path.join(tempDir, 'wiki-absent-stubs.json');

  assert.throws(
    () => loadAbsentStubDeclarations(new Set(), declarationPath),
    /declaration file not found/
  );
  fs.writeFileSync(declarationPath, '{not-json', 'utf8');
  assert.throws(
    () => loadAbsentStubDeclarations(new Set(), declarationPath),
    /Invalid JSON/
  );
  for (const value of [null, [], { schema_version: 2, absent_stub_slugs: [] }, { schema_version: 1 }]) {
    fs.writeFileSync(declarationPath, JSON.stringify(value), 'utf8');
    assert.throws(() => loadAbsentStubDeclarations(new Set(), declarationPath));
  }
});

test('absent-stub declarations reject unsafe or stale slugs', () => {
  const existing = new Set(['existing-page']);
  assert.deepEqual(
    validateAbsentStubDeclarations({ schema_version: 1, absent_stub_slugs: ['z-page', 'a-page'] }, existing),
    ['a-page', 'z-page']
  );
  assert.throws(
    () => validateAbsentStubDeclarations({ schema_version: 1, absent_stub_slugs: ['duplicate', 'duplicate'] }, existing),
    /Duplicate absent-stub slug/
  );
  assert.throws(
    () => validateAbsentStubDeclarations({ schema_version: 1, absent_stub_slugs: ['Existing Page'] }, existing),
    /Invalid absent-stub slug/
  );
  assert.throws(
    () => validateAbsentStubDeclarations({ schema_version: 1, absent_stub_slugs: ['existing-page'] }, existing),
    /already has a wiki page/
  );
  for (const slug of ['the-first-witness', 'first-witness-future-page']) {
    assert.throws(
      () => validateAbsentStubDeclarations({ schema_version: 1, absent_stub_slugs: [slug] }, existing),
      /First Witness cannot be an absent-stub target/
    );
  }
  assert.throws(
    () => validateAbsentStubDeclarations({ schema_version: 1, absent_stub_slugs: ['one-million-free-nfts'] }, existing),
    /known alias for 1m-free-nfts-program/
  );
  assert.throws(
    () => validateAbsentStubDeclarations({ schema_version: 1, absent_stub_slugs: ['free-graffpunks-via-nfts'] }, existing),
    /blocked by the wiki publish gate/
  );
});

test('synthetic absent-stub records are fail-closed', () => {
  const page = absentStubPage('reviewed-future-page');
  assert.equal(page.page_exists, false);
  assert.equal(page.automation_policy, 'stub-allowed');
  assert.equal(page.rewrite_status, 'GENERATED');
  assert.equal(page.content_hash, null);
  assert.equal(page.article_content_hash, null);
  assert.equal(page.article_markup_hash, null);
  assert.equal(page.git_blob_oid, null);
  assert.equal(page.wiki_stub_marker_scope, null);
  assert.equal(page.manual_content_block_count, 0);
  assert.equal(page.sam_content_block_count, 0);
  assert.equal(page.canonical_content_block_count, 0);
});

test('manifest keeps existing-page audit counts separate from absent authorizations', () => {
  const manifest = buildWikiAudit();
  const declarations = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'brand-canon', 'wiki-absent-stubs.json'), 'utf8')
  ).absent_stub_slugs;
  const wikiPageCount = fs.readdirSync(path.join(ROOT, 'wiki')).filter((name) => name.endsWith('.html')).length;
  const existingPages = manifest.pages.filter((page) => page.page_exists);
  const absentPages = manifest.pages.filter((page) => page.page_exists === false);

  assert.equal(existingPages.length, wikiPageCount);
  assert.equal(manifest.page_count, wikiPageCount);
  assert.equal(manifest.summary.total_pages_audited, wikiPageCount);
  assert.equal(manifest.summary.absent_stub_authorizations, declarations.length);
  assert.equal(absentPages.length, declarations.length);
  assert.equal(manifest.summary.total_manifest_entries, manifest.pages.length);
  assert.equal(manifest.manifest_entry_count, manifest.pages.length);
  assert.equal(
    Object.values(manifest.summary.rewrite_status_counts).reduce((total, count) => total + count, 0),
    wikiPageCount
  );
  assert.equal(
    Object.values(manifest.summary.automation_policy_counts).reduce((total, count) => total + count, 0),
    wikiPageCount
  );
  assert.ok(existingPages.every((page) => page.page_exists === true));
  assert.ok(existingPages.every((page) => /^sha256:[a-f0-9]{64}$/.test(page.article_markup_hash)));
  assert.ok(existingPages.every((page) => page.wiki_stub_marker_scope === null || page.wiki_stub_marker_scope === 'body'));
  assert.ok(absentPages.every((page) => page.content_hash === null));

  const report = renderRewriteAudit(manifest);
  assert.match(report, /## Explicit absent-stub authorizations/);
  assert.match(report, new RegExp(`Absent stub authorizations \\| ${declarations.length} \\|`));
  for (const page of absentPages) {
    assert.ok(report.includes(`\`${page.path}\``));
    assert.ok(!report.includes(`](../${page.path})`), 'an absent target must not be emitted as a link');
  }
  assert.ok(report.includes('FREE\\`MINDS'), 'Markdown-significant title characters must be escaped');

  const synthetic = absentStubPage('reviewed-future-page');
  assert.equal(sourceTreeHashForPages([...manifest.pages, synthetic]), manifest.source_tree_hash);
  const manifestWithSynthetic = structuredClone(manifest);
  manifestWithSynthetic.pages.push(synthetic);
  manifestWithSynthetic.summary.total_manifest_entries += 1;
  manifestWithSynthetic.summary.absent_stub_authorizations += 1;
  const reportWithSynthetic = renderRewriteAudit(manifestWithSynthetic);
  assert.ok(reportWithSynthetic.includes('`wiki/reviewed-future-page.html`'));
  assert.ok(!reportWithSynthetic.includes('](../wiki/reviewed-future-page.html)'));
  assert.equal((reportWithSynthetic.match(/reviewed-future-page/g) || []).length, 1);
});
