export const KAIJU_STICKER_BATTLE_CONFIG = Object.freeze({
  /** Canonical leaderboard key - must match the Workers allowlists. */
  id: 'kaiju',
  label: 'Kaiju Sticker Battle',
  crossGameTags: Object.freeze(['cards', 'telegram']),
});

export const KAIJU_CATEGORIES = Object.freeze([
  Object.freeze({ roll: 1, key: 'pwr', label: 'PWR', name: 'Power', asset: '/img/game/kong3008/grimey5.png' }),
  Object.freeze({ roll: 2, key: 'size', label: 'SIZE', name: 'Size', asset: '/img/game/kong3008/grimey6.png' }),
  Object.freeze({ roll: 3, key: 'atk', label: 'ATK', name: 'Attack', asset: '/img/game/kong3008/grimey7.png' }),
  Object.freeze({ roll: 4, key: 'def', label: 'DEF', name: 'Defence', asset: '/img/game/kong3008/grimey8.png' }),
  Object.freeze({ roll: 5, key: 'spd', label: 'SPD', name: 'Speed', asset: '/img/game/kong3008/grimey9.png' }),
  Object.freeze({ roll: 6, key: 'lgcy', label: 'LGCY', name: 'Legacy', asset: '/img/game/kong3008/grimey10.png' }),
]);

export const KAIJU_ASSETS = Object.freeze({
  rollBattle: '/img/game/kong3008/grimey1.png',
  reset: '/img/game/kong3008/grimey2.png',
  playAgain: '/img/game/kong3008/grimey3.png',
  claimXp: '/img/game/kong3008/grimey4.png',
  cardFrameGold: '/img/game/kong3008/grimey11.png',
  cardFrameSilver: '/img/game/kong3008/grimey12.png',
  win: '/img/game/kong3008/grimey13.png',
  draw: '/img/game/kong3008/grimey14.png',
  xp: '/img/game/kong3008/grimey15.png',
  diceSix: '/img/game/kong3008/grimey16.png',
  diceOne: '/img/game/kong3008/grimey17.png',
  telegramLinked: '/img/game/kong3008/grimey18.png',
  xpReady: '/img/game/kong3008/grimey19.png',
  versus: '/img/game/kong3008/grimey20.png',
  resultSlash: '/img/game/kong3008/grimey21.png',
  deck: '/img/game/kong3008/grimey22.png',
  crown: '/img/game/kong3008/grimey23.png',
  trophy: '/img/game/kong3008/grimey24.png',
  winnerCard: '/img/game/kong3008/grimey25winner.png',
});

export const KAIJU_CARDS = Object.freeze([
  Object.freeze({ id: 'big-daddy-kong', name: 'Big Daddy Kong', image: '/img/game/kong3008/cards/big-daddy-kong.png', stats: Object.freeze({ pwr: 8, size: 6, atk: 7, def: 3, spd: 4, lgcy: 8 }) }),
  Object.freeze({ id: 'god-dzilla', name: 'God-Dzilla', image: '/img/game/kong3008/cards/god-dzilla.png', stats: Object.freeze({ pwr: 9, size: 7, atk: 6, def: 6, spd: 3, lgcy: 10 }) }),
  Object.freeze({ id: 'jet-jaguar', name: 'Jet Jaguar', image: '/img/game/kong3008/cards/jet-jaguar.png', stats: Object.freeze({ pwr: 5, size: 7, atk: 6, def: 7, spd: 7, lgcy: 4 }) }),
  Object.freeze({ id: 'mc-rodan', name: 'MC Rodan', image: '/img/game/kong3008/cards/mc-rodan.png', stats: Object.freeze({ pwr: 8, size: 4, atk: 8, def: 5, spd: 8, lgcy: 5 }) }),
  Object.freeze({ id: 'mf-gidorah', name: 'MF Gidorah', image: '/img/game/kong3008/cards/mf-gidorah.png', stats: Object.freeze({ pwr: 7, size: 9, atk: 6, def: 5, spd: 3, lgcy: 9 }) }),
  Object.freeze({ id: 'moth-def', name: 'Moth Def', image: '/img/game/kong3008/cards/moth-def.png', stats: Object.freeze({ pwr: 6, size: 7, atk: 6, def: 5, spd: 9, lgcy: 5 }) }),
  Object.freeze({ id: 'mecha-zilla', name: 'Mecha-Zilla', image: '/img/game/kong3008/cards/mecha-zilla.png', stats: Object.freeze({ pwr: 6, size: 6, atk: 8, def: 8, spd: 2, lgcy: 4 }) }),
]);
