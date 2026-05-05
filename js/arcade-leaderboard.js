/* ============================================================
   arcade-leaderboard.js — Shared Moonboys Arcade leaderboard UI
   Reads from the shared worker via leaderboard-client.js.
   Uses shared status copy from ui-status-copy.js.
   ============================================================ */

import { fetchLeaderboard } from '/js/leaderboard-client.js';
import { getFactionStandings } from '/js/arcade/systems/faction-war-system.js';
import { getDailyRotation } from '/js/arcade/systems/global-rotation-system.js';
import { getAllRanks } from '/js/arcade/systems/faction-ranks.js';

// Resolved text constants — use global set by ui-status-copy.js (classic script);
// fall back to literals so the module works even if the script tag is missing.
const COPY = window.UI_STATUS_COPY || {
  UNLINKED:        'Telegram not linked \u2014 run /gklink',
  API_UNAVAILABLE: 'Core API unavailable',
};

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
  bonus:      '⭐ Bonus',
};

const BREAKDOWN_GAMES = ['snake', 'crystal', 'blocktopia', 'invaders', 'pacchain', 'asteroids', 'breakout', 'tetris'];

// ── State ─────────────────────────────────────────────────────────────────
let currentMode = DEFAULT_MODE;
let currentTab = 'global';
let currentData = [];
let onRowSelectCallback = null;
let onModeChangeCallback = null;
let isFetching = false;
const PRESENCE_OFFLINE_KEY = 'moonboys_presence_hidden';

const previousRowState = new Map();

function dispatchUiState(name, detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function isPlayerOnline(row) {
  if (!row || row.online === false) return false;
  if (row.online === true || row.status === 'online') return true;
  const lastSeen = Number(row.last_seen || row.lastSeen || row.updated_at || row.timestamp);
  if (!Number.isFinite(lastSeen)) return true;
  return (Date.now() - lastSeen) < 5 * 60 * 1000;
}

function isPlayerActive(row, prev = null) {
  if (!row) return false;
  if (row.active === true || row.status === 'active') return true;
  const score = Number(row.score || 0);
  const prevScore = Number(prev && prev.score || 0);
  return score > prevScore;
}

function animateNumber(node, nextValue, opts = {}) {
  if (!node) return;
  const to = Math.max(0, Math.floor(Number(nextValue) || 0));
  const from = Math.max(0, Math.floor(Number(node.dataset.value || node.textContent || 0) || 0));
  const duration = Math.max(220, Number(opts.duration) || 700);
  if (to === from) {
    node.textContent = formatScore(to);
    node.dataset.value = String(to);
    return;
  }
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (to - from) * eased);
    node.textContent = formatScore(val);
    node.dataset.value = String(val);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

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
  if (!gate) return COPY.UNLINKED;
  const sync = typeof gate.getSyncState === 'function' ? gate.getSyncState() : null;
  if (!sync || !sync.linked) return COPY.UNLINKED;
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
  box.classList.remove('sync-state--good', 'sync-state--bad', 'sync-live', 'sync-error', 'presence-offline');
  box.classList.add(online ? 'sync-live' : 'sync-error');
  if (isPresenceHidden()) box.classList.add('presence-offline');
  box.innerHTML = linked
    ? `<strong>You are linked as ${escHtml(display)}</strong><span class="lb-linked-meta">${online ? '● Online presence visible' : (isPresenceHidden() ? '○ Presence hidden' : '○ Sync attention required')}</span>`
    : `<strong>${escHtml(COPY.UNLINKED)}</strong><span class="lb-linked-meta">Link to store ranking and Arcade XP server-side.</span>`;

  const toggle = el('lb-presence-toggle');
  if (toggle) {
    toggle.disabled = !linked;
    toggle.setAttribute('aria-pressed', isPresenceHidden() ? 'true' : 'false');
    toggle.textContent = isPresenceHidden() ? 'Show presence' : 'Hide presence';
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
      class="lb-tab interactive${t.key === currentTab ? ' active' : ''}"
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
    <button class="lb-tab interactive${currentMode === DEFAULT_MODE ? ' active' : ''}" data-mode="${DEFAULT_MODE}" aria-pressed="${currentMode === DEFAULT_MODE}">RAW</button>
    <button class="lb-tab interactive${currentMode === 'meta' ? ' active' : ''}" data-mode="meta" aria-pressed="${currentMode === 'meta'}">META</button>
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
      <span class="lb-bd-total">${formatScore(entry.score ?? 0)} · est. +${projectedXpFromScore(entry.score ?? 0)} Arcade XP</span>
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
          <th scope="col" class="lb-col-score" title="Ranking uses score only. Accepted scores can convert into Arcade XP after sync">Score (Ranking)</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach((row, i) => {
    const rank = row.rank ?? (i + 1);
    html += `
      <tr class="lb-row interactive" data-rank="${rank}" data-player="${escHtml(String(row.player || ''))}" tabindex="0" role="button" aria-label="View breakdown for ${escHtml(row.player || 'Player')}">
        <td class="lb-rank">${medalFor(rank)}</td>
        <td class="lb-player">${escHtml(row.player || '—')}</td>
        <td class="lb-faction-cell">${factionBadge(row)}</td>
        <td class="lb-score"><span class="lb-score-value" data-score-value="${Math.floor(Number(row.score ?? 0) || 0)}">${formatScore(row.score ?? 0)}</span> <span class="lb-score-sub" title="Ranking uses score only. Arcade XP is separate from score ranking.">· est. +${projectedXpFromScore(row.score ?? 0)} Arcade XP</span></td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
  wrap.style.display = '';
  el('lb-status').style.display = 'none';
  clearBreakdown();

  wrap.querySelectorAll('.lb-row').forEach((tr, idx) => {
    const row = data[idx] || {};
    const key = `${String(row.player || '').toLowerCase()}::${rankSafe(row, idx)}`;
    const prev = previousRowState.get(key);
    const online = isPlayerOnline(row);
    const active = isPlayerActive(row, prev);
    tr.classList.toggle('player-online', online);
    tr.classList.toggle('player-offline', !online);
    tr.classList.toggle('player-active', active);
    tr.classList.toggle('player-online-presence', online);
    if (prev && Number(row.score || 0) > Number(prev.score || 0)) {
      tr.classList.add('score-updated');
      dispatchUiState('moonboys:score-updated', {
        player: row.player || '',
        score: Number(row.score || 0),
        previous: Number(prev.score || 0),
        rank: rankSafe(row, idx),
        ts: Date.now(),
      });
      setTimeout(() => tr.classList.remove('score-updated'), 850);
    }
    const scoreNode = tr.querySelector('.lb-score-value');
    animateNumber(scoreNode, Number(row.score || 0), { duration: 720 });
    if (online) {
      dispatchUiState('moonboys:player-online', {
        player: row.player || '',
        rank: rankSafe(row, idx),
        game: currentTab,
        ts: Date.now(),
      });
    }
    previousRowState.set(key, { score: Number(row.score || 0), faction: row.faction || 'unaligned' });
  });

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

function rankSafe(row, i) {
  return Number(row && row.rank) || (i + 1);
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
    // Network/fetch failure (TypeError) → Core API unavailable
    // Invalid/unexpected data shape → show the original error message
    const isNetworkError = err instanceof TypeError;
    setErrorState(isNetworkError ? COPY.API_UNAVAILABLE : (err && err.message ? err.message : COPY.API_UNAVAILABLE));
  } finally {
    isFetching = false;
  }
}

// ── Faction war standings layer ───────────────────────────────────────────
// This aggregates faction contribution separately from core leaderboard scores.
// It does not modify score submission math or leaderboard core logic.

const FACTION_COLORS = {
  'diamond-hands': '#56dcff',
  'hodl-warriors': '#ff6ad5',
  graffpunks:      '#7dff72',
};

const FACTION_LABELS = {
  'diamond-hands': '💎 Diamond Hands',
  'hodl-warriors': '⚔️ HODL Warriors',
  graffpunks:      '🎨 GraffPUNKS',
};

function renderFactionStandings() {
  var container = el('lb-faction-standings');
  if (!container) {
    // Create and inject after #lb-body or #lb-table-wrap if present
    var anchor = el('lb-body') || el('lb-table-wrap') || document.querySelector('.lb-wrap, main');
    if (!anchor) return;
    container = document.createElement('div');
    container.id = 'lb-faction-standings';
    anchor.insertAdjacentElement('afterend', container);
  }

  var standings, rotation, ranks;
  try { standings = getFactionStandings(); } catch (_) { standings = []; }
  try { rotation  = getDailyRotation(); }   catch (_) { rotation = null; }
  try { ranks     = getAllRanks(); }         catch (_) { ranks = []; }

  var rankMap = {};
  ranks.forEach(function (r) { rankMap[r.faction] = r.rank; });

  var rowsHtml = standings.map(function (s, i) {
    var color  = FACTION_COLORS[s.faction] || '#8b949e';
    var label  = FACTION_LABELS[s.faction] || s.faction;
    var rank   = rankMap[s.faction] || {};
    var rankBadge = escHtml((rank.badge || '◌') + ' ' + (rank.label || 'Recruit'));
    var medal  = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    var momentum = '';
    for (var m = 0; m < (s.momentum || 0); m++) momentum += '🔥';
    return '<tr class="lb-fw-row">'
      + '<td class="lb-fw-rank">' + medal + '</td>'
      + '<td class="lb-fw-name" style="color:' + escHtml(color) + '">' + escHtml(label) + '</td>'
      + '<td class="lb-fw-power">' + formatScore(s.power) + '</td>'
      + '<td class="lb-fw-daily">' + formatScore(s.daily) + '</td>'
      + '<td class="lb-fw-weekly">' + formatScore(s.weekly) + '</td>'
      + '<td class="lb-fw-rank-badge">' + rankBadge + '</td>'
      + '<td class="lb-fw-momentum">' + (momentum || '—') + '</td>'
      + '</tr>';
  }).join('');

  var rotationHtml = rotation
    ? '<div class="lb-fw-rotation">📅 Today: ' + escHtml(rotation.label || '—') + '</div>'
    : '';

  var preSeasonCopy = (window.UI_STATUS_COPY && window.UI_STATUS_COPY.panels)
    ? window.UI_STATUS_COPY.panels.preSeasonFactionSignal()
    : '<p class="lb-fw-preseason">Faction signal is currently based on local arcade activity in this browser. '
      + 'Full server-backed seasonal war standings are a future layer.</p>';

  var allZero = standings.length > 0 && standings.every(function (s) { return s.power === 0 && s.daily === 0 && s.weekly === 0; });

  container.innerHTML = '<div class="lb-fw-section">'
    + '<h3 class="lb-fw-title">\u26A1 Faction Signal \u2014 Pre-Season</h3>'
    + preSeasonCopy
    + rotationHtml
    + (standings.length && !allZero
      ? '<table class="lb-fw-table"><thead><tr>'
        + '<th></th><th>Faction</th><th>Power</th><th>Daily</th><th>Weekly</th><th>Rank</th><th>Momentum</th>'
        + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'
      : '<p class="lb-fw-empty">No faction signal recorded yet. Choose a faction and play supported arcade games to start movement.</p>'
    )
    + '</div>';
}

function _injectFactionStandingsStyles() {
  if (document.getElementById('lb-faction-standings-styles')) return;
  var style = document.createElement('style');
  style.id = 'lb-faction-standings-styles';
  style.textContent = [
    '.lb-fw-section{margin-top:20px;background:rgba(255,255,255,.03);border:1px solid var(--color-border,#333);border-radius:16px;padding:14px 16px}',
    '.lb-fw-title{font-size:.88rem;font-weight:700;letter-spacing:.04em;color:#f7c948;margin:0 0 10px}',
    '.lb-fw-rotation{font-size:.76rem;color:#56dcff;margin-bottom:10px;border-bottom:1px solid var(--color-border,#2a2a2a);padding-bottom:8px}',
    '.lb-fw-table{width:100%;border-collapse:collapse;font-size:.78rem}',
    '.lb-fw-table th{text-align:left;padding:4px 6px;color:var(--color-text-muted,#888);font-weight:600;border-bottom:1px solid var(--color-border,#333)}',
    '.lb-fw-table td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.lb-fw-rank{font-size:1rem;width:28px}',
    '.lb-fw-power{font-weight:700}',
    '.lb-fw-rank-badge{font-size:.72rem;color:var(--color-text-muted,#aaa)}',
    '.lb-fw-momentum{font-size:.78rem}',
    '.lb-fw-empty{font-size:.78rem;color:var(--color-text-muted,#888);margin:0}',
    '.lb-fw-preseason{font-size:.76rem;color:var(--color-text-muted,#888);margin:0 0 10px;font-style:italic}',
  ].join('');
  document.head.appendChild(style);
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
    refreshBtn.classList.add('interactive');
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      await loadLeaderboard();
      refreshBtn.disabled = false;
    });
  }

  const presenceToggle = el('lb-presence-toggle');
  if (presenceToggle) {
    presenceToggle.classList.add('interactive');
    presenceToggle.addEventListener('click', () => {
      setPresenceHidden(!isPresenceHidden());
      renderLinkedPresence();
    });
  }
  renderLinkedPresence();
  document.addEventListener('arcade:submission-status', function (event) {
    renderLinkedPresence();
    const detail = event && event.detail ? event.detail : {};
    if (detail.state === 'xp_awarded') dispatchUiState('moonboys:xp-gain', { amount: Number(detail.awardedXp || 0), total: Number(detail.totalXp || 0), ts: Date.now() });
  });

  var _bus = window.MOONBOYS_EVENT_BUS;
  _bus.on('faction:update', function () {
    var badge = document.querySelector('.lb-row.selected .lb-faction');
    if (!badge) return;
    badge.classList.add('faction-boost');
    setTimeout(function () { badge.classList.remove('faction-boost'); }, 1200);
  });
  _bus.on('activity:event', function (detail) {
    if (detail._src !== 'moonboys:score-updated') return;
    if (!detail.player) return;
    var target = Array.from(document.querySelectorAll('.lb-row')).find(function (rowNode) {
      return String(rowNode.dataset.player || '').toLowerCase() === String(detail.player || '').toLowerCase();
    });
    if (!target) return;
    target.classList.add('score-updated', 'player-active');
    var scoreNode = target.querySelector('.lb-score-value');
    if (scoreNode && Number.isFinite(Number(detail.score))) {
      animateNumber(scoreNode, Number(detail.score || 0), { duration: 760 });
    }
    setTimeout(function () { target.classList.remove('score-updated'); }, 850);
  });
  window.addEventListener('storage', function (event) {
    if (!event || event.key !== PRESENCE_OFFLINE_KEY) return;
    renderLinkedPresence();
  });

  // Inject faction war standings below the core leaderboard (separate from score logic)
  _injectFactionStandingsStyles();
  renderFactionStandings();

  // Refresh standings when faction war data changes
  var _busRef = window.MOONBOYS_EVENT_BUS;
  if (_busRef && typeof _busRef.on === 'function') {
    _busRef.on('faction:war:contribution', function () { renderFactionStandings(); });
  }

  loadLeaderboard();
}
