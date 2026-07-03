/**
 * FACTION GRID UI v1
 * Visual control map layer for faction system
 */

(function () {

  const SIZE = 5;

  function getState() {
    if (window.TERRITORY?.get) return window.TERRITORY.get();

    const saved = localStorage.getItem('cm_territory');
    if (saved) return JSON.parse(saved);

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
    if (!host) return;

    const state = getState();
    if (!state.grid) return;

    host.innerHTML = `
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
  }

  function init() {
    render();
    setInterval(render, 3000);

    window.addEventListener('xp:update', render);
    window.addEventListener('faction:update', render);
  }

  window.FACTION_GRID = { init };

  document.addEventListener('DOMContentLoaded', init);

})();