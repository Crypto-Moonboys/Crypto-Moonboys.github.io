#!/usr/bin/env node
'use strict';

/**
 * scripts/wiki-index-drift-regression.test.mjs
 *
 * Regression test to prevent silent shrinkage of the wiki search index.
 * 
 * Ensures:
 *   1. Index size >= approved audit count (minus intentional exclusions)
 *   2. Required root pages are indexed (waxcash, about, categories, etc.)
 *   3. Specific canonical pages are indexed (gkniftyheads, graffpunks, nbg token, charlie buster)
 *
 * Run: node scripts/wiki-index-drift-regression.test.mjs
 * Exit code 0 = all tests pass
 * Exit code 1 = at least one test fails
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// NOTE: Root pages list is maintained as REQUIRED_ROOT_PAGES here because this is an ES module
// (.mjs) and cannot directly import the CommonJS root-pages-config.js via require().
// A regression test below (verifyRootPagesMatch) ensures this list stays in sync with
// scripts/root-pages-config.js by comparing the extracted paths.
const REQUIRED_ROOT_PAGES = [
  '/waxcash.html',
  '/about.html',
  '/categories/index.html',
  '/categories/tools.html',
  '/categories/gkniftyheads.html',
  '/hubs.html',
  '/sam.html'
];

const REQUIRED_WIKI_PAGES = [
  '/wiki/gkniftyheads.html',
  '/wiki/graffpunks.html',
  '/wiki/nbg-token.html',
  '/wiki/charlie-buster.html'
];

function verifyRootPagesMatch() {
  // Parse root-pages-config.js to extract the APPROVED_ROOT_PAGES paths
  const configPath = path.join(ROOT, 'scripts', 'root-pages-config.js');
  const configContent = fs.readFileSync(configPath, 'utf8');

  // Extract paths from { path: '/waxcash.html', title: '...' }
  const pathMatches = configContent.match(/path:\s*['"]([^'"]+)['"]/g);
  if (!pathMatches) {
    throw new Error('Could not extract root pages paths from root-pages-config.js');
  }

  const configPaths = pathMatches.map(m => m.match(/['"]([^'"]+)['"]/)[1]).sort();
  const testPaths = REQUIRED_ROOT_PAGES.slice().sort();

  if (JSON.stringify(configPaths) !== JSON.stringify(testPaths)) {
    throw new Error(
      'Root pages list mismatch: REQUIRED_ROOT_PAGES in wiki-index-drift-regression.test.mjs ' +
      'does not match APPROVED_ROOT_PAGES paths in root-pages-config.js. ' +
      `Config: ${configPaths.join(', ')}, Test: ${testPaths.join(', ')}`
    );
  }
}

function loadIndex() {
  const indexPath = path.join(ROOT, 'js', 'wiki-index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error('js/wiki-index.json not found. Run: node scripts/generate-wiki-index.js');
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

function loadAudit() {
  const auditPath = path.join(ROOT, 'js', 'wiki-publish-audit.json');
  if (!fs.existsSync(auditPath)) {
    throw new Error('js/wiki-publish-audit.json not found. Run: node scripts/wiki-publish-gate.js');
  }
  return JSON.parse(fs.readFileSync(auditPath, 'utf8'));
}

function runTests() {
  console.log('🧪 Wiki Index Drift Regression Tests\n');

  // Verify root pages list is in sync with shared config
  try {
    verifyRootPagesMatch();
  } catch (err) {
    console.error(`❌ Root pages list synchronization check failed: ${err.message}`);
    process.exit(1);
  }

  const index = loadIndex();
  const audit = loadAudit();

  const indexedUrls = new Set(index.map(e => e.url));
  const approvedWikiUrls = new Set(audit.approved.map(a => `/wiki/${a.file}`));
  
  // Count intentional exclusions (stubs/noindex)
  let exclusionCount = 0;
  for (const url of approvedWikiUrls) {
    const filePath = path.join(ROOT, url.slice(1));
    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath, 'utf8');
      if (/data-wiki-stub=["']true["']/i.test(html) || /meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) {
        exclusionCount++;
      }
    }
  }

  const tests = [];

  // Test 1: Minimum index size
  const minSize = audit.summary.approved - exclusionCount;
  const test1 = {
    name: 'Index size regression check',
    description: `Index has ${index.length} entries (expected >= ${minSize} from ${audit.summary.approved} approved - ${exclusionCount} exclusions)`,
    pass: index.length >= minSize
  };
  tests.push(test1);

  // Test 2: Required root pages
  const rootPageTests = REQUIRED_ROOT_PAGES.map(url => ({
    name: `Root page indexed: ${url}`,
    description: `${url} is in search index`,
    pass: indexedUrls.has(url)
  }));
  tests.push(...rootPageTests);

  // Test 3: Required wiki pages
  const wikiPageTests = REQUIRED_WIKI_PAGES.map(url => ({
    name: `Wiki page indexed: ${url}`,
    description: `${url} is in search index`,
    pass: indexedUrls.has(url)
  }));
  tests.push(...wikiPageTests);

  // Print results
  let passCount = 0;
  let failCount = 0;

  for (const test of tests) {
    if (test.pass) {
      console.log(`✅ ${test.name}`);
      console.log(`   ${test.description}`);
      passCount++;
    } else {
      console.log(`❌ ${test.name}`);
      console.log(`   ${test.description}`);
      failCount++;
    }
  }

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed out of ${tests.length} tests\n`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('✅ All regression tests passed!');
    process.exit(0);
  }
}

try {
  runTests();
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
