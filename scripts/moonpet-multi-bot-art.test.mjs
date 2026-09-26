import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-bot-art-registry.json"), "utf8"));
const expectedRoles = [
  "front_idle", "front_feed", "front_play", "front_clean", "front_sleep",
  "front_train", "front_travel", "front_work", "front_equip", "front_evolve",
  "front_trade", "front_celebrate", "front_interact", "front_blocked", "front_battle"
];

assert.equal(registry.default_bot, "BOTTY");
assert.equal(registry.bots.BOTTY.status, "complete");
assert.deepEqual(registry.bots.BOTTY.canonical_species_ids, ["vinyl_crab"]);
assert.equal(registry.bots.TUBBY.status, "complete");
assert.deepEqual(registry.bots.TUBBY.canonical_species_ids, ["comet_gecko"]);
for (const [name, config] of Object.entries(registry.bots)) {
  if (name !== "BOTTY" && name !== "TUBBY") assert.equal(config.fallback, "BOTTY", `${name} fallback`);
}

for (const bot of ["botty", "tubby"]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", `moonpet-${bot}-front-assets.json`), "utf8"));
  assert.equal(manifest.assets.length, 15, `${bot} asset count`);
  assert.deepEqual(manifest.assets.map((asset) => asset.role), expectedRoles, `${bot} roles`);
  for (const asset of manifest.assets) {
    const png = path.join(root, asset.png_path.replace(/^\//, ""));
    const atlasPath = path.join(root, asset.atlas_path.replace(/^\//, ""));
    assert.ok(fs.statSync(png).size > 10000, `${bot} ${asset.role} PNG content`);
    const atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
    const count = Array.isArray(atlas.frames) ? atlas.frames.length : Object.keys(atlas.frames || {}).length;
    assert.equal(count, asset.frame_count, `${bot} ${asset.role} authoritative atlas count`);
    assert.equal(asset.autosprite.character_id, manifest.character_id, `${bot} ${asset.role} provenance`);
    assert.equal(asset.review_status, "approved_visual_review", `${bot} ${asset.role} review`);
  }
}

const tubbyManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-tubby-front-assets.json"), "utf8"));
assert.equal(tubbyManifest.character_name, "TUBBY");
assert.equal(tubbyManifest.character_id, "cmuhj9bx90014mctfalaa2dcj");
assert.ok(tubbyManifest.assets.every((asset) => asset.frame_count === 25));

const html = fs.readFileSync(path.join(root, "moonpet-game.html"), "utf8");
assert.match(html, /moonpet-bot-art-loader\.js\?v=20260926-multi-bot-art-v1/);
assert.match(html, /moonpet-bot-art-renderer\.js\?v=20260926-multi-bot-art-v1/);
assert.doesNotMatch(html, /moonpet-botty-front-(?:asset-loader|sprite-renderer)\.js/);
assert.doesNotMatch(html, /moonpet-art-v2\.js/);

const client = fs.readFileSync(path.join(root, "js", "moonpet-mini-app.js"), "utf8");
assert.match(client, /speciesId: String\(lifecycle\.species_id \|\| pet\.species/);
assert.match(client, /selectMoonpetBot\(botArtIdentity\(snapshot\)\)/);
assert.match(client, /drawSelectedBotSprite\(renderTime, animationMode, active/);
assert.match(client, /if \(botArtModeEnabled\) \{\s*return;\s*\}/, "safe loading state must block old art fallbacks");
assert.match(client, /var y = 194;/, "bots retain the lower stage baseline");
assert.match(client, /var active = sleepLatched \|\| animationUntil > renderTime/);
assert.match(client, /animationUntil = sleepLatched && animationMode === 'sleep' \? Number\.POSITIVE_INFINITY/);

console.log("Moonpet multi-bot art registry and production packs passed");
