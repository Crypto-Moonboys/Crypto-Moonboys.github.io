import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const JSON_LD_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

let failures = 0;
let checked = 0;
let skipped = 0;

function fail(rel, message) {
  failures += 1;
  console.error(`[FAIL] ${rel}: ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function isRedirectPage(html) {
  return html.includes('http-equiv="refresh"') || html.includes("http-equiv='refresh'");
}

function isIndexablePage(html) {
  if (isRedirectPage(html)) return false;
  const robots = html.match(/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return !robots || !/\bnoindex\b/i.test(robots[1]);
}

function extractMetaDescription(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const descriptionTag = metaTags.find((tag) => /\bname=(["'])description\1/i.test(tag));
  if (!descriptionTag) return '';
  const content = descriptionTag.match(/\bcontent=(["'])(.*?)\1/i);
  return content ? content[2].trim() : '';
}

function hasBrokenDescription(description) {
  if (!description) return 'missing meta description';
  if (description.length < 24) return 'meta description is too short';
  if (description.length > 180) return 'meta description is too long';
  if (/[ï¿½]/i.test(description)) return 'meta description contains replacement-character drift';
  if (/\b(?:mechan|shap)\s*$/i.test(description)) return 'meta description appears clipped mid-word';
  return '';
}

function collectJsonLd(html) {
  JSON_LD_RE.lastIndex = 0;
  const blocks = [];
  let match;
  while ((match = JSON_LD_RE.exec(html)) !== null) {
    blocks.push({
      full: match[0],
      body: match[1],
      index: match.index,
    });
  }
  return blocks;
}

function jsonLdFingerprint(value) {
  return JSON.stringify(value);
}

for (const file of fs.readdirSync(WIKI_DIR).filter((entry) => entry.endsWith('.html')).sort()) {
  const rel = `wiki/${file}`;
  const html = fs.readFileSync(path.join(WIKI_DIR, file), 'utf8');
  if (!isIndexablePage(html)) {
    skipped += 1;
    continue;
  }
  checked += 1;

  const descriptionProblem = hasBrokenDescription(extractMetaDescription(html));
  if (descriptionProblem) fail(rel, descriptionProblem);

  const bootIndex = html.indexOf('<script data-cfasync="false" src="/js/api-config.js"></script>');
  const blocks = collectJsonLd(html);
  const seen = new Set();
  for (const block of blocks) {
    if (bootIndex !== -1 && block.index > bootIndex) {
      fail(rel, 'JSON-LD block appears after canonical boot script block');
    }
    try {
      const parsed = JSON.parse(block.body.trim());
      const fingerprint = jsonLdFingerprint(parsed);
      if (seen.has(fingerprint)) fail(rel, 'duplicate JSON-LD block');
      seen.add(fingerprint);
    } catch (error) {
      fail(rel, `invalid JSON-LD: ${error.message}`);
    }
  }
}

console.log('\n--- Wiki HTML Hygiene ---');
console.log(`  Indexable wiki pages checked : ${checked}`);
console.log(`  Redirect/noindex skipped     : ${skipped}`);
console.log(`  Failures                     : ${failures}`);

if (failures > 0) {
  console.error('\nWiki HTML hygiene guard FAILED.');
  process.exit(1);
}

pass('Wiki HTML hygiene guard passed');
