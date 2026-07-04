#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PayloadValidationError, validatePayloadDirectory } from './validate-website-publish-payloads.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PAYLOAD_DIR = path.join(ROOT, 'website-publish-payloads');
const RELATIONSHIP_HINTS_FILE = 'js/wiki-relationship-hints.json';
const RELATIONSHIP_HINT_GROUPS = [
  'project_hubs',
  'collections',
  'factions',
  'characters',
  'games',
  'tokens',
  'lore',
  'categories',
  'tags',
];
export const MANUAL_CONTENT_BEGIN = '<!-- MANUAL_CONTENT:BEGIN -->';
export const MANUAL_CONTENT_END = '<!-- MANUAL_CONTENT:END -->';
export const SAM_CONTENT_BEGIN = '<!-- SAM_CONTENT:BEGIN -->';
export const SAM_CONTENT_END = '<!-- SAM_CONTENT:END -->';
export const LEGACY_PRESERVED_CONTENT_NOTE = '<!-- LEGACY_PRESERVED_CONTENT: unmarked existing website article preserved for manual review; not proof of fresh SAM output or owner-approved canon. -->';
export const AFFECTED_SYNC_SURFACES = [
  'categories',
  'search',
  'timeline',
  'graph',
  'dashboard',
  'SAM page',
  'sitemap',
];

export class FeedSyncError extends Error {
  constructor(surface, message) {
    super(message || `feed sync not implemented for ${surface}`);
    this.name = 'FeedSyncError';
    this.surface = surface;
  }
}

export const REAL_ROOT_SYNC_STEPS = [
  { surface: 'search', script: 'scripts/wiki-publish-gate.js' },
  { surface: 'search', script: 'scripts/generate-wiki-index.js' },
  { surface: 'graph', script: 'scripts/generate-link-map.js' },
  { surface: 'graph', script: 'scripts/generate-link-graph.js' },
  { surface: 'search', script: 'scripts/generate-wiki-index.js' },
  { surface: 'SAM page', script: 'scripts/generate-entity-map.js' },
  { surface: 'graph', script: 'scripts/generate-entity-graph.js' },
  { surface: 'graph', script: 'scripts/generate-graph-data.js' },
  { surface: 'timeline', script: 'scripts/generate-timeline-data.js' },
  { surface: 'timeline', script: 'scripts/generate-timeline-intelligence.js' },
  { surface: 'dashboard', script: 'scripts/generate-authority-trust.js' },
  { surface: 'dashboard', script: 'scripts/generate-cluster-health.js' },
  { surface: 'dashboard', script: 'scripts/generate-content-gaps.js' },
  { surface: 'dashboard', script: 'scripts/generate-growth-priority.js' },
  { surface: 'dashboard', script: 'scripts/generate-publishing-readiness.js' },
  { surface: 'dashboard', script: 'scripts/generate-site-stats.js' },
  { surface: 'sitemap', script: 'scripts/generate-sitemap.js' },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function categorySlug(category) {
  return String(category)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lore';
}

function normalizeHintUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('//')) return '';
  const withoutHash = raw.split('#')[0].split('?')[0];
  let normalized = withoutHash.startsWith('/') ? withoutHash : `/wiki/${withoutHash}`;
  normalized = normalized.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (/^\/(wiki|categories)\//i.test(normalized) && !/\.html$/i.test(normalized)) {
    normalized = `${normalized.replace(/\/$/, '')}.html`;
  }
  normalized = normalized.replace(/\.html(?:\.html)+$/i, '.html');
  return normalized;
}

export function sanitizeRelationshipHints(rawHints) {
  if (!rawHints || typeof rawHints !== 'object' || Array.isArray(rawHints)) return {};

  const sanitized = {};
  for (const group of RELATIONSHIP_HINT_GROUPS) {
    const items = rawHints[group];
    if (!Array.isArray(items)) continue;

    const out = [];
    const seen = new Set();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const url = normalizeHintUrl(item.url || item.href || item.path || item.slug);
      const slug = String(item.slug || '').trim();
      const name = String(item.name || item.title || item.label || '').trim();
      const relationship = String(item.relationship || item.type || '').trim();
      const description = String(item.description || item.note || '').trim();
      const dedupeKey = url || slug || `${name.toLowerCase()}|${relationship.toLowerCase()}`;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        ...(url ? { url } : {}),
        ...(slug ? { slug } : {}),
        ...(name ? { name } : {}),
        ...(relationship ? { relationship } : {}),
        ...(description ? { description } : {}),
      });
    }
    if (out.length) sanitized[group] = out;
  }

  return sanitized;
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/\s+[\u2014\u2013-]\s+Crypto Moonboys Wiki\s*$/i, '')
    .trim();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function ensureScriptAttributes(html) {
  return html.replace(/<script(?![^>]*\bdata-cfasync=)([^>]*\bsrc=["']\/js\/[^"']+["'][^>]*)><\/script>/g, '<script data-cfasync="false"$1></script>');
}

function ensureDailyLoopScript(html) {
  if (html.includes('/js/core/daily-loop-state.js')) return html;
  return html.replace(
    /(<script[^>]*src=["']\/js\/core\/moonboys-state\.js["'][^>]*><\/script>)/,
    '$1\n<!-- 5. Daily loop singleton -->\n<script data-cfasync="false" src="/js/core/daily-loop-state.js"></script>'
  );
}

function normalizeRenderedShell(html) {
  return ensureDailyLoopScript(ensureScriptAttributes(html));
}

function renderCitations(citations) {
  if (!Array.isArray(citations) || citations.length === 0) {
    return `
      <section class="citations-section" aria-label="Citations">
        <h2>References &amp; Citations</h2>
        <ol class="citations-list"></ol>
      </section>`;
  }

  const items = citations.map((citation, index) => {
    const title = typeof citation === 'string'
      ? citation
      : citation.title || citation.label || citation.url || `Source ${index + 1}`;
    const url = typeof citation === 'object' ? citation.url || citation.href || '' : '';
    const desc = typeof citation === 'object' ? citation.description || citation.note || '' : '';
    const linkedTitle = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
      : escapeHtml(title);

    return `          <li>
            <span class="cite-num">[${index + 1}]</span>
            <div>${linkedTitle}${desc ? ` &mdash; ${escapeHtml(desc)}` : ''}</div>
          </li>`;
  }).join('\n');

  return `
      <section class="citations-section" aria-label="Citations">
        <h2>References &amp; Citations</h2>
        <ol class="citations-list">
${items}
        </ol>
      </section>`;
}

function renderCategoryTags(payload) {
  const catSlug = categorySlug(payload.category);
  return `
      <div class="category-tags" aria-label="Article categories">
        <span class="cat-label">Categories:</span>
        <a href="/categories/${escapeHtml(catSlug)}.html">${escapeHtml(payload.category)}</a>
      </div>`;
}

export function renderBattleHeatMediaTemplate(payload) {
  if (payload.page_type !== 'nft_template') return '';

  const fallbackUrls = Array.isArray(payload.media.fallback_urls)
    ? payload.media.fallback_urls
    : [];
  const fallbackJson = JSON.stringify(fallbackUrls);

  return `
        <template class="nft-battle-media-template" data-battle-media="nft" data-page-id="${escapeHtml(payload.slug)}">
          <figure class="battle-page-media nft-template-media-card">
            <img class="wiki-hero-image nft-image" src="${escapeHtml(payload.media.image_url)}" alt="${escapeHtml(payload.media.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback-srcs='${escapeHtml(fallbackJson)}'>
          </figure>
        </template>`;
}

export function renderArticleMiddle(payload) {
  const battleMediaTemplate = renderBattleHeatMediaTemplate(payload);
  return battleMediaTemplate
    ? `${payload.article_html.trim()}\n${battleMediaTemplate}`
    : payload.article_html.trim();
}

function markerRegex(begin, end) {
  return new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}

function extractMarkedBlock(html, begin, end) {
  return String(html || '').match(markerRegex(begin, end))?.[0] || '';
}

function extractArticleInner(html) {
  return String(html || '').match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0]
    ?.replace(/^<article\b[^>]*>/i, '')
    ?.replace(/<\/article>\s*$/i, '')
    ?.trim() || '';
}

function stripGeneratedArticleBits(html) {
  return String(html || '')
    .replace(markerRegex(SAM_CONTENT_BEGIN, SAM_CONTENT_END), '')
    .replace(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/gi, '')
    .replace(/<div\b[^>]*\bid=["']bible-content["'][^>]*><\/div>/gi, '')
    .trim();
}

function renderManualContentBlock(content, { legacyPreserved = false } = {}) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';
  const note = legacyPreserved ? `${LEGACY_PRESERVED_CONTENT_NOTE}\n` : '';
  return `${MANUAL_CONTENT_BEGIN}\n${note}${trimmed}\n${MANUAL_CONTENT_END}`;
}

function renderSamContentBlock(payload) {
  return `${SAM_CONTENT_BEGIN}\n${renderArticleMiddle(payload)}\n${SAM_CONTENT_END}`;
}

export function getManualContentBlock(existingHtml) {
  const markedManual = extractMarkedBlock(existingHtml, MANUAL_CONTENT_BEGIN, MANUAL_CONTENT_END);
  if (markedManual) return markedManual;

  if (extractMarkedBlock(existingHtml, SAM_CONTENT_BEGIN, SAM_CONTENT_END)) return '';

  const articleInner = stripGeneratedArticleBits(extractArticleInner(existingHtml));
  return renderManualContentBlock(articleInner, { legacyPreserved: true });
}

export function mergeArticleOwnershipSections(payload, existingHtml = '') {
  const manualBlock = getManualContentBlock(existingHtml);
  const samBlock = renderSamContentBlock(payload);
  return [manualBlock, samBlock]
    .filter(Boolean)
    .join('\n\n');
}

function assertManualContentPreserved(existingHtml, renderedHtml, relPagePath) {
  const manualBlock = getManualContentBlock(existingHtml);
  if (!manualBlock) return;
  if (!renderedHtml.includes(manualBlock)) {
    throw new Error(`manual content preservation failed for ${relPagePath}`);
  }
}

export function renderPageFromTemplate(payload, rootDir = ROOT, existingHtml = '') {
  const templatePath = path.join(rootDir, '_article-template.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  const catSlug = categorySlug(payload.category);
  const articleMiddle = mergeArticleOwnershipSections(payload, existingHtml);

  const pageHtml = template
    .replace(
      /<!-- ARTICLE CONTENT [\s\S]*?<\/article>/,
      `<!-- ARTICLE CONTENT - imported from middle_content_only payload -->\n      <article class="wiki-content" data-entity-slug="${escapeHtml(payload.slug)}">\n${articleMiddle}\n\n        <div id="bible-content"></div>\n      </article>`
    );

  const withPayloadSections = pageHtml
    .replace(
      /<!-- CITATIONS [\s\S]*?<section class="citations-section"[\s\S]*?<\/section>/,
      `<!-- CITATIONS - imported from middle_content_only payload -->${renderCitations(payload.citations)}`
    )
    .replace(
      /<!-- CATEGORY TAGS [\s\S]*?<div class="category-tags"[\s\S]*?<\/div>/,
      `<!-- CATEGORY TAGS - imported from middle_content_only payload -->${renderCategoryTags(payload)}`
    );

  return normalizeRenderedShell(withPayloadSections
    .replaceAll('ARTICLE TITLE', escapeHtml(payload.title))
    .replaceAll('ARTICLE DESCRIPTION', escapeHtml(payload.description))
    .replaceAll('ARTICLE-SLUG', escapeHtml(payload.slug))
    .replaceAll('{{ARTICLE_SLUG}}', escapeHtml(payload.slug))
    .replaceAll('{{ENTITY_SLUG}}', escapeHtml(payload.slug))
    .replaceAll('CATEGORY.html', `${escapeHtml(catSlug)}.html`)
    .replaceAll('CATEGORY NAME', escapeHtml(payload.category))
    .replaceAll('CATEGORY', escapeHtml(payload.category)));
}

export function plannedPagePath(payload) {
  return path.join('wiki', `${payload.slug}.html`).replaceAll('\\', '/');
}

function payloadToIndexEntry(payload) {
  const url = `/wiki/${payload.slug}.html`;
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  const words = stripHtml(payload.article_html).split(/\s+/).filter(Boolean);
  const tokens = Array.from(new Set([
    ...tokenize(payload.title),
    ...tokenize(payload.description),
    ...tags.flatMap(tokenize),
  ]));

  return {
    title: `${payload.title} - Crypto Moonboys Wiki`,
    desc: payload.description,
    url,
    tags,
    category: categorySlug(payload.category),
    aliases: [],
    rank_score: Math.max(100, words.length),
    rank_signals: {
      category: categorySlug(payload.category),
      has_description: true,
      article_word_count: words.length,
      word_count: words.length,
      heading_count: (payload.article_html.match(/<h[2-6]\b/gi) || []).length,
      internal_link_count: (payload.article_html.match(/href=["']\/wiki\//gi) || []).length,
      content_quality_score: Math.min(100, Math.max(1, Math.floor(words.length / 5))),
      authority_score: 0,
    },
    rank_diagnostics: {
      final_rank_score: Math.max(100, words.length),
    },
    search_index: {
      normalized_title: tokenize(payload.title).join(' '),
      tokens: tokenize(payload.title),
      keyword_bag: tokens,
    },
    link_score: {
      inbound_count: 0,
      outbound_count: 0,
      existing_outbound_count: 0,
      suggested_outbound_count: 0,
      authority: 0,
    },
    brand: null,
  };
}

function titleFromHtml(html, fallback) {
  const title = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    fallback;
  return stripHtml(title).replace(/\s+-\s+Crypto Moonboys Wiki$/i, '').trim() || fallback;
}

function descriptionFromHtml(html) {
  return String(html || '').match(/<meta\b(?=[^>]*name=["']description["'])(?=[^>]*content=["']([^"']+)["'])[^>]*>/i)?.[1] ||
    stripHtml(String(html || '').match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '').slice(0, 180);
}

function categoryFromHtml(html) {
  const categoryHref = String(html || '').match(/href=["']\/categories\/([^"']+)\.html["']/i)?.[1];
  return categoryHref || 'lore';
}

function htmlToIndexEntry(url, html) {
  const slug = url.replace(/^\/wiki\//, '').replace(/\.html$/, '');
  const title = titleFromHtml(html, slug.replace(/-/g, ' '));
  const description = descriptionFromHtml(html);
  const category = categoryFromHtml(html);
  const words = stripHtml(html).split(/\s+/).filter(Boolean);
  const tokens = Array.from(new Set([...tokenize(title), ...tokenize(description)]));

  return {
    title: `${title} - Crypto Moonboys Wiki`,
    desc: description,
    url,
    tags: tokens.slice(0, 12),
    category,
    aliases: [],
    rank_score: Math.max(100, words.length),
    rank_signals: {
      category,
      has_description: Boolean(description),
      article_word_count: words.length,
      word_count: words.length,
      heading_count: (html.match(/<h[1-6]\b/gi) || []).length,
      internal_link_count: (html.match(/href=["']\/wiki\//gi) || []).length,
      content_quality_score: Math.min(100, Math.max(1, Math.floor(words.length / 5))),
      authority_score: 0,
    },
    rank_diagnostics: {
      final_rank_score: Math.max(100, words.length),
    },
    search_index: {
      normalized_title: tokenize(title).join(' '),
      tokens: tokenize(title),
      keyword_bag: tokens,
    },
    link_score: {
      inbound_count: 0,
      outbound_count: 0,
      existing_outbound_count: 0,
      suggested_outbound_count: 0,
      authority: 0,
    },
    brand: null,
  };
}

function discoverWikiPageEntries(rootDir) {
  const wikiDir = path.join(rootDir, 'wiki');
  if (!fs.existsSync(wikiDir)) return [];

  return fs.readdirSync(wikiDir)
    .filter((fileName) => fileName.endsWith('.html') && fileName !== 'index.html')
    .map((fileName) => {
      const url = `/wiki/${fileName}`;
      const html = fs.readFileSync(path.join(wikiDir, fileName), 'utf8');
      return htmlToIndexEntry(url, html);
    });
}

function loadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : Object.values(parsed || {});
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export function persistRelationshipHints(rootDir, payloads) {
  const hintsPath = path.join(rootDir, RELATIONSHIP_HINTS_FILE);
  const existing = readJsonObject(hintsPath);
  let changed = false;

  for (const payload of payloads) {
    const hints = sanitizeRelationshipHints(payload.relationship_hints);
    const url = `/wiki/${payload.slug}.html`;
    if (Object.keys(hints).length === 0) continue;

    existing[url] = {
      slug: payload.slug,
      url,
      title: payload.title,
      relationship_hints: hints,
    };
    changed = true;
  }

  if (changed || fs.existsSync(hintsPath)) {
    writeJson(hintsPath, existing);
  }

  return existing;
}

function snapshotFiles(rootDir, relativePaths) {
  const snapshot = new Map();
  for (const relativePath of relativePaths) {
    const normalizedPath = relativePath.replaceAll('\\', '/');
    const filePath = path.join(rootDir, normalizedPath);
    snapshot.set(normalizedPath, {
      exists: fs.existsSync(filePath),
      content: fs.existsSync(filePath) ? fs.readFileSync(filePath) : null,
    });
  }
  return snapshot;
}

function restoreSnapshot(rootDir, snapshot) {
  for (const [relativePath, entry] of snapshot) {
    const filePath = path.join(rootDir, relativePath);
    if (entry.exists) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, entry.content);
    } else if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function expectedSyncFiles(payloads) {
  const categoryFiles = new Set(['categories/index.html']);
  for (const payload of payloads) {
    categoryFiles.add(`categories/${categorySlug(payload.category)}.html`);
  }

  return [
    ...categoryFiles,
    'js/wiki-publish-audit.json',
    'js/wiki-index.json',
    RELATIONSHIP_HINTS_FILE,
    'js/link-map.json',
    'js/link-graph.json',
    'js/entity-map.json',
    'sam-memory.json',
    'js/entity-graph.json',
    'js/graph-data.json',
    'js/timeline-data.json',
    'js/timeline-intelligence.json',
    'js/authority-trust.json',
    'js/cluster-health.json',
    'js/content-gaps.json',
    'js/growth-priority.json',
    'js/publishing-readiness.json',
    'js/site-stats.json',
    'index_stats.json',
    'sitemap.xml',
  ];
}

function upsertByUrl(existingEntries, newEntries) {
  const byUrl = new Map();
  for (const entry of existingEntries) {
    if (entry && entry.url) byUrl.set(entry.url, entry);
  }
  for (const entry of newEntries) byUrl.set(entry.url, entry);
  return [...byUrl.values()].sort((a, b) =>
    (b.rank_score || 0) - (a.rank_score || 0) ||
    String(a.title || '').localeCompare(String(b.title || '')) ||
    String(a.url || '').localeCompare(String(b.url || ''))
  );
}

function renderCategoryPage(category, entries) {
  const catSlug = categorySlug(category);
  const items = entries
    .map((entry) => `        <a href="${escapeHtml(entry.url)}" class="article-list-item">
          <div class="ali-icon">&bull;</div>
          <div><div class="ali-title">${escapeHtml(cleanTitle(entry.title))}</div><div class="ali-desc">${escapeHtml(entry.desc || '')}</div></div>
        </a>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(category)} - Crypto Moonboys Wiki.">
  <meta name="robots" content="index, follow">
  <title>${escapeHtml(category)} - Crypto Moonboys Wiki</title>
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" type="image/png" href="/favicon.png">
</head>
<body class="page-category page-standard-shell">
<main id="content" role="main">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/index.html">Home</a><span class="sep">&rsaquo;</span><a href="/categories/index.html">Categories</a><span class="sep">&rsaquo;</span><span aria-current="page">${escapeHtml(category)}</span></nav>
      <h1 class="page-title">${escapeHtml(category)}</h1>
      <div class="page-title-line" aria-hidden="true"></div>
      <div class="article-list" aria-label="Articles in ${escapeHtml(category)}">
${items}
      </div>
    </main>
<script data-cfasync="false" src="/js/api-config.js"></script>
<script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script>
<script data-cfasync="false" src="/js/identity-gate.js"></script>
<script data-cfasync="false" src="/js/core/moonboys-state.js"></script>
<script data-cfasync="false" src="/js/core/daily-loop-state.js"></script>
<script data-cfasync="false" src="/js/site-shell.js"></script>
<script data-cfasync="false" src="/js/components/connection-status-panel.js"></script>
<script data-cfasync="false" src="/js/components/global-player-header.js"></script>
<script data-cfasync="false" src="/js/components/live-activity-summary.js"></script>
<script data-cfasync="false" src="/js/wiki.js"></script>
</body>
</html>
`;
}

function renderCategoryListItem(entry) {
  return `        <a href="${escapeHtml(entry.url)}" class="article-list-item">
          <div class="ali-icon">&bull;</div>
          <div><div class="ali-title">${escapeHtml(cleanTitle(entry.title))}</div><div class="ali-desc">${escapeHtml(entry.desc || '')}</div></div>
        </a>`;
}

function renderCategoryCard(category) {
  return `        <a href="/categories/${escapeHtml(categorySlug(category))}.html" class="category-card"><span class="cat-icon" aria-hidden="true">&bull;</span><div><div class="cat-name">${escapeHtml(category)}</div><div class="cat-desc">Browse ${escapeHtml(category)} articles.</div></div></a>`;
}

function upsertIntoExistingCategoryPage(filePath, category, entries) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, renderCategoryPage(category, entries), 'utf8');
    return;
  }

  let html = fs.readFileSync(filePath, 'utf8');
  const missingItems = entries
    .filter((entry) => !html.includes(`href="${entry.url}"`) && !html.includes(`href='${entry.url}'`))
    .map(renderCategoryListItem);

  if (missingItems.length === 0) return;

  if (html.includes('class="article-list"')) {
    html = html.replace(/(\s*<\/div>\s*<\/main>)/, `\n${missingItems.join('\n')}$1`);
  } else {
    html = html.replace(/(\s*<\/main>)/, `\n      <div class="article-list" aria-label="Articles in ${escapeHtml(category)}">\n${missingItems.join('\n')}\n      </div>$1`);
  }

  fs.writeFileSync(filePath, html, 'utf8');
}

function upsertCategoryIndex(indexPath, wikiIndex) {
  const categories = Array.from(new Set(wikiIndex.map((entry) => entry.category || 'Lore')))
    .sort((a, b) => String(a).localeCompare(String(b)));
  const cards = categories.map(renderCategoryCard);

  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>All Categories - Crypto Moonboys Wiki</title><link rel="stylesheet" href="/css/wiki.css"></head>
<body class="page-categories page-standard-shell"><main id="content" role="main"><h1 class="page-title">All Categories</h1><div class="category-grid" aria-label="All categories">
${cards.join('\n')}
</div></main><script data-cfasync="false" src="/js/core/daily-loop-state.js"></script><script data-cfasync="false" src="/js/site-shell.js"></script></body></html>
`, 'utf8');
    return;
  }

  let html = fs.readFileSync(indexPath, 'utf8');
  const missingCards = categories
    .filter((category) => !html.includes(`/categories/${categorySlug(category)}.html`))
    .map(renderCategoryCard);

  if (missingCards.length === 0) return;

  if (html.includes('class="category-grid"')) {
    html = html.replace(/(\s*<\/div>\s*<\/main>)/, `\n${missingCards.join('\n')}$1`);
  } else {
    html = html.replace(/(\s*<\/main>)/, `\n      <div class="category-grid" aria-label="All categories">\n${missingCards.join('\n')}\n      </div>$1`);
  }

  fs.writeFileSync(indexPath, html, 'utf8');
}

function syncCategories(rootDir, wikiIndex, payloads) {
  const categoriesDir = path.join(rootDir, 'categories');
  fs.mkdirSync(categoriesDir, { recursive: true });

  const touchedCategories = Array.from(new Set(payloads.map((payload) => payload.category))).sort();
  for (const category of touchedCategories) {
    const catSlug = categorySlug(category);
    const entries = wikiIndex.filter((entry) => categorySlug(entry.category) === catSlug);
    upsertIntoExistingCategoryPage(path.join(categoriesDir, `${catSlug}.html`), category, entries);
  }

  upsertCategoryIndex(path.join(categoriesDir, 'index.html'), wikiIndex);
}

function syncPortableSurfaces(rootDir, payloads, logger) {
  const jsDir = path.join(rootDir, 'js');
  fs.mkdirSync(jsDir, { recursive: true });
  persistRelationshipHints(rootDir, payloads);

  const payloadEntries = payloads.map(payloadToIndexEntry);
  const discoveredWikiEntries = discoverWikiPageEntries(rootDir);
  const wikiIndexPath = path.join(jsDir, 'wiki-index.json');
  const wikiIndex = upsertByUrl(loadJsonArray(wikiIndexPath), [...discoveredWikiEntries, ...payloadEntries]);
  writeJson(wikiIndexPath, wikiIndex);

  syncCategories(rootDir, wikiIndex, payloads);

  const linkMap = {};
  const linkGraph = {};
  for (const entry of wikiIndex) {
    linkMap[entry.url] = { existing_links: [], suggested_links: [] };
    linkGraph[entry.url] = { outbound_count: 0, inbound_count: 0, existing_outbound: [], suggested_outbound: [], inbound_from: [] };
  }
  writeJson(path.join(jsDir, 'link-map.json'), linkMap);
  writeJson(path.join(jsDir, 'link-graph.json'), linkGraph);

  const entityMap = wikiIndex.map((entry) => ({
    entity_id: entry.url.replace(/^\/wiki\//, '').replace(/\.html$/, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase(),
    canonical_title: cleanTitle(entry.title),
    canonical_url: entry.url,
    category: entry.category || 'lore',
    aliases: [],
    tags: entry.tags || [],
    source_urls: [entry.url],
    brand: entry.brand || null,
  }));
  writeJson(path.join(jsDir, 'entity-map.json'), entityMap);

  const samMemory = {
    entities: Object.fromEntries(entityMap.map((entry) => [entry.entity_id, {
      aliases: entry.aliases,
      alias_candidates: [],
      canonical_title: entry.canonical_title,
      canonical_url: entry.canonical_url,
      category: entry.category,
      source_urls: entry.source_urls,
      status: 'canonical',
      tags: entry.tags,
    }])),
    updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  writeJson(path.join(rootDir, 'sam-memory.json'), samMemory);

  const entityGraph = Object.fromEntries(wikiIndex.map((entry) => [entry.url, { related_pages: [] }]));
  writeJson(path.join(jsDir, 'entity-graph.json'), entityGraph);
  writeJson(path.join(jsDir, 'graph-data.json'), {
    generated_at: new Date().toISOString(),
    nodes: wikiIndex.map((entry) => ({
      id: entry.url,
      title: entry.title,
      url: entry.url,
      category: entry.category,
      rank_score: entry.rank_score,
      authority_score: 0,
    })),
    edges: [],
  });

  const timelineEvents = wikiIndex.map((entry, index) => ({
    id: entry.url.replace(/^\/wiki\//, '').replace(/\.html$/, ''),
    title: cleanTitle(entry.title),
    url: entry.url,
    category: entry.category,
    era: 'Imported Payloads',
    sort_key: 9000 + index,
    tags: entry.tags || [],
    rank_score: entry.rank_score || 0,
    is_event_page: false,
  }));
  writeJson(path.join(jsDir, 'timeline-data.json'), {
    generated_at: new Date().toISOString(),
    events: timelineEvents,
    category_timeline: {},
    eras: ['Imported Payloads'],
  });
  writeJson(path.join(jsDir, 'timeline-intelligence.json'), {
    generated_at: new Date().toISOString(),
    entries: timelineEvents.map((event, index) => ({
      event_name: event.title,
      event_id: event.id,
      era: event.era,
      canonical_url: event.url,
      category: event.category,
      sort_key: event.sort_key,
      timeline_position: index + 1,
      narrative_weight: 0,
      related_entities: [],
      is_event_page: false,
      rank_score: event.rank_score,
    })),
  });

  writeJson(path.join(jsDir, 'site-stats.json'), {
    article_count: wikiIndex.length,
    entity_count: entityMap.length,
    category_count: new Set(wikiIndex.map((entry) => entry.category)).size,
    totalArticles: wikiIndex.length,
    totalEntities: entityMap.length,
    totalCategories: new Set(wikiIndex.map((entry) => entry.category)).size,
    canonical_hub: '/search.html',
    last_updated: new Date().toISOString(),
  });
  writeJson(path.join(jsDir, 'cluster-health.json'), {
    generated_at: new Date().toISOString(),
    summary: { total_clusters: new Set(wikiIndex.map((entry) => entry.category)).size, total_pages: wikiIndex.length },
    clusters: [],
  });
  writeJson(path.join(jsDir, 'publishing-readiness.json'), {
    generated_at: new Date().toISOString(),
    summary: { total_entries: wikiIndex.length },
    entries: wikiIndex.map((entry) => ({ url: entry.url, readable_title: cleanTitle(entry.title), readiness_score: 0 })),
  });

  const sitemapUrls = ['https://cryptomoonboys.com/', ...wikiIndex.map((entry) => `https://cryptomoonboys.com${entry.url}`)];
  fs.writeFileSync(path.join(rootDir, 'sitemap.xml'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapUrls.map((loc) => `  <url><loc>${escapeHtml(loc)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n'), 'utf8');

  logger(`Synced portable feed surfaces: ${AFFECTED_SYNC_SURFACES.join(', ')}`);
  return {
    updatedSurfaces: [...AFFECTED_SYNC_SURFACES],
    files: [
      'js/wiki-index.json',
      'categories/index.html',
      'js/timeline-data.json',
      'js/timeline-intelligence.json',
      'js/entity-map.json',
      'sam-memory.json',
      'js/entity-graph.json',
      'js/graph-data.json',
      'js/site-stats.json',
      'js/cluster-health.json',
      'js/publishing-readiness.json',
      'sitemap.xml',
    ],
  };
}

function runScriptStep(rootDir, step, logger) {
  const scriptPath = path.join(rootDir, step.script);
  if (!fs.existsSync(scriptPath)) {
    throw new FeedSyncError(step.surface, `feed sync not implemented for ${step.surface}`);
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.stdout) logger(result.stdout.trim());
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new FeedSyncError(step.surface, `feed sync failed for ${step.surface}: ${step.script}${detail ? `\n${detail}` : ''}`);
  }
}

export function assertRequiredRealRootSyncScripts(rootDir = ROOT) {
  for (const step of REAL_ROOT_SYNC_STEPS) {
    if (!fs.existsSync(path.join(rootDir, step.script))) {
      throw new FeedSyncError(step.surface, `feed sync not implemented for ${step.surface}`);
    }
  }
}

function assertPayloadUrlsSynced(rootDir, payloads) {
  const wikiIndex = loadJsonArray(path.join(rootDir, 'js', 'wiki-index.json'));
  const indexedUrls = new Set(wikiIndex.map((entry) => entry.url));
  for (const payload of payloads) {
    const url = `/wiki/${payload.slug}.html`;
    if (!indexedUrls.has(url)) {
      throw new FeedSyncError('search', `feed sync failed for search: ${url} was not written to js/wiki-index.json`);
    }
  }

  const sitemapPath = path.join(rootDir, 'sitemap.xml');
  const sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
  for (const payload of payloads) {
    if (!sitemap.includes(`https://cryptomoonboys.com/wiki/${payload.slug}.html`)) {
      throw new FeedSyncError('sitemap', `feed sync failed for sitemap: /wiki/${payload.slug}.html is missing`);
    }
  }
}

function syncRealRootSurfaces(rootDir, payloads, logger) {
  assertRequiredRealRootSyncScripts(rootDir);
  persistRelationshipHints(rootDir, payloads);

  for (const step of REAL_ROOT_SYNC_STEPS) {
    runScriptStep(rootDir, step, logger);
  }

  const wikiIndex = loadJsonArray(path.join(rootDir, 'js', 'wiki-index.json'));
  syncCategories(rootDir, wikiIndex, payloads);
  assertPayloadUrlsSynced(rootDir, payloads);

  logger(`Synced website feed surfaces: ${AFFECTED_SYNC_SURFACES.join(', ')}`);
  return {
    updatedSurfaces: [...AFFECTED_SYNC_SURFACES],
    files: REAL_ROOT_SYNC_STEPS.map((step) => step.script),
  };
}

export function syncFeedSurfaces(rootDir, payloads, logger = console.log) {
  const missingSurface = AFFECTED_SYNC_SURFACES.find((surface) => !surface);
  if (missingSurface) throw new FeedSyncError(missingSurface);

  if (path.resolve(rootDir) === ROOT) {
    return syncRealRootSurfaces(rootDir, payloads, logger);
  }

  return syncPortableSurfaces(rootDir, payloads, logger);
}

export function runImport({
  payloadDir = DEFAULT_PAYLOAD_DIR,
  rootDir = ROOT,
  write = false,
  logger = console.log,
  syncFeedSurfacesFn = syncFeedSurfaces,
} = {}) {
  const validation = validatePayloadDirectory(payloadDir);
  if (validation.skipped) {
    logger(validation.message);
    return { ...validation, write, plannedPages: [], affectedSyncSurfaces: AFFECTED_SYNC_SURFACES };
  }

  logger(`Website publish payload importer running in ${write ? 'write' : 'dry-run'} mode.`);
  logger(`Affected sync surfaces: ${AFFECTED_SYNC_SURFACES.join(', ')}`);

  const plannedPages = [];
  const payloads = validation.payloads.map(({ payload }) => payload);
  const renderedPages = write
    ? validation.payloads.map(({ payload }) => {
      const relPagePath = plannedPagePath(payload);
      const existingPagePath = path.join(rootDir, relPagePath);
      const existingHtml = fs.existsSync(existingPagePath) ? fs.readFileSync(existingPagePath, 'utf8') : '';
      const html = renderPageFromTemplate(payload, rootDir, existingHtml);
      assertManualContentPreserved(existingHtml, html, relPagePath);
      return {
        payload,
        relPagePath,
        existingHtml,
        html,
      };
    })
    : [];

  for (const { payload } of validation.payloads) {
    const relPagePath = plannedPagePath(payload);
    plannedPages.push(relPagePath);
    logger(`Intended page path: ${relPagePath}`);
  }

  if (!write) {
    logger('Dry run only: no pages were written. Pass --write to render with the website template/shell.');
  }

  let sync = null;
  if (write) {
    const touchedFiles = [
      ...renderedPages.map((page) => page.relPagePath),
      ...expectedSyncFiles(payloads),
    ];
    const snapshot = snapshotFiles(rootDir, touchedFiles);

    try {
      for (const page of renderedPages) {
        const outputPath = path.join(rootDir, page.relPagePath);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, page.html);
        logger(`Wrote page: ${page.relPagePath}`);
      }
      sync = syncFeedSurfacesFn(rootDir, payloads, logger);
    } catch (error) {
      restoreSnapshot(rootDir, snapshot);
      logger('Write-mode import rolled back because feed sync failed.');
      throw error;
    }
  }

  return {
    ...validation,
    write,
    plannedPages,
    affectedSyncSurfaces: AFFECTED_SYNC_SURFACES,
    sync,
  };
}

function parseArgs(argv) {
  let payloadDir = DEFAULT_PAYLOAD_DIR;
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      write = true;
    } else if (arg === '--payload-dir') {
      payloadDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--payload-dir=')) {
      payloadDir = path.resolve(arg.slice('--payload-dir='.length));
    } else {
      payloadDir = path.resolve(arg);
    }
  }

  return { payloadDir, write };
}

function cli() {
  const options = parseArgs(process.argv.slice(2));

  try {
    runImport(options);
  } catch (error) {
    if (error instanceof PayloadValidationError) {
      console.error('Website publish payload import failed validation:');
      for (const failure of error.failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    if (error instanceof FeedSyncError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli();
}
