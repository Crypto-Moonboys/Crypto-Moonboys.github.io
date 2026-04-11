/* ============================================================
   arcade-leaderboard.js — Shared Moonboys Arcade leaderboard UI
   Reads from the shared worker via leaderboard-client.js.
   No external dependencies.
   ============================================================ */

import { fetchLeaderboard } from '/js/leaderboard-client.js';

// ── Constants ─────────────────────────────────────────────────────────────
const TABS = [
  { key: 'global',     label: '🌐 Global',     icon: '🌐' },
  { key: 'snake',      label: '🐍 Snake',       icon: '🐍' },
  { key: 'crystal',    label: '🧩 Crystal',     icon: '🧩' },
  { key: 'blocktopia', label: '🧱 BlockTopia',  icon: '🧱' },
];

const GAME_LABELS = {
  snake:      '🐍 Snake',
  crystal:    '🧩 Crystal',
  blocktopia: '🧱 BlockTopia',
  bonus:      '⭐ Bonus',
};

// ── State ─────────────────────────────────────────────────────────────────
let currentTab = 'global';
let currentData = [];
let onRowSelectCallback = null;
let isFetching = false;

// ── DOM helpers ───────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function renderTabs() {
  const bar = el('lb-tab-bar');
  if (!bar) return;
  bar.innerHTML = TABS.map(t => `
    <button
      class="lb-tab${t.key === currentTab ? ' active' : ''}"
      data-tab="${t.key}"
      aria-selected="${t.key === currentTab}"
      role="tab"
    >${t.label}</button>
  `).join('');
  bar.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function setLoadingState(loading) {
  const table  = el('lb-table-wrap');
  const status = el('lb-status');
  if (!table || !status) return;
  if (loading) {
    table.style.display = 'none';
    status.style.display = 'block';
    status.innerHTML = '<span class="lb-spinner" aria-live="polite">⏳ Loading leaderboard…</span>';
  } else {
    status.style.display = 'none';
    table.style.display = '';
  }
}

function setErrorState(message) {
  const table  = el('lb-table-wrap');
  const status = el('lb-status');
  if (!table || !status) return;
  table.style.display = 'none';
  status.style.display = 'block';
  status.innerHTML = `<span class="lb-error" role="alert">⚠️ ${escHtml(message)}</span>`;
}

function setEmptyState() {
  const table  = el('lb-table-wrap');
  const status = el('lb-status');
  if (!table || !status) return;
  table.style.display = 'none';
  status.style.display = 'block';
  status.innerHTML = '<span class="lb-empty">No scores recorded yet. Be the first!</span>';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function medalFor(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

function renderTable(data) {
  const wrap = el('lb-table-wrap');
  if (!wrap) return;
  if (!data || data.length === 0) { setEmptyState(); return; }

  const showBreakdown = data.some(row =>
    row.breakdown && Object.keys(row.breakdown).length > 0
  );

  let html = `
    <table class="lb-table" aria-label="Leaderboard">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          <th scope="col">Score</th>
          ${showBreakdown ? `
            <th scope="col">${GAME_LABELS.snake}</th>
            <th scope="col">${GAME_LABELS.crystal}</th>
            <th scope="col">${GAME_LABELS.blocktopia}</th>
            <th scope="col">${GAME_LABELS.bonus}</th>
          ` : ''}
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach((row, i) => {
    const rank = row.rank ?? (i + 1);
    const bd   = row.breakdown || {};
    html += `
      <tr class="lb-row" data-rank="${rank}" data-player="${escHtml(row.player || '')}" tabindex="0" role="button" aria-label="View breakdown for ${escHtml(row.player || 'Player')}">
        <td class="lb-rank">${medalFor(rank)}</td>
        <td class="lb-player">${escHtml(row.player || '—')}</td>
        <td class="lb-score">${Number(row.score ?? 0).toLocaleString()}</td>
        ${showBreakdown ? `
          <td class="lb-sub">${bd.snake      != null ? Number(bd.snake).toLocaleString()      : '—'}</td>
          <td class="lb-sub">${bd.crystal    != null ? Number(bd.crystal).toLocaleString()    : '—'}</td>
          <td class="lb-sub">${bd.blocktopia != null ? Number(bd.blocktopia).toLocaleString() : '—'}</td>
          <td class="lb-sub lb-bonus">${bd.bonus != null ? Number(bd.bonus).toLocaleString() : '—'}</td>
        ` : ''}
      </tr>
    `;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
  wrap.style.display = '';
  el('lb-status').style.display = 'none';

  wrap.querySelectorAll('.lb-row').forEach(tr => {
    const activate = () => {
      wrap.querySelectorAll('.lb-row').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      if (onRowSelectCallback) {
        const idx   = Number(tr.dataset.rank) - 1;
        const entry = data[idx] || data.find((d, i) => (d.rank ?? i + 1) === Number(tr.dataset.rank));
        if (entry) onRowSelectCallback(entry);
      }
    };
    tr.addEventListener('click', activate);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(); });
  });
}

// ── Core actions ──────────────────────────────────────────────────────────
async function switchTab(tab) {
  if (isFetching) return;
  currentTab = tab;
  renderTabs();
  await loadLeaderboard();
}

async function loadLeaderboard() {
  if (isFetching) return;
  isFetching = true;
  setLoadingState(true);
  try {
    const data = await fetchLeaderboard(currentTab);
    if (!Array.isArray(data)) throw new Error('Invalid response from leaderboard worker.');
    currentData = data;
    renderTable(data);
  } catch (err) {
    console.error('[arcade-leaderboard]', err);
    setErrorState(err.message || 'Could not load leaderboard.');
  } finally {
    isFetching = false;
  }
}

// ── Public init ───────────────────────────────────────────────────────────
export function initLeaderboard({ onRowSelect } = {}) {
  if (onRowSelect) onRowSelectCallback = onRowSelect;

  renderTabs();

  const refreshBtn = el('lb-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      await loadLeaderboard();
      refreshBtn.disabled = false;
    });
  }

  loadLeaderboard();
}
