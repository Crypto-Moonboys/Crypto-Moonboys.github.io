(function (global) {
  'use strict';

  async function probe(url) {
    try {
      var res = await fetch(url, { credentials: 'same-origin' });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async function collectStatus() {
    var out = {
      api: await probe('/api/health'),
      hermes: await probe('/api/hermes/runtime/root')
    };
    return out;
  }

  function renderStrip(container, status) {
    container.innerHTML = '';
    var api = document.createElement('span');
    api.className = 'mb-chip ' + (status.api ? '' : 'mb-chip--bad');
    api.textContent = 'API: ' + (status.api ? 'Online' : 'Unavailable');
    container.appendChild(api);

    var hermes = document.createElement('span');
    hermes.className = 'mb-chip ' + (status.hermes ? '' : 'mb-chip--warn');
    hermes.textContent = 'Hermes: ' + (status.hermes ? 'Reachable' : 'Unavailable');
    container.appendChild(hermes);
  }

  global.MOONBOYS_STATUS = {
    collectStatus: collectStatus,
    renderStrip: renderStrip
  };
}(window));
