// NBG London Graffiti Run - Level 1 Main Runtime
// Connects the complete Level 1 controller stack.

import Level1Controller from './level1-controller.js';

export default class Level1MainRuntime {
  constructor(config = {}) {
    this.config = config;
    this.controller = new Level1Controller(config);
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
