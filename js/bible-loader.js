/**
 * Bible Loader — dynamically loads specialist bible JSON for entities with 5+ mentions.
 * Called by individual wiki article pages when a bible exists.
 * Falls back gracefully if no bible available.
 */

const BibleLoader = {
  
  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  _entityToSlug(entity) {
    return entity.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  },

  async load(entitySlug) {
    try {
      const resp = await fetch(`/wiki/bibles/${entitySlug}.json`);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  },

  renderTimeline(facts) {
    if (!facts || facts.length === 0) return '';
    const dated = facts.filter(f => f && f.date).sort((a, b) => a.date.localeCompare(b.date));
    if (dated.length === 0) return '';
    return `
      <section class="bible-section" id="bible-timeline">
        <h3>📅 Timeline</h3>
        <div class="timeline-list">
          ${dated.map(f => `
            <div class="timeline-item">
              <span class="timeline-date">${this._esc(f.date)}</span>
              <span class="timeline-fact">${this._esc(f.text || f.value || JSON.stringify(f))}</span>
            </div>
          `).join('')}
        </div>
      </section>`;
  },

  renderCrossLinks(crossLinks) {
    if (!crossLinks || crossLinks.length === 0) return '';
    return `
      <section class="bible-section" id="bible-crosslinks">
        <h3>🔗 Related Entities</h3>
        <div class="crosslinks-grid">
          ${crossLinks.map(cl => `
            <a href="/wiki/${this._entityToSlug(cl.entity)}.html" 
               class="crosslink-chip">
              ${this._esc(cl.entity)} <span class="shared-count">${this._esc(String(cl.shared_count))} shared facts</span>
            </a>
          `).join('')}
        </div>
      </section>`;
  },

  renderRelationships(relationships) {
    if (!relationships || relationships.length === 0) return '';
    return `
      <section class="bible-section" id="bible-relationships">
        <h3>👥 Relationships</h3>
        <ul class="relationships-list">
          ${relationships.map(r => `<li>${this._esc(typeof r === 'string' ? r : JSON.stringify(r))}</li>`).join('')}
        </ul>
      </section>`;
  },

  async inject(entitySlug, targetElementId) {
    const bible = await this.load(entitySlug);
    const target = document.getElementById(targetElementId);
    if (!bible || !target) return;

    const html = `
      <div class="bible-deep-content" data-entity="${this._esc(bible.entity)}">
        <div class="bible-header">
          <span class="bible-badge">📖 Specialist Bible</span>
          <span class="bible-mention-count">${this._esc(String(bible.mention_count))} mentions</span>
          <span class="bible-generated">Updated: ${this._esc(new Date(bible.generated_at).toLocaleDateString())}</span>
        </div>
        ${this.renderTimeline(bible.all_facts)}
        ${this.renderRelationships(bible.relationships)}
        ${this.renderCrossLinks(bible.cross_links)}
      </div>`;
    
    target.innerHTML = html;
    target.style.display = 'block';
  }
};

// Auto-inject if page has data-bible-slug attribute on body
document.addEventListener('DOMContentLoaded', () => {
  const slug = document.body.getAttribute('data-bible-slug');
  if (slug) {
    BibleLoader.inject(slug, 'bible-deep-section');
  }
});
