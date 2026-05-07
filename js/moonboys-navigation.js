(function (global) {
  'use strict';
  var links = [
    { href: '/index.html', label: 'Home' },
    { href: '/games/', label: 'Arcade' },
    { href: '/games/leaderboard.html', label: 'Leaderboard' },
    { href: '/community.html', label: 'Community' },
    { href: '/gkniftyheads-incubator.html', label: 'Telegram Link' },
    { href: '/dashboard.html', label: 'Dashboard' },
    { href: '/games/block-topia/', label: 'Block Topia' },
    { href: '/admin/hermes-chat.html', label: 'Hermes Admin' },
    { href: '/how-to-play.html', label: 'How To Play' }
  ];

  function normalize(path) {
    if (!path) return '/';
    if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
    return path;
  }

  function renderNav(container, currentPath) {
    container.innerHTML = '';
    var active = normalize(currentPath || location.pathname);
    links.forEach(function (item) {
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      if (normalize(item.href) === active) a.classList.add('is-active');
      container.appendChild(a);
    });
  }

  global.MOONBOYS_NAVIGATION = {
    links: links,
    renderNav: renderNav
  };
}(window));
