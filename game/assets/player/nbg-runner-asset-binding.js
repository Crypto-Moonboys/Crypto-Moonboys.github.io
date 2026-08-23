// NBG Runner real asset binding
// Generated mirror entry point. Player sprite authority lives in asset-manifest.json.

export const NBGRunnerAssetBinding = {
  key: 'nbg-runner',
  manifest: './assets/asset-manifest.json'
};

if (typeof window !== 'undefined') {
  window.NBGPlayerAsset = NBGRunnerAssetBinding;
}
