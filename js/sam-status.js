/**
 * SAM Status — fetches live data from v2 Brain API and displays focus plan status.
 * Used by sam.html and optionally injected into other pages.
 */

const SAMStatus = {
  
  V2_URL: '', // Set via data-v2-url attribute on the script tag or window.V2_BASE_URL

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  init() {
    const scriptTag = document.querySelector('script[data-v2-url]');
    this.V2_URL = (scriptTag && scriptTag.getAttribute('data-v2-url')) 
                 || window.V2_BASE_URL 
                 || '';
  },

  async fetchFocusPlan() {
    if (!this.V2_URL) return null;
    try {
      const resp = await fetch(`${this.V2_URL}/focus-plan`);
      if (resp.ok) return await resp.json();
    } catch(e) {}
    return null;
  },

  async fetchKeywordBank() {
    if (!this.V2_URL) return null;
    try {
      const resp = await fetch(`${this.V2_URL}/keyword-bank`);
      if (resp.ok) return await resp.json();
    } catch(e) {}
    return null;
  },

  renderFocusPlan(plan) {
    if (!plan) return '<p class="sam-offline">⚠️ v2 Brain offline or not configured</p>';
    const { targets, stable, complete, stats } = plan;
    return `
      <div class="focus-plan">
        <div class="focus-stats">
          <div class="stat-box stat-total"><span class="stat-num">${this._esc(String(stats.total))}</span><span class="stat-label">Total Entities</span></div>
          <div class="stat-box stat-targets"><span class="stat-num">${this._esc(String(stats.target_count))}</span><span class="stat-label">🎯 Targets</span></div>
          <div class="stat-box stat-stable"><span class="stat-num">${this._esc(String(stats.stable_count))}</span><span class="stat-label">💤 Stable</span></div>
          <div class="stat-box stat-complete"><span class="stat-num">${this._esc(String(stats.complete_count))}</span><span class="stat-label">✅ Complete</span></div>
        </div>
        <div class="focus-lists">
          <div class="focus-list focus-targets">
            <h4>🎯 Active Targets</h4>
            ${targets.slice(0, 20).map(e => `<span class="entity-chip chip-target">${this._esc(e)}</span>`).join('')}
            ${targets.length > 20 ? `<span class="chip-more">+${targets.length - 20} more</span>` : ''}
          </div>
          <div class="focus-list focus-complete">
            <h4>✅ Complete Coverage</h4>
            ${complete.slice(0, 10).map(e => `<span class="entity-chip chip-complete">${this._esc(e)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  },

  renderKeywords(data) {
    if (!data || !data.keywords || data.keywords.length === 0) return '<p>No active keywords</p>';
    return `
      <div class="keyword-bank">
        <p class="keyword-total">${this._esc(String(data.total))} active keywords</p>
        <div class="keyword-list">
          ${data.keywords.slice(0, 30).map(kw => `
            <div class="keyword-row">
              <span class="keyword-term">${this._esc(kw.term)}</span>
              <div class="keyword-bar-wrap">
                <div class="keyword-bar" style="width:${this._esc(String(kw.score))}%"></div>
              </div>
              <span class="keyword-score">${this._esc(String(kw.score))}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  async renderInto(targetId) {
    this.init();
    const el = document.getElementById(targetId);
    if (!el) return;
    
    el.innerHTML = '<p class="sam-loading">Loading SAM status...</p>';
    
    const [plan, keywords] = await Promise.all([
      this.fetchFocusPlan(),
      this.fetchKeywordBank()
    ]);
    
    el.innerHTML = `
      <section class="sam-panel">
        <h3>🧠 Focus Plan</h3>
        ${this.renderFocusPlan(plan)}
      </section>
      <section class="sam-panel">
        <h3>🔑 Keyword Bank</h3>
        ${this.renderKeywords(keywords)}
      </section>`;
  }
};
