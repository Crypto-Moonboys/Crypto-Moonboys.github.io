// NBG Player Animation Bridge
// Connects player movement state to the animation controller.

class PlayerControllerAnimationBridge {
  constructor(playerController, animationController) {
    this.player = playerController;
    this.animations = animationController;
  }

  update() {
    if (!this.player || !this.animations) return;

    if (this.player.isHit) {
      this.animations.setState('hit');
      return;
    }

    if (!this.player.grounded) {
      this.animations.setState('jump');
      return;
    }

    if (this.player.velocityX !== 0) {
      this.animations.setState('run');
      return;
    }

    this.animations.setState('idle');
  }
}

export default PlayerControllerAnimationBridge;
