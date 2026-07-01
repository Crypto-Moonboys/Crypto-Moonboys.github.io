#!/usr/bin/env node

import { updateNoballgamessRarityFeed } from './noballgamess-tracker-lib.mjs';

export { updateNoballgamessRarityFeed };

if (process.argv[1] && process.argv[1].endsWith('update-noballgamess-rarity-feed.mjs')) {
  updateNoballgamessRarityFeed()
    .then((status) => console.log(`noballgamess_rarity: ${status.status}`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

