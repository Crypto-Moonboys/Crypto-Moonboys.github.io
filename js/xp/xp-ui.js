/**
 * XP UI v1
 * Single overlay renderer (shared across all pages)
 */

(function () {
  let renderTimer = null;
  let initialized = false;
  let lastValue = null;

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
    if (xp !== lastValue) {
      el.textContent = `XP: ${xp}`;
      lastValue = xp;
    }
  }

  function startTimer() {
    if (renderTimer || document.hidden) return;
    renderTimer = setInterval(render, 1000);
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
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  window.XP_UI = { init, render };
})();
