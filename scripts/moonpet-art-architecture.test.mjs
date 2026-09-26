import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const botRegistry = readJson("data/moonpet-bot-art-registry.json");
const backgroundRegistry = readJson("data/moonpet-rare-background-registry.json");
const itemRegistry = readJson("data/moonpet-item-art-registry.json");
const requirements = readJson("data/moonpet-art-requirements.json");
const expectedActions = [
  "front_idle", "front_feed", "front_play", "front_clean", "front_sleep",
  "front_train", "front_travel", "front_work", "front_equip", "front_evolve",
  "front_trade", "front_celebrate", "front_interact", "front_blocked", "front_battle"
];

assert.equal(botRegistry.schema_version, 2);
assert.equal(Object.keys(botRegistry.bots).length, 8);
assert.equal(requirements.summary.base_bots_complete, 8);
assert.equal(requirements.summary.evolution_master_designs_pending, 32);
assert.equal(requirements.summary.rare_morph_backgrounds_pending, 32);
assert.equal(requirements.summary.moon_egg_art_sets_pending, 1);
assert.equal(botRegistry.egg_art.status, "pending");
assert.equal(botRegistry.egg_art.fallback, "procedural_egg");

const loaderContext = { window: {}, fetch() { throw new Error("not used"); }, Image: class {} };
vm.runInNewContext(readText("js/moonpet-bot-art-loader.js"), loaderContext);
const { resolveBot } = loaderContext.window.MoonpetBotArtLoader;

for (const [botName, bot] of Object.entries(botRegistry.bots)) {
  const baseManifest = readJson(bot.manifest_path);
  assert.deepEqual(new Set(baseManifest.assets.map((asset) => asset.role)), new Set(expectedActions), `${botName} must retain all 15 actions`);
  const speciesId = bot.canonical_species_ids[0];
  for (let stage = 1; stage <= 5; stage += 1) {
    const resolution = resolveBot(botRegistry, { speciesId, evolutionStage: stage });
    assert.equal(resolution.resolvedBot, botName, `${botName} stage ${stage} must not cross-fallback to another bot`);
    assert.equal(resolution.requestedEvolution, `stage_${stage}`);
    assert.equal(resolution.resolvedEvolution, "stage_1");
    assert.equal(resolution.evolutionFallbackUsed, stage > 1);
    assert.equal(resolution.config.manifest_path, bot.manifest_path);
  }
}

const resolverContext = { window: {}, fetch() { throw new Error("not used"); } };
vm.runInNewContext(readText("js/moonpet-art-resolver.js"), resolverContext);
const { resolveMoonpetBackground } = resolverContext.window.MoonpetArtResolver;
for (const [botName, bot] of Object.entries(backgroundRegistry.bots)) {
  const speciesId = bot.canonical_species_ids[0];
  for (const rareMorphId of Object.keys(backgroundRegistry.rare_morphs)) {
    const resolution = resolveMoonpetBackground(backgroundRegistry, { speciesId }, rareMorphId);
    assert.equal(resolution.botName, botName);
    assert.equal(resolution.imagePath, bot.default, `${botName} ${rareMorphId} must use its own default while pending`);
    assert.equal(resolution.fallbackUsed, true);
  }
}

assert.equal(itemRegistry.policy.character_attachment, "never");
assert.ok(Object.values(itemRegistry.items).every((item) => item.art_status === "pending" && item.image_path === null));
assert.equal(botRegistry.bots["JAKE THE SNAKE"].canonical_species_ids[0], "bubble_ram");
assert.match(readText("workers/moonboys-api/pets/species-lifecycle.js"), /bubble_ram: \{ name: 'JAKE THE SNAKE'/);

const retiredArtPaths = [
  "js/moonpet-approved-asset-loader.js",
  "js/moonpet-approved-sprite-renderer.js",
  "js/moonpet-side-scroller-asset-loader.js",
  "js/moonpet-side-scroller-sprite-renderer.js",
  "data/moonpet-wearable-traits.json",
  "data/moonpet-frame-anchors.json",
  "data/moonpet-side-scroller-approved-assets.json",
  "data/moonpet-side-scroller-animation-queue.json",
  "moonpet-runtime-preview.html",
  "moonpet-animation-sandbox.html",
  "moonpet-side-scroller-preview.html"
];
for (const retiredPath of retiredArtPaths) {
  assert.equal(fs.existsSync(path.join(root, retiredPath)), false, `retired Moonpet art path must stay removed: ${retiredPath}`);
}
const miniAppSource = readText("js/moonpet-mini-app.js");
assert.doesNotMatch(miniAppSource, /drawEmergencyMoonpetFallback|drawSpeciesSilhouette|drawEquipmentLayers|WEARABLE_LOADOUT_STORAGE_KEY/,
  "retired procedural and wearable renderers must stay removed");

console.log("Moonpet evolution, rare-background, and item-art architecture passed");
