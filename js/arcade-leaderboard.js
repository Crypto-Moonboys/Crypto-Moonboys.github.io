/* ============================================================
   arcade-leaderboard.js — Shared Moonboys Arcade leaderboard UI
   Reads from the shared worker via leaderboard-client.js.
   No external dependencies.
   ============================================================ */

import { fetchLeaderboard } from '/js/leaderboard-client.js';

// ── Constants ─────────────────────────────────────────────────────────────
const RAW_TABS = [
  { key: 'global',     label: '🌐 Global',     icon: '🌐' },
  { key: 'snake',      label: '🐍 Snake',       icon: '🐍' },
  { key: 'crystal',    label: '🧩 Crystal',     icon: '🧩' },
  { key: 'blocktopia', label: '🧱 BlockTopia',  icon: '🧱' },
  { key: 'invaders',   label: '👾 Invaders',    icon: '👾' },
  { key: 'pacchain',   label: '🟡 Pac-Chain',   icon: '🟡' },
  { key: 'asteroids',  label: '🌑 Asteroids',   icon: '🌑' },
  { key: 'breakout',   label: '🧱 Bullrun',     icon: '🧱' },
  { key: 'tetris',     label: '🟦 Tetris',      icon: '🟦' },
  { key: 'hexgl',      label: '🏁 HexGL',       icon: '🏁' },
];

const META_TABS = [
  { key: 'daily',    label: '📆 Daily',    icon: '📆' },
  { key: 'weekly',   label: '🗓️ Weekly',   icon: '🗓️' },
  { key: 'seasonal', label: '🏆 Seasonal', icon: '🏆' },
];
const DEFAULT_MODE = 'raw';

const AGGREGATE_TABS = new Set(['global']);

const GAME_LABELS = {
  snake:      '🐍 Snake',
  crystal:    '🧩 Crystal',
  blocktopia: '🧱 BlockTopia',
  invaders:   '👾 Invaders',
  pacchain:   '🟡 Pac-Chain',
  asteroids:  '🌑 Asteroids',
  breakout:   '🧱 Bullrun',
  tetris:     '🟦 Tetris',
  hexgl:      '🏁 HexGL',
  bonus:      '⭐ Bonus',
};

const BREAKDOWN_GAMES = ['snake', 'crystal', 'blocktopia', 'invaders', 'pacchain', 'asteroids', 'breakout', 'tetris', 'hexgl'];

// ── State ─────────────────────────────────────────────────────────────────
let currentMode = DEFAULT_MODE;
let currentTab = 'global';
let currentData = [];
let onRowSelectCallback = null;
let onModeChangeCallback = null;
let isFetching = false;
const PRESENCE_OFFLINE_KEY = 'moonboys_presence_hidden';

// ── DOM helpers ───────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return Math.floor(num).toLocaleString('en-GB');
}

function projectedXpFromScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(Math.floor(num / 1000), 100);
}

function factionBadge(row) {
  var api = (typeof window !== 'undefined') ? window.MOONBOYS_FACTION : null;
  var key = api && typeof api.normalizeFaction === 'function'
    ? api.normalizeFaction(row && row.faction)
    : String((row && row.faction) || 'unaligned');
  var meta = api && typeof api.getVisualMeta === 'function'
    ? api.getVisualMeta(key)
    : { icon: '◌', label: 'Unaligned', color: '#8b949e' };
  var safeLabel = escHtml((meta && meta.label) || 'Unaligned');
  var safeIcon = escHtml((meta && meta.icon) || '◌');
  var safeColor = escHtml((meta && meta.color) || '#8b949e');
  return `<span class="lb-faction" style="--faction-color:${safeColor}">${safeIcon} ${safeLabel}</span>`;
}

function isPresenceHidden() {
  try { return localStorage.getItem(PRESENCE_OFFLINE_KEY) === '1'; } catch { return false; }
}

function setPresenceHidden(hidden) {
  try { localStorage.setItem(PRESENCE_OFFLINE_KEY, hidden ? '1' : '0'); } catch {}
}

function getIdentityApi() {
  return (typeof window !== 'undefined' && window.MOONBOYS_IDENTITY) ? window.MOONBOYS_IDENTITY : null;
}

function getCurrentIdentityLabel() {
  const gate = getIdentityApi();
  if (!gate) return 'Not linked';
  const sync = typeof gate.getSyncState === 'function' ? gate.getSyncState() : null;
  if (!sync || !sync.linked) return 'Not linked';
  const name = typeof gate.getTelegramName === 'function' ? gate.getTelegramName() : null;
  const auth = typeof gate.getTelegramAuth === 'function' ? gate.getTelegramAuth() : null;
  const username = auth && (auth.username || auth.user?.username) ? String(auth.username || auth.user.username).replace(/^@/, '') : '';
  if (name && username) return `${name} (@${username})`;
  if (name) return String(name);
  if (username) return `@${username}`;
  return 'Linked Telegram account';
}

function renderLinkedPresence() {
  const box = el('lb-linked-identity');
  if (!box) return;
  const gate = getIdentityApi();
  const sync = gate && typeof gate.getSyncState === 'function' ? gate.getSyncState() : null;
  const linked = !!(sync && sync.linked);
  const online = !!(sync && sync.good && !isPresenceHidden());
  const display = getCurrentIdentityLabel();
  box.classList.remove('sync-state--good', 'sync-state--bad', 'presence-offline');
  box.classList.add(online ? 'sync-state--good' : 'sync-state--bad');
  if (isPresenceHidden()) box.classList.add('presence-offline');
  box.innerHTML = linked
    ? `<strong>You are linked as ${escHtml(display)}</strong><span class="lb-linked-meta">${online ? '● Online presence visible' : (isPresenceHidden() ? '○ Showing as offline' : '○ Sync attention required')}</span>`
    : '<strong>You are linked as Not linked</strong><span class="lb-linked-meta">Run /gklink to store ranking/XP server-side.</span>';

  const toggle = el('lb-presence-toggle');
  if (toggle) {
    toggle.disabled = !linked;
    toggle.setAttribute('aria-pressed', isPresenceHidden() ? 'true' : 'false');
    toggle.textContent = isPresenceHidden() ? 'Show as online' : 'Show as offline';
  }
}

function medalFor(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

function renderTabs() {
  const bar = el('lb-tab-bar');
  if (!bar) return;
  const tabs = currentMode === 'meta' ? META_TABS : RAW_TABS;
  bar.innerHTML = tabs.map(t => `
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

function renderModeToggle() {
  const wrap = el('lb-mode-toggle');
  if (!wrap) return;
  wrap.innerHTML = `
    <button class="lb-tab${currentMode === DEFAULT_MODE ? ' active' : ''}" data-mode="${DEFAULT_MODE}" aria-pressed="${currentMode === DEFAULT_MODE}">RAW</button>
    <button class="lb-tab${currentMode === 'meta' ? ' active' : ''}" data-mode="meta" aria-pressed="${currentMode === 'meta'}">META</button>
  `;
  wrap.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });
}

function setLoadingState(loading) {
  const wrap   = el('lb-table-wrap');
  const status = el('lb-status');
  const panel  = el('lb-breakdown-panel');
  if (!wrap || !status) return;
  if (loading) {
    wrap.style.display = 'none';
    if (panel) panel.style.display = 'none';
    status.style.display = 'block';
    status.innerHTML = '<span class="lb-spinner" aria-live="polite">⏳ Loading leaderboard…</span>';
  } else {
    status.style.display = 'none';
    wrap.style.display = '';
  }
}

function setErrorState(message) {
  const wrap   = el('lb-table-wrap');
  const status = el('lb-status');
  const panel  = el('lb-breakdown-panel');
  if (!wrap || !status) return;
  wrap.style.display = 'none';
  if (panel) panel.style.display = 'none';
  status.style.display = 'block';
  status.innerHTML = `<span class="lb-error" role="alert">⚠️ ${escHtml(message)}</span>`;
}

function setEmptyState() {
  const wrap   = el('lb-table-wrap');
  const status = el('lb-status');
  const panel  = el('lb-breakdown-panel');
  if (!wrap || !status) return;
  wrap.style.display = 'none';
  if (panel) panel.style.display = 'none';
  status.style.display = 'block';
  status.innerHTML = '<span class="lb-empty">No scores recorded yet. Be the first!</span>';
}

// ── Breakdown panel ───────────────────────────────────────────────────────
function renderBreakdown(entry) {
  const panel = el('lb-breakdown-panel');
  if (!panel) return;
  if (!entry || currentMode !== DEFAULT_MODE || !AGGREGATE_TABS.has(currentTab)) {
    panel.style.display = 'none';
    return;
  }

  const bd = entry.breakdown || {};

  const rows = BREAKDOWN_GAMES.map(g => {
    const val = bd[g] != null ? formatScore(bd[g]) : '—';
    return `<div class="lb-bd-row">
      <span class="lb-bd-label">${GAME_LABELS[g]}</span>
      <span class="lb-bd-val">${val}</span>
    </div>`;
  });

  const bonus = bd.variety_bonus != null ? formatScore(bd.variety_bonus) : '—';
  rows.push(`<div class="lb-bd-row lb-bd-bonus">
    <span class="lb-bd-label">${GAME_LABELS.bonus}</span>
    <span class="lb-bd-val">${bonus}</span>
  </div>`);

  panel.innerHTML = `
    <div class="lb-bd-header">
      <span class="lb-bd-player">${escHtml(entry.player || '—')}</span>
      <span class="lb-bd-total">${formatScore(entry.score ?? 0)} · est. +${projectedXpFromScore(entry.score ?? 0)} XP</span>
    </div>
    <div class="lb-bd-grid">${rows.join('')}</div>
  `;
  panel.style.display = '';
}

function clearBreakdown() {
  const panel = el('lb-breakdown-panel');
  if (panel) panel.style.display = 'none';
}

// ── Table renderer ────────────────────────────────────────────────────────
function renderTable(data) {
  const wrap = el('lb-table-wrap');
  if (!wrap) return;
  if (!data || data.length === 0) { setEmptyState(); return; }

  let html = `
    <table class="lb-table" aria-label="Leaderboard">
      <thead>
        <tr>
          <th scope="col" class="lb-col-rank">#</th>
          <th scope="col" class="lb-col-player">Player</th>
          <th scope="col" class="lb-col-faction">Faction</th>
          <th scope="col" class="lb-col-score" title="Ranking uses score only. Accepted scores can convert into Block Topia XP after sync">Score (Ranking)</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach((row, i) => {
    const rank = row.rank ?? (i + 1);
    html += `
      <tr class="lb-row" data-rank="${rank}" tabindex="0" role="button" aria-label="View breakdown for ${escHtml(row.player || 'Player')}">
        <td class="lb-rank">${medalFor(rank)}</td>
        <td class="lb-player">${escHtml(row.player || '—')}</td>
        <td class="lb-faction-cell">${factionBadge(row)}</td>
        <td class="lb-score">${formatScore(row.score ?? 0)} <span class="lb-score-sub" title="Ranking uses score only. XP stays secondary to score.">· est. +${projectedXpFromScore(row.score ?? 0)} XP</span></td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
  wrap.style.display = '';
  el('lb-status').style.display = 'none';
  clearBreakdown();

  wrap.querySelectorAll('.lb-row').forEach(tr => {
    const activate = () => {
      wrap.querySelectorAll('.lb-row').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      const idx   = rowIndexForRank(data, Number(tr.dataset.rank));
      const entry = data[idx];
      if (entry) {
        if (onRowSelectCallback) onRowSelectCallback(entry);
        renderBreakdown(entry);
      }
    };
    tr.addEventListener('click', activate);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(); });
  });
}

function rowIndexForRank(data, rank) {
  const byRank = data.findIndex((d, i) => (d.rank ?? i + 1) === rank);
  return byRank >= 0 ? byRank : rank - 1;
}

// ── Core actions ──────────────────────────────────────────────────────────
async function switchTab(tab) {
  if (isFetching) return;
  if (tab === currentTab) return;
  currentTab = tab;
  renderTabs();
  if (onModeChangeCallback) onModeChangeCallback({ mode: currentMode, tab: currentTab });
  await loadLeaderboard();
}

async function switchMode(mode) {
  if (isFetching) return;
  const nextMode = mode === 'meta' ? 'meta' : DEFAULT_MODE;
  if (nextMode === currentMode) return;
  currentMode = nextMode;
  currentTab = currentMode === 'meta' ? 'daily' : 'global';
  currentData = [];
  renderModeToggle();
  renderTabs();
  clearBreakdown();
  if (onModeChangeCallback) onModeChangeCallback({ mode: currentMode, tab: currentTab });
  await loadLeaderboard();
}

async function loadLeaderboard() {
  if (isFetching) return;
  isFetching = true;
  setLoadingState(true);
  try {
    const data = await fetchLeaderboard(currentTab, { mode: currentMode });
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
export function initLeaderboard({ onRowSelect, onModeChange } = {}) {
  if (onRowSelect) onRowSelectCallback = onRowSelect;
  if (typeof onModeChange === 'function') onModeChangeCallback = onModeChange;

  renderModeToggle();
  renderTabs();
  if (onModeChangeCallback) onModeChangeCallback({ mode: currentMode, tab: currentTab });

  const refreshBtn = el('lb-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      await loadLeaderboard();
      refreshBtn.disabled = false;
    });
  }

  const presenceToggle = el('lb-presence-toggle');
  if (presenceToggle) {
    presenceToggle.addEventListener('click', () => {
      setPresenceHidden(!isPresenceHidden());
      renderLinkedPresence();
    });
  }
  renderLinkedPresence();
  document.addEventListener('arcade:submission-status', renderLinkedPresence);
  window.addEventListener('storage', function (event) {
    if (!event || event.key !== PRESENCE_OFFLINE_KEY) return;
    renderLinkedPresence();
  });

  loadLeaderboard();
}
