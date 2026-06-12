'use strict';

/**
 * wiki-aliases.js
 *
 * Alias → canonical slug resolution backed by the brand taxonomy.
 * Unsafe collapses (different concept types in the same brand) are NOT
 * included here — see scripts/wiki-brand-taxonomy.js for the authoritative
 * source of truth.
 */

const { _ALIAS_TO_CANONICAL: ALIAS_TO_CANONICAL } = require('./wiki-brand-taxonomy.js');

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
