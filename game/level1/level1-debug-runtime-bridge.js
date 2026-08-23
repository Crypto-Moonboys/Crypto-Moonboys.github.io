// NBG London Graffiti Run
// Connects debug reporting into Level 1 browser launch flow.

const Level1DebugRuntimeBridge = {
  init(debugReport) {
    this.report = debugReport || null;
    return { ready: true };
  },

  runChecks() {
    if (!this.report) {
      return { ready: false, error: 'debug report unavailable' };
    }

    return this.report.run();
  }
};

window.Level1DebugRuntimeBridge = Level1DebugRuntimeBridge;
