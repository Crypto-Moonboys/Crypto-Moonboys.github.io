#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  inspectIncomingDuplication,
  runContentOwnershipAudit,
} from './audit-manual-content-preservation.mjs';
import {
  absentStubPage,
  articleContentHash,
  articleMarkupHash,
  hasLegacyUnmarkedArticleContent,
} from './generate-wiki-content-state.mjs';
import {
  CANONICAL_CONTENT_BEGIN,
  CANONICAL_CONTENT_END,
  computeSamContentHash,
  MANUAL_CONTENT_BEGIN,
  MANUAL_CONTENT_END,
  SAM_CONTENT_BEGIN,
  SAM_CONTENT_END,
  sha256Content,
} from './import-website-publish-payloads.mjs';

function makePage(slug, overrides = {}) {
  return {
    path: `wiki/${slug}.html`,
    slug,
    title: slug,
    page_exists: true,
    page_type: 'lore',
    current_word_count: 50,
    manual_content_block_count: 0,
    sam_content_block_count: 0,
    canonical_content_block_count: 0,
    legacy_unmarked_content: false,
    duplicate_heading_count: 0,
    exact_duplicate_paragraph_count: 0,
    likely_near_duplicate_sections: [],
    content_hash: `sha256:${'1'.repeat(64)}`,
    article_content_hash: `sha256:${'2'.repeat(64)}`,
    article_markup_hash: `sha256:${'6'.repeat(64)}`,
    article_markup_hash: `sha256:${'4'.repeat(64)}`,
    git_blob_oid: '3'.repeat(40),
    wiki_stub_marker_scope: null,
    first_witness_page: false,
    nft_template_generated_page: false,
    likely_lore_page: true,
    rewrite_status: 'KEEP',
    automation_policy: 'metadata-only',
    rewrite_cluster: 'Historical/archive pages',
    audit_notes: [],
    ...overrides,
  };
}

function runFixture({
  html,
  page,
  slug = page.slug,
  baseline = null,
  payload = null,
  canonProseChangeApproved = false,
}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-ownership-audit-'));
  const wikiDir = path.join(rootDir, 'wiki');
  const manifestPath = path.join(rootDir, 'brand-canon', 'wiki-content-state.json');
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(path.join(wikiDir, `${slug}.html`), html, 'utf8');
  const currentState = {
    summary: { total_pages_audited: 1 },
    pages: [page],
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(currentState)}\n`, 'utf8');
  const payloadDir = path.join(rootDir, 'website-publish-payloads');
  if (payload) {
    fs.mkdirSync(payloadDir, { recursive: true });
    fs.writeFileSync(path.join(payloadDir, `${payload.slug}.json`), `${JSON.stringify(payload)}\n`, 'utf8');
  }
  return runContentOwnershipAudit({
    rootDir,
    wikiDir,
    manifestPath,
    payloadDir,
    currentState,
    baseline,
    canonProseChangeApproved,
  });
}

function runManifestOnlyFixture({ manifestPages, currentPages, existingHtmlBySlug = {}, baseline = null }) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-ownership-absent-audit-'));
  const wikiDir = path.join(rootDir, 'wiki');
  const manifestPath = path.join(rootDir, 'brand-canon', 'wiki-content-state.json');
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  for (const [slug, html] of Object.entries(existingHtmlBySlug)) {
    fs.writeFileSync(path.join(wikiDir, `${slug}.html`), html, 'utf8');
  }
  const manifest = {
    summary: {
      total_pages_audited: 0,
      total_manifest_entries: manifestPages.length,
      absent_stub_authorizations: manifestPages.filter((page) => page.page_exists === false).length,
    },
    pages: manifestPages,
  };
  const currentState = {
    summary: {
      total_pages_audited: 0,
      total_manifest_entries: currentPages.length,
      absent_stub_authorizations: currentPages.filter((page) => page.page_exists === false).length,
    },
    pages: currentPages,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
  return runContentOwnershipAudit({
    rootDir,
    wikiDir,
    manifestPath,
    payloadDir: path.join(rootDir, 'website-publish-payloads'),
    currentState,
    baseline,
  });
}

const repeatedParagraph = 'This deliberately long paragraph contains enough characters to qualify for exact duplicate detection in the ownership audit.';

const samOnlyArticle = `<article>${SAM_CONTENT_BEGIN}<p>Owned SAM prose.</p>${SAM_CONTENT_END}</article>`;
assert.equal(hasLegacyUnmarkedArticleContent(samOnlyArticle), false);
assert.equal(
  hasLegacyUnmarkedArticleContent(
    `<article><p>Stale prose outside ownership.</p>${SAM_CONTENT_BEGIN}<p>Owned SAM prose.</p>${SAM_CONTENT_END}</article>`
  ),
  true,
  'unmarked prose beside a SAM block must remain review-only'
);
assert.equal(
  hasLegacyUnmarkedArticleContent(
    `<article>${MANUAL_CONTENT_BEGIN}<p>Manual prose.</p>${MANUAL_CONTENT_END}${SAM_CONTENT_BEGIN}<p>Owned SAM prose.</p>${SAM_CONTENT_END}</article>`
  ),
  false
);
assert.equal(
  hasLegacyUnmarkedArticleContent('<article><p>Unmarked prose remains review-only.</p></article>'),
  true
);
assert.equal(
  hasLegacyUnmarkedArticleContent('<article><p>Published witness prose.</p></article>', { firstWitnessPage: true }),
  false,
  'First Witness ownership is established by the mandatory repository lock'
);
assert.equal(
  hasLegacyUnmarkedArticleContent('<article><p>Known generated prose.</p></article>', { nftTemplateGeneratedPage: true }),
  false,
  'known NFT/generated ownership is an explicit legacy classification exception'
);
console.log('PASS legacy-unmarked detection inspects prose outside ownership blocks');

const declaredAbsentStub = absentStubPage('declared-absent-stub');
const declaredAbsentResult = runManifestOnlyFixture({
  manifestPages: [declaredAbsentStub],
  currentPages: [declaredAbsentStub],
});
assert.deepEqual(declaredAbsentResult.failures, []);

const undeclaredAbsentResult = runManifestOnlyFixture({
  manifestPages: [absentStubPage('undeclared-absent-stub')],
  currentPages: [],
});
assert.ok(undeclaredAbsentResult.failures.some((failure) =>
  failure.includes('not declared by the current generated content state')
));

const mutatedAbsentResult = runManifestOnlyFixture({
  manifestPages: [{ ...declaredAbsentStub, content_hash: `sha256:${'a'.repeat(64)}` }],
  currentPages: [declaredAbsentStub],
});
assert.ok(mutatedAbsentResult.failures.some((failure) => failure.includes('absent stub content_hash must be null')));

const falselyAbsentResult = runManifestOnlyFixture({
  manifestPages: [declaredAbsentStub],
  currentPages: [declaredAbsentStub],
  existingHtmlBySlug: {
    'declared-absent-stub': '<article><p>This page now exists.</p></article>',
  },
});
assert.ok(falselyAbsentResult.failures.some((failure) =>
  failure.includes('manifest declares an absent stub but the wiki HTML file exists')
));
console.log('PASS absent-stub manifest entries must be declared, exact, and null-identity');

const consumedStubPage = makePage('consumed-absent-stub', {
  page_type: 'stub',
  current_word_count: 3,
  sam_content_block_count: 1,
  automation_policy: 'stub-allowed',
  wiki_stub_marker_scope: 'body',
  nft_template_generated_page: true,
  likely_lore_page: false,
  rewrite_status: 'GENERATED',
  rewrite_cluster: 'Generated/non-lore pages',
});
const consumedStubResult = runFixture({
  page: consumedStubPage,
  html: `<body data-wiki-stub="true"><article>${SAM_CONTENT_BEGIN}<p>Short generated stub.</p>${SAM_CONTENT_END}</article></body>`,
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [absentStubPage('consumed-absent-stub')] },
  },
});
assert.deepEqual(consumedStubResult.failures, [], 'an authorization may become one valid body-marked short stub');

const consumedAsFullPage = makePage('consumed-as-full-page', {
  current_word_count: 400,
  sam_content_block_count: 1,
  automation_policy: 'replace-sam-block',
});
const consumedAsFullResult = runFixture({
  page: consumedAsFullPage,
  html: `<article>${SAM_CONTENT_BEGIN}<p>${Array.from({ length: 400 }, () => 'prose').join(' ')}</p>${SAM_CONTENT_END}</article>`,
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [absentStubPage('consumed-as-full-page')] },
  },
  canonProseChangeApproved: true,
});
assert.ok(consumedAsFullResult.failures.some((failure) =>
  failure.includes('absent-stub authorization') && failure.includes('cannot be consumed by a full article')
));
console.log('PASS absent-stub authorization consumption is limited to a body-marked short stub');

const incoming = inspectIncomingDuplication(`
  <h2>Repeated section</h2>
  <p>${repeatedParagraph}</p>
  <h2>Repeated section</h2>
  <p>${repeatedParagraph}</p>
`);
assert.equal(incoming.incoming_exact_duplicate_paragraph_count, 1);
assert.equal(incoming.incoming_duplicate_heading_count, 1);

const preservedCollision = inspectIncomingDuplication(
  `<h2>Owner section</h2><p>${repeatedParagraph}</p>`,
  `<article>${MANUAL_CONTENT_BEGIN}<h2>Owner section</h2><p>${repeatedParagraph}</p>${MANUAL_CONTENT_END}` +
    `${SAM_CONTENT_BEGIN}<h2>Replace me</h2><p>Old bot text that is not owner text.</p>${SAM_CONTENT_END}</article>`
);
assert.equal(preservedCollision.paragraphs_repeated_from_preserved_content.length, 1);
assert.equal(preservedCollision.headings_repeated_from_preserved_content.length, 1);
console.log('PASS incoming exact duplicates and collisions with preserved prose are detected');

const legacyPage = makePage('known-legacy', {
  legacy_unmarked_content: true,
  exact_duplicate_paragraph_count: 1,
  rewrite_status: 'DEDUPE',
});
const legacyResult = runFixture({
  page: legacyPage,
  html: `<article><h1>Known legacy</h1><p>${repeatedParagraph}</p><p>${repeatedParagraph}</p></article>`,
});
assert.deepEqual(legacyResult.failures, [], 'recorded legacy duplicate debt must not make the untouched archive unbuildable');
assert.ok(legacyResult.warnings.some((warning) => warning.includes('recorded audit debt')));
console.log('PASS recorded legacy duplicate debt reports without rewriting or failing');

const increasedDuplicatePage = makePage('duplicate-ratchet', {
  exact_duplicate_paragraph_count: 2,
  rewrite_status: 'DEDUPE',
});
const baselineDuplicatePage = makePage('duplicate-ratchet', {
  exact_duplicate_paragraph_count: 1,
  rewrite_status: 'DEDUPE',
});
const increasedDuplicateResult = runFixture({
  page: increasedDuplicatePage,
  html: `<article>${MANUAL_CONTENT_BEGIN}<p>Ratchet fixture.</p>${MANUAL_CONTENT_END}</article>`,
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [baselineDuplicatePage] },
  },
});
assert.ok(increasedDuplicateResult.failures.some((failure) => failure.includes('exact_duplicate_paragraph_count increased from 1 to 2')));
console.log('PASS exact duplicate debt cannot increase by regenerating the manifest');

const deletedBaselinePage = makePage('deleted-baseline-page', {
  automation_policy: 'canon-locked',
});
const deletedBaselineResult = runManifestOnlyFixture({
  manifestPages: [],
  currentPages: [],
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [deletedBaselinePage] },
  },
});
assert.ok(deletedBaselineResult.failures.some((failure) =>
  failure.includes('existing baseline page disappeared') && failure.includes('deleted-baseline-page')
));

const demotedBaselineResult = runManifestOnlyFixture({
  manifestPages: [absentStubPage('deleted-baseline-page')],
  currentPages: [absentStubPage('deleted-baseline-page')],
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [deletedBaselinePage] },
  },
});
assert.ok(demotedBaselineResult.failures.some((failure) =>
  failure.includes('became an absent-stub authorization') && failure.includes('deleted-baseline-page')
));
console.log('PASS existing baseline pages cannot disappear or become absent stubs after manifest regeneration');

const nearDuplicatePage = makePage('near-duplicate-report', {
  likely_near_duplicate_sections: [{ first_heading: 'A', second_heading: 'B' }],
});
const nearDuplicateResult = runFixture({
  page: nearDuplicatePage,
  html: `<article>${MANUAL_CONTENT_BEGIN}<p>Near duplicate fixture.</p>${MANUAL_CONTENT_END}</article>`,
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [makePage('near-duplicate-report')] },
  },
});
assert.deepEqual(nearDuplicateResult.failures, [], 'near-duplicate increases must remain report-only');
assert.ok(nearDuplicateResult.warnings.some((warning) => warning.includes('report-only manual review')));
console.log('PASS near-duplicate increases report without failing or modifying text');

const changedProtectedPage = makePage('protected-direct-edit', {
  automation_policy: 'metadata-only',
  article_content_hash: `sha256:${'4'.repeat(64)}`,
});
const protectedBaselinePage = makePage('protected-direct-edit', {
  automation_policy: 'metadata-only',
  article_content_hash: `sha256:${'5'.repeat(64)}`,
});
const protectedEditResult = runFixture({
  page: changedProtectedPage,
  html: `<article>${MANUAL_CONTENT_BEGIN}<p>Protected direct-edit fixture.</p>${MANUAL_CONTENT_END}</article>`,
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [protectedBaselinePage] },
  },
});
assert.ok(protectedEditResult.failures.some((failure) =>
  failure.includes('Protected article prose changed') && failure.includes('protected-direct-edit')
));
console.log('PASS direct article edits to protected pages fail by default');

const approvedProtectedEditResult = runFixture({
  page: changedProtectedPage,
  html: `<article>${MANUAL_CONTENT_BEGIN}<p>Protected direct-edit fixture.</p>${MANUAL_CONTENT_END}</article>`,
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [protectedBaselinePage] },
  },
  canonProseChangeApproved: true,
});
assert.deepEqual(approvedProtectedEditResult.failures, []);
assert.ok(approvedProtectedEditResult.warnings.some((warning) =>
  warning.includes('Explicit canon prose change approval accepted') && warning.includes('protected-direct-edit')
));
console.log('PASS explicit canon prose approval allows and reports protected hash changes');

const visibleWitnessHtml = '<article><p>First Witness canon remains visible.</p></article>';
const hiddenWitnessHtml = '<article hidden><p>First Witness canon remains visible.</p></article>';
assert.equal(articleContentHash(visibleWitnessHtml), articleContentHash(hiddenWitnessHtml));
const hiddenWitnessPage = makePage('first-witness-markup-ratchet', {
  first_witness_page: true,
  likely_lore_page: true,
  rewrite_status: 'FIRST_WITNESS_LOCKED',
  automation_policy: 'canon-locked',
  rewrite_cluster: 'Core cosmology / history',
  article_content_hash: articleContentHash(hiddenWitnessHtml),
  article_markup_hash: articleMarkupHash(hiddenWitnessHtml),
});
const visibleWitnessPage = {
  ...hiddenWitnessPage,
  article_content_hash: articleContentHash(visibleWitnessHtml),
  article_markup_hash: articleMarkupHash(visibleWitnessHtml),
};
const hiddenWitnessResult = runFixture({
  page: hiddenWitnessPage,
  html: hiddenWitnessHtml,
  baseline: { revision: 'base-fixture', manifest: { pages: [visibleWitnessPage] } },
});
assert.ok(hiddenWitnessResult.failures.some((failure) =>
  failure.includes('Protected article prose changed') && failure.includes('article_markup_hash')
));
const approvedHiddenWitnessResult = runFixture({
  page: hiddenWitnessPage,
  html: hiddenWitnessHtml,
  baseline: { revision: 'base-fixture', manifest: { pages: [visibleWitnessPage] } },
  canonProseChangeApproved: true,
});
assert.deepEqual(approvedHiddenWitnessResult.failures, []);
console.log('PASS protected root markup visibility changes require canon prose approval');

const reclassifiedPage = makePage('rewrite-classification-ratchet', {
  rewrite_status: 'KEEP',
  rewrite_cluster: 'Generated/non-lore pages',
});
const reclassifiedBaseline = makePage('rewrite-classification-ratchet', {
  rewrite_status: 'REWRITE_FULL',
  rewrite_cluster: 'Bitcoin KiD / Bitcoin Kids / Bitcoin X Kids',
});
const reclassifiedResult = runFixture({
  page: reclassifiedPage,
  html: '<article><p>Unchanged high-risk queue prose.</p></article>',
  baseline: { revision: 'base-fixture', manifest: { pages: [reclassifiedBaseline] } },
});
assert.ok(reclassifiedResult.failures.some((failure) =>
  failure.includes('rewrite classification changed without explicit canon prose change approval')
));
const approvedReclassifiedResult = runFixture({
  page: reclassifiedPage,
  html: '<article><p>Unchanged high-risk queue prose.</p></article>',
  baseline: { revision: 'base-fixture', manifest: { pages: [reclassifiedBaseline] } },
  canonProseChangeApproved: true,
});
assert.deepEqual(approvedReclassifiedResult.failures, []);
console.log('PASS rewrite status and cluster reclassification requires canon prose approval');

const protectedToStubPage = makePage('protected-to-stub', {
  page_type: 'stub',
  automation_policy: 'stub-allowed',
  wiki_stub_marker_scope: 'body',
  legacy_unmarked_content: false,
});
const protectedToStubResult = runFixture({
  page: protectedToStubPage,
  html: '<body data-wiki-stub="true"><article><p>Protected archive prose.</p></article></body>',
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [makePage('protected-to-stub')] },
  },
  canonProseChangeApproved: true,
});
assert.ok(protectedToStubResult.failures.some((failure) =>
  failure.includes('cannot escalate to stub-allowed')
));
console.log('PASS protected existing pages cannot acquire stub authority, even with canon approval');

const protectedToSamPage = makePage('protected-to-sam', {
  sam_content_block_count: 1,
  automation_policy: 'replace-sam-block',
  legacy_unmarked_content: false,
});
const protectedToSamHtml = `<article>${SAM_CONTENT_BEGIN}<p>Approved SAM-owned prose.</p>${SAM_CONTENT_END}</article>`;
const protectedToSamBaseline = {
  revision: 'base-fixture',
  manifest: { pages: [makePage('protected-to-sam')] },
};
const unapprovedProtectedToSamResult = runFixture({
  page: protectedToSamPage,
  html: protectedToSamHtml,
  baseline: protectedToSamBaseline,
});
assert.ok(unapprovedProtectedToSamResult.failures.some((failure) =>
  failure.includes('cannot escalate to replace-sam-block without explicit canon prose change approval')
));

const approvedProtectedToSamResult = runFixture({
  page: protectedToSamPage,
  html: protectedToSamHtml,
  baseline: protectedToSamBaseline,
  canonProseChangeApproved: true,
});
assert.deepEqual(approvedProtectedToSamResult.failures, []);
assert.ok(approvedProtectedToSamResult.warnings.some((warning) =>
  warning.includes('accepted protected-to-replace-sam-block transition for protected-to-sam')
));

const invalidApprovedProtectedToSamResult = runFixture({
  page: makePage('protected-to-sam-invalid', {
    manual_content_block_count: 1,
    automation_policy: 'replace-sam-block',
    legacy_unmarked_content: false,
  }),
  html: `<article>${MANUAL_CONTENT_BEGIN}<p>Manual prose is not a SAM block.</p>${MANUAL_CONTENT_END}</article>`,
  baseline: {
    revision: 'base-fixture',
    manifest: { pages: [makePage('protected-to-sam-invalid')] },
  },
  canonProseChangeApproved: true,
});
assert.ok(invalidApprovedProtectedToSamResult.failures.some((failure) =>
  failure.includes('approved protected-to-replace-sam-block transition is structurally invalid')
));
console.log('PASS protected pages need approval and valid structure before replace-sam-block authority');

const multipleSamPage = makePage('multiple-sam', {
  sam_content_block_count: 2,
  automation_policy: 'replace-sam-block',
});
const multipleSamResult = runFixture({
  page: multipleSamPage,
  html: `<article>${SAM_CONTENT_BEGIN}<p>First SAM block.</p>${SAM_CONTENT_END}${SAM_CONTENT_BEGIN}<p>Second SAM block.</p>${SAM_CONTENT_END}</article>`,
});
assert.ok(multipleSamResult.failures.some((failure) => failure.includes('more than one SAM_CONTENT block')));
console.log('PASS multiple SAM blocks fail');

const multipleCanonicalPage = makePage('multiple-canonical', {
  canonical_content_block_count: 2,
  automation_policy: 'canon-locked',
});
const multipleCanonicalResult = runFixture({
  page: multipleCanonicalPage,
  html: `<article>${CANONICAL_CONTENT_BEGIN}<p>First canonical block.</p>${CANONICAL_CONTENT_END}${CANONICAL_CONTENT_BEGIN}<p>Second canonical block.</p>${CANONICAL_CONTENT_END}</article>`,
});
assert.ok(multipleCanonicalResult.failures.some((failure) => failure.includes('more than one CANONICAL_CONTENT block')));
console.log('PASS multiple canonical blocks fail');

const canonicalAttributePage = makePage('multiple-canonical-attributes', {
  canonical_content_block_count: 2,
  automation_policy: 'canon-locked',
});
const canonicalAttributeResult = runFixture({
  page: canonicalAttributePage,
  html: '<article><section data-canonical-content="true"><p>One canonical article block.</p></section><section data-canonical-content="true"><p>Another canonical article block.</p></section></article>',
});
assert.ok(canonicalAttributeResult.failures.some((failure) => failure.includes('more than one canonical article-content block')));
console.log('PASS multiple data-canonical-content blocks fail');

const lockedSamPage = makePage('locked-with-sam', {
  sam_content_block_count: 1,
  automation_policy: 'canon-locked',
});
const lockedSamResult = runFixture({
  page: lockedSamPage,
  html: `<article>${SAM_CONTENT_BEGIN}<p>Automated prose cannot live on a locked page.</p>${SAM_CONTENT_END}</article>`,
});
assert.ok(lockedSamResult.failures.some((failure) => failure.includes('canon-locked pages must not contain automated SAM prose')));
console.log('PASS automated prose at rest on locked pages fails');

const legacyAlongsideSamPage = makePage('legacy-alongside-sam', {
  sam_content_block_count: 1,
  legacy_unmarked_content: true,
  automation_policy: 'replace-sam-block',
});
const legacyAlongsideSamResult = runFixture({
  page: legacyAlongsideSamPage,
  html: `<article><p>Stale legacy prose remains outside the managed block.</p>${SAM_CONTENT_BEGIN}<p>Managed SAM prose.</p>${SAM_CONTENT_END}</article>`,
});
assert.ok(legacyAlongsideSamResult.failures.some((failure) =>
  failure.includes('legacy-unmarked article content cannot enter the automated prose path') &&
  failure.includes('replace-sam-block')
));
console.log('PASS residual legacy prose blocks replace-sam automation at rest');

const oversizedStubResult = runFixture({
  page: makePage('oversized-stub', {
    page_type: 'stub',
    current_word_count: 251,
    automation_policy: 'stub-allowed',
    wiki_stub_marker_scope: 'body',
    likely_lore_page: false,
    rewrite_status: 'GENERATED',
    rewrite_cluster: 'Generated/non-lore pages',
  }),
  html: `<body data-wiki-stub="true"><article data-wiki-stub="true"><p>${Array.from({ length: 251 }, () => 'word').join(' ')}</p></article></body>`,
});
assert.ok(oversizedStubResult.failures.some((failure) =>
  failure.includes('stub-allowed page has 251 visible words')
));

const ownedStubResult = runFixture({
  page: makePage('owned-stub', {
    page_type: 'stub',
    current_word_count: 4,
    manual_content_block_count: 1,
    automation_policy: 'stub-allowed',
    wiki_stub_marker_scope: 'body',
    likely_lore_page: false,
    rewrite_status: 'GENERATED',
    rewrite_cluster: 'Generated/non-lore pages',
  }),
  html: `<body data-wiki-stub="true"><article data-wiki-stub="true">${MANUAL_CONTENT_BEGIN}<p>Protected stub prose.</p>${MANUAL_CONTENT_END}</article></body>`,
});
assert.ok(ownedStubResult.failures.some((failure) =>
  failure.includes('stub-allowed page must not contain MANUAL_CONTENT or CANONICAL_CONTENT')
));

const samStubResult = runFixture({
  page: makePage('sam-stub', {
    page_type: 'stub',
    current_word_count: 3,
    sam_content_block_count: 1,
    automation_policy: 'stub-allowed',
    wiki_stub_marker_scope: 'body',
    likely_lore_page: false,
    rewrite_status: 'GENERATED',
    rewrite_cluster: 'Generated/non-lore pages',
  }),
  html: `<body data-wiki-stub="true"><article data-wiki-stub="true">${SAM_CONTENT_BEGIN}<p>Short SAM stub.</p>${SAM_CONTENT_END}</article></body>`,
});
assert.deepEqual(samStubResult.failures, [], 'one short SAM block is valid for a JS-managed stub');
console.log('PASS at-rest stub policy enforces visible size and rejects protected owners while allowing one SAM block');

const siblingRootResult = runFixture({
  page: makePage('sibling-root'),
  html: '<article class="wiki-content"><p>Protected root.</p></article><article><p>Injected sibling lore.</p></article>',
});
assert.ok(siblingRootResult.failures.some((failure) =>
  failure.includes('multiple sibling article/wiki-content roots')
));

const wrappedArticleResult = runFixture({
  page: makePage('sam-wraps-article', {
    sam_content_block_count: 1,
    automation_policy: 'replace-sam-block',
  }),
  html: `<div class="wiki-content">${SAM_CONTENT_BEGIN}<article><p>Nested article.</p></article>${SAM_CONTENT_END}</div>`,
});
assert.ok(wrappedArticleResult.failures.some((failure) =>
  failure.includes('SAM_CONTENT block must not wrap an article element')
));
console.log('PASS audit rejects sibling canonical roots and invalid ownership topology');

const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-ownership-symlink-'));
const symlinkWikiDir = path.join(symlinkRoot, 'wiki');
fs.mkdirSync(symlinkWikiDir);
const outsideWikiPage = path.join(symlinkRoot, 'outside.html');
fs.writeFileSync(outsideWikiPage, '<article><p>Outside-root prose.</p></article>', 'utf8');
fs.symlinkSync(outsideWikiPage, path.join(symlinkWikiDir, 'linked.html'));
const symlinkResult = runContentOwnershipAudit({
  rootDir: symlinkRoot,
  wikiDir: symlinkWikiDir,
  manifestPath: path.join(symlinkRoot, 'brand-canon', 'wiki-content-state.json'),
  payloadDir: path.join(symlinkRoot, 'website-publish-payloads'),
  currentState: { summary: { total_pages_audited: 0 }, pages: [] },
  baseline: null,
});
assert.ok(symlinkResult.failures.some((failure) => failure.includes('symlinked wiki HTML is forbidden')));
fs.rmSync(symlinkRoot, { recursive: true, force: true });
console.log('PASS symlinked wiki HTML is rejected before audit or hashing');

const sameHashArticle = '<h2>Managed section</h2><p>This managed paragraph is stable and deliberately long enough for the ownership test fixture.</p>';
const sameHashHtml = `<article>${SAM_CONTENT_BEGIN}\n${sameHashArticle}\n${SAM_CONTENT_END}</article>`;
const sameHashPayload = {
  publish_mode: 'middle_content_only',
  slug: 'same-hash',
  title: 'Same hash',
  description: 'Same-hash ownership test.',
  category: 'Lore',
  article_html: sameHashArticle,
};
sameHashPayload.expected_content_hash = sha256Content(Buffer.from(sameHashHtml, 'utf8'));
sameHashPayload.content_hash = computeSamContentHash(sameHashPayload);
const sameHashPage = makePage('same-hash', {
  sam_content_block_count: 1,
  automation_policy: 'replace-sam-block',
  content_hash: sameHashPayload.expected_content_hash,
});
const sameHashResult = runFixture({
  page: sameHashPage,
  html: sameHashHtml,
  payload: sameHashPayload,
});
assert.ok(sameHashResult.failures.some((failure) => failure.includes('pending same-hash prose payload is a redundant no-op')));
console.log('PASS pending same-hash writes are explicitly rejected as redundant no-ops');

const witnessPage = makePage('first-witness-contract-test', {
  first_witness_page: true,
  rewrite_status: 'KEEP',
  automation_policy: 'metadata-only',
});
const witnessResult = runFixture({
  page: witnessPage,
  html: `<article>${MANUAL_CONTENT_BEGIN}<p>Witness fixture text remains unchanged.</p>${MANUAL_CONTENT_END}</article>`,
});
assert.ok(witnessResult.failures.some((failure) => failure.includes('First Witness article prose must be canon-locked')));
console.log('PASS First Witness lock policy is mandatory');

const unbalancedPage = makePage('unbalanced', { sam_content_block_count: 1, automation_policy: 'replace-sam-block' });
const unbalancedResult = runFixture({
  page: unbalancedPage,
  html: `<article>${SAM_CONTENT_BEGIN}<p>Missing end marker.</p></article>`,
});
assert.ok(unbalancedResult.failures.some((failure) => failure.includes('unbalanced SAM_CONTENT markers')));
console.log('PASS unbalanced ownership markers fail');

console.log('\naudit-manual-content-preservation.test.mjs passed');
