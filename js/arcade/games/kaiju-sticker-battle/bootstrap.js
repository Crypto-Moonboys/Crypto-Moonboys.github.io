import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { KAIJU_ASSETS, KAIJU_CARDS, KAIJU_CATEGORIES, KAIJU_STICKER_BATTLE_CONFIG } from './config.js';

const GAME_ID = KAIJU_STICKER_BATTLE_CONFIG.id;
const BATTLES_PER_MATCH = 5;

const imageCache = new Map();

function byId(id) {
  return KAIJU_CARDS.find((card) => card.id === id) || KAIJU_CARDS[0];
}

function pickOpponent(playerCard) {
  const pool = KAIJU_CARDS.filter((card) => card.id !== playerCard.id);
  return pool[Math.floor(Math.random() * pool.length)] || KAIJU_CARDS[1];
}

function statRows(card) {
  return KAIJU_CATEGORIES.map((cat) => {
    const value = Number(card.stats[cat.key]) || 0;
    return `<li><img src="${cat.asset}" alt="${cat.name}"><strong>${value}</strong></li>`;
  }).join('');
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const image = new Image();
  image.decoding = 'async';
  const promise = new Promise((resolve) => {
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
  });
  image.src = src;
  imageCache.set(src, promise);
  return promise;
}

function renderBattleCard(card, label, score, highlight = false) {
  const statLine = KAIJU_CATEGORIES.map((cat) => {
    const value = Number(card.stats[cat.key]) || 0;
    return `<span>${cat.label}: <strong>${value}</strong></span>`;
  }).join('');
  return `
    <article class="battle-card${highlight ? ' selected' : ''}">
      <div class="battle-card-meta"><span>${label}</span><span>${score != null ? score : 'Idle'}</span></div>
      <h3>${card.name}</h3>
      <div class="battle-card-art"><img src="${card.image}" alt="${card.name}"></div>
      <div class="battle-card-meta">${statLine}</div>
    </article>
  `;
}

function renderCard(card, selected) {
  return `
    <button class="kaiju-card${selected ? ' selected' : ''}" type="button" data-card-id="${card.id}" aria-pressed="${selected ? 'true' : 'false'}">
      <span class="kaiju-card-name">${card.name}</span>
      <span class="kaiju-card-art" aria-hidden="true">
        <img src="${card.image}" alt="">
      </span>
      <ol class="kaiju-stat-list">${statRows(card)}</ol>
    </button>
  `;
}

function renderResult(result) {
  if (!result) {
    return `
      <span class="kaiju-result-badges" aria-hidden="true">
        <img src="${KAIJU_ASSETS.telegramLinked}" alt="">
        <img src="${KAIJU_ASSETS.xpReady}" alt="">
      </span>
      <span>Choose your sticker card, then roll the battle category.</span>
    `;
  }
  const outcome = result.tie ? 'Draw' : (result.playerWon ? 'You win' : 'CPU wins');
  const outcomeAsset = result.tie ? KAIJU_ASSETS.draw : (result.playerWon ? KAIJU_ASSETS.win : KAIJU_ASSETS.winnerCard);
  const submitLine = result.submitted
    ? `<span class="kaiju-result-badges"><img src="${KAIJU_ASSETS.xp}" alt=""> <span>Match submitted: ${result.totalScore}</span></span>`
    : `<span>Match progress: ${result.matchBattle}/${BATTLES_PER_MATCH}</span>`;
  return `
    <img class="kaiju-result-stamp" src="${outcomeAsset}" alt="">
    <strong>${outcome}: ${result.category.name}</strong>
    <img class="kaiju-result-category" src="${result.category.asset}" alt="${result.category.name}">
    <div class="battle-box">
      ${renderBattleCard(result.player, 'You', result.playerValue, true)}
      <div class="battle-vs">VS</div>
      ${renderBattleCard(result.opponent, result.mode === 'duel' ? 'Telegram Rival' : 'CPU Kaiju', result.opponentValue)}
    </div>
    ${submitLine}
  `;
}

async function drawCanvas(canvas, state) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#080a12';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f7ab1a';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#f7ab1a';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KAIJU STICKER BATTLE', w / 2, 58);

  const [playerImg, opponentImg] = await Promise.all([
    loadImage(state.playerCard.image),
    loadImage(state.opponentCard ? state.opponentCard.image : ''),
  ]);
  const cardW = 255;
  const cardH = 340;
  const leftX = 185;
  const rightX = w - leftX - cardW;
  const topY = 138;
  const cardRadius = 24;

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function drawCard(image, x, y, title, statValue) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    roundRect(x, y, cardW, cardH, cardRadius);
    ctx.fill();
    ctx.strokeStyle = '#f7ab1a';
    ctx.lineWidth = 3;
    roundRect(x, y, cardW, cardH, cardRadius);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(title, x + cardW / 2, y + 30);
    if (image) {
      const artW = cardW - 26;
      const artH = 240;
      const artX = x + 13;
      const artY = y + 48;
      ctx.fillStyle = '#080a12';
      roundRect(artX, artY, artW, artH, 18);
      ctx.fill();
      const scale = Math.min(artW / image.width, artH / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      ctx.drawImage(image, artX + (artW - drawW) / 2, artY + (artH - drawH) / 2, drawW, drawH);
    }
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`Score: ${statValue}`, x + cardW / 2, y + cardH - 18);
    ctx.restore();
  }

  drawCard(playerImg, leftX, topY, state.playerCard.name, state.lastResult ? state.lastResult.playerValue : '-');
  drawCard(opponentImg, rightX, topY, state.opponentCard ? state.opponentCard.name : 'CPU Kaiju', state.lastResult ? state.lastResult.opponentValue : '-');
  ctx.fillStyle = state.lastResult ? (state.lastResult.tie ? '#cbd5e1' : (state.lastResult.playerWon ? '#7dff72' : '#ff6b6b')) : '#f7ab1a';
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.fillText(state.lastResult ? (state.lastResult.tie ? 'DRAW' : (state.lastResult.playerWon ? 'YOU WIN' : 'CPU WINS')) : 'VS', w / 2, 338);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(state.lastResult ? `${state.lastResult.category.label}: ${state.lastResult.playerValue} - ${state.lastResult.opponentValue}` : 'Roll 1-6 to choose the stat category.', w / 2, 386);
}

export function bootstrapKaijuStickerBattle(root) {
  const state = {
    playerCard: KAIJU_CARDS[0],
    opponentCard: KAIJU_CARDS[1],
    mode: 'cpu',
    roomState: 'ready',
    matchComplete: false,
    score: 0,
    battles: 0,
    wins: 0,
    lastResult: null,
  };

  const canvas = document.getElementById('kaijuCanvas');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const winsEl = document.getElementById('wins');
  const rollEl = document.getElementById('roll');
  const categoryEl = document.getElementById('category');
  const resultEl = document.getElementById('battleResult');
  const cardGrid = document.getElementById('kaijuCardGrid');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const cpuModeBtn = document.getElementById('cpuModeBtn');
  const duelModeBtn = document.getElementById('duelModeBtn');
  const inviteModeBtn = document.getElementById('inviteModeBtn');
  const restartModeBtn = document.getElementById('restartModeBtn');
  const modeTitle = document.getElementById('modeTitle');
  const modePill = document.getElementById('modePill');
  const modeCopy = document.getElementById('modeCopy');
  const roomCopy = document.getElementById('roomCopy');
  const handleCpuMode = () => setMode('cpu');
  const handleDuelMode = () => setMode('duel');
  const handleInviteMode = () => setMode('invite');

  function updateHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(ArcadeSync.getHighScore(GAME_ID));
    winsEl.textContent = `${state.wins}/${state.battles}`;
    rollEl.innerHTML = state.lastResult
      ? `<span class="kaiju-hud-roll"><img src="${state.lastResult.roll === 1 ? KAIJU_ASSETS.diceOne : KAIJU_ASSETS.diceSix}" alt=""> ${state.lastResult.roll}</span>`
      : '-';
    categoryEl.innerHTML = state.lastResult
      ? `<img class="kaiju-hud-category" src="${state.lastResult.category.asset}" alt="${state.lastResult.category.name}">`
      : '-';
    resultEl.innerHTML = renderResult(state.lastResult);
    cardGrid.innerHTML = KAIJU_CARDS.map((card) => renderCard(card, card.id === state.playerCard.id)).join('');
    cpuModeBtn.dataset.active = String(state.mode === 'cpu');
    duelModeBtn.dataset.active = String(state.mode === 'duel');
    inviteModeBtn.dataset.active = String(state.mode === 'invite');
    restartModeBtn.dataset.active = 'false';
    modeTitle.textContent = state.mode === 'cpu'
      ? 'Mode: VS CPU'
      : (state.mode === 'duel' ? 'Mode: Waiting for players' : 'Mode: 2 Telegram users');
    modePill.dataset.mode = state.mode;
    modePill.textContent = state.mode === 'cpu'
      ? 'Ready to battle'
      : (state.mode === 'duel' ? 'Waiting for players' : 'Invite another Telegram user');
    modeCopy.textContent = state.mode === 'cpu'
      ? (state.matchComplete
        ? 'Match complete. Reset to start a new five-round set.'
        : 'Pick a Kaiju, then roll against a CPU opponent.')
      : (state.mode === 'duel'
        ? 'Tap waiting to hold your place while another player joins.'
        : 'Use this mode to challenge another Telegram user when paired.');
    roomCopy.textContent = state.mode === 'cpu'
      ? 'Single-player mode is instant.'
      : 'Waiting button is ready for multiplayer matchmaking integration.';
    drawCanvas(canvas, state);
  }

  async function battle() {
    if (state.matchComplete) {
      state.lastResult = {
        tie: false,
        playerWon: false,
        category: { name: 'Match complete', label: 'Match Complete', asset: KAIJU_ASSETS.winnerCard },
        player: state.playerCard,
        opponent: state.opponentCard,
        playerValue: state.score,
        opponentValue: state.score,
        submitted: true,
        totalScore: state.score,
        matchBattle: BATTLES_PER_MATCH,
        mode: state.mode,
      };
      updateHud();
      return;
    }
    if (state.mode !== 'cpu') {
      state.roomState = state.mode === 'duel' ? 'waiting_for_player' : 'awaiting_telegram_pair';
      state.lastResult = null;
      updateHud();
      return;
    }
    state.opponentCard = pickOpponent(state.playerCard);
    const roll = 1 + Math.floor(Math.random() * 6);
    const category = KAIJU_CATEGORIES[roll - 1];
    const playerValue = Number(state.playerCard.stats[category.key]) || 0;
    const opponentValue = Number(state.opponentCard.stats[category.key]) || 0;
    const tie = playerValue === opponentValue;
    const playerWon = playerValue > opponentValue;
    const margin = Math.abs(playerValue - opponentValue);
    const score = tie ? 500 : (playerWon ? 1000 + (margin * 150) : Math.max(100, 350 - (margin * 50)));

    state.battles += 1;
    if (playerWon) state.wins += 1;
    state.score += score;
    const matchBattle = state.battles % BATTLES_PER_MATCH || BATTLES_PER_MATCH;
    const shouldSubmit = matchBattle === BATTLES_PER_MATCH;
    state.lastResult = { roll, category, player: state.playerCard, opponent: state.opponentCard, playerValue, opponentValue, tie, playerWon, score, totalScore: state.score, matchBattle, submitted: shouldSubmit, mode: state.mode };
    ArcadeSync.setHighScore(GAME_ID, state.score);
    updateHud();

    if (shouldSubmit) {
      await submitScore(ArcadeSync.getPlayer(), state.score, GAME_ID);
      state.matchComplete = true;
      updateHud();
    }
  }

  function reset() {
    state.score = 0;
    state.battles = 0;
    state.wins = 0;
    state.lastResult = null;
    state.opponentCard = pickOpponent(state.playerCard);
    state.roomState = 'ready';
    state.matchComplete = false;
    updateHud();
  }

  function setMode(mode) {
    state.mode = mode;
    if (mode === 'cpu') state.roomState = 'ready';
    if (mode === 'duel') state.roomState = 'waiting_for_player';
    if (mode === 'invite') state.roomState = 'invite_wait';
    if (mode !== 'cpu') state.matchComplete = false;
    state.lastResult = null;
    updateHud();
  }

  function onCardClick(event) {
    const button = event.target.closest('[data-card-id]');
    if (!button) return;
    state.playerCard = byId(button.getAttribute('data-card-id'));
    state.opponentCard = pickOpponent(state.playerCard);
    state.lastResult = null;
    updateHud();
  }

  return {
    async init() {
      cardGrid.addEventListener('click', onCardClick);
      startBtn.addEventListener('click', battle);
      resetBtn.addEventListener('click', reset);
      cpuModeBtn.addEventListener('click', handleCpuMode);
      duelModeBtn.addEventListener('click', handleDuelMode);
      inviteModeBtn.addEventListener('click', handleInviteMode);
      restartModeBtn.addEventListener('click', reset);
      reset();
    },
    start: battle,
    pause() {},
    resume() {},
    reset,
    destroy() {
      cardGrid.removeEventListener('click', onCardClick);
      startBtn.removeEventListener('click', battle);
      resetBtn.removeEventListener('click', reset);
      cpuModeBtn.removeEventListener('click', handleCpuMode);
      duelModeBtn.removeEventListener('click', handleDuelMode);
      inviteModeBtn.removeEventListener('click', handleInviteMode);
      restartModeBtn.removeEventListener('click', reset);
    },
    getScore() {
      return state.score;
    },
  };
}

export const KAIJU_STICKER_BATTLE_ADAPTER = Object.freeze({
  id: GAME_ID,
  name: KAIJU_STICKER_BATTLE_CONFIG.label,
  legacyBootstrap: bootstrapKaijuStickerBattle,
});
