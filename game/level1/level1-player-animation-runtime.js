// NBG Level 1 Player Animation Runtime
// Connects player animation state to the Level 1 runtime.

const Level1PlayerAnimationRuntime = {
  animationController: null,
  player: null,

  init(player, animationController) {
    this.player = player;
    this.animationController = animationController;
  },

  update() {
    if (!this.player || !this.animationController) return;

    if (this.player.hit) {
      this.animationController.setState('hit');
    } else if (!this.player.grounded) {
      this.animationController.setState('jump');
    } else if (this.player.velocityX !== 0) {
      this.animationController.setState('run');
    } else {
      this.animationController.setState('idle');
    }
  }
};
