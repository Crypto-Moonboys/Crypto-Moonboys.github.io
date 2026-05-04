#!/usr/bin/env node
/**
 * apply-shell.mjs
 *
 * Strips hardcoded shell markup from HTML pages and replaces with
 * the canonical script boot block that loads site-shell.js.
 *
 * Usage: node scripts/apply-shell.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Global boot scripts to STRIP ─────────────────────────────── */
const GLOBAL_SCRIPTS = new Set([
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/components/ui-status-copy.js',
  '/js/core/moonboys-state.js',
  '/js/core/moonboys-debug-panel.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/scroll-shell.js',
]);

/* ── Canonical boot block ──────────────────────────────────────── */
// data-cfasync="false" on every script bypasses Cloudflare Rocket Loader.
// Without it Rocket Loader replaces later <script> tags with placeholder
// nodes; site-shell.js then detaches those placeholders when it rewrites
// the body, causing "Placeholder … was detached" errors and silently
// preventing the affected scripts from executing.
const CANONICAL_BOOT = `\
<!-- ── CANONICAL SCRIPT BOOT ─────────────────────────────────────── -->
<!-- data-cfasync="false" disables Cloudflare Rocket Loader per-script  -->
<!-- so placeholder nodes are never injected into the boot sequence.    -->
<!-- 1. Core config -->
<script data-cfasync="false" src="/js/api-config.js"></script>
<!-- 2. Event bus -->
<script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script>
<!-- 3. Identity -->
<script data-cfasync="false" src="/js/identity-gate.js"></script>
<!-- 4. State -->
<script data-cfasync="false" src="/js/core/moonboys-state.js"></script>
<!-- 5. Shell + shared components -->
<script data-cfasync="false" src="/js/site-shell.js"></script>
<script data-cfasync="false" src="/js/components/connection-status-panel.js"></script>
<script data-cfasync="false" src="/js/components/global-player-header.js"></script>
<script data-cfasync="false" src="/js/components/live-activity-summary.js"></script>
<!-- 6. Page-specific scripts -->`;

/* ── Files to process ──────────────────────────────────────────── */
function collectFiles() {
  const files = [];

  // All root *.html files (excluding _article-template.html)
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.html') && !f.startsWith('_')) {
      files.push(f);
    }
  }

  // games/index.html and games/leaderboard.html
  files.push('games/index.html');
  files.push('games/leaderboard.html');

  // categories/*.html
  const catDir = path.join(ROOT, 'categories');
  if (fs.existsSync(catDir)) {
    for (const f of fs.readdirSync(catDir)) {
      if (f.endsWith('.html')) files.push('categories/' + f);
    }
  }

  // wiki/*.html
  const wikiDir = path.join(ROOT, 'wiki');
  if (fs.existsSync(wikiDir)) {
    for (const f of fs.readdirSync(wikiDir)) {
      if (f.endsWith('.html')) files.push('wiki/' + f);
    }
  }

  // about/*.html
  const aboutDir = path.join(ROOT, 'about');
  if (fs.existsSync(aboutDir)) {
    for (const f of fs.readdirSync(aboutDir)) {
      if (f.endsWith('.html')) files.push('about/' + f);
    }
  }

  return files;
}

/* ── Nesting-aware <main id="content"> extraction ──────────────── */
function extractMain(html) {
  // Find opening tag
  const openRe = /<main\s[^>]*id=['"]content['"][^>]*>/i;
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const openTag = openMatch[0];
  const openIdx = openMatch.index;
  let pos = openIdx + openTag.length;
  let depth = 1;

  while (pos < html.length && depth > 0) {
    const openNext = html.indexOf('<main', pos);
    const closeNext = html.indexOf('</main>', pos);

    if (closeNext === -1) break;

    if (openNext !== -1 && openNext < closeNext) {
      depth++;
      pos = openNext + 5;
    } else {
      depth--;
      if (depth === 0) {
        const innerContent = html.slice(openIdx + openTag.length, closeNext);
        return innerContent;
      }
      pos = closeNext + 7;
    }
  }
  return null;
}

/* ── Extract body attributes ───────────────────────────────────── */
function extractBodyAttrs(html) {
  const m = html.match(/<body\s+([^>]*)>/i);
  return m ? m[1].trim() : '';
}

/* ── Extract <head> content ────────────────────────────────────── */
function extractHead(html) {
  const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[0] : '';
}

/* ── Extract page-specific scripts ────────────────────────────── */
function extractPageScripts(html, relPath) {
  const pageScripts = [];
  const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;

  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const srcMatch = attrs.match(/src=['"]([^'"]+)['"]/);

    if (srcMatch) {
      const src = srcMatch[1];
      // Check against global scripts set
      if (!GLOBAL_SCRIPTS.has(src)) {
        // Preserve script but strip defer from wiki.js to normalise.
        // Add data-cfasync="false" if not already present so Rocket Loader
        // does not replace page-specific scripts with placeholder nodes.
        let cleanAttrs = attrs.replace(/\s+defer\b/gi, '').replace(/\bdefer\s*/gi, '');
        if (!cleanAttrs.includes('data-cfasync')) {
          cleanAttrs = ' data-cfasync="false"' + cleanAttrs;
        }
        pageScripts.push(`<script${cleanAttrs}></script>`);
      }
    } else if (attrs.includes('type="module"') || attrs.includes("type='module'")) {
      // Keep module scripts verbatim (modules are deferred by nature and not
      // subject to Rocket Loader's placeholder injection).
      pageScripts.push(`<script${attrs}>${body}</script>`);
    } else if (body.trim()) {
      // Inline script — keep verbatim
      pageScripts.push(`<script${attrs}>${body}</script>`);
    }
  }

  // Ensure wiki.js is present as first page-specific script
  const hasWikiJs = pageScripts.some(s => /src=['"]\/js\/wiki\.js['"]/.test(s));
  if (!hasWikiJs) {
    // Insert before first module script, or at start
    const modIdx = pageScripts.findIndex(s => s.includes('type="module"') || s.includes("type='module'"));
    if (modIdx !== -1) {
      pageScripts.splice(modIdx, 0, '<script data-cfasync="false" src="/js/wiki.js"></script>');
    } else {
      pageScripts.unshift('<script data-cfasync="false" src="/js/wiki.js"></script>');
    }
  }

  return pageScripts;
}

/* ── Build output HTML ─────────────────────────────────────────── */
function transform(html, relPath) {
  // Strip BOM
  html = html.replace(/^\uFEFF/, '');

  const headBlock = extractHead(html);
  const bodyAttrs = extractBodyAttrs(html);
  const mainContent = extractMain(html);
  const pageScripts = extractPageScripts(html, relPath);

  if (!mainContent && !html.includes('id="content"')) {
    console.warn(`  [WARN] ${relPath}: could not extract <main id="content">`);
  }

  // Special: index.html — add page-has-right-panel if missing but has right panel
  let finalBodyAttrs = bodyAttrs;
  if (relPath === 'index.html') {
    if (html.includes('id="homepage-right-panel"') && !bodyAttrs.includes('page-has-right-panel')) {
      finalBodyAttrs = finalBodyAttrs.replace(/class=['"]([^'"]+)['"]/, (match, cls) => {
        return match.replace(cls, cls + ' page-has-right-panel');
      });
    }
  }

  // Special: leaderboard — add data-sidebar-extra="arcade" if missing
  if (relPath === 'games/leaderboard.html') {
    if (!finalBodyAttrs.includes('data-sidebar-extra')) {
      finalBodyAttrs = finalBodyAttrs + ' data-sidebar-extra="arcade"';
    }
  }

  const pageScriptsStr = pageScripts.length > 0
    ? '\n' + pageScripts.map(s => s).join('\n')
    : '';

  const mainInner = mainContent !== null ? mainContent : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    headBlock,
    `<body ${finalBodyAttrs}>`,
    `<main id="content" role="main">${mainInner}</main>`,
    '',
    CANONICAL_BOOT,
    pageScriptsStr,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/* ── Main ──────────────────────────────────────────────────────── */
const files = collectFiles();
let processed = 0;
let skipped = 0;
let errors = 0;

for (const relPath of files) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`  [SKIP] ${relPath} — not found`);
    skipped++;
    continue;
  }

  try {
    const original = fs.readFileSync(fullPath, 'utf8');
    const result = transform(original, relPath);
    fs.writeFileSync(fullPath, result, 'utf8');
    console.log(`  [OK]   ${relPath}`);
    processed++;
  } catch (err) {
    console.error(`  [ERR]  ${relPath}: ${err.message}`);
    errors++;
  }
}

console.log(`\nDone. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
if (errors > 0) process.exit(1);
