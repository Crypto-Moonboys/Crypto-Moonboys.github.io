#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const queuePath = path.join(repoRoot, "data", "moonpet-side-scroller-animation-queue.json");
const expectedIds = [
  "side_idle",
  "side_walk",
  "side_run",
  "side_jump",
  "side_eat",
  "side_sleep",
  "side_play",
  "side_clean",
  "side_train",
  "side_hurt",
  "side_work",
  "side_equip",
  "side_evolve",
  "side_trade",
  "side_celebrate",
  "side_interact",
  "side_battle",
  "side_turn",
  "side_front_wave",
  "side_front_victory",
  "side_front_point",
  "side_front_dance",
  "side_eat_chaos",
  "side_play_ball"
];
const publicBasePath = "/img/moonpets/moonbot-pet-visor-v1-side/";
const forbiddenAnimationPattern = /(^iso_|_down$|_down_|down_facing|isometric)/i;
const allowedStatuses = new Set([
  "planned",
  "pending",
  "generated_pending_review",
  "generated_pending_visual_review",
  "rejected_pending_regeneration",
  "mechanically_passed",
  "promoted",
  "skipped"
]);

function pass(message) {
  return { status: "pass", message };
}

function fail(message) {
  return { status: "fail", message };
}

function readQueue() {
  return JSON.parse(fs.readFileSync(queuePath, "utf8"));
}

function isPublicTarget(value, id, extension) {
  return typeof value === "string" &&
    value === `${publicBasePath}${id}.${extension}` &&
    !value.includes("..");
}

function hasForbiddenDirection(value) {
  return forbiddenAnimationPattern.test(String(value || ""));
}

function validateQueue(queue) {
  const results = [];
  const items = Array.isArray(queue.items) ? queue.items : [];
  const ids = new Set();
  const roles = new Set();

  results.push(queue.runtime_view === "2d_side_scroller"
    ? pass("Queue runtime view is 2d_side_scroller")
    : fail("Queue runtime_view must be 2d_side_scroller"));
  results.push(queue.source_character_name === "MOONBOT PET VISOR V1"
    ? pass("Queue uses MOONBOT PET VISOR V1")
    : fail("Queue must use source_character_name MOONBOT PET VISOR V1"));
  results.push(items.length === expectedIds.length
    ? pass(`Queue contains ${items.length} side-scroller animations`)
    : fail(`Expected ${expectedIds.length} side-scroller animations, found ${items.length}`));

  for (const expectedId of expectedIds) {
    results.push(items.some((item) => item.id === expectedId)
      ? pass(`Queue includes ${expectedId}`)
      : fail(`Queue missing ${expectedId}`));
  }

  for (const item of items) {
    const label = item.id || "unknown";
    if (ids.has(item.id)) results.push(fail(`${label} duplicates id ${item.id}`));
    else if (item.id) {
      ids.add(item.id);
      results.push(pass(`${label} id is unique`));
    } else {
      results.push(fail("Queue item is missing id"));
    }

    if (roles.has(item.role)) results.push(fail(`${label} duplicates role ${item.role}`));
    else if (item.role) {
      roles.add(item.role);
      results.push(pass(`${label} role is unique`));
    } else {
      results.push(fail(`${label} is missing role`));
    }

    results.push(expectedIds.includes(item.id)
      ? pass(`${label} is an expected side-scroller id`)
      : fail(`${label} is not an expected side-scroller id`));
    results.push(String(item.id || "").startsWith("side_") && String(item.role || "").startsWith("side_")
      ? pass(`${label} uses side_ naming`)
      : fail(`${label} must use side_ id and role naming`));
    results.push(item.source_character_name === "MOONBOT PET VISOR V1"
      ? pass(`${label} uses approved source character`)
      : fail(`${label} has wrong source_character_name`));
    results.push(allowedStatuses.has(item.status)
      ? pass(`${label} status is valid (${item.status})`)
      : fail(`${label} status must be one of ${Array.from(allowedStatuses).join(", ")}`));
    results.push(item.approved === false
      ? pass(`${label} is not approved automatically`)
      : fail(`${label} must not be approved automatically`));
    results.push(item.promoted === false || item.status === "promoted"
      ? pass(`${label} promotion state is consistent`)
      : fail(`${label} may only have promoted=true when status=promoted`));
    results.push(typeof item.prompt === "string" && item.prompt.trim().length > 30
      ? pass(`${label} has prompt`)
      : fail(`${label} must have a prompt`));
    results.push(!hasForbiddenDirection(item.animation_kind) && !hasForbiddenDirection(item.id) && !hasForbiddenDirection(item.role)
      ? pass(`${label} does not use isometric/down-facing animation naming`)
      : fail(`${label} must not use isometric/down-facing animation naming`));
    results.push(item.animation_kind !== "attack"
      ? pass(`${label} does not use attack`)
      : fail(`${label} must not use attack`));
    results.push(item.output_expectations && item.output_expectations.frame_count === 25
      ? pass(`${label} frame_count is 25`)
      : fail(`${label} frame_count must be 25`));
    results.push(item.output_expectations && item.output_expectations.frame_size === 256
      ? pass(`${label} frame_size is 256`)
      : fail(`${label} frame_size must be 256`));
    results.push(item.output_expectations &&
      item.output_expectations.sheet_size &&
      item.output_expectations.sheet_size.w === 1280 &&
      item.output_expectations.sheet_size.h === 1280
      ? pass(`${label} sheet_size is 1280x1280`)
      : fail(`${label} sheet_size must be 1280x1280`));
    results.push(item.promotion_target &&
      isPublicTarget(item.promotion_target.sheet_path, item.id, "png") &&
      isPublicTarget(item.promotion_target.atlas_path, item.id, "json")
      ? pass(`${label} has stable public target paths`)
      : fail(`${label} must target ${publicBasePath}${label}.png/json`));
  }

  return results;
}

function main() {
  let queue;
  try {
    queue = readQueue();
  } catch (error) {
    console.error("Moonpet side-scroller queue: FAIL");
    console.error(`Could not read queue: ${error.message}`);
    process.exit(1);
  }

  const results = validateQueue(queue);
  const failed = results.filter((result) => result.status === "fail");
  console.log(`Moonpet side-scroller queue: ${failed.length ? "FAIL" : "PASS"}`);
  for (const result of results) {
    console.log(`[${result.status.toUpperCase()}] ${result.message}`);
  }
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { validateQueue };
