/**
 * TERRITORY CORE v1
 * Faction territory state + ownership model
 */

(function () {
  const SIZE = 5;
  const FACTIONS = ['HODL', 'MOON', 'GRAFF'];

  function init() {
    const saved = localStorage.getItem('cm_territory');
    if (saved) return JSON.parse(saved);

    const grid = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        grid.push({
          id: `${x}-${y}`,
          owner: FACTIONS[Math.floor(Math.random() * FACTIONS.length)],
          influence: Math.random() * 100
        });
      }
    }

    const state = { grid };
    localStorage.setItem('cm_territory', JSON.stringify(state));
    return state;
  }

  function getState() {
    return JSON.parse(localStorage.getItem('cm_territory')) || init();
  }

  function save(state) {
    localStorage.setItem('cm_territory', JSON.stringify(state));
  }

  function updateZone(zoneId, faction, delta) {
    const state = getState();
    const zone = state.grid.find(z => z.id === zoneId);
    if (!zone) return state;

    zone.influence += delta;

    if (zone.influence > 100) {
      zone.owner = faction;
      zone.influence = 100;
    }

    if (zone.influence < 0) {
      zone.owner = faction;
      zone.influence = 10;
    }

    save(state);

    window.GK_BUS?.emit('territory:update', {
      zoneId,
      owner: zone.owner,
      influence: zone.influence
    });

    return state;
  }

  window.TERRITORY = {
    get: getState,
    updateZone
  };
})();