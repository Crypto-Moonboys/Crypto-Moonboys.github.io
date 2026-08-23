// NBG London Graffiti Run - Demo Launch Integration
// Connects the START screen to the Level 1 boot runtime.

(function () {
  function startNBGGame() {
    window.dispatchEvent(new CustomEvent('nbg-game-start', {
      detail: {
        level: 'london-level-1',
        mode: 'demo'
      }
    }));

    if (window.NBGLevel1Boot && typeof window.NBGLevel1Boot.start === 'function') {
      window.NBGLevel1Boot.start();
    }
  }

  window.startNBGGame = startNBGGame;

  document.addEventListener('DOMContentLoaded', function () {
    const button = document.getElementById('start-game');
    if (button) {
      button.addEventListener('click', startNBGGame);
    }
  });
})();
