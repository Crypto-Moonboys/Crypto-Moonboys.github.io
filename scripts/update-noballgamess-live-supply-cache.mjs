#!/usr/bin/env node

import { updateNoballgamessLiveSupplyCache } from './noballgamess-tracker-lib.mjs';

export { updateNoballgamessLiveSupplyCache };

if (process.argv[1] && process.argv[1].endsWith('update-noballgamess-live-supply-cache.mjs')) {
  updateNoballgamessLiveSupplyCache()
    .then((result) => console.log(`noballgamess live supply: ${result.ok}/${result.templates} ok`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

