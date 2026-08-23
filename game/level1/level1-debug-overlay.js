// NBG London Graffiti Run
// Visible browser debug overlay for Level 1 testing

(function () {
  window.NBGLevel1DebugOverlay = {
    show(report) {
      let overlay = document.getElementById('nbg-debug-overlay');

      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'nbg-debug-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '10px';
        overlay.style.left = '10px';
        overlay.style.padding = '10px';
        overlay.style.fontFamily = 'monospace';
        overlay.style.background = 'rgba(0,0,0,0.8)';
        overlay.style.color = '#fff';
        overlay.style.zIndex = '9999';
        document.body.appendChild(overlay);
      }

      overlay.textContent = JSON.stringify(report, null, 2);
    }
  };
})();
