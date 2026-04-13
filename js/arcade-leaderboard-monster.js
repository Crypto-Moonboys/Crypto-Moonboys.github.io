import { fetchLeaderboard } from '/js/leaderboard-client.js';

const TABS = [
  { key: 'global',     label: '🌐 Global' },
  { key: 'seasonal',   label: '🗓️ Seasonal' },
  { key: 'yearly',     label: '📅 Yearly' },
  { key: 'all-time',   label: '🏛️ All-Time' },
  { key: 'snake',      label: '🐍 Snake' },
  { key: 'crystal',    label: '🧩 Crystal' },
  { key: 'blocktopia', label: '🧱 BlockTopia' },
  { key: 'invaders',   label: '👾 Invaders' },
  { key: 'pacchain',   label: '🟡 Pac-Chain' },
  { key: 'asteroids',  label: '🌑 Asteroids' },
  { key: 'breakout',   label: '🧱 Bullrun' },
  { key: 'tetris',     label: '🟦 Tetris' },
  { key: 'hexgl',      label: '🏁 HexGL' },
];

const GAME_LABELS = {
  snake:'🐍 Snake',crystal:'🧩 Crystal',blocktopia:'🧱 BlockTopia',invaders:'👾 Invaders',pacchain:'🟡 Pac-Chain',asteroids:'🌑 Asteroids',breakout:'🧱 Bullrun',tetris:'🟦 Tetris',hexgl:'🏁 HexGL',bonus:'⭐ Bonus'
};

let currentTab='global', onRowSelectCallback=null, isFetching=false;
const AGGREGATE_TABS = new Set(['global','seasonal','yearly','all-time']);
const BREAKDOWN_GAMES = ['snake','crystal','blocktopia','invaders','pacchain','asteroids','breakout','tetris','hexgl'];

function el(id){ return document.getElementById(id); }
function escHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }
function medalFor(rank){ return rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':String(rank); }
function rowIndexForRank(data, rank){ const byRank=data.findIndex((d,i)=>(d.rank ?? i+1)===rank); return byRank>=0?byRank:rank-1; }

function renderTabs(){
  const bar=el('lb-tab-bar'); if(!bar) return;
  bar.innerHTML=TABS.map(t=>`<button class="lb-tab${t.key===currentTab?' active':''}" data-tab="${t.key}" aria-selected="${t.key===currentTab}" role="tab">${t.label}</button>`).join('');
  bar.querySelectorAll('.lb-tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
}
function setLoadingState(){ const table=el('lb-table-wrap'), status=el('lb-status'); if(!table||!status) return; table.style.display='none'; status.style.display='block'; status.innerHTML='<span class="lb-spinner" aria-live="polite">⏳ Loading leaderboard…</span>'; }
function setErrorState(msg){ const table=el('lb-table-wrap'), status=el('lb-status'); if(!table||!status) return; table.style.display='none'; status.style.display='block'; status.innerHTML=`<span class="lb-error" role="alert">⚠️ ${escHtml(msg)}</span>`; }
function setEmptyState(){ const table=el('lb-table-wrap'), status=el('lb-status'); if(!table||!status) return; table.style.display='none'; status.style.display='block'; status.innerHTML='<span class="lb-empty">No scores recorded yet. Be the first!</span>'; }

function renderTable(data){
  const wrap=el('lb-table-wrap'); if(!wrap) return;
  if(!data||data.length===0){ setEmptyState(); return; }
  const showBreakdown=data.some(row=>row.breakdown&&Object.keys(row.breakdown).length>0);
  const isAggregate=AGGREGATE_TABS.has(currentTab);
  let html=`<table class="lb-table" aria-label="Leaderboard"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Score</th>${showBreakdown&&isAggregate ? BREAKDOWN_GAMES.map(g=>`<th scope="col" class="lb-hide-mobile">${GAME_LABELS[g]}</th>`).join('') + `<th scope="col" class="lb-hide-mobile">${GAME_LABELS.bonus}</th>` : ''}</tr></thead><tbody>`;
  data.forEach((row,i)=>{
    const rank=row.rank ?? (i+1); const bd=row.breakdown||{};
    html += `<tr class="lb-row" data-rank="${rank}" data-player="${escHtml(row.player||'')}" tabindex="0" role="button" aria-label="View breakdown for ${escHtml(row.player||'Player')}"><td class="lb-rank">${medalFor(rank)}</td><td class="lb-player">${escHtml(row.player||'—')}</td><td class="lb-score">${Number(row.score ?? 0).toLocaleString()}</td>${showBreakdown&&isAggregate ? BREAKDOWN_GAMES.map(g=>`<td class="lb-sub lb-hide-mobile">${bd[g] != null ? Number(bd[g]).toLocaleString() : '—'}</td>`).join('') + `<td class="lb-sub lb-bonus lb-hide-mobile">${bd.variety_bonus != null ? Number(bd.variety_bonus).toLocaleString() : '—'}</td>` : ''}</tr>`;
  });
  html+='</tbody></table>';
  wrap.innerHTML=html; wrap.style.display=''; el('lb-status').style.display='none';
  wrap.querySelectorAll('.lb-row').forEach(tr=>{
    const activate=()=>{ wrap.querySelectorAll('.lb-row').forEach(r=>r.classList.remove('selected')); tr.classList.add('selected'); if(onRowSelectCallback){ const idx=rowIndexForRank(data, Number(tr.dataset.rank)); const entry=data[idx]; if(entry) onRowSelectCallback(entry);} };
    tr.addEventListener('click', activate); tr.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' ') activate();});
  });
}

async function switchTab(tab){ if(isFetching) return; currentTab=tab; renderTabs(); await loadLeaderboard(); }
async function loadLeaderboard(){ if(isFetching) return; isFetching=true; setLoadingState(); try{ const data=await fetchLeaderboard(currentTab); if(!Array.isArray(data)) throw new Error('Invalid response from leaderboard worker.'); renderTable(data); } catch(err){ console.error('[arcade-leaderboard-monster]', err); setErrorState(err.message || 'Could not load leaderboard.'); } finally { isFetching=false; } }

export function initLeaderboardMonster({ onRowSelect } = {}){
  if(onRowSelect) onRowSelectCallback=onRowSelect;
  renderTabs();
  const refreshBtn=el('lb-refresh-btn');
  if(refreshBtn){ refreshBtn.addEventListener('click', async ()=>{ refreshBtn.disabled=true; await loadLeaderboard(); refreshBtn.disabled=false; }); }
  loadLeaderboard();
}
