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

function diceAsset(roll) {
  return roll === 1 ? KAIJU_ASSETS.diceOne : KAIJU_ASSETS.diceSix;
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

function renderCard(card, selected) {
  return `
    <button class="kaiju-card${selected ? ' selected' : ''}" type="button" data-card-id="${card.id}" aria-pressed="${selected ? 'true' : 'false'}">
      <span class="kaiju-card-name">${card.name}</span>
      <span class="kaiju-card-art" aria-hidden="true"><img src="${card.image}" alt=""></span>
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
      <strong>Pick a card, then roll battle.</strong>
    `;
  }

  if (result.matchComplete) {
    return `
      <span class="kaiju-result-badges" aria-hidden="true"><img src="${KAIJU_ASSETS.xp}" alt=""></span>
      <strong>Match complete. XP submitted: ${result.totalScore}</strong>
      <span>Press Reset / Play Again to start a new 5-round match.</span>
    `;
  }

  const outcome = result.tie ? 'Draw' : (result.playerWon ? 'You win' : 'CPU wins');
  const outcomeAsset = result.tie ? KAIJU_ASSETS.draw : (result.playerWon ? KAIJU_ASSETS.win : KAIJU_ASSETS.winnerCard);
  return `
    <img class="kaiju-result-stamp" src="${outcomeAsset}" alt="">
    <strong>${outcome}</strong>
    <span class="kaiju-result-badges" aria-hidden="true">
      <img src="${diceAsset(result.roll)}" alt="">
      <img src="${result.category.asset}" alt="">
    </span>
    <span>${result.category.label}: ${result.player.name} ${result.playerValue} vs ${result.opponent.name} ${result.opponentValue}</span>
    <span>Round ${result.matchBattle}/${BATTLES_PER_MATCH}</span>
  `;
}

async function drawCanvas(canvas, state) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const [playerImg, opponentImg, diceImg, categoryImg, versusImg, winImg, drawImg, winnerImg, slashImg, crownImg, trophyImg] = await Promise.all([
    loadImage(state.playerCard.image),
    loadImage(state.opponentCard ? state.opponentCard.image : ''),
    loadImage(state.lastResult && !state.lastResult.matchComplete ? diceAsset(state.lastResult.roll) : ''),
    loadImage(state.lastResult && !state.lastResult.matchComplete ? state.lastResult.category.asset : ''),
    loadImage(KAIJU_ASSETS.versus),
    loadImage(KAIJU_ASSETS.win),
    loadImage(KAIJU_ASSETS.draw),
    loadImage(KAIJU_ASSETS.winnerCard),
    loadImage(KAIJU_ASSETS.resultSlash),
    loadImage(KAIJU_ASSETS.crown),
    loadImage(KAIJU_ASSETS.trophy),
  ]);

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function drawContain(image, x, y, width, height) {
    if (!image) return;
    const scale = Math.min(width / image.width, height / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    ctx.drawImage(image, x + (width - drawW) / 2, y + (height - drawH) / 2, drawW, drawH);
  }

  function drawPill(x, y, width, height, label, value, accent) {
    ctx.save();
    roundRect(x, y, width, height, 16);
    ctx.fillStyle = 'rgba(0,0,0,.46)';
    ctx.fill();
    ctx.strokeStyle = accent || 'rgba(247,171,26,.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f8d680';
    ctx.font = '900 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 16, y + 23);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, x + width - 16, y + 29);
    ctx.restore();
  }

  function drawCard(image, x, y, cardW, cardH, title, value, side, won) {
    ctx.save();
    ctx.shadowColor = won ? 'rgba(100,255,53,.55)' : 'rgba(0,0,0,.55)';
    ctx.shadowBlur = won ? 28 : 18;
    ctx.shadowOffsetY = 12;
    roundRect(x, y, cardW, cardH, 22);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = won ? '#64ff35' : '#f7ab1a';
    ctx.lineWidth = won ? 5 : 3;
    roundRect(x, y, cardW, cardH, 22);
    ctx.stroke();
    ctx.fillStyle = side === 'player' ? '#20c7ff' : '#ff6b6b';
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(side === 'player' ? 'YOUR PICK' : 'CPU RIVAL', x + 18, y + 25);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 27px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, x + cardW / 2, y + 58);
    if (image) {
      const artW = cardW - 30;
      const artH = cardH - 122;
      const artX = x + 15;
      const artY = y + 76;
      ctx.fillStyle = '#080a12';
      roundRect(artX, artY, artW, artH, 18);
      ctx.fill();
      drawContain(image, artX, artY, artW, artH);
    }
    const statText = value === '-' ? 'STAT -' : `STAT ${value}`;
    ctx.fillStyle = value === '-' ? '#cbd5e1' : (won ? '#64ff35' : '#ffffff');
    ctx.font = '900 25px system-ui, sans-serif';
    ctx.fillText(statText, x + cardW / 2, y + cardH - 24);
    ctx.restore();
  }

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0c101b');
  bg.addColorStop(.54, '#060812');
  bg.addColorStop(1, '#03050b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (let y = 30; y < h; y += 42) {
    ctx.strokeStyle = y % 84 === 30 ? 'rgba(247,171,26,.08)' : 'rgba(255,255,255,.025)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(w - 24, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f7ab1a';
  ctx.lineWidth = 5;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.strokeStyle = 'rgba(32,199,255,.26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, w - 68, h - 68);
  ctx.fillStyle = '#f7ab1a';
  ctx.font = '900 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KAIJU STICKER BATTLE', w / 2, 62);
  drawPill(54, 44, 152, 42, 'ROUND', `${Math.min(state.battles + (state.matchComplete ? 0 : 1), BATTLES_PER_MATCH)}/${BATTLES_PER_MATCH}`, '#f7ab1a');
  drawPill(w - 206, 44, 152, 42, 'WINS', `${state.wins}`, '#20c7ff');

  const cardW = 296;
  const cardH = 440;
  const leftX = 118;
  const rightX = w - leftX - cardW;
  const topY = 150;
  const playerValue = state.lastResult && !state.lastResult.matchComplete ? state.lastResult.playerValue : '-';
  const opponentValue = state.lastResult && !state.lastResult.matchComplete ? state.lastResult.opponentValue : '-';
  const playerWon = state.lastResult && !state.lastResult.matchComplete && state.lastResult.playerWon;
  const opponentWon = state.lastResult && !state.lastResult.matchComplete && !state.lastResult.playerWon && !state.lastResult.tie;
  drawCard(playerImg, leftX, topY, cardW, cardH, state.playerCard.name, playerValue, 'player', playerWon);
  drawCard(opponentImg, rightX, topY, cardW, cardH, state.opponentCard ? state.opponentCard.name : 'CPU Kaiju', opponentValue, 'opponent', opponentWon);

  const centerX = w / 2;
  const centerPanelW = 370;
  const centerPanelX = centerX - centerPanelW / 2;
  roundRect(centerPanelX, 170, centerPanelW, 360, 20);
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(247,171,26,.34)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (state.matchComplete) {
    drawContain(trophyImg, centerX - 68, 188, 136, 128);
    ctx.fillStyle = '#f7ab1a';
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.fillText('MATCH', centerX, 350);
    ctx.fillText('COMPLETE', centerX, 398);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '900 24px system-ui, sans-serif';
    ctx.fillText(`XP submitted: ${state.score}`, centerX, 456);
    return;
  }

  if (state.lastResult) {
    const outcome = state.lastResult.tie ? 'DRAW' : (state.lastResult.playerWon ? 'YOU WIN' : 'CPU WINS');
    const stamp = state.lastResult.tie ? drawImg : (state.lastResult.playerWon ? winImg : winnerImg);
    drawContain(stamp, centerX - 76, 182, 152, 116);
    ctx.fillStyle = state.lastResult.tie ? '#cbd5e1' : (state.lastResult.playerWon ? '#64ff35' : '#ff6b6b');
    ctx.font = '900 50px system-ui, sans-serif';
    ctx.fillText(outcome, centerX, 336);
    drawContain(diceImg, centerX - 66, 356, 70, 70);
    drawContain(categoryImg, centerX + 12, 363, 150, 60);
    drawContain(slashImg, centerX - 144, 430, 288, 76);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 24px system-ui, sans-serif';
    ctx.fillText(`${state.lastResult.playerValue}  vs  ${state.lastResult.opponentValue}`, centerX, 494);
  } else {
    drawContain(versusImg, centerX - 113, 224, 226, 156);
    drawContain(crownImg, centerX - 44, 384, 88, 76);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '900 23px system-ui, sans-serif';
    ctx.fillText('Roll battle to choose the stat.', centerX, 498);
  }
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
  const restartModeBtn = document.getElementById('restartModeBtn');

  function updateHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(ArcadeSync.getHighScore(GAME_ID));
    winsEl.textContent = `${state.wins}/${state.battles}`;
    rollEl.innerHTML = state.lastResult && !state.lastResult.matchComplete
      ? `<span class="kaiju-hud-roll"><img src="${diceAsset(state.lastResult.roll)}" alt=""> ${state.lastResult.roll}</span>`
      : '-';
    categoryEl.innerHTML = state.lastResult && !state.lastResult.matchComplete
      ? `<img class="kaiju-hud-category" src="${state.lastResult.category.asset}" alt="${state.lastResult.category.name}">`
      : '-';
    resultEl.innerHTML = renderResult(state.lastResult || (state.matchComplete ? { matchComplete: true, totalScore: state.score } : null));
    cardGrid.innerHTML = KAIJU_CARDS.map((card) => renderCard(card, card.id === state.playerCard.id)).join('');
    drawCanvas(canvas, state);
  }

  async function battle() {
    if (state.matchComplete) {
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
    const roundScore = tie ? 500 : (playerWon ? 1000 + (margin * 150) : Math.max(100, 350 - (margin * 50)));

    state.battles += 1;
    if (playerWon) state.wins += 1;
    state.score += roundScore;
    const matchBattle = state.battles;
    state.lastResult = { roll, category, player: state.playerCard, opponent: state.opponentCard, playerValue, opponentValue, tie, playerWon, roundScore, totalScore: state.score, matchBattle, mode: state.mode };
    ArcadeSync.setHighScore(GAME_ID, state.score);
    updateHud();

    const shouldSubmit = matchBattle >= BATTLES_PER_MATCH;
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

  function onCardClick(event) {
    const button = event.target.closest('[data-card-id]');
    if (!button || state.matchComplete) return;
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
      if (restartModeBtn) restartModeBtn.addEventListener('click', reset);
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
      if (restartModeBtn) restartModeBtn.removeEventListener('click', reset);
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
