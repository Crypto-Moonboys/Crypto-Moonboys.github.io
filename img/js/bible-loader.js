/**
 * Bible Loader — dynamically loads specialist bible JSON for entities with 5+ mentions
 * Called from wiki article pages that have a data-entity-slug attribute
 */

(function() {
  const BIBLES_PATH = '/wiki/bibles/';

  function loadBible(slug) {
    const container = document.getElementById('bible-content');
    if (!container) return;

    fetch(BIBLES_PATH + slug + '.json')
      .then(r => {
        if (!r.ok) return null;
        return r.json();
      })
      .then(bible => {
        if (!bible) return;
        renderBible(bible, container);
      })
      .catch(() => {}); // Silently fail if no bible exists yet
  }

  function renderBible(bible, container) {
    let html = '';

    // Timeline section
    if (bible.timeline && bible.timeline.length > 0) {
      html += '<div class="bible-section bible-timeline">';
      html += '<h3>📅 Timeline</h3><ul>';
      bible.timeline.forEach(entry => {
        const date = entry.date || '';
        const text = entry.text || entry.value || JSON.stringify(entry);
        html += `<li><span class="timeline-date">${date}</span> ${text}</li>`;
      });
      html += '</ul></div>';
    }

    // Relationships section
    if (bible.relationships && bible.relationships.length > 0) {
      html += '<div class="bible-section bible-relationships">';
      html += '<h3>🔗 Relationships</h3><ul>';
      bible.relationships.forEach(rel => {
        const relText = typeof rel === 'string' ? rel : JSON.stringify(rel);
        html += `<li>${relText}</li>`;
      });
      html += '</ul></div>';
    }

    // Cross-links section
    if (bible.cross_links && bible.cross_links.length > 0) {
      html += '<div class="bible-section bible-crosslinks">';
      html += '<h3>🌐 Connected Entities</h3><ul>';
      bible.cross_links.forEach(link => {
        const slug = link.entity.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        html += `<li><a href="/wiki/${slug}.html">${link.entity}</a> <span class="crosslink-count">(${link.shared_count} shared facts)</span></li>`;
      });
      html += '</ul></div>';
    }

    if (html) {
      container.innerHTML = html;
      container.style.display = 'block';
    }
  }

  // Auto-init: check for data-entity-slug on body or article element
  document.addEventListener('DOMContentLoaded', function() {
    const el = document.querySelector('[data-entity-slug]');
    if (el) {
      loadBible(el.getAttribute('data-entity-slug'));
    }
  });

  // Expose globally for manual calls
  window.loadBible = loadBible;
})();
