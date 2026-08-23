// NBG Runner real asset binding
// Connects the first player artwork asset to the runtime loader.

export const NBGRunnerAssetBinding = {
  key: 'nbg-runner',
  src: './assets/player/nbg-runner-sprite-sheet.svg',
  frameWidth: 32,
  frameHeight: 48,
  animations: {
    idle: { row: 0, frames: 4, frameMs: 145 },
    run: { row: 1, frames: 6, frameMs: 88 },
    jump: { row: 2, frames: 1, frameMs: 145 },
    fall: { row: 3, frames: 1, frameMs: 145 },
    spray: { row: 4, frames: 4, frameMs: 110 },
    hurt: { row: 5, frames: 2, frameMs: 120 },
    win: { row: 6, frames: 2, frameMs: 145 }
  },
  aliases: {
    tag: 'spray',
    celebrate: 'win'
  }
};

if (typeof window !== 'undefined') {
  window.NBGPlayerAsset = NBGRunnerAssetBinding;
}
