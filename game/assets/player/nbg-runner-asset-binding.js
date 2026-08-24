// NBG Runner real asset binding
// Connects AutoSprite animation sheets to the runtime loader.

export const NBGRunnerAssetBinding = {
  key: 'nbg-runner',
  manifest: './assets/player/nbg-runner-animation-manifest.json',
  animations: {
    idle: './assets/player/animations/idle.png',
    run: './assets/player/animations/run.png',
    jump: './assets/player/animations/jump.png',
    fall: './assets/player/animations/fall.png',
    spray: './assets/player/animations/spray.png',
    hurt: './assets/player/animations/hurt.png',
    victory: './assets/player/animations/victory.png'
  }
};

if (typeof window !== 'undefined') {
  window.NBGPlayerAsset = NBGRunnerAssetBinding;
}
