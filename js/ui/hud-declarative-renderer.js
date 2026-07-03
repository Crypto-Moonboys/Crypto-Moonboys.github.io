/**
 * HUD DECLARATIVE RENDERER v1
 * Single-pass renderer for all HUD components
 * Integrates with UI_BATCHER + HUD_CACHE if available
 */

(function () {

  let scheduled = false;

  function renderComponent(component) {
    const el = document.querySelector(component.selector);
    if (!el) return;

    const value = component.render();

    if (window.HUD_CACHE?.setText) {
      window.HUD_CACHE.setText(component.selector, value);
    } else {
      el.textContent = value;
    }
  }

  function renderAll() {
    const components = window.HUD_COMPONENTS?.get?.();
    if (!components) return;

    Object.values(components).forEach(renderComponent);
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      renderAll();
    });
  }

  function bind() {

    const events = [
      'xp:update',
      'faction:update',
      'territory:update',
      'season:reset',
      'season:init'
    ];

    events.forEach(e => {
      window.addEventListener(e, scheduleRender);
    });

  }

  function init() {
    bind();
    scheduleRender();
  }

  window.HUD_DECLARATIVE = {
    init,
    render: renderAll
  };

  document.addEventListener('DOMContentLoaded', init);

})();