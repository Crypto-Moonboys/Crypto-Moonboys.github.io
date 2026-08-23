// NBG London Graffiti Run
// Hooks the live Level 1 player into the animation runtime.

window.NBGLevel1PlayerAnimationHook = {
  attach(player, animationRuntime) {
    if (!player || !animationRuntime) return false;

    player.animationRuntime = animationRuntime;

    return true;
  },

  update(player) {
    if (!player || !player.animationRuntime) return;

    if (player.animation) {
      player.animationRuntime.setState(player.animation);
    }
  }
};
