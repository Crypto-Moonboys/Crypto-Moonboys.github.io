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
  countCanonicalContentBlocks,
  countWords,
  extractArticleHtml,
  hasLegacyUnmarkedArticleContent,
  hasRootWikiStubMarker,
  htmlToVisibleText,
  listTopLevelWikiHtmlFiles,
  loadAbsentStubDeclarations,
  readTopLevelWikiHtmlFile,
  readCanonRevision,
  renderRewriteAudit,
  runCli,
  sourceTreeHashForPages,
  validateAbsentStubDeclarations,
  writeGeneratedArtifactsToDirectory,
} from './generate-wiki-content-state.mjs';
import { readHtmlAttribute, tokenizeActiveHtml } from './wiki-html-structure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('retired W81 evidence remains traceable without a live ZIP or public download link', () => {
  const ledgerPath = 'brand-canon/wiki-rewrites/w81-archive-retirement-20261004.md';
  assert.equal(fs.existsSync(path.join(ROOT, 'about', 'w81.zip')), false, 'the retired binary must not return to publication');
  const ledger = fs.readFileSync(path.join(ROOT, ledgerPath), 'utf8');
  assert.ok(ledger.includes('eb3f1902b8f5e8b8e20a16c18c925a072bf81699ca404f3abb04c4f5b9a34b96'));
  assert.ok(ledger.includes('/blob/44f180a6da267c6bc476c6ca6b777dd297ee1e65/about/w81.zip'), 'historical archive access must use an immutable commit');
  assert.equal([...ledger.matchAll(/^\| (?:M16|[Ww]\d+)\.txt \|/gm)].length, 94, 'all raw source identities remain recorded');

  const manifest = buildWikiAudit();
  assert.equal(manifest.canon_hierarchy.find(source => source.rank === 5).path, ledgerPath);
  for (const page of manifest.pages) {
    assert.ok((page.likely_source_family || []).every(source => !source.includes('about/w81.zip')), `${page.slug}: source inventory still depends on the ZIP`);
  }
  for (const file of listTopLevelWikiHtmlFiles(path.join(ROOT, 'wiki'))) {
    const source = fs.readFileSync(path.join(ROOT, 'wiki', file), 'utf8');
    for (const tag of tokenizeActiveHtml(source)) {
      if (tag.type !== 'tag' || tag.closing) continue;
      for (const attribute of ['href', 'src']) {
        const value = readHtmlAttribute(tag.raw, attribute);
        if (!value) continue;
        const pathname = decodeURIComponent(new URL(value, 'https://cryptomoonboys.com/').pathname);
        assert.ok(!/\/w81\.zip$/i.test(pathname), `${file}: retired archive download link ${value}`);
      }
    }
  }
});

test('canon revisions require complete ownership rather than a bare completion flag', () => {
  const opening = '<article class="wiki-content" data-canon-revision="1" data-canon-source-tier="first-witness+w81">';
  const owned = `${opening}${CANONICAL_CONTENT_BEGIN}<h1>History</h1><p>Reconciled article.</p>${CANONICAL_CONTENT_END}</article>`;
  assert.deepEqual(readCanonRevision(owned), { revision: 1, source_tier: 'first-witness+w81' });
  assert.equal(readCanonRevision('<article><p>Unreviewed archive.</p></article>'), null);
  assert.equal(readCanonRevision(`<article><div data-canon-revision="1" data-canon-source-tier="first-witness+w81">Unreviewed archive.</div></article>`), null);
  assert.throws(() => readCanonRevision(`${opening}<p>Unowned article.</p></article>`), /complete CANONICAL_CONTENT/);
  assert.throws(() => readCanonRevision(owned.replace('</article>', '<p>Unowned addition.</p></article>')), /unowned/);
  assert.throws(() => readCanonRevision(owned.replace('revision="1"', 'revision="0"')), /invalid canonical revision/);
  assert.throws(() => readCanonRevision(owned.replace('revision="1"', 'revision="1" data-canon-revision="2"')), /invalid canonical revision/);
  assert.throws(() => readCanonRevision(owned.replace('first-witness+w81', 'unreviewed-sam')), /invalid canonical revision/);
});

test('canon revisions reject mixed marker and attribute ownership blocks', () => {
  const opening = '<article class="wiki-content" data-canon-revision="1" data-canon-source-tier="first-witness+w81">';
  const owned = `${opening}${CANONICAL_CONTENT_BEGIN}<p>Reconciled history.</p>${CANONICAL_CONTENT_END}</article>`;
  for (const attribute of ['data-canonical-content="true"', 'data-canonical-content', 'data-canonical-content="TRUE"']) {
    const mixed = owned.replace('</article>', `<section ${attribute}><p>Separate canonical record.</p></section></article>`);
    assert.doesNotThrow(() => assertValidWikiContentTopology(mixed));
    assert.equal(hasLegacyUnmarkedArticleContent(mixed), false);
    assert.equal(countCanonicalContentBlocks(mixed), 2);
    assert.throws(() => readCanonRevision(mixed), /one complete CANONICAL_CONTENT block/);
  }
  const nested = owned.replace('<p>', '<p data-canonical-content="true">');
  assert.equal(countCanonicalContentBlocks(nested), 1);
  assert.deepEqual(readCanonRevision(nested), { revision: 1, source_tier: 'first-witness+w81' });
});

test('completed core-history rewrites leave the queue and retain their prose locks', () => {
  const manifest = buildWikiAudit();
  for (const slug of ['sacred-chain', 'triple-fork-event', 'genesis-kernel', 'graffiti-nexus', 'hard-fork-games']) {
    const page = manifest.pages.find(page => page.slug === slug);
    // Later approved prose edits advance the revision; the preservation audit
    // separately requires an increase against the exact publication baseline.
    assert.ok(Number.isSafeInteger(page.canon_revision) && page.canon_revision >= 2, slug);
    assert.equal(page.content_owner, 'canon');
    assert.equal(page.rewrite_status, 'KEEP');
    assert.equal(page.automation_policy, 'canon-locked');
    assert.equal(page.legacy_unmarked_content, false);
    assert.equal(page.canonical_content_block_count, 1);
    assert.equal(page.sam_content_block_count, 0);
    assert.equal(page.exact_duplicate_paragraph_count, 0);
    assert.equal(page.duplicate_heading_count, 0);
    assert.equal(page.likely_near_duplicate_sections.length, 0);
    const html = fs.readFileSync(path.join(ROOT, page.path), 'utf8');
    assert.ok(!html.includes('id="bible-content"'), `${slug} must not append legacy SAM bible records`);
  }
  assert.equal(manifest.pages.filter(page => page.first_witness_page).length, 82);
  assert.ok(manifest.pages.filter(page => page.first_witness_page).every(page => page.automation_policy === 'canon-locked'));
});

test('war-spine references own their prose and preserve distinct Army reading paths', () => {
  const manifest = buildWikiAudit();
  const slugs = ['bitcoin-kids', 'bitcoin-x-kids', 'bitcoin-kid-army', 'the-bitcoin-kid-army', 'hodl-warriors', 'hodl-x-warriors', 'hodl-wars'];
  for (const slug of slugs) {
    const page = manifest.pages.find(page => page.slug === slug);
    assert.ok(Number.isSafeInteger(page.canon_revision) && page.canon_revision >= 1, slug);
    assert.equal(page.canon_source_tier, 'first-witness+w81', slug);
    assert.equal(page.content_owner, 'canon', slug);
    assert.equal(page.rewrite_status, 'KEEP', slug);
    assert.equal(page.automation_policy, 'canon-locked', slug);
    assert.equal(page.legacy_unmarked_content, false, slug);
    assert.equal(page.canonical_content_block_count, 1, slug);
    assert.equal(page.exact_duplicate_paragraph_count, 0, slug);
    assert.equal(page.duplicate_heading_count, 0, slug);
    const html = fs.readFileSync(path.join(ROOT, page.path), 'utf8');
    assert.ok(!html.includes('id="bible-content"'), `${slug} cannot append legacy prose`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${slug} IDs stay unique`);
    const contents = html.match(/<details\b[^>]*class="[^"]*article-contents[\s\S]*?<\/details>/)?.[0];
    assert.ok(contents, `${slug} has native collapsible navigation`);
    const targets = [...contents.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
    const headings = [...extractArticleHtml(html).matchAll(/<h2\b[^>]*id="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(targets, headings, `${slug} contents covers every chapter in order`);
    assert.ok(targets.every(id => ids.includes(id)), `${slug} contents links resolve`);
    for (const fragment of html.matchAll(/href="(\/wiki\/[^"#?]+\.html)(?:#[^"]*)?"/g)) {
      assert.ok(fs.existsSync(path.join(ROOT, fragment[1])), `${slug} links to existing ${fragment[1]}`);
    }
  }
  const army = fs.readFileSync(path.join(ROOT, 'wiki/bitcoin-kid-army.html'), 'utf8');
  const history = fs.readFileSync(path.join(ROOT, 'wiki/the-bitcoin-kid-army.html'), 'utf8');
  assert.match(army, /href="\/wiki\/the-bitcoin-kid-army\.html"/);
  assert.match(history, /href="\/wiki\/bitcoin-kid-army\.html"/);
  assert.match(history, /<title>Bitcoin Kid Army — Escape Accounts/);
  for (const html of [army, history]) {
    for (const id of ['faction', 'known-facts', 'lore', 'real-world-basis', 'sources']) assert.ok(html.includes(`id="${id}"`), `Legacy Army anchor ${id} survives`);
  }
});

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
