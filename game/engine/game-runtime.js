// NBG London Graffiti Run runtime connector
// Connects boot, level, renderer, player, camera and HUD.

class GameRuntime {
  constructor(systems) {
    this.systems = systems;
    this.running = false;
    this.lastTime = 0;
  }

  start() {
    this.running = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(time) {
    if (!this.running) return;

    const delta = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    this.systems.input?.update();
    this.systems.player?.update(delta);
    this.systems.level?.update(delta);
    this.systems.camera?.follow(this.systems.player);
    this.systems.renderer?.render();
    this.systems.hud?.update();

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.GameRuntime = GameRuntime;
