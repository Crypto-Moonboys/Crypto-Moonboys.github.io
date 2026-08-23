// Level 1 Launch Runtime
// Connects the demo launcher to the complete Level 1 runtime stack.

import { Level1MainRuntime } from './level1-main-runtime.js';

export class Level1LaunchRuntime {
  constructor() {
    this.runtime = new Level1MainRuntime();
    this.running = false;
  }

  async start(config = {}) {
    if (this.running) return;

    await this.runtime.init(config);
    this.running = true;

    return {
      level: 'London Graffiti Run',
      status: 'running'
    };
  }

  update(delta) {
    if (!this.running) return;
    this.runtime.update(delta);
  }

  stop() {
    this.runtime.stop();
    this.running = false;
  }
}
