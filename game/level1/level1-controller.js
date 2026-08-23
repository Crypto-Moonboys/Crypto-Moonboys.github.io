// Level 1 master controller
// Connects player, world, entities, collision, gameplay state and HUD

export class Level1Controller {
  constructor(modules = {}) {
    this.world = modules.world;
    this.player = modules.player;
    this.entities = modules.entities;
    this.collision = modules.collision;
    this.gameplay = modules.gameplay;
    this.hud = modules.hud;
    this.running = false;
  }

  init() {
    this.running = true;
    this.gameplay?.init();
    this.hud?.init();
  }

  update(delta) {
    if (!this.running) return;

    this.player?.update(delta);
    this.entities?.update(delta);
    this.collision?.update(delta);
    this.gameplay?.update(delta);
    this.hud?.update(this.gameplay?.state || {});
  }

  stop() {
    this.running = false;
  }
}
