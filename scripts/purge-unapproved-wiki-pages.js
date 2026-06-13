#!/usr/bin/env node
'use strict';

/**
 * scripts/purge-unapproved-wiki-pages.js
 *
 * Physically deletes wiki/*.html files that are classified as:
 *   BLOCKED_SYNTHETIC_SLUG
 *   BLOCKED_THIN_PAGE
 *   BLOCKED_DUPLICATE_CONCEPT
 *   NEEDS_BRAND_REVIEW  (when PURGE_REVIEW_NEEDED=true, which is the default)
 *
 * Only APPROVED_CANON_PAGE and APPROVED_ALIAS_REDIRECT pages are kept.
 *
 * Environment variables:
 *   PURGE_REVIEW_NEEDED=true|false  (default: true)
 *     When true, also deletes NEEDS_BRAND_REVIEW pages in addition to blocked pages.
 *
 * Outputs js/wiki-purge-summary.json with only aggregate counts — no slug landfill.
 *
 * Fails with non-zero exit if any blocked or (when PURGE_REVIEW_NEEDED) review page
 * remains on disk after the purge attempt.
 *
 * Run:  node scripts/purge-unapproved-wiki-pages.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const WIKI_DIR     = path.join(ROOT, 'wiki');
const AUDIT_PATH   = path.join(ROOT, 'js', 'wiki-publish-audit.json');
const SUMMARY_PATH = path.join(ROOT, 'js', 'wiki-purge-summary.json');

// Default: purge review-needed pages too (repo is already polluted).
const PURGE_REVIEW_NEEDED = process.env.PURGE_REVIEW_NEEDED !== 'false';

function run() {
  if (!fs.existsSync(AUDIT_PATH)) {
    console.error(
      '[purge-wiki] ERROR: js/wiki-publish-audit.json not found.\n' +
      '  Run "node scripts/wiki-publish-gate.js" first to classify pages.'
    );
    process.exit(1);
  }

  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));

  const blockedSlugs = (audit.blocked || []).map(e => e.slug);
  const reviewSlugs  = (audit.review  || []).map(e => e.slug);
  const approvedSet  = new Set((audit.approved || []).map(e => e.slug));

  const toPurge = [...blockedSlugs];
  if (PURGE_REVIEW_NEEDED) {
    toPurge.push(...reviewSlugs);
  }

  let purgedCount  = 0;
  let skippedCount = 0;
  const errors     = [];

  for (const slug of toPurge) {
    // Never delete an approved page even if it somehow appears in blocked/review.
    if (approvedSet.has(slug)) {
      console.warn(`[purge-wiki] SKIP (approved): ${slug}.html`);
      skippedCount++;
      continue;
    }

    const filePath = path.join(WIKI_DIR, `${slug}.html`);
    if (!fs.existsSync(filePath)) {
      // Already gone — that's fine.
      continue;
    }

    try {
      fs.unlinkSync(filePath);
      purgedCount++;
    } catch (err) {
      errors.push(`  ${slug}.html: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`[purge-wiki] ERROR: Failed to delete ${errors.length} file(s):\n${errors.join('\n')}`);
    process.exit(1);
  }

  // ── Verify no blocked/review files remain on disk ─────────────────────────

  const remaining = { blocked: [], review: [] };

  for (const slug of blockedSlugs) {
    if (fs.existsSync(path.join(WIKI_DIR, `${slug}.html`))) {
      remaining.blocked.push(slug);
    }
  }

  if (PURGE_REVIEW_NEEDED) {
    for (const slug of reviewSlugs) {
      if (fs.existsSync(path.join(WIKI_DIR, `${slug}.html`))) {
        remaining.review.push(slug);
      }
    }
  }

  const blockedRemaining = remaining.blocked.length;
  const reviewRemaining  = PURGE_REVIEW_NEEDED ? remaining.review.length : reviewSlugs.length;

  // ── Write summary-only output (no slug landfill) ──────────────────────────

  const summary = {
    _generated: new Date().toISOString(),
    purge_review_needed: PURGE_REVIEW_NEEDED,
    summary: {
      approved:           (audit.approved || []).length,
      purged:             purgedCount,
      skipped_approved:   skippedCount,
      blocked_remaining:  blockedRemaining,
      review_remaining:   reviewRemaining,
    },
  };

  const jsDir = path.join(ROOT, 'js');
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log(`[purge-wiki] Purge complete`);
  console.log(`  ✓ purged:             ${purgedCount}`);
  console.log(`  ✓ skipped (approved): ${skippedCount}`);
  console.log(`  ✗ blocked remaining:  ${blockedRemaining}`);
  console.log(`  ? review remaining:   ${reviewRemaining}`);
  console.log(`  → Summary written to js/wiki-purge-summary.json`);

  // Fail if any blocked page still physically exists.
  if (blockedRemaining > 0) {
    console.error(
      `[purge-wiki] FAIL: ${blockedRemaining} blocked page(s) still exist on disk:\n` +
      `  ${remaining.blocked.join(', ')}\n` +
      `  Remove them manually or check file permissions.`
    );
    process.exit(1);
  }

  // Fail if review pages remain and PURGE_REVIEW_NEEDED is active.
  if (PURGE_REVIEW_NEEDED && remaining.review.length > 0) {
    console.error(
      `[purge-wiki] FAIL: ${remaining.review.length} review page(s) still exist on disk:\n` +
      `  ${remaining.review.join(', ')}\n` +
      `  Remove them or set PURGE_REVIEW_NEEDED=false to skip review purge.`
    );
    process.exit(1);
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}
