#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELATIONSHIP_HINTS_PATH = path.join('js', 'wiki-relationship-hints.json');
const BEGIN = '<!-- RELATED_WIKI_PATHS:BEGIN -->';
const END = '<!-- RELATED_WIKI_PATHS:END -->';
const CITATION_VOTE_BEGIN = '<!-- CITATION_VOTE_PANEL:BEGIN -->';
const CITATION_VOTE_END = '<!-- CITATION_VOTE_PANEL:END -->';
const GROUP_LIMIT = 8;
const TEMPLATE_LIMIT = 8;
const HINT_GROUP_TITLES = new Map([
  ['project_hubs', 'Core Project Links'],
  ['collections', 'Collection Links'],
  ['factions', 'Related Factions'],
  ['characters', 'Related Characters'],
  ['games', 'Related Games'],
  ['tokens', 'Related Tokens'],
  ['lore', 'Related Lore'],
  ['categories', 'Related Categories'],
  ['tags', 'Related Tags'],
]);

const STATIC_LINKS = new Set([
  '/timeline.html',
  '/graph.html?mode=hero',
  '/dashboard.html',
  '/community.html',
  '/games/index.html',
  '/games/leaderboard.html',
]);

const CATEGORY_TITLES = new Map([
  ['/categories/community-people.html', 'Community & People'],
  ['/categories/nfts.html', 'NFTs'],
  ['/categories/wax-nfts.html', 'WAX NFTs'],
  ['/categories/nfts-digital-art.html', 'NFTs & Digital Art'],
  ['/categories/lore.html', 'Lore'],
  ['/categories/gaming.html', 'Gaming'],
  ['/categories/technology.html', 'Web3 / Technology'],
  ['/categories/gkniftyheads.html', 'GKniftyHEADS'],
  ['/categories/graffiti-street-art.html', 'Graffiti / Street Art'],
  ['/categories/cryptocurrencies.html', 'Tokens / Crypto'],
  ['/categories/factions.html', 'Factions'],
]);

const CORE_PROJECT_URL = '/wiki/crypto-moonboys.html';
const GKNIFTY_COLLECTION_URL = '/wiki/gkniftyheads-nft-collection.html';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonObject(file) {
  if (!fs.existsSync(file)) return {};
  const parsed = readJson(file);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanTitle(value, fallback = '') {
  return String(value || fallback || '')
    .replace(/\s+-\s+Crypto Moonboys Wiki$/i, '')
    .replace(/\s+—\s+Crypto Moonboys Wiki$/i, '')
    .replace(/\s+â€”\s+Crypto Moonboys Wiki$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function cleanDescription(value) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 150 ? `${text.slice(0, 147).trim()}...` : text;
}

function titleCaseSlug(slug) {
  return String(slug || '')
    .replace(/\.html$/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function htmlFileForUrl(url) {
  const normalized = String(url || '').split('?')[0];
  if (!normalized.startsWith('/wiki/')) return null;
  return path.join(ROOT, normalized.replace(/^\/+/, ''));
}

function relForUrl(url) {
  return String(url || '').replace(/^\/+/, '');
}

function existsInternal(url, root = ROOT) {
  const clean = String(url || '').split('#')[0];
  if (STATIC_LINKS.has(clean)) return fs.existsSync(path.join(root, clean.split('?')[0].replace(/^\/+/, '')));
  if (!clean.startsWith('/')) return false;
  return fs.existsSync(path.join(root, clean.split('?')[0].replace(/^\/+/, '')));
}

function hrefs(html) {
  return [...String(html || '').matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHintUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('//')) return '';
  const clean = raw.split('#')[0].split('?')[0].replace(/\\/g, '/');
  let normalized = clean.startsWith('/') ? clean : `/wiki/${clean}`;
  normalized = normalized.replace(/\/+/g, '/');
  if (/^\/(wiki|categories)\//i.test(normalized) && !/\.html$/i.test(normalized)) {
    normalized = `${normalized.replace(/\/$/, '')}.html`;
  }
  return normalized.replace(/\.html(?:\.html)+$/i, '.html');
}

function normalizePageUrl(value) {
  const normalized = normalizeHintUrl(value);
  if (!normalized.startsWith('/wiki/')) return '';
  return normalized;
}

function normalizeCategoryUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('//')) return '';
  if (raw.startsWith('/categories/')) return normalizeHintUrl(raw);
  return `/categories/${slugify(raw)}.html`;
}

function isNftCollectionHtml(html) {
  return /data-page-type=["']nft_collection["']/i.test(html);
}

function isNftTemplatePage(fileName, html) {
  if (isNftCollectionHtml(html)) return false;
  return /data-page-type=["']nft_template["']/i.test(html) ||
    /class=["'][^"']*\bnft-template-article\b/i.test(html) ||
    /^gkniftyheads-.+-\d{5,}\.html$/i.test(fileName);
}

function isContentPage(html) {
  if (/\bdata-wiki-stub=["']true["']/i.test(html)) return false;
  if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(html)) return false;
  if (/<meta\b(?=[^>]*name=["']robots["'])(?=[^>]*content=["'][^"']*\bnoindex\b)[^>]*>/i.test(html)) return false;
  return /<article\b/i.test(html) || /class=["'][^"']*\bwiki-content\b/i.test(html) || /data-page-type=["']nft_/i.test(html);
}

function extractCollection(html, url) {
  const explicit = html.match(/\bdata-collection=["']([^"']+)["']/i)?.[1];
  if (explicit) return explicit.toLowerCase();
  const slug = path.basename(String(url || ''), '.html').toLowerCase();
  if (slug.startsWith('gkniftyheads-')) return 'gkniftyheads';
  return '';
}

function rankCategory(entry) {
  return String(entry?.category || entry?.rank_signals?.category || entry?.cat || entry?.rank || '').trim().toLowerCase();
}

function entryTags(entry) {
  const tags = new Set();
  for (const tag of entry?.tags || []) tags.add(String(tag).toLowerCase());
  for (const tag of entry?.search_index?.tokens || []) tags.add(String(tag).toLowerCase());
  return tags;
}

function isNftTemplateUrl(url) {
  return /^\/wiki\/gkniftyheads-.+-\d{5,}\.html$/i.test(String(url || ''));
}

function tokenize(value) {
  const stop = new Set([
    'and', 'the', 'with', 'from', 'this', 'that', 'template', 'gkniftyheads',
    'nfts', 'wax', 'wiki', 'crypto', 'moonboys', 'description', 'name', 'id',
    'rarity', 'variation', 'collection', 'member', 'card',
  ]);
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !stop.has(token));
}

function extractNftSearchTerms(html) {
  const terms = [];
  for (const match of String(html || '').matchAll(/<script\b(?=[^>]*class=["'][^"']*\bnft-search-terms\b)[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) terms.push(...parsed.map(String));
    } catch {
      // Ignore malformed generated search hints; the visible page metadata still provides fallback tokens.
    }
  }
  for (const match of String(html || '').matchAll(/<tr>\s*<th>(rarity|variation|schema|type|name)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    terms.push(match[1], match[2]);
  }
  const title = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
  if (title) terms.push(title);
  return terms;
}

function nftProfile(context, url) {
  if (!context.nftProfiles) context.nftProfiles = new Map();
  if (context.nftProfiles.has(url)) return context.nftProfiles.get(url);

  const html = context.htmlByUrl.get(url) || '';
  const entry = context.byUrl.get(url) || {};
  const tokens = new Set();
  for (const tag of entryTags(entry)) for (const token of tokenize(tag)) tokens.add(token);
  for (const term of extractNftSearchTerms(html)) for (const token of tokenize(term)) tokens.add(token);
  for (const token of tokenize(path.basename(url, '.html'))) tokens.add(token);

  const profile = {
    collection: extractCollection(html, url),
    tokens,
    rankScore: Number(entry.rank_score || 0),
    title: cleanTitle(entry.title, titleCaseSlug(path.basename(url, '.html'))),
  };
  context.nftProfiles.set(url, profile);
  return profile;
}

function nftSimilarityScore(context, currentUrl, candidateUrl) {
  const current = nftProfile(context, currentUrl);
  const candidate = nftProfile(context, candidateUrl);
  if (!current.collection || current.collection !== candidate.collection) return -1;
  let score = 0;
  for (const token of current.tokens) {
    if (!candidate.tokens.has(token)) continue;
    score += ['shadow', 'fury', 'sentinel', 'shifter', 'graffiti', 'kings', 'hodlwars', 'game', 'p2e'].includes(token) ? 4 : 1;
  }
  return score;
}

function rankedNftSiblingLinks(context, currentUrl, candidates) {
  const ranked = candidates
    .filter((entry) => entry?.url && entry.url !== currentUrl && isNftTemplateUrl(entry.url))
    .map((entry) => ({
      entry,
      score: nftSimilarityScore(context, currentUrl, entry.url),
      profile: nftProfile(context, entry.url),
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.profile.rankScore !== a.profile.rankScore) return b.profile.rankScore - a.profile.rankScore;
      return a.profile.title.localeCompare(b.profile.title);
    });

  return ranked
    .slice(0, TEMPLATE_LIMIT)
    .map(({ entry, score }) => linkFromEntry(
      entry,
      score > 0 ? 'Sibling NFT template with shared collection traits and metadata.' : 'Capped fallback from the same NFT collection.',
      context.root
    ));
}

function dedupeGroups(groups, currentUrl, root = ROOT) {
  const seen = new Set([currentUrl]);
  return groups
    .map((group) => {
      const links = [];
      for (const link of group.links || []) {
        if (!link?.url || seen.has(link.url) || !existsInternal(link.url, root)) continue;
        seen.add(link.url);
        links.push(link);
        if (links.length >= GROUP_LIMIT) break;
      }
      return { ...group, links };
    })
    .filter((group) => group.links.length);
}

function makeLink(url, title, description = '', root = ROOT) {
  if (!existsInternal(url, root)) return null;
  return {
    url,
    title: cleanTitle(title, titleCaseSlug(path.basename(url.split('?')[0], '.html'))),
    description: cleanDescription(description),
  };
}

function linkFromEntry(entry, fallbackDescription = '', root = ROOT) {
  if (!entry?.url) return null;
  return makeLink(entry.url, entry.title, entry.desc || fallbackDescription, root);
}

function uniqueLinks(links, currentUrl, limit = GROUP_LIMIT, root = ROOT) {
  const seen = new Set();
  const out = [];
  for (const link of links) {
    if (!link || !link.url || link.url === currentUrl || seen.has(link.url)) continue;
    if (!existsInternal(link.url, root)) continue;
    seen.add(link.url);
    out.push(link);
    if (out.length >= limit) break;
  }
  return out;
}

function categoryLink(url, description = '', root = ROOT) {
  const title = CATEGORY_TITLES.get(url) || titleCaseSlug(path.basename(url, '.html'));
  return makeLink(url, title, description, root);
}

function hintCandidateUrls(group, hint) {
  const candidates = [];
  if (hint.url || hint.href || hint.path) candidates.push(normalizeHintUrl(hint.url || hint.href || hint.path));
  if (hint.slug) candidates.push(normalizePageUrl(hint.slug));

  const nameSlug = slugify(hint.name || hint.title || hint.label);
  const slug = slugify(hint.slug);
  const bestSlug = slug || nameSlug;
  if (bestSlug) {
    if (group === 'categories' || group === 'tags') candidates.push(`/categories/${bestSlug}.html`);
    candidates.push(`/wiki/${bestSlug}.html`);
  }

  return [...new Set(candidates.filter(Boolean).map((url) => url.replace(/\.html(?:\.html)+$/i, '.html')))];
}

function linkFromHint(context, group, hint) {
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return null;
  const candidates = group === 'categories' || group === 'tags'
    ? [normalizeCategoryUrl(hint.url || hint.href || hint.path || hint.slug || hint.name || hint.title || hint.label), ...hintCandidateUrls(group, hint)]
    : hintCandidateUrls(group, hint);

  for (const url of candidates) {
    if (!url || !existsInternal(url, context.root)) continue;
    const entry = context.byUrl.get(url);
    const title = hint.title || hint.name || hint.label || entry?.title || CATEGORY_TITLES.get(url) || titleCaseSlug(path.basename(url, '.html'));
    const description = hint.description || hint.relationship || entry?.desc || '';
    return makeLink(url, title, description, context.root);
  }
  return null;
}

function explicitHintGroups(context, currentUrl) {
  const record = context.relationshipHints[currentUrl] || context.relationshipHints[currentUrl.replace(/^\/wiki\//, '').replace(/\.html$/, '')];
  const hints = record?.relationship_hints || record;
  if (!hints || typeof hints !== 'object' || Array.isArray(hints)) return [];

  const groups = [];
  const globalSeen = new Set([currentUrl]);
  for (const [group, title] of HINT_GROUP_TITLES.entries()) {
    const items = hints[group];
    if (!Array.isArray(items)) continue;

    const links = [];
    const localSeen = new Set();
    for (const item of items) {
      const link = linkFromHint(context, group, item);
      if (!link || globalSeen.has(link.url) || localSeen.has(link.url)) continue;
      if (/\.html\.html(?:$|[?#])/i.test(link.url)) continue;
      localSeen.add(link.url);
      globalSeen.add(link.url);
      links.push(link);
      if (links.length >= GROUP_LIMIT) break;
    }

    if (links.length) groups.push({ title, links });
  }
  return groups;
}

function groupKind(title) {
  if (/^Related Categories$/i.test(title)) return 'categories';
  if (/^More from /i.test(title) || /^Related NFT Templates$/i.test(title)) return 'nft-siblings';
  return 'context';
}

function renderGroup(title, links) {
  if (!links.length) return '';
  const kind = groupKind(title);
  const groupClass = `wiki-rabbit-group wiki-rabbit-group--${kind}`;
  const listClass = kind === 'categories' ? 'wiki-rabbit-chip-grid' : 'wiki-rabbit-grid';
  const items = links.map((link) => {
    if (kind === 'categories') {
      return `            <a class="wiki-rabbit-chip" href="${escapeHtml(link.url)}" role="listitem">${escapeHtml(link.title)}</a>`;
    }
    const desc = link.description
      ? `<span class="wiki-rabbit-card-desc">${escapeHtml(link.description)}</span>`
      : '';
    const cardClass = kind === 'nft-siblings' ? 'wiki-rabbit-card wiki-rabbit-card--nft-sibling' : 'wiki-rabbit-card';
    return `            <a class="${cardClass}" href="${escapeHtml(link.url)}" role="listitem">
              <span class="wiki-rabbit-card-title">${escapeHtml(link.title)}</span>
              ${desc}
            </a>`;
  }).join('\n');
  if (kind === 'nft-siblings') {
    return `        <details class="${groupClass}" data-related-group="${escapeHtml(title)}">
          <summary>${escapeHtml(title)}</summary>
          <div class="${listClass}" role="list">
${items}
          </div>
        </details>`;
  }
  return `        <div class="${groupClass}" data-related-group="${escapeHtml(title)}">
          <h3>${escapeHtml(title)}</h3>
          <div class="${listClass}" role="list">
${items}
          </div>
        </div>`;
}

function renderRelatedSection(groups) {
  const renderedGroups = groups
    .filter((group) => group.links.length)
    .map((group) => renderGroup(group.title, group.links))
    .join('\n');

  return `${BEGIN}
      <section class="wiki-section related-wiki-paths" data-related-wiki-paths="true" aria-labelledby="related-wiki-paths-title">
        <h2 id="related-wiki-paths-title">Related Wiki Paths</h2>
        <p class="lore-paragraph">Follow these internal paths into connected pages, categories, collections, games, lore, and site maps.</p>
${renderedGroups}
      </section>
${END}`;
}

function replaceMarkedSection(html, section) {
  const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (re.test(html)) return html.replace(re, section);
  return null;
}

function removeMarkedSection(html) {
  const re = new RegExp(`\\s*${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return html.replace(re, '');
}

function removeCitationVotePanel(html) {
  const re = new RegExp(`\\s*${CITATION_VOTE_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${CITATION_VOTE_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return html.replace(re, '');
}

function insertSection(html, section) {
  html = removeMarkedSection(html);

  const articleEnd = html.match(/\s*<\/article>/i);
  if (articleEnd) {
    const insertAt = articleEnd.index + articleEnd[0].length;
    return `${html.slice(0, insertAt)}\n${section}\n${html.slice(insertAt)}`;
  }

  const categoryIndex = html.search(/\s*<div class=["'][^"']*\bcategory-tags\b/i);
  if (categoryIndex !== -1) {
    return `${html.slice(0, categoryIndex)}\n${section}\n${html.slice(categoryIndex)}`;
  }

  const commentsIndex = html.search(/\s*<div class=["'][^"']*\bwiki-comments\b/i);
  if (commentsIndex !== -1) {
    return `${html.slice(0, commentsIndex)}\n${section}\n${html.slice(commentsIndex)}`;
  }

  const mainEnd = html.search(/\s*<\/main>/i);
  if (mainEnd !== -1) return `${html.slice(0, mainEnd)}\n${section}\n${html.slice(mainEnd)}`;

  const samEnd = html.indexOf('<!-- SAM:END:article -->');
  if (samEnd !== -1) return `${html.slice(0, samEnd)}${section}\n${html.slice(samEnd)}`;
  return html;
}

function updateCryptoMoonboysCategoryTags(html) {
  const categoryTags = `      <div class="category-tags" aria-label="Article categories">
        <span class="cat-label">Categories:</span>
        <a href="/categories/community-people.html">Community &amp; People</a>
        <a href="/wiki/crypto-moonboys.html">Crypto Moonboys</a>
        <a href="/categories/nfts.html">NFTs</a>
        <a href="/categories/wax-nfts.html">WAX NFTs</a>
        <a href="/categories/nfts-digital-art.html">NFTs &amp; Digital Art</a>
        <a href="/categories/lore.html">Lore</a>
        <a href="/categories/gaming.html">Gaming</a>
        <a href="/categories/technology.html">Web3</a>
        <a href="/categories/gkniftyheads.html">GKniftyHEADS</a>
      </div>`;
  return html.replace(
    /\s*<div class=["']category-tags["'] aria-label=["']Article categories["']>[\s\S]*?<\/div>/,
    `\n${categoryTags}`
  );
}

function pageIdFromUrl(url) {
  return path.basename(String(url || '').split('?')[0], '.html');
}

function countSourceItems(html) {
  const listMatches = String(html || '').matchAll(/<ul\b[^>]*class=["'][^"']*\b(?:citations-list|source-ref-list|sources-list)\b[^"']*["'][\s\S]*?<\/ul>/gi);
  let count = 0;
  for (const match of listMatches) count += (match[0].match(/<li\b/gi) || []).length;
  return count;
}

function hasCitationSources(html) {
  return countSourceItems(html) > 0 ||
    /<section\b[^>]*class=["'][^"']*\bcitations-section\b/i.test(html) ||
    /<h2\b[^>]*>\s*(?:Sources|Citations|Source References)\s*<\/h2>/i.test(html);
}

function renderCitationVotePanel(url, html) {
  const pageId = pageIdFromUrl(url);
  const sourceCount = countSourceItems(html);
  const countText = sourceCount ? `<span class="citation-vote-count">${sourceCount} source${sourceCount === 1 ? '' : 's'} found on this page.</span>` : '';
  return `${CITATION_VOTE_BEGIN}
      <section class="wiki-section citation-vote-panel" data-citation-vote-panel="true" data-page-id="${escapeHtml(pageId)}" aria-labelledby="citation-vote-panel-title">
        <h2 id="citation-vote-panel-title">Citation Credibility</h2>
        <p>Vote on citations to strengthen the credibility of this intelligence file.</p>
        <div class="citation-vote-panel-actions">
          <span class="cite-vote" data-page-id="${escapeHtml(pageId)}" data-cite-id="citation-panel"></span>
          <span class="citation-vote-login-prompt">Connect/login to vote when citation voting is available.</span>
          ${countText}
        </div>
      </section>
${CITATION_VOTE_END}`;
}

function insertGeneratedBlock(html, block) {
  const commentsIndex = html.search(/\s*<div class=["'][^"']*\bwiki-comments\b/i);
  if (commentsIndex !== -1) return `${html.slice(0, commentsIndex)}\n${block}\n${html.slice(commentsIndex)}`;

  const mainEnd = html.search(/\s*<\/main>/i);
  if (mainEnd !== -1) return `${html.slice(0, mainEnd)}\n${block}\n${html.slice(mainEnd)}`;

  return html;
}

function upsertCitationVotePanel(html, url) {
  const withoutPanel = removeCitationVotePanel(html);
  if (!hasCitationSources(withoutPanel)) return withoutPanel;
  return insertGeneratedBlock(withoutPanel, renderCitationVotePanel(url, withoutPanel));
}

function categoryTitle(url) {
  return CATEGORY_TITLES.get(url) || titleCaseSlug(path.basename(String(url || ''), '.html'));
}

function renderCategoryAnchor(url) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(categoryTitle(url))}</a>`;
}

function categoryUrlsForPage(context, currentUrl, html, kind) {
  const urls = [];
  const add = (url) => {
    if (url && existsInternal(url, context.root) && !urls.includes(url)) urls.push(url);
  };

  const entry = context.byUrl.get(currentUrl);
  const category = rankCategory(entry);
  if (category) add(`/categories/${category}.html`);

  const section = renderRelatedSection(groupsForPage(context, currentUrl, html, kind));
  for (const href of hrefs(section)) {
    if (href.startsWith('/categories/')) add(href);
  }

  if (currentUrl === CORE_PROJECT_URL) {
    for (const url of [
      '/categories/community-people.html',
      '/categories/nfts.html',
      '/categories/wax-nfts.html',
      '/categories/nfts-digital-art.html',
      '/categories/lore.html',
      '/categories/gaming.html',
      '/categories/technology.html',
      '/categories/gkniftyheads.html',
      '/categories/factions.html',
      '/categories/cryptocurrencies.html',
    ]) add(url);
  }

  if (kind?.isNftTemplate || kind?.isNftCollection) {
    for (const url of [
      '/categories/nfts.html',
      '/categories/wax-nfts.html',
      '/categories/nfts-digital-art.html',
      '/categories/gkniftyheads.html',
    ]) add(url);
  }

  return urls.slice(0, GROUP_LIMIT + 4);
}

function upsertCategoryTags(html, context, currentUrl, kind) {
  const urls = categoryUrlsForPage(context, currentUrl, html, kind);
  if (!urls.length) return html;

  const existing = html.match(/<div\b[^>]*class=["'][^"']*\bcategory-tags\b[^"']*["'][\s\S]*?<\/div>/i);
  if (existing) {
    let block = existing[0];
    const existingHrefs = new Set(hrefs(block));
    const missing = urls.filter((url) => !existingHrefs.has(url));
    if (!missing.length) return html;
    const inserted = `${missing.map(renderCategoryAnchor).join('\n        ')}
      </div>`;
    block = block.replace(/\s*<\/div>\s*$/i, `\n        ${inserted}`);
    return `${html.slice(0, existing.index)}${block}${html.slice(existing.index + existing[0].length)}`;
  }

  const block = `      <div class="category-tags generated-category-tags" aria-label="Article categories" data-generated-category-tags="true">
        <span class="cat-label">Categories:</span>
        ${urls.map(renderCategoryAnchor).join('\n        ')}
      </div>`;
  return insertGeneratedBlock(html, block);
}

function buildContext(root) {
  const wikiDir = path.join(root, 'wiki');
  const wikiIndexPath = path.join(root, 'js', 'wiki-index.json');
  const wikiIndex = readJson(wikiIndexPath);
  const entries = Array.isArray(wikiIndex) ? wikiIndex : [];
  const byUrl = new Map(entries.filter((entry) => entry?.url).map((entry) => [entry.url, entry]));
  const wikiFiles = fs.readdirSync(wikiDir).filter((file) => file.endsWith('.html') && file !== 'index.html').sort();
  const htmlByUrl = new Map();
  const pageKinds = new Map();
  const relationshipHints = readJsonObject(path.join(root, RELATIONSHIP_HINTS_PATH));

  for (const file of wikiFiles) {
    const url = `/wiki/${file}`;
    const html = fs.readFileSync(path.join(wikiDir, file), 'utf8');
    htmlByUrl.set(url, html);
    pageKinds.set(url, {
      file,
      isNftTemplate: isNftTemplatePage(file, html),
      isNftCollection: isNftCollectionHtml(html),
      collection: extractCollection(html, url),
    });
  }

  const gkniftyTemplates = entries
    .filter((entry) => /^\/wiki\/gkniftyheads-.+-\d{5,}\.html$/i.test(entry.url || ''))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

  return { root, entries, byUrl, htmlByUrl, pageKinds, gkniftyTemplates, relationshipHints, nftProfiles: new Map() };
}

function knownPage(context, url, title, description = '') {
  const entry = context.byUrl.get(url);
  if (entry && description) return makeLink(url, title || entry.title, description, context.root);
  return linkFromEntry(entry, description, context.root) || makeLink(url, title, description, context.root);
}

function cryptoMoonboysGroups(context, currentUrl) {
  const majorPages = [
    knownPage(context, '/wiki/gkniftyheads.html', 'GKniftyHEADS', 'Parent brand and faction hub connected to the project.'),
    knownPage(context, GKNIFTY_COLLECTION_URL, 'GKniftyHEADS NFT Collection', 'Generated collection index for WAX AtomicAssets template pages.'),
    knownPage(context, '/wiki/graffpunks.html', 'GraffPUNKS', 'Related street-art and faction context.'),
    knownPage(context, '/wiki/hodl-wars.html', 'HODL WARS', 'Game and lore context connected to the project.'),
    knownPage(context, '/wiki/hodl-warriors.html', 'HODL Warriors', 'Related character and faction page.'),
    knownPage(context, '/wiki/block-topia.html', 'Block Topia', 'Connected game/world page where present in the wiki.'),
    knownPage(context, '/wiki/crypto-moongirls.html', 'Crypto Moongirls', ''),
  ];

  const categories = [
    categoryLink('/categories/nfts.html', 'NFT category hub.', context.root),
    categoryLink('/categories/wax-nfts.html', 'WAX NFT category hub.', context.root),
    categoryLink('/categories/nfts-digital-art.html', 'NFT and digital art category hub.', context.root),
    categoryLink('/categories/lore.html', 'Lore category hub.', context.root),
    categoryLink('/categories/gaming.html', 'Gaming category hub.', context.root),
    categoryLink('/categories/technology.html', 'Web3 and technology category hub.', context.root),
    categoryLink('/categories/gkniftyheads.html', 'GKniftyHEADS category hub.', context.root),
    categoryLink('/categories/graffiti-street-art.html', 'Graffiti and street-art category hub.', context.root),
  ];

  const games = [
    makeLink('/community.html', 'Battle Chamber', 'Live community and faction activity page.', context.root),
    makeLink('/games/index.html', 'Games', 'Game hub for playable Crypto Moonboys experiences.', context.root),
    makeLink('/games/leaderboard.html', 'Leaderboard', 'Game leaderboard and live/action surface.', context.root),
    knownPage(context, '/wiki/gang-signs-card-game.html', 'Gang Signs Card Game', ''),
    knownPage(context, '/wiki/metaverse-battles.html', 'Metaverse Battles', ''),
  ];

  const tokens = [
    knownPage(context, '/wiki/punk-token.html', 'PUNK Token', ''),
    knownPage(context, '/wiki/waxp.html', '$WAXP', ''),
    knownPage(context, '/wiki/wax-blockchain.html', 'WAX Blockchain', ''),
    knownPage(context, '/wiki/xrp-ledger.html', 'XRP Ledger', ''),
  ];

  const templates = context.gkniftyTemplates.slice(0, TEMPLATE_LIMIT).map((entry) => linkFromEntry(entry, 'GKniftyHEADS WAX NFT template page.', context.root));

  return [
    { title: 'Core Project Links', links: uniqueLinks(majorPages, currentUrl, GROUP_LIMIT, context.root) },
    { title: 'Related Categories', links: uniqueLinks(categories, currentUrl, GROUP_LIMIT, context.root) },
    { title: 'Related Games', links: uniqueLinks(games, currentUrl, GROUP_LIMIT, context.root) },
    { title: 'Related Tokens', links: uniqueLinks(tokens, currentUrl, GROUP_LIMIT, context.root) },
    { title: 'Related NFT Templates', links: uniqueLinks(templates, currentUrl, TEMPLATE_LIMIT, context.root) },
    {
      title: 'Timeline / Graph / Dashboard Links',
      links: uniqueLinks([
        makeLink('/timeline.html', 'Timeline', 'Chronological route through project and lore entries.', context.root),
        makeLink('/graph.html?mode=hero', 'Graph', 'Visual relationship map for wiki entities.', context.root),
        makeLink('/dashboard.html', 'Dashboard', 'Site-wide wiki and project metrics.', context.root),
      ], currentUrl, GROUP_LIMIT, context.root),
    },
  ];
}

function nftTemplateGroups(context, currentUrl, html) {
  const collection = extractCollection(html, currentUrl);
  const collectionTemplates = collection === 'gkniftyheads' ? context.gkniftyTemplates : [];
  const relatedFromCollection = rankedNftSiblingLinks(context, currentUrl, collectionTemplates);

  const loreLinks = [];
  const text = html.toLowerCase();
  if (text.includes('graffpunks')) loreLinks.push(knownPage(context, '/wiki/graffpunks.html', 'GraffPUNKS', 'Related faction and lore context.'));
  if (text.includes('hodl wars') || text.includes('hodl_wars')) loreLinks.push(knownPage(context, '/wiki/hodl-wars.html', 'HODL WARS', 'Related game and lore context.'));
  if (text.includes('graffiti kings')) loreLinks.push(knownPage(context, '/wiki/graffiti-kings.html', 'Graffiti Kings', 'Related street-art context.'));
  if (text.includes('block topia')) loreLinks.push(knownPage(context, '/wiki/block-topia.html', 'Block Topia', 'Related game/world context.'));

  return [
    {
      title: 'Collection Links',
      links: uniqueLinks([
        knownPage(context, GKNIFTY_COLLECTION_URL, 'GKniftyHEADS NFT Collection', 'Full collection index for WAX AtomicAssets template pages.'),
        knownPage(context, '/wiki/gkniftyheads.html', 'GKniftyHEADS', 'Parent brand and faction hub.'),
        knownPage(context, CORE_PROJECT_URL, 'Crypto Moonboys', 'Core project hub for the wider wiki.'),
      ], currentUrl, GROUP_LIMIT, context.root),
    },
    {
      title: 'Related Categories',
      links: uniqueLinks([
        categoryLink('/categories/gkniftyheads.html', 'GKniftyHEADS category hub.', context.root),
        categoryLink('/categories/nfts.html', 'NFT category hub.', context.root),
        categoryLink('/categories/wax-nfts.html', 'WAX NFT category hub.', context.root),
        categoryLink('/categories/nfts-digital-art.html', 'NFT and digital art category hub.', context.root),
      ], currentUrl, GROUP_LIMIT, context.root),
    },
    { title: 'Character / Faction / Game Links', links: uniqueLinks(loreLinks, currentUrl, GROUP_LIMIT, context.root) },
    { title: collection === 'gkniftyheads' ? 'More from GKniftyHEADS' : 'More from this collection', links: uniqueLinks(relatedFromCollection, currentUrl, TEMPLATE_LIMIT, context.root) },
    {
      title: 'Timeline / Graph Links',
      links: uniqueLinks([
        makeLink('/timeline.html', 'Timeline', 'Chronological route through related wiki entries.', context.root),
        makeLink('/graph.html?mode=hero', 'Graph', 'Visual relationship map for wiki entities.', context.root),
      ], currentUrl, GROUP_LIMIT, context.root),
    },
  ];
}

function genericGroups(context, currentUrl) {
  const entry = context.byUrl.get(currentUrl);
  const category = rankCategory(entry);
  const tags = entryTags(entry);

  const sameCategory = context.entries
    .filter((candidate) => candidate.url !== currentUrl && rankCategory(candidate) === category)
    .sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0))
    .slice(0, GROUP_LIMIT)
    .map((candidate) => linkFromEntry(candidate, 'Related page in the same wiki category.', context.root));

  const tagRelated = context.entries
    .filter((candidate) => {
      if (candidate.url === currentUrl) return false;
      const candidateTags = entryTags(candidate);
      return [...tags].some((tag) => candidateTags.has(tag) && !['crypto', 'moonboys', 'wiki'].includes(tag));
    })
    .sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0))
    .slice(0, GROUP_LIMIT)
    .map((candidate) => linkFromEntry(candidate, 'Related page matched by existing wiki metadata.', context.root));

  const categoryUrl = category ? `/categories/${category}.html` : '';
  return [
    {
      title: 'Core Project Links',
      links: uniqueLinks([
        knownPage(context, CORE_PROJECT_URL, 'Crypto Moonboys', 'Core project hub for the wider wiki.'),
        makeLink('/timeline.html', 'Timeline', 'Chronological route through wiki entries.', context.root),
        makeLink('/graph.html?mode=hero', 'Graph', 'Visual relationship map for wiki entities.', context.root),
      ], currentUrl, GROUP_LIMIT, context.root),
    },
    { title: 'Related Categories', links: uniqueLinks([categoryLink(categoryUrl, 'Category hub for this page.', context.root)], currentUrl, GROUP_LIMIT, context.root) },
    { title: 'Related Wiki Pages', links: uniqueLinks([...tagRelated, ...sameCategory], currentUrl, GROUP_LIMIT, context.root) },
  ];
}

function groupsForPage(context, currentUrl, html, kind) {
  const hintGroups = explicitHintGroups(context, currentUrl);
  let fallbackGroups;
  if (currentUrl === CORE_PROJECT_URL) fallbackGroups = cryptoMoonboysGroups(context, currentUrl);
  else if (kind.isNftTemplate) fallbackGroups = nftTemplateGroups(context, currentUrl, html);
  else if (kind.isNftCollection) {
    fallbackGroups = [
      {
        title: 'Collection Links',
        links: uniqueLinks([
          knownPage(context, '/wiki/gkniftyheads.html', 'GKniftyHEADS', 'Parent brand and faction hub.'),
          knownPage(context, CORE_PROJECT_URL, 'Crypto Moonboys', 'Core project hub for the wider wiki.'),
        ], currentUrl, GROUP_LIMIT, context.root),
      },
      {
        title: 'Related Categories',
        links: uniqueLinks([
          categoryLink('/categories/gkniftyheads.html', 'GKniftyHEADS category hub.', context.root),
          categoryLink('/categories/nfts.html', 'NFT category hub.', context.root),
          categoryLink('/categories/wax-nfts.html', 'WAX NFT category hub.', context.root),
          categoryLink('/categories/nfts-digital-art.html', 'NFT and digital art category hub.', context.root),
        ], currentUrl, GROUP_LIMIT, context.root),
      },
      { title: 'Related NFT Templates', links: uniqueLinks(context.gkniftyTemplates.slice(0, TEMPLATE_LIMIT).map((entry) => linkFromEntry(entry, 'Featured child template page.', context.root)), currentUrl, TEMPLATE_LIMIT, context.root) },
    ];
  } else {
    fallbackGroups = genericGroups(context, currentUrl);
  }

  if (kind.isNftTemplate) {
    const contextualHintGroups = hintGroups
      .map((group) => ({
        ...group,
        links: group.links.filter((link) => !isNftTemplateUrl(link.url)),
      }))
      .filter((group) => group.links.length);
    const contextualFallback = fallbackGroups
      .filter((group) => !/^More from /i.test(group.title))
      .map((group) => ({
        ...group,
        links: group.links.filter((link) => !isNftTemplateUrl(link.url)),
      }))
      .filter((group) => group.links.length);
    const siblingGroup = fallbackGroups.find((group) => /^More from /i.test(group.title));
    return dedupeGroups([...contextualHintGroups, ...contextualFallback, siblingGroup].filter(Boolean), currentUrl, context.root);
  }

  if (!hintGroups.length) return fallbackGroups;
  const hintedUrls = new Set(hintGroups.flatMap((group) => group.links.map((link) => link.url)));
  const dedupedFallback = fallbackGroups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => !hintedUrls.has(link.url)),
    }))
    .filter((group) => group.links.length);
  return [...hintGroups, ...dedupedFallback];
}

export function runGenerateRelatedWikiPaths(root = ROOT) {
  const context = buildContext(root);
  let written = 0;

  for (const [url, html] of context.htmlByUrl.entries()) {
    const kind = context.pageKinds.get(url);
    if (!isContentPage(html)) {
      const nextHtml = removeCitationVotePanel(removeMarkedSection(html));
      if (nextHtml !== html) {
        fs.writeFileSync(path.join(root, relForUrl(url)), nextHtml, 'utf8');
        written += 1;
      }
      continue;
    }
    const groups = groupsForPage(context, url, html, kind);
    const section = renderRelatedSection(groups);
    let nextHtml = insertSection(html, section);
    if (url === CORE_PROJECT_URL) nextHtml = updateCryptoMoonboysCategoryTags(nextHtml);
    nextHtml = upsertCategoryTags(nextHtml, context, url, kind);
    nextHtml = upsertCitationVotePanel(nextHtml, url);

    if (nextHtml !== html) {
      const file = path.join(root, relForUrl(url));
      fs.writeFileSync(file, nextHtml, 'utf8');
      written += 1;
    }
  }

  return { written };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
  const result = runGenerateRelatedWikiPaths(root);
  console.log(`Related Wiki Paths generated for ${result.written} wiki page(s).`);
}
