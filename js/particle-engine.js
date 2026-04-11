
// Moonboys Arcade - Particle Engine
export class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 4;
    this.vy = (Math.random() - 0.5) * 4;
    this.life = 60;
    this.color = color;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, 2, 2);
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, color));
    }
  }

  update(ctx) {
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.update();
      p.draw(ctx);
    });
  }
}
