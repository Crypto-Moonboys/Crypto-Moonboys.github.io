import { ArcadeSync } from '/js/arcade-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { KAIJU_ASSETS, KAIJU_CARDS, KAIJU_CATEGORIES, KAIJU_STICKER_BATTLE_CONFIG } from './config.js';

const GAME_ID = KAIJU_STICKER_BATTLE_CONFIG.id;
const BATTLES_PER_MATCH = 5;

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

function renderCard(card, selected) {
  const initials = card.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase();
  return `
    <button class="kaiju-card${selected ? ' selected' : ''}" type="button" data-card-id="${card.id}" aria-pressed="${selected ? 'true' : 'false'}">
      <span class="kaiju-card-name">${card.name}</span>
      <span class="kaiju-card-art" aria-hidden="true">
        <img src="${selected ? KAIJU_ASSETS.cardFrameGold : KAIJU_ASSETS.cardFrameSilver}" alt="">
        <span>${initials}</span>
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
    <span>${result.player.name} ${result.playerValue} vs ${result.opponent.name} ${result.opponentValue}</span>
    ${submitLine}
  `;
}

function drawCanvas(canvas, state) {
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
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(state.playerCard.name, w * 0.28, 150);
  ctx.fillText(state.opponentCard ? state.opponentCard.name : 'CPU Kaiju', w * 0.72, 150);
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText('VS', w / 2, 230);
  if (state.lastResult) {
    ctx.fillStyle = state.lastResult.playerWon ? '#7dff72' : (state.lastResult.tie ? '#cbd5e1' : '#ff6b6b');
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(state.lastResult.tie ? 'DRAW' : (state.lastResult.playerWon ? 'PLAYER WINS' : 'CPU WINS'), w / 2, 316);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`${state.lastResult.category.label}: ${state.lastResult.playerValue} - ${state.lastResult.opponentValue}`, w / 2, 354);
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('Roll 1-6 to choose the stat category.', w / 2, 330);
  }
}

export function bootstrapKaijuStickerBattle(root) {
  const state = {
    playerCard: KAIJU_CARDS[0],
    opponentCard: KAIJU_CARDS[1],
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
    drawCanvas(canvas, state);
  }

  async function battle() {
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
    state.lastResult = { roll, category, player: state.playerCard, opponent: state.opponentCard, playerValue, opponentValue, tie, playerWon, score, totalScore: state.score, matchBattle, submitted: shouldSubmit };
    ArcadeSync.setHighScore(GAME_ID, state.score);
    updateHud();

    if (shouldSubmit) {
      await submitScore(ArcadeSync.getPlayer(), state.score, GAME_ID);
    }
  }

  function reset() {
    state.score = 0;
    state.battles = 0;
    state.wins = 0;
    state.lastResult = null;
    state.opponentCard = pickOpponent(state.playerCard);
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
