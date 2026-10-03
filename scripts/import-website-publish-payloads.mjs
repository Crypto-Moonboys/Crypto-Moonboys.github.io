#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PayloadValidationError, validatePayload, validatePayloadDirectory } from './validate-website-publish-payloads.mjs';
import {
  decodeHtmlAttributeValue,
  extractCanonicalContentHtml,
  findFirstActiveOpeningTag,
  inspectOwnershipTopology,
  readHtmlAttribute,
  readHtmlAttributes,
  tokenizeActiveHtml,
} from './wiki-html-structure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PAYLOAD_DIR = path.join(ROOT, 'website-publish-payloads');
export const CONTENT_STATE_MANIFEST_FILE = 'brand-canon/wiki-content-state.json';
export const CONTENT_STATE_REPORT_FILE = 'brand-canon/wiki-rewrite-audit.md';
export const ABSENT_STUB_AUTHORIZATIONS_FILE = 'brand-canon/wiki-absent-stubs.json';
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
export const CANONICAL_CONTENT_BEGIN = '<!-- CANONICAL_CONTENT:BEGIN -->';
export const CANONICAL_CONTENT_END = '<!-- CANONICAL_CONTENT:END -->';
export const LEGACY_PRESERVED_CONTENT_NOTE = '<!-- LEGACY_PRESERVED_CONTENT: unmarked existing website article preserved for manual review; not proof of fresh SAM output or owner-approved canon. -->';
export const AUTOMATION_POLICIES = [
  'metadata-only',
  'replace-sam-block',
  'canon-locked',
  'stub-allowed',
];
export const MAX_STUB_ARTICLE_WORDS = 250;
export const PUBLISH_TRANSACTION_LOCK = '.wiki-content-publish.lock';
const DURABLE_TRANSACTION_QUARANTINE_PREFIX = '.wiki-content-publish-quarantine-';
const DURABLE_TRANSACTION_QUARANTINE_PATTERN =
  /^\.wiki-content-publish-quarantine-[A-Za-z0-9]{6}$/;
const DURABLE_QUARANTINE_PHASES = new Set([
  'page-forward',
  'artifact-forward',
  'conditional-rollback',
]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
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

export class ContentOwnershipError extends Error {
  constructor(code, message, { slug = '', path: pagePath = '' } = {}) {
    super(message);
    this.name = 'ContentOwnershipError';
    this.code = code;
    this.slug = slug;
    this.pagePath = pagePath;
  }
}

export function sha256Content(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function normalizeSamOwnedContent(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

export function computeSamContentHash(payload) {
  return sha256Content(normalizeSamOwnedContent(renderArticleMiddle(payload)));
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

const REAL_ROOT_GENERATED_FILES = Object.freeze([
  'js/wiki-publish-audit.json',
  'js/wiki-index.json',
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
]);

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
  return decodeHtmlAttributeValue(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
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

function markerCount(html, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(html || '').match(new RegExp(escaped, 'gi')) || []).length;
}

export function countCanonicalContentBlocks(html) {
  const source = String(html || '');
  const markedCount = markerCount(source, CANONICAL_CONTENT_BEGIN);
  const withoutMarkedBlocks = source.replace(
    new RegExp(markerRegex(CANONICAL_CONTENT_BEGIN, CANONICAL_CONTENT_END).source, 'gi'),
    ' '
  );
  const attributeCount = tokenizeActiveHtml(withoutMarkedBlocks).filter((token) => {
    if (token.type !== 'tag' || token.closing) return false;
    const attribute = readHtmlAttribute(token.raw, 'data-canonical-content');
    return attribute.present && (attribute.value === null || String(attribute.value).toLowerCase() === 'true');
  }).length;
  return markedCount + attributeCount;
}

export function assertOwnershipMarkerStructure(existingHtml, relPagePath = '<page>') {
  const markerPairs = [
    ['MANUAL_CONTENT', MANUAL_CONTENT_BEGIN, MANUAL_CONTENT_END, false],
    ['SAM_CONTENT', SAM_CONTENT_BEGIN, SAM_CONTENT_END, true],
    ['CANONICAL_CONTENT', CANONICAL_CONTENT_BEGIN, CANONICAL_CONTENT_END, true],
  ];

  for (const [label, begin, end, singleBlockOnly] of markerPairs) {
    const beginCount = markerCount(existingHtml, begin);
    const endCount = markerCount(existingHtml, end);
    if (beginCount !== endCount) {
      throw new ContentOwnershipError(
        'UNBALANCED_CONTENT_MARKERS',
        `${relPagePath}: unbalanced ${label} markers (${beginCount} begin, ${endCount} end)`,
        { path: relPagePath }
      );
    }
    if (beginCount > 0 && !markerRegex(begin, end).test(String(existingHtml || ''))) {
      throw new ContentOwnershipError(
        'MALFORMED_CONTENT_MARKERS',
        `${relPagePath}: ${label} markers are out of order or overlap`,
        { path: relPagePath }
      );
    }
    if (singleBlockOnly && beginCount > 1) {
      throw new ContentOwnershipError(
        label === 'SAM_CONTENT' ? 'MULTIPLE_SAM_BLOCKS' : 'MULTIPLE_CANONICAL_BLOCKS',
        `${relPagePath}: more than one ${label} block is invalid`,
        { path: relPagePath }
      );
    }
  }
  if (countCanonicalContentBlocks(existingHtml) > 1) {
    throw new ContentOwnershipError(
      'MULTIPLE_CANONICAL_BLOCKS',
      `${relPagePath}: more than one canonical article-content block is invalid`,
      { path: relPagePath }
    );
  }

  const topology = inspectOwnershipTopology(existingHtml, [
    { label: 'MANUAL_CONTENT', begin: MANUAL_CONTENT_BEGIN, end: MANUAL_CONTENT_END },
    { label: 'SAM_CONTENT', begin: SAM_CONTENT_BEGIN, end: SAM_CONTENT_END, maxBlocks: 1 },
    { label: 'CANONICAL_CONTENT', begin: CANONICAL_CONTENT_BEGIN, end: CANONICAL_CONTENT_END, maxBlocks: 1 },
  ]);
  if (topology.errors.length > 0) {
    throw new ContentOwnershipError(
      'INVALID_CONTENT_TOPOLOGY',
      `${relPagePath}: ${topology.errors.join('; ')}`,
      { path: relPagePath }
    );
  }
}

function extractMarkedBlock(html, begin, end) {
  return String(html || '').match(markerRegex(begin, end))?.[0] || '';
}

function extractMarkedBlocks(html, begin, end) {
  const source = String(html || '');
  const expression = new RegExp(markerRegex(begin, end).source, 'gi');
  return [...source.matchAll(expression)].map((match) => ({
    block: match[0],
    index: match.index ?? -1,
  }));
}

function extractMarkedBlockInner(html, begin, end) {
  const block = extractMarkedBlock(html, begin, end);
  if (!block) return '';
  return block.slice(begin.length, block.length - end.length).trim();
}

function extractArticleInner(html) {
  return extractCanonicalContentHtml(html).trim();
}

function stripGeneratedArticleBits(html) {
  return String(html || '')
    .replace(markerRegex(SAM_CONTENT_BEGIN, SAM_CONTENT_END), '')
    .replace(/<!-- RELATED_WIKI_PATHS:BEGIN -->[\s\S]*?<!-- RELATED_WIKI_PATHS:END -->/gi, '')
    .replace(/<div\b[^>]*\bid=["']bible-content["'][^>]*><\/div>/gi, '')
    .trim();
}

export function hasRootWikiStubMarker(existingHtml) {
  const source = String(existingHtml || '');
  const tag = findFirstActiveOpeningTag(source, 'body');
  if (!tag) return false;
  const attributes = readHtmlAttributes(tag.raw)
    .filter(({ name }) => name === 'data-wiki-stub');
  const attribute = attributes[0];
  return Boolean(
    attributes.length === 1 && attribute &&
    (attribute.quote === '"' || attribute.quote === "'") &&
    String(attribute.rawValue).toLowerCase() === 'true'
  );
}

function hasNoindexRobotsMeta(existingHtml) {
  return robotsMetaTokensInHead(existingHtml).some(({ directives }) => directives.has('noindex'));
}

function activeAncestorsAt(tokens, targetIndex) {
  const stack = [];
  for (let index = 0; index < targetIndex; index += 1) {
    const token = tokens[index];
    if (token.type !== 'tag') continue;
    if (!token.closing && !token.selfClosing) {
      stack.push(token);
      continue;
    }
    if (!token.closing) continue;
    const openingIndex = stack.map(({ name }) => name).lastIndexOf(token.name);
    if (openingIndex >= 0) stack.splice(openingIndex);
  }
  return stack;
}

const STRICT_HEAD_PREFIX_ELEMENTS = new Set([
  'base', 'basefont', 'bgsound', 'link', 'meta',
]);

function hasUnbrokenHeadPrefix(existingHtml, tokens, headToken, targetIndex) {
  const headIndex = tokens.indexOf(headToken);
  if (headIndex < 0) return false;
  let cursor = headToken.end;

  for (let index = headIndex + 1; index < targetIndex; index += 1) {
    const token = tokens[index];
    if (!/^[\t\n\f\r ]*$/.test(String(existingHtml).slice(cursor, token.start))) return false;
    if (token.type === 'comment') {
      cursor = token.end;
      continue;
    }
    if (
      token.type !== 'tag' ||
      token.closing ||
      !STRICT_HEAD_PREFIX_ELEMENTS.has(token.name)
    ) return false;
    cursor = token.end;
  }

  return /^[\t\n\f\r ]*$/.test(String(existingHtml).slice(cursor, tokens[targetIndex].start));
}

function robotsMetaTokensInHead(existingHtml) {
  const tokens = tokenizeActiveHtml(existingHtml);
  const robots = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'tag' || token.closing || token.name !== 'meta') continue;
    const name = readHtmlAttribute(token.raw, 'name');
    if (!name.present || String(name.value || '').trim().toLowerCase() !== 'robots') continue;
    const ancestors = activeAncestorsAt(tokens, index);
    const ancestorNames = ancestors.map(({ name: tagName }) => tagName);
    if (ancestorNames.join('/') !== 'html/head') continue;
    if (!hasUnbrokenHeadPrefix(existingHtml, tokens, ancestors[1], index)) continue;
    const content = readHtmlAttribute(token.raw, 'content');
    if (!content.present) continue;
    const directives = new Set();
    for (const directive of String(content.value || '').split(/[\t\n\f\r ,]+/)) {
      if (directive) directives.add(directive.toLowerCase());
    }
    robots.push({ token, directives });
  }
  return robots;
}

function activeElementInnerText(html, tokens, openingIndex) {
  const opening = tokens[openingIndex];
  if (!opening || opening.closing || opening.selfClosing) return '';
  let depth = 1;
  for (let index = openingIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'tag' || token.name !== opening.name) continue;
    if (!token.closing && !token.selfClosing) depth += 1;
    if (token.closing) depth -= 1;
    if (depth === 0) return stripHtml(String(html).slice(opening.end, token.start));
  }
  return '';
}

function tokenHasClass(token, expectedClass) {
  const classAttribute = readHtmlAttribute(token.raw, 'class');
  return classAttribute.present && String(classAttribute.value || '')
    .split(/[\t\n\f\r ]+/)
    .includes(expectedClass);
}

function hasHardenedStubShell(existingHtml) {
  const robots = robotsMetaTokensInHead(existingHtml);
  if (
    robots.length !== 1 ||
    robots[0].token.raw !== '<meta name="robots" content="noindex, nofollow">'
  ) return false;
  const tokens = tokenizeActiveHtml(existingHtml);
  const visibleUnverifiedNotice = tokens.some((token, index) => {
    if (token.type !== 'tag' || token.closing || token.name !== 'aside') return false;
    const ancestors = activeAncestorsAt(tokens, index);
    const generatedAncestorShell = [
      '<html lang="en">',
      '<body data-wiki-stub="true" class="page-article page-standard-shell">',
      '<main id="content" role="main">',
    ];
    if (
      ancestors.length !== generatedAncestorShell.length ||
      ancestors.some(({ raw }, ancestorIndex) => raw !== generatedAncestorShell[ancestorIndex])
    ) return false;
    const generatedNotice = '<aside class="wiki-stub-notice" role="status" data-generated-wiki-stub-notice="true"><strong>Stub page:</strong> This short entry is unverified and is not a canonical article.</aside>';
    return String(existingHtml).startsWith(generatedNotice, token.start);
  });
  if (!visibleUnverifiedNotice) return false;

  const hasVerifiedBadge = tokens.some((token, index) => {
    if (token.type !== 'tag' || token.closing || !tokenHasClass(token, 'article-badge')) return false;
    return /\bverified\b/i.test(activeElementInnerText(existingHtml, tokens, index));
  });
  return !hasVerifiedBadge;
}

function hasUnownedVisibleArticleContent(existingHtml) {
  if (!String(existingHtml || '').trim()) return false;
  let unownedArticle = extractArticleInner(existingHtml);
  for (const [begin, end] of [
    [MANUAL_CONTENT_BEGIN, MANUAL_CONTENT_END],
    [SAM_CONTENT_BEGIN, SAM_CONTENT_END],
    [CANONICAL_CONTENT_BEGIN, CANONICAL_CONTENT_END],
  ]) {
    const expression = markerRegex(begin, end);
    unownedArticle = unownedArticle.replace(new RegExp(expression.source, 'gi'), '');
  }
  return stripHtml(stripGeneratedArticleBits(unownedArticle)).length > 0;
}

function hasLegacyUnmarkedArticle(existingHtml) {
  if (hasRootWikiStubMarker(existingHtml)) return false;
  return hasUnownedVisibleArticleContent(existingHtml);
}

function isFirstWitnessSlug(slug) {
  return slug === 'the-first-witness' || slug.startsWith('first-witness-');
}

const SAFE_STUB_SHELL_SCRIPT_SRCS = new Set([
  '/js/api-config.js',
  '/js/arcade/core/global-event-bus.js',
  '/js/identity-gate.js',
  '/js/core/moonboys-state.js',
  '/js/core/daily-loop-state.js',
  '/js/site-shell.js',
  '/js/components/connection-status-panel.js',
  '/js/components/global-player-header.js',
  '/js/components/live-activity-summary.js',
  '/js/wiki.js',
  '/js/faction-alignment.js',
  '/js/bible-loader.js',
  '/js/price-ticker.js',
  '/js/engagement.js',
  '/js/comments.js',
  '/js/battle-layer.js',
]);

const ACTIVE_URL_CONTROL_ATTRIBUTES = new Set([
  'action', 'archive', 'background', 'cite', 'classid', 'codebase', 'data',
  'formaction', 'href', 'imagesrcset', 'longdesc', 'manifest', 'ping', 'poster',
  'profile', 'src', 'srcset', 'usemap', 'xlink:href',
]);

const AMBIGUOUS_FOREIGN_PARSER_STATE_ELEMENTS = new Set([
  'iframe', 'noembed', 'noframes', 'noscript', 'plaintext', 'script', 'style',
  'template', 'textarea', 'title', 'xmp',
]);

function dangerousActiveControl(activeTags) {
  for (const token of activeTags) {
    if (token.declarativeShadow === true) return 'template[shadowrootmode]';
    if (
      token.foreignContent === true &&
      AMBIGUOUS_FOREIGN_PARSER_STATE_ELEMENTS.has(token.name)
    ) {
      return `${token.name}[foreign-parser-state]`;
    }
    if (token.name === 'animate' || token.name === 'set') return token.raw;
    for (const attribute of readHtmlAttributes(token.raw)) {
      if (/^on[a-z0-9_:-]+$/i.test(attribute.name) || attribute.name === 'srcdoc') {
        return `${token.name}[${attribute.name}]`;
      }
      if (!ACTIVE_URL_CONTROL_ATTRIBUTES.has(attribute.name) || attribute.value === null) continue;
      const compact = String(attribute.value)
        .trim()
        .replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');
      if (/^(?:javascript|vbscript|data):/i.test(compact)) {
        return `${token.name}[${attribute.name}=${compact.slice(0, 48)}]`;
      }
    }
  }
  return '';
}

function redirectOrAliasTarget(existingHtml, _rootDir, currentSlug) {
  const html = String(existingHtml || '');
  if (/<!\[CDATA\[/i.test(html)) {
    return { kind: 'ambiguous-cdata-control', target: '<![CDATA[' };
  }
  const activeTags = tokenizeActiveHtml(html, {
    includeNoscriptContent: true,
    includeRawTextOpeningTags: true,
  })
    .filter((token) => token.type === 'tag' && !token.closing);
  const metaRefresh = activeTags.find((token) => {
    if (token.name !== 'meta') return false;
    const httpEquiv = readHtmlAttribute(token.raw, 'http-equiv');
    return httpEquiv.present && String(httpEquiv.value || '').trim().toLowerCase() === 'refresh';
  })?.raw || '';
  if (metaRefresh) return { kind: 'redirect', target: metaRefresh };
  const activeControl = dangerousActiveControl(activeTags);
  if (activeControl) return { kind: 'executable-document-control', target: activeControl };
  const executableOrUntrustedScript = activeTags.find((token) => {
    if (token.name !== 'script') return false;
    const type = readHtmlAttribute(token.raw, 'type');
    if (type.present && String(type.value || '').trim().toLowerCase() === 'application/ld+json') return false;
    const src = readHtmlAttribute(token.raw, 'src');
    return !src.present || !SAFE_STUB_SHELL_SCRIPT_SRCS.has(String(src.value || '').trim());
  });
  if (executableOrUntrustedScript) {
    return { kind: 'executable-or-untrusted-script', target: executableOrUntrustedScript.raw };
  }
  const baseControl = activeTags.find((token) => token.name === 'base');
  if (baseControl) return { kind: 'document-control', target: baseControl.raw };

  for (const token of activeTags) {
    if (token.name !== 'link') continue;
    const rel = readHtmlAttribute(token.raw, 'rel');
    if (!rel.present || !String(rel.value || '').split(/[\t\n\f\r ]+/).some((value) => value.toLowerCase() === 'canonical')) continue;
    const hrefAttribute = readHtmlAttribute(token.raw, 'href');
    const href = String(hrefAttribute.value || '').trim();
    let target = null;
    try {
      target = new URL(href, 'https://cryptomoonboys.com/');
    } catch {
      // Invalid or missing canonical targets are aliases until reviewed.
    }
    const exactSelfCanonical = target
      && target.origin === 'https://cryptomoonboys.com'
      && target.pathname === `/wiki/${currentSlug}.html`
      && target.search === ''
      && target.hash === '';
    if (!exactSelfCanonical) {
      return { kind: 'canonical-alias', target: href || 'missing canonical href' };
    }
  }
  return null;
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
  const markedManual = getManualContentBlocks(existingHtml)[0] || '';
  if (markedManual) return markedManual;

  if (hasRootWikiStubMarker(existingHtml)) return '';

  if (
    extractMarkedBlock(existingHtml, SAM_CONTENT_BEGIN, SAM_CONTENT_END) ||
    extractMarkedBlock(existingHtml, CANONICAL_CONTENT_BEGIN, CANONICAL_CONTENT_END)
  ) return '';

  const articleInner = stripGeneratedArticleBits(extractArticleInner(existingHtml));
  return renderManualContentBlock(articleInner, { legacyPreserved: true });
}

export function getManualContentBlocks(existingHtml) {
  return extractMarkedBlocks(existingHtml, MANUAL_CONTENT_BEGIN, MANUAL_CONTENT_END)
    .map(({ block }) => block);
}

export function getCanonicalContentBlock(existingHtml) {
  return extractMarkedBlock(existingHtml, CANONICAL_CONTENT_BEGIN, CANONICAL_CONTENT_END);
}

export function mergeArticleOwnershipSections(payload, existingHtml = '') {
  assertOwnershipMarkerStructure(existingHtml);
  if (
    countCanonicalContentBlocks(existingHtml) > 0 &&
    markerCount(existingHtml, CANONICAL_CONTENT_BEGIN) !== 1
  ) {
    throw new ContentOwnershipError(
      'CANONICAL_BLOCK_NOT_MARKER_OWNED',
      'canonical article content without CANONICAL_CONTENT markers cannot enter the SAM render path'
    );
  }
  const markedManualBlocks = extractMarkedBlocks(existingHtml, MANUAL_CONTENT_BEGIN, MANUAL_CONTENT_END);
  const fallbackManualBlock = markedManualBlocks.length === 0 ? getManualContentBlock(existingHtml) : '';
  const preservedBlocks = [
    ...markedManualBlocks,
    ...(fallbackManualBlock ? [{ block: fallbackManualBlock, index: -1 }] : []),
    {
      block: getCanonicalContentBlock(existingHtml),
      index: String(existingHtml || '').indexOf(CANONICAL_CONTENT_BEGIN),
    },
  ]
    .filter(({ block }) => Boolean(block))
    .sort((left, right) => {
      if (left.index < 0) return 1;
      if (right.index < 0) return -1;
      return left.index - right.index;
    })
    .map(({ block }) => block);
  const samBlock = renderSamContentBlock(payload);
  return [...preservedBlocks, samBlock]
    .filter(Boolean)
    .join('\n\n');
}

function assertManualContentPreserved(existingHtml, renderedHtml, relPagePath) {
  for (const manualBlock of getManualContentBlocks(existingHtml)) {
    if (!renderedHtml.includes(manualBlock)) {
      throw new Error(`manual content preservation failed for ${relPagePath}`);
    }
  }
  const canonicalBlock = getCanonicalContentBlock(existingHtml);
  if (canonicalBlock && !renderedHtml.includes(canonicalBlock)) {
    throw new Error(`canonical content preservation failed for ${relPagePath}`);
  }
}

export function replaceSamContentBlock(existingHtml, payload, relPagePath = '<page>') {
  assertOwnershipMarkerStructure(existingHtml, relPagePath);
  if (markerCount(existingHtml, SAM_CONTENT_BEGIN) !== 1) {
    throw new ContentOwnershipError(
      'SAM_BLOCK_REQUIRED_FOR_REPLACEMENT',
      `${relPagePath}: replace-sam-block requires exactly one existing SAM_CONTENT block`,
      { slug: payload.slug, path: relPagePath }
    );
  }
  const rendered = String(existingHtml).replace(
    markerRegex(SAM_CONTENT_BEGIN, SAM_CONTENT_END),
    () => renderSamContentBlock(payload)
  );
  assertOwnershipMarkerStructure(rendered, relPagePath);
  assertManualContentPreserved(existingHtml, rendered, relPagePath);
  return rendered;
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

  let rendered = normalizeRenderedShell(withPayloadSections
    .replaceAll('ARTICLE TITLE', escapeHtml(payload.title))
    .replaceAll('ARTICLE DESCRIPTION', escapeHtml(payload.description))
    .replaceAll('ARTICLE-SLUG', escapeHtml(payload.slug))
    .replaceAll('{{ARTICLE_SLUG}}', escapeHtml(payload.slug))
    .replaceAll('{{ENTITY_SLUG}}', escapeHtml(payload.slug))
    .replaceAll('CATEGORY.html', `${escapeHtml(catSlug)}.html`)
    .replaceAll('CATEGORY NAME', escapeHtml(payload.category))
    .replaceAll('CATEGORY', escapeHtml(payload.category)));

  if (payload.page_type === 'stub' || payload.stub === true) {
    rendered = rendered
      .replace(
        /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>/i,
        '<meta name="robots" content="noindex, nofollow">'
      )
      .replace(/<body\b(?![^>]*\bdata-wiki-stub=)/i, '<body data-wiki-stub="true"')
      .replace(
        /<span\b(?=[^>]*\bclass\s*=\s*["'][^"']*\barticle-badge\b[^"']*["'])[^>]*>[\s\S]*?<\/span>/i,
        '<span class="article-badge wiki-stub-badge">⚠️ Unverified stub</span>'
      )
      .replace(
        /<article\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bwiki-content\b[^"']*["'])(?![^>]*\bdata-wiki-stub=)/i,
        '<aside class="wiki-stub-notice" role="status" data-generated-wiki-stub-notice="true"><strong>Stub page:</strong> This short entry is unverified and is not a canonical article.</aside>\n      <article data-wiki-stub="true"'
      );
  }
  return rendered;
}

export function plannedPagePath(payload) {
  return path.join('wiki', `${payload.slug}.html`).replaceAll('\\', '/');
}

function ownershipFailure(code, message, payload, relPagePath = plannedPagePath(payload)) {
  return new ContentOwnershipError(code, `${relPagePath}: ${message}`, {
    slug: payload.slug,
    path: relPagePath,
  });
}

export function loadWikiContentState(rootDir = ROOT) {
  const manifestBytes = readWorkspaceFileNoFollow(rootDir, CONTENT_STATE_MANIFEST_FILE);
  if (manifestBytes === null) {
    throw new ContentOwnershipError(
      'MISSING_CONTENT_STATE_MANIFEST',
      `${CONTENT_STATE_MANIFEST_FILE}: required content ownership manifest is missing`,
      { path: CONTENT_STATE_MANIFEST_FILE }
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new ContentOwnershipError(
      'INVALID_CONTENT_STATE_MANIFEST',
      `${CONTENT_STATE_MANIFEST_FILE}: invalid JSON: ${error.message}`,
      { path: CONTENT_STATE_MANIFEST_FILE }
    );
  }

  const rawPages = Array.isArray(manifest?.pages)
    ? manifest.pages
    : manifest?.pages && typeof manifest.pages === 'object'
      ? Object.entries(manifest.pages).map(([slug, page]) => ({ slug, ...page }))
      : null;
  if (!rawPages) {
    throw new ContentOwnershipError(
      'INVALID_CONTENT_STATE_MANIFEST',
      `${CONTENT_STATE_MANIFEST_FILE}: pages must be an array or object`,
      { path: CONTENT_STATE_MANIFEST_FILE }
    );
  }

  const pagesBySlug = new Map();
  for (const page of rawPages) {
    const slug = typeof page?.slug === 'string' ? page.slug.trim() : '';
    if (!slug) {
      throw new ContentOwnershipError(
        'INVALID_CONTENT_STATE_MANIFEST',
        `${CONTENT_STATE_MANIFEST_FILE}: every page entry must have a slug`,
        { path: CONTENT_STATE_MANIFEST_FILE }
      );
    }
    if (pagesBySlug.has(slug)) {
      throw new ContentOwnershipError(
        'DUPLICATE_CONTENT_STATE_ENTRY',
        `${CONTENT_STATE_MANIFEST_FILE}: duplicate page entry for ${slug}`,
        { slug, path: CONTENT_STATE_MANIFEST_FILE }
      );
    }
    if (!AUTOMATION_POLICIES.includes(page.automation_policy)) {
      throw new ContentOwnershipError(
        'INVALID_AUTOMATION_POLICY',
        `${CONTENT_STATE_MANIFEST_FILE}: ${slug} has invalid automation_policy ${JSON.stringify(page.automation_policy)}`,
        { slug, path: CONTENT_STATE_MANIFEST_FILE }
      );
    }
    if (typeof page.page_exists !== 'boolean') {
      throw new ContentOwnershipError(
        'INVALID_CONTENT_STATE_ENTRY',
        `${CONTENT_STATE_MANIFEST_FILE}: ${slug} page_exists must be an explicit boolean`,
        { slug, path: CONTENT_STATE_MANIFEST_FILE }
      );
    }
    if (page.page_exists === false) {
      if (page.automation_policy !== 'stub-allowed') {
        throw new ContentOwnershipError(
          'INVALID_CONTENT_STATE_ENTRY',
          `${CONTENT_STATE_MANIFEST_FILE}: absent page ${slug} must use automation_policy stub-allowed`,
          { slug, path: CONTENT_STATE_MANIFEST_FILE }
        );
      }
      for (const field of ['content_hash', 'article_content_hash', 'article_markup_hash', 'git_blob_oid']) {
        if (page[field] !== null) {
          throw new ContentOwnershipError(
            'INVALID_CONTENT_STATE_ENTRY',
            `${CONTENT_STATE_MANIFEST_FILE}: absent page ${slug} ${field} must be null`,
            { slug, path: CONTENT_STATE_MANIFEST_FILE }
          );
        }
      }
    } else {
      if (!SHA256_PATTERN.test(page.content_hash || '')) {
        throw new ContentOwnershipError(
          'INVALID_CONTENT_STATE_HASH',
          `${CONTENT_STATE_MANIFEST_FILE}: existing page ${slug} content_hash must use sha256:<64 lowercase hex characters>`,
          { slug, path: CONTENT_STATE_MANIFEST_FILE }
        );
      }
      if (!SHA256_PATTERN.test(page.article_content_hash || '')) {
        throw new ContentOwnershipError(
          'INVALID_CONTENT_STATE_HASH',
          `${CONTENT_STATE_MANIFEST_FILE}: existing page ${slug} article_content_hash must use sha256:<64 lowercase hex characters>`,
          { slug, path: CONTENT_STATE_MANIFEST_FILE }
        );
      }
      if (!SHA256_PATTERN.test(page.article_markup_hash || '')) {
        throw new ContentOwnershipError(
          'INVALID_CONTENT_STATE_HASH',
          `${CONTENT_STATE_MANIFEST_FILE}: existing page ${slug} article_markup_hash must use sha256:<64 lowercase hex characters>`,
          { slug, path: CONTENT_STATE_MANIFEST_FILE }
        );
      }
      if (!/^[0-9a-f]{40}$/.test(page.git_blob_oid || '')) {
        throw new ContentOwnershipError(
          'INVALID_CONTENT_STATE_ENTRY',
          `${CONTENT_STATE_MANIFEST_FILE}: existing page ${slug} git_blob_oid must be a lowercase 40-hex Git object ID`,
          { slug, path: CONTENT_STATE_MANIFEST_FILE }
        );
      }
    }
    if (![null, 'body'].includes(page.wiki_stub_marker_scope ?? null)) {
      throw new ContentOwnershipError(
        'INVALID_CONTENT_STATE_ENTRY',
        `${CONTENT_STATE_MANIFEST_FILE}: ${slug} wiki_stub_marker_scope must be null or body`,
        { slug, path: CONTENT_STATE_MANIFEST_FILE }
      );
    }

    const expectedPath = `wiki/${slug}.html`;
    if (page.path && String(page.path).replaceAll('\\', '/') !== expectedPath) {
      throw new ContentOwnershipError(
        'CONTENT_STATE_PATH_MISMATCH',
        `${CONTENT_STATE_MANIFEST_FILE}: ${slug} path must be ${expectedPath}`,
        { slug, path: CONTENT_STATE_MANIFEST_FILE }
      );
    }
    pagesBySlug.set(slug, page);
  }

  return {
    manifest,
    manifestIdentity: Object.freeze({
      path: CONTENT_STATE_MANIFEST_FILE,
      contentHash: sha256Content(manifestBytes),
      bytesBase64: manifestBytes.toString('base64'),
    }),
    pagesBySlug,
  };
}

function payloadToIndexEntry(payload) {
  const url = `/wiki/${payload.slug}.html`;
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  const articleHtml = payload.article_html || '';
  const words = stripHtml(articleHtml).split(/\s+/).filter(Boolean);
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
      heading_count: (articleHtml.match(/<h[2-6]\b/gi) || []).length,
      internal_link_count: (articleHtml.match(/href=["']\/wiki\//gi) || []).length,
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
  const wikiDir = resolveSafeWorkspacePath(rootDir, 'wiki');
  const wikiStat = lstatIfPresent(wikiDir);
  if (!wikiStat) return [];
  if (!wikiStat.isDirectory() || wikiStat.isSymbolicLink()) {
    throw unsafePublishPath('wiki', 'wiki discovery root must be a real directory');
  }

  const htmlEntries = fs.readdirSync(wikiDir)
    .filter((fileName) => fileName.endsWith('.html'));
  // Re-check the directory after enumeration so an empty replacement symlink
  // cannot silently turn a portable rebuild into an empty wiki scan.
  resolveSafeWorkspacePath(rootDir, 'wiki');
  for (const fileName of htmlEntries) {
    const relativePath = `wiki/${fileName}`;
    const filePath = resolveSafeWorkspacePath(rootDir, relativePath);
    const stat = lstatIfPresent(filePath);
    if (!stat?.isFile() || stat.isSymbolicLink()) {
      throw unsafePublishPath(relativePath, 'wiki HTML discovery targets must be regular files, not symlinks or special files');
    }
  }

  return htmlEntries
    .filter((fileName) => fileName !== 'index.html')
    .flatMap((fileName) => {
      const relativePath = `wiki/${fileName}`;
      const url = `/wiki/${fileName}`;
      const bytes = readWorkspaceFileNoFollow(rootDir, relativePath);
      if (bytes === null) {
        throw unsafePublishPath(relativePath, 'wiki HTML disappeared during discovery');
      }
      const html = bytes.toString('utf8');
      if (hasRootWikiStubMarker(html) || hasNoindexRobotsMeta(html)) return [];
      return [htmlToIndexEntry(url, html)];
    });
}

function loadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : Object.values(parsed || {});
}

function writeJson(filePath, data) {
  atomicWriteFilePathSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
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

let atomicWriteSequence = 0;
let activeTransactionWriteJournal = null;
let activeTransactionRootBinding = null;

function lstatIfPresent(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function lstatBigIntIfPresent(filePath) {
  try {
    return fs.lstatSync(filePath, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function directoryIdentityFromDescriptor(descriptor) {
  const stat = fs.fstatSync(descriptor, { bigint: true });
  if (!stat.isDirectory()) throw new Error('descriptor is not a directory');
  return { dev: stat.dev, ino: stat.ino };
}

function directoryIdentityMatches(stat, identity) {
  return Boolean(
    stat?.isDirectory() &&
    !stat.isSymbolicLink() &&
    stat.dev === identity.dev &&
    stat.ino === identity.ino
  );
}

function assertAnchoredDirectoryIdentity(anchor, expectedIdentity, relativePath) {
  const actualIdentity = directoryIdentityFromDescriptor(anchor.descriptor);
  if (
    actualIdentity.dev !== expectedIdentity.dev ||
    actualIdentity.ino !== expectedIdentity.ino
  ) {
    throw new ContentOwnershipError(
      'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT',
      `${relativePath}: rollback parent directory changed identity`,
      { path: relativePath }
    );
  }
}

function unsafePublishPath(relativePath, message) {
  return new ContentOwnershipError(
    'UNSAFE_PUBLISH_PATH',
    `${String(relativePath).replaceAll('\\', '/')}: ${message}`,
    { path: String(relativePath).replaceAll('\\', '/') }
  );
}

function transactionBindingForPath(candidatePath) {
  if (!activeTransactionRootBinding) return null;
  const absolutePath = path.resolve(candidatePath);
  const relativePath = path.relative(
    activeTransactionRootBinding.rootPath,
    absolutePath
  );
  if (
    relativePath === '' ||
    (
      relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    )
  ) {
    return { binding: activeTransactionRootBinding, relativePath };
  }
  return null;
}

function transactionLockIdentityMatches(binding) {
  const stat = lstatBigIntIfPresent(binding.anchoredLockPath);
  return directoryIdentityMatches(stat, binding.lockIdentity);
}

function assertActiveTransactionBindingIdentity(displayPath = '<transaction>') {
  const binding = activeTransactionRootBinding;
  if (!binding || binding.allowDetachedRoot) return;

  const rootStat = lstatBigIntIfPresent(binding.rootPath);
  if (!directoryIdentityMatches(rootStat, binding.rootIdentity)) {
    throw unsafePublishPath(
      displayPath,
      'selected repository root changed identity while the publish lock was held'
    );
  }
  if (!transactionLockIdentityMatches(binding)) {
    throw new ContentOwnershipError(
      'PUBLISH_TRANSACTION_LOCK_LOST',
      `${PUBLISH_TRANSACTION_LOCK}: lock directory changed identity during the publish transaction`,
      { path: PUBLISH_TRANSACTION_LOCK }
    );
  }
}

function openTransactionAnchoredDirectory(
  parentPath,
  displayPath,
  { missingOk = false, create = false } = {}
) {
  const transactionPath = transactionBindingForPath(parentPath);
  if (!transactionPath) return undefined;
  const { binding, relativePath } = transactionPath;
  assertActiveTransactionBindingIdentity(displayPath);

  let descriptor;
  try {
    descriptor = fs.openSync(
      binding.rootAnchor.anchorPath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
    );
    const openedRootIdentity = directoryIdentityFromDescriptor(descriptor);
    if (
      openedRootIdentity.dev !== binding.rootIdentity.dev ||
      openedRootIdentity.ino !== binding.rootIdentity.ino
    ) {
      throw unsafePublishPath(displayPath, 'held repository root descriptor changed identity');
    }

    const noFollow = fs.constants.O_NOFOLLOW || 0;
    for (const segment of relativePath.split(path.sep).filter(Boolean)) {
      const anchoredChildPath = path.join(`/proc/self/fd/${descriptor}`, segment);
      let childDescriptor;
      try {
        childDescriptor = fs.openSync(
          anchoredChildPath,
          fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
        );
      } catch (error) {
        if (error?.code === 'ENOENT' && create) {
          try {
            fs.mkdirSync(anchoredChildPath);
          } catch (mkdirError) {
            if (mkdirError?.code !== 'EEXIST') throw mkdirError;
          }
          childDescriptor = fs.openSync(
            anchoredChildPath,
            fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
          );
        } else if (error?.code === 'ENOENT' && missingOk) {
          fs.closeSync(descriptor);
          descriptor = undefined;
          return null;
        } else {
          throw error;
        }
      }
      const childStat = fs.fstatSync(childDescriptor);
      if (!childStat.isDirectory()) {
        fs.closeSync(childDescriptor);
        throw unsafePublishPath(displayPath, `publish parent component is not a directory (${segment})`);
      }
      fs.closeSync(descriptor);
      descriptor = childDescriptor;
    }

    assertActiveTransactionBindingIdentity(displayPath);
    return { descriptor, anchorPath: `/proc/self/fd/${descriptor}` };
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (error instanceof ContentOwnershipError) throw error;
    if (missingOk && error?.code === 'ENOENT') return null;
    throw unsafePublishPath(
      displayPath,
      `publish parent could not be opened from the held repository root: ${error.message}`
    );
  }
}

/**
 * Resolve a transaction path without allowing a checked-in symlink (including
 * one of its parent directories) to redirect reads or writes outside rootDir.
 */
function resolveSafeWorkspacePath(rootDir, relativePath) {
  const rootPath = path.resolve(rootDir);
  const relPath = String(relativePath || '').replaceAll('\\', '/');
  if (!relPath || path.isAbsolute(relPath)) {
    throw unsafePublishPath(relPath || '<empty>', 'publish targets must be non-empty workspace-relative paths');
  }

  const targetPath = path.resolve(rootPath, relPath);
  const relativeTarget = path.relative(rootPath, targetPath);
  if (
    !relativeTarget ||
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    throw unsafePublishPath(relPath, 'publish target escapes the selected repository root');
  }


  const transactionPath = transactionBindingForPath(targetPath);
  if (
    transactionPath &&
    transactionPath.binding.rootPath === rootPath
  ) {
    assertActiveTransactionBindingIdentity(relPath);
    // File I/O below is opened relative to the held root descriptor. Returning
    // the lexical path preserves existing call interfaces without allowing a
    // renamed/replaced root pathname to redirect the actual operation.
    return targetPath;
  }

  const rootStat = lstatIfPresent(rootPath);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw unsafePublishPath(relPath, 'selected repository root must be a real directory, not a symlink');
  }
  let realRootPath;
  try {
    realRootPath = fs.realpathSync.native(rootPath);
  } catch (error) {
    throw unsafePublishPath(relPath, `selected repository root could not be resolved safely: ${error.message}`);
  }
  if (path.resolve(realRootPath) !== rootPath) {
    throw unsafePublishPath(relPath, 'selected repository root must not traverse a symlinked path component');
  }

  let cursor = rootPath;
  const segments = relativeTarget.split(path.sep).filter(Boolean);
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    const stat = lstatIfPresent(cursor);
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      throw unsafePublishPath(relPath, `symlink publish target or parent is forbidden (${path.relative(rootPath, cursor).replaceAll('\\', '/')})`);
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw unsafePublishPath(relPath, `publish target parent is not a directory (${path.relative(rootPath, cursor).replaceAll('\\', '/')})`);
    }
  }

  return targetPath;
}

function ensureSafeWorkspaceParent(rootDir, relativePath) {
  const rootPath = path.resolve(rootDir);
  const targetPath = resolveSafeWorkspacePath(rootDir, relativePath);
  const transactionPath = transactionBindingForPath(targetPath);
  if (
    transactionPath &&
    transactionPath.binding.rootPath === rootPath
  ) {
    const anchor = openTransactionAnchoredDirectory(
      path.dirname(targetPath),
      relativePath,
      { create: true }
    );
    closeAnchoredDirectory(anchor);
    return targetPath;
  }
  const parentRelative = path.relative(rootPath, path.dirname(targetPath));
  let cursor = rootPath;
  for (const segment of parentRelative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = lstatIfPresent(cursor);
    if (!stat) {
      try {
        fs.mkdirSync(cursor);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    const currentStat = fs.lstatSync(cursor);
    if (currentStat.isSymbolicLink() || !currentStat.isDirectory()) {
      throw unsafePublishPath(relativePath, `publish target parent is not a real directory (${path.relative(rootPath, cursor).replaceAll('\\', '/')})`);
    }
  }
  return resolveSafeWorkspacePath(rootDir, relativePath);
}

function openAnchoredDirectory(parentPath, displayPath = parentPath) {
  const expectedParent = path.resolve(parentPath);
  if (
    process.platform !== 'linux' ||
    !fs.constants.O_DIRECTORY ||
    !fs.existsSync('/proc/self/fd')
  ) {
    throw unsafePublishPath(
      displayPath,
      'safe publish writes require Linux /proc/self/fd directory anchoring'
    );
  }

  const transactionAnchor = openTransactionAnchoredDirectory(
    expectedParent,
    displayPath
  );
  if (transactionAnchor !== undefined) return transactionAnchor;

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let descriptor;
  try {
    descriptor = fs.openSync(
      expectedParent,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
    );
    const openedStat = fs.fstatSync(descriptor);
    if (!openedStat.isDirectory()) {
      throw unsafePublishPath(displayPath, 'publish parent must remain a real directory');
    }
    const anchorPath = `/proc/self/fd/${descriptor}`;
    const anchoredRealPath = fs.realpathSync.native(anchorPath);
    if (path.resolve(anchoredRealPath) !== expectedParent) {
      throw unsafePublishPath(
        displayPath,
        'publish parent changed identity or traversed a symlink before anchoring'
      );
    }
    return { descriptor, anchorPath };
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (error instanceof ContentOwnershipError) throw error;
    throw unsafePublishPath(
      displayPath,
      `publish parent could not be opened without following symlinks: ${error.message}`
    );
  }
}

function closeAnchoredDirectory(anchor) {
  if (anchor?.descriptor !== undefined) fs.closeSync(anchor.descriptor);
}

function readWorkspaceFileStateNoFollow(rootDir, relativePath) {
  const filePath = resolveSafeWorkspacePath(rootDir, relativePath);
  const transactionPath = transactionBindingForPath(filePath);
  let anchor;
  if (transactionPath) {
    anchor = openTransactionAnchoredDirectory(
      path.dirname(filePath),
      relativePath,
      { missingOk: true }
    );
    if (!anchor) return null;
  } else {
    const parentStat = lstatIfPresent(path.dirname(filePath));
    if (!parentStat) return null;
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      throw unsafePublishPath(relativePath, 'publish target parent must be a real directory');
    }
    anchor = openAnchoredDirectory(path.dirname(filePath), relativePath);
  }
  const anchoredFilePath = path.join(anchor.anchorPath, path.basename(filePath));
  let fileDescriptor;
  try {
    const stat = lstatIfPresent(anchoredFilePath);
    if (!stat) return null;
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw unsafePublishPath(relativePath, 'publish target must be a regular file');
    }
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    fileDescriptor = fs.openSync(anchoredFilePath, fs.constants.O_RDONLY | noFollow);
    const openedStat = fs.fstatSync(fileDescriptor);
    if (!openedStat.isFile()) throw unsafePublishPath(relativePath, 'publish target must remain a regular file');
    return {
      exists: true,
      content: fs.readFileSync(fileDescriptor),
      mode: openedStat.mode & 0o777,
    };
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    closeAnchoredDirectory(anchor);
  }
}

function readWorkspaceFileNoFollow(rootDir, relativePath) {
  return readWorkspaceFileStateNoFollow(rootDir, relativePath)?.content ?? null;
}

function durableQuarantineFileName(phase, sourcePath, sequence) {
  const normalizedSourcePath = String(sourcePath).replaceAll('\\', '/');
  const sourceToken = normalizedSourcePath
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160) || 'unknown';
  const sourceDigest = createHash('sha256')
    .update(normalizedSourcePath)
    .digest('hex')
    .slice(0, 12);
  return `${String(sequence).padStart(4, '0')}-${phase}-${sourceToken}-${sourceDigest}.detached`;
}

function durableRecoveryEvidence(state) {
  if (!state?.exists || !Buffer.isBuffer(state.content) || !state.fileIdentity) return {};
  return {
    contentHash: sha256Content(state.content),
    byteLength: state.content.length,
    mode: state.mode,
    fileIdentity: {
      dev: String(state.fileIdentity.dev),
      ino: String(state.fileIdentity.ino),
    },
  };
}

function registerDurableQuarantineRecord(record) {
  const journal = activeTransactionWriteJournal;
  if (!journal || !record) return;
  if (!journal.durableQuarantines.some(
    (candidate) => candidate.quarantinePath === record.quarantinePath
  )) {
    journal.durableQuarantines.push(record);
  }
  journal.reportDurableQuarantine?.(record);
}

function rootRelativeRecoveryPath(filePath) {
  const binding = activeTransactionRootBinding;
  if (!binding) return null;
  try {
    const physicalRoot = fs.realpathSync.native(binding.rootAnchor.anchorPath);
    const physicalPath = fs.realpathSync.native(filePath);
    const relativePath = path.relative(physicalRoot, physicalPath);
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) return null;
    return relativePath.replaceAll('\\', '/');
  } catch {
    return null;
  }
}

function resolveHeldQuarantineDirectory(quarantine) {
  if (!quarantine) return null;
  const heldIdentity = directoryIdentityFromDescriptor(quarantine.descriptor);
  if (
    heldIdentity.dev !== quarantine.identity.dev ||
    heldIdentity.ino !== quarantine.identity.ino
  ) return null;
  const relativePath = rootRelativeRecoveryPath(quarantine.anchoredPath);
  if (!relativePath) return null;
  const namedState = lstatBigIntIfPresent(path.join(
    activeTransactionRootBinding.rootAnchor.anchorPath,
    ...relativePath.split('/')
  ));
  return directoryIdentityMatches(namedState, quarantine.identity)
    ? relativePath
    : null;
}

function rewriteAcceptedQuarantineLocations(journal, quarantine, directoryPath) {
  for (const entry of quarantine.acceptedRecords) {
    const quarantinePath = `${directoryPath}/${entry.retainedName}`;
    if (entry.record.quarantinePath === quarantinePath) continue;
    const replacement = Object.freeze({ ...entry.record, quarantinePath });
    const index = journal.durableQuarantines.indexOf(entry.record);
    if (index !== -1) journal.durableQuarantines[index] = replacement;
    entry.record = replacement;
    journal.reportDurableQuarantine?.(replacement);
  }
}

function assertTransactionDurableQuarantineIdentity(context) {
  const journal = activeTransactionWriteJournal;
  const quarantine = journal?.durableQuarantine;
  if (!journal || !quarantine || quarantine.acceptedRecords.length === 0) return;
  const currentIdentity = directoryIdentityFromDescriptor(quarantine.descriptor);
  const namedState = lstatBigIntIfPresent(path.join(
    activeTransactionRootBinding.rootAnchor.anchorPath,
    quarantine.name
  ));
  if (
    currentIdentity.dev === quarantine.identity.dev &&
    currentIdentity.ino === quarantine.identity.ino &&
    directoryIdentityMatches(namedState, quarantine.identity)
  ) return;

  const actualDirectory = resolveHeldQuarantineDirectory(quarantine);
  if (actualDirectory) {
    rewriteAcceptedQuarantineLocations(journal, quarantine, actualDirectory);
  }
  const recoveryLocation = actualDirectory ||
    `unresolved held directory descriptor ${quarantine.descriptor}`;
  const error = unsafePublishPath(
    quarantine.name,
    `durable quarantine directory changed identity during ${context}; recovery location: ${recoveryLocation}`
  );
  error.durableQuarantineLocation = recoveryLocation;
  throw error;
}

function inspectExistingDurableQuarantines(rootDir) {
  const binding = activeTransactionRootBinding;
  if (!binding || path.resolve(rootDir) !== binding.rootPath) return [];
  assertActiveTransactionBindingIdentity(DURABLE_TRANSACTION_QUARANTINE_PREFIX);

  const existing = [];
  for (const entry of fs.readdirSync(binding.rootAnchor.anchorPath, { withFileTypes: true })) {
    if (!DURABLE_TRANSACTION_QUARANTINE_PATTERN.test(entry.name)) continue;
    const anchoredPath = path.join(binding.rootAnchor.anchorPath, entry.name);
    const namedState = lstatBigIntIfPresent(anchoredPath);
    if (
      !entry.isDirectory() ||
      !namedState?.isDirectory() ||
      namedState.isSymbolicLink()
    ) {
      throw unsafePublishPath(
        entry.name,
        'durable quarantine root entry must be a real directory'
      );
    }

    let descriptor;
    try {
      const noFollow = fs.constants.O_NOFOLLOW || 0;
      descriptor = fs.openSync(
        anchoredPath,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
      );
      const openedIdentity = directoryIdentityFromDescriptor(descriptor);
      if (
        openedIdentity.dev !== namedState.dev ||
        openedIdentity.ino !== namedState.ino
      ) {
        throw unsafePublishPath(
          entry.name,
          'durable quarantine root entry changed identity while inspected'
        );
      }
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    existing.push(entry.name);
  }
  return existing.sort();
}

function ensureTransactionDurableQuarantine() {
  const journal = activeTransactionWriteJournal;
  const binding = activeTransactionRootBinding;
  if (!journal || !binding || journal.rootPath !== binding.rootPath) return null;
  if (journal.durableQuarantine) return journal.durableQuarantine;

  assertActiveTransactionBindingIdentity(DURABLE_TRANSACTION_QUARANTINE_PREFIX);
  const quarantinePath = fs.mkdtempSync(path.join(
    binding.rootAnchor.anchorPath,
    DURABLE_TRANSACTION_QUARANTINE_PREFIX
  ));
  const quarantineName = path.basename(quarantinePath);
  if (!DURABLE_TRANSACTION_QUARANTINE_PATTERN.test(quarantineName)) {
    throw unsafePublishPath(
      quarantineName,
      'durable quarantine directory did not receive the expected private name'
    );
  }

  let descriptor;
  try {
    const createdNamedState = lstatBigIntIfPresent(quarantinePath);
    if (
      !createdNamedState?.isDirectory() ||
      createdNamedState.isSymbolicLink()
    ) {
      throw unsafePublishPath(
        quarantineName,
        'new durable quarantine path must remain a real directory before it is opened'
      );
    }
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    descriptor = fs.openSync(
      quarantinePath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
    );
    const identity = directoryIdentityFromDescriptor(descriptor);
    const finalNamedState = lstatBigIntIfPresent(quarantinePath);
    if (
      !directoryIdentityMatches(createdNamedState, identity) ||
      !directoryIdentityMatches(finalNamedState, identity)
    ) {
      throw unsafePublishPath(
        quarantineName,
        'new durable quarantine directory changed identity while it was opened'
      );
    }
    journal.durableQuarantine = {
      descriptor,
      identity,
      name: quarantineName,
      anchoredPath: `/proc/self/fd/${descriptor}`,
      acceptedRecords: [],
    };
    return journal.durableQuarantine;
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    throw error;
  }
}

function retainDetachedInodeForRecovery(detachedPath, sourcePath, phase, initialState) {
  if (!DURABLE_QUARANTINE_PHASES.has(phase)) {
    throw new Error(`unsupported durable quarantine phase: ${phase}`);
  }
  const normalizedSourcePath = String(sourcePath).replaceAll('\\', '/');
  const journal = activeTransactionWriteJournal;
  if (!journal) {
    // Standalone helpers have no held repository-root descriptor. Retaining
    // the existing private staging path is safer than unlinking an inode that
    // another process may still be writing through an old descriptor.
    return {
      phase,
      sourcePath: normalizedSourcePath,
      quarantinePath: path.join(path.dirname(detachedPath), 'detached'),
      ...durableRecoveryEvidence(initialState),
    };
  }

  let quarantine;
  let retainedName = '';
  let retainedPath = '';
  let centralLinked = false;
  let localUnlinked = false;
  let acceptedRecord = null;
  try {
    quarantine = ensureTransactionDurableQuarantine();
    assertTransactionDurableQuarantineIdentity('pre-link validation');
    journal.durableQuarantineSequence += 1;
    retainedName = durableQuarantineFileName(
      phase,
      normalizedSourcePath,
      journal.durableQuarantineSequence
    );
    retainedPath = path.join(quarantine.anchoredPath, retainedName);
    fs.linkSync(detachedPath, retainedPath);
    centralLinked = true;

    // A held descriptor does not prove that the path reported to an operator
    // still names it. Validate after the link and before removing the private
    // staging name so a rename/replacement race leaves a usable recovery path.
    const currentIdentity = directoryIdentityFromDescriptor(quarantine.descriptor);
    const namedState = lstatBigIntIfPresent(path.join(
      activeTransactionRootBinding.rootAnchor.anchorPath,
      quarantine.name
    ));
    if (
      currentIdentity.dev !== quarantine.identity.dev ||
      currentIdentity.ino !== quarantine.identity.ino ||
      !directoryIdentityMatches(namedState, quarantine.identity)
    ) {
      const actualDirectory = resolveHeldQuarantineDirectory(quarantine);
      if (actualDirectory) {
        rewriteAcceptedQuarantineLocations(journal, quarantine, actualDirectory);
      }
      throw unsafePublishPath(
        quarantine.name,
        'durable quarantine directory changed identity after the recovery link was created'
      );
    }

    fs.unlinkSync(detachedPath);
    localUnlinked = true;
    const retainedState = captureDetachedFileState(retainedPath, normalizedSourcePath);

    // Validate once more after the private name is gone. On failure the catch
    // path recreates it from the held central descriptor before reporting it.
    const finalNamedState = lstatBigIntIfPresent(path.join(
      activeTransactionRootBinding.rootAnchor.anchorPath,
      quarantine.name
    ));
    if (!directoryIdentityMatches(finalNamedState, quarantine.identity)) {
      const actualDirectory = resolveHeldQuarantineDirectory(quarantine);
      if (actualDirectory) {
        rewriteAcceptedQuarantineLocations(journal, quarantine, actualDirectory);
      }
      throw unsafePublishPath(
        quarantine.name,
        'durable quarantine directory changed identity after private recovery cleanup'
      );
    }

    acceptedRecord = Object.freeze({
      phase,
      sourcePath: normalizedSourcePath,
      quarantinePath: `${quarantine.name}/${retainedName}`,
      storage: 'root-quarantine',
      ...durableRecoveryEvidence(retainedState),
    });
    quarantine.acceptedRecords.push({ retainedName, record: acceptedRecord });
    registerDurableQuarantineRecord(acceptedRecord);
    if (
      !detachedFileIdentitiesEqual(retainedState, initialState) ||
      !workspaceFileStatesEqual(retainedState, initialState)
    ) {
      throw new ContentOwnershipError(
        'STALE_CONTENT_STATE',
        `${normalizedSourcePath}: detached inode changed while entering durable ${phase} quarantine`,
        { path: normalizedSourcePath }
      );
    }
    return acceptedRecord;
  } catch (error) {
    if (!acceptedRecord) {
      if (localUnlinked && centralLinked && retainedPath) {
        try {
          fs.linkSync(retainedPath, detachedPath);
          localUnlinked = false;
        } catch {
          // Preserve the original failure. The held central directory is
          // inspected below if the private name cannot be recreated.
        }
      }

      if (!localUnlinked) {
        try {
          const privateState = captureDetachedFileState(detachedPath, normalizedSourcePath);
          const privatePath = rootRelativeRecoveryPath(detachedPath);
          if (privatePath) {
            error.privateDetachedRecoveryRecord = Object.freeze({
              phase,
              sourcePath: normalizedSourcePath,
              quarantinePath: privatePath,
              storage: 'private-staging',
              ...durableRecoveryEvidence(privateState),
            });
          }
        } catch {
          // A verified central path may still be reportable below.
        }
      }

      const centralAlreadyReported = journal.durableQuarantines.some((record) =>
        record.quarantinePath.endsWith(`/${retainedName}`)
      );
      if (centralLinked && !centralAlreadyReported) {
        try {
          const actualDirectory = resolveHeldQuarantineDirectory(quarantine);
          const centralState = captureDetachedFileState(retainedPath, normalizedSourcePath);
          if (actualDirectory) {
            registerDurableQuarantineRecord(Object.freeze({
              phase,
              sourcePath: normalizedSourcePath,
              quarantinePath: `${actualDirectory}/${retainedName}`,
              storage: 'relocated-root-quarantine',
              ...durableRecoveryEvidence(centralState),
            }));
          } else {
            error.durableQuarantineLocation =
              `unresolved held directory descriptor ${quarantine?.descriptor}`;
          }
        } catch {
          error.durableQuarantineLocation =
            `unresolved held directory descriptor ${quarantine?.descriptor}`;
        }
      }
    }
    throw error;
  }
}

function closeTransactionDurableQuarantine(journal) {
  const descriptor = journal?.durableQuarantine?.descriptor;
  if (descriptor !== undefined) fs.closeSync(descriptor);
}

function atomicWriteFilePathSync(
  filePath,
  content,
  encoding = undefined,
  mode = undefined
) {
  const parentPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const anchor = openAnchoredDirectory(parentPath, filePath);
  const anchoredFilePath = path.join(anchor.anchorPath, fileName);
  const journalRelativePath = (() => {
    if (!activeTransactionWriteJournal) return null;
    const relativePath = path.relative(
      activeTransactionWriteJournal.rootPath,
      path.resolve(filePath)
    );
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) return null;
    return relativePath.replaceAll('\\', '/');
  })();
  let stagingDir = '';
  let stagedPath = '';
  let detachedPath = '';
  let stagedDescriptor;
  let stagedExists = false;
  let detachedExists = false;
  let installCommitted = false;
  let journalCheckpoint = null;

  const staleAtomicWrite = (message) => new ContentOwnershipError(
    'STALE_CONTENT_STATE',
    `${journalRelativePath || filePath}: ${message}`,
    { path: journalRelativePath || filePath }
  );

  try {
    const capturedState = lstatIfPresent(anchoredFilePath)
      ? captureDetachedFileState(anchoredFilePath, journalRelativePath || filePath)
      : { exists: false, content: null, mode: null };
    const expectedState = journalRelativePath &&
      activeTransactionWriteJournal.expectedStates.has(journalRelativePath)
      ? activeTransactionWriteJournal.expectedStates.get(journalRelativePath)
      : capturedState;
    const targetMode = mode ?? (expectedState.exists ? expectedState.mode ?? 0o644 : 0o644);
    const contentBytes = Buffer.isBuffer(content)
      ? Buffer.from(content)
      : Buffer.from(String(content), encoding || 'utf8');
    const intendedState = {
      exists: true,
      content: contentBytes,
      mode: targetMode,
    };

    if (journalRelativePath) {
      journalCheckpoint = {
        hadMutation: activeTransactionWriteJournal.mutatedFiles.has(journalRelativePath),
        hadPostimage: activeTransactionWriteJournal.postimages.has(journalRelativePath),
        postimage: activeTransactionWriteJournal.postimages.get(journalRelativePath),
        hadExpectedState: activeTransactionWriteJournal.expectedStates.has(journalRelativePath),
        expectedState: activeTransactionWriteJournal.expectedStates.get(journalRelativePath),
      };
      // Journal exact intended bytes before the namespace-changing commit. A
      // successful install followed by a cleanup exception can then be rolled
      // back, while a later concurrent edit will not be mistaken for ours. If
      // this attempt never installs, the catch path restores the prior journal
      // entry so attempted bytes never become rollback ownership evidence.
      activeTransactionWriteJournal.mutatedFiles.add(journalRelativePath);
      activeTransactionWriteJournal.postimages.set(journalRelativePath, intendedState);
    }

    atomicWriteSequence += 1;
    stagingDir = fs.mkdtempSync(path.join(
      anchor.anchorPath,
      `.${fileName}.publish-${process.pid}-${atomicWriteSequence}-`
    ));
    stagedPath = path.join(stagingDir, 'staged');
    detachedPath = path.join(stagingDir, 'detached');
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    stagedDescriptor = fs.openSync(
      stagedPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
      targetMode
    );
    stagedExists = true;
    fs.fchmodSync(stagedDescriptor, targetMode);
    fs.writeFileSync(stagedDescriptor, contentBytes);
    fs.fsyncSync(stagedDescriptor);
    fs.closeSync(stagedDescriptor);
    stagedDescriptor = undefined;

    if (!expectedState.exists) {
      if (!installPreimageWithoutReplace(stagedPath, anchoredFilePath)) {
        throw staleAtomicWrite('artifact appeared before the conditional create commit');
      }
      installCommitted = true;
      if (journalRelativePath) {
        activeTransactionWriteJournal.expectedStates.set(journalRelativePath, intendedState);
      }
      fs.unlinkSync(stagedPath);
      stagedExists = false;
      return;
    }

    try {
      fs.renameSync(anchoredFilePath, detachedPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw staleAtomicWrite('artifact disappeared before the conditional replace commit');
      }
      throw error;
    }
    detachedExists = true;
    const detachedState = captureDetachedFileState(
      detachedPath,
      journalRelativePath || filePath
    );
    if (!workspaceFileStatesEqual(detachedState, expectedState)) {
      if (linkDetachedBackWithoutReplace(detachedPath, anchoredFilePath)) {
        detachedExists = false;
        throw staleAtomicWrite('artifact changed immediately before the conditional replace commit');
      }
      throw staleAtomicWrite(
        'concurrent artifact bytes were quarantined because a newer live path appeared during commit'
      );
    }

    if (!installPreimageWithoutReplace(stagedPath, anchoredFilePath)) {
      retainDetachedInodeForRecovery(
        detachedPath,
        journalRelativePath || filePath,
        'artifact-forward',
        detachedState
      );
      detachedExists = false;
      throw staleAtomicWrite('a concurrent artifact appeared before the conditional replace install');
    }
    installCommitted = true;
    if (journalRelativePath) {
      activeTransactionWriteJournal.expectedStates.set(journalRelativePath, intendedState);
    }
    fs.unlinkSync(stagedPath);
    stagedExists = false;
    retainDetachedInodeForRecovery(
      detachedPath,
      journalRelativePath || filePath,
      'artifact-forward',
      detachedState
    );
    detachedExists = false;
  } catch (error) {
    if (detachedExists && !lstatIfPresent(anchoredFilePath)) {
      try {
        if (linkDetachedBackWithoutReplace(detachedPath, anchoredFilePath)) {
          detachedExists = false;
        }
      } catch {
        // Keep the detached inode in its private directory for recovery rather
        // than overwriting a concurrently recreated artifact.
      }
    }
    if (detachedExists && error?.privateDetachedRecoveryRecord) {
      registerDurableQuarantineRecord(error.privateDetachedRecoveryRecord);
    }
    if (journalRelativePath && !installCommitted && journalCheckpoint) {
      if (journalCheckpoint.hadMutation) {
        activeTransactionWriteJournal.mutatedFiles.add(journalRelativePath);
      } else {
        activeTransactionWriteJournal.mutatedFiles.delete(journalRelativePath);
      }
      if (journalCheckpoint.hadPostimage) {
        activeTransactionWriteJournal.postimages.set(
          journalRelativePath,
          journalCheckpoint.postimage
        );
      } else {
        activeTransactionWriteJournal.postimages.delete(journalRelativePath);
      }
      if (journalCheckpoint.hadExpectedState) {
        activeTransactionWriteJournal.expectedStates.set(
          journalRelativePath,
          journalCheckpoint.expectedState
        );
      } else {
        activeTransactionWriteJournal.expectedStates.delete(journalRelativePath);
      }
    }
    throw error;
  } finally {
    if (stagedDescriptor !== undefined) fs.closeSync(stagedDescriptor);
    if (stagedExists) {
      try {
        fs.unlinkSync(stagedPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    if (stagingDir) {
      try {
        fs.rmdirSync(stagingDir);
      } catch (error) {
        if (error?.code !== 'ENOTEMPTY' && error?.code !== 'ENOENT') throw error;
      }
    }
    closeAnchoredDirectory(anchor);
  }
}

function writeWorkspaceFileConditionally(rootDir, relativePath, content, expectedState) {
  const targetPath = ensureSafeWorkspaceParent(rootDir, relativePath);
  const anchor = openAnchoredDirectory(path.dirname(targetPath), relativePath);
  const anchoredTargetPath = path.join(anchor.anchorPath, path.basename(targetPath));
  let writerParentIdentity;
  let journal;
  let normalizedRelativePath;
  let targetMode;
  let intendedState;
  try {
    writerParentIdentity = directoryIdentityFromDescriptor(anchor.descriptor);
    journal = activeTransactionWriteJournal &&
      path.resolve(rootDir) === activeTransactionWriteJournal.rootPath
      ? activeTransactionWriteJournal
      : null;
    normalizedRelativePath = relativePath.replaceAll('\\', '/');
    targetMode = expectedState.exists ? expectedState.mode ?? 0o644 : 0o644;
    intendedState = {
      exists: true,
      content: Buffer.from(content, 'utf8'),
      mode: targetMode,
      rollbackParentIdentity: writerParentIdentity,
    };
  } catch (error) {
    closeAnchoredDirectory(anchor);
    throw error;
  }
  let stagingDir = '';
  let stagedPath = '';
  let detachedPath = '';
  let stagedExists = false;
  let detachedExists = false;
  let stagedDescriptor;
  let installCommitted = false;
  let namespaceDetachedByWriter = false;
  let detachedPreimageState = null;
  let concurrentTargetObserved = false;
  let detachedRecoveryLinkInstalled = false;
  let journalCheckpoint = null;

  const staleForwardWrite = (message) => new ContentOwnershipError(
    'STALE_CONTENT_STATE',
    `${relativePath}: ${message}`,
    { path: relativePath }
  );

  const recoveredTargetMatchesDetachedPreimage = () => {
    if (!detachedPreimageState) return false;
    try {
      const recoveredTargetState = captureDetachedFileState(
        anchoredTargetPath,
        relativePath
      );
      return detachedFileIdentitiesEqual(
        recoveredTargetState,
        detachedPreimageState
      ) && workspaceFileStatesEqual(recoveredTargetState, detachedPreimageState);
    } catch {
      return false;
    }
  };

  try {
    if (journal) {
      journalCheckpoint = {
        hadMutation: journal.mutatedFiles.has(normalizedRelativePath),
        hadPostimage: journal.postimages.has(normalizedRelativePath),
        postimage: journal.postimages.get(normalizedRelativePath),
        hadExpectedState: journal.expectedStates.has(normalizedRelativePath),
        expectedState: journal.expectedStates.get(normalizedRelativePath),
      };
      journal.mutatedFiles.add(normalizedRelativePath);
      journal.postimages.set(normalizedRelativePath, intendedState);
    }

    stagingDir = fs.mkdtempSync(
      path.join(anchor.anchorPath, `.${path.basename(targetPath)}.forward-`)
    );
    stagedPath = path.join(stagingDir, 'staged');
    detachedPath = path.join(stagingDir, 'detached');
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    stagedDescriptor = fs.openSync(
      stagedPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
      targetMode
    );
    stagedExists = true;
    fs.fchmodSync(stagedDescriptor, targetMode);
    fs.writeFileSync(stagedDescriptor, content, 'utf8');
    fs.fsyncSync(stagedDescriptor);
    fs.closeSync(stagedDescriptor);
    stagedDescriptor = undefined;

    if (!expectedState.exists) {
      if (!installPreimageWithoutReplace(stagedPath, anchoredTargetPath)) {
        throw staleForwardWrite('page appeared before the conditional create commit');
      }
      installCommitted = true;
      if (journal) journal.expectedStates.set(normalizedRelativePath, intendedState);
      fs.unlinkSync(stagedPath);
      stagedExists = false;
      return;
    }

    try {
      fs.renameSync(anchoredTargetPath, detachedPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw staleForwardWrite('page disappeared before the conditional replace commit');
      }
      throw error;
    }
    detachedExists = true;
    namespaceDetachedByWriter = true;
    detachedPreimageState = captureDetachedFileState(detachedPath, relativePath);
    if (!workspaceFileStatesEqual(detachedPreimageState, expectedState)) {
      const detachedPageRestored = linkDetachedBackWithoutReplace(
        detachedPath,
        anchoredTargetPath,
        () => { detachedRecoveryLinkInstalled = true; }
      );
      if (detachedPageRestored) {
        detachedExists = false;
        if (recoveredTargetMatchesDetachedPreimage()) {
          namespaceDetachedByWriter = false;
        }
        throw staleForwardWrite('page changed immediately before the conditional replace commit');
      }
      concurrentTargetObserved = true;
      throw staleForwardWrite(
        'concurrent page bytes were quarantined because a newer live path appeared during commit'
      );
    }
    if (!installPreimageWithoutReplace(stagedPath, anchoredTargetPath)) {
      // A concurrent writer won the empty path after detachment. It stays
      // live; the verified old base remains recoverable in durable quarantine
      // and the uncommitted staged bytes are discarded.
      concurrentTargetObserved = true;
      retainDetachedInodeForRecovery(
        detachedPath,
        normalizedRelativePath,
        'page-forward',
        detachedPreimageState
      );
      detachedExists = false;
      throw staleForwardWrite('a concurrent page appeared before the conditional replace install');
    }
    installCommitted = true;
    if (journal) journal.expectedStates.set(normalizedRelativePath, intendedState);
    fs.unlinkSync(stagedPath);
    stagedExists = false;
    retainDetachedInodeForRecovery(
      detachedPath,
      normalizedRelativePath,
      'page-forward',
      detachedPreimageState
    );
    detachedExists = false;
  } catch (caughtError) {
    let failure = caughtError;
    let targetAbsent = false;
    if (!installCommitted && detachedExists) {
      try {
        targetAbsent = !lstatIfPresent(anchoredTargetPath);
        if (!targetAbsent) concurrentTargetObserved = true;
      } catch (probeError) {
        failure = probeError;
      }
    }
    if (
      !installCommitted &&
      detachedExists &&
      targetAbsent &&
      !concurrentTargetObserved &&
      !detachedRecoveryLinkInstalled
    ) {
      try {
        const detachedPageRestored = linkDetachedBackWithoutReplace(
          detachedPath,
          anchoredTargetPath,
          () => { detachedRecoveryLinkInstalled = true; }
        );
        if (detachedPageRestored) {
          detachedExists = false;
          if (recoveredTargetMatchesDetachedPreimage()) {
            namespaceDetachedByWriter = false;
          }
        } else {
          concurrentTargetObserved = true;
        }
      } catch {
        // Leave the detached inode in the private staging directory for
        // recovery rather than overwriting a concurrently recreated target.
      }
    }
    if (detachedExists && caughtError?.privateDetachedRecoveryRecord) {
      registerDurableQuarantineRecord(caughtError.privateDetachedRecoveryRecord);
    }
    if (journal && !installCommitted && journalCheckpoint) {
      if (journalCheckpoint.hadExpectedState) {
        journal.expectedStates.set(normalizedRelativePath, journalCheckpoint.expectedState);
      } else {
        journal.expectedStates.delete(normalizedRelativePath);
      }
      if (!namespaceDetachedByWriter) {
        if (detachedRecoveryLinkInstalled) {
          // Even a verified recovery remains a conservative candidate until
          // the outer transaction observes the final live state. Without an
          // earlier mutation there is deliberately no postimage authority:
          // unchanged snapshot bytes are a no-op, while any later
          // deletion/replacement is preserved and reported. Repeated writes
          // restore their prior exact journal entry instead.
          journal.mutatedFiles.add(normalizedRelativePath);
          if (journalCheckpoint.hadMutation && journalCheckpoint.hadPostimage) {
            journal.postimages.set(normalizedRelativePath, journalCheckpoint.postimage);
          } else {
            journal.postimages.delete(normalizedRelativePath);
          }
        } else {
          if (journalCheckpoint.hadMutation) {
            journal.mutatedFiles.add(normalizedRelativePath);
          } else {
            journal.mutatedFiles.delete(normalizedRelativePath);
          }
          if (journalCheckpoint.hadPostimage) {
            journal.postimages.set(normalizedRelativePath, journalCheckpoint.postimage);
          } else {
            journal.postimages.delete(normalizedRelativePath);
          }
        }
      } else {
        // An unrecovered or unverified detachment can never authorize a
        // snapshot restore. Keep it as a conservative candidate with no
        // postimage so rollback preserves and reports the live absence or
        // replacement while the detached inode remains available in its
        // private quarantine when cleanup did not complete.
        journal.mutatedFiles.add(normalizedRelativePath);
        journal.postimages.delete(normalizedRelativePath);
      }
    }
    throw failure;
  } finally {
    if (stagedDescriptor !== undefined) fs.closeSync(stagedDescriptor);
    if (stagedExists) {
      try {
        fs.unlinkSync(stagedPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    if (stagingDir) {
      try {
        fs.rmdirSync(stagingDir);
      } catch (error) {
        if (error?.code !== 'ENOTEMPTY' && error?.code !== 'ENOENT') throw error;
      }
    }
    closeAnchoredDirectory(anchor);
  }
}

function copyWorkspaceTreeForIsolatedCallback(sourceRoot, destinationRoot) {
  const visit = (sourceDirectory, destinationDirectory, relativeDirectory = '') => {
    fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (
        relativePath === PUBLISH_TRANSACTION_LOCK ||
        entry.name.startsWith('.wiki-content-state-refresh-') ||
        entry.name.startsWith('.wiki-feed-refresh-') ||
        (
          relativeDirectory === '' &&
          DURABLE_TRANSACTION_QUARANTINE_PATTERN.test(entry.name)
        )
      ) continue;

      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      const stat = fs.lstatSync(sourcePath);
      if (stat.isSymbolicLink()) {
        throw unsafePublishPath(relativePath, 'isolated callback inputs must not contain symlinks');
      }
      if (stat.isDirectory()) {
        visit(sourcePath, destinationPath, relativePath);
        continue;
      }
      if (!stat.isFile()) {
        throw unsafePublishPath(relativePath, 'isolated callback inputs must be regular files or directories');
      }
      fs.copyFileSync(sourcePath, destinationPath);
      fs.chmodSync(destinationPath, stat.mode & 0o777);
    }
  };
  visit(path.resolve(sourceRoot), destinationRoot);
}

function runIsolatedMutationCallback(
  rootDir,
  relativeOutputs,
  callback,
  logger,
  callbackLabel
) {
  if (path.resolve(rootDir) === ROOT) {
    throw new ContentOwnershipError(
      'UNSAFE_PUBLISH_CALLBACK',
      `${callbackLabel}: custom mutation callbacks are test-only and cannot run against the canonical repository root`,
      { path: callbackLabel }
    );
  }

  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-publish-callback-'));
  try {
    copyWorkspaceTreeForIsolatedCallback(rootDir, isolatedRoot);
    fs.mkdirSync(path.join(isolatedRoot, PUBLISH_TRANSACTION_LOCK));
    const before = snapshotFiles(isolatedRoot, relativeOutputs);
    const result = callback(isolatedRoot, logger);
    for (const relativePath of relativeOutputs) {
      const normalizedPath = relativePath.replaceAll('\\', '/');
      const stagedState = captureWorkspaceFileState(isolatedRoot, normalizedPath);
      const priorState = before.get(normalizedPath);
      if (workspaceFileStatesEqual(stagedState, priorState)) continue;
      if (!stagedState.exists) {
        throw new ContentOwnershipError(
          'UNSAFE_PUBLISH_CALLBACK',
          `${callbackLabel}: isolated callback deletion is not an authorized output (${normalizedPath})`,
          { path: normalizedPath }
        );
      }
      atomicWriteFilePathSync(
        resolveSafeWorkspacePath(rootDir, normalizedPath),
        stagedState.content,
        undefined,
        stagedState.mode
      );
    }
    return result;
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

function snapshotFiles(rootDir, relativePaths) {
  const snapshot = new Map();
  for (const relativePath of relativePaths) {
    const normalizedPath = relativePath.replaceAll('\\', '/');
    snapshot.set(normalizedPath, captureWorkspaceFileState(rootDir, normalizedPath));
  }
  return snapshot;
}

function workspaceFileStatesEqual(left, right) {
  if (!left || !right || left.exists !== right.exists) return false;
  if (!left.exists) return true;
  return left.mode === right.mode &&
    Buffer.from(left.content).equals(Buffer.from(right.content));
}

function captureWorkspaceFileState(rootDir, relativePath) {
  return readWorkspaceFileStateNoFollow(rootDir, relativePath) || {
    exists: false,
    content: null,
    mode: null,
  };
}

function stableDetachedDescriptorMetadata(stat) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    gid: stat.gid,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
}

function detachedDescriptorMetadataEqual(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

function detachedFileIdentitiesEqual(left, right) {
  if (!left?.fileIdentity || !right?.fileIdentity) return false;
  return left.fileIdentity.dev === right.fileIdentity.dev &&
    left.fileIdentity.ino === right.fileIdentity.ino;
}

function staleDetachedFileState(relativePath, message) {
  return new ContentOwnershipError(
    'STALE_CONTENT_STATE',
    `${relativePath}: ${message}`,
    { path: relativePath }
  );
}

function captureDetachedFileState(filePath, relativePath) {
  const stat = lstatBigIntIfPresent(filePath);
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw unsafePublishPath(relativePath, 'detached rollback target must be a regular file');
  }
  const namedMetadataBefore = stableDetachedDescriptorMetadata(stat);
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    const openedStatBefore = fs.fstatSync(descriptor, { bigint: true });
    if (!openedStatBefore.isFile()) {
      throw unsafePublishPath(relativePath, 'detached rollback target must remain a regular file');
    }
    const metadataBefore = stableDetachedDescriptorMetadata(openedStatBefore);
    if (!detachedDescriptorMetadataEqual(namedMetadataBefore, metadataBefore)) {
      throw staleDetachedFileState(
        relativePath,
        'detached rollback target changed before its descriptor was opened'
      );
    }
    const content = fs.readFileSync(descriptor);
    const openedStatAfter = fs.fstatSync(descriptor, { bigint: true });
    if (!openedStatAfter.isFile()) {
      throw unsafePublishPath(relativePath, 'detached rollback target must remain a regular file');
    }
    const metadataAfter = stableDetachedDescriptorMetadata(openedStatAfter);
    if (
      BigInt(content.length) !== metadataBefore.size ||
      BigInt(content.length) !== metadataAfter.size ||
      !detachedDescriptorMetadataEqual(metadataBefore, metadataAfter)
    ) {
      throw staleDetachedFileState(
        relativePath,
        'detached rollback target changed while it was read'
      );
    }
    let namedStatAfter;
    try {
      namedStatAfter = fs.lstatSync(filePath, { bigint: true });
    } catch (error) {
      throw unsafePublishPath(
        relativePath,
        `detached rollback target could not be revalidated after read: ${error.message}`
      );
    }
    if (!namedStatAfter.isFile() || namedStatAfter.isSymbolicLink()) {
      throw unsafePublishPath(
        relativePath,
        'detached rollback target path must remain a regular file'
      );
    }
    if (
      namedStatAfter.dev !== openedStatAfter.dev ||
      namedStatAfter.ino !== openedStatAfter.ino
    ) {
      throw staleDetachedFileState(
        relativePath,
        'detached rollback target path changed identity while it was read'
      );
    }
    const namedMetadataAfter = stableDetachedDescriptorMetadata(namedStatAfter);
    if (!detachedDescriptorMetadataEqual(namedMetadataAfter, metadataAfter)) {
      throw staleDetachedFileState(
        relativePath,
        'detached rollback target changed after its descriptor read'
      );
    }
    return {
      exists: true,
      content,
      mode: Number(openedStatAfter.mode & 0o777n),
      fileIdentity: {
        dev: openedStatAfter.dev,
        ino: openedStatAfter.ino,
      },
    };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function linkDetachedBackWithoutReplace(detachedPath, targetPath, onTargetLinked = () => {}) {
  try {
    fs.linkSync(detachedPath, targetPath);
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
  onTargetLinked();
  fs.unlinkSync(detachedPath);
  return true;
}

function installPreimageWithoutReplace(preimagePath, targetPath) {
  try {
    fs.linkSync(preimagePath, targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
}

function restoreSnapshotEntryConditionally(rootDir, relativePath, entry, postimage) {
  const targetPath = resolveSafeWorkspacePath(rootDir, relativePath);
  const parentPath = path.dirname(targetPath);
  const anchor = openAnchoredDirectory(parentPath, relativePath);
  let anchoredTargetPath;
  let quarantineDir;
  try {
    if (postimage.rollbackParentIdentity) {
      assertAnchoredDirectoryIdentity(
        anchor,
        postimage.rollbackParentIdentity,
        relativePath
      );
    }
    anchoredTargetPath = path.join(anchor.anchorPath, path.basename(targetPath));
    quarantineDir = fs.mkdtempSync(
      path.join(anchor.anchorPath, `.${path.basename(targetPath)}.rollback-`)
    );
  } catch (error) {
    closeAnchoredDirectory(anchor);
    throw error;
  }
  const detachedPath = path.join(quarantineDir, 'detached');
  const preimagePath = path.join(quarantineDir, 'preimage');
  const quarantineRelative = `${relativePath}.rollback-quarantine`;
  let detachedExists = false;
  let preimageExists = false;
  let preimageDescriptor;
  const recheckSelectedParentIdentity = () => {
    if (!postimage.rollbackParentIdentity) return;
    const selectedParent = openAnchoredDirectory(parentPath, relativePath);
    try {
      assertAnchoredDirectoryIdentity(
        selectedParent,
        postimage.rollbackParentIdentity,
        relativePath
      );
    } finally {
      closeAnchoredDirectory(selectedParent);
    }
  };

  try {
    if (!postimage.exists) {
      if (!entry.exists) return;
      // The transaction deleted a pre-existing file. Install its preimage
      // only if the path is still absent; link(2) supplies no-replace
      // semantics if a concurrent writer recreates it first.
      const noFollow = fs.constants.O_NOFOLLOW || 0;
      preimageDescriptor = fs.openSync(
        preimagePath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
        entry.mode ?? 0o644
      );
      preimageExists = true;
      fs.fchmodSync(preimageDescriptor, entry.mode ?? 0o644);
      fs.writeFileSync(preimageDescriptor, entry.content);
      fs.fsyncSync(preimageDescriptor);
      fs.closeSync(preimageDescriptor);
      preimageDescriptor = undefined;
      if (!installPreimageWithoutReplace(preimagePath, anchoredTargetPath)) {
        throw new ContentOwnershipError(
          'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT',
          `${relativePath}: a concurrent path appeared before rollback could restore the deleted preimage`,
          { path: relativePath }
        );
      }
      fs.unlinkSync(preimagePath);
      preimageExists = false;
      recheckSelectedParentIdentity();
      return;
    }

    // This is the identity-defining operation. Whatever inode occupies the
    // live path at this instant is atomically removed from that path first;
    // only the detached inode is then compared with our transaction postimage.
    fs.renameSync(anchoredTargetPath, detachedPath);
    detachedExists = true;
    const detachedState = captureDetachedFileState(detachedPath, relativePath);

    if (!workspaceFileStatesEqual(detachedState, postimage)) {
      if (linkDetachedBackWithoutReplace(detachedPath, anchoredTargetPath)) {
        detachedExists = false;
        throw new ContentOwnershipError(
          'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT',
          `${relativePath}: atomically detached live bytes did not match the transaction postimage and were restored`,
          { path: relativePath }
        );
      }
      throw new ContentOwnershipError(
        'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT',
        `${relativePath}: concurrent bytes were preserved at ${quarantineRelative} because a newer live path appeared`,
        { path: relativePath }
      );
    }

    if (!entry.exists) {
      // The pre-transaction state was absence. The matching detached inode is
      // ours, but a process that opened it before detachment can still write.
      // Keep that inode recoverable; a writer that creates the target after
      // the detachment is never touched.
      retainDetachedInodeForRecovery(
        detachedPath,
        relativePath,
        'conditional-rollback',
        detachedState
      );
      detachedExists = false;
      recheckSelectedParentIdentity();
      return;
    }

    const noFollow = fs.constants.O_NOFOLLOW || 0;
    preimageDescriptor = fs.openSync(
      preimagePath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
      entry.mode ?? 0o644
    );
    preimageExists = true;
    fs.fchmodSync(preimageDescriptor, entry.mode ?? 0o644);
    fs.writeFileSync(preimageDescriptor, entry.content);
    fs.fsyncSync(preimageDescriptor);
    fs.closeSync(preimageDescriptor);
    preimageDescriptor = undefined;

    if (!installPreimageWithoutReplace(preimagePath, anchoredTargetPath)) {
      // A concurrent writer won the now-empty target path. Preserve it and
      // retain the verified transaction postimage in durable quarantine.
      retainDetachedInodeForRecovery(
        detachedPath,
        relativePath,
        'conditional-rollback',
        detachedState
      );
      detachedExists = false;
      fs.unlinkSync(preimagePath);
      preimageExists = false;
      throw new ContentOwnershipError(
        'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT',
        `${relativePath}: a concurrent path appeared before rollback could reinstall the preimage`,
        { path: relativePath }
      );
    }
    fs.unlinkSync(preimagePath);
    preimageExists = false;
    retainDetachedInodeForRecovery(
      detachedPath,
      relativePath,
      'conditional-rollback',
      detachedState
    );
    detachedExists = false;
    recheckSelectedParentIdentity();
  } catch (error) {
    // If an unexpected failure occurred after detachment, make a best-effort
    // no-replace restoration. Never overwrite a path created in the interim;
    // in that case the detached inode remains in quarantine for recovery.
    if (detachedExists && !lstatIfPresent(anchoredTargetPath)) {
      try {
        if (linkDetachedBackWithoutReplace(detachedPath, anchoredTargetPath)) {
          detachedExists = false;
        }
      } catch {
        // Preserve the quarantine file; the caller reports the conflict.
      }
    }
    if (detachedExists && error?.privateDetachedRecoveryRecord) {
      registerDurableQuarantineRecord(error.privateDetachedRecoveryRecord);
    }
    throw error;
  } finally {
    if (preimageDescriptor !== undefined) fs.closeSync(preimageDescriptor);
    if (preimageExists) {
      try {
        fs.unlinkSync(preimagePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    try {
      fs.rmdirSync(quarantineDir);
    } catch (error) {
      if (error?.code !== 'ENOTEMPTY' && error?.code !== 'ENOENT') throw error;
    }
    closeAnchoredDirectory(anchor);
  }
}

function restoreSnapshot(rootDir, snapshot, relativePaths = snapshot.keys(), postimages = new Map()) {
  const selected = new Set(relativePaths);
  const conflicts = [];
  for (const [relativePath, entry] of snapshot) {
    if (!selected.has(relativePath)) continue;
    let liveState;
    try {
      liveState = captureWorkspaceFileState(rootDir, relativePath);
    } catch (error) {
      conflicts.push({
        path: relativePath,
        reason: `could not verify the live rollback target: ${error.message}`,
      });
      continue;
    }

    const postimage = postimages.get(relativePath);
    if (!postimage) {
      if (!workspaceFileStatesEqual(liveState, entry)) {
        conflicts.push({
          path: relativePath,
          reason: 'transaction postimage was not captured, so changed live bytes were preserved',
        });
      }
      continue;
    }
    if (!workspaceFileStatesEqual(liveState, postimage)) {
      if (!workspaceFileStatesEqual(liveState, entry)) {
        conflicts.push({
          path: relativePath,
          reason: 'live bytes changed after the transaction write and were preserved',
        });
      }
      continue;
    }
    if (!entry.exists && !liveState.exists) continue;

    try {
      restoreSnapshotEntryConditionally(rootDir, relativePath, entry, postimage);
    } catch (error) {
      conflicts.push({
        path: relativePath,
        reason: `conditional rollback failed: ${error.message}`,
      });
    }
  }
  return conflicts;
}

function rollbackConflictError(operationError, conflicts) {
  const paths = conflicts.map(({ path }) => path).join(', ');
  const operationMessage = operationError instanceof Error
    ? operationError.message
    : String(operationError);
  const error = new ContentOwnershipError(
    'PUBLISH_TRANSACTION_ROLLBACK_CONFLICT',
    `${operationMessage}; rollback preserved concurrently changed or unverifiable paths: ${paths}`,
    { path: conflicts[0]?.path || '' }
  );
  error.cause = operationError;
  error.rollbackConflicts = conflicts;
  return error;
}

function acquirePublishTransactionLock(rootDir) {
  const lockPath = resolveSafeWorkspacePath(rootDir, PUBLISH_TRANSACTION_LOCK);
  const rootAnchor = openAnchoredDirectory(path.dirname(lockPath), PUBLISH_TRANSACTION_LOCK);
  const anchoredLockPath = path.join(rootAnchor.anchorPath, path.basename(lockPath));
  let lockDescriptor;
  let lockCreated = false;
  try {
    fs.mkdirSync(anchoredLockPath);
    lockCreated = true;
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    lockDescriptor = fs.openSync(
      anchoredLockPath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
    );
  } catch (error) {
    if (lockDescriptor !== undefined) fs.closeSync(lockDescriptor);
    if (lockCreated) {
      try {
        fs.rmdirSync(anchoredLockPath);
      } catch {
        // The acquisition error remains authoritative; a non-empty or swapped
        // lock path must not be removed speculatively.
      }
    }
    closeAnchoredDirectory(rootAnchor);
    if (error?.code === 'EEXIST') {
      throw new ContentOwnershipError(
        'PUBLISH_TRANSACTION_LOCKED',
        `${PUBLISH_TRANSACTION_LOCK}: another wiki content publish transaction is active`,
        { path: PUBLISH_TRANSACTION_LOCK }
      );
    }
    throw new ContentOwnershipError(
      'PUBLISH_TRANSACTION_LOCK_FAILED',
      `${PUBLISH_TRANSACTION_LOCK}: could not acquire publish transaction lock: ${error.message}`,
      { path: PUBLISH_TRANSACTION_LOCK }
    );
  }
  return {
    rootPath: path.resolve(rootDir),
    rootAnchor,
    rootIdentity: directoryIdentityFromDescriptor(rootAnchor.descriptor),
    anchoredLockPath,
    lockDescriptor,
    lockIdentity: directoryIdentityFromDescriptor(lockDescriptor),
    allowDetachedRoot: false,
  };
}

function releasePublishTransactionLock(lockHandle) {
  try {
    const heldIdentity = directoryIdentityFromDescriptor(lockHandle.lockDescriptor);
    if (
      heldIdentity.dev !== lockHandle.lockIdentity.dev ||
      heldIdentity.ino !== lockHandle.lockIdentity.ino ||
      !transactionLockIdentityMatches(lockHandle)
    ) {
      throw new Error('lock directory was removed or replaced before cleanup');
    }
    fs.rmdirSync(lockHandle.anchoredLockPath);
  } catch (error) {
    throw new ContentOwnershipError(
      'PUBLISH_TRANSACTION_LOCK_CLEANUP_FAILED',
      `${PUBLISH_TRANSACTION_LOCK}: could not release publish transaction lock: ${error.message}`,
      { path: PUBLISH_TRANSACTION_LOCK }
    );
  } finally {
    if (lockHandle.lockDescriptor !== undefined) fs.closeSync(lockHandle.lockDescriptor);
    closeAnchoredDirectory(lockHandle.rootAnchor);
  }
}

function plannedManifestIdentity(renderedPages) {
  if (renderedPages.length === 0) return null;
  const expected = renderedPages[0].contentStateManifestIdentity;
  if (!expected?.bytesBase64 || !SHA256_PATTERN.test(expected.contentHash || '')) {
    throw new ContentOwnershipError(
      'CONTENT_STATE_MANIFEST_IDENTITY_MISSING',
      `${CONTENT_STATE_MANIFEST_FILE}: ownership plan is not bound to the authorizing manifest bytes`,
      { path: CONTENT_STATE_MANIFEST_FILE }
    );
  }
  for (const plan of renderedPages.slice(1)) {
    const candidate = plan.contentStateManifestIdentity;
    if (
      candidate?.contentHash !== expected.contentHash ||
      candidate?.bytesBase64 !== expected.bytesBase64
    ) {
      throw new ContentOwnershipError(
        'CONTENT_STATE_MANIFEST_IDENTITY_MISMATCH',
        `${CONTENT_STATE_MANIFEST_FILE}: article writes in one transaction must share one authorizing manifest identity`,
        { path: CONTENT_STATE_MANIFEST_FILE }
      );
    }
  }
  return expected;
}

function staleManifestIdentity(expected, observedBytes) {
  const observedHash = observedBytes === null ? 'missing' : sha256Content(observedBytes);
  return new ContentOwnershipError(
    'STALE_CONTENT_STATE',
    `${CONTENT_STATE_MANIFEST_FILE}: authorizing manifest changed after ownership planning (${expected.contentHash} to ${observedHash})`,
    { path: CONTENT_STATE_MANIFEST_FILE }
  );
}

function assertLiveManifestPlanBase(rootDir, renderedPages) {
  const expected = plannedManifestIdentity(renderedPages);
  if (!expected) return;
  const liveBytes = readWorkspaceFileNoFollow(rootDir, CONTENT_STATE_MANIFEST_FILE);
  if (
    liveBytes === null ||
    liveBytes.toString('base64') !== expected.bytesBase64
  ) {
    throw staleManifestIdentity(expected, liveBytes);
  }
}

function assertLivePlanBases(rootDir, plans) {
  const renderedPages = plans.filter(({ action }) => action === 'write');
  for (const plan of plans) {
    const liveBytes = readWorkspaceFileNoFollow(rootDir, plan.relPagePath);
    const pageExists = liveBytes !== null;
    if (plan.state.page_exists === false) {
      if (pageExists) {
        throw ownershipFailure(
          'STALE_CONTENT_STATE',
          'page appeared after ownership preflight; refusing to overwrite it',
          plan.payload,
          plan.relPagePath
        );
      }
      continue;
    }
    if (!pageExists) {
      throw ownershipFailure(
        'STALE_CONTENT_STATE',
        'page disappeared after ownership preflight; refusing to recreate it',
        plan.payload,
        plan.relPagePath
      );
    }
    const liveHash = sha256Content(liveBytes);
    if (liveHash !== plan.actualContentHash) {
      throw ownershipFailure(
        'STALE_CONTENT_STATE',
        `page changed after ownership preflight (${plan.actualContentHash} to ${liveHash})`,
        plan.payload,
        plan.relPagePath
      );
    }
  }
  // Keep the manifest check last: this is the final authorization check before
  // a caller proceeds to an article write, after the page base itself has also
  // been revalidated.
  assertLiveManifestPlanBase(rootDir, renderedPages);
}

function assertSnapshotPlanBases(snapshot, renderedPages) {
  const expectedManifest = plannedManifestIdentity(renderedPages);
  if (expectedManifest) {
    const capturedManifest = snapshot.get(CONTENT_STATE_MANIFEST_FILE);
    if (
      !capturedManifest?.exists ||
      Buffer.from(capturedManifest.content).toString('base64') !== expectedManifest.bytesBase64
    ) {
      throw staleManifestIdentity(
        expectedManifest,
        capturedManifest?.exists ? Buffer.from(capturedManifest.content) : null
      );
    }
  }
  for (const plan of renderedPages) {
    const captured = snapshot.get(plan.relPagePath);
    if (!captured) {
      throw ownershipFailure(
        'PUBLISH_TRANSACTION_SNAPSHOT_MISSING',
        'transaction snapshot did not capture the planned page',
        plan.payload,
        plan.relPagePath
      );
    }
    if (plan.state.page_exists === false) {
      if (captured.exists) {
        throw ownershipFailure(
          'STALE_CONTENT_STATE',
          'page appeared while the transaction snapshot was being captured; refusing to overwrite it',
          plan.payload,
          plan.relPagePath
        );
      }
      continue;
    }
    const capturedHash = captured.exists ? sha256Content(captured.content) : null;
    if (!captured.exists || capturedHash !== plan.actualContentHash) {
      throw ownershipFailure(
        'STALE_CONTENT_STATE',
        `transaction snapshot does not match the ownership preflight (${plan.actualContentHash} to ${capturedHash || 'missing'})`,
        plan.payload,
        plan.relPagePath
      );
    }
  }
}

function verifyRefreshedContentState(rootDir, renderedPages) {
  const reportPath = path.join(rootDir, CONTENT_STATE_REPORT_FILE);
  if (!fs.existsSync(reportPath)) {
    throw new ContentOwnershipError(
      'CONTENT_STATE_REFRESH_FAILED',
      `content-state refresh did not produce ${CONTENT_STATE_REPORT_FILE}`,
      { path: CONTENT_STATE_REPORT_FILE }
    );
  }
  const { pagesBySlug } = loadWikiContentState(rootDir);
  for (const plan of renderedPages) {
    const refreshed = pagesBySlug.get(plan.payload.slug);
    const liveBytes = readWorkspaceFileNoFollow(rootDir, plan.relPagePath);
    if (!refreshed || refreshed.page_exists !== true || liveBytes === null) {
      throw ownershipFailure(
        'CONTENT_STATE_REFRESH_FAILED',
        'refreshed content-state manifest is missing the written page',
        plan.payload,
        plan.relPagePath
      );
    }
    const liveHash = sha256Content(liveBytes);
    const plannedHash = sha256Content(Buffer.from(plan.html, 'utf8'));
    if (liveHash !== plannedHash) {
      throw ownershipFailure(
        'STALE_CONTENT_STATE',
        `page changed after the conditional write (${plannedHash} to ${liveHash})`,
        plan.payload,
        plan.relPagePath
      );
    }
    if (refreshed.content_hash !== liveHash) {
      throw ownershipFailure(
        'CONTENT_STATE_REFRESH_FAILED',
        `refreshed content-state hash ${refreshed.content_hash} does not match written page ${liveHash}`,
        plan.payload,
        plan.relPagePath
      );
    }
  }
}

function existingCategoryHtmlFiles(rootDir) {
  const categoriesDir = resolveSafeWorkspacePath(rootDir, 'categories');
  const categoriesStat = lstatIfPresent(categoriesDir);
  if (!categoriesStat) return [];
  if (!categoriesStat.isDirectory() || categoriesStat.isSymbolicLink()) {
    throw unsafePublishPath('categories', 'category discovery root must be a real directory');
  }

  const htmlEntries = fs.readdirSync(categoriesDir)
    .filter((fileName) => /\.html$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right));
  resolveSafeWorkspacePath(rootDir, 'categories');
  return htmlEntries.map((fileName) => {
    const relativePath = `categories/${fileName}`;
    const filePath = resolveSafeWorkspacePath(rootDir, relativePath);
    const stat = lstatIfPresent(filePath);
    if (!stat?.isFile() || stat.isSymbolicLink()) {
      throw unsafePublishPath(relativePath, 'category HTML targets must be regular files, not symlinks or special files');
    }
    return relativePath;
  });
}

function expectedSyncFiles(rootDir, payloads) {
  const categoryFiles = new Set([
    'categories/index.html',
    ...existingCategoryHtmlFiles(rootDir),
  ]);
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

function upsertIntoExistingCategoryPage(filePath, category, entries, resetUrls = []) {
  if (!fs.existsSync(filePath)) {
    atomicWriteFilePathSync(filePath, renderCategoryPage(category, entries), 'utf8');
    return;
  }

  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const resetUrl of resetUrls) {
    const escapedUrl = String(resetUrl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const staleItem = new RegExp(
      `<a\\b(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\barticle-list-item\\b[^"']*["'])(?=[^>]*\\bhref\\s*=\\s*["']${escapedUrl}["'])[^>]*>[\\s\\S]*?<\\/a>\\s*`,
      'gi'
    );
    const cleaned = html.replace(staleItem, '');
    if (cleaned !== html) {
      html = cleaned;
      changed = true;
    }
  }
  const missingItems = entries
    .filter((entry) => !html.includes(`href="${entry.url}"`) && !html.includes(`href='${entry.url}'`))
    .map(renderCategoryListItem);

  if (missingItems.length === 0) {
    if (changed) atomicWriteFilePathSync(filePath, html, 'utf8');
    return;
  }

  if (html.includes('class="article-list"')) {
    html = html.replace(/(\s*<\/div>\s*<\/main>)/, `\n${missingItems.join('\n')}$1`);
  } else {
    html = html.replace(/(\s*<\/main>)/, `\n      <div class="article-list" aria-label="Articles in ${escapeHtml(category)}">\n${missingItems.join('\n')}\n      </div>$1`);
  }

  atomicWriteFilePathSync(filePath, html, 'utf8');
}

function upsertCategoryIndex(indexPath, wikiIndex) {
  const categories = Array.from(new Set(wikiIndex.map((entry) => entry.category || 'Lore')))
    .sort((a, b) => String(a).localeCompare(String(b)));
  const cards = categories.map(renderCategoryCard);

  if (!fs.existsSync(indexPath)) {
    atomicWriteFilePathSync(indexPath, `<!DOCTYPE html>
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

  atomicWriteFilePathSync(indexPath, html, 'utf8');
}

function syncCategories(rootDir, wikiIndex, payloads) {
  const categoriesDir = path.join(rootDir, 'categories');
  ensureSafeWorkspaceParent(rootDir, 'categories/.publish-directory-anchor');

  const incomingUrls = payloads.map((payload) => `/wiki/${payload.slug}.html`);
  for (const relativePath of existingCategoryHtmlFiles(rootDir)) {
    upsertIntoExistingCategoryPage(path.join(rootDir, relativePath), '', [], incomingUrls);
  }

  const touchedCategories = Array.from(new Set(payloads.map((payload) => payload.category))).sort();
  for (const category of touchedCategories) {
    const catSlug = categorySlug(category);
    const entries = wikiIndex.filter((entry) => categorySlug(entry.category) === catSlug);
    upsertIntoExistingCategoryPage(
      path.join(categoriesDir, `${catSlug}.html`),
      category,
      entries
    );
  }

  upsertCategoryIndex(path.join(categoriesDir, 'index.html'), wikiIndex);
}

function syncPortableSurfaces(rootDir, payloads, logger) {
  const jsDir = path.join(rootDir, 'js');
  ensureSafeWorkspaceParent(rootDir, 'js/.publish-directory-anchor');
  persistRelationshipHints(rootDir, payloads);

  const payloadEntries = payloads
    .filter((payload) => !payloadTargetsSearchExcludedPage(rootDir, payload))
    .map(payloadToIndexEntry);
  const discoveredWikiEntries = discoverWikiPageEntries(rootDir);
  const wikiIndexPath = path.join(jsDir, 'wiki-index.json');
  const existingWikiIndex = loadJsonArray(wikiIndexPath);
  const searchExcludedUrls = new Set();
  for (const entry of existingWikiIndex) {
    const match = String(entry?.url || '').match(/^\/wiki\/([a-z0-9][a-z0-9_-]*\.html)$/i);
    if (!match) continue;
    const pageBytes = readWorkspaceFileNoFollow(rootDir, `wiki/${match[1]}`);
    if (pageBytes === null) continue;
    const pageHtml = pageBytes.toString('utf8');
    if (hasRootWikiStubMarker(pageHtml) || hasNoindexRobotsMeta(pageHtml)) {
      searchExcludedUrls.add(entry.url);
    }
  }
  const retainedWikiIndex = existingWikiIndex.filter((entry) => !searchExcludedUrls.has(entry?.url));
  const wikiIndex = upsertByUrl(retainedWikiIndex, [...discoveredWikiEntries, ...payloadEntries]);
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
  atomicWriteFilePathSync(path.join(rootDir, 'sitemap.xml'), [
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

function runScriptStep(rootDir, step, logger, stagingDescriptor = null) {
  const scriptPath = path.join(rootDir, step.script);
  if (!fs.existsSync(scriptPath)) {
    throw new FeedSyncError(step.surface, `feed sync not implemented for ${step.surface}`);
  }

  const stagedFsShim = path.join(rootDir, 'scripts', 'wiki-publish-staged-fs.cjs');
  const staged = stagingDescriptor !== null;
  if (staged && !fs.existsSync(stagedFsShim)) {
    throw new FeedSyncError(step.surface, 'transactional feed staging shim is missing');
  }
  const result = spawnSync(process.execPath, [
    ...(staged ? ['--require', stagedFsShim] : []),
    scriptPath,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: staged
      ? ['ignore', 'pipe', 'pipe', stagingDescriptor]
      : ['ignore', 'pipe', 'pipe'],
    env: staged
      ? {
          ...process.env,
          WIKI_PUBLISH_ROOT: path.resolve(rootDir),
          WIKI_PUBLISH_STAGE_FD: '3',
          WIKI_PUBLISH_STAGED_OUTPUTS: JSON.stringify(REAL_ROOT_GENERATED_FILES),
        }
      : process.env,
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

function payloadTargetsSearchExcludedPage(rootDir, payload) {
  const pageBytes = readWorkspaceFileNoFollow(rootDir, plannedPagePath(payload));
  if (pageBytes === null) return false;
  const html = pageBytes.toString('utf8');
  return hasRootWikiStubMarker(html) || hasNoindexRobotsMeta(html);
}

export function assertPayloadUrlsSynced(rootDir, payloads) {
  const wikiIndex = loadJsonArray(path.join(rootDir, 'js', 'wiki-index.json'));
  const indexedUrls = new Set(wikiIndex.map((entry) => entry.url));
  for (const payload of payloads) {
    const url = `/wiki/${payload.slug}.html`;
    if (payloadTargetsSearchExcludedPage(rootDir, payload)) {
      if (indexedUrls.has(url)) {
        throw new FeedSyncError('search', `feed sync failed for search: excluded page ${url} must not be written to js/wiki-index.json`);
      }
      continue;
    }
    if (!indexedUrls.has(url)) {
      throw new FeedSyncError('search', `feed sync failed for search: ${url} was not written to js/wiki-index.json`);
    }
  }

  const sitemapPath = path.join(rootDir, 'sitemap.xml');
  const sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
  for (const payload of payloads) {
    const absoluteUrl = `https://cryptomoonboys.com/wiki/${payload.slug}.html`;
    if (payloadTargetsSearchExcludedPage(rootDir, payload)) {
      if (sitemap.includes(absoluteUrl)) {
        throw new FeedSyncError('sitemap', `feed sync failed for sitemap: excluded page /wiki/${payload.slug}.html must be excluded`);
      }
      continue;
    }
    if (!sitemap.includes(absoluteUrl)) {
      throw new FeedSyncError('sitemap', `feed sync failed for sitemap: /wiki/${payload.slug}.html is missing`);
    }
  }
}

function syncRealRootSurfaces(rootDir, payloads, logger) {
  assertRequiredRealRootSyncScripts(rootDir);
  // Real-root generators historically perform ordinary path reads. Run the
  // same confined, no-follow discovery used by the portable path first so a
  // wiki symlink or special file is rejected before any generator can follow
  // it or mutate an output surface.
  discoverWikiPageEntries(rootDir);
  persistRelationshipHints(rootDir, payloads);

  const rootAnchor = openAnchoredDirectory(rootDir, 'real-root feed staging');
  const stagingDirPath = fs.mkdtempSync(
    path.join(rootAnchor.anchorPath, '.wiki-feed-refresh-')
  );
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let stagingDescriptor;
  try {
    stagingDescriptor = fs.openSync(
      stagingDirPath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
    );
    const stagingAnchorPath = `/proc/self/fd/${stagingDescriptor}`;

    for (const step of REAL_ROOT_SYNC_STEPS) {
      runScriptStep(rootDir, step, logger, stagingDescriptor);
    }

    const stagedStates = new Map();
    for (const relativePath of REAL_ROOT_GENERATED_FILES) {
      const stagedPath = path.join(
        stagingAnchorPath,
        ...relativePath.split('/')
      );
      try {
        stagedStates.set(
          relativePath,
          captureDetachedFileState(stagedPath, relativePath)
        );
      } catch (error) {
        throw new FeedSyncError(
          'generated feed',
          `feed sync did not stage ${relativePath}: ${error.message}`
        );
      }
    }

    for (const relativePath of REAL_ROOT_GENERATED_FILES) {
      atomicWriteFilePathSync(
        resolveSafeWorkspacePath(rootDir, relativePath),
        stagedStates.get(relativePath).content
      );
    }
  } finally {
    if (stagingDescriptor !== undefined) {
      const stagingAnchorPath = `/proc/self/fd/${stagingDescriptor}`;
      for (const relativePath of REAL_ROOT_GENERATED_FILES) {
        try {
          fs.unlinkSync(path.join(stagingAnchorPath, ...relativePath.split('/')));
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            // Preserve unexpected staging state for inspection; never resolve
            // it through a live repository pathname.
          }
        }
      }
      for (const relativeDirectory of ['js']) {
        try {
          fs.rmdirSync(path.join(stagingAnchorPath, relativeDirectory));
        } catch (error) {
          if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') throw error;
        }
      }
      fs.closeSync(stagingDescriptor);
    }
    try {
      fs.rmdirSync(stagingDirPath);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') throw error;
    }
    closeAnchoredDirectory(rootAnchor);
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

export function refreshContentStateArtifacts(rootDir = ROOT, logger = console.log) {
  const script = 'scripts/generate-wiki-content-state.mjs';
  const scriptPath = path.join(rootDir, script);
  if (!fs.existsSync(scriptPath)) {
    throw new ContentOwnershipError(
      'CONTENT_STATE_REFRESH_UNAVAILABLE',
      `${script}: content-state generator is required after article writes`,
      { path: script }
    );
  }

  const rootAnchor = openAnchoredDirectory(rootDir, script);
  const stagingDirPath = fs.mkdtempSync(
    path.join(rootAnchor.anchorPath, '.wiki-content-state-refresh-')
  );
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let stagingDescriptor;
  const stagedFiles = [
    [CONTENT_STATE_MANIFEST_FILE, path.basename(CONTENT_STATE_MANIFEST_FILE)],
    [CONTENT_STATE_REPORT_FILE, path.basename(CONTENT_STATE_REPORT_FILE)],
  ];

  try {
    stagingDescriptor = fs.openSync(
      stagingDirPath,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | noFollow
    );
    const stagingAnchorPath = `/proc/self/fd/${stagingDescriptor}`;
    const result = spawnSync(
      process.execPath,
      [scriptPath, '--write', '--output-fd', '3'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe', stagingDescriptor],
      }
    );
    if (result.stdout?.trim()) logger(result.stdout.trim());
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
      throw new ContentOwnershipError(
        'CONTENT_STATE_REFRESH_FAILED',
        `content-state refresh failed: ${script}${detail ? `\n${detail}` : ''}`,
        { path: script }
      );
    }

    const stagedStates = new Map();
    for (const [relativePath, fileName] of stagedFiles) {
      const stagedPath = path.join(stagingAnchorPath, fileName);
      const stagedState = captureDetachedFileState(stagedPath, relativePath);
      stagedStates.set(relativePath, stagedState);
    }
    const stagedNames = fs.readdirSync(stagingAnchorPath).sort();
    const expectedNames = stagedFiles.map(([, fileName]) => fileName).sort();
    if (JSON.stringify(stagedNames) !== JSON.stringify(expectedNames)) {
      throw new ContentOwnershipError(
        'CONTENT_STATE_REFRESH_FAILED',
        `content-state refresh produced unexpected staging outputs: ${stagedNames.join(', ') || '(none)'}`,
        { path: script }
      );
    }

    // The child never receives a live brand-canon pathname. Commit its exact
    // staged bytes through the same anchored conditional writer used by the
    // rest of the transaction so a swapped parent or concurrent artifact wins
    // safely instead of being followed or overwritten.
    for (const [relativePath] of stagedFiles) {
      const stagedState = stagedStates.get(relativePath);
      atomicWriteFilePathSync(
        resolveSafeWorkspacePath(rootDir, relativePath),
        stagedState.content
      );
    }
  } finally {
    if (stagingDescriptor !== undefined) {
      const stagingAnchorPath = `/proc/self/fd/${stagingDescriptor}`;
      for (const [, fileName] of stagedFiles) {
        try {
          fs.unlinkSync(path.join(stagingAnchorPath, fileName));
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            // Leave any unverifiable staging entry in the private directory;
            // never chase it through an ordinary repository pathname.
          }
        }
      }
      fs.closeSync(stagingDescriptor);
    }
    try {
      fs.rmdirSync(stagingDirPath);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') throw error;
    }
    closeAnchoredDirectory(rootAnchor);
  }
  return {
    files: [CONTENT_STATE_MANIFEST_FILE, CONTENT_STATE_REPORT_FILE],
  };
}

export function consumeAbsentStubAuthorizations(rootDir, renderedPages) {
  const createdStubSlugs = renderedPages
    .filter(({ state }) => state.page_exists === false)
    .map(({ payload }) => payload.slug);
  if (createdStubSlugs.length === 0) return { consumedSlugs: [] };

  const registryPath = path.join(rootDir, ABSENT_STUB_AUTHORIZATIONS_FILE);
  if (!fs.existsSync(registryPath)) {
    throw new ContentOwnershipError(
      'ABSENT_STUB_AUTHORIZATION_MISSING',
      `${ABSENT_STUB_AUTHORIZATIONS_FILE}: required one-time stub authorization registry is missing`,
      { path: ABSENT_STUB_AUTHORIZATIONS_FILE }
    );
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (error) {
    throw new ContentOwnershipError(
      'ABSENT_STUB_AUTHORIZATION_INVALID',
      `${ABSENT_STUB_AUTHORIZATIONS_FILE}: invalid JSON: ${error.message}`,
      { path: ABSENT_STUB_AUTHORIZATIONS_FILE }
    );
  }
  if (registry?.schema_version !== 1 || !Array.isArray(registry.absent_stub_slugs)) {
    throw new ContentOwnershipError(
      'ABSENT_STUB_AUTHORIZATION_INVALID',
      `${ABSENT_STUB_AUTHORIZATIONS_FILE}: expected schema_version 1 and absent_stub_slugs array`,
      { path: ABSENT_STUB_AUTHORIZATIONS_FILE }
    );
  }

  const seenAuthorizations = new Set();
  for (const slug of registry.absent_stub_slugs) {
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new ContentOwnershipError(
        'ABSENT_STUB_AUTHORIZATION_INVALID',
        `${ABSENT_STUB_AUTHORIZATIONS_FILE}: invalid absent-stub slug ${JSON.stringify(slug)}`,
        { path: ABSENT_STUB_AUTHORIZATIONS_FILE }
      );
    }
    if (seenAuthorizations.has(slug)) {
      throw new ContentOwnershipError(
        'ABSENT_STUB_AUTHORIZATION_INVALID',
        `${ABSENT_STUB_AUTHORIZATIONS_FILE}: duplicate absent-stub slug ${slug}`,
        { slug, path: ABSENT_STUB_AUTHORIZATIONS_FILE }
      );
    }
    seenAuthorizations.add(slug);
  }

  const authorized = seenAuthorizations;
  for (const slug of createdStubSlugs) {
    if (!authorized.has(slug)) {
      throw new ContentOwnershipError(
        'ABSENT_STUB_AUTHORIZATION_MISSING',
        `${ABSENT_STUB_AUTHORIZATIONS_FILE}: ${slug} is not authorized for creation`,
        { slug, path: ABSENT_STUB_AUTHORIZATIONS_FILE }
      );
    }
  }
  const consumed = new Set(createdStubSlugs);
  registry.absent_stub_slugs = registry.absent_stub_slugs.filter((slug) => !consumed.has(slug));
  writeJson(registryPath, registry);
  return { consumedSlugs: createdStubSlugs };
}

export function planContentOwnershipUpdates(payloads, rootDir = ROOT) {
  const seenSlugs = new Set();
  for (const payload of payloads) {
    validatePayload(payload, `<ownership-plan:${payload?.slug || 'unknown'}>`);
    if (seenSlugs.has(payload.slug)) {
      throw new ContentOwnershipError(
        'DUPLICATE_PAYLOAD_SLUG',
        `website publish batch contains duplicate slug: ${payload.slug}`,
        { slug: payload.slug, path: plannedPagePath(payload) }
      );
    }
    seenSlugs.add(payload.slug);
  }
  const { manifestIdentity, pagesBySlug } = loadWikiContentState(rootDir);

  return payloads.map((payload) => {
    const relPagePath = plannedPagePath(payload);
    const state = pagesBySlug.get(payload.slug);
    if (!state) {
      throw ownershipFailure(
        'MISSING_CONTENT_STATE_ENTRY',
        `no content-state entry exists for ${payload.slug}; missing bot memory is never treated as a first edit`,
        payload,
        relPagePath
      );
    }
    if (Number(state.sam_content_block_count || 0) > 1) {
      throw ownershipFailure(
        'MULTIPLE_SAM_BLOCKS',
        'content-state records more than one SAM_CONTENT block',
        payload,
        relPagePath
      );
    }
    if (Number(state.canonical_content_block_count || 0) > 1) {
      throw ownershipFailure(
        'MULTIPLE_CANONICAL_BLOCKS',
        'content-state records more than one canonical article-content block',
        payload,
        relPagePath
      );
    }

    const existingBytesOrNull = readWorkspaceFileNoFollow(rootDir, relPagePath);
    const pageExists = existingBytesOrNull !== null;
    if (!pageExists && state.automation_policy !== 'stub-allowed') {
      throw ownershipFailure(
        'NEW_PAGE_REQUIRES_STUB_POLICY',
        'a missing page may only be created by an explicit stub-allowed manifest entry',
        payload,
        relPagePath
      );
    }
    if (!pageExists && state.page_exists !== false) {
      throw ownershipFailure(
        'MISSING_PAGE_NOT_DECLARED',
        'stub-allowed creation requires page_exists: false in the manifest',
        payload,
        relPagePath
      );
    }
    if (pageExists && state.page_exists === false) {
      throw ownershipFailure(
        'STALE_CONTENT_STATE',
        'manifest declares the page absent but the repository page exists',
        payload,
        relPagePath
      );
    }

    const existingBytes = pageExists ? existingBytesOrNull : Buffer.alloc(0);
    const existingHtml = existingBytes.toString('utf8');
    assertOwnershipMarkerStructure(existingHtml, relPagePath);

    const actualContentHash = sha256Content(existingBytes);
    const manifestContentHash = state.content_hash;
    const isMetadataOnly = payload.publish_mode === 'metadata_only';

    if (pageExists && actualContentHash !== manifestContentHash) {
      throw ownershipFailure(
        'STALE_CONTENT_STATE',
        `manifest revision ${manifestContentHash} does not match current file ${actualContentHash}`,
        payload,
        relPagePath
      );
    }

    if (isMetadataOnly) {
      if (!pageExists) {
        throw ownershipFailure(
          'METADATA_TARGET_MISSING',
          'metadata-only updates require an existing repository page',
          payload,
          relPagePath
        );
      }
      if (payload.expected_content_hash && payload.expected_content_hash !== manifestContentHash) {
        throw ownershipFailure(
          'STALE_EXPECTED_CONTENT_HASH',
          `expected_content_hash ${payload.expected_content_hash} does not match manifest revision ${manifestContentHash}`,
          payload,
          relPagePath
        );
      }
      return {
        action: 'metadata-only',
        payload,
        state,
        contentStateManifestIdentity: manifestIdentity,
        relPagePath,
        existingHtml,
        actualContentHash,
      };
    }

    if (isFirstWitnessSlug(payload.slug)) {
      throw ownershipFailure(
        'FIRST_WITNESS_PROSE_LOCKED',
        'First Witness article prose is hard-locked against automated writes',
        payload,
        relPagePath
      );
    }
    if (state.automation_policy === 'metadata-only' || state.automation_policy === 'canon-locked') {
      throw ownershipFailure(
        'ARTICLE_WRITE_FORBIDDEN',
        `${state.automation_policy} rejects automated article prose writes`,
        payload,
        relPagePath
      );
    }
    if (
      state.automation_policy === 'replace-sam-block' &&
      (payload.stub === true || payload.page_type === 'stub')
    ) {
      throw ownershipFailure(
        'STUB_POLICY_ESCALATION',
        'replace-sam-block payloads cannot request stub ownership',
        payload,
        relPagePath
      );
    }
    if (state.automation_policy === 'replace-sam-block' && hasRootWikiStubMarker(existingHtml)) {
      throw ownershipFailure(
        'STUB_POLICY_ESCALATION',
        'a root-marked stub cannot be rewritten through replace-sam-block policy',
        payload,
        relPagePath
      );
    }
    if (
      countCanonicalContentBlocks(existingHtml) > 0 &&
      markerCount(existingHtml, CANONICAL_CONTENT_BEGIN) !== 1
    ) {
      throw ownershipFailure(
        'CANONICAL_BLOCK_NOT_MARKER_OWNED',
        'canonical article content lacks the canonical ownership markers required for byte-preserving replacement',
        payload,
        relPagePath
      );
    }
    if (state.legacy_unmarked_content || hasLegacyUnmarkedArticle(existingHtml)) {
      throw ownershipFailure(
        'LEGACY_UNMARKED_CONTENT_REVIEW_REQUIRED',
        'unmarked legacy article content requires review and cannot enter the automated prose rewrite path',
        payload,
        relPagePath
      );
    }

    if (state.automation_policy === 'stub-allowed') {
      const proposedStubHtml = renderArticleMiddle(payload);
      const proposedStubWords = stripHtml(proposedStubHtml).split(/\s+/).filter(Boolean).length;
      if (proposedStubWords > MAX_STUB_ARTICLE_WORDS) {
        throw ownershipFailure(
          'STUB_CONTENT_TOO_LARGE',
          `stub content has ${proposedStubWords} words; maximum is ${MAX_STUB_ARTICLE_WORDS}`,
          payload,
          relPagePath
        );
      }
      if (
        proposedStubHtml.includes(MANUAL_CONTENT_BEGIN) ||
        proposedStubHtml.includes(SAM_CONTENT_BEGIN) ||
        proposedStubHtml.includes(CANONICAL_CONTENT_BEGIN)
      ) {
        throw ownershipFailure(
          'OWNERSHIP_MARKER_IN_STUB_PAYLOAD',
          'stub payload content must not contain ownership markers',
          payload,
          relPagePath
        );
      }
      const redirectOrAlias = pageExists
        ? redirectOrAliasTarget(existingHtml, rootDir, payload.slug)
        : null;
      if (redirectOrAlias) {
        throw ownershipFailure(
          'REDIRECT_OR_ALIAS_BLOCKS_STUB_WRITE',
          `stub write rejected because existing HTML is a ${redirectOrAlias.kind} (${redirectOrAlias.target})`,
          payload,
          relPagePath
        );
      }
      const explicitlyStubbed = hasRootWikiStubMarker(existingHtml);
      const hasOwnedRealContent = Boolean(
        markerCount(existingHtml, MANUAL_CONTENT_BEGIN) ||
        markerCount(existingHtml, CANONICAL_CONTENT_BEGIN)
      );
      if (payload.page_type !== 'stub' && payload.stub !== true) {
        throw ownershipFailure(
          'STUB_PAYLOAD_REQUIRED',
          'stub-allowed accepts only payloads explicitly marked with page_type: stub or stub: true',
          payload,
          relPagePath
        );
      }
      if (pageExists && (!explicitlyStubbed || hasOwnedRealContent)) {
        throw ownershipFailure(
          'REAL_PAGE_BLOCKS_STUB_WRITE',
          'stub creation is forbidden because a real canonical/manual page exists',
          payload,
          relPagePath
        );
      }
    }

    if (
      state.automation_policy === 'replace-sam-block' &&
      markerCount(existingHtml, SAM_CONTENT_BEGIN) !== 1
    ) {
      throw ownershipFailure(
        'SAM_BLOCK_REQUIRED_FOR_REPLACEMENT',
        'replace-sam-block requires exactly one existing SAM_CONTENT block; appending a first block is forbidden',
        payload,
        relPagePath
      );
    }

    const proposedContentHash = computeSamContentHash(payload);
    if (payload.content_hash && payload.content_hash !== proposedContentHash) {
      throw ownershipFailure(
        'PROPOSED_CONTENT_HASH_MISMATCH',
        `declared content_hash ${payload.content_hash} does not match proposed SAM content ${proposedContentHash}`,
        payload,
        relPagePath
      );
    }

    const existingSamContent = extractMarkedBlockInner(existingHtml, SAM_CONTENT_BEGIN, SAM_CONTENT_END);
    const stubHasUnownedContent =
      state.automation_policy === 'stub-allowed' &&
      hasUnownedVisibleArticleContent(existingHtml);
    const expectedGeneratedStubHtml = state.automation_policy === 'stub-allowed'
      ? renderPageFromTemplate(payload, rootDir, '')
      : '';
    const stubShellRequiresRepair =
      state.automation_policy === 'stub-allowed' &&
      (
        !hasHardenedStubShell(existingHtml) ||
        existingHtml !== expectedGeneratedStubHtml
      );
    if (
      existingSamContent &&
      !stubHasUnownedContent &&
      !stubShellRequiresRepair &&
      sha256Content(normalizeSamOwnedContent(existingSamContent)) === proposedContentHash
    ) {
      return {
        action: 'no-op',
        reason: 'same-sam-content-hash',
        payload,
        state,
        contentStateManifestIdentity: manifestIdentity,
        relPagePath,
        existingHtml,
        actualContentHash,
        proposedContentHash,
      };
    }

    if (payload.expected_content_hash && payload.expected_content_hash !== manifestContentHash) {
      throw ownershipFailure(
        'STALE_EXPECTED_CONTENT_HASH',
        `expected_content_hash ${payload.expected_content_hash} does not match manifest revision ${manifestContentHash}`,
        payload,
        relPagePath
      );
    }
    if (!payload.expected_content_hash && pageExists) {
      throw ownershipFailure(
        'MISSING_EXPECTED_CONTENT_HASH',
        'article prose writes require expected_content_hash from the repository content-state manifest',
        payload,
        relPagePath
      );
    }

    const html = state.automation_policy === 'replace-sam-block'
      ? replaceSamContentBlock(existingHtml, payload, relPagePath)
      : expectedGeneratedStubHtml;
    assertOwnershipMarkerStructure(html, relPagePath);
    return {
      action: 'write',
      payload,
      state,
      contentStateManifestIdentity: manifestIdentity,
      relPagePath,
      existingHtml,
      html,
      actualContentHash,
      proposedContentHash,
    };
  });
}

function runImportUnlocked({
  payloadDir = DEFAULT_PAYLOAD_DIR,
  rootDir = ROOT,
  write = false,
  logger = console.log,
  syncFeedSurfacesFn = syncFeedSurfaces,
  refreshContentStateFn = refreshContentStateArtifacts,
} = {}) {
  if (write) assertActiveTransactionBindingIdentity(rootDir);
  const existingDurableQuarantines = write
    ? inspectExistingDurableQuarantines(rootDir)
    : [];
  for (const quarantinePath of existingDurableQuarantines) {
    logger(`Existing durable publish quarantine requires manual review: ${quarantinePath}`);
  }
  const durableQuarantines = [];
  const loggedDurableQuarantines = new Set();
  const logDurableQuarantine = (record) => {
    if (loggedDurableQuarantines.has(record.quarantinePath)) return;
    const evidence = record.contentHash
      ? `; ${record.contentHash}; ${record.byteLength} bytes; mode ${record.mode}; ` +
        `dev ${record.fileIdentity?.dev}; ino ${record.fileIdentity?.ino}`
      : '';
    logger(
      `Durable quarantine [${record.phase}] ${record.sourcePath} -> ` +
      `${record.quarantinePath} (manual cleanup required${evidence})`
    );
    loggedDurableQuarantines.add(record.quarantinePath);
  };
  const logDurableQuarantines = () => {
    for (const record of durableQuarantines) logDurableQuarantine(record);
  };
  const validation = validatePayloadDirectory(payloadDir);
  if (validation.skipped) {
    logger(validation.message);
    return {
      ...validation,
      write,
      plannedPages: [],
      affectedSyncSurfaces: AFFECTED_SYNC_SURFACES,
      existingDurableQuarantines,
      durableQuarantines,
    };
  }

  logger(`Website publish payload importer running in ${write ? 'write' : 'dry-run'} mode.`);
  logger(`Affected sync surfaces: ${AFFECTED_SYNC_SURFACES.join(', ')}`);

  const plannedPages = [];
  const payloads = validation.payloads.map(({ payload }) => payload);
  const ownershipPlans = planContentOwnershipUpdates(payloads, rootDir);
  const renderedPages = ownershipPlans.filter(({ action }) => action === 'write');
  const syncPlans = ownershipPlans.filter(({ action }) => action !== 'no-op');
  const syncPayloads = syncPlans.map(({ payload }) => payload);

  for (const plan of ownershipPlans) {
    const { relPagePath } = plan;
    plannedPages.push(relPagePath);
    logger(`Intended page path: ${relPagePath} (${plan.action})`);
  }

  if (!write) {
    logger('Dry run only: no pages were written. Pass --write to render with the website template/shell.');
  }

  let sync = null;
  let contentStateRefresh = null;
  let absentStubAuthorizations = null;
  const attachDurableQuarantines = (error) => {
    if (error && durableQuarantines.length > 0) {
      error.durableQuarantines = durableQuarantines.map((record) => ({ ...record }));
    }
    return error;
  };
  if (write) assertLivePlanBases(rootDir, ownershipPlans);
  if (write && syncPlans.length > 0) {
    const createsAbsentStub = renderedPages.some(({ state }) => state.page_exists === false);
    const contentStateFiles = renderedPages.length > 0
      ? [CONTENT_STATE_MANIFEST_FILE, CONTENT_STATE_REPORT_FILE]
      : [];
    const stubAuthorizationFiles = createsAbsentStub ? [ABSENT_STUB_AUTHORIZATIONS_FILE] : [];
    const syncFiles = expectedSyncFiles(rootDir, syncPayloads);
    const touchedFiles = [
      ...renderedPages.map((page) => page.relPagePath),
      ...contentStateFiles,
      ...stubAuthorizationFiles,
      ...syncFiles,
    ];
    const snapshot = snapshotFiles(rootDir, touchedFiles);
    assertSnapshotPlanBases(snapshot, renderedPages);
    const mutatedFiles = new Set();
    const postimages = new Map();
    const previousWriteJournal = activeTransactionWriteJournal;
    activeTransactionWriteJournal = {
      rootPath: path.resolve(rootDir),
      expectedStates: new Map(snapshot),
      mutatedFiles,
      postimages,
      durableQuarantine: null,
      durableQuarantineSequence: 0,
      durableQuarantines,
      reportDurableQuarantine: logDurableQuarantine,
    };

    try {
      for (const page of renderedPages) {
        assertLivePlanBases(rootDir, [page]);
        assertOwnershipMarkerStructure(page.html, page.relPagePath);
        const pagePreimage = snapshot.get(page.relPagePath);
        writeWorkspaceFileConditionally(
          rootDir,
          page.relPagePath,
          page.html,
          pagePreimage
        );
        logger(`Wrote page: ${page.relPagePath}`);
      }
      if (renderedPages.length > 0) {
        // Declared outputs are conservative rollback candidates so concurrent
        // changes can be reported. Membership alone never authorizes restore:
        // restoreSnapshot requires an exact writer-journaled postimage.
        for (const relativePath of stubAuthorizationFiles) mutatedFiles.add(relativePath);
        absentStubAuthorizations = consumeAbsentStubAuthorizations(rootDir, renderedPages);
        for (const relativePath of contentStateFiles) mutatedFiles.add(relativePath);
        contentStateRefresh = refreshContentStateFn === refreshContentStateArtifacts
          ? refreshContentStateFn(rootDir, logger)
          : runIsolatedMutationCallback(
              rootDir,
              contentStateFiles,
              refreshContentStateFn,
              logger,
              'content-state refresh callback'
            );
        verifyRefreshedContentState(rootDir, renderedPages);
      }
      for (const relativePath of syncFiles) mutatedFiles.add(relativePath);
      sync = syncFeedSurfacesFn === syncFeedSurfaces
        ? syncFeedSurfacesFn(rootDir, syncPayloads, logger)
        : runIsolatedMutationCallback(
            rootDir,
            syncFiles,
            (isolatedRoot, isolatedLogger) => syncFeedSurfacesFn(
              isolatedRoot,
              syncPayloads,
              isolatedLogger
            ),
            logger,
            'feed sync callback'
          );
      // Root/lock identity is part of the commit condition. A callback that
      // renamed the repository or replaced the lock must enter rollback while
      // the original root descriptor and exact postimages are still live.
      assertActiveTransactionBindingIdentity(rootDir);
      // A root-level quarantine name is part of the recovery contract too.
      // Revalidate immediately before the synchronous transaction closes so
      // a renamed/replaced directory cannot be returned as a false path.
      assertTransactionDurableQuarantineIdentity('transaction close');
    } catch (error) {
      if (activeTransactionRootBinding) {
        activeTransactionRootBinding.allowDetachedRoot = true;
      }
      // Roll back only paths for which an importer-owned writer journaled an
      // exact intended postimage. A live read at this failure boundary cannot
      // prove ownership: it may be a concurrent policy revocation or edit.
      const conflicts = restoreSnapshot(rootDir, snapshot, mutatedFiles, postimages);
      logDurableQuarantines();
      if (conflicts.length > 0) {
        logger(`Write-mode rollback preserved ${conflicts.length} concurrently changed or unverifiable path(s).`);
        throw attachDurableQuarantines(rollbackConflictError(error, conflicts));
      }
      logger('Write-mode import rolled back because the publish transaction failed.');
      throw attachDurableQuarantines(error);
    } finally {
      const completedWriteJournal = activeTransactionWriteJournal;
      try {
        closeTransactionDurableQuarantine(completedWriteJournal);
      } finally {
        activeTransactionWriteJournal = previousWriteJournal;
      }
    }
    logDurableQuarantines();
  }

  return {
    ...validation,
    write,
    plannedPages,
    affectedSyncSurfaces: AFFECTED_SYNC_SURFACES,
    ownershipActions: ownershipPlans.map(({ action, reason, relPagePath }) => ({
      action,
      ...(reason ? { reason } : {}),
      path: relPagePath,
    })),
    contentStateRefresh,
    absentStubAuthorizations,
    existingDurableQuarantines,
    durableQuarantines,
    sync,
  };
}

export function runImport(options = {}) {
  if (!options.write) return runImportUnlocked(options);
  const rootDir = options.rootDir || ROOT;
  const lockHandle = acquirePublishTransactionLock(rootDir);
  const previousRootBinding = activeTransactionRootBinding;
  activeTransactionRootBinding = lockHandle;
  let result;
  let operationError = null;
  try {
    result = runImportUnlocked(options);
    assertActiveTransactionBindingIdentity(rootDir);
  } catch (error) {
    // `runImportUnlocked` may have completed and returned recovery records
    // before the final root/lock identity check failed. Keep those records on
    // every outward error so the retained inodes remain discoverable.
    if (
      !error?.durableQuarantines &&
      Array.isArray(result?.durableQuarantines) &&
      result.durableQuarantines.length > 0
    ) {
      error.durableQuarantines = result.durableQuarantines.map((record) => ({ ...record }));
    }
    operationError = error;
  }
  try {
    releasePublishTransactionLock(lockHandle);
  } catch (cleanupError) {
    activeTransactionRootBinding = previousRootBinding;
    if (!operationError) throw cleanupError;
    const combinedError = new ContentOwnershipError(
      'PUBLISH_TRANSACTION_LOCK_CLEANUP_FAILED',
      `${operationError.message}; additionally failed to release ${PUBLISH_TRANSACTION_LOCK}: ${cleanupError.message}`,
      { path: PUBLISH_TRANSACTION_LOCK }
    );
    combinedError.cause = operationError;
    combinedError.cleanupCause = cleanupError;
    if (Array.isArray(operationError.durableQuarantines)) {
      combinedError.durableQuarantines = operationError.durableQuarantines.map(
        (record) => ({ ...record })
      );
    }
    throw combinedError;
  }
  activeTransactionRootBinding = previousRootBinding;
  if (operationError) throw operationError;
  return result;
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
    if (error instanceof ContentOwnershipError) {
      console.error(`Website publish payload ownership check failed [${error.code}]:`);
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli();
}
