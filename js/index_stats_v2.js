/**
 * Index Stats Loader
 *
 * Loads /js/site-stats.json (auto-generated) and populates homepage stats.
 *
 * Supported targets:
 * - .stat-total-articles
 * - .stat-total-categories
 * - .stat-total-entities
 * - .stat-last-updated
 *
 * Supported JSON keys:
 * - totalArticles / total_articles
 * - totalCategories / total_categories
 * - totalEntities / total_entities
 * - last_updated
 */

(function () {
  function pickNumber(stats, keys) {
    for (const key of keys) {
      if (stats && Object.prototype.hasOwnProperty.call(stats, key)) {
        const value = Number(stats[key]);
        if (!Number.isNaN(value)) return value;
      }
    }
    return null;
  }

  function setText(selector, value) {
    const nodes = document.querySelectorAll(selector);
    if (!nodes.length || value === null || value === undefined) return;

    nodes.forEach(node => {
      node.textContent = Number(value).toLocaleString('en-GB');
    });
  }

  function setLastUpdated(stats) {
    const nodes = document.querySelectorAll('.stat-last-updated, [data-stat="last_updated"]');
    if (!nodes.length || !stats || !stats.last_updated) return;

    const d = new Date(stats.last_updated);
    const text = !Number.isNaN(d.getTime())
      ? d.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })
      : String(stats.last_updated);

    nodes.forEach(node => {
      node.textContent = text;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetch('/js/site-stats.json')
      .then(response => (response.ok ? response.json() : null))
      .then(stats => {
        if (!stats) return;

        const totalArticles = pickNumber(stats, ['totalArticles', 'total_articles', 'article_count']);
        const totalCategories = pickNumber(stats, ['totalCategories', 'total_categories', 'category_count']);
        const totalEntities = pickNumber(stats, ['totalEntities', 'total_entities', 'entity_count']);

        setText('.stat-total-articles, [data-stat="article-count"]', totalArticles);
        setText('.stat-total-categories, [data-stat="category-count"]', totalCategories);
        setText('.stat-total-entities, [data-stat="total_entities"]', totalEntities);

        setLastUpdated(stats);
      })
      .catch(() => {
        // Silent fail on homepage stats
      });
  });
})();