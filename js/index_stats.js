/**
 * Index Stats — loads index_stats.json published by SAM wiki publisher
 * and injects stats into elements with data-stat="..." attributes.
 */
const IndexStats = {
  async load() {
    try {
      const resp = await fetch('/index_stats.json');
      if (resp.ok) return await resp.json();
    } catch(e) {}
    return null;
  },

  async inject() {
    if (!document.querySelector('[data-stat]')) return;
    const stats = await this.load();
    if (!stats) return;
    document.querySelectorAll('[data-stat]').forEach(el => {
      const key = el.getAttribute('data-stat');
      if (stats[key] !== undefined) el.textContent = stats[key];
    });
  }
};

document.addEventListener('DOMContentLoaded', () => IndexStats.inject());
