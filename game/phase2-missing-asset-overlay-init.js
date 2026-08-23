// NBG London Graffiti Run
// Initialises missing asset debug reporting in browser.

(function () {
  function initMissingAssetDebug() {
    if (!window.NBGPhase2MissingAssetReport) return;

    const report = window.NBGPhase2MissingAssetReport.run();

    window.dispatchEvent(new CustomEvent('nbg-phase2-missing-assets', {
      detail: report
    }));
  }

  window.addEventListener('load', initMissingAssetDebug);
})();
