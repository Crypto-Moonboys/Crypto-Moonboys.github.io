// NBG Level 1 Player Animation Runtime
// Connects player animation state to the Level 1 runtime.

const Level1PlayerAnimationRuntime = {
  animationController: null,
  player: null,

  init(player, animationController) {
    this.player = player;
    this.animationController = animationController;
  },

  bind(player, animationController = this.animationController || (typeof window !== 'undefined' ? window.NBGAnimationController : null)) {
    this.init(player, animationController);
    return !!this.player && !!this.animationController;
  },

  update() {
    if (!this.player || !this.animationController) return;

    if (this.player.hurt || this.player.hit) {
      this.animationController.setState('damaged');
    } else if (!this.player.grounded) {
      this.animationController.setState(this.player.velocityY > 0 ? 'falling' : 'airborne');
    } else if (this.player.velocityX !== 0) {
      this.animationController.setState('moving');
    } else {
      this.animationController.setState('idle');
    }
  }
};

if (typeof window !== 'undefined') {
  window.Level1PlayerAnimationRuntime = Level1PlayerAnimationRuntime;
}
