import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "data", "moonpet-botty-front-assets.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const expectedRoles = [
  "front_idle",
  "front_feed",
  "front_play",
  "front_clean",
  "front_sleep",
  "front_train",
  "front_travel",
  "front_work",
  "front_equip",
  "front_evolve",
  "front_trade",
  "front_celebrate",
  "front_interact",
  "front_blocked",
  "front_battle"
];

const expectedMap = {
  idle: "front_idle",
  feed: "front_feed",
  play: "front_play",
  clean: "front_clean",
  sleep: "front_sleep",
  train: "front_train",
  travel: "front_travel",
  work: "front_work",
  equip: "front_equip",
  evolve: "front_evolve",
  trade: "front_trade",
  celebrate: "front_celebrate",
  interact: "front_interact",
  greet: "front_interact",
  blocked: "front_blocked",
  battle: "front_battle"
};

assert.equal(manifest.character_name, "BOTTY");
assert.equal(manifest.character_id, "cmuh1eo4p000113f3alnoim0v");
assert.equal(manifest.runtime_policy.normal_gameplay, "botty_front_only");
assert.equal(manifest.runtime_policy.disable_side_scroller, true);
assert.equal(manifest.runtime_policy.disable_wearable_overlays, true);
assert.deepEqual(manifest.runtime_role_map, expectedMap);

const assetsByRole = new Map(manifest.assets.map((asset) => [asset.role, asset]));
assert.deepEqual([...assetsByRole.keys()].sort(), [...expectedRoles].sort());

for (const role of expectedRoles) {
  const asset = assetsByRole.get(role);
  assert.equal(asset.review_status, "approved_visual_review", role);
  assert.match(asset.png_path, /^\/img\/moonpets\/botty\/front_/);
  assert.match(asset.atlas_path, /^\/img\/moonpets\/botty\/front_/);
  const pngPath = path.join(root, asset.png_path.replace(/^\//, ""));
  const atlasPath = path.join(root, asset.atlas_path.replace(/^\//, ""));
  assert.ok(fs.existsSync(pngPath), `${role} PNG exists`);
  assert.ok(fs.statSync(pngPath).size > 10000, `${role} PNG has content`);
  assert.ok(fs.existsSync(atlasPath), `${role} atlas exists`);
  const atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
  const frameCount = Array.isArray(atlas.frames) ? atlas.frames.length : Object.keys(atlas.frames || {}).length;
  assert.equal(frameCount, asset.frame_count, `${role} manifest frame count matches atlas`);
  assert.equal(asset.autosprite.character_id, manifest.character_id, `${role} AutoSprite provenance`);
}

const html = fs.readFileSync(path.join(root, "moonpet-game.html"), "utf8");
assert.match(html, /moonpet-bot-art-loader\.js\?v=20260926-multi-bot-art-v1/);
assert.match(html, /moonpet-bot-art-renderer\.js\?v=20260926-multi-bot-art-v1/);
assert.match(html, /moonpet-mini-app\.js\?v=20260926-multi-bot-art-v1/);
assert.doesNotMatch(html, /moonpet-art-v2\.js/, "live BOTTY page must not load the old procedural overlay renderer");

const miniApp = fs.readFileSync(path.join(root, "js", "moonpet-mini-app.js"), "utf8");
assert.match(miniApp, /return false;\s*\}/, "side sprites default is disabled through moonpetSideScrollerSpritesRequested");
assert.match(miniApp, /drawSelectedBotSprite\(renderTime, animationMode, active/);
assert.doesNotMatch(miniApp, /data-utility="wearables">WEARABLES/);

console.log("BOTTY front pack live runtime checks passed");
