// NBG London Graffiti Run
// Visible debug panel listener for Level 1 runtime checks

(function () {
  window.NBGLevel1DebugPanel = {
    attach() {
      let panel = document.getElementById('nbg-debug-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'nbg-debug-panel';
        document.body.appendChild(panel);
      }

      window.addEventListener('nbg-level1-debug-update', (event) => {
        panel.textContent = JSON.stringify(event.detail || {}, null, 2);
      });

      return true;
    }
  };
})();
