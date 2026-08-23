// NBG London Graffiti Run
// Connects demo launcher to Level 1 runtime.

window.NBGDemo = window.NBGDemo || {};

NBGDemo.startLevel1 = function () {
  if (window.Level1LaunchRuntime) {
    return window.Level1LaunchRuntime.start();
  }

  console.warn('Level1LaunchRuntime not loaded');
};

window.addEventListener('nbg-game-start', function () {
  NBGDemo.startLevel1();
});
