'use strict';

const ALIAS_TO_CANONICAL = {
  '1m-free-nfts-programme': '1m-free-nfts-program',
  'graffpunks-247': 'graffpunks-24-7',
  'graffpunks-247-radio': 'graffpunks-24-7-radio',
  'graffpunks-network': 'graffpunks',
  'hodl-x-warriors': 'hodl-warriors',
  'hodl-wars-game': 'hodl-wars',
  'nbg-token': 'nbg',
};

function normalizeSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
}

function canonicalizeSlug(slug) {
  const normalized = normalizeSlug(slug);
  return ALIAS_TO_CANONICAL[normalized] || normalized;
}

function canonicalizeWikiUrl(url) {
  const trimmed = String(url || '').trim();
  const match = trimmed.match(/\/wiki\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/i);
  if (!match) return trimmed;
  const canonicalSlug = canonicalizeSlug(match[1]);
  return `/wiki/${canonicalSlug}.html`;
}

function isAliasSlug(slug) {
  const normalized = normalizeSlug(slug);
  return Boolean(normalized) && canonicalizeSlug(normalized) !== normalized;
}

function getAliasesForCanonicalSlug(slug) {
  const canonical = canonicalizeSlug(slug);
  return Object.keys(ALIAS_TO_CANONICAL)
    .filter(alias => ALIAS_TO_CANONICAL[alias] === canonical)
    .sort();
}

function titleFromSlug(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return '';
  return normalized
    .split('-')
    .filter(Boolean)
    .map(part => {
      if (/^\d+$/.test(part)) return part;
      if (/^[a-z]\d+[a-z]?$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

module.exports = {
  ALIAS_TO_CANONICAL,
  canonicalizeSlug,
  canonicalizeWikiUrl,
  isAliasSlug,
  getAliasesForCanonicalSlug,
  titleFromSlug,
};
