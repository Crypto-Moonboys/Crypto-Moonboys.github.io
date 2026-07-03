/**
 * XP CORE v1
 * Global XP system (single source of truth)
 */

(function () {
  const XP_KEY = 'cm_xp_total';

  function getXP() {
    return parseInt(localStorage.getItem(XP_KEY) || '0', 10);
  }

  function addXP(amount, reason = 'unknown') {
    const current = getXP();
    const updated = current + amount;
    localStorage.setItem(XP_KEY, updated);
    window.dispatchEvent(new CustomEvent('xp:update', { detail: { xp: updated, reason } }));
    return updated;
  }

  function setXP(value) {
    localStorage.setItem(XP_KEY, value);
    window.dispatchEvent(new CustomEvent('xp:update', { detail: { xp: value } }));
  }

  window.XP = {
    get: getXP,
    add: addXP,
    set: setXP
  };
})();