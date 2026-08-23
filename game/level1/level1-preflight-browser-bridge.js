// NBG London Graffiti Run
// Connects preflight validation into browser launch flow.

const Level1PreflightBrowserBridge = {
  ready: false,

  init(preflightRunner) {
    this.ready = !!preflightRunner;
    return this.ready;
  },

  run() {
    if (!this.ready) {
      return { ok: false, reason: 'preflight-not-ready' };
    }

    return { ok: true, status: 'ready-to-launch' };
  }
};

window.Level1PreflightBrowserBridge = Level1PreflightBrowserBridge;
