#!/usr/bin/env node

import { generateNoballgamessRarity } from './noballgamess-tracker-lib.mjs';

export { generateNoballgamessRarity };

if (process.argv[1] && process.argv[1].endsWith('generate-noballgamess-rarity.mjs')) {
  generateNoballgamessRarity()
    .then((result) => console.log(`noballgamess rarity: ${result.ranked} ranked, ${result.utility} utility/open mint, ${result.unissued} unissued`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

