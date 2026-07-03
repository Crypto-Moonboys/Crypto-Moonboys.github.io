/**
 * UI BATCHER v1
 * Groups frequent UI update signals into a single animation-frame update
 */

(function () {

  let pending = false;
  const tasks = [];

  function add(fn) {
    tasks.push(fn);
    if (!pending) {
      pending = true;
      requestAnimationFrame(run);
    }
  }

  function run() {
    pending = false;

    const list = tasks.splice(0, tasks.length);

    for (let i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) {}
    }

    if (window.HUD_UNIFIED && window.HUD_UNIFIED.render) {
      window.HUD_UNIFIED.render();
    }
  }

  function bind() {

    const wrap = (fn) => add(fn);

    window.addEventListener('xp:update', () => wrap(() => window.HUD_UNIFIED?.render()));
    window.addEventListener('faction:update', () => wrap(() => window.HUD_UNIFIED?.render()));
    window.addEventListener('territory:update', () => wrap(() => window.HUD_UNIFIED?.render()));
    window.addEventListener('season:reset', () => wrap(() => window.HUD_UNIFIED?.render()));

  }

  function init() {
    bind();
  }

  window.UI_BATCHER = { add, init };

  document.addEventListener('DOMContentLoaded', init);

})();