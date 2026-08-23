// NBG London Graffiti Run runtime launcher
// Connects the demo page to the game runtime.

window.NBGGame = window.NBGGame || {};

NBGGame.start = function () {
  NBGGame.state = {
    running: true,
    level: 'london-level-1',
    xp: 0
  };

  console.log('NBG London Graffiti Run started');
};
