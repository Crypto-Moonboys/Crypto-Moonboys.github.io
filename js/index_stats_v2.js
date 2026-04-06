/**
 * Index Stats Loader — loads js/site-stats.json (auto-generated) and populates homepage stats.
 * Looks for:
 * - .stat-total-articles
 * - .stat-total-entities
 * - .stat-last-updated
 */

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    fetch('/js/site-stats.json')
      .then(r => r.ok ? r.json() : null)
      .then(stats => {
        if (!stats) return;

        const totalArticles = document.querySelector('.stat-total-articles');
        const totalEntities = document.querySelector('.stat-total-entities');
        const lastUpdated = document.querySelector('.stat-last-updated');

        if (totalArticles && stats.total_articles !== undefined) {
          totalArticles.textContent = Number(stats.total_articles).toLocaleString('en-GB');
        }

        if (totalEntities && stats.total_entities !== undefined) {
          totalEntities.textContent = Number(stats.total_entities).toLocaleString('en-GB');
        }

        if (lastUpdated && stats.last_updated) {
          const d = new Date(stats.last_updated);
          if (!Number.isNaN(d.getTime())) {
            lastUpdated.textContent = d.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });
          } else {
            lastUpdated.textContent = stats.last_updated;
          }
        }
      })
      .catch(() => {}); // Silently fail
  });
})();
