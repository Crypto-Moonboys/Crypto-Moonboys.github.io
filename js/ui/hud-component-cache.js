/**
 * HUD COMPONENT CACHE v1
 * Reduces DOM lookups and prevents redundant re-render work
 * Works alongside UI_BATCHER + HUD_UNIFIED
 */

(function () {

  const cache = new Map();
  const values = new Map();

  function getEl(selector) {
    if (cache.has(selector)) return cache.get(selector);

    const el = document.querySelector(selector);
    if (el) cache.set(selector, el);

    return el;
  }

  function setText(selector, value) {
    const el = getEl(selector);
    if (!el) return;

    const prev = values.get(selector);
    if (prev === value) return; // no-op if unchanged

    values.set(selector, value);
    el.textContent = value;
  }

  function setHTML(selector, html) {
    const el = getEl(selector);
    if (!el) return;

    const prev = values.get(selector);
    if (prev === html) return; // avoid redundant DOM writes

    values.set(selector, html);
    el.innerHTML = html;
  }

  function invalidate(selector) {
    cache.delete(selector);
    values.delete(selector);
  }

  function clear() {
    cache.clear();
    values.clear();
  }

  window.HUD_CACHE = {
    getEl,
    setText,
    setHTML,
    invalidate,
    clear
  };

})();