(function (global) {
  'use strict';

  async function getRuntime() {
    try {
      var res = await fetch('/api/hermes/runtime/root', { credentials: 'same-origin' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function getModels() {
    try {
      var res = await fetch('/api/hermes/models', { credentials: 'same-origin' });
      if (!res.ok) return [];
      var data = await res.json();
      return Array.isArray(data.models) ? data.models : [];
    } catch (_) {
      return [];
    }
  }

  async function render(container) {
    var runtime = await getRuntime();
    var models = await getModels();
    if (!runtime && models.length === 0) {
      container.textContent = 'Hermes runtime panel unavailable in this deployment.';
      return;
    }
    var lines = [];
    if (runtime) {
      lines.push('Active repo: ' + (runtime.activeRepoId || 'Unavailable'));
      lines.push('Runtime root: ' + (runtime.localPath || runtime.cwd || 'Unavailable'));
    }
    lines.push('Models: ' + (models.length ? models.join(', ') : 'Unavailable'));
    container.textContent = lines.join(' | ');
  }

  global.MOONBOYS_RUNTIME_PANEL = { render: render };
}(window));
