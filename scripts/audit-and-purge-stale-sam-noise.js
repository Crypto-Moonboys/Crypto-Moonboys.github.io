#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const gate = require('./wiki-publish-gate.js');
const { isAliasSlug } = require('./wiki-aliases.js');

const ROOT = path.resolve(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const APPROVED_PAGES_PATH = path.join(ROOT, 'brand-canon', 'approved-pages.json');
const BLOCKED_PATTERNS_PATH = path.join(ROOT, 'brand-canon', 'blocked-patterns.json');
const SUMMARY_PATH = path.join(ROOT, 'js', 'wiki-purge-summary.json');

const REQUIRED_PROTECTED_PAGES = new Set([
  'hodl-x-warriors',
  'hodl-warriors',
  'hodl-wars',
  'graffpunks',
  'graffpunks-24-7-radio',
  'midevilpunks',
  '1m-free-nfts-program',
]);

const STALE_REFERENCE_FILES = [
  'js/wiki-index.json',
  'js/entity-map.json',
  'js/entity-graph.json',
  'sitemap.xml',
  'games/data/question_pack_001.json',
  'games/data/question_pack_002.json',
  'games/data/crystal-maze-seed.json',
];

function normalizeSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compileBlockedPatterns() {
  const config = loadJson(BLOCKED_PATTERNS_PATH);
  return (config.blocked_patterns || []).map((entry) => {
    const pattern = String(entry.pattern || '').trim();
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  });
}

function countStaleReferences(deletedSlugs) {
  if (deletedSlugs.length === 0) return 0;
  const patterns = deletedSlugs.map((slug) => `/wiki/${slug}.html`);
  let total = 0;
  for (const relPath of STALE_REFERENCE_FILES) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath, 'utf8');
    for (const p of patterns) {
      let from = 0;
      while (from !== -1) {
        from = content.indexOf(p, from);
        if (from === -1) break;
        total += 1;
        from += p.length;
      }
    }
  }
  return total;
}

function run() {
  if (!fs.existsSync(WIKI_DIR)) {
    throw new Error(`Missing wiki directory: ${WIKI_DIR}`);
  }

  const approvedConfig = loadJson(APPROVED_PAGES_PATH);
  const approvedSlugs = new Set((approvedConfig.approved_slugs || []).map(normalizeSlug).filter(Boolean));
  for (const slug of REQUIRED_PROTECTED_PAGES) approvedSlugs.add(slug);

  const blockedPatterns = compileBlockedPatterns();
  const canon = gate.loadBrandCanon();

  const wikiFiles = fs.readdirSync(WIKI_DIR).filter((file) => file.endsWith('.html') && file !== 'index.html');
  const scannedPages = wikiFiles.length;

  const toDelete = [];
  let protectedPages = 0;

  for (const file of wikiFiles) {
    const slug = normalizeSlug(path.basename(file, '.html'));
    const filePath = path.join(WIKI_DIR, `${slug}.html`);

    if (REQUIRED_PROTECTED_PAGES.has(slug)) {
      protectedPages += 1;
      continue;
    }

    const blockedByPattern = blockedPatterns.some((regex) => regex.test(slug));
    const blockedByPrefix = slug.startsWith('sam-');
    const approved = approvedSlugs.has(slug);
    const aliasDuplicate = isAliasSlug(slug) && !REQUIRED_PROTECTED_PAGES.has(slug);
    const gateResult = gate.classifyPage(slug, fs.readFileSync(filePath, 'utf8'), canon);
    const blockedByGate = String(gateResult.status || '').startsWith('BLOCKED_');

    const shouldDelete =
      blockedByPattern ||
      blockedByPrefix ||
      blockedByGate ||
      (!approved && !REQUIRED_PROTECTED_PAGES.has(slug)) ||
      aliasDuplicate;

    if (shouldDelete) {
      toDelete.push({ slug, filePath });
      continue;
    }

    if (approved) protectedPages += 1;
  }

  for (const entry of toDelete) {
    if (fs.existsSync(entry.filePath)) {
      fs.unlinkSync(entry.filePath);
    }
  }

  const deletedSlugs = toDelete.map((entry) => entry.slug);
  const staleReferencesRemaining = countStaleReferences(deletedSlugs);

  const summary = {
    scanned_pages: scannedPages,
    deleted_noise_pages: deletedSlugs.length,
    protected_pages: protectedPages,
    stale_references_remaining: staleReferencesRemaining,
  };

  const jsDir = path.join(ROOT, 'js');
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(JSON.stringify(summary));
  return summary;
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`[audit-and-purge-stale-sam-noise] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  REQUIRED_PROTECTED_PAGES,
  STALE_REFERENCE_FILES,
  run,
};
