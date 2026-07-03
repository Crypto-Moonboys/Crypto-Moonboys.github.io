/**
 * XP STORE v1
 * Handles persistence + future sync abstraction
 */

(function () {
  const KEY = 'cm_xp_total';

  function load() {
    return parseInt(localStorage.getItem(KEY) || '0', 10);
  }

  function save(value) {
    localStorage.setItem(KEY, value);
    return value;
  }

  window.XP_STORE = {
    load,
    save
  };
})();