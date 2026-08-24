// NBG Runner real asset binding
// Connects AutoSprite animation sheets to the runtime loader.

export const NBGRunnerAssetBinding = {
  key: 'nbg-runner',
  manifest: './assets/player/nbg-runner-animation-manifest.json'
};

if (typeof window !== 'undefined') {
  window.NBGPlayerAsset = NBGRunnerAssetBinding;
}
