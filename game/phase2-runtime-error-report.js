// NBG London Graffiti Run
// Phase 2 runtime error reporting

window.NBGPhase2RuntimeErrors = {
  errors: [],

  capture(error) {
    this.errors.push({
      message: error?.message || String(error),
      time: Date.now()
    });
  },

  clear() {
    this.errors = [];
  },

  report() {
    return {
      ready: this.errors.length === 0,
      errors: this.errors
    };
  }
};

window.addEventListener('error', (event) => {
  window.NBGPhase2RuntimeErrors.capture(event.error || event.message);
});
