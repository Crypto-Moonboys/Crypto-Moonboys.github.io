// NBG Runner Player Controller
// SNES-style movement foundation

export class PlayerController {
  constructor(entity) {
    this.entity = entity;
    this.speed = 2.5;
    this.jumpPower = -7;
    this.gravity = 0.35;
    this.velocityY = 0;
    this.grounded = false;
    this.animation = 'idle';
  }

  update(input, collision) {
    if (input.left) {
      this.entity.x -= this.speed;
      this.animation = 'run';
    }

    if (input.right) {
      this.entity.x += this.speed;
      this.animation = 'run';
    }

    if (!input.left && !input.right) {
      this.animation = 'idle';
    }

    this.velocityY += this.gravity;
    this.entity.y += this.velocityY;

    if (collision.ground(this.entity)) {
      this.entity.y = collision.floorY(this.entity);
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    if (input.jump && this.grounded) {
      this.velocityY = this.jumpPower;
      this.grounded = false;
      this.animation = 'jump';
    }
  }
}
