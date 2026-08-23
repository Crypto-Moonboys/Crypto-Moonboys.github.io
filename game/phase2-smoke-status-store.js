// NBG London Graffiti Run
// Stores the latest Phase 2 smoke test result for debugging.

(function () {
  window.NBGPhase2Status = {
    latest: null,

    update(report) {
      this.latest = report;
      return this.latest;
    },

    get() {
      return this.latest;
    }
  };

  window.addEventListener('nbg-phase2-smoke-report', function (event) {
    window.NBGPhase2Status.update(event.detail || {});
  });
})();
