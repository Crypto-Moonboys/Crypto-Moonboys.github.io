// NBG London Graffiti Run
// Browser adapter for Level1LaunchRuntime.
// Exposes a global runtime for classic script loading.

(function () {
  window.Level1LaunchRuntime = window.Level1LaunchRuntime || {
    running: false,

    async start(config = {}) {
      this.running = true;

      if (window.Level1MainRuntime && typeof window.Level1MainRuntime.init === 'function') {
        await window.Level1MainRuntime.init(config);
      }

      return {
        level: 'London Graffiti Run',
        status: 'running'
      };
    },

    stop() {
      this.running = false;
    }
  };
})();
