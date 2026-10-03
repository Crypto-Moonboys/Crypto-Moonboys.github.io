#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as publisher from './import-website-publish-payloads.mjs';
import { validatePayloadDirectory } from './validate-website-publish-payloads.mjs';
import {
  MAX_STUB_ARTICLE_WORDS,
  REPORT_CLUSTERS,
  assertValidWikiContentTopology,
  buildWikiAudit,
  countCanonicalContentBlocks,
  extractArticleHtml,
  findDuplicateHeadings,
  findExactDuplicateParagraphs,
  findLikelyNearDuplicateSections,
  htmlToVisibleText,
  listTopLevelWikiHtmlFiles,
  readTopLevelWikiHtmlFile,
  removeRelatedWikiPaths,
} from './generate-wiki-content-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const CONTENT_STATE_PATH = path.join(ROOT, publisher.CONTENT_STATE_MANIFEST_FILE || 'brand-canon/wiki-content-state.json');
const PAYLOAD_DIR = path.join(ROOT, 'website-publish-payloads');
const RELATED_BEGIN = '<!-- RELATED_WIKI_PATHS:BEGIN -->';
const RELATED_END = '<!-- RELATED_WIKI_PATHS:END -->';
const REWRITE_STATUSES = new Set([
  'KEEP',
  'REWRITE_FULL',
  'RECONCILE',
  'DEDUPE',
  'EXPAND',
  'ARCHIVE_STYLE',
  'GENERATED',
  'NFT_SPECIALIST',
  'FIRST_WITNESS_LOCKED',
  'NEEDS_HUMAN_REVIEW',
]);
const REWRITE_CLUSTERS = new Set(REPORT_CLUSTERS);
const AUTOMATION_POLICIES = new Set(
  publisher.AUTOMATION_POLICIES || ['metadata-only', 'replace-sam-block', 'canon-locked', 'stub-allowed']
);
const MANIFEST_STATE_FIELDS = [
  'path',
  'slug',
  'page_exists',
  'page_type',
  'current_word_count',
  'manual_content_block_count',
  'sam_content_block_count',
  'canonical_content_block_count',
  'legacy_unmarked_content',
  'duplicate_heading_count',
  'exact_duplicate_paragraph_count',
  'content_hash',
  'article_content_hash',
  'article_markup_hash',
  'git_blob_oid',
  'wiki_stub_marker_scope',
  'first_witness_page',
  'nft_template_generated_page',
  'likely_lore_page',
  'rewrite_status',
  'automation_policy',
  'rewrite_cluster',
  'content_owner',
  'canon_revision',
  'canon_source_tier',
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function markerCount(html, marker) {
  if (!marker) return 0;
  return (String(html || '').match(new RegExp(escapeRegex(marker), 'gi')) || []).length;
}

function markerDefinitions() {
  return [
    ['MANUAL_CONTENT', publisher.MANUAL_CONTENT_BEGIN, publisher.MANUAL_CONTENT_END, false],
    ['SAM_CONTENT', publisher.SAM_CONTENT_BEGIN, publisher.SAM_CONTENT_END, true],
    ['CANONICAL_CONTENT', publisher.CANONICAL_CONTENT_BEGIN, publisher.CANONICAL_CONTENT_END, true],
  ];
}

function hasArticleContent(html) {
  if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(html)) return false;
  if (/<meta\b(?=[^>]*name=["']robots["'])(?=[^>]*content=["'][^"']*\bnoindex\b)[^>]*>/i.test(html)) return false;
  if (/\bdata-wiki-stub=["']true["']/i.test(html)) return false;
  return Boolean(extractArticleHtml(html));
}

function hasOwnershipMarker(html) {
  return markerDefinitions().some(([, begin]) => markerCount(html, begin) > 0)
    || countCanonicalContentBlocks(html) > 0;
}

function normalizeDuplicateText(value) {
  return htmlToVisibleText(value).replace(/\s+/gu, ' ').trim().toLowerCase();
}

function tagTexts(html, tagPattern) {
  const clean = removeRelatedWikiPaths(html);
  const pattern = new RegExp(`<(?:${tagPattern})\\b[^>]*>([\\s\\S]*?)<\\/(?:${tagPattern})\\s*>`, 'gi');
  return [...clean.matchAll(pattern)].map((match) => normalizeDuplicateText(match[1])).filter(Boolean);
}

function duplicateIntersections(left, right) {
  const rightSet = new Set(right);
  return [...new Set(left.filter((item) => rightSet.has(item)))];
}

function removeMarkedBlock(html, begin, end) {
  if (!begin || !end) return String(html || '');
  return String(html || '').replace(
    new RegExp(`${escapeRegex(begin)}[\\s\\S]*?${escapeRegex(end)}`, 'gi'),
    ' '
  );
}

export function inspectIncomingDuplication(articleHtml, existingHtml = '') {
  const incomingParagraphs = tagTexts(articleHtml, 'p').filter((text) => text.length >= 40);
  const incomingHeadings = tagTexts(articleHtml, 'h[2-6]');
  const preservedHtml = removeMarkedBlock(existingHtml, publisher.SAM_CONTENT_BEGIN, publisher.SAM_CONTENT_END);
  const preservedArticle = extractArticleHtml(preservedHtml);
  const preservedParagraphs = tagTexts(preservedArticle, 'p').filter((text) => text.length >= 40);
  const preservedHeadings = tagTexts(preservedArticle, 'h[2-6]');

  return {
    incoming_exact_duplicate_paragraph_count: findExactDuplicateParagraphs(articleHtml).length,
    incoming_duplicate_heading_count: findDuplicateHeadings(articleHtml).length,
    paragraphs_repeated_from_preserved_content: duplicateIntersections(incomingParagraphs, preservedParagraphs),
    headings_repeated_from_preserved_content: duplicateIntersections(incomingHeadings, preservedHeadings),
    incoming_likely_near_duplicate_sections: findLikelyNearDuplicateSections(articleHtml),
  };
}

function auditMarkerStructure(relPath, html, failures) {
  for (const [label, begin, end, singleBlockOnly] of markerDefinitions()) {
    const beginCount = markerCount(html, begin);
    const endCount = markerCount(html, end);
    if (beginCount !== endCount) {
      failures.push(`${relPath}: unbalanced ${label} markers (${beginCount} begin, ${endCount} end)`);
    }
    if (singleBlockOnly && beginCount > 1) {
      failures.push(`${relPath}: more than one ${label} block is invalid`);
    }
  }
  if (countCanonicalContentBlocks(html) > 1) {
    failures.push(`${relPath}: more than one canonical article-content block is invalid`);
  }
  try {
    assertValidWikiContentTopology(html, relPath);
  } catch (error) {
    failures.push(error.message);
  }
}

function auditPreservation(relPath, html, failures, warnings) {
  if (!hasArticleContent(html)) return;

  const manualBlock = publisher.getManualContentBlock(html);
  if (!hasOwnershipMarker(html)) {
    warnings.push(`${relPath}: article has no inline ownership marker; repository policy must reject unauthorized automated prose writes.`);
    if (!manualBlock) failures.push(`${relPath}: unmarked article content would not be preserved as legacy website truth`);
    if (manualBlock && !manualBlock.includes(publisher.MANUAL_CONTENT_BEGIN)) {
      failures.push(`${relPath}: unmarked article content must be wrapped with MANUAL_CONTENT begin marker`);
    }
    if (manualBlock && !manualBlock.includes(publisher.MANUAL_CONTENT_END)) {
      failures.push(`${relPath}: unmarked article content must be wrapped with MANUAL_CONTENT end marker`);
    }
    if (manualBlock && !manualBlock.includes(publisher.LEGACY_PRESERVED_CONTENT_NOTE)) {
      failures.push(`${relPath}: unmarked article content must carry the legacy-preserved content note`);
    }
  }

  if (manualBlock) {
    if (manualBlock.includes(RELATED_BEGIN) || manualBlock.includes(RELATED_END)) {
      failures.push(`${relPath}: generated Related Wiki Paths must not be captured as manual truth`);
    }
    if (!htmlToVisibleText(manualBlock)) failures.push(`${relPath}: manual content block is empty after stripping markup`);
  }
}

function readManifest(manifestPath, failures) {
  if (!fs.existsSync(manifestPath)) {
    failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: required content-state manifest is missing`);
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(parsed.pages)) {
      failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: pages must be an array`);
      return null;
    }
    return parsed;
  } catch (error) {
    failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: invalid JSON: ${error.message}`);
    return null;
  }
}

function gitOutput(rootDir, args) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function readBaselineManifest(rootDir) {
  const candidates = [];
  for (const value of [process.env.BASE_SHA, process.env.GITHUB_BASE_SHA]) {
    if (/^[a-f0-9]{7,40}$/i.test(value || '') && !/^0+$/.test(value)) candidates.push(value);
  }
  const mergeBase = gitOutput(rootDir, ['merge-base', 'HEAD', 'origin/main']);
  const head = gitOutput(rootDir, ['rev-parse', 'HEAD']);
  if (mergeBase && mergeBase !== head) candidates.push(mergeBase);
  candidates.push('HEAD^');

  for (const revision of [...new Set(candidates)]) {
    const raw = gitOutput(rootDir, ['show', `${revision}:${publisher.CONTENT_STATE_MANIFEST_FILE}`]);
    if (!raw) continue;
    try {
      const manifest = JSON.parse(raw);
      if (Array.isArray(manifest.pages)) return { manifest, revision };
    } catch {
      // Try the next safe, local git baseline.
    }
  }
  return null;
}

function isValidBodyMarkedStubState(page) {
  return page?.page_exists === true
    && page.page_type === 'stub'
    && page.wiki_stub_marker_scope === 'body'
    && page.automation_policy === 'stub-allowed'
    && Number(page.current_word_count || 0) <= MAX_STUB_ARTICLE_WORDS
    && Number(page.manual_content_block_count || 0) === 0
    && Number(page.canonical_content_block_count || 0) === 0
    && Number(page.sam_content_block_count || 0) <= 1
    && page.first_witness_page === false;
}

function isValidReplaceSamState(page) {
  return page?.page_exists === true
    && page.sam_content_block_count === 1
    && page.legacy_unmarked_content === false
    && page.first_witness_page === false;
}

function auditBaselineRatchet(currentState, baseline, failures, warnings, canonProseChangeApproved) {
  if (!baseline?.manifest?.pages) return;
  const baselineBySlug = new Map(baseline.manifest.pages.map((page) => [page.slug, page]));
  const currentBySlug = new Map(currentState.pages.map((page) => [page.slug, page]));
  for (const previous of baseline.manifest.pages) {
    if (!previous || previous.page_exists === false || typeof previous.slug !== 'string') continue;
    const current = currentBySlug.get(previous.slug);
    if (!current || current.page_exists === false) {
      failures.push(
        `${previous.path || `wiki/${previous.slug}.html`}: existing baseline page disappeared or became an absent-stub authorization ` +
        `relative to ${baseline.revision || 'the supplied baseline'}; wiki page deletion/rename cannot bypass the content ownership ratchet`
      );
    }
  }
  const protectedArticleChanges = [];
  for (const page of currentState.pages) {
    const previous = baselineBySlug.get(page.slug);
    const consumedAbsentAuthorization = previous?.page_exists === false && page.page_exists === true;
    if (consumedAbsentAuthorization && !isValidBodyMarkedStubState(page)) {
      failures.push(
        `${page.path}: an absent-stub authorization may only become an existing body-marked stub with ` +
        `automation_policy stub-allowed, at most ${MAX_STUB_ARTICLE_WORDS} visible words, and no manual/canonical owner; ` +
        'it cannot be consumed by a full article or replace-sam-block page'
      );
    }

    for (const field of ['exact_duplicate_paragraph_count', 'duplicate_heading_count']) {
      const previousCount = Number(previous?.[field] || 0);
      if (page[field] > previousCount) {
        failures.push(`${page.path}: ${field} increased from ${previousCount} to ${page[field]} relative to ${baseline.revision || 'the supplied baseline'}`);
      }
    }

    // One block establishes ownership. Increases beyond one are always invalid,
    // while the 0 -> 1 transition remains available to an explicitly authorized
    // first ownership/stub or later canon PR.
    for (const field of ['sam_content_block_count', 'canonical_content_block_count']) {
      const previousCount = Number(previous?.[field] || 0);
      const permittedCount = Math.max(1, previousCount);
      if (page[field] > permittedCount) {
        failures.push(`${page.path}: ${field} increased beyond the single-block ownership limit (${previousCount} to ${page[field]})`);
      }
    }

    const previousNearCount = Array.isArray(previous?.likely_near_duplicate_sections)
      ? previous.likely_near_duplicate_sections.length
      : 0;
    const currentNearCount = Array.isArray(page.likely_near_duplicate_sections)
      ? page.likely_near_duplicate_sections.length
      : 0;
    if (currentNearCount > previousNearCount) {
      warnings.push(`${page.path}: likely near-duplicate section findings increased from ${previousNearCount} to ${currentNearCount}; report-only manual review required`);
    }

    const previousExisting = previous && previous.page_exists !== false;
    if (previousExisting && Number.isSafeInteger(previous.canon_revision)) {
      if (!Number.isSafeInteger(page.canon_revision) || page.canon_revision < previous.canon_revision) {
        failures.push(`${page.path}: a completed canon revision cannot be removed or decreased`);
      } else if (page.article_content_hash !== previous.article_content_hash
        && page.canon_revision <= previous.canon_revision) {
        failures.push(`${page.path}: changed canonical prose must increment canon_revision`);
      }
    }
    const protectedExistingPolicy = previousExisting
      && ['metadata-only', 'canon-locked'].includes(previous.automation_policy);
    if (protectedExistingPolicy && page.automation_policy === 'stub-allowed') {
      failures.push(
        `${page.path}: protected automation_policy ${previous.automation_policy} cannot escalate to stub-allowed; ` +
        'an existing protected page cannot acquire stub write authority'
      );
    }
    if (
      previousExisting
      && previous.automation_policy !== page.automation_policy
      && page.automation_policy === 'replace-sam-block'
    ) {
      if (!canonProseChangeApproved) {
        failures.push(
          `${page.path}: protected automation_policy ${previous.automation_policy} cannot escalate to replace-sam-block ` +
          'without explicit canon prose change approval'
        );
      } else if (!isValidReplaceSamState(page)) {
        failures.push(
          `${page.path}: approved protected-to-replace-sam-block transition is structurally invalid; ` +
          'the existing non-First-Witness page must contain exactly one SAM_CONTENT block and no legacy-unmarked prose'
        );
      } else {
        warnings.push(`Explicit canon prose change approval accepted protected-to-replace-sam-block transition for ${page.slug}`);
      }
    }
    if (
      previousExisting
      && previous.automation_policy !== page.automation_policy
      && page.automation_policy === 'stub-allowed'
      && !protectedExistingPolicy
    ) {
      if (!canonProseChangeApproved) {
        failures.push(
          `${page.path}: automation_policy ${previous.automation_policy} cannot transition to stub-allowed ` +
          'without explicit canon prose change approval'
        );
      } else if (!isValidBodyMarkedStubState(page)) {
        failures.push(`${page.path}: approved transition to stub-allowed is not a valid body-marked short stub`);
      } else {
        warnings.push(`Explicit canon prose change approval accepted transition to stub-allowed for ${page.slug}`);
      }
    }
    if (
      previousExisting
      && previous.automation_policy === 'canon-locked'
      && page.automation_policy === 'metadata-only'
    ) {
      if (canonProseChangeApproved) {
        warnings.push(`Explicit canon prose change approval accepted canon-locked to metadata-only transition for ${page.slug}`);
      } else {
        failures.push(
          `${page.path}: canon-locked cannot transition to metadata-only without explicit canon prose change approval`
        );
      }
    }

    if (previousExisting) {
      const classificationChanges = ['rewrite_status', 'rewrite_cluster']
        .filter((field) => page[field] !== previous[field]);
      if (classificationChanges.length > 0) {
        const detail = classificationChanges
          .map((field) => `${field} ${JSON.stringify(previous[field])} -> ${JSON.stringify(page[field])}`)
          .join(', ');
        if (canonProseChangeApproved) {
          warnings.push(`Explicit canon prose change approval accepted rewrite classification change for ${page.slug}: ${detail}`);
        } else {
          failures.push(
            `${page.path}: rewrite classification changed without explicit canon prose change approval: ${detail}`
          );
        }
      }
    }

    const protectedPolicy = ['metadata-only', 'canon-locked'].includes(page.automation_policy)
      || ['metadata-only', 'canon-locked'].includes(previous?.automation_policy);
    if (previous && protectedPolicy) {
      const changedHashFields = [];
      if (page.article_content_hash !== previous.article_content_hash) {
        changedHashFields.push('article_content_hash');
      }
      // Older manifests can be adopted without a one-time all-page approval;
      // once present, article-markup-v1 is a mandatory protected identity.
      if (
        previous.article_markup_hash !== undefined
        && page.article_markup_hash !== previous.article_markup_hash
      ) {
        changedHashFields.push('article_markup_hash');
      }
      if (changedHashFields.length > 0) {
        protectedArticleChanges.push({ slug: page.slug, fields: changedHashFields });
      }
    }
  }

  if (protectedArticleChanges.length > 0) {
    const slugs = protectedArticleChanges
      .sort((left, right) => left.slug.localeCompare(right.slug))
      .map(({ slug, fields }) => `${slug} (${fields.join(', ')})`)
      .join(', ');
    if (canonProseChangeApproved) {
      warnings.push(`Explicit canon prose change approval accepted for protected slug(s): ${slugs}`);
    } else {
      failures.push(
        `Protected article prose changed relative to ${baseline.revision || 'the supplied baseline'} for slug(s): ${slugs}. ` +
        'A maintainer must apply the canon-prose-change-approved PR label; automated/default writes remain rejected.'
      );
    }
  }
}

function auditManifest(manifest, currentState, failures, warnings, baseline, canonProseChangeApproved) {
  if (!manifest) return;

  const expectedCount = currentState?.summary?.total_pages_audited;
  if (manifest.summary?.total_pages_audited !== expectedCount) {
    failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: total_pages_audited=${JSON.stringify(manifest.summary?.total_pages_audited)}, current wiki count=${expectedCount}`);
  }
  if (
    Object.prototype.hasOwnProperty.call(manifest.summary || {}, 'total_manifest_entries') &&
    manifest.summary.total_manifest_entries !== manifest.pages.length
  ) {
    failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: total_manifest_entries=${JSON.stringify(manifest.summary.total_manifest_entries)}, manifest page entries=${manifest.pages.length}`);
  }
  const absentStubCount = manifest.pages.filter((page) => page?.page_exists === false).length;
  if (
    Object.prototype.hasOwnProperty.call(manifest.summary || {}, 'absent_stub_authorizations') &&
    manifest.summary.absent_stub_authorizations !== absentStubCount
  ) {
    failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: absent_stub_authorizations=${JSON.stringify(manifest.summary.absent_stub_authorizations)}, manifest absent stubs=${absentStubCount}`);
  }

  const actualBySlug = new Map(currentState.pages.map((page) => [page.slug, page]));
  const manifestBySlug = new Map();
  for (const page of manifest.pages) {
    if (!page || typeof page.slug !== 'string' || !page.slug) {
      failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: every page entry must have a slug`);
      continue;
    }
    if (manifestBySlug.has(page.slug)) {
      failures.push(`${publisher.CONTENT_STATE_MANIFEST_FILE}: duplicate page entry for ${page.slug}`);
      continue;
    }
    manifestBySlug.set(page.slug, page);

    if (typeof page.page_exists !== 'boolean') {
      failures.push(`${page.path || page.slug}: page_exists must be an explicit boolean`);
    }
    if (page.page_exists === false) {
      if (page.automation_policy !== 'stub-allowed') {
        failures.push(`${page.path || page.slug}: absent pages must use automation_policy stub-allowed`);
      }
      for (const field of ['content_hash', 'article_content_hash', 'article_markup_hash', 'git_blob_oid']) {
        if (page[field] !== null) failures.push(`${page.path || page.slug}: absent stub ${field} must be null`);
      }
      if (page.slug === 'the-first-witness' || page.slug.startsWith('first-witness-')) {
        failures.push(`${page.path || page.slug}: First Witness cannot be an absent-stub target`);
      }
    }

    const actual = actualBySlug.get(page.slug);
    if (!actual) {
      failures.push(`${page.path || page.slug}: manifest entry is not declared by the current generated content state`);
      continue;
    }
    for (const field of MANIFEST_STATE_FIELDS) {
      if (page[field] !== actual[field]) {
        failures.push(`${actual.path}: manifest ${field}=${JSON.stringify(page[field])}, current audit=${JSON.stringify(actual[field])}`);
      }
    }
    if (JSON.stringify(page.likely_near_duplicate_sections) !== JSON.stringify(actual.likely_near_duplicate_sections)) {
      failures.push(`${actual.path}: manifest likely_near_duplicate_sections does not match the current audit`);
    }
    if (!REWRITE_STATUSES.has(page.rewrite_status)) {
      failures.push(`${actual.path}: invalid rewrite_status ${JSON.stringify(page.rewrite_status)}`);
    }
    if (!AUTOMATION_POLICIES.has(page.automation_policy)) {
      failures.push(`${actual.path}: invalid automation_policy ${JSON.stringify(page.automation_policy)}`);
    }
    if (!REWRITE_CLUSTERS.has(page.rewrite_cluster)) {
      failures.push(`${actual.path}: invalid rewrite_cluster ${JSON.stringify(page.rewrite_cluster)}`);
    }

    if (page.sam_content_block_count > 1) failures.push(`${actual.path}: more than one SAM_CONTENT block is invalid`);
    if (page.canonical_content_block_count > 1) failures.push(`${actual.path}: more than one CANONICAL_CONTENT block is invalid`);
    if (page.sam_content_block_count > 0 && page.exact_duplicate_paragraph_count > 0) {
      failures.push(`${actual.path}: SAM-managed article contains exact duplicate paragraphs`);
    }
    if (page.sam_content_block_count > 0 && page.duplicate_heading_count > 0) {
      failures.push(`${actual.path}: SAM-managed article contains repeated headings/sections`);
    }
    if (['metadata-only', 'canon-locked'].includes(page.automation_policy) && page.sam_content_block_count > 0) {
      failures.push(`${actual.path}: ${page.automation_policy} pages must not contain automated SAM prose`);
    }
    if (
      page.legacy_unmarked_content &&
      ['replace-sam-block', 'stub-allowed'].includes(page.automation_policy)
    ) {
      failures.push(
        `${actual.path}: legacy-unmarked article content cannot enter the automated prose path ` +
        `under automation_policy ${page.automation_policy}`
      );
    }
    if (page.automation_policy === 'stub-allowed') {
      if (Number(actual.current_word_count || 0) > MAX_STUB_ARTICLE_WORDS) {
        failures.push(
          `${actual.path}: stub-allowed page has ${actual.current_word_count} visible words; ` +
          `maximum is ${MAX_STUB_ARTICLE_WORDS}`
        );
      }
      if (actual.manual_content_block_count > 0 || actual.canonical_content_block_count > 0) {
        failures.push(`${actual.path}: stub-allowed page must not contain MANUAL_CONTENT or CANONICAL_CONTENT ownership`);
      }
      if (page.page_exists === true && !isValidBodyMarkedStubState(actual)) {
        failures.push(`${actual.path}: existing stub-allowed page must be a valid body-marked short stub`);
      }
    }

    const firstWitness = page.slug === 'the-first-witness' || page.slug.startsWith('first-witness-');
    if (firstWitness && (page.automation_policy !== 'canon-locked' || page.rewrite_status !== 'FIRST_WITNESS_LOCKED')) {
      failures.push(`${actual.path}: First Witness article prose must be canon-locked / FIRST_WITNESS_LOCKED`);
    }

    if (page.exact_duplicate_paragraph_count > 0) {
      warnings.push(`${actual.path}: ${page.exact_duplicate_paragraph_count} exact duplicate paragraph occurrence(s) are recorded audit debt`);
    }
    if (page.duplicate_heading_count > 0) {
      warnings.push(`${actual.path}: ${page.duplicate_heading_count} repeated heading occurrence(s) are recorded audit debt`);
    }
    if (page.likely_near_duplicate_sections?.length > 0) {
      warnings.push(`${actual.path}: ${page.likely_near_duplicate_sections.length} likely near-duplicate section pair(s) reported for manual review`);
    }
  }

  for (const actual of currentState.pages) {
    if (!manifestBySlug.has(actual.slug)) failures.push(`${actual.path}: missing from ${publisher.CONTENT_STATE_MANIFEST_FILE}`);
  }
  auditBaselineRatchet(currentState, baseline, failures, warnings, canonProseChangeApproved);
}

function auditPayloadDuplication(payload, existingHtml, failures, warnings) {
  if (payload.publish_mode !== 'middle_content_only' || typeof payload.article_html !== 'string') return;
  const result = inspectIncomingDuplication(payload.article_html, existingHtml);
  const prefix = `website-publish-payloads/${payload.slug}.json`;
  if (result.incoming_exact_duplicate_paragraph_count > 0) {
    failures.push(`${prefix}: incoming article contains ${result.incoming_exact_duplicate_paragraph_count} exact duplicate paragraph occurrence(s)`);
  }
  if (result.incoming_duplicate_heading_count > 0) {
    failures.push(`${prefix}: incoming article contains ${result.incoming_duplicate_heading_count} repeated heading/section occurrence(s)`);
  }
  if (result.paragraphs_repeated_from_preserved_content.length > 0) {
    failures.push(`${prefix}: incoming article repeats ${result.paragraphs_repeated_from_preserved_content.length} paragraph(s) already present outside the replaceable SAM block`);
  }
  if (result.headings_repeated_from_preserved_content.length > 0) {
    failures.push(`${prefix}: incoming article repeats ${result.headings_repeated_from_preserved_content.length} heading(s) already present outside the replaceable SAM block`);
  }
  if (result.incoming_likely_near_duplicate_sections.length > 0) {
    warnings.push(`${prefix}: ${result.incoming_likely_near_duplicate_sections.length} likely near-duplicate section pair(s) require review; no prose was modified`);
  }
}

export function runContentOwnershipAudit({
  rootDir = ROOT,
  wikiDir = path.join(rootDir, 'wiki'),
  manifestPath = path.join(rootDir, publisher.CONTENT_STATE_MANIFEST_FILE || 'brand-canon/wiki-content-state.json'),
  payloadDir = path.join(rootDir, 'website-publish-payloads'),
  currentState = null,
  baseline = undefined,
  canonProseChangeApproved = process.env.CANON_PROSE_CHANGE_APPROVED === '1',
} = {}) {
  const failures = [];
  const warnings = [];
  if (!fs.existsSync(wikiDir)) {
    return { skipped: true, failures, warnings, wikiPages: 0, contentPages: 0, markedPages: 0, legacyUnmarkedPages: 0, payloadCount: 0 };
  }

  let wikiFiles;
  try {
    wikiFiles = listTopLevelWikiHtmlFiles(wikiDir);
  } catch (error) {
    failures.push(error?.message || String(error));
    return { skipped: false, failures, warnings, wikiPages: 0, contentPages: 0, markedPages: 0, legacyUnmarkedPages: 0, payloadCount: 0 };
  }

  const state = currentState || (path.resolve(rootDir) === ROOT ? buildWikiAudit() : null);
  if (!state) failures.push('A current content-state audit must be supplied when auditing a non-repository root.');
  const manifest = readManifest(manifestPath, failures);
  const resolvedBaseline = baseline === undefined ? readBaselineManifest(rootDir) : baseline;
  if (state) auditManifest(manifest, state, failures, warnings, resolvedBaseline, canonProseChangeApproved);

  const wikiFileSet = new Set(wikiFiles);
  for (const page of manifest?.pages || []) {
    if (page?.page_exists === false && wikiFileSet.has(`${page.slug}.html`)) {
      failures.push(`${page.path || page.slug}: manifest declares an absent stub but the wiki HTML file exists`);
    }
  }
  let contentPages = 0;
  let markedPages = 0;
  let legacyUnmarkedPages = 0;
  for (const fileName of wikiFiles) {
    const relPath = `wiki/${fileName}`;
    const html = readTopLevelWikiHtmlFile(wikiDir, fileName).toString('utf8');
    auditMarkerStructure(relPath, html, failures);
    if (!hasArticleContent(html)) continue;
    contentPages += 1;
    if (hasOwnershipMarker(html)) markedPages += 1;
    else legacyUnmarkedPages += 1;
    auditPreservation(relPath, html, failures, warnings);
  }

  let payloadCount = 0;
  try {
    const validation = validatePayloadDirectory(payloadDir);
    if (!validation.skipped) {
      const payloads = validation.payloads.map(({ payload }) => payload);
      payloadCount = payloads.length;
      for (const payload of payloads) {
        const pageFileName = `${payload.slug}.html`;
        const existingHtml = wikiFileSet.has(pageFileName)
          ? readTopLevelWikiHtmlFile(wikiDir, pageFileName).toString('utf8')
          : '';
        auditPayloadDuplication(payload, existingHtml, failures, warnings);
      }
      if (typeof publisher.planContentOwnershipUpdates !== 'function') {
        failures.push('Content ownership preflight is unavailable; automated payloads cannot be validated safely.');
      } else {
        const plans = publisher.planContentOwnershipUpdates(payloads, rootDir);
        for (const plan of plans) {
          if (plan.action === 'no-op') {
            failures.push(`${plan.relPagePath}: pending same-hash prose payload is a redundant no-op (${plan.reason || 'unchanged content'})`);
          }
        }
      }
    }
  } catch (error) {
    if (Array.isArray(error?.failures)) failures.push(...error.failures);
    else failures.push(error?.message || String(error));
  }

  return {
    skipped: false,
    failures,
    warnings,
    wikiPages: wikiFiles.length,
    contentPages,
    markedPages,
    legacyUnmarkedPages,
    payloadCount,
  };
}

function cli() {
  const result = runContentOwnershipAudit({ wikiDir: WIKI_DIR, manifestPath: CONTENT_STATE_PATH, payloadDir: PAYLOAD_DIR });
  if (result.skipped) {
    console.log('Content ownership audit skipped: wiki/ folder does not exist.');
    return;
  }
  if (result.warnings.length) {
    console.warn(`Content ownership audit warnings (${result.warnings.length}):`);
    const priorityWarnings = result.warnings.filter((warning) =>
      warning.startsWith('Explicit canon prose change approval accepted') ||
      warning.includes('report-only manual review required')
    );
    const routineWarnings = result.warnings.filter((warning) => !priorityWarnings.includes(warning));
    for (const warning of [...priorityWarnings, ...routineWarnings].slice(0, 30)) console.warn(`- ${warning}`);
    if (result.warnings.length > 30) {
      console.warn(`- ... ${result.warnings.length - 30} more recorded findings; see brand-canon/wiki-rewrite-audit.md.`);
    }
  }
  if (result.failures.length) {
    console.error(`Content ownership audit failed with ${result.failures.length} issue(s):`);
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Content ownership audit passed: ${result.wikiPages} wiki pages matched the repository manifest; ` +
    `${result.contentPages} articles checked, ${result.markedPages} marked, ` +
    `${result.legacyUnmarkedPages} unmarked and protected from automated prose, ` +
    `${result.payloadCount} pending payload(s) preflighted.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) cli();
