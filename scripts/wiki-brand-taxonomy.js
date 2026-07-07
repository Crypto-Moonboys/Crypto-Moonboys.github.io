'use strict';

/**
 * scripts/wiki-brand-taxonomy.js
 *
 * Brand-aware wiki canonicalization taxonomy.
 *
 * A slug can only be collapsed into another if it is the SAME concept type
 * within the SAME brand/faction.  Different concept types (e.g. brand ≠ token,
 * faction ≠ radio ≠ game) must remain as separate canonical pages.
 *
 * Same brand + same concept type  → may alias (safe collapse)
 * Same brand + different concept  → separate canonical pages
 *
 * If SAM cannot confidently classify a page it should mark it
 * NEEDS_BRAND_REVIEW and not publish another duplicate canonical page.
 */

const BRAND_CANON = {
  graffpunks: {
    id: 'graffpunks',
    parent: 'gkniftyheads',
    type: 'faction',
    canonical: 'graffpunks',
    concepts: {
      faction: {
        canonical: 'graffpunks',
        aliases: ['the-graffpunks'],
      },
      radio: {
        canonical: 'graffpunks-24-7-radio',
        aliases: [
          'graffpunks-247-radio',
          'graffpunks-24-7',
          'graffpunks-247',
          'graffpunks-247-blockchain-radio-station',
        ],
      },
      collection: {
        canonical: 'graffpunks-collection',
        aliases: [],
      },
      ecosystem: {
        canonical: 'graffpunks-ecosystem',
        aliases: [],
      },
      game: {
        canonical: 'midevilpunks',
        aliases: [],
      },
    },
  },

  hodl: {
    id: 'hodl',
    concepts: {
      faction: {
        canonical: 'hodl-warriors',
        aliases: [],
      },
      game: {
        canonical: 'hodl-wars',
        aliases: ['hodl-wars-game'],
      },
    },
  },

  nbg: {
    id: 'nbg',
    concepts: {
      brand: {
        canonical: 'nbg',
        aliases: [],
      },
      token: {
        canonical: 'nbg-token',
        aliases: [],
      },
      mechanic: {
        canonical: 'nbgx-token',
        aliases: ['nbgx'],
      },
    },
  },

  oneMillionFreeNfts: {
    id: 'one-million-free-nfts',
    concepts: {
      program: {
        canonical: '1m-free-nfts-program',
        aliases: ['1m-free-nfts-programme', 'one-million-free-nfts'],
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Internal lookup tables (built once from BRAND_CANON)
// ---------------------------------------------------------------------------

/** alias slug → canonical slug (safe collapses only) */
function _buildAliasMap() {
  const map = {};
  for (const brand of Object.values(BRAND_CANON)) {
    for (const concept of Object.values(brand.concepts)) {
      for (const alias of (concept.aliases || [])) {
        map[alias] = concept.canonical;
      }
    }
  }
  return map;
}

/** canonical slug (or alias slug) → brand metadata */
function _buildCanonicalMeta() {
  const meta = {};
  for (const [brandKey, brand] of Object.entries(BRAND_CANON)) {
    const brandFamily = brand.id || brandKey;
    for (const [conceptType, concept] of Object.entries(brand.concepts)) {
      // Avoid self-parent cycle: if this concept IS the brand top-level canonical,
      // use brand.parent (if defined) or null instead of brand.canonical.
      const isTopLevel = brand.canonical && concept.canonical === brand.canonical;
      const parentConcept = isTopLevel ? (brand.parent || null) : (brand.canonical || null);
      const entry = {
        brand_family: brandFamily,
        concept_type: conceptType,
        canonical_concept_id: `${brandFamily}:${conceptType}`,
        canonical_slug: concept.canonical,
        parent_concept: parentConcept,
      };
      meta[concept.canonical] = entry;
      for (const alias of (concept.aliases || [])) {
        meta[alias] = Object.assign({}, entry, { is_alias: true });
      }
    }
  }
  return meta;
}

const ALIAS_TO_CANONICAL = Object.freeze(_buildAliasMap());
const _CANONICAL_META = _buildCanonicalMeta();

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

function normalizeSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
}

/**
 * Resolve a slug to its brand-canonical slug.
 * Returns the input slug unchanged if it has no alias in the taxonomy.
 */
function canonicalConceptForSlug(slug) {
  const normalized = normalizeSlug(slug);
  return ALIAS_TO_CANONICAL[normalized] || normalized;
}

/**
 * Return brand metadata for a slug (or null if unknown to the taxonomy).
 * Resolves through aliases so both alias slugs and canonical slugs work.
 */
function classifyWikiSlug(slug) {
  const normalized = normalizeSlug(slug);
  // Check the slug directly first (handles canonicals and known aliases)
  if (_CANONICAL_META[normalized]) return _CANONICAL_META[normalized];
  // Then try after alias resolution
  const canonical = ALIAS_TO_CANONICAL[normalized];
  if (canonical && _CANONICAL_META[canonical]) return _CANONICAL_META[canonical];
  return null;
}

/**
 * Canonicalize a full wiki URL (path only, with or without query/hash).
 * Non-wiki URLs are returned unchanged.
 */
function canonicalizeWikiUrl(url) {
  const trimmed = String(url || '').trim();
  const match = trimmed.match(/\/wiki\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/i);
  if (!match) return trimmed;
  const canonical = canonicalConceptForSlug(match[1]);
  return `/wiki/${canonical}.html`;
}

/**
 * Returns true iff the slug is a known alias (safe to collapse to canonical).
 * Slugs absent from the taxonomy are NOT considered aliases.
 */
function isTrueAliasSlug(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return false;
  return Object.prototype.hasOwnProperty.call(ALIAS_TO_CANONICAL, normalized);
}

/**
 * Return the concept type for a slug, or 'unknown' if not in taxonomy.
 */
function getConceptType(slug) {
  const meta = classifyWikiSlug(slug);
  return meta ? meta.concept_type : 'unknown';
}

module.exports = {
  BRAND_CANON,
  ALIAS_TO_CANONICAL,
  classifyWikiSlug,
  canonicalConceptForSlug,
  canonicalizeWikiUrl,
  isTrueAliasSlug,
  getConceptType,
};
