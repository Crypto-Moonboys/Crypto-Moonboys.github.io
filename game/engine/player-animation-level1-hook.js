// NBG Runner Level 1 animation hookup
// Connects the live player entity to the animation runtime.

(function () {
  window.NBGPlayerAnimationHook = {
    connect(player, animationRuntime) {
      if (!player || !animationRuntime) return false;

      player.animationRuntime = animationRuntime;

      return true;
    },

    update(player) {
      if (!player || !player.animationRuntime) return;

      player.animationRuntime.setState(player.animation || 'idle');
    }
  };
})();
