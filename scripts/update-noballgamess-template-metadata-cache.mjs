#!/usr/bin/env node

import { updateNoballgamessTemplateMetadataCache } from './noballgamess-tracker-lib.mjs';

export { updateNoballgamessTemplateMetadataCache };

if (process.argv[1] && process.argv[1].endsWith('update-noballgamess-template-metadata-cache.mjs')) {
  updateNoballgamessTemplateMetadataCache()
    .then((result) => console.log(`noballgamess metadata: ${result.ok}/${result.templates} ok`))
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

