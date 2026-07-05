/**
 * FACTION GRID UI v1
 * Visual control map layer for faction system
 */

(function () {

  const SIZE = 5;
  let renderTimer = null;
  let initialized = false;
  let lastMarkup = '';

  function getState() {
    if (window.TERRITORY?.get) return window.TERRITORY.get();

    try {
      const saved = localStorage.getItem('cm_territory');
      if (saved) return JSON.parse(saved);
    } catch (_) {
      try { localStorage.removeItem('cm_territory'); } catch (_) {}
    }

    return { grid: [] };
  }

  function color(owner) {
    switch (owner) {
      case 'HODL': return '#00ffcc';
      case 'MOON': return '#ffcc00';
      case 'GRAFF': return '#ff3366';
      default: return '#444';
    }
  }

  function render() {
    const host = document.querySelector('[data-csp-wtf-signal]');
    if (!host) return false;

    const state = getState();
    if (!state.grid) return true;

    const markup = `
      <div style="display:grid;grid-template-columns:repeat(${SIZE},1fr);gap:3px;">
        ${state.grid.map(cell => `
          <div
            title="${cell.id || ''}"
            style="
              width:100%;
              padding-top:100%;
              background:${color(cell.owner)};
              opacity:${Math.min(1, (cell.influence || 50) / 100)};
              border:1px solid #111;
            ">
          </div>
        `).join('')}
      </div>
    `;
    if (markup !== lastMarkup) {
      host.innerHTML = markup;
      lastMarkup = markup;
    }
    return true;
  }

  function startTimer() {
    if (renderTimer || document.hidden) return;
    renderTimer = setInterval(render, 3000);
  }

  function stopTimer() {
    if (!renderTimer) return;
    clearInterval(renderTimer);
    renderTimer = null;
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopTimer();
      return;
    }
    render();
    startTimer();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    render();
    startTimer();

    window.addEventListener('xp:update', render);
    window.addEventListener('faction:update', render);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  window.FACTION_GRID = { init };

  document.addEventListener('DOMContentLoaded', init);

})();
