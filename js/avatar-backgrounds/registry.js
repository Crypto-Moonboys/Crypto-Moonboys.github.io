export const animatedBackgrounds = {
  'matrix-rain': () => import('./matrix-rain.js'),
  'neon-pulse': () => import('./neon-pulse.js'),
  'pixel-starfield': () => import('./pixel-starfield.js'),
  'bitcoin-code-rain': () => import('./bitcoin-code-rain.js'),
  'neon-outrun-grid': () => import('./neon-outrun-grid.js'),
  'pixel-arcade-city': () => import('./pixel-arcade-city.js'),
  'retro-sunset': () => import('./retro-sunset.js'),
  'graffiti-spray': () => import('./graffiti-spray.js'),
  'glitch-terminal': () => import('./glitch-terminal.js'),
  'floating-crypto-coins': () => import('./floating-crypto-coins.js'),
  'pixel-fire': () => import('./pixel-fire.js'),
  'blockchain-node-network': () => import('./blockchain-node-network.js'),
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
