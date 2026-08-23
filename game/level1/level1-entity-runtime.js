// Level 1 Entity Runtime
// Handles coins, enemies, checkpoints and finish flag.

export class Level1EntityRuntime {
  constructor() {
    this.entities = [];
  }

  init(config = {}) {
    this.entities = [
      ...(config.coins || []),
      ...(config.enemies || []),
      ...(config.checkpoints || []),
      ...(config.finish || [])
    ];
  }

  update(deltaTime) {
    this.entities.forEach(entity => {
      if (typeof entity.update === 'function') {
        entity.update(deltaTime);
      }
    });
  }

  getEntities() {
    return this.entities;
  }
}
