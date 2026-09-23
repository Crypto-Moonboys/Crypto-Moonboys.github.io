#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  findSpritesheetIds,
  extractDownloadTargets,
  collectUrlCandidates,
  buildLocalAtlas
} = require("./generate-moonpet-assets.js");

const nestedJob = {
  status: "succeeded",
  result: {
    outputs: [
      {
        type: "spritesheet",
        payload: {
          id: "sheet_from_output_type"
        }
      },
      {
        nested: {
          spritesheet_ids: ["sheet_from_snake_plural"]
        }
      }
    ]
  },
  output: {
    spriteSheetIds: ["sheet_from_camel_plural"]
  }
};

const ids = findSpritesheetIds(nestedJob).sort();
assert.deepEqual(ids, [
  "sheet_from_camel_plural",
  "sheet_from_output_type",
  "sheet_from_snake_plural"
].sort());

const nestedSpriteSheet = {
  data: {
    assets: {
      render: {
        sheetUrl: "https://cdn.example.test/moonbot.png?token=abc"
      },
      metadata: {
        nested: {
          url: "https://cdn.example.test/moonbot.json?token=abc"
        }
      }
    }
  }
};

const urls = collectUrlCandidates(nestedSpriteSheet);
assert(urls.some((candidate) => candidate.kind === "png" && candidate.fieldName === "data.assets.render.sheetUrl"));
assert(urls.some((candidate) => candidate.kind === "atlas" && candidate.fieldName === "data.assets.metadata.nested.url"));

const targets = extractDownloadTargets(nestedSpriteSheet);
assert.equal(targets.find((target) => target.kind === "png").url, "https://cdn.example.test/moonbot.png?token=abc");
assert.equal(targets.find((target) => target.kind === "atlas").url, "https://cdn.example.test/moonbot.json?token=abc");

const sheetOnlySpriteSheet = {
  steps: [
    {},
    {
      outputs: {
        sheet_url: "https://cdn.example.test/moonbot-sheet-only.png"
      }
    }
  ]
};

const sheetOnlyTargets = extractDownloadTargets(sheetOnlySpriteSheet);
assert.equal(sheetOnlyTargets.length, 1);
assert.equal(sheetOnlyTargets[0].kind, "png");
assert.equal(sheetOnlyTargets[0].fieldName, "steps[1].outputs.sheet_url");

const generatedAtlas = buildLocalAtlas({
  frameCount: 25,
  frameSize: 256,
  sheetSize: { w: 1280, h: 1280 }
});
assert.equal(Object.keys(generatedAtlas.frames).length, 25);
assert.deepEqual(generatedAtlas.frames["0"], { x: 0, y: 0, w: 256, h: 256, duration: 1 });
assert.deepEqual(generatedAtlas.frames["24"], { x: 1024, y: 1024, w: 256, h: 256, duration: 1 });
assert.equal(generatedAtlas.meta.atlas_source, "generated_local");

console.log("moonpet extraction fixture ok");
