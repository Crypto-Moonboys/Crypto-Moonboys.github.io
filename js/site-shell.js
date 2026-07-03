// --- HUD CONSOLIDATION PATCH (v1) ---
// Prevent duplicate HUD / XP / faction render loops across systems

window.__HUD_CONSOLIDATED__ = true;

(function () {

  const links = [
    ['HOME','/index.html'],
    ['WIKI','/search.html'],
    ['GAMES','/games/'],
    ['BATTLE CHAMBER','/community.html'],
    ['SWARMSY','/swarmsy.html'],
    ['SYSTEM HUB','/dashboard.html']
  ];

  function ensureNav() {
    if (document.getElementById('global-nav')) return;

    const nav = document.createElement('div');
    nav.id = 'global-nav';

    links.forEach(l => {
      const a = document.createElement('a');
      a.href = l[1];
      a.textContent = l[0];
      nav.appendChild(a);
    });

    document.body.insertBefore(nav, document.body.firstChild);
  }

  function bootHUD() {
    if (window.__HUD_BOOTED__) return;
    window.__HUD_BOOTED__ = true;

    if (window.HUD_UNIFIED && window.HUD_UNIFIED.init) window.HUD_UNIFIED.init();
    if (window.OS_HUD && window.OS_HUD.init) window.OS_HUD.init();
    if (window.XP_UI && window.XP_UI.init) window.XP_UI.init();

    ensureNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHUD);
  } else {
    bootHUD();
  }
})();