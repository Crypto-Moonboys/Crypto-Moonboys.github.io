(function (root) {
  'use strict';

  // This simulation is deliberately isolated from every API, wallet and XP ledger.
  // Local scores are editable practice records, never competitive progression.
  var BUILDS = {
    scout: { title: 'SCOUT', detail: 'Safer routes; starts with 3 supplies.', health: 75, supplies: 3, guard: 9, power: 0 },
    bruiser: { title: 'BRUISER', detail: '110 health; better at bold routes.', health: 110, supplies: 1, guard: 0, power: 12 },
    scavenger: { title: 'SCAVENGER', detail: 'Extra salvage from search routes.', health: 85, supplies: 2, guard: 3, power: 3 },
  };
  var GOALS = {
    explorer: { title: 'SCOUT 8 ROOMS', target: 8 },
    collector: { title: 'BANK 120 SALVAGE', target: 120 },
    survivor: { title: 'CLEAR ALL 12 ROOMS', target: 12 },
  };
  var PERKS = {
    shield: { title: 'SCRAP SHIELD', detail: 'Failure damage -7.' },
    radar: { title: 'ROUTE RADAR', detail: 'Safe and search clear odds +10%.' },
    boots: { title: 'STREET BOOTS', detail: 'Bold clear odds +12%.' },
    medkit: { title: 'MED KIT', detail: 'Heal 35 now; max health +15.' },
    pockets: { title: 'DEEP POCKETS', detail: 'Gain 2 supplies now.' },
    magnet: { title: 'SALVAGE MAGNET', detail: '+8 salvage on successful rooms.' },
  };
  var ROOMS = [
    ['Neon Crossing', 'A patrol scans the main street. Take cover, break through or search a side alley.'],
    ['Abandoned Depot', 'A signal flickers behind sealed crates. Decide how much risk the supplies are worth.'],
    ['Rooftop Gap', 'A broken bridge separates you from a hidden workshop.'],
    ['Graffiti Junction', 'Rival crews guard a fresh wall and a stash of salvaged tech.'],
    ['Tunnel Echo', 'Footsteps follow you beneath the city. Choose your way out.'],
    ['Scrap Market', 'A shuttered market offers cover, scrap and a dangerous shortcut.'],
  ];
  function hash(value) {
    var h = 2166136261;
    for (var char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  function create(seed, build, goal) {
    if (!Object.hasOwn(BUILDS, build) || !Object.hasOwn(GOALS, goal)) return null;
    return { version: 1, seed: String(seed).slice(0, 80), build: build, goal: goal, turn: 0, depth: 0,
      health: BUILDS[build].health, max_health: BUILDS[build].health, supplies: BUILDS[build].supplies,
      salvage: 0, score: 0, perks: [], draft: [], status: 'active', last: 'Choose your first route.' };
  }
  function restore(value) {
    if (!value || value.version !== 1 || !Object.hasOwn(BUILDS, value.build) || !Object.hasOwn(GOALS, value.goal)) return null;
    if (typeof value.seed !== 'string' || value.seed.length > 80 || typeof value.last !== 'string' || value.last.length > 220) return null;
    if (!['active', 'failed', 'extracted', 'completed'].includes(value.status)) return null;
    for (var key of ['turn', 'depth', 'health', 'max_health', 'supplies', 'salvage', 'score']) {
      if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 100000) return null;
    }
    if (value.depth > 12 || value.health > value.max_health || !Array.isArray(value.perks) || !Array.isArray(value.draft)) return null;
    if (value.perks.length > 6 || value.draft.length > 3 || new Set(value.perks).size !== value.perks.length) return null;
    if (!value.perks.concat(value.draft).every(function (x) { return Object.hasOwn(PERKS, x); })) return null;
    return JSON.parse(JSON.stringify(value));
  }
  function room(s) {
    var content = ROOMS[hash(s.seed + ':' + s.depth) % ROOMS.length];
    return { title: s.depth === 11 ? 'Alley King Checkpoint' : content[0], detail: s.depth === 11 ? 'The final checkpoint tests your build. Clear it or extract safely now.' : content[1] };
  }
  function choices(s) {
    if (!s || s.status !== 'active' || s.draft.length) return [];
    var build = BUILDS[s.build], perks = s.perks;
    var threat = s.depth * 2 + (s.depth === 11 ? 10 : 0);
    var odds = function (base) { return Math.max(25, Math.min(98, base - threat)); };
    var shield = perks.includes('shield') ? 7 : 0;
    var bonus = perks.includes('magnet') ? 8 : 0;
    return [
      { key: 'safe', title: 'TAKE COVER', odds: odds(94 + build.guard + (perks.includes('radar') ? 10 : 0)), salvage: 7 + bonus, damage: Math.max(3, 13 + s.depth - shield), detail: 'Reliable route; modest salvage.' },
      { key: 'bold', title: 'BREAK THROUGH', odds: odds(76 + build.power + (perks.includes('boots') ? 12 : 0)), salvage: 23 + bonus, damage: Math.max(3, 23 + s.depth - shield), detail: 'Bigger score; heavier failure damage.' },
      { key: 'search', title: 'SEARCH SIDE ROUTE', odds: odds(83 + build.guard + (perks.includes('radar') ? 10 : 0)), salvage: 14 + bonus + (s.build === 'scavenger' ? 9 : 0), damage: Math.max(3, 18 + s.depth - shield), detail: 'A clear finds 1 supply. Failure finds none.' },
      { key: 'rest', title: 'USE SUPPLY & REST', odds: 100, salvage: 0, damage: 0, disabled: s.supplies < 1 || s.health >= s.max_health, detail: 'Costs 1 supply; heals 26; advances one room without salvage.' },
    ];
  }
  function step(value, action, expectedTurn) {
    var s = restore(value);
    if (!s || s.status !== 'active' || expectedTurn !== s.turn) return value;
    if (action === 'extract') {
      s.status = 'extracted'; s.turn++; s.last = 'Practice extracted. Salvage and score are local only.'; return s;
    }
    if (s.draft.length) {
      if (!s.draft.includes(action)) return value;
      s.perks.push(action); s.draft = []; s.turn++;
      if (action === 'medkit') { s.max_health += 15; s.health = Math.min(s.max_health, s.health + 35); }
      if (action === 'pockets') s.supplies += 2;
      s.last = PERKS[action].title + ' installed for this practice run.'; return s;
    }
    var choice = choices(s).find(function (x) { return x.key === action; });
    if (!choice || choice.disabled) return value;
    var success = hash(s.seed + ':' + s.depth + ':' + action) % 100 < choice.odds;
    if (action === 'rest') { s.supplies--; s.health = Math.min(s.max_health, s.health + 26); }
    else if (success) { s.salvage += choice.salvage; s.score += choice.salvage * 3 + 10; if (action === 'search') s.supplies++; }
    else s.health = Math.max(0, s.health - choice.damage);
    s.depth++; s.turn++;
    s.last = action === 'rest' ? 'Recovered 26 health (up to maximum). The route moved on.' : success ? 'Route cleared: +' + choice.salvage + ' practice salvage.' : 'Setback: -' + choice.damage + ' practice health.';
    if (s.health === 0) { s.status = 'failed'; s.salvage = 0; s.last += ' Run over; unbanked salvage lost.'; }
    else if (s.depth === 12) { s.status = 'completed'; s.last += ' Twelve-room circuit cleared.'; }
    else if (s.depth % 3 === 0) {
      s.draft = Object.keys(PERKS).filter(function (x) { return !s.perks.includes(x); })
        .sort(function (a, b) { return hash(s.seed + s.depth + a) - hash(s.seed + s.depth + b); }).slice(0, 3);
    }
    return s;
  }
  function goalProgress(s) {
    var progress = s.goal === 'collector' ? (['extracted', 'completed'].includes(s.status) ? s.salvage : 0) : s.depth;
    return { progress: progress, target: GOALS[s.goal].target, completed: progress >= GOALS[s.goal].target && s.status !== 'failed' };
  }
  var api = { builds: BUILDS, goals: GOALS, perks: PERKS, create: create, restore: restore, room: room, choices: choices, step: step, goalProgress: goalProgress };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoonpetPractice = api;
})(typeof window !== 'undefined' ? window : globalThis);
