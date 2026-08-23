// Level 1 object sprite renderer
// Handles checkpoints, finish flags, platforms, pipes, and crates.

class ObjectSpriteRenderer {
  constructor(assetLoader) {
    this.assetLoader = assetLoader;
  }

  init() {
    this.ready = true;
  }

  render(objects, ctx, camera) {
    if (!this.ready || !objects) return;

    objects.forEach(object => {
      const x = object.x - (camera?.x || 0);
      const y = object.y - (camera?.y || 0);

      // Placeholder until final artwork assets are imported.
      ctx.fillRect(x, y, object.width || 16, object.height || 16);
    });
  }
}

export default ObjectSpriteRenderer;
