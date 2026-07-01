#!/usr/bin/env node

import { updateNoballgamessAssetStateCache } from './noballgamess-tracker-lib.mjs';

export { updateNoballgamessAssetStateCache };

if (process.argv[1] && process.argv[1].endsWith('update-noballgamess-asset-state-cache.mjs')) {
  updateNoballgamessAssetStateCache()
    .then((result) => console.log(`noballgamess asset state: ${result.assets} assets, ${result.templates} templates, ${result.errors} errors`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

