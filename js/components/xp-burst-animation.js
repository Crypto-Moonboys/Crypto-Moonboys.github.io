(function () {
  'use strict';

  function ensureStyles() {
    if (document.getElementById('xp-burst-styles')) return;
    var style = document.createElement('style');
    style.id = 'xp-burst-styles';
    style.textContent =
      '.xp-burst-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at center,rgba(0,255,255,.18),rgba(8,12,20,.86));backdrop-filter:blur(2px)}' +
      '.xp-burst-card{border:2px solid #31d2ff;border-radius:14px;padding:24px 28px;min-width:280px;max-width:92vw;text-align:center;background:linear-gradient(180deg,rgba(20,25,45,.95),rgba(10,12,26,.96));box-shadow:0 0 40px rgba(49,210,255,.35)}' +
      '.xp-burst-title{color:#f7c948;font-weight:800;letter-spacing:.06em;font-size:1rem;margin:0 0 8px}' +
      '.xp-burst-total{color:#fff;font-weight:900;font-size:2.4rem;line-height:1.1;text-shadow:0 0 18px rgba(255,255,255,.32)}' +
      '.xp-burst-meta{color:#9edcff;font-size:.86rem;margin-top:10px;line-height:1.6}' +
      '@media (prefers-reduced-motion: reduce){.xp-burst-overlay,.xp-burst-card{animation:none!important;transition:none!important}}';
    document.head.appendChild(style);
  }

  function renderBurst(payload) {
    ensureStyles();
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var overlay = document.createElement('div');
    overlay.className = 'xp-burst-overlay';

    var card = document.createElement('div');
    card.className = 'xp-burst-card';

    var total = Math.max(0, Math.floor(Number(payload.total_xp) || 0));
    var start = reducedMotion ? total : 0;

    var title = document.createElement('h3');
    title.className = 'xp-burst-title';
    title.textContent = String(payload.title || 'XP BURST');

    var totalNode = document.createElement('div');
    totalNode.className = 'xp-burst-total';
    totalNode.setAttribute('data-xp-total', '1');
    totalNode.textContent = start.toLocaleString();

    var meta = document.createElement('div');
    meta.className = 'xp-burst-meta';
    meta.textContent = 'Base: '
      + Math.max(0, Math.floor(Number(payload.base_xp) || 0))
      + ' | Bonus: '
      + Math.max(0, Math.floor(Number(payload.bonus_xp) || 0));

    var note = document.createElement('div');
    note.className = 'xp-burst-meta';
    note.textContent = 'Signal cleared. Chain options unlocked.';

    card.appendChild(title);
    card.appendChild(totalNode);
    card.appendChild(meta);
    card.appendChild(note);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (!reducedMotion) {
      var node = totalNode;
      var current = 0;
      var step = Math.max(1, Math.ceil(total / 30));
      var timer = setInterval(function () {
        current = Math.min(total, current + step);
        node.textContent = current.toLocaleString();
        if (current >= total) clearInterval(timer);
      }, 24);
    }

    setTimeout(function () {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, reducedMotion ? 1700 : 2400);
  }

  window.addEventListener('moonboys:xp-burst', function (event) {
    renderBurst((event && event.detail) || {});
  });
})();
