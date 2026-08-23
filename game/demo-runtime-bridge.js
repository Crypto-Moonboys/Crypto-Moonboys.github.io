// NBG London Graffiti Run - Demo Runtime Bridge
// Connects the launch page to the Level 1 runtime.

window.NBGGame = {
  started: false,

  start() {
    if (this.started) return;
    this.started = true;

    const event = new CustomEvent('nbg-game-start', {
      detail: {
        level: 'london-level-1',
        mode: 'xp-run'
      }
    });

    window.dispatchEvent(event);
  }
};

window.addEventListener('nbg-game-start', (event) => {
  console.log('Starting NBG Game:', event.detail);

  if (window.Level1Runtime && typeof window.Level1Runtime.init === 'function') {
    window.Level1Runtime.init(event.detail);
  }
});
