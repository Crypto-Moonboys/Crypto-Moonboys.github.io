// NBG Game main loop
// Connects player, camera, entities and XP systems.

export class GameLoop {
  constructor(player, camera, xpSystem) {
    this.player = player;
    this.camera = camera;
    this.xpSystem = xpSystem;
    this.running = false;
    this.lastTime = 0;
  }

  start() {
    this.running = true;
    requestAnimationFrame((time) => this.tick(time));
  }

  tick(time) {
    if (!this.running) return;

    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.player.update(delta);
    this.camera.follow(this.player);

    requestAnimationFrame((nextTime) => this.tick(nextTime));
  }
}
