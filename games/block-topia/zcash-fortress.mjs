// GK-approved baseline (games/block-topia/AGENTS.md). Keep native 672 × 840 miner frames, high-quality filtering, and the existing draw size and anchors.
// Mining landmark sprites shared by the survival game and comparison maps.
export const fortressSize = { width: 112, height: 140, anchorY: 117 };

export const towerScale = 1.7;

export function loadZcashFortress(file = "./assets/miners/zcash-fortress-iso.webp") {
  const image = new Image();
  const url = new URL(file, import.meta.url);
  url.searchParams.set("v", "2-detail");
  image.src = url.href;
  return image;
}

export function drawZcashFortress(ctx, image, x, y, zoom, seconds) {
  const { width, height, anchorY } = fortressSize;
  const frame = seconds === null ? 0 : Math.floor(seconds * 12) % 12;
  const frameWidth = image.naturalWidth / 4;
  const frameHeight = image.naturalHeight / 3;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, frame % 4 * frameWidth, Math.floor(frame / 4) * frameHeight, frameWidth, frameHeight,
    x - width * zoom / 2, y - anchorY * zoom, width * zoom, height * zoom);
  ctx.restore();
}
