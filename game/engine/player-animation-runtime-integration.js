// NBG Runner player animation runtime integration
// Connects player controller animation state to the animation controller.

(function () {
  window.NBGPlayerAnimationRuntime = {
    update(player, animationController) {
      if (!player || !animationController) return;

      const state = player.animation || 'idle';
      animationController.setState(state);

      return animationController.getCurrentAnimation();
    }
  };
})();
