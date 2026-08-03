export const animatedBackgrounds = {
  'matrix-rain': () => import('./matrix-rain.js'),
  'neon-pulse': () => import('./neon-pulse.js'),
  'pixel-starfield': () => import('./pixel-starfield.js'),
};

export function isAnimatedBackground(trait) {
  return trait?.kind === 'animated' && typeof trait.renderer === 'string';
}

export async function loadAnimatedBackground(renderer) {
  const loader = animatedBackgrounds[renderer];
  if (!loader) throw new Error(`Unknown animated background renderer: ${renderer}`);
  const module = await loader();
  if (typeof module.createBackgroundRenderer !== 'function') {
    throw new Error(`Animated background renderer ${renderer} is invalid.`);
  }
  return module.createBackgroundRenderer;
}
