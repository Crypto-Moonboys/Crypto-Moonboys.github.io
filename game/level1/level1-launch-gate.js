// NBG London Graffiti Run
// Final Level 1 launch gate

(function () {
  window.NBGLevel1LaunchGate = {
    start() {
      const ready = window.NBGLevel1Preflight && window.NBGLevel1Preflight.run
        ? window.NBGLevel1Preflight.run()
        : { ready: true };

      if (!ready.ready) {
        console.warn('Level 1 launch blocked', ready);
        return false;
      }

      window.dispatchEvent(new CustomEvent('nbg-level1-ready', {
        detail: { level: 'london-level-1' }
      }));

      return true;
    }
  };
})();
