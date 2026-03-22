/**
 * Index Stats Loader — loads index_stats.json published by SAM and populates stats elements
 * Looks for elements with class .stat-total-entities, .stat-total-facts, .stat-last-updated
 */

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    fetch('/index_stats.json')
      .then(r => r.ok ? r.json() : null)
      .then(stats => {
        if (!stats) return;

        const totalEntities = document.querySelector('.stat-total-entities');
        const totalFacts = document.querySelector('.stat-total-facts');
        const lastUpdated = document.querySelector('.stat-last-updated');

        if (totalEntities && stats.total_entities !== undefined) {
          totalEntities.textContent = stats.total_entities.toLocaleString();
        }
        if (totalFacts && stats.total_facts !== undefined) {
          totalFacts.textContent = stats.total_facts.toLocaleString();
        }
        if (lastUpdated && stats.last_updated) {
          const d = new Date(stats.last_updated);
          lastUpdated.textContent = d.toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
        }
      })
      .catch(() => {}); // Silently fail
  });
})();
