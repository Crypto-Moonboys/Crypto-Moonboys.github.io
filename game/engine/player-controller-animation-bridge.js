// NBG Player Animation Bridge
// Connects player movement state to the animation controller.

class PlayerControllerAnimationBridge {
  constructor(playerController, animationController) {
    this.player = playerController;
    this.animations = animationController;
  }

  update() {
    if (!this.player || !this.animations) return;

    if (this.player.isHit || this.player.hurt) {
      this.animations.setState('damaged');
      return;
    }

    if (!this.player.grounded) {
      this.animations.setState(this.player.velocityY > 0 ? 'falling' : 'airborne');
      return;
    }

    if (this.player.velocityX !== 0) {
      this.animations.setState('moving');
      return;
    }

    this.animations.setState('idle');
  }
}

export default PlayerControllerAnimationBridge;
