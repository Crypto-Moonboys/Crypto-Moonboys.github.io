// NBG Runner real asset binding
// Connects the first player artwork asset to the runtime loader.

(function () {
  window.NBGPlayerAsset = {
    key: 'nbg-runner',
    source: './assets/player/nbg-runner-sheet.svg',
    frames: {
      width: 32,
      height: 48
    },
    animations: {
      idle: 4,
      run: 6,
      jump: 2,
      spray: 4,
      hit: 2
    }
  };
})();
