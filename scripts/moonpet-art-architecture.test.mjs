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
const eggRegistry = readJson("data/moonpet-egg-art-registry.json");
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
assert.equal(botRegistry.egg_art.status, "authored_art_required");
assert.equal(botRegistry.egg_art.fallback, "TEMPORARY LEGACY EGG FALLBACK");
assert.deepEqual(eggRegistry.required_roles, ["egg_idle", "egg_wobble", "egg_sleep", "egg_react", "egg_care", "egg_crack", "egg_hatch"]);
assert.equal(eggRegistry.current_fallback.label, "TEMPORARY LEGACY EGG FALLBACK");
assert.equal(botRegistry.shared_stages.stage_1.character_name, "WTFBOI");
assert.equal(botRegistry.shared_stages.stage_1.shared_by_all_identities, true);

const loaderContext = { window: {}, fetch() { throw new Error("not used"); }, Image: class {} };
vm.runInNewContext(readText("js/moonpet-bot-art-loader.js"), loaderContext);
const { resolveBot, eggRoleForAnimationMode } = loaderContext.window.MoonpetBotArtLoader;

assert.equal(resolveBot(botRegistry, { speciesId: "vinyl_crab", evolutionStage: 0 }).resolvedBot, "MOON EGG");
assert.equal(resolveBot(botRegistry, { speciesId: "vinyl_crab", evolutionStage: 0 }).resolvedEvolution, "stage_0");
assert.equal(eggRoleForAnimationMode("idle", { incubation: { progress: 0, target: 12 } }), "egg_idle");
assert.equal(eggRoleForAnimationMode("idle", { incubation: { progress: 8, target: 12 } }), "egg_wobble");
assert.equal(eggRoleForAnimationMode("idle", { incubation: { progress: 11, target: 12 } }), "egg_crack");
assert.equal(eggRoleForAnimationMode("feed"), "egg_care");
assert.equal(eggRoleForAnimationMode("sleep"), "egg_sleep");
assert.equal(eggRoleForAnimationMode("hatch"), "egg_hatch");

const streetReady = botRegistry.shared_stages.stage_1.status === "complete";

for (const [botName, bot] of Object.entries(botRegistry.bots)) {
  const baseManifest = readJson(bot.manifest_path);
  assert.deepEqual(new Set(baseManifest.assets.map((asset) => asset.role)), new Set(expectedActions), `${botName} must retain all 15 actions`);
  const speciesId = bot.canonical_species_ids[0];
  for (let stage = 1; stage <= 5; stage += 1) {
    const resolution = resolveBot(botRegistry, { speciesId, evolutionStage: stage });
    assert.equal(resolution.resolvedBot, stage === 1 && streetReady ? "WTFBOI" : botName, `${botName} stage ${stage} resolution`);
    assert.equal(resolution.requestedEvolution, `stage_${stage}`);
    assert.equal(resolution.resolvedEvolution, "stage_1");
    assert.equal(resolution.evolutionFallbackUsed, stage > 1);
    assert.equal(resolution.config.manifest_path, stage === 1 && streetReady ? botRegistry.shared_stages.stage_1.manifest_path : bot.manifest_path);
  }
}

if (streetReady) {
  const streetManifest = readJson(botRegistry.shared_stages.stage_1.manifest_path);
  assert.equal(streetManifest.character_name, "WTFBOI");
  assert.equal(streetManifest.assets.length, 15);
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
