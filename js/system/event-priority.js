/**
 * EVENT PRIORITY LAYER v1
 * Controls execution order of system events to prevent HUD + XP + faction conflicts
 * Works on top of GK_BUS + UI_BATCHER
 */

(function () {

  const PRIORITY = {
    xp: 3,
    faction: 2,
    territory: 2,
    season: 1,
    ui: 0
  };

  const queue = [];
  let running = false;

  function push(type, payload) {
    queue.push({ type, payload, p: PRIORITY[type] ?? 0 });
    run();
  }

  function run() {
    if (running) return;
    running = true;

    requestAnimationFrame(flush);
  }

  function flush() {
    running = false;

    queue.sort((a, b) => b.p - a.p);

    const batch = queue.splice(0, queue.length);

    for (let i = 0; i < batch.length; i++) {
      const e = batch[i];

      switch (e.type) {

        case 'xp':
          window.XP?.add?.(e.payload.amount, e.payload.source);
          break;

        case 'faction':
          window.GK_BUS?.emit('faction:update', e.payload);
          break;

        case 'territory':
          window.GK_BUS?.emit('territory:update', e.payload);
          break;

        case 'season':
          window.GK_BUS?.emit('season:update', e.payload);
          break;

        case 'ui':
        default:
          window.HUD_UNIFIED?.render?.();
          break;
      }
    }
  }

  function init() {

    // bridge core events into priority system

    window.GK_BUS?.on('xp:add', (d) => push('xp', { amount: d.amount, source: d.reason }));

    window.GK_BUS?.on('faction:update', (d) => push('faction', d));

    window.GK_BUS?.on('territory:update', (d) => push('territory', d));

    window.GK_BUS?.on('season:reset', (d) => push('season', d));

  }

  window.EVENT_PRIORITY = {
    push,
    init
  };

  document.addEventListener('DOMContentLoaded', init);

})();