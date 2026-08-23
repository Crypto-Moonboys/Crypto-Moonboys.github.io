// NBG London Graffiti Run
// Phase 2 runtime error overlay listener

(function () {
  window.NBGPhase2ErrorOverlay = {
    errors: [],

    init() {
      window.addEventListener('nbg-runtime-error', (event) => {
        this.errors.push(event.detail || { message: 'Unknown runtime error' });
        this.render();
      });
    },

    render() {
      const panel = document.getElementById('nbg-debug-panel');
      if (!panel) return;

      panel.textContent = this.errors.length
        ? JSON.stringify(this.errors, null, 2)
        : 'No runtime errors';
    }
  };

  window.NBGPhase2ErrorOverlay.init();
})();
