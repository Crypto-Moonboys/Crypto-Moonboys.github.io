module.exports = {
  CATEGORY_PRIORITY: {
    core: 10,
    characters: 8,
    factions: 7,
    tokens: 6,
    concepts: 5,
    misc: 3
  },

  WEIGHTS: {
    canonical: 20,
    description: 10,
    category: 5,
    word_count: 0.05,
    keyword_bag: 1,
    authority: 1
  },

  AUTHORITY: {
    internal_links: {
      tier_1: 12,
      tier_2: 8,
      tier_3: 4
    },
    title_depth: {
      tier_1: 8,
      tier_2: 5,
      tier_3: 2
    },
    metadata: {
      keywords_bonus: 4,
      headings_bonus: 4,
      lists_bonus: 2
    }
  }
};