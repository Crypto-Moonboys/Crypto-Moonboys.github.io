#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const queuePath = path.join(repoRoot, "data", "moonpet-custom-animation-queue.json");
const expectedIds = [
  "custom_sleep",
  "custom_eat",
  "custom_play",
  "custom_clean",
  "custom_wave",
  "custom_sit",
  "custom_happy",
  "custom_sad"
];
const allowedApprovedIds = new Set(["custom_sleep"]);

function fail(message) {
  return { status: "fail", message };
}

function pass(message) {
  return { status: "pass", message };
}

function readQueue() {
  return JSON.parse(fs.readFileSync(queuePath, "utf8"));
}

function isPublicMoonbotTarget(value) {
  return typeof value === "string" &&
    value.startsWith("/img/moonpets/moonbot-pet-visor-v1/") &&
    !value.includes("..");
}

function publicPathExists(value, minBytes) {
  if (!isPublicMoonbotTarget(value)) return false;
  const filePath = path.join(repoRoot, value.replace(/^\/+/, ""));
  try {
    return fs.statSync(filePath).size > minBytes;
  } catch {
    return false;
  }
}

function validateQueue(queue) {
  const results = [];
  const items = Array.isArray(queue.items) ? queue.items : [];
  const roles = new Set();
  const ids = new Set(items.map((item) => item.id));

  results.push(items.length === expectedIds.length
    ? pass(`Queue contains ${items.length} custom animations`)
    : fail(`Expected ${expectedIds.length} queue items, found ${items.length}`));

  for (const id of expectedIds) {
    results.push(ids.has(id) ? pass(`Queue includes ${id}`) : fail(`Queue missing ${id}`));
  }

  for (const item of items) {
    const label = item.id || "unknown";
    if (item.animation_kind === "attack" || item.id === "attack" || item.role === "attack") {
      results.push(fail(`${label} uses rejected attack`));
    }
    if (roles.has(item.role)) {
      results.push(fail(`${label} duplicates role ${item.role}`));
    } else if (item.role) {
      roles.add(item.role);
      results.push(pass(`${label} role is unique`));
    } else {
      results.push(fail(`${label} is missing role`));
    }

    if (allowedApprovedIds.has(item.id)) {
      results.push(item.status === "approved"
        ? pass(`${label} status is approved`)
        : fail(`${label} status must be approved`));
      results.push(item.approved === true && item.promoted === true
        ? pass(`${label} is approved and promoted`)
        : fail(`${label} must have approved=true and promoted=true`));
      results.push(item.animation_kind === "iso_custom_sleep_down"
        ? pass(`${label} animation_kind is iso_custom_sleep_down`)
        : fail(`${label} animation_kind must be iso_custom_sleep_down`));
      results.push(item.sheet_path === "/img/moonpets/moonbot-pet-visor-v1/custom_sleep.png" &&
        item.atlas_path === "/img/moonpets/moonbot-pet-visor-v1/custom_sleep.json"
        ? pass(`${label} has approved public paths`)
        : fail(`${label} must define approved public sheet_path and atlas_path`));
      results.push(publicPathExists(item.sheet_path, 10 * 1024) &&
        publicPathExists(item.atlas_path, 100)
        ? pass(`${label} promoted files exist`)
        : fail(`${label} promoted PNG/atlas files must exist`));
    } else if (item.id === "custom_eat") {
      const allowedEatStatuses = new Set(["planned", "generated_pending_review", "promoted_pending_approval"]);
      results.push(allowedEatStatuses.has(item.status)
        ? pass(`${label} status is ${item.status}`)
        : fail(`${label} status must be planned, generated_pending_review, or promoted_pending_approval`));
      results.push(item.approved === false
        ? pass(`${label} is not accidentally approved`)
        : fail(`${label} must have approved=false`));
      results.push(item.status === "promoted_pending_approval"
        ? item.promoted === true
          ? pass(`${label} is promoted pending approval`)
          : fail(`${label} must have promoted=true when promoted_pending_approval`)
        : item.promoted === true
          ? fail(`${label} must not be promoted before promotion review`)
          : pass(`${label} is not promoted`));
      results.push(item.role === "custom_eat"
        ? pass(`${label} role is custom_eat`)
        : fail(`${label} role must be custom_eat`));
      results.push(item.animation_kind === "iso_custom_eat_down" || item.animation_kind === "custom_eat_down"
        ? pass(`${label} animation_kind is down-facing custom eat`)
        : fail(`${label} animation_kind must be iso_custom_eat_down or custom_eat_down`));
      results.push(item.promotion_target &&
        item.promotion_target.sheet_path === "/img/moonpets/moonbot-pet-visor-v1/custom_eat.png" &&
        item.promotion_target.atlas_path === "/img/moonpets/moonbot-pet-visor-v1/custom_eat.json"
        ? pass(`${label} has custom_eat promotion targets`)
        : fail(`${label} must target custom_eat.png/json`));
    } else {
      results.push(item.status === "planned"
        ? pass(`${label} status is planned`)
        : fail(`${label} status must be planned`));
      results.push(item.approved === false
        ? pass(`${label} is not accidentally approved`)
        : fail(`${label} must have approved=false`));
      results.push(item.promoted === true
        ? fail(`${label} must not be promoted before approval review`)
        : pass(`${label} is not promoted`));
    }
    results.push(typeof item.prompt === "string" && item.prompt.trim().length > 20
      ? pass(`${label} has prompt`)
      : fail(`${label} is missing prompt`));
    results.push(item.source_character_name === "MOONBOT PET VISOR V1"
      ? pass(`${label} uses approved source character`)
      : fail(`${label} has wrong source_character_name`));
    results.push(item.custom_required === true || typeof item.animation_kind === "string"
      ? pass(`${label} declares custom_required or animation_kind`)
      : fail(`${label} must declare custom_required or animation_kind`));
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
      isPublicMoonbotTarget(item.promotion_target.sheet_path) &&
      isPublicMoonbotTarget(item.promotion_target.atlas_path)
      ? pass(`${label} has promotion targets`)
      : fail(`${label} must define public promotion target paths`));
  }

  return results;
}

function main() {
  let queue;
  try {
    queue = readQueue();
  } catch (error) {
    console.error(`Moonpet custom animation queue: FAIL`);
    console.error(`Could not read queue: ${error.message}`);
    process.exit(1);
  }

  const results = validateQueue(queue);
  const failed = results.filter((result) => result.status === "fail");
  console.log(`Moonpet custom animation queue: ${failed.length ? "FAIL" : "PASS"}`);
  for (const result of results) {
    console.log(`[${result.status.toUpperCase()}] ${result.message}`);
  }
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { validateQueue };
