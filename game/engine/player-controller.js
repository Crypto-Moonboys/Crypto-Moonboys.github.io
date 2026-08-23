// NBG Runner Player Controller
// SNES-style movement foundation with animation state output

export class PlayerController {
  constructor(entity, animationController = null) {
    this.entity = entity;
    this.speed = 2.5;
    this.jumpPower = -7;
    this.gravity = 0.35;
    this.velocityY = 0;
    this.grounded = false;
    this.animation = 'idle';
    this.animationController = animationController;
  }

  setAnimation(state) {
    this.animation = state;

    if (this.animationController) {
      this.animationController.setState(state);
    }
  }

  update(input, collision) {
    if (input.left) {
      this.entity.x -= this.speed;
      this.setAnimation('run');
    }

    if (input.right) {
      this.entity.x += this.speed;
      this.setAnimation('run');
    }

    if (!input.left && !input.right && this.grounded) {
      this.setAnimation('idle');
    }

    this.velocityY += this.gravity;
    this.entity.y += this.velocityY;

    if (collision.ground(this.entity)) {
      this.entity.y = collision.floorY(this.entity);
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.setAnimation('jump');
    }

    if (input.jump && this.grounded) {
      this.velocityY = this.jumpPower;
      this.grounded = false;
      this.setAnimation('jump');
    }
  }
}
