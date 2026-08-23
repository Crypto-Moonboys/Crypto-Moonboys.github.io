// NBG Runner animation runtime bridge
// Connects player controller state to the sprite animation controller.

(function () {
  window.NBGPlayerAnimationRuntime = {
    update(player, animationController) {
      if (!player || !animationController) return;

      const state = player.animation || 'idle';
      animationController.setState(state);

      return {
        state,
        frame: animationController.getFrame ? animationController.getFrame() : 0
      };
    }
  };
})();
