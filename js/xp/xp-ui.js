/**
 * XP UI v1
 * Single overlay renderer (shared across all pages)
 */

(function () {
  function render() {
    let el = document.getElementById('xp-hud');

    if (!el) {
      el = document.createElement('div');
      el.id = 'xp-hud';
      el.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 99999;
        padding: 8px 12px;
        background: rgba(0,0,0,0.75);
        color: #00ffcc;
        font-family: monospace;
        border: 1px solid #00ffcc;
      `;
      document.body.appendChild(el);
    }

    const xp = window.XP ? window.XP.get() : 0;
    el.innerHTML = `XP: ${xp}`;
  }

  function init() {
    render();
    setInterval(render, 1000);

    window.addEventListener('xp:update', render);
  }

  window.XP_UI = { init, render };
})();