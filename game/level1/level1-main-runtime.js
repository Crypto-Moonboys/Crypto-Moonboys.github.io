// NBG London Graffiti Run - Level 1 Main Runtime
// Connects the complete Level 1 controller stack.

class Level1MainRuntime {
  constructor(config = {}) {
    this.config = config;
    this.controller = new window.Level1Controller(config);
    this.running = false;
  }

  init() {
    this.controller.init();
    this.running = true;
  }

  update(delta) {
    if (!this.running) return;
    this.controller.update(delta);
  }

  stop() {
    this.running = false;
    this.controller.stop();
  }
}

window.Level1MainRuntime = Level1MainRuntime;
