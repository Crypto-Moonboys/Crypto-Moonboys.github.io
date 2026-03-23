/**
 * SAM Status — fetches live data from v2 Brain API and displays focus plan status.
 * Used by sam.html and optionally injected into other pages.
 *
 * Safety contract (3 explicit states):
 *   1. NOT CONFIGURED — V2_BASE_URL empty/unset → render _notConnectedHTML immediately, zero fetch
 *   2. OFFLINE        — URL set but fetch timed out / failed → render _offlineHTML, console.warn once
 *   3. LIVE           — fetch succeeded → render data; per-endpoint degradation if one fails
 */

const SAMStatus = {

  V2_URL: '',          // Set via window.V2_BASE_URL or data-v2-url on the script tag
  FETCH_TIMEOUT: 8000, // ms before a fetch is aborted and treated as offline

  _notConnectedHTML: `
    <div class="sam-not-connected">
      <p class="sam-state-label">🔌 Not connected</p>
      <p class="sam-state-detail">Set <code>window.V2_BASE_URL</code> or the <code>data-v2-url</code> script attribute to enable live SAM status.</p>
    </div>`,

  _offlineHTML: `
    <div class="sam-offline-state">
      <p class="sam-state-label">⚠️ v2 Brain offline</p>
      <p class="sam-state-detail">Could not reach the v2 Brain API. Check that the service is running and the URL is correct.</p>
    </div>`,

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  _timeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SAMStatus: fetch timed out')), ms)
    );
  },

  init() {
    const scriptTag = document.querySelector('script[data-v2-url]');
    this.V2_URL = (scriptTag && scriptTag.getAttribute('data-v2-url'))
                 || window.V2_BASE_URL
                 || '';
  },

  async _fetchJSON(path) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT);
    try {
      const resp = await Promise.race([
        fetch(this.V2_URL + path, { signal: controller.signal }),
        this._timeout(this.FETCH_TIMEOUT)
      ]);
      clearTimeout(tid);
      if (!resp.ok) return { ok: false };
      const data = await resp.json();
      return { ok: true, data };
    } catch (e) {
      clearTimeout(tid);
      return { ok: false };
    }
  },

  renderFocusPlan(plan) {
    const { targets = [], complete = [], stats = {} } = plan;
    const s = (v) => this._esc(String(v != null ? v : '—'));
    return `<div class="focus-plan">
      <div class="focus-stats">
        <div class="stat-box stat-total"><span class="stat-num">${s(stats.total)}</span><span class="stat-label">Total Entities</span></div>
        <div class="stat-box stat-targets"><span class="stat-num">${s(stats.target_count)}</span><span class="stat-label">🎯 Targets</span></div>
        <div class="stat-box stat-stable"><span class="stat-num">${s(stats.stable_count)}</span><span class="stat-label">💤 Stable</span></div>
        <div class="stat-box stat-complete"><span class="stat-num">${s(stats.complete_count)}</span><span class="stat-label">✅ Complete</span></div>
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
    if (!data || !data.keywords || data.keywords.length === 0) {
      return '<p class="sam-state-detail">No active keywords.</p>';
    }
    return `<div class="keyword-bank">
      <p class="keyword-total">${this._esc(String(data.total))} active keywords</p>
      <div class="keyword-list">
        ${data.keywords.slice(0, 30).map(kw => `
          <div class="keyword-row">
            <span class="keyword-term">${this._esc(kw.term)}</span>
            <div class="keyword-bar-wrap">
              <div class="keyword-bar" style="width:${Math.min(Number(kw.score) || 0, 100)}%"></div>
            </div>
            <span class="keyword-score">${this._esc(String(kw.score))}</span>
          </div>`).join('')}
      </div>
    </div>`;
  },

  async renderInto(targetId) {
    this.init();
    const el = document.getElementById(targetId);
    if (!el) return;

    // STATE 1: NOT CONFIGURED
    if (!this.V2_URL) {
      el.innerHTML = this._notConnectedHTML;
      return;
    }

    // Loading — only when URL is configured
    el.innerHTML = '<p class="sam-loading">⏳ Connecting to v2 Brain...</p>';

    const [planResult, kwResult] = await Promise.all([
      this._fetchJSON('/focus-plan'),
      this._fetchJSON('/keyword-bank')
    ]);

    // STATE 2: OFFLINE
    if (!planResult.ok && !kwResult.ok) {
      console.warn('[SAMStatus] v2 Brain unreachable at', this.V2_URL);
      el.innerHTML = `<section class="sam-panel"><h3>🧠 SAM Pipeline</h3>${this._offlineHTML}</section>`;
      return;
    }

    // STATE 3: LIVE
    const planHTML = planResult.ok ? this.renderFocusPlan(planResult.data) : this._offlineHTML;
    const kwHTML   = kwResult.ok   ? this.renderKeywords(kwResult.data)    : '<p class="sam-state-detail">⚠️ Keyword bank unavailable.</p>';

    el.innerHTML = `
      <section class="sam-panel"><h3>🧠 Focus Plan</h3>${planHTML}</section>
      <section class="sam-panel"><h3>🔑 Keyword Bank</h3>${kwHTML}</section>`;
  }
};
