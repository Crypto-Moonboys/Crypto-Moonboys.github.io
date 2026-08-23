// Level 1 player spawn runtime
// Creates the live player entity and connects it to animation/render systems.

(function () {
  window.Level1PlayerSpawnRuntime = {
    create(options = {}) {
      const player = {
        x: options.x ?? 40,
        y: options.y ?? 120,
        sprite: 'nbg-runner',
        frameX: 0,
        frameY: 0,
        frameWidth: 32,
        frameHeight: 48,
        animation: 'idle'
      };

      if (window.Level1PlayerAnimationRuntime) {
        window.Level1PlayerAnimationRuntime.bind(player);
      }

      return player;
    }
  };
})();
