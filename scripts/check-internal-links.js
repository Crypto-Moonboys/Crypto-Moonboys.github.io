#!/usr/bin/env node
/**
 * check-internal-links.js
 *
 * Scans all HTML files in:
 *   - repo root (*.html)
 *   - wiki/
 *   - categories/
 *   - about/
 *
 * Validates every internal link found in:
 *   <a href>, <img src>, <script src>, <link href>
 *
 * Ignores: http(s)://, #anchors, mailto:, javascript:, tel:
 *
 * Exits non-zero if any broken links are found.
 *
 * Usage: node scripts/check-internal-links.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Repo root is one level up from scripts/ ──────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Directories to scan ──────────────────────────────────────────────────────
const SCAN_DIRS = [
  REPO_ROOT,            // root *.html only (non-recursive)
  path.join(REPO_ROOT, 'wiki'),
  path.join(REPO_ROOT, 'categories'),
  path.join(REPO_ROOT, 'about'),
];

// ── Regex patterns to extract link/src values ────────────────────────────────
const LINK_PATTERNS = [
  /<a\s[^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
  /<img\s[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
  /<script\s[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
  /<link\s[^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return true if the URL should be ignored. */
function shouldIgnore(href) {
  return (
    /^https?:\/\//i.test(href) ||
    href.startsWith('#')        ||
    /^mailto:/i.test(href)      ||
    /^javascript:/i.test(href)  ||
    /^tel:/i.test(href)
  );
}

/**
 * Resolve an href relative to the file that contains it.
 * Returns the absolute filesystem path to check.
 * @param {string} href
 * @param {string} sourceFile
 * @param {Set<string>} existingPaths - pre-built set of known paths for extension probing
 */
function resolveHref(href, sourceFile, existingPaths) {
  // Strip query string and fragment
  const bare = href.split('?')[0].split('#')[0];
  if (!bare) return null;

  let resolved;
  if (bare.startsWith('/')) {
    // Absolute path from repo root
    resolved = path.join(REPO_ROOT, bare);
  } else {
    // Relative path from the source file's directory
    resolved = path.resolve(path.dirname(sourceFile), bare);
  }

  // If the path has no extension, try appending .html (common for links like href="/wiki/bitcoin")
  if (!path.extname(resolved)) {
    if (existingPaths.has(resolved + '.html')) return resolved + '.html';
    // Also check if it's a directory with index.html
    if (existingPaths.has(path.join(resolved, 'index.html'))) return path.join(resolved, 'index.html');
  }

  return resolved;
}

/** Collect all HTML files from a directory (non-recursive for root, recursive for sub-dirs). */
function collectHtmlFiles(dir, recursive) {
  if (!fs.existsSync(dir)) return [];

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...collectHtmlFiles(full, true));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.html') &&
      !entry.name.startsWith('_')  // skip template/draft files
    ) {
      results.push(full);
    }
  }
  return results;
}

/** Extract all href/src values from an HTML string. */
function extractLinks(html) {
  const links = [];
  for (const pattern of LINK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      links.push(match[1].trim());
    }
  }
  return links;
}

/** Recursively build a Set of all file paths under a directory. */
function buildFileSet(dir, result = new Set()) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      buildFileSet(full, result);
    } else {
      result.add(full);
    }
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // Gather all HTML files to scan
  const htmlFiles = [
    ...collectHtmlFiles(SCAN_DIRS[0], false),   // root — non-recursive
    ...collectHtmlFiles(SCAN_DIRS[1], true),     // wiki/
    ...collectHtmlFiles(SCAN_DIRS[2], true),     // categories/
    ...collectHtmlFiles(SCAN_DIRS[3], true),     // about/
  ];

  // Build a set of ALL files in the repo for fast existence checks
  const existingPaths = buildFileSet(REPO_ROOT);

  console.log(`Scanning ${htmlFiles.length} HTML file(s) for broken internal links...\n`);

  const broken = [];

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const links = extractLinks(html);

    for (const href of links) {
      if (shouldIgnore(href)) continue;

      const resolved = resolveHref(href, file, existingPaths);
      if (!resolved) continue;

      if (!existingPaths.has(resolved)) {
        broken.push({
          source:   path.relative(REPO_ROOT, file),
          target:   href,
          resolved: path.relative(REPO_ROOT, resolved),
        });
      }
    }
  }

  if (broken.length === 0) {
    console.log('✅  No broken internal links found.');
    process.exit(0);
  }

  console.error(`❌  Found ${broken.length} broken internal link(s):\n`);
  for (const b of broken) {
    console.error(`  Source:   ${b.source}`);
    console.error(`  Target:   ${b.target}`);
    console.error(`  Resolved: ${b.resolved}`);
    console.error('');
  }
  process.exit(1);
}

main();
