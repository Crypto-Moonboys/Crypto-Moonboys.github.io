#!/usr/bin/env node
'use strict';

/**
 * scripts/audit-published-vs-index.js
 *
 * Comprehensive audit comparing:
 *   - Approved URLs from js/wiki-publish-audit.json
 *   - Indexed URLs from js/wiki-index.json
 *   - URLs in sitemap.xml
 *   - Explicit root/tool pages list
 *
 * Identifies and reports every drift category:
 *   1. Missing from index (approved but not searchable)
 *   2. Missing from sitemap (approved but not crawlable)
 *   3. Excluded intentionally (stubs, noindex)
 *   4. Should-be-included root pages (waxcash, about, etc.)
 *
 * Run: node scripts/audit-published-vs-index.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Approved root/tool pages that should be in search index
const APPROVED_ROOT_PAGES = [
  { path: '/waxcash.html', title: 'WAXCASH Analytics' },
  { path: '/about.html', title: 'About Crypto Moonboys' },
  { path: '/categories/index.html', title: 'Categories' },
  { path: '/categories/tools.html', title: 'Tools' },
  { path: '/categories/gkniftyheads.html', title: 'GKniftyheads' },
  { path: '/hubs.html', title: 'Hubs' },
  { path: '/sam.html', title: 'SAM' }
];

async function loadAudit() {
  const auditPath = path.join(ROOT, 'js', 'wiki-publish-audit.json');
  if (!fs.existsSync(auditPath)) {
    console.error('ERROR: js/wiki-publish-audit.json not found. Run: node scripts/wiki-publish-gate.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(auditPath, 'utf8'));
}

function loadIndex() {
  const indexPath = path.join(ROOT, 'js', 'wiki-index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('ERROR: js/wiki-index.json not found. Run: node scripts/generate-wiki-index.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

async function loadSitemap() {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.error('ERROR: sitemap.xml not found');
    return new Set();
  }

  try {
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    // Simple regex to extract URLs (avoiding xml2js dependency)
    const matches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
    const urls = new Set();
    
    for (const match of matches) {
      const url = match.replace(/<\/?loc>/g, '');
      const relativePath = url.replace('https://cryptomoonboys.com', '');
      if (relativePath) {
        urls.add(relativePath);
      }
    }
    
    return urls;
  } catch (err) {
    console.error(`ERROR reading sitemap: ${err.message}`);
    return new Set();
  }
}

function readHtmlFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return null;
  }
}

function isIntentionallyExcluded(url, html) {
  if (!html) return true;
  
  // Check for stub/noindex markers
  if (/data-wiki-stub=["']true["']/i.test(html)) return true;
  if (/meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) return true;
  
  return false;
}

function extractTitle(html) {
  if (!html) return null;
  const match = html.match(/<title>(.*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractDescription(html) {
  if (!html) return null;
  const match = 
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ||
    html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
  return match ? match[1].trim() : null;
}

async function run() {
  console.log('📊 Audit: Published URLs vs Search Index vs Sitemap\n');
  
  const audit = await loadAudit();
  const index = loadIndex();
  const sitemap = await loadSitemap();

  // Build URL sets
  const approvedUrls = new Set(audit.approved.map(a => `/wiki/${a.file}`));
  const indexedUrls = new Set(index.map(e => e.url));
  const sitemapUrls = sitemap;

  // Categorize approved pages
  const byCategory = {
    indexed: [],
    missingFromIndex: [],
    missingFromSitemap: [],
    intentionallyExcluded: [],
    extraInIndex: []
  };

  for (const url of approvedUrls) {
    const filePath = path.join(ROOT, url.slice(1));
    const html = readHtmlFile(filePath);
    const isExcluded = isIntentionallyExcluded(url, html);

    if (isExcluded) {
      byCategory.intentionallyExcluded.push(url);
    } else if (!indexedUrls.has(url)) {
      byCategory.missingFromIndex.push(url);
    } else {
      byCategory.indexed.push(url);
      if (!sitemapUrls.has(url)) {
        byCategory.missingFromSitemap.push(url);
      }
    }
  }

  // Check for extra entries in index (but exclude intentional root pages)
  for (const url of indexedUrls) {
    if (!approvedUrls.has(url) && !APPROVED_ROOT_PAGES.find(p => p.path === url)) {
      byCategory.extraInIndex.push(url);
    }
  }

  // Summary
  console.log('📈 Summary:');
  console.log(`  Approved pages (from audit):     ${approvedUrls.size}`);
  console.log(`  Indexed pages (searchable):      ${indexedUrls.size}`);
  console.log(`  In sitemap (crawlable):          ${sitemapUrls.size}`);
  console.log(`  Intentionally excluded (stubs):  ${byCategory.intentionallyExcluded.length}`);
  console.log(`  Missing from index:              ${byCategory.missingFromIndex.length}`);
  console.log(`  Missing from sitemap:            ${byCategory.missingFromSitemap.length}`);
  console.log(`  Extra in index:                  ${byCategory.extraInIndex.length}\n`);

  // Report issues
  let hasIssues = false;

  if (byCategory.missingFromIndex.length > 0) {
    hasIssues = true;
    console.log('❌ Missing from Search Index (approved but not searchable):');
    for (const url of byCategory.missingFromIndex) {
      console.log(`  ${url}`);
    }
    console.log();
  }

  if (byCategory.missingFromSitemap.length > 0) {
    hasIssues = true;
    console.log('⚠️  Missing from Sitemap (indexed but not crawlable):');
    for (const url of byCategory.missingFromSitemap) {
      console.log(`  ${url}`);
    }
    console.log();
  }

  if (byCategory.extraInIndex.length > 0) {
    hasIssues = true;
    console.log('⚠️  Extra in Index (indexed but not approved):');
    for (const url of byCategory.extraInIndex) {
      console.log(`  ${url}`);
    }
    console.log();
  }

  // Check root/tool pages
  console.log('🔍 Approved Root/Tool Pages (should be in search):');
  const missingRootPages = [];
  for (const page of APPROVED_ROOT_PAGES) {
    const filePath = path.join(ROOT, page.path.slice(1));
    const exists = fs.existsSync(filePath);
    const inIndex = indexedUrls.has(page.path);
    const inSitemap = sitemapUrls.has(page.path);
    
    const status = exists
      ? inIndex ? '✅ indexed' : '❌ not indexed'
      : '⚠️  file missing';
    
    console.log(`  ${page.path.padEnd(30)} ${status}${inSitemap ? ' (in sitemap)' : ''}`);
    
    if (exists && !inIndex) {
      missingRootPages.push(page);
    }
  }

  if (missingRootPages.length > 0) {
    hasIssues = true;
    console.log(`\n❌ ${missingRootPages.length} approved root pages not in search index!`);
    console.log('   These need to be added to generate-wiki-index.js');
  }

  console.log();

  // Final status
  if (!hasIssues && byCategory.missingFromIndex.length === 0) {
    console.log('✅ All published pages are properly indexed and in sitemap!');
    process.exit(0);
  } else {
    console.log('⚠️  Drift detected - see issues above');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});

module.exports = { run };
