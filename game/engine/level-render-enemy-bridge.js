// Level Render Enemy Bridge
// Connects enemy sprite renderer into the Level 1 render pipeline.

export class LevelRenderEnemyBridge {
  constructor(enemyRenderer) {
    this.enemyRenderer = enemyRenderer;
  }

  init(renderer) {
    this.renderer = renderer;
    return true;
  }

  render(enemies, camera) {
    if (!this.enemyRenderer || !enemies) return;

    enemies.forEach((enemy) => {
      this.enemyRenderer.render(enemy, camera);
    });
  }
}
