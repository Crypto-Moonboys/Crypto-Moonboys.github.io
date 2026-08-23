// NBG London Graffiti Run
// Browser adapter for Level1LaunchRuntime.
// Exposes the runtime for classic script loading.

(function () {
  if (!window.Level1LaunchRuntime) {
    window.Level1LaunchRuntime = {
      running: false,
      async start(config = {}) {
        this.running = true;
        return {
          level: config.level || 'London Graffiti Run',
          status: 'running'
        };
      },
      stop() {
        this.running = false;
      }
    };
  }
})();
