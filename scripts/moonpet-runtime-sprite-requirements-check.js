#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const requirementsPath = path.join(repoRoot, "data", "moonpet-runtime-sprite-requirements.json");

const requiredFiles = [
  "moonpet-game.html",
  "js/moonpet-mini-app.js",
  "css/moonpet-mini-app.css",
  "data/moonpet-side-scroller-animation-queue.json"
];

const requiredModes = [
  "idle",
  "feed",
  "play",
  "clean",
  "sleep",
  "train",
  "travel",
  "work",
  "equip",
  "evolve",
  "trade",
  "celebrate",
  "interact",
  "blocked",
  "battle"
];

function pass(message) {
  return { status: "pass", message };
}

function fail(message) {
  return { status: "fail", message };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pathExists(repoRelativePath) {
  return fs.existsSync(path.join(repoRoot, repoRelativePath));
}

function validateRequirements(requirements) {
  const results = [];
  const mappings = Array.isArray(requirements.current_action_mapping) ? requirements.current_action_mapping : [];
  const generated = requirements.generated_side_scroller_artifacts || {};
  const assets = Array.isArray(generated.assets) ? generated.assets : [];

  results.push(requirements.source_of_truth &&
    requirements.source_of_truth.character_art_subject === "Moonbot"
    ? pass("Runtime requirements use Moonbot as the art subject")
    : fail("Runtime requirements must use Moonbot as the art subject"));
  results.push(requirements.source_of_truth &&
    requirements.source_of_truth.not_platformer === true &&
    requirements.source_of_truth.no_direct_keyboard_movement === true
    ? pass("Runtime requirements preserve autonomous non-platformer model")
    : fail("Runtime requirements must preserve the autonomous non-platformer model"));
  results.push(requirements.live_runtime_state &&
    requirements.live_runtime_state.up_down_directional_sprites_required === false
    ? pass("Up/down sprite directions are not required by current runtime")
    : fail("Current runtime should not require up/down side-scroller sprites"));
  results.push(requirements.live_runtime_state &&
    requirements.live_runtime_state.jump_required_by_current_runtime === false
    ? pass("Jump is not required by current runtime")
    : fail("Jump should not be marked required by the current runtime"));

  for (const file of requiredFiles) {
    results.push(pathExists(file)
      ? pass(`Required audited file exists: ${file}`)
      : fail(`Required audited file missing: ${file}`));
  }

  for (const mode of requiredModes) {
    const entry = mappings.find((mapping) => mapping.animation_mode === mode);
    if (!entry) {
      results.push(fail(`Missing runtime animation mode mapping: ${mode}`));
      continue;
    }
    results.push(entry.requires_sprite === true
      ? pass(`${mode} is explicitly marked as sprite-relevant`)
      : fail(`${mode} must explicitly state whether it needs a sprite`));
    results.push(typeof entry.coverage === "string" && entry.coverage.length > 0
      ? pass(`${mode} has a coverage decision`)
      : fail(`${mode} must include a coverage decision`));
    results.push(
      entry.coverage !== "generated_candidate_visual_pass" || entry.required_side_asset
        ? pass(`${mode} has a side asset mapping or non-asset strategy`)
        : fail(`${mode} candidate visual pass is missing required_side_asset`)
    );
  }

  const rejected = assets.filter((asset) => asset.visual_status === "visual_rejected");
  for (const expectedRejected of ["side_celebrate", "side_interact", "side_battle"]) {
    results.push(rejected.some((asset) => asset.id === expectedRejected)
      ? pass(`${expectedRejected} remains visually rejected pending regeneration`)
      : fail(`${expectedRejected} must be visually rejected until regenerated`));
  }

  results.push(generated.installed_in_live_game === true &&
    generated.install_mode === "feature_flagged" &&
    generated.feature_flag === "?sideSprites=1"
    ? pass("Side-scroller artifacts are installed only behind the ?sideSprites=1 feature flag")
    : fail("Side-scroller artifacts must be marked installed behind the ?sideSprites=1 feature flag"));

  return results;
}

function main() {
  let requirements;
  try {
    requirements = readJson(requirementsPath);
  } catch (error) {
    console.error("Moonpet runtime sprite requirements: FAIL");
    console.error(`Could not read requirements: ${error.message}`);
    process.exit(1);
  }

  const results = validateRequirements(requirements);
  const failed = results.filter((result) => result.status === "fail");
  console.log(`Moonpet runtime sprite requirements: ${failed.length ? "FAIL" : "PASS"}`);
  for (const result of results) console.log(`[${result.status.toUpperCase()}] ${result.message}`);
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { validateRequirements };
