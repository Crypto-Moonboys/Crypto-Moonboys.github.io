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
assert.equal(registry.bots["TIN BOB"].status, "complete");
assert.deepEqual(registry.bots["TIN BOB"].canonical_species_ids, ["moon_ferret"]);
assert.equal(registry.bots["THE TING"].status, "complete");
assert.deepEqual(registry.bots["THE TING"].canonical_species_ids, ["sneaker_snail"]);
assert.equal(registry.bots["TATTOO JOHN"].status, "complete");
assert.deepEqual(registry.bots["TATTOO JOHN"].canonical_species_ids, ["alley_drake"]);
assert.equal(registry.bots["RED ALERT"].status, "complete");
assert.deepEqual(registry.bots["RED ALERT"].canonical_species_ids, ["lantern_fox"]);
assert.equal(registry.bots["JAKE THE SNAKE"].status, "complete");
assert.deepEqual(registry.bots["JAKE THE SNAKE"].canonical_species_ids, ["bubble_ram"]);
assert.ok(registry.bots["JAKE THE SNAKE"].display_names.includes("JACK THE SNAKE"));
assert.equal(registry.bots["JALE THE SNAKE"], undefined);
assert.equal(registry.bots["F1 EDDY"].status, "complete");
assert.deepEqual(registry.bots["F1 EDDY"].canonical_species_ids, ["neon_raccoon"]);
for (const [name, config] of Object.entries(registry.bots)) {
  if (name !== "BOTTY") assert.equal(config.fallback, "BOTTY", `${name} fallback`);
  assert.deepEqual(
    config.display,
    { scale: 1, fit_width: 168, fit_height: 168, pivot_y: 0.9 },
    `${name} must use the shared unsquashed canvas fit box`
  );
}

for (const [name, config] of Object.entries(registry.bots).filter(([, entry]) => entry.status === "complete")) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, config.manifest_path.replace(/^\//, "")), "utf8"));
  assert.equal(manifest.character_name, name, `${name} manifest identity`);
  assert.equal(manifest.character_id, config.autosprite_character_id, `${name} registry provenance`);
  assert.equal(manifest.assets.length, 15, `${name} asset count`);
  assert.deepEqual(manifest.assets.map((asset) => asset.role), expectedRoles, `${name} roles`);
  for (const asset of manifest.assets) {
    const png = path.join(root, asset.png_path.replace(/^\//, ""));
    const atlasPath = path.join(root, asset.atlas_path.replace(/^\//, ""));
    assert.ok(fs.statSync(png).size > 10000, `${name} ${asset.role} PNG content`);
    const atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
    const count = Array.isArray(atlas.frames) ? atlas.frames.length : Object.keys(atlas.frames || {}).length;
    assert.equal(count, asset.frame_count, `${name} ${asset.role} authoritative atlas count`);
    assert.equal(asset.autosprite.character_id, manifest.character_id, `${name} ${asset.role} provenance`);
    assert.equal(asset.review_status, "approved_visual_review", `${name} ${asset.role} review`);
  }
}

const tubbyManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-tubby-front-assets.json"), "utf8"));
assert.equal(tubbyManifest.character_name, "TUBBY");
assert.equal(tubbyManifest.character_id, "cmuhj9bx90014mctfalaa2dcj");
assert.ok(tubbyManifest.assets.every((asset) => asset.frame_count === 25));

const tinBobManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-tin-bob-front-assets.json"), "utf8"));
assert.equal(tinBobManifest.character_name, "TIN BOB");
assert.equal(tinBobManifest.character_id, "cmuhjady40001f0c9vekfkr24");
assert.ok(tinBobManifest.assets.every((asset) => asset.frame_count === 25));

const theTingManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-the-ting-front-assets.json"), "utf8"));
assert.equal(theTingManifest.character_name, "THE TING");
assert.equal(theTingManifest.character_id, "cmuhjb0c30005gkd0aboix1sr");
assert.ok(theTingManifest.assets.every((asset) => asset.frame_count === 25));

const tattooJohnManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-tattoo-john-front-assets.json"), "utf8"));
assert.equal(tattooJohnManifest.character_name, "TATTOO JOHN");
assert.equal(tattooJohnManifest.character_id, "cmuhjbjcv00112xtb1oclxk6k");
assert.ok(tattooJohnManifest.assets.every((asset) => asset.frame_count === 25));

const redAlertManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-red-alert-front-assets.json"), "utf8"));
assert.equal(redAlertManifest.character_name, "RED ALERT");
assert.equal(redAlertManifest.character_id, "cmuhjc0xs0002zoeg1jggctix");
assert.ok(redAlertManifest.assets.every((asset) => asset.frame_count === 25));

const jakeTheSnakeManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-jake-the-snake-front-assets.json"), "utf8"));
assert.equal(jakeTheSnakeManifest.character_name, "JAKE THE SNAKE");
assert.equal(jakeTheSnakeManifest.character_id, "cmuhjcplv000912alpjmnzyrh");
assert.ok(jakeTheSnakeManifest.assets.every((asset) => asset.frame_count === 25));

const f1EddyManifest = JSON.parse(fs.readFileSync(path.join(root, "data", "moonpet-f1-eddy-front-assets.json"), "utf8"));
assert.equal(f1EddyManifest.character_name, "F1 EDDY");
assert.equal(f1EddyManifest.character_id, "cmuhjd3wg0023zoeghrmnxoc7");
assert.ok(f1EddyManifest.assets.every((asset) => asset.frame_count === 25));

const html = fs.readFileSync(path.join(root, "moonpet-game.html"), "utf8");
assert.match(html, /moonpet-art-resolver\.js\?v=20260926-uniform-bot-fit-v3/);
assert.match(html, /moonpet-bot-art-loader\.js\?v=20260926-uniform-bot-fit-v3/);
assert.match(html, /moonpet-bot-art-renderer\.js\?v=20260926-uniform-bot-fit-v3/);
assert.doesNotMatch(html, /moonpet-botty-front-(?:asset-loader|sprite-renderer)\.js/);
assert.doesNotMatch(html, /moonpet-art-v2\.js/);

const client = fs.readFileSync(path.join(root, "js", "moonpet-mini-app.js"), "utf8");
assert.match(client, /speciesId: String\(lifecycle\.species_id \|\| pet\.species/);
assert.match(client, /selectMoonpetBot\(botArtIdentity\(snapshot\)\)/);
assert.match(client, /drawSelectedBotSprite\(renderTime, animationMode, active/);
assert.doesNotMatch(client, /drawSideScrollerMoonpetSprite|drawApprovedMoonpetSprite/, "old character render paths must not remain live");
assert.match(client, /var x = 112;/, "bots stay inside the left canvas zone");
assert.match(client, /var y = 194;/, "bots retain the lower stage baseline");
const rendererSource = fs.readFileSync(path.join(root, "js", "moonpet-bot-art-renderer.js"), "utf8");
assert.match(rendererSource, /const containScale = Math\.min\(fitWidth \/ frame\.w, fitHeight \/ frame\.h\)/, "renderer must use one contain scale for both axes");
assert.match(rendererSource, /const width = frame\.w \* drawScale;[\s\S]*const height = frame\.h \* drawScale;/, "renderer must preserve source aspect ratio instead of squashing bots");
assert.match(client, /var active = sleepLatched \|\| animationUntil > renderTime/);
assert.match(client, /animationUntil = sleepLatched && animationMode === 'sleep' \? Number\.POSITIVE_INFINITY/);

console.log("Moonpet multi-bot art registry and production packs passed");
