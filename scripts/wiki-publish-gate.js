'use strict';

/**
 * scripts/wiki-publish-gate.js
 *
 * Brand-canon publishing gate for the Crypto Moonboys wiki.
 *
 * Classifies every wiki/*.html page as one of:
 *   APPROVED_CANON_PAGE       — real brand/lore concept, safe to publish
 *   APPROVED_ALIAS_REDIRECT   — http-equiv refresh or data-wiki-stub redirect
 *   NEEDS_BRAND_REVIEW        — unknown concept, needs human review
 *   BLOCKED_THIN_PAGE         — fewer than MIN_WORD_COUNT meaningful words
 *   BLOCKED_SYNTHETIC_SLUG    — matches a blocked slug pattern (e.g. *-via-*)
 *   BLOCKED_DUPLICATE_CONCEPT — same concept already has a canonical page
 *
 * Outputs js/wiki-publish-audit.json with:
 *   - approved, blocked, review arrays
 *   - per-page reason and status
 *   - summary counts
 *
 * Run standalone:  node scripts/wiki-publish-gate.js
 * Require as module: const gate = require('./wiki-publish-gate.js');
 *                    gate.run();  // or gate.classifySlug(slug)
 *
 * This gate must run BEFORE:
 *   - generate-wiki-index.js
 *   - generate-entity-map.js
 *   - generate-entity-graph.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const WIKI_DIR        = path.join(ROOT, 'wiki');
const AUDIT_OUTPUT    = path.join(ROOT, 'js', 'wiki-publish-audit.json');
const BRAND_CANON_DIR = path.join(ROOT, 'brand-canon');

const MIN_WORD_COUNT = 250;

// ── Status constants ──────────────────────────────────────────────────────────

const STATUS = Object.freeze({
  APPROVED_CANON_PAGE:     'APPROVED_CANON_PAGE',
  APPROVED_ALIAS_REDIRECT: 'APPROVED_ALIAS_REDIRECT',
  NEEDS_BRAND_REVIEW:      'NEEDS_BRAND_REVIEW',
  BLOCKED_THIN_PAGE:       'BLOCKED_THIN_PAGE',
  BLOCKED_SYNTHETIC_SLUG:  'BLOCKED_SYNTHETIC_SLUG',
  BLOCKED_DUPLICATE_CONCEPT: 'BLOCKED_DUPLICATE_CONCEPT',
});

// ── Load brand-canon config ───────────────────────────────────────────────────

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadBrandCanon() {
  const blockedPatternsConfig = loadJson(path.join(BRAND_CANON_DIR, 'blocked-patterns.json')) || {};
  const approvedPagesConfig   = loadJson(path.join(BRAND_CANON_DIR, 'approved-pages.json'))   || {};
  const reviewNeededConfig    = loadJson(path.join(BRAND_CANON_DIR, 'review-needed.json'))     || {};
  const brandsConfig          = loadJson(path.join(BRAND_CANON_DIR, 'brands.json'))            || {};
  const loreRulesConfig       = loadJson(path.join(BRAND_CANON_DIR, 'lore-rules.json'))        || {};

  // Pre-compile blocked-pattern regexes once to avoid recompilation on every slug check.
  const blockedPatterns = (blockedPatternsConfig.blocked_patterns || []).map(entry => ({
    pattern: entry.pattern,
    reason:  entry.reason || `Matches blocked pattern "${entry.pattern}".`,
    regex:   patternToRegex(entry.pattern),
  }));

  // Normalize approved/review slugs on load so a malformed entry can't silently fail to match.
  const approvedSlugs = new Set(
    (approvedPagesConfig.approved_slugs || []).map(normalizeSlug).filter(Boolean)
  );
  const reviewSlugs = new Set(
    (reviewNeededConfig.review_needed_slugs || []).map(normalizeSlug).filter(Boolean)
  );

  // Extract brand IDs and their canonical/concept-type slugs from brands.json.
  // Auto-approve every canonical_page and concept_types value so the gate never
  // accidentally blocks pages that brands.json already identifies as canonical.
  const brandIds = [];
  for (const brand of (brandsConfig.brands || [])) {
    if (brand.id) brandIds.push(normalizeSlug(brand.id));

    if (brand.canonical_page) {
      const s = normalizeSlug(brand.canonical_page);
      if (s) approvedSlugs.add(s);
    }
    for (const conceptSlug of Object.values(brand.concept_types || {})) {
      const s = normalizeSlug(conceptSlug);
      if (s) approvedSlugs.add(s);
    }
  }

  // Extract generic words from lore-rules.json for the no-generic-standalone-pages rule.
  const genericWords = new Set();
  for (const rule of (loreRulesConfig.rules || [])) {
    if (rule.id === 'no-generic-standalone-pages') {
      for (const word of (rule.generic_words || [])) {
        const w = normalizeSlug(word);
        if (w) genericWords.add(w);
      }
    }
  }

  return { blockedPatterns, approvedSlugs, reviewSlugs, brandIds, genericWords };
}

// ── Slug utilities ────────────────────────────────────────────────────────────

function normalizeSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
}

/**
 * Convert a blocked-patterns glob pattern (supports only * wildcard) to a RegExp.
 * Patterns like '*-via-*' become /^.*-via-.*$/
 */
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp('^' + regexStr + '$');
}

/**
 * Returns the first matching compiled blocked-pattern entry for a slug, or null.
 * Expects blockedPatterns to be the pre-compiled array from loadBrandCanon()
 * (each element has { pattern, reason, regex }).
 */
function findBlockedPattern(slug, blockedPatterns) {
  for (const entry of blockedPatterns) {
    if (entry.regex.test(slug)) {
      return entry;
    }
  }
  return null;
}

// ── HTML analysis ─────────────────────────────────────────────────────────────

function isRedirectPage(html) {
  return /http-equiv=["']refresh["']/i.test(html) ||
         /data-wiki-stub=["']true["']/i.test(html);
}

function hasNeedsBrandReviewMarker(html) {
  return /NEEDS_BRAND_REVIEW/i.test(html);
}

/**
 * Count meaningful words in the HTML body (strips tags, script/style blocks).
 */
function countMeaningfulWords(html) {
  // Remove <script>...</script> and <style>...</style> blocks
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');

  const words = text.split(/\s+/).filter(w => w.length > 1);
  return words.length;
}

// ── Core classification ───────────────────────────────────────────────────────

/**
 * Classify a single wiki slug without reading any HTML.
 * Used for fast slug-only checks in tests and filters.
 *
 * @param {string} slug  — slug without .html extension
 * @param {object} canon — result of loadBrandCanon()
 * @returns {{ status: string, reason: string }}
 */
function classifySlug(slug, canon) {
  const normalized = normalizeSlug(slug);

  if (!normalized) {
    return { status: STATUS.BLOCKED_SYNTHETIC_SLUG, reason: 'Empty or invalid slug.' };
  }

  // Manually approved overrides everything
  if (canon.approvedSlugs.has(normalized)) {
    return { status: STATUS.APPROVED_CANON_PAGE, reason: 'Manually approved in brand-canon/approved-pages.json.' };
  }

  // Manually flagged for review
  if (canon.reviewSlugs.has(normalized)) {
    return { status: STATUS.NEEDS_BRAND_REVIEW, reason: 'Manually listed in brand-canon/review-needed.json.' };
  }

  // Blocked slug patterns (pre-compiled regexes; more-specific patterns come first)
  const matchedPattern = findBlockedPattern(normalized, canon.blockedPatterns);
  if (matchedPattern) {
    return {
      status: STATUS.BLOCKED_SYNTHETIC_SLUG,
      reason: matchedPattern.reason || `Matches blocked pattern "${matchedPattern.pattern}". Algorithmic keyword-bridge slug.`,
    };
  }

  // Duplicate-concept check: if the slug starts with a known brand ID (from brands.json)
  // but is NOT in the approved set, it is attempting to create a second page for a concept
  // that brands.json already covers with a distinct canonical slug.
  const matchedBrandId = (canon.brandIds || []).find(
    id => normalized === id || normalized.startsWith(id + '-')
  );
  if (matchedBrandId) {
    return {
      status: STATUS.BLOCKED_DUPLICATE_CONCEPT,
      reason: `Slug starts with brand ID "${matchedBrandId}" but is not the canonical page for any of that brand's concept types. Possible duplicate concept page.`,
    };
  }

  // Generic standalone word check (lore-rules no-generic-standalone-pages rule).
  // Exact generic words without a brand anchor are held for review, not blocked.
  if (canon.genericWords && canon.genericWords.has(normalized)) {
    return {
      status: STATUS.NEEDS_BRAND_REVIEW,
      reason: `"${normalized}" is a generic word with no brand anchor. Needs review to confirm it refers to an official project concept.`,
    };
  }

  // Default: unknown slugs require brand review
  return {
    status: STATUS.NEEDS_BRAND_REVIEW,
    reason: 'Slug not found in brand-canon/approved-pages.json. Needs manual brand review.',
  };
}

/**
 * Classify a wiki page given its slug and HTML content.
 *
 * @param {string} slug
 * @param {string} html
 * @param {object} canon — result of loadBrandCanon()
 * @returns {{ slug: string, status: string, reason: string, word_count: number }}
 */
function classifyPage(slug, html, canon) {
  const normalized = normalizeSlug(slug);

  // Check slug classification first — blocked patterns always win, even for redirects.
  // This ensures synthetic via-pages never enter the index even if they carry
  // a noindex meta or happen to look like redirect stubs.
  const slugResult = classifySlug(normalized, canon);

  // If slug is blocked, no further checks needed
  if (slugResult.status === STATUS.BLOCKED_SYNTHETIC_SLUG ||
      slugResult.status === STATUS.BLOCKED_DUPLICATE_CONCEPT) {
    return {
      slug: normalized,
      status: slugResult.status,
      reason: slugResult.reason,
      word_count: 0,
    };
  }

  // Redirect stubs are approved-alias (for non-blocked slugs)
  if (isRedirectPage(html)) {
    return {
      slug: normalized,
      status: STATUS.APPROVED_ALIAS_REDIRECT,
      reason: 'http-equiv refresh or data-wiki-stub redirect page.',
      word_count: 0,
    };
  }

  // HTML-level checks
  if (hasNeedsBrandReviewMarker(html)) {
    return {
      slug: normalized,
      status: STATUS.NEEDS_BRAND_REVIEW,
      reason: 'Page contains NEEDS_BRAND_REVIEW marker.',
      word_count: 0,
    };
  }

  const wordCount = countMeaningfulWords(html);

  // Thin page check (only for non-approved pages)
  if (slugResult.status !== STATUS.APPROVED_CANON_PAGE && wordCount < MIN_WORD_COUNT) {
    return {
      slug: normalized,
      status: STATUS.BLOCKED_THIN_PAGE,
      reason: `Page has only ${wordCount} meaningful words (minimum: ${MIN_WORD_COUNT}).`,
      word_count: wordCount,
    };
  }

  return {
    slug: normalized,
    status: slugResult.status,
    reason: slugResult.reason,
    word_count: wordCount,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the set of approved canonical URLs (e.g. '/wiki/graffpunks.html')
 * from the audit file.  Only APPROVED_CANON_PAGE and APPROVED_ALIAS_REDIRECT
 * entries are included.  Everything else is excluded from public discovery assets.
 *
 * Fails fast if the audit file does not exist.
 * Pass { allowMissing: true } only for first-run bootstrap contexts.
 *
 * @param {{ allowMissing?: boolean }} [opts]
 */
function loadApprovedUrls(opts) {
  if (!fs.existsSync(AUDIT_OUTPUT)) {
    if (opts && opts.allowMissing) return new Set();
    console.error(
      '[wiki-publish-gate] ERROR: js/wiki-publish-audit.json not found.\n' +
      '  Run "node scripts/wiki-publish-gate.js" first to generate the audit file,\n' +
      '  then re-run this script. Aborting to prevent non-approved pages leaking into generated assets.'
    );
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_OUTPUT, 'utf8'));
  return new Set((audit.approved || []).map(e => `/wiki/${e.slug}.html`));
}

/**
 * Return the set of ALL non-approved URLs from the audit file.
 * This includes BLOCKED_* and NEEDS_BRAND_REVIEW entries.
 * Used by validate-generated-assets.js to assert no non-approved URL appears
 * in any public discovery asset.
 *
 * @param {{ allowMissing?: boolean }} [opts]
 */
function loadNonApprovedUrls(opts) {
  if (!fs.existsSync(AUDIT_OUTPUT)) {
    if (opts && opts.allowMissing) return new Set();
    console.error(
      '[wiki-publish-gate] ERROR: js/wiki-publish-audit.json not found.\n' +
      '  Run "node scripts/wiki-publish-gate.js" first.'
    );
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_OUTPUT, 'utf8'));
  return new Set([
    ...(audit.blocked || []).map(e => `/wiki/${e.slug}.html`),
    ...(audit.review  || []).map(e => `/wiki/${e.slug}.html`),
  ]);
}

/**
 * Return the set of blocked canonical URLs from the audit file.
 * Fails fast if the audit file does not exist so that generate-wiki-index / entity pipelines
 * cannot silently run out-of-order and re-introduce blocked pages.
 * Pass { allowMissing: true } only in contexts where a missing audit is acceptable (e.g. first-run bootstrap).
 *
 * @param {{ allowMissing?: boolean }} [opts]
 */
function loadBlockedUrls(opts) {
  if (!fs.existsSync(AUDIT_OUTPUT)) {
    if (opts && opts.allowMissing) return new Set();
    console.error(
      '[wiki-publish-gate] ERROR: js/wiki-publish-audit.json not found.\n' +
      '  Run "node scripts/wiki-publish-gate.js" first to generate the audit file,\n' +
      '  then re-run this script. Aborting to prevent blocked pages leaking into generated assets.'
    );
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_OUTPUT, 'utf8'));
  return new Set((audit.blocked || []).map(e => `/wiki/${e.slug}.html`));
}

/**
 * Run the full gate: scan wiki/*.html, classify every page, write audit JSON.
 * Called automatically when this script is run directly.
 */
function run() {
  const canon = loadBrandCanon();

  if (!fs.existsSync(WIKI_DIR)) {
    console.error(`[wiki-publish-gate] ERROR: wiki directory not found: ${WIKI_DIR}`);
    process.exit(1);
  }

  const htmlFiles = fs.readdirSync(WIKI_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html');

  const approved  = [];
  const blocked   = [];
  const review    = [];

  for (const file of htmlFiles) {
    const slug = path.basename(file, '.html');
    const html = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
    const result = classifyPage(slug, html, canon);

    const entry = {
      slug:       result.slug,
      file:       file,
      status:     result.status,
      reason:     result.reason,
      word_count: result.word_count,
    };

    if (result.status === STATUS.APPROVED_CANON_PAGE ||
        result.status === STATUS.APPROVED_ALIAS_REDIRECT) {
      approved.push(entry);
    } else if (result.status === STATUS.NEEDS_BRAND_REVIEW) {
      review.push(entry);
    } else {
      // BLOCKED_*
      blocked.push(entry);
    }
  }

  // Sort each list for stable diffs
  const sortBySlug = (a, b) => a.slug.localeCompare(b.slug);
  approved.sort(sortBySlug);
  blocked.sort(sortBySlug);
  review.sort(sortBySlug);

  const audit = {
    _generated: new Date().toISOString(),
    summary: {
      total:            htmlFiles.length,
      approved:         approved.length,
      blocked:          blocked.length,
      needs_review:     review.length,
      blocked_synthetic_slug:    blocked.filter(e => e.status === STATUS.BLOCKED_SYNTHETIC_SLUG).length,
      blocked_thin_page:         blocked.filter(e => e.status === STATUS.BLOCKED_THIN_PAGE).length,
      blocked_duplicate_concept: blocked.filter(e => e.status === STATUS.BLOCKED_DUPLICATE_CONCEPT).length,
    },
    approved,
    blocked,
    review,
  };

  const jsDir = path.join(ROOT, 'js');
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });

  fs.writeFileSync(AUDIT_OUTPUT, JSON.stringify(audit, null, 2));

  console.log(`[wiki-publish-gate] Scanned ${htmlFiles.length} pages`);
  console.log(`  ✓ approved:       ${approved.length}`);
  console.log(`  ✗ blocked:        ${blocked.length}`);
  console.log(`  ? needs review:   ${review.length}`);
  console.log(`  → Audit written to js/wiki-publish-audit.json`);

  return audit;
}

module.exports = {
  STATUS,
  MIN_WORD_COUNT,
  classifySlug,
  classifyPage,
  loadBrandCanon,
  loadApprovedUrls,
  loadBlockedUrls,
  loadNonApprovedUrls,
  run,
};

if (require.main === module) {
  run();
}
