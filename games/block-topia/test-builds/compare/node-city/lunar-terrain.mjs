const atlasColumns = 4;
const atlasRows = 3;
const patchTiles = 6;

// Build once in ground coordinates so adjacent patches share exact pixel edges.
// The renderer then projects the composed surface with the existing camera.
export function createLunarTerrain(width, height) {
  const floor = document.createElement('canvas');
  floor.width = floor.height = 0;
  const atlas = new Image();
  atlas.addEventListener('load', () => {
    const size = atlas.naturalWidth / atlasColumns;
    if (!Number.isInteger(size) || size * atlasRows !== atlas.naturalHeight) return;

    const pixelsPerTile = size / patchTiles;
    floor.width = Math.ceil(width * pixelsPerTile);
    floor.height = Math.ceil(height * pixelsPerTile);
    const ctx = floor.getContext('2d');
    const columns = Math.ceil(width / patchTiles);
    const rows = Math.ceil(height / patchTiles);
    const selected = [];
    let seed = 0x4c554e41;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const index = row * columns + col;
        const above = selected[index - columns];
        const left = col ? selected[index - 1] : undefined;
        let variant = (seed >>> 16) % (atlasColumns * atlasRows);
        while (variant === above || variant === left) {
          variant = (variant + 1) % (atlasColumns * atlasRows);
        }
        selected.push(variant);
        ctx.drawImage(atlas, (variant % atlasColumns) * size, Math.floor(variant / atlasColumns) * size,
          size, size, col * size, row * size, size, size);
      }
    }
  }, { once: true });
  atlas.src = new URL('./lunar-surface-atlas.webp?v=1', import.meta.url).href;
  return floor;
}
