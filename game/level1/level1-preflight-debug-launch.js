// NBG London Graffiti Run
// Connects preflight validation, debug overlay, and launch gate

(function () {
  window.NBGLevel1PreflightDebugLaunch = {
    run(preflight, overlay) {
      const result = preflight && typeof preflight.run === 'function'
        ? preflight.run()
        : { ready: false, checks: ['preflight-missing'] };

      if (overlay && typeof overlay.show === 'function') {
        overlay.show(result);
      }

      return result;
    }
  };
})();
