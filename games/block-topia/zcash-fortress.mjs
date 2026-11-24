// Isometric 12-frame atlas shared by the survival game and comparison maps.
export const fortressSize = { width: 112, height: 140, anchorY: 117 };

export function loadZcashFortress(file = "./assets/miners/zcash-fortress-iso.webp") {
  const image = new Image();
  image.src = new URL(file, import.meta.url).href;
  return image;
}

export function drawZcashFortress(ctx, image, x, y, zoom, seconds) {
  const { width, height, anchorY } = fortressSize;
  const frame = seconds === null ? 0 : Math.floor(seconds * 12) % 12;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, frame % 4 * 224, Math.floor(frame / 4) * 280, 224, 280,
    x - width * zoom / 2, y - anchorY * zoom, width * zoom, height * zoom);
  ctx.restore();
}
