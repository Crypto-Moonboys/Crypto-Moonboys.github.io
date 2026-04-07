const fs = require('fs');
const path = require('path');
const CONFIG = require('../js/ranking-config.js');

const ROOT = path.join(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'wiki');
const OUTPUT = path.join(ROOT, 'js', 'wiki-index.json');
const SAM_MEMORY_PATH = path.join(ROOT, 'sam-memory.json');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });

  return results;
}

function extractTitle(html) {
  const match = html.match(/<title>(.*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractDescription(html) {
  const match =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ||
    html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
  return match ? match[1].trim() : '';
}

function extractKeywords(html) {
  const match =
    html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']*)["']/i) ||
    html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']keywords["']/i);

  if (!match) return [];

  return match[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(str) {
  return normalize(str)
    .split(' ')
    .map(s => s.trim())
    .filter(Boolean);
}

function slugFromUrl(url) {
  return String(url || '')
    .replace(/^\/wiki\//, '')
    .replace(/\.html$/i, '')
    .trim();
}

function cleanupCanonicalTitle(title) {
  return String(title || '')
    .replace(/\s+—\s+Crypto Moonboys Wiki$/i, '')
    .trim();
}

function loadSamMemory() {
  if (!fs.existsSync(SAM_MEMORY_PATH)) {
    return { entitiesBySlug: {}, entitiesByTitle: {} };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(SAM_MEMORY_PATH, 'utf8'));
    const entities = raw && typeof raw === 'object' ? raw.entities : null;

    if (!entities || typeof entities !== 'object') {
      return { entitiesBySlug: {}, entitiesByTitle: {} };
    }

    const entitiesBySlug = {};
    const entitiesByTitle = {};

    for (const [, entity] of Object.entries(entities)) {
      if (!entity || typeof entity !== 'object') continue;

      const canonicalUrl = entity.canonical_url || '';
      const slug = slugFromUrl(canonicalUrl);
      const cleanTitle = cleanupCanonicalTitle(entity.canonical_title || '');

      if (slug) {
        entitiesBySlug[slug] = entity;
      }
      if (cleanTitle) {
        entitiesByTitle[normalize(cleanTitle)] = entity;
      }
    }

    return { entitiesBySlug, entitiesByTitle };
  } catch (err) {
    console.warn(`[wiki-index] Failed to read sam-memory.json: ${err.message}`);
    return { entitiesBySlug: {}, entitiesByTitle: {} };
  }
}

function buildSearchIndex(title, description, keywords, aliases = []) {
  const normalizedTitle = normalize(title);
  const keywordBag = Array.from(
    new Set([
      ...tokenize(title),
      ...tokenize(description),
      ...keywords.flatMap(tokenize),
      ...aliases.flatMap(alias => tokenize(alias && alias.title ? alias.title : ''))
    ])
  );

  return {
    normalized_title: normalizedTitle,
    tokens: normalizedTitle.split(' ').filter(Boolean),
    keyword_bag: keywordBag
  };
}

function detectCategory(filePath, html, samEntity) {
  if (samEntity && samEntity.category) {
    return String(samEntity.category).toLowerCase();
  }

  const lowerPath = filePath.toLowerCase();
  const lowerHtml = html.toLowerCase();

  if (lowerPath.includes('character') || lowerHtml.includes('character')) return 'characters';
  if (lowerPath.includes('faction') || lowerHtml.includes('faction')) return 'factions';
  if (lowerPath.includes('token') || lowerHtml.includes('token')) return 'tokens';
  if (lowerPath.includes('concept') || lowerHtml.includes('concept')) return 'concepts';
  if (
    lowerPath.includes('crypto-moonboys') ||
    lowerPath.includes('graffpunks') ||
    lowerPath.includes('gkniftyheads') ||
    lowerPath.includes('hodl-wars')
  ) return 'core';

  return 'misc';
}

function buildAliases(samEntity) {
  if (!samEntity) return [];

  const aliases = [];
  const seen = new Set();
  const pushAlias = (value) => {
    const title = String(value || '').trim();
    if (!title) return;
    const key = normalize(title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    aliases.push({ title });
  };

  (samEntity.aliases || []).forEach(pushAlias);
  (samEntity.alias_candidates || []).forEach(pushAlias);

  const canonicalTitle = cleanupCanonicalTitle(samEntity.canonical_title || '');
  if (canonicalTitle) {
    const normalizedCanonical = normalize(canonicalTitle);
    return aliases.filter(alias => normalize(alias.title) !== normalizedCanonical);
  }

  return aliases;
}

function buildContentSignals(html, title, description, keywords, aliases = []) {
  const text = stripHtml(html);
  const wordCount = text ? text.split(/\s+/).length : 0;
  const hasDescription = Boolean(description);
  const descriptionLength = description.length;
  const keywordBag = Array.from(
    new Set([
      ...tokenize(title),
      ...tokenize(description),
      ...keywords.flatMap(tokenize),
      ...aliases.flatMap(alias => tokenize(alias && alias.title ? alias.title : ''))
    ])
  );
  const keywordBagSize = keywordBag.length;

  const headingCount =
    (html.match(/<h1\b/gi) || []).length +
    (html.match(/<h2\b/gi) || []).length +
    (html.match(/<h3\b/gi) || []).length;

  const listCount =
    (html.match(/<ul\b/gi) || []).length +
    (html.match(/<ol\b/gi) || []).length;

  const internalWikiLinks = (html.match(/href=["']\/wiki\/[^"']+["']/gi) || []).length;

  return {
    article_word_count: wordCount,
    has_description: hasDescription,
    description_length: descriptionLength,
    keyword_bag_size: keywordBagSize,
    heading_count: headingCount,
    list_count: listCount,
    internal_link_count: internalWikiLinks
  };
}

function computeContentQualityScore(signals) {
  let score = 0;

  if (signals.article_word_count >= 300) score += 8;
  if (signals.article_word_count >= 600) score += 8;
  if (signals.article_word_count >= 1000) score += 8;
  if (signals.article_word_count >= 2000) score += 8;

  if (signals.has_description) score += 10;
  if (signals.description_length >= 80) score += 5;

  if (signals.keyword_bag_size >= 8) score += 4;
  if (signals.keyword_bag_size >= 16) score += 4;
  if (signals.keyword_bag_size >= 24) score += 4;

  if (signals.heading_count >= 2) score += 4;
  if (signals.heading_count >= 5) score += 4;

  if (signals.list_count >= 1) score += 2;
  if (signals.list_count >= 3) score += 2;

  return score;
}

function computeAuthorityScore(signals) {
  let score = 0;

  if (signals.internal_link_count >= 3) {
    score += CONFIG.AUTHORITY.internal_links.tier_3;
  }
  if (signals.internal_link_count >= 8) {
    score += CONFIG.AUTHORITY.internal_links.tier_2 - CONFIG.AUTHORITY.internal_links.tier_3;
  }
  if (signals.internal_link_count >= 15) {
    score += CONFIG.AUTHORITY.internal_links.tier_1 - CONFIG.AUTHORITY.internal_links.tier_2;
  }

  if (signals.article_word_count >= 600) {
    score += CONFIG.AUTHORITY.title_depth.tier_3;
  }
  if (signals.article_word_count >= 1200) {
    score += CONFIG.AUTHORITY.title_depth.tier_2 - CONFIG.AUTHORITY.title_depth.tier_3;
  }
  if (signals.article_word_count >= 2400) {
    score += CONFIG.AUTHORITY.title_depth.tier_1 - CONFIG.AUTHORITY.title_depth.tier_2;
  }

  if (signals.keyword_bag_size >= 12) {
    score += CONFIG.AUTHORITY.metadata.keywords_bonus;
  }
  if (signals.heading_count >= 4) {
    score += CONFIG.AUTHORITY.metadata.headings_bonus;
  }
  if (signals.list_count >= 2) {
    score += CONFIG.AUTHORITY.metadata.lists_bonus;
  }

  return score;
}

function buildRankSignals(html, filePath, title, description, keywords, aliases, samEntity) {
  const category = detectCategory(filePath, html, samEntity);
  const contentSignals = buildContentSignals(html, title, description, keywords, aliases);
  const contentQualityScore = computeContentQualityScore(contentSignals);
  const authorityScore = computeAuthorityScore(contentSignals);
  const mentionCount = Number.isFinite(Number(samEntity && samEntity.mention_count))
    ? Number(samEntity.mention_count)
    : 0;

  return {
    is_canonical: true,
    alias_count: aliases.length,
    tag_count: keywords.length,
    mention_count: mentionCount,
    category,
    category_priority: CONFIG.CATEGORY_PRIORITY[category] || CONFIG.CATEGORY_PRIORITY.misc || 3,
    has_description: contentSignals.has_description,
    article_word_count: contentSignals.article_word_count,
    keyword_bag_size: contentSignals.keyword_bag_size,
    heading_count: contentSignals.heading_count,
    list_count: contentSignals.list_count,
    internal_link_count: contentSignals.internal_link_count,
    content_quality_score: contentQualityScore,
    authority_score: authorityScore
  };
}

function computeRankScore(signals) {
  let score = 0;

  if (signals.is_canonical) score += CONFIG.WEIGHTS.canonical;
  if (signals.has_description) score += CONFIG.WEIGHTS.description;

  score += signals.category_priority * CONFIG.WEIGHTS.category;
  score += signals.article_word_count * CONFIG.WEIGHTS.word_count;
  score += signals.keyword_bag_size * CONFIG.WEIGHTS.keyword_bag;
  score += signals.content_quality_score;
  score += signals.authority_score * CONFIG.WEIGHTS.authority;
  score += signals.alias_count * 3;
  score += signals.tag_count;
  score += signals.mention_count * 2;

  return Math.round(score);
}

function buildRankDiagnostics(signals, rankScore) {
  return {
    canonical_points: signals.is_canonical ? CONFIG.WEIGHTS.canonical : 0,
    description_points: signals.has_description ? CONFIG.WEIGHTS.description : 0,
    category_points: signals.category_priority * CONFIG.WEIGHTS.category,
    word_count_points: Math.round(signals.article_word_count * CONFIG.WEIGHTS.word_count),
    keyword_bag_points: Math.round(signals.keyword_bag_size * CONFIG.WEIGHTS.keyword_bag),
    alias_points: signals.alias_count * 3,
    tag_points: signals.tag_count,
    mention_points: signals.mention_count * 2,
    content_quality_points: signals.content_quality_score,
    authority_points: signals.authority_score * CONFIG.WEIGHTS.authority,
    final_rank_score: rankScore
  };
}

function run() {
  console.log('Generating wiki index...');

  const samMemory = loadSamMemory();
  const files = walk(WIKI_DIR);
  const index = [];

  files.forEach(filePath => {
    const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');

    if (relative === 'wiki/index.html') return;

    const html = fs.readFileSync(filePath, 'utf8');
    const title = extractTitle(html);
    if (!title) return;

    const description = extractDescription(html);
    const htmlKeywords = extractKeywords(html);
    const url = '/' + relative;
    const slug = slugFromUrl(url);

    const samEntity =
      samMemory.entitiesBySlug[slug] ||
      samMemory.entitiesByTitle[normalize(cleanupCanonicalTitle(title))] ||
      null;

    const memoryTags = samEntity && Array.isArray(samEntity.tags)
      ? samEntity.tags.filter(Boolean)
      : [];

    const keywords = Array.from(new Set([...htmlKeywords, ...memoryTags]));
    const aliases = buildAliases(samEntity);

    const rankSignals = buildRankSignals(html, filePath, title, description, keywords, aliases, samEntity);
    const rankScore = computeRankScore(rankSignals);
    const rankDiagnostics = buildRankDiagnostics(rankSignals, rankScore);
    const searchIndex = buildSearchIndex(title, description, keywords, aliases);

    index.push({
      title,
      desc: description,
      url,
      tags: keywords,
      category: rankSignals.category,
      aliases,
      rank_score: rankScore,
      rank_signals: rankSignals,
      rank_diagnostics: rankDiagnostics,
      search_index: searchIndex
    });
  });

  index.sort((a, b) => {
    return (
      b.rank_score - a.rank_score ||
      a.title.localeCompare(b.title) ||
      a.url.localeCompare(b.url)
    );
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2));
  console.log(`Generated ${index.length} entries`);
}

run();
