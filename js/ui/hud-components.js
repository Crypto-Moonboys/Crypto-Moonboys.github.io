/**
 * HUD COMPONENT REGISTRY v1
 * Declarative definitions for all HUD elements
 * Works with HUD_CACHE if available
 */

(function () {

  function getXP() {
    return window.XP?.get?.() || 0;
  }

  function getFaction() {
    return window.FACTIONS?.get?.() || {
      HODL: { power: 50 },
      MOON: { power: 50 },
      GRAFF: { power: 50 }
    };
  }

  function getTerritoryCount() {
    const t = window.TERRITORY?.get?.();
    return t?.grid?.length || 0;
  }

  function getSeason() {
    return window.SEASON_CYCLE?.get?.() || { id: 1 };
  }

  const COMPONENTS = {

    xp: {
      selector: '#hud-xp-value',
      render: () => String(getXP())
    },

    faction_hodl: {
      selector: '#f-hodl',
      render: () => getFaction().HODL.power.toFixed(1)
    },

    faction_moon: {
      selector: '#f-moon',
      render: () => getFaction().MOON.power.toFixed(1)
    },

    faction_graff: {
      selector: '#f-graff',
      render: () => getFaction().GRAFF.power.toFixed(1)
    },

    territory: {
      selector: '#hud-territory',
      render: () => String(getTerritoryCount())
    },

    season: {
      selector: '#hud-season',
      render: () => String(getSeason().id)
    }

  };

  function getComponents() {
    return COMPONENTS;
  }

  window.HUD_COMPONENTS = {
    get: getComponents
  };

})();