export class ParticleEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.particles = [];
  }

  spawn(x, y, color = "#00ffff", count = 20) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 60,
        color
      });
    }
  }

  update() {
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    });
    this.particles = this.particles.filter(p => p.life > 0);
  }

  draw() {
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life / 60;
      this.ctx.fillRect(p.x, p.y, 2, 2);
    });
    this.ctx.globalAlpha = 1;
  }
}