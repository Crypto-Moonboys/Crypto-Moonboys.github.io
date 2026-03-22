/**
 * SAM Status Panel — shows live Focus Plan and keyword bank from v2 Brain
 * Renders into #sam-status-panel if present on the page
 */

(function() {
  const V2_BASE = (typeof SAM_V2_URL !== 'undefined') ? SAM_V2_URL : '';

  function renderStatus() {
    const panel = document.getElementById('sam-status-panel');
    if (!panel || !V2_BASE) return;

    panel.innerHTML = '<p class="sam-loading">Loading SAM intelligence data...</p>';

    // Load focus plan and keyword bank in parallel
    Promise.all([
      fetch(V2_BASE + '/focus-plan').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(V2_BASE + '/keyword-bank').then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([plan, keywords]) => {
      let html = '<div class="sam-status-grid">';

      if (plan) {
        html += `
          <div class="sam-card sam-targets">
            <h4>🎯 Targets <span class="badge">${(plan.targets || []).length}</span></h4>
            <ul>${(plan.targets || []).slice(0, 10).map(t => `<li>${t}</li>`).join('')}</ul>
            ${plan.targets && plan.targets.length > 10 ? `<p class="more">+${plan.targets.length - 10} more</p>` : ''}
          </div>
          <div class="sam-card sam-complete">
            <h4>✅ Complete <span class="badge">${(plan.complete || []).length}</span></h4>
            <p>Total entities: <strong>${plan.total_entities || 0}</strong></p>
          </div>`;
      }

      if (keywords && keywords.keywords) {
        html += '<div class="sam-card sam-keywords"><h4>🔑 Active Keywords</h4><ul>';
        keywords.keywords.slice(0, 15).forEach(kw => {
          const pct = kw.score || 0;
          html += `<li>
            <span class="kw-term">${kw.term}</span>
            <div class="kw-bar-wrap"><div class="kw-bar" style="width:${pct}%"></div></div>
            <span class="kw-score">${pct}</span>
          </li>`;
        });
        html += '</ul></div>';
      }

      html += '</div>';
      panel.innerHTML = html || '<p>SAM intelligence data unavailable.</p>';
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    renderStatus();
    // Auto-refresh every 60 seconds
    setInterval(renderStatus, 60000);
  });
})();
