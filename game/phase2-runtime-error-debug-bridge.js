// NBG London Graffiti Run
// Phase 2 runtime error debug bridge

(function () {
  window.NBGPhase2RuntimeDebugBridge = {
    init(report = window.NBGPhase2RuntimeErrorReport) {
      this.report = report;
      return this;
    },

    getStatus() {
      if (!this.report) {
        return {
          ready: false,
          errors: ['runtime error report unavailable']
        };
      }

      return this.report.getReport
        ? this.report.getReport()
        : { ready: true, errors: [] };
    }
  };
})();
