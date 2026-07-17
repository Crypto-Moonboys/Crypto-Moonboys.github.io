export const KAIJU_STICKER_BATTLE_CONFIG = Object.freeze({
  /** Canonical leaderboard key - must match the Workers allowlists. */
  id: 'kaiju',
  label: 'Kaiju Sticker Battle',
  crossGameTags: Object.freeze(['cards', 'telegram']),
});

export const KAIJU_CATEGORIES = Object.freeze([
  Object.freeze({ roll: 1, key: 'pwr', label: 'PWR', name: 'Power' }),
  Object.freeze({ roll: 2, key: 'size', label: 'SIZE', name: 'Size' }),
  Object.freeze({ roll: 3, key: 'atk', label: 'ATK', name: 'Attack' }),
  Object.freeze({ roll: 4, key: 'def', label: 'DEF', name: 'Defence' }),
  Object.freeze({ roll: 5, key: 'spd', label: 'SPD', name: 'Speed' }),
  Object.freeze({ roll: 6, key: 'lgcy', label: 'LGCY', name: 'Legacy' }),
]);

export const KAIJU_CARDS = Object.freeze([
  Object.freeze({ id: 'big-daddy-kong', name: 'Big Daddy Kong', stats: Object.freeze({ pwr: 8, size: 6, atk: 7, def: 3, spd: 4, lgcy: 8 }) }),
  Object.freeze({ id: 'god-dzilla', name: 'God-Dzilla', stats: Object.freeze({ pwr: 9, size: 7, atk: 6, def: 6, spd: 3, lgcy: 10 }) }),
  Object.freeze({ id: 'jet-jaguar', name: 'Jet Jaguar', stats: Object.freeze({ pwr: 5, size: 7, atk: 6, def: 7, spd: 7, lgcy: 4 }) }),
  Object.freeze({ id: 'mc-rodan', name: 'MC Rodan', stats: Object.freeze({ pwr: 8, size: 4, atk: 8, def: 5, spd: 8, lgcy: 5 }) }),
  Object.freeze({ id: 'mf-gidorah', name: 'MF Gidorah', stats: Object.freeze({ pwr: 7, size: 9, atk: 6, def: 5, spd: 3, lgcy: 9 }) }),
  Object.freeze({ id: 'moth-def', name: 'Moth Def', stats: Object.freeze({ pwr: 6, size: 7, atk: 6, def: 5, spd: 9, lgcy: 5 }) }),
  Object.freeze({ id: 'mecha-zilla', name: 'Mecha-Zilla', stats: Object.freeze({ pwr: 6, size: 6, atk: 8, def: 8, spd: 2, lgcy: 4 }) }),
]);
