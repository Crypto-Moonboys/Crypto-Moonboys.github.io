import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
const eggyoneAudit = readJson("data/moonpet-eggyone-stage0-audit.json");
const expectedActions = [
  "front_idle", "front_feed", "front_play", "front_clean", "front_sleep",
  "front_train", "front_travel", "front_work", "front_equip", "front_evolve",
  "front_trade", "front_celebrate", "front_interact", "front_blocked", "front_battle"
];
const frontActionRoles = ["front_dance", "front_victory", "front_fight"];
const frontActionInstalled = Number(botRegistry.front_action_pack?.animation_count || 0) === 30;
const installedActions = frontActionInstalled ? [...expectedActions, ...frontActionRoles] : expectedActions;

assert.equal(botRegistry.schema_version, 2);
assert.equal(Object.keys(botRegistry.bots).length, 8);
assert.equal(Object.keys(backgroundRegistry.rare_morphs).length, 4);
const rareMorphIds = Object.keys(backgroundRegistry.rare_morphs);
assert.equal(Object.values(backgroundRegistry.bots).reduce(
  (total, bot) => total + rareMorphIds.filter((rareMorphId) => bot[rareMorphId]).length,
  0
), 32,
  "all 32 pending Rare Morph background entries must remain reserved");
assert.equal(requirements.summary.base_bots_complete, 8);
assert.equal(requirements.summary.evolution_master_designs_pending, 32);
assert.equal(requirements.summary.rare_morph_backgrounds_pending, 32);
assert.equal(requirements.summary.moon_egg_art_sets_pending, 0);
assert.equal(botRegistry.egg_art.status, "complete");
assert.equal(botRegistry.egg_art.fallback, null);
assert.deepEqual(eggRegistry.required_roles, ["egg_idle", "egg_wobble", "egg_sleep", "egg_react", "egg_care", "egg_breakout", "egg_hatch"]);
assert.equal(eggRegistry.current_fallback, null);
assert.equal(eggyoneAudit.character_name, "EGGYONE");
assert.equal(eggyoneAudit.status, "complete");
assert.equal(eggyoneAudit.required_frame_count, 25);
assert.deepEqual(eggyoneAudit.required_roles, ["egg_idle", "egg_wobble", "egg_sleep", "egg_react", "egg_care", "egg_breakout", "egg_hatch"]);
assert.equal(eggyoneAudit.failures.length, 0);
const auditJsonBefore = readText("data/moonpet-eggyone-stage0-audit.json");
const auditCheck = spawnSync(process.execPath, ["scripts/audit-eggyone-stage0-art.js", "--check"], { cwd: root, encoding: "utf8" });
assert.equal(auditCheck.status, 0, auditCheck.stderr || auditCheck.stdout || "EGGYONE check run must succeed");
assert.equal(readText("data/moonpet-eggyone-stage0-audit.json"), auditJsonBefore, "normal EGGYONE validation must not rewrite the tracked audit artifact");
const auditStatus = spawnSync("git", ["status", "--short", "--", "data/moonpet-eggyone-stage0-audit.json"], { cwd: root, encoding: "utf8" });
assert.equal(auditStatus.status, 0, auditStatus.stderr || "git status must succeed");
assert.equal(auditStatus.stdout.trim(), "", "normal EGGYONE validation must leave the tracked audit artifact clean in git status");
assert.equal(botRegistry.shared_stages.stage_1.character_name, "WTFBOI");
assert.equal(botRegistry.shared_stages.stage_1.shared_by_all_identities, true);
assert.equal(fs.existsSync(path.join(root, "js/moonpet-art-resolver.js")), true, "Rare Morph resolver must remain available");
assert.equal(fs.existsSync(path.join(root, "games/assets/BITTY BACKGROUND.jpg")), true, "BITTY background must remain available");
assert.ok(fs.readdirSync(path.join(root, "img/pets")).some((name) => /\.jpe?g$/i.test(name)),
  "Telegram pet photo JPG assets must remain available");

const loaderContext = { window: {}, fetch() { throw new Error("not used"); }, Image: class {} };
vm.runInNewContext(readText("js/moonpet-bot-art-loader.js"), loaderContext);
const { resolveBot, eggRoleForAnimationMode } = loaderContext.window.MoonpetBotArtLoader;

assert.equal(resolveBot(botRegistry, { speciesId: "vinyl_crab", evolutionStage: 0 }).resolvedBot, "EGGYONE");
assert.equal(resolveBot(botRegistry, { speciesId: "vinyl_crab", evolutionStage: 0 }).resolvedEvolution, "stage_0");
assert.equal(eggRoleForAnimationMode("idle", { incubation: { progress: 0, target: 12 } }), "egg_idle");
assert.equal(eggRoleForAnimationMode("idle", { incubation: { progress: 8, target: 12 } }), "egg_wobble");
assert.equal(eggRoleForAnimationMode("idle", { incubation: { progress: 11, target: 12 } }), "egg_breakout");
assert.equal(eggRoleForAnimationMode("feed"), "egg_care");
assert.equal(eggRoleForAnimationMode("sleep"), "egg_sleep");
assert.equal(eggRoleForAnimationMode("hatch"), "egg_hatch");
assert.equal(eggRoleForAnimationMode("dance"), "front_dance");
assert.equal(eggRoleForAnimationMode("victory"), "front_victory");
assert.equal(eggRoleForAnimationMode("fight"), "front_fight");

const eggManifest = readJson("data/moonpet-eggyone-stage0-assets.json");
assert.equal(eggManifest.character_name, "EGGYONE");
assert.equal(eggManifest.character_id, "cmui5g9430007v27qp8scqirq");
assert.equal(eggManifest.approval_status, "approved_visual_review");
assert.equal(eggManifest.assets.length, frontActionInstalled ? 10 : 7);
assert.ok(eggManifest.assets.every((asset) => asset.frame_count === 25));
assert.ok(eggManifest.assets.filter((asset) => !frontActionRoles.includes(asset.role)).every((asset) => asset.review_status === "approved_visual_review"));

const streetReady = botRegistry.shared_stages.stage_1.status === "complete";

for (const [botName, bot] of Object.entries(botRegistry.bots)) {
  const baseManifest = readJson(bot.manifest_path);
  assert.deepEqual(new Set(baseManifest.assets.map((asset) => asset.role)), new Set(installedActions), `${botName} must retain every installed action`);
  const speciesId = bot.canonical_species_ids[0];
  assert.equal(resolveBot(botRegistry, { speciesId, evolutionStage: 0 }).resolvedBot, "EGGYONE", `${botName} Stage 0 must share EGGYONE`);
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
  assert.equal(streetManifest.assets.length, installedActions.length);
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
  "moonpet-side-scroller-preview.html",
  "js/moonpet-botty-front-asset-loader.js",
  "js/moonpet-botty-front-sprite-renderer.js",
  "scripts/moonpet-botty-front-browser-smoke.mjs",
  "scripts/moonpet-botty-front-pack.test.mjs",
  "scripts/audit-autosprite-egg-art.js",
  "data/moonpet-egg-art-audit.json",
];
for (const retiredPath of retiredArtPaths) {
  assert.equal(fs.existsSync(path.join(root, retiredPath)), false, `retired Moonpet art path must stay removed: ${retiredPath}`);
}
const miniAppSource = readText("js/moonpet-mini-app.js");
assert.doesNotMatch(miniAppSource, /drawEmergencyMoonpetFallback|drawSpeciesSilhouette|drawEquipmentLayers|WEARABLE_LOADOUT_STORAGE_KEY/,
  "retired procedural and wearable renderers must stay removed");
assert.doesNotMatch(miniAppSource, /createPetPalette|PET_APPEARANCE_PALETTES|PET_SPECIES_PALETTES|DEFAULT_PET_PALETTE/,
  "retired procedural animal palettes must stay removed");
const artWorkflow = readText(".github/workflows/moonpet-art-factory.yml");
assert.match(artWorkflow, /audit-eggyone-stage0-art\.js/);
assert.match(artWorkflow, /audit-eggyone-stage0-art\.js --check/);
assert.match(artWorkflow, /audit-eggyone-stage0-art\.js --write/);
assert.doesNotMatch(artWorkflow, /audit-autosprite-egg-art\.js|TEMPORARY LEGACY EGG FALLBACK|MOON EGG|egg_crack/);

console.log("Moonpet evolution, rare-background, and item-art architecture passed");
