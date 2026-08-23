// NBG London Graffiti Run
// Phase 2 browser console capture

(function () {
  window.NBGPhase2ConsoleCapture = {
    errors: [],

    init() {
      window.addEventListener('error', (event) => {
        this.errors.push({
          message: event.message || 'Unknown error',
          source: event.filename || '',
          line: event.lineno || 0
        });

        window.dispatchEvent(new CustomEvent('nbg-runtime-error', {
          detail: this.errors[this.errors.length - 1]
        }));
      });

      return this;
    },

    getErrors() {
      return this.errors;
    }
  };

  window.NBGPhase2ConsoleCapture.init();
})();
