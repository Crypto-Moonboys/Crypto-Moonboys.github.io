#!/usr/bin/env node
/**
 * SEO canonical repair for the COPIED GitHub Pages artifact only.
 *
 * Many approved wiki pages have real content and a sitemap entry but no
 * explicit canonical. Add only the missing head link to the published copy:
 * never edit protected wiki files, redirect destinations, stories or games.
 * Existing canonicals are preserved and must agree with the sitemap.
 *
 * Usage: node scripts/seo-publish-canonicals.mjs public-site
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_ORIGIN = 'https://cryptomoonboys.com';

function attribute(markup, name) {
  const token = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markup.match(new RegExp('(?:^|\\s)' + token + '\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27)', 'i'));
  return match ? (match[1] ?? match[2]) : '';
}

function tags(head, tagName) {
  return [...head.matchAll(new RegExp('<' + tagName + '\\b[^>]*>', 'gi'))].map(match => match[0]);
}

export function canonicalizePublishedHtml(html, expectedUrl, label = expectedUrl) {
  const headMatch = /<head\b[^>]*>[\s\S]*?<\/head\s*>/i.exec(html);
  if (!headMatch) throw new Error(label + ': missing HTML head');
  const head = headMatch[0];
  const metas = tags(head, 'meta');
  for (const meta of metas) {
    const name = attribute(meta, 'name').toLowerCase();
    const content = attribute(meta, 'content').toLowerCase();
    if ((name === 'robots' || name === 'googlebot') && /\bnoindex\b/.test(content)) {
      throw new Error(label + ': noindex page is listed in the sitemap');
    }
    if (attribute(meta, 'http-equiv').toLowerCase() === 'refresh') {
      throw new Error(label + ': meta-refresh redirect is listed in the sitemap');
    }
  }

  const canonicals = tags(head, 'link')
    .filter(tag => attribute(tag, 'rel').toLowerCase().split(/\s+/).includes('canonical'));
  if (canonicals.length > 1) throw new Error(label + ': multiple canonical links');
  if (canonicals.length === 1) {
    const actual = attribute(canonicals[0], 'href');
    if (actual !== expectedUrl) {
      throw new Error(label + ': canonical ' + actual + ' conflicts with ' + expectedUrl);
    }
  }

  const warnings = [];
  if (!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i.test(head)) warnings.push('missing title');
  if (!metas.some(meta => attribute(meta, 'name').toLowerCase() === 'description' && attribute(meta, 'content').trim())) {
    warnings.push('missing meta description');
  }
  const og = metas.filter(meta => attribute(meta, 'property').toLowerCase() === 'og:url');
  if (og.length > 1) warnings.push('duplicate og:url');
  if (og.length === 1 && attribute(og[0], 'content') !== expectedUrl) warnings.push('og:url differs from canonical');

  if (canonicals.length) return { html, inserted: false, warnings };
  const patchedHead = head.replace(/<\/head\s*>/i, '  <link rel="canonical" href="' + expectedUrl + '">\n</head>');
  return {
    html: html.slice(0, headMatch.index) + patchedHead + html.slice(headMatch.index + head.length),
    inserted: true,
    warnings
  };
}

export function sitemapTargets(xml, siteRoot) {
  const urls = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/gi)].map(match => match[1]);
  if (!urls.length) throw new Error('sitemap.xml has no locations');
  const seen = new Set();
  return urls.map(rawUrl => {
    if (seen.has(rawUrl)) throw new Error('Duplicate sitemap URL: ' + rawUrl);
    seen.add(rawUrl);
    let parsed;
    try { parsed = new URL(rawUrl); }
    catch { throw new Error('Malformed sitemap URL: ' + rawUrl); }
    if (parsed.origin !== SITE_ORIGIN || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('Non-canonical or off-site URL in sitemap: ' + rawUrl);
    }
    let pathname;
    try { pathname = decodeURIComponent(parsed.pathname); }
    catch { throw new Error('Malformed sitemap path: ' + rawUrl); }
    if (pathname.includes('\\') || pathname.includes('\0') ||
        pathname.split('/').includes('..') || pathname.includes('//')) {
      throw new Error('Unsafe sitemap path: ' + rawUrl);
    }
    const relative = pathname.endsWith('/') ? pathname.slice(1) + 'index.html' : pathname.slice(1);
    if (!relative.endsWith('.html')) throw new Error('Non-HTML sitemap URL: ' + rawUrl);
    const absolute = path.resolve(siteRoot, relative);
    if (!absolute.startsWith(siteRoot + path.sep)) throw new Error('Sitemap path escaped public directory: ' + rawUrl);
    return { url: rawUrl, filename: absolute };
  });
}

export async function ensurePublishedCanonicals(siteDirectory) {
  const siteRoot = path.resolve(siteDirectory);
  const xml = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
  let added = 0, present = 0;
  const warnings = [];
  const targets = sitemapTargets(xml, siteRoot);
  // Verify the entire sitemap before mutating any file. No partial output on
  // a malformed indexed page, a redirect, a noindex or a canonical conflict.
  const updates = [];
  for (const { url, filename } of targets) {
    let html;
    try { html = await readFile(filename, 'utf8'); }
    catch { throw new Error('Sitemap lists an unreadable/missing published HTML page: ' + url); }
    const result = canonicalizePublishedHtml(html, url, url);
    if (result.inserted) updates.push({ filename, html: result.html });
    else present++;
    if (result.warnings.length) warnings.push({ url, issues: result.warnings });
  }
  for (const update of updates) {
    await writeFile(update.filename, update.html, 'utf8');
    added++;
  }
  return { checked: targets.length, added, present, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const siteRoot = process.argv[2] || 'public-site';
    const result = await ensurePublishedCanonicals(siteRoot);
    console.log('Pages SEO canonical verification: ' + result.checked + ' URLs; ' +
      result.added + ' missing links injected; ' + result.present + ' already canonical.');
    if (result.warnings.length) {
      console.warn('Nonblocking editorial metadata warnings on ' + result.warnings.length + ' pages:');
      result.warnings.slice(0, 12).forEach(x => console.warn(x.url + ': ' + x.issues.join('; ')));
    }
  } catch (error) {
    console.error('Pages SEO verification failed: ' + error.message);
    process.exitCode = 1;
  }
}
