#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MANUAL_CONTENT_BEGIN,
  MANUAL_CONTENT_END,
  SAM_CONTENT_BEGIN,
  SAM_CONTENT_END,
  LEGACY_PRESERVED_CONTENT_NOTE,
  getManualContentBlock,
} from './import-website-publish-payloads.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const RELATED_BEGIN = '<!-- RELATED_WIKI_PATHS:BEGIN -->';
const RELATED_END = '<!-- RELATED_WIKI_PATHS:END -->';
const failures = [];
const warnings = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function markerCount(html, marker) {
  return (String(html || '').match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

function hasArticleContent(html) {
  if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(html)) return false;
  if (/<meta\b(?=[^>]*name=["']robots["'])(?=[^>]*content=["'][^"']*\bnoindex\b)[^>]*>/i.test(html)) return false;
  if (/\bdata-wiki-stub=["']true["']/i.test(html)) return false;
  return /<article\b/i.test(html) || /class=["'][^"']*\bwiki-content\b/i.test(html);
}

function hasOwnershipMarker(html) {
  return html.includes(MANUAL_CONTENT_BEGIN) || html.includes(SAM_CONTENT_BEGIN);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function auditMarkerBalance(relPath, html) {
  check(
    markerCount(html, MANUAL_CONTENT_BEGIN) === markerCount(html, MANUAL_CONTENT_END),
    `${relPath}: unbalanced MANUAL_CONTENT markers`
  );
  check(
    markerCount(html, SAM_CONTENT_BEGIN) === markerCount(html, SAM_CONTENT_END),
    `${relPath}: unbalanced SAM_CONTENT markers`
  );
}

function auditPreservation(relPath, html) {
  if (!hasArticleContent(html)) return;

  const manualBlock = getManualContentBlock(html);
  const hasMarkers = hasOwnershipMarker(html);
  if (!hasMarkers) {
    warnings.push(`${relPath}: legacy article content has no MANUAL/SAM markers; importer will wrap it as legacy-preserved MANUAL_CONTENT before SAM writes.`);
    check(Boolean(manualBlock), `${relPath}: unmarked article content would not be preserved as legacy website truth`);
    check(manualBlock.includes(MANUAL_CONTENT_BEGIN), `${relPath}: unmarked article content must be wrapped with MANUAL_CONTENT begin marker`);
    check(manualBlock.includes(MANUAL_CONTENT_END), `${relPath}: unmarked article content must be wrapped with MANUAL_CONTENT end marker`);
    check(manualBlock.includes(LEGACY_PRESERVED_CONTENT_NOTE), `${relPath}: unmarked article content must carry legacy-preserved content note`);
  }

  if (manualBlock) {
    check(!manualBlock.includes(RELATED_BEGIN), `${relPath}: generated Related Wiki Paths must not be captured as manual truth`);
    check(!manualBlock.includes(RELATED_END), `${relPath}: generated Related Wiki Paths must not be captured as manual truth`);
    check(stripHtml(manualBlock).length > 0, `${relPath}: manual content block is empty after stripping markup`);
  }
}

if (!fs.existsSync(WIKI_DIR)) {
  console.log('Manual content preservation audit skipped: wiki/ folder does not exist.');
  process.exit(0);
}

const wikiFiles = fs.readdirSync(WIKI_DIR)
  .filter((fileName) => fileName.endsWith('.html') && fileName !== 'index.html')
  .sort();

let contentPages = 0;
let legacyUnmarkedPages = 0;
let markedPages = 0;

for (const fileName of wikiFiles) {
  const relPath = `wiki/${fileName}`;
  const html = fs.readFileSync(path.join(WIKI_DIR, fileName), 'utf8');
  auditMarkerBalance(relPath, html);
  if (!hasArticleContent(html)) continue;

  contentPages += 1;
  if (hasOwnershipMarker(html)) markedPages += 1;
  else legacyUnmarkedPages += 1;
  auditPreservation(relPath, html);
}

if (warnings.length) {
  console.warn(`Manual content preservation audit warnings (${warnings.length}):`);
  for (const warning of warnings.slice(0, 20)) console.warn(`- ${warning}`);
  if (warnings.length > 20) console.warn(`- ... ${warnings.length - 20} more legacy pages are protected by importer wrapping.`);
}

if (failures.length) {
  console.error(`Manual content preservation audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Manual content preservation audit passed: ${contentPages} wiki content pages checked, ${markedPages} already marked, ${legacyUnmarkedPages} legacy pages protected by legacy-preserved importer wrapping.`);
