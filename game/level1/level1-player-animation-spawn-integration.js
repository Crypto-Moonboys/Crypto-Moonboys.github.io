// NBG London Graffiti Run
// Connects Level 1 player spawn to animation runtime.

(function () {
  window.NBGLevel1PlayerAnimationSpawn = {
    attach(player, animationRuntime) {
      if (!player || !animationRuntime) return false;

      player.animationRuntime = animationRuntime;
      return true;
    }
  };
})();
