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


/**
 * A different AtomicAssets template can legitimately reuse another NFT's
 * visible character name. Give *only duplicate* NFT metadata a stable template
 * identifier in the COPIED artifact. Preserve H1, artwork and original source.
 * Do not rewrite ordinary articles with coincidentally matching titles.
 */
function headTitle(html) {
  return (html.match(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i)?.[0] || '')
    .match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, ' ').trim() || '';
}

function nftTemplateIdentity(html, url) {
  const article = [...html.matchAll(/<article\b[^>]*>/gi)]
    .map(match => match[0])
    .find(markup => attribute(markup, 'data-page-type') === 'nft_template');
  if (!article) return null;
  const collection = attribute(article, 'data-collection');
  const templateId = attribute(article, 'data-template-id');
  const pathname = new URL(url).pathname;
  if (!/^[a-z][a-z0-9]{2,30}$/.test(collection) ||
      !/^[1-9][0-9]{1,13}$/.test(templateId) ||
      !pathname.startsWith('/wiki/' + collection + '-') ||
      !pathname.endsWith('-' + templateId + '.html')) {
    throw new Error(url + ': malformed or mismatched WAX NFT template identity');
  }
  return { collection, templateId };
}

function replaceHeadMeta(html, kind, key, value) {
  const headMatch = /<head\b[^>]*>[\s\S]*?<\/head\s*>/i.exec(html);
  if (!headMatch) throw new Error('NFT metadata update needs an HTML head');
  let head = headMatch[0];
  const matching = tags(head, 'meta').filter(markup =>
    attribute(markup, kind).toLowerCase() === key.toLowerCase());
  if (matching.length > 1) throw new Error('Duplicate metadata tag: ' + key);
  if (matching.length) {
    const original = matching[0];
    const next = original.replace(/(\bcontent\s*=\s*)(["'])(.*?)\2/i,
      (_all, prefix, quote) => prefix + quote + value + quote);
    if (next === original && attribute(original, 'content') !== value) {
      throw new Error('Uneditable metadata tag: ' + key);
    }
    head = head.replace(original, next);
  } else {
    head = head.replace(/<\/head\s*>/i, '  <meta ' + kind + '="' + key +
      '" content="' + value + '">\n</head>');
  }
  return html.slice(0, headMatch.index) + head +
    html.slice(headMatch.index + headMatch[0].length);
}

export function disambiguatePublishedNftTitles(records) {
  const byTitle = new Map();
  for (const record of records) {
    const title = headTitle(record.html);
    if (!title) continue;
    const list = byTitle.get(title) || [];
    list.push(record);
    byTitle.set(title, list);
  }

  const updates = new Map();
  const warnings = [];
  for (const [oldTitle, group] of byTitle) {
    if (group.length < 2) continue;
    for (const record of group) {
      const nft = nftTemplateIdentity(record.html, record.url);
      if (!nft) {
        warnings.push({ url: record.url, issues: ['Duplicate non-NFT page title; editorial review required'] });
        continue;
      }
      // The original title remains recognizable, but its exact WAX template
      // record becomes discoverable separately from same-name variations.
      const suffix = ' · ' + nft.collection + ' NFT #' + nft.templateId;
      const brandSuffix = /(?:\s*[-—–]\s*Crypto Moonboys Wiki)$/i;
      const newTitle = brandSuffix.test(oldTitle)
        ? oldTitle.replace(brandSuffix, suffix + ' - Crypto Moonboys Wiki')
        : oldTitle + suffix;

      const titleTag = /<title\b[^>]*>[\s\S]*?<\/title>/i;
      let html = record.html.replace(titleTag, '<title>' + newTitle + '</title>');
      html = replaceHeadMeta(html, 'property', 'og:title', newTitle);

      // A factual template identifier also makes otherwise identical
      // descriptions specific without inventing sales, price or rarity data.
      const head = html.match(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i)?.[0] || '';
      const descriptionTag = tags(head, 'meta')
        .find(tag => attribute(tag, 'name').toLowerCase() === 'description');
      if (descriptionTag) {
        const originalDescription = attribute(descriptionTag, 'content').trim();
        if (originalDescription && !new RegExp('(?:template(?: ID)?|#)\\s*#?' + nft.templateId + '\\b', 'i').test(originalDescription)) {
          const newDescription = originalDescription.replace(/\.\s*$/, '') +
            '. WAX template ID ' + nft.templateId + '.';
          html = replaceHeadMeta(html, 'name', 'description', newDescription);
          html = replaceHeadMeta(html, 'property', 'og:description', newDescription);
        }
      }
      updates.set(record.url, html);
    }
  }
  const final = new Map();
  for (const record of records) {
    const title = headTitle(updates.get(record.url) || record.html);
    const first = final.get(title);
    if (title && first && (updates.has(first) || updates.has(record.url))) {
      throw new Error('NFT title remains duplicate after disambiguation: ' + record.url + ' and ' + first);
    }
    if (title && !first) final.set(title, record.url);
  }
  return { updates, changed: updates.size, warnings };
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
  const records = [];
  for (const { url, filename } of targets) {
    let html;
    try { html = await readFile(filename, 'utf8'); }
    catch { throw new Error('Sitemap lists an unreadable/missing published HTML page: ' + url); }
    const result = canonicalizePublishedHtml(html, url, url);
    records.push({ url, filename, original: html, html: result.html });
    if (result.inserted) added++;
    else present++;
    if (result.warnings.length) warnings.push({ url, issues: result.warnings });
  }
  const nft = disambiguatePublishedNftTitles(records);
  warnings.push(...nft.warnings);
  // Both the canonical check and duplicate-title evaluation finish before
  // any write, retaining the existing fail-closed Pages deployment policy.
  for (const record of records) {
    const output = nft.updates.get(record.url) || record.html;
    if (output !== record.original) await writeFile(record.filename, output, 'utf8');
  }
  return { checked: targets.length, added, present, nftTitlesUpdated: nft.changed, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const siteRoot = process.argv[2] || 'public-site';
    const result = await ensurePublishedCanonicals(siteRoot);
    console.log('Pages SEO canonical verification: ' + result.checked + ' URLs; ' +
      result.added + ' missing links injected; ' + result.present + ' already canonical; ' +
      result.nftTitlesUpdated + ' repeated NFT titles disambiguated.');
    if (result.warnings.length) {
      console.warn('Nonblocking editorial metadata warnings on ' + result.warnings.length + ' pages:');
      result.warnings.slice(0, 12).forEach(x => console.warn(x.url + ': ' + x.issues.join('; ')));
    }
  } catch (error) {
    console.error('Pages SEO verification failed: ' + error.message);
    process.exitCode = 1;
  }
}
