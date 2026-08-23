// NBG London Graffiti Run
// Connects demo launcher to Level 1 runtime.

window.NBGDemo = window.NBGDemo || {};

window.NBGLevel1Boot = {
  start() {
    return NBGDemo.startLevel1();
  }
};

NBGDemo.startLevel1 = function () {
  if (window.Level1LaunchRuntime) {
    return window.Level1LaunchRuntime.start();
  }

  console.warn('Level1LaunchRuntime not loaded');
};

window.addEventListener('nbg-game-start', function () {
  NBGDemo.startLevel1();
});
