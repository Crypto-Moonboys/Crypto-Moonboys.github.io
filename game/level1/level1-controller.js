// Level 1 master controller
// Connects player, world, collision, HUD, spawn, animation and rendering

export class Level1Controller {
  constructor(modules = {}) {
    this.world = modules.world;
    this.player = modules.player;
    this.spawn = modules.spawn;
    this.entities = modules.entities;
    this.collision = modules.collision;
    this.gameplay = modules.gameplay;
    this.hud = modules.hud;
    this.animation = modules.animation;
    this.animationHook = modules.animationHook;
    this.playerRenderer = modules.playerRenderer;
    this.running = false;
  }

  init() {
    this.running = true;

    if (this.spawn?.createPlayer && !this.player) {
      this.player = this.spawn.createPlayer();
    }

    this.gameplay?.init();
    this.hud?.init();
    this.animationHook?.init(this.player, this.animation);
  }

  update(delta) {
    if (!this.running) return;

    this.player?.update(delta);
    this.animationHook?.update(this.player);
    this.animation?.update?.(delta);
    this.entities?.update(delta);
    this.collision?.update(delta);
    this.gameplay?.update(delta);
    this.hud?.update(this.gameplay?.state || {});
  }

  render(context, assets) {
    this.world?.render?.(context, assets);
    this.entities?.render?.(context, assets);
    this.playerRenderer?.draw?.(context, this.player);
    this.hud?.render?.(context);
  }

  stop() {
    this.running = false;
  }
}
