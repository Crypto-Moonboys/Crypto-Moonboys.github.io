// NBG Game - Level 1 Collision Runtime
// Handles interactions between player and Level 1 entities.

export class Level1CollisionRuntime {
  constructor() {
    this.events = [];
  }

  init(player, entities) {
    this.player = player;
    this.entities = entities || [];
    this.events = [];
  }

  update() {
    if (!this.player) return;

    this.entities.forEach(entity => {
      if (!entity.active) return;

      if (this.overlap(this.player, entity)) {
        this.handleCollision(entity);
      }
    });
  }

  overlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  handleCollision(entity) {
    switch (entity.type) {
      case 'coin':
        entity.active = false;
        this.events.push({ type: 'xp-collected', value: entity.value || 1 });
        break;
      case 'enemy':
        this.events.push({ type: 'player-hit' });
        break;
      case 'checkpoint':
        this.events.push({ type: 'checkpoint-reached', position: entity.position });
        break;
      case 'finish':
        this.events.push({ type: 'level-complete' });
        break;
    }
  }

  getEvents() {
    return this.events.splice(0);
  }
}
