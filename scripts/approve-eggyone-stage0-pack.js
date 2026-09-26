#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "data", "moonpet-eggyone-stage0-assets.json");
const CHARACTER_ID = "cmui5g9430007v27qp8scqirq";
const EXPECTED = [
  ["egg_idle", "EGGONE", "cmui5ivji000iv27qva0k6za6", true, false],
  ["egg_wobble", "EGGTWO", "cmui5lde60001j0b4thbs6y43", true, false],
  ["egg_sleep", "EGGTHREE", "cmui5nhjc000naepv4aspp2fg", true, false],
  ["egg_react", "EGGFOUR", "cmui5n2ct000jlw198nde7i4l", false, true],
  ["egg_care", "EGGFIVE", "cmui5ozdd0001m4nvqqrvqi4p", false, true],
  ["egg_breakout", "EGGSIX", "cmui5p4yz001pm4nva1bg9jr5", false, true],
  ["egg_hatch", "EGGSEVEN", "cmui5qbz40001hki2qjhib2hh", false, true]
];

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
if (manifest.character_name !== "EGGYONE" || manifest.character_id !== CHARACTER_ID) {
  throw new Error("EGGYONE character identity does not match the approved AutoSprite character.");
}
const sourceAssets = Array.isArray(manifest.animations) ? manifest.animations : manifest.assets;
if (!Array.isArray(sourceAssets) || sourceAssets.length !== EXPECTED.length) {
  throw new Error(`Expected exactly ${EXPECTED.length} existing EGGYONE sheets.`);
}

const assets = EXPECTED.map(([role, animationName, sheetId, loop, oneShot]) => {
  const source = sourceAssets.find((entry) => entry.role === role);
  const sourceSheetId = source && (source.autosprite_spritesheet_id || source.autosprite?.spritesheet_id);
  if (!source || source.autosprite_animation_name !== animationName || sourceSheetId !== sheetId) {
    throw new Error(`${role} does not match its approved existing AutoSprite sheet.`);
  }
  const frameDimensions = source.frame_size || source.frame_dimensions;
  const sheetDimensions = source.sheet_size || source.sheet_dimensions;
  if (source.frame_count !== 25 || frameDimensions?.w !== 256 || frameDimensions?.h !== 256) {
    throw new Error(`${role} must retain its authoritative 25-frame 256x256 atlas.`);
  }
  return {
    role,
    autosprite_animation_name: animationName,
    png_path: source.png_path,
    atlas_path: source.atlas_path,
    frame_count: source.frame_count,
    frame_dimensions: frameDimensions,
    sheet_dimensions: sheetDimensions,
    fps: 12,
    loop,
    one_shot: oneShot,
    playback_mode: source.playback_mode,
    autosprite: {
      character_id: CHARACTER_ID,
      spritesheet_id: sheetId,
      animation_name: animationName
    },
    provenance: "existing AutoSprite spritesheet; no generation request was made",
    review_status: "approved_visual_review"
  };
});

const approved = {
  schema_version: 2,
  character_name: "EGGYONE",
  character_id: CHARACTER_ID,
  source: "AutoSprite API",
  provenance: "seven existing AutoSprite sheets; no generation request was made",
  downloaded_at: manifest.downloaded_at,
  approved_at: "2026-09-26T09:19:19.626Z",
  approval_status: "approved_visual_review",
  cache_version: "eggyone-stage0-approved-v1",
  contact_sheet_path: manifest.contact_sheet_path,
  runtime_role_map: {
    idle: "egg_idle",
    wobble: "egg_wobble",
    sleep: "egg_sleep",
    feed: "egg_care",
    clean: "egg_care",
    play: "egg_care",
    interact: "egg_react",
    greet: "egg_react",
    blocked: "egg_react",
    breakout: "egg_breakout",
    hatch: "egg_hatch",
    evolve: "egg_hatch"
  },
  display: { scale: 1, fit_width: 184, fit_height: 184, pivot_y: 1 },
  assets
};

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(approved, null, 2)}\n`);
console.log(`Approved ${assets.length} genuine EGGYONE AutoSprite sheets.`);
