/* ============================================================
   dashboard.js — Editorial Intelligence Dashboard
   Loads and renders metrics from multiple JSON data sources.
   No external dependencies.
   ============================================================ */

(function () {
  'use strict';

  const DATA = {
    siteStats:         '/js/site-stats.json',
    contentGaps:       '/js/content-gaps.json',
    expansionPlan:     '/js/expansion-plan.json',
    growthPriority:    '/js/growth-priority.json',
    clusterHealth:     '/js/cluster-health.json',
    authorityDrift:    '/js/authority-drift.json',
    entityChangelog:   '/js/entity-changelog.json',
    editorialChangelog:'/js/editorial-changelog.json',
  };

  // ── Bootstrap ────────────────────────────────────────────────────────────
  function init() {
    Promise.allSettled(
      Object.entries(DATA).map(([key, url]) =>
        fetch(url)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
          .then(data => [key, data])
          .catch(err => { console.warn(`Dashboard: failed to load ${url}: ${err.message}`); return [key, null]; })
      )
    ).then(results => {
      const loaded = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const [key, val] = r.value;
          loaded[key] = val;
        }
      }
      render(loaded);
    });
  }

  // ── Top-level render ─────────────────────────────────────────────────────
  function render(d) {
    renderSummaryMetrics(d.siteStats, d.contentGaps, d.authorityDrift);
    renderClusterHealth(d.clusterHealth);
    renderContentGaps(d.contentGaps);
    renderAuthorityDrift(d.authorityDrift);
    renderEntityChangelog(d.entityChangelog);
    renderGrowthPriority(d.growthPriority);
    renderExpansionPlan(d.expansionPlan);
    renderEditorialChangelog(d.editorialChangelog);
  }

  // ── Summary Metrics ──────────────────────────────────────────────────────
  function renderSummaryMetrics(stats, gaps, drift) {
    const container = qs('#dash-summary');
    if (!container) return;

    const totalEntities    = (stats && (stats.totalEntities || stats.entity_count))      || '—';
    const totalArticles    = (stats && (stats.totalArticles || stats.article_count))      || '—';
    const totalCategories  = (stats && (stats.totalCategories || stats.category_count))   || '—';
    const orphanCount      = (gaps && gaps.summary && gaps.summary.isolated_pages)        || 0;
    const gapCount         = (gaps && gaps.summary && gaps.summary.underlinked_targets)   || 0;
    const highDrift        = (drift && drift.summary && drift.summary.high_drift_count)   || 0;

    container.innerHTML = `
      <div class="dash-metric">
        <span class="dash-metric-value">${totalEntities}</span>
        <span class="dash-metric-label">Total Entities</span>
      </div>
      <div class="dash-metric">
        <span class="dash-metric-value">${totalArticles}</span>
        <span class="dash-metric-label">Articles</span>
      </div>
      <div class="dash-metric">
        <span class="dash-metric-value">${totalCategories}</span>
        <span class="dash-metric-label">Categories</span>
      </div>
      <div class="dash-metric ${orphanCount > 0 ? 'dash-metric--warn' : ''}">
        <span class="dash-metric-value">${orphanCount}</span>
        <span class="dash-metric-label">Orphan Pages</span>
      </div>
      <div class="dash-metric ${gapCount > 0 ? 'dash-metric--warn' : ''}">
        <span class="dash-metric-value">${gapCount}</span>
        <span class="dash-metric-label">Under-linked</span>
      </div>
      <div class="dash-metric ${highDrift > 0 ? 'dash-metric--alert' : ''}">
        <span class="dash-metric-value">${highDrift}</span>
        <span class="dash-metric-label">Authority Drift</span>
      </div>
    `;
  }

  // ── Cluster Health ───────────────────────────────────────────────────────
  function renderClusterHealth(data) {
    const container = qs('#dash-cluster-health');
    if (!container) return;

    if (!data || !data.clusters || !data.clusters.length) {
      container.innerHTML = noData('Cluster health data not available.');
      return;
    }

    const maxHealth = Math.max(...data.clusters.map(c => c.health_score), 1);

    const rows = data.clusters.map(c => {
      const pct = Math.round((c.health_score / maxHealth) * 100);
      const barColour = pct >= 70 ? '#3fb950' : pct >= 40 ? '#f7c948' : '#ff7b72';
      return `
        <tr>
          <td class="cluster-name">${capitalize(c.cluster_id)}</td>
          <td class="num">${c.page_count}</td>
          <td class="num">${c.avg_internal_links.toFixed(1)}</td>
          <td class="num">${c.avg_rank_score.toFixed(0)}</td>
          <td class="num">${c.avg_authority_score.toFixed(1)}</td>
          <td class="num">${c.centrality_score.toFixed(1)}</td>
          <td>
            <div class="bar-wrap">
              <div class="bar-fill" style="width:${pct}%;background:${barColour}"></div>
              <span class="bar-label">${c.health_score.toFixed(1)}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="dash-table">
        <thead>
          <tr>
            <th>Cluster</th>
            <th>Pages</th>
            <th>Avg Links</th>
            <th>Avg Rank</th>
            <th>Avg Auth</th>
            <th>Centrality</th>
            <th>Health Score</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ── Content Gaps ─────────────────────────────────────────────────────────
  function renderContentGaps(data) {
    const container = qs('#dash-content-gaps');
    if (!container) return;

    if (!data || !data.underlinked_pages || !data.underlinked_pages.length) {
      container.innerHTML = noData('Content gap data not available.');
      return;
    }

    const pages = data.underlinked_pages.slice(0, 15);
    const rows = pages.map(p => {
      const slug = p.url.replace(/^\/wiki\//, '').replace(/\.html$/, '');
      const label = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const alert = p.inbound_links === 0 ? '<span class="badge badge-red">isolated</span>' : '';
      return `
        <tr>
          <td><a href="${p.url}">${label}</a> ${alert}</td>
          <td class="num">${p.inbound_links}</td>
          <td class="num">${p.rank_score}</td>
          <td class="num">${p.score}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <p class="dash-section-note">Top ${pages.length} under-linked pages (out of ${data.underlinked_pages.length} total)</p>
      <table class="dash-table">
        <thead>
          <tr>
            <th>Page</th>
            <th>Inbound Links</th>
            <th>Rank Score</th>
            <th>Gap Score</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ── Authority Drift ───────────────────────────────────────────────────────
  function renderAuthorityDrift(data) {
    const container = qs('#dash-authority-drift');
    if (!container) return;

    if (!data || !data.entries || !data.entries.length) {
      container.innerHTML = noData('Authority drift data not available.');
      return;
    }

    const highItems = data.entries.filter(e => e.alert_level === 'high').slice(0, 12);

    if (!highItems.length) {
      container.innerHTML = `<p style="color:var(--color-green)">✅ No high-drift alerts detected.</p>`;
      return;
    }

    const rows = highItems.map(e => {
      const title = e.title.replace(/\s*[—–-]\s*Crypto Moonboys Wiki.*$/i, '').trim();
      const dirIcon =
        e.drift_direction === 'authority_exceeds_centrality' ? '⬆️ Auth' :
        e.drift_direction === 'centrality_exceeds_authority' ? '⬇️ Cent' : '⚖️';
      const driftPct = (e.drift * 100).toFixed(1);
      return `
        <tr>
          <td><a href="${e.url}">${title}</a></td>
          <td class="num">${e.authority_score}</td>
          <td class="num">${e.graph_centrality}</td>
          <td class="num drift-dir">${dirIcon}</td>
          <td class="num"><span class="badge badge-red">${driftPct}%</span></td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <p class="dash-section-note">
        <span class="badge badge-red">${data.summary.high_drift_count} high</span>
        <span class="badge badge-yellow">${data.summary.medium_drift_count} medium</span>
        &nbsp;avg drift: ${(data.summary.avg_drift * 100).toFixed(1)}%
      </p>
      <table class="dash-table">
        <thead>
          <tr>
            <th>Entity</th>
            <th>Authority Score</th>
            <th>Graph Centrality</th>
            <th>Direction</th>
            <th>Drift</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ── Entity Changelog ─────────────────────────────────────────────────────
  function renderEntityChangelog(data) {
    const container = qs('#dash-entity-changelog');
    if (!container) return;

    if (!data || !data.entries || !data.entries.length) {
      container.innerHTML = noData('Entity changelog not available.');
      return;
    }

    const changed = data.entries.filter(e => e.rank_delta !== 0).slice(0, 15);

    if (!changed.length) {
      container.innerHTML = `<p style="color:var(--color-green)">✅ No rank changes detected across snapshots.</p>`;
      return;
    }

    const rows = changed.map(e => {
      const title = e.title.replace(/\s*[—–-]\s*Crypto Moonboys Wiki.*$/i, '').trim() || e.url;
      const trendIcon = e.rank_trend === 'up' ? '▲' : e.rank_trend === 'down' ? '▼' : '—';
      const trendCls  = e.rank_trend === 'up' ? 'trend-up' : e.rank_trend === 'down' ? 'trend-down' : '';
      const delta = e.rank_delta > 0 ? `+${e.rank_delta}` : `${e.rank_delta}`;
      const hist  = e.rank_history.map(h => `${h.date}: ${h.rank_score}`).join(' → ');
      return `
        <tr>
          <td><a href="${e.url}">${title}</a></td>
          <td class="num">${capitalize(e.category)}</td>
          <td class="num ${trendCls}">${trendIcon} ${delta}</td>
          <td class="num" style="font-size:.75rem;color:var(--color-text-muted)">${hist}</td>
        </tr>
      `;
    }).join('');

    const snap = data.snapshot_dates.join(', ');

    container.innerHTML = `
      <p class="dash-section-note">
        Snapshots: ${snap || '—'} &nbsp;|&nbsp;
        ${data.summary.trending_up} rising &nbsp; ${data.summary.trending_down} falling
      </p>
      <table class="dash-table">
        <thead>
          <tr>
            <th>Entity</th>
            <th>Category</th>
            <th>Rank Change</th>
            <th>History</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ── Growth Priority ───────────────────────────────────────────────────────
  function renderGrowthPriority(data) {
    const container = qs('#dash-growth-priority');
    if (!container) return;

    if (!data || !data.priorities || !data.priorities.length) {
      container.innerHTML = noData('Growth priority data not available.');
      return;
    }

    const top = data.priorities.slice(0, 12);
    const maxScore = Math.max(...top.map(p => p.priority_score), 1);

    const rows = top.map(p => {
      const title = p.target_slug
        ? p.target_slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : p.target_url || '—';
      const pct = Math.round((p.priority_score / maxScore) * 100);
      const atype = p.action_type ? `<span class="badge badge-blue">${p.action_type.replace(/_/g, ' ')}</span>` : '';
      return `
        <tr>
          <td><a href="${p.target_url || '#'}">${title}</a> ${atype}</td>
          <td>
            <div class="bar-wrap">
              <div class="bar-fill" style="width:${pct}%;background:#58a6ff"></div>
              <span class="bar-label">${p.priority_score}</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Target</th><th>Priority Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ── Expansion Plan ────────────────────────────────────────────────────────
  function renderExpansionPlan(data) {
    const container = qs('#dash-expansion-plan');
    if (!container) return;

    if (!data || !data.actions || !data.actions.length) {
      container.innerHTML = noData('Expansion plan data not available.');
      return;
    }

    const summary = data.summary || {};
    const summaryItems = Object.entries(summary)
      .filter(([k]) => k !== 'total_actions')
      .map(([k, v]) => `<span class="badge badge-blue">${k.replace(/_/g, ' ')}: ${v}</span>`)
      .join(' ');

    const top = data.actions.slice(0, 10);
    const rows = top.map(a => {
      const topic = a.target_topic || (a.target_url_slug || '').replace(/-/g, ' ') || '—';
      const atype = `<span class="badge badge-blue">${(a.action_type || '').replace(/_/g, ' ')}</span>`;
      const reasons = (a.reasons || []).slice(0, 2).join(', ');
      return `
        <tr>
          <td>${capitalize(topic)} ${atype}</td>
          <td class="num">${a.priority_score || '—'}</td>
          <td style="font-size:.75rem;color:var(--color-text-muted)">${reasons}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <p class="dash-section-note">${summaryItems}</p>
      <table class="dash-table">
        <thead><tr><th>Topic</th><th>Priority</th><th>Reasons</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ── Editorial Changelog ───────────────────────────────────────────────────
  function renderEditorialChangelog(data) {
    const container = qs('#dash-editorial-changelog');
    if (!container) return;

    if (!data || !data.runs || !data.runs.length) {
      container.innerHTML = noData('No autonomous editorial runs recorded yet.');
      return;
    }

    // Show most recent runs first (up to 10)
    const runs = data.runs.slice().reverse().slice(0, 10);

    const ACTION_BADGE = {
      stub_promotion_recorded:   'badge-blue',
      content_expansion_created: 'badge-green',
      content_expansion_skipped: 'badge-yellow',
      intelligence_ingested:     'badge-green',
      intelligence_skipped:      'badge-yellow',
      hub_reinforcement_created: 'badge-green',
      hub_reinforcement_skipped: 'badge-yellow',
    };

    const SCRIPT_LABEL = {
      'apply-stub-promotions':       '🔖 Stub Promotions',
      'generate-content-expansion':  '📄 Content Expansion',
      'ingest-external-intelligence':'🌐 External Intelligence',
      'apply-hub-reinforcement':     '🌐 Hub Reinforcement',
    };

    const runBlocks = runs.map(run => {
      const label    = SCRIPT_LABEL[run.script] || run.script;
      const ts       = run.timestamp ? run.timestamp.slice(0, 19).replace('T', ' ') : '—';
      const summary  = run.summary || {};
      const sumItems = Object.entries(summary)
        .map(([k, v]) => `<span style="margin-right:10px"><strong>${v}</strong> <small>${k.replace(/_/g, ' ')}</small></span>`)
        .join('');

      // Show up to 8 actions
      const appliedActions = (run.actions || []).filter(a => a.status === 'applied').slice(0, 8);
      const actionRows = appliedActions.map(a => {
        const badgeCls = ACTION_BADGE[a.action_type] || 'badge-blue';
        const badge    = `<span class="badge ${badgeCls}">${(a.action_type || '').replace(/_/g, ' ')}</span>`;
        const link     = a.target_url
          ? `<a href="${a.target_url}">${a.target_url}</a>`
          : (a.entry_title || a.entry_id || '—');
        return `<tr><td>${link}</td><td>${badge}</td></tr>`;
      }).join('');

      const moreCount = (run.actions || []).filter(a => a.status === 'applied').length - appliedActions.length;
      const moreNote  = moreCount > 0 ? `<p class="dash-section-note">… and ${moreCount} more applied actions</p>` : '';

      return `
        <div style="margin-bottom:20px;border:1px solid var(--color-border);border-radius:var(--radius);padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${label}</strong>
            <small style="color:var(--color-text-muted)">${ts}</small>
          </div>
          <div style="font-size:.82rem;margin-bottom:10px">${sumItems}</div>
          ${appliedActions.length > 0 ? `
          <table class="dash-table">
            <thead><tr><th>Target</th><th>Action</th></tr></thead>
            <tbody>${actionRows}</tbody>
          </table>
          ${moreNote}` : '<p class="dash-section-note">No applied actions in this run.</p>'}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <p class="dash-section-note">
        ${runs.length} run(s) shown (most recent first) · Schema: ${data.schema_version || '1.0'}
      </p>
      ${runBlocks}
    `;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function qs(sel) { return document.querySelector(sel); }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function noData(msg) { return `<p style="color:var(--color-text-muted)">${msg}</p>`; }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
