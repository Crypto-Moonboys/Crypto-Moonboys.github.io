import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ACTIVE_PAGES = [
  ['forkfield', 'games/asteroid-fork/index.html'],
  ['block-topia-quest-maze', 'games/block-topia-quest-maze/index.html'],
  ['bullrun-brick-smash', 'games/breakout-bullrun/index.html'],
  ['meme-swarm-3008', 'games/invaders-3008/index.html'],
  ['kaiju-sticker-battle', 'games/kaiju-sticker-battle/index.html'],
  ['chain-maze', 'games/pac-chain/index.html'],
  ['snake-run', 'games/snake-run/index.html'],
  ['block-topia-dropzone', 'games/tetris-block-topia/index.html'],
];

function createElementClass() {
  return class Element {
    constructor() {
      this.listeners = new Map();
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };
}

async function loadMountGame({ gateResult }) {
  const src = await fs.readFile(path.join(ROOT, 'js/arcade/core/game-shell.js'), 'utf8');
  const transformed = `${src
    .replace("import { bootstrapFromAdapter } from '/js/arcade/engine/game-adapter.js';", 'const bootstrapFromAdapter = __deps.bootstrapFromAdapter;')
    .replace("import { mountArcadeRadio } from '/js/arcade/core/radio.js';", 'const mountArcadeRadio = __deps.mountArcadeRadio;')
    .replace('export async function mountGame(options) {', 'async function mountGame(options) {')}
  module.exports = { mountGame };`;

  const Element = createElementClass();
  const module = { exports: {} };
  const context = {
    __deps: {
      bootstrapFromAdapter() {
        throw new Error('adapter path not expected in this test');
      },
      mountArcadeRadio() {},
    },
    module,
    exports: module.exports,
    Element,
    window: {
      addEventListener() {},
      MOONBOYS_IDENTITY: {
        async enforceCompetitiveArcadePageGate() {
          return gateResult;
        },
      },
    },
    console: { error() {}, warn() {}, log() {} },
  };
  context.globalThis = context;
  vm.runInNewContext(transformed, context, { filename: 'js/arcade/core/game-shell.js' });
  return { mountGame: module.exports.mountGame, Element };
}

{
  const { mountGame, Element } = await loadMountGame({
    gateResult: { ok: false, reason: 'not_linked', game_id: 'snake-run' },
  });
  let bootstrapped = 0;
  const root = new Element();
  const result = await mountGame({
    root,
    requireCompetitiveGate: true,
    gameId: 'snake-run',
    bootstrap() {
      bootstrapped += 1;
      return {};
    },
  });
  assert.equal(bootstrapped, 0, 'mountGame must not bootstrap when the competitive gate blocks the route');
  assert.equal(result && result.gateBlocked, true, 'mountGame must return a gateBlocked sentinel when route access is denied');
}

{
  const { mountGame, Element } = await loadMountGame({
    gateResult: { ok: true, game_id: 'snake-run', telegram_auth: { id: '123', hash: 'signed', auth_date: '1700000000' } },
  });
  let bootstrapped = 0;
  let initCalled = 0;
  const root = new Element();
  const result = await mountGame({
    root,
    requireCompetitiveGate: true,
    gameId: 'snake-run',
    bootstrap() {
      bootstrapped += 1;
      return {
        async init() { initCalled += 1; },
        start() {},
        pause() {},
        resume() {},
        reset() {},
        destroy() {},
        getScore() { return 0; },
      };
    },
  });
  assert.equal(bootstrapped, 1, 'mountGame must bootstrap once when the competitive gate passes');
  assert.equal(initCalled, 1, 'mountGame must not reach init() until the competitive gate passes');
  assert.equal(typeof result.getScore, 'function', 'successful mountGame result should be the lifecycle object');
}

{
  let resolveGate;
  const { mountGame, Element } = await loadMountGame({
    gateResult: new Promise((resolve) => {
      resolveGate = resolve;
    }),
  });
  let bootstrapped = 0;
  let initCalled = 0;
  const root = new Element();
  const mountPromise = mountGame({
    root,
    requireCompetitiveGate: true,
    gameId: 'snake-run',
    bootstrap() {
      bootstrapped += 1;
      return {
        async init() { initCalled += 1; },
        start() {},
        pause() {},
        resume() {},
        reset() {},
        destroy() {},
        getScore() { return 0; },
      };
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(bootstrapped, 0, 'mountGame must wait for server verification before bootstrap');
  assert.equal(initCalled, 0, 'mountGame must not initialize gameplay before server verification resolves');
  resolveGate({ ok: true, game_id: 'snake-run', telegram_auth: { id: '123', hash: 'signed', auth_date: '1700000000' } });
  await mountPromise;
  assert.equal(bootstrapped, 1, 'mountGame should bootstrap only after server verification passes');
  assert.equal(initCalled, 1, 'mountGame should initialize only after server verification passes');
}

for (const [gameId, relPath] of ACTIVE_PAGES) {
  const html = await fs.readFile(path.join(ROOT, relPath), 'utf8');
  assert(
    /requireCompetitiveGate\s*:\s*true/.test(html),
    `${relPath} must require the shared competitive gate before gameplay bootstrap`,
  );
  const escapedGameId = gameId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert(
    new RegExp(`(?:competitiveGameId|gameId)\\s*:\\s*['\"]${escapedGameId}['\"]`).test(html),
    `${relPath} must pass the canonical competitive game id into the shared page gate`,
  );
}

const breakoutHtml = await fs.readFile(path.join(ROOT, 'games/breakout-bullrun/index.html'), 'utf8');
assert(
  /if\s*\(game\s*&&\s*game\.gateBlocked\)\s*return;/.test(breakoutHtml),
  'breakout fallback path must not bypass a denied competitive page gate',
);

console.log('Competitive arcade bootstrap gate checks passed.');
