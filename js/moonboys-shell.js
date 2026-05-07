(function (global) {
  'use strict';

  function init() {
    var headerNav = document.querySelector('#site-header .header-nav');
    if (headerNav && global.MOONBOYS_NAVIGATION) {
      global.MOONBOYS_NAVIGATION.renderNav(headerNav, location.pathname);
    }

    var statusHost = document.querySelector('#site-header .header-nav');
    if (statusHost && global.MOONBOYS_STATUS && !document.getElementById('mb-status-strip')) {
      var strip = document.createElement('div');
      strip.id = 'mb-status-strip';
      strip.className = 'mb-status-strip';
      statusHost.parentNode.appendChild(strip);
      global.MOONBOYS_STATUS.collectStatus().then(function (status) {
        global.MOONBOYS_STATUS.renderStrip(strip, status);
      });
    }

    var runtimeHost = document.getElementById('homepage-right-panel') || document.getElementById('content');
    if (runtimeHost && global.MOONBOYS_RUNTIME_PANEL && !document.getElementById('mb-runtime-panel')) {
      var panel = document.createElement('div');
      panel.id = 'mb-runtime-panel';
      panel.className = 'mb-runtime-panel';
      runtimeHost.appendChild(panel);
      global.MOONBOYS_RUNTIME_PANEL.render(panel);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }
}(window));
