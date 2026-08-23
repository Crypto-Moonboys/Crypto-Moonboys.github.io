// NBG London Graffiti Run
// Level 1 preflight validation

const Level1PreflightRunner = {
  checks: [],

  init() {
    this.checks = [];
    return this;
  },

  check(name, value) {
    this.checks.push({
      name,
      status: Boolean(value)
    });
  },

  run(systems = {}) {
    this.init();

    this.check('sceneBootstrap', systems.sceneBootstrap);
    this.check('runtime', systems.runtime);
    this.check('renderer', systems.renderer);
    this.check('player', systems.player);
    this.check('world', systems.world);
    this.check('entities', systems.entities);
    this.check('collision', systems.collision);
    this.check('hud', systems.hud);
    this.check('assets', systems.assets);

    return {
      ready: this.checks.every(item => item.status),
      checks: this.checks
    };
  }
};

window.Level1PreflightRunner = Level1PreflightRunner;
