// NBG London Graffiti Run
// Connects Level 1 launch gate into demo startup flow

(function () {
  window.NBGDemoLaunchGateBridge = {
    start() {
      const gate = window.NBGLevel1LaunchGate;

      if (gate && typeof gate.start === 'function') {
        return gate.start();
      }

      window.dispatchEvent(new CustomEvent('nbg-level1-ready'));
      return { ready: true, fallback: true };
    }
  };
})();
