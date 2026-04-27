import { GameRegistry } from '/js/arcade/core/game-registry.js';
import { BaseGame } from '/js/arcade/engine/BaseGame.js';
import {
  createUpgradeSystem,
  createDirectorSystem,
  createEventSystem,
  createMutationSystem,
  createBossSystem,
  createRiskSystem,
  createMetaSystem,
  createFeedbackSystem,
} from '/js/arcade/systems/index.js';

const SYSTEM_FACTORIES = {
  upgrade: createUpgradeSystem,
  director: createDirectorSystem,
  event: createEventSystem,
  mutation: createMutationSystem,
  boss: createBossSystem,
  risk: createRiskSystem,
  meta: createMetaSystem,
  feedback: createFeedbackSystem,
};

function resolveSystems(config) {
  const systems = {};
  const source = config || {};

  for (const [name, enabled] of Object.entries(source)) {
    if (!enabled) continue;
    const factory = SYSTEM_FACTORIES[name];
    if (typeof factory !== 'function') continue;
    systems[name] = factory;
  }

  return systems;
}

export function createGameAdapter(config) {
  const base = config || {};

  return {
    id: base.id,
    name: base.name || base.id,
    systems: base.systems || {},
    init: base.init || null,
    update: base.update || null,
    render: base.render || null,
    onInput: base.onInput || null,
    onGameOver: base.onGameOver || null,
    legacyBootstrap: base.legacyBootstrap || null,
  };
}

export function bootstrapFromAdapter(root, adapter, runtimeOptions) {
  const options = runtimeOptions || {};

  if (typeof adapter.legacyBootstrap === 'function') {
    return adapter.legacyBootstrap(root, options);
  }

  const context = {
    root: root,
    adapter: adapter,
    state: options.state || {},
  };

  const engine = new BaseGame({
    context: context,
    systems: resolveSystems(adapter.systems),
    init: adapter.init ? function () { return adapter.init(context); } : null,
    update: adapter.update ? function (dt) { return adapter.update(dt, context); } : null,
    render: adapter.render ? function (dt) { return adapter.render(dt, context); } : null,
    gameOver: adapter.onGameOver ? function (reason) { return adapter.onGameOver(reason, context); } : null,
    input: adapter.onInput ? function (e) { return adapter.onInput(e, context); } : null,
  });

  let running = false;
  let paused = false;

  async function init() {
    await engine.init();
    engine.attachInput();
    if (typeof adapter.render === 'function') {
      adapter.render(0, context);
    }
  }

  function start() {
    running = true;
    paused = false;
    engine.startLoop();
  }

  function pause() {
    if (!running) return;
    paused = true;
    engine.stopLoop();
  }

  function resume() {
    if (!running || !paused) return;
    paused = false;
    engine.startLoop();
  }

  function reset() {
    pause();
    if (typeof adapter.init === 'function') {
      adapter.init(context);
    }
    if (typeof adapter.render === 'function') {
      adapter.render(0, context);
    }
  }

  function destroy() {
    running = false;
    paused = false;
    engine.destroy();
  }

  function getScore() {
    if (typeof options.getScore === 'function') return options.getScore(context);
    if (typeof context.state.score === 'number') return context.state.score;
    return 0;
  }

  return { init, start, pause, resume, reset, destroy, getScore };
}

export function registerGameAdapter(config, adapter, bootstrap) {
  GameRegistry.register(config.id, {
    label: config.label,
    bootstrap: bootstrap,
    adapter: adapter,
  });
}