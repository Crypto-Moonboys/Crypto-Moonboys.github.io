// NBG Level 1 tile map

export class TileMap {
  constructor(levelData) {
    this.tiles = levelData.tiles || [];
    this.tileSize = levelData.tileSize || 16;
  }

  draw(ctx, camera, tileset) {
    this.tiles.forEach(tile => {
      const x = tile.x * this.tileSize - camera.x;
      const y = tile.y * this.tileSize;

      if (tileset) {
        ctx.drawImage(
          tileset,
          tile.spriteX || 0,
          tile.spriteY || 0,
          this.tileSize,
          this.tileSize,
          x,
          y,
          this.tileSize,
          this.tileSize
        );
      }
    });
  }
}
