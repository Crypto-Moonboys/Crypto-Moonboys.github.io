#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  resolveCharacterId,
  listSpritesheets,
  spritesheetId,
  statusValue,
  isComplete,
  collectStrings,
  recordTimestamp,
  writeJson,
  relative,
  slug
} = require("./download-botty-front-animations");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CHARACTER_NAME = "EGGYONE";
const REGISTRY_PATH = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");

function parseArgs(argv) {
  const options = { characterName: DEFAULT_CHARACTER_NAME, characterId: "", registryPath: REGISTRY_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--character-name") options.characterName = argv[++index];
    else if (arg.startsWith("--character-name=")) options.characterName = arg.slice("--character-name=".length);
    else if (arg === "--character-id") options.characterId = argv[++index];
    else if (arg.startsWith("--character-id=")) options.characterId = arg.slice("--character-id=".length);
    else if (arg === "--registry") options.registryPath = path.resolve(argv[++index]);
    else if (arg.startsWith("--registry=")) options.registryPath = path.resolve(arg.slice("--registry=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  options.characterName = String(options.characterName || "").trim();
  options.characterId = String(options.characterId || "").trim();
  if (!options.characterName) throw new Error("--character-name is required.");
  return options;
}

function directNames(record) {
  const fields = [
    "name", "title", "label", "animation", "animationName", "animation_name",
    "animationId", "animation_id", "action", "actionName", "action_name",
    "move", "moveName", "move_name", "prompt"
  ];
  const names = [];
  const visit = (value, depth) => {
    if (!value || typeof value !== "object" || depth > 4) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (fields.includes(key) && (typeof child === "string" || typeof child === "number")) {
        names.push(String(child));
      } else if (child && typeof child === "object") {
        visit(child, depth + 1);
      }
    }
  };
  visit(record, 0);
  return Array.from(new Set(names));
}

function scrubUrls(value) {
  if (Array.isArray(value)) return value.map(scrubUrls);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return "[url omitted]";
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    /url|download/i.test(key) && typeof child === "string" ? "[url omitted]" : scrubUrls(child)
  ]));
}

async function inspectStage0Pack(options) {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required to inspect AutoSprite outputs.");
  const characterId = await resolveCharacterId(options);
  const characterSlug = slug(options.characterName);
  const paths = {
    outputDir: path.join(REPO_ROOT, "output", "moonpets", `${characterSlug}-stage0`),
    manifestPath: path.join(REPO_ROOT, "output", "manifests", `${characterSlug}-stage0-inventory.json`),
    rawDir: path.join(REPO_ROOT, "output", "manifests", "autosprite", `${characterSlug}-stage0-inventory`),
    contactSheetPath: path.join(REPO_ROOT, "output", "moonpets", `${characterSlug}-stage0`, "contact-sheet.png")
  };
  const records = await listSpritesheets(apiKey, characterId, paths);
  const completed = records.filter(isComplete);
  const inventory = {
    schema_version: 1,
    inspected_at: new Date().toISOString(),
    source: "AutoSprite API",
    character_name: options.characterName,
    character_id: characterId,
    listed_sheet_count: records.length,
    completed_sheet_count: completed.length,
    sheets: completed
      .sort((a, b) => recordTimestamp(a) - recordTimestamp(b))
      .map((record) => ({
        spritesheet_id: spritesheetId(record) || null,
        status: statusValue(record) || null,
        names: directNames(record),
        searchable_values: Array.from(new Set(collectStrings(record))).filter((value) => value.length <= 240),
        created_at: record.createdAt || record.created_at || null,
        updated_at: record.updatedAt || record.updated_at || null,
        record: scrubUrls(record)
      }))
  };
  const diagnosticPath = path.join(REPO_ROOT, "data", "autosprite-generation-diagnostics", `${characterSlug}-stage0-inventory.json`);
  await writeJson(diagnosticPath, inventory);
  console.log(`Inspected ${completed.length} completed ${options.characterName} sheets.`);
  console.log(`Inventory written to ${relative(diagnosticPath)}`);
  return inventory;
}

if (require.main === module) {
  inspectStage0Pack(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, directNames, scrubUrls, inspectStage0Pack };
