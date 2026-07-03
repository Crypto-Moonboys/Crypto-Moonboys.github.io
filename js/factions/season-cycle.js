/**
 * SEASON CYCLE ENGINE v1
 * Non-destructive seasonal layer for faction + territory systems
 */

(function () {
  const CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

  function get() {
    const saved = localStorage.getItem('cm_season');
    if (saved) return JSON.parse(saved);

    return {
      id: 1,
      start: Date.now(),
      cycle: CYCLE_MS
    };
  }

  function save(state) {
    localStorage.setItem('cm_season', JSON.stringify(state));
  }

  function tick() {
    const season = get();
    const now = Date.now();

    if (now - season.start >= season.cycle) {
      season.id += 1;
      season.start = now;

      window.GK_BUS?.emit('season:reset', {
        seasonId: season.id
      });
    }

    save(season);
    return season;
  }

  function init() {
    tick();
    setInterval(tick, 60000);

    window.GK_BUS?.emit('season:init', get());
  }

  window.SEASON_CYCLE = {
    get,
    tick,
    init
  };

  document.addEventListener('DOMContentLoaded', init);

})();