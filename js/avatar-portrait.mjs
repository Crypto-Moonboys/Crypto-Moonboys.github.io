export function loadAvatarImage(trait) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${trait.name} could not be loaded for export.`));
    image.src = trait.layer;
  });
}

export function paintAvatarLayers(canvas, layers) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Avatar rendering is not supported by this browser.');
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  for (const layer of layers) context.drawImage(layer, 0, 0, width, height);
}

export async function downloadPortraitPng(canvas, filename) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('The browser could not create the PNG.'));
    }, 'image/png');
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
