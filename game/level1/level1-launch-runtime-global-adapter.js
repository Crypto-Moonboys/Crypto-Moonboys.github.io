// NBG London Graffiti Run
// Browser adapter for Level1LaunchRuntime.
// Exposes the runtime for classic script loading.

(function () {
  const runtime = window.Level1LaunchRuntime;

  if (runtime && typeof runtime.start === 'function') {
    window.NBGLevel1RuntimeReady = true;
    return;
  }

  window.Level1LaunchRuntime = {
    running: false,
    async start(config = {}) {
      this.running = true;
      window.NBGLevel1RuntimeReady = true;

      return {
        level: config.level || 'London Graffiti Run',
        status: 'running'
      };
    },
    stop() {
      this.running = false;
      window.NBGLevel1RuntimeReady = false;
    }
  };
})();
