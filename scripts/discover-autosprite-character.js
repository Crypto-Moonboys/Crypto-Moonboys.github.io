#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const API_BASE_URL = "https://www.autosprite.io/api/v1";
const DEFAULT_NAME = "BOTTY";
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "output", "manifests", "botty-autosprite-character.json");
const DEFAULT_REGISTRY = path.join(REPO_ROOT, "data", "moonpet-autosprite-characters.json");
const RAW_DIR = path.join(REPO_ROOT, "output", "manifests", "autosprite", "character-discovery");

function parseArgs(argv) {
  const options = {
    name: DEFAULT_NAME,
    output: DEFAULT_OUTPUT,
    registry: DEFAULT_REGISTRY,
    persist: false,
    limit: 100
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--name") options.name = argv[++index];
    else if (arg.startsWith("--name=")) options.name = arg.slice("--name=".length);
    else if (arg === "--output") options.output = path.resolve(argv[++index]);
    else if (arg.startsWith("--output=")) options.output = path.resolve(arg.slice("--output=".length));
    else if (arg === "--registry") options.registry = path.resolve(argv[++index]);
    else if (arg.startsWith("--registry=")) options.registry = path.resolve(arg.slice("--registry=".length));
    else if (arg === "--persist") options.persist = true;
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.name = String(options.name || "").trim();
  if (!options.name) throw new Error("--name is required.");
  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = 100;
  return options;
}

function printHelp() {
  console.log(`Discover an existing AutoSprite character by exact name.

Usage:
  node scripts/discover-autosprite-character.js --name BOTTY --persist

Options:
  --name <name>        Exact AutoSprite character name. Default BOTTY.
  --output <path>      Discovery manifest path.
  --registry <path>    Non-secret repository registry path.
  --persist            Update the non-secret registry with the discovered id.
  --limit <n>          Character listing page size. Default 100.
`);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "character";
}

function extractCharactersList(responseJson) {
  const characters =
    Array.isArray(responseJson) ? responseJson :
    responseJson && Array.isArray(responseJson.characters) ? responseJson.characters :
    responseJson && responseJson.data && Array.isArray(responseJson.data.characters) ? responseJson.data.characters :
    responseJson && responseJson.result && Array.isArray(responseJson.result.characters) ? responseJson.result.characters :
    responseJson && Array.isArray(responseJson.data) ? responseJson.data :
    [];

  return characters.filter(Boolean);
}

async function requestAutoSprite({ urlPath, apiKey, rawName }) {
  const response = await fetch(`${API_BASE_URL}${urlPath}`, {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    }
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { rawText: text };
  }
  if (rawName) await writeJson(path.join(RAW_DIR, rawName), parsed || { rawText: text });
  if (!response.ok) {
    const message = parsed && (parsed.message || parsed.code || parsed.error && parsed.error.message) || text || response.statusText;
    throw new Error(`AutoSprite GET ${urlPath} failed HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

async function listCharacters(apiKey, limit) {
  const seen = new Map();
  const pages = [
    `/characters?limit=${encodeURIComponent(limit)}`,
    `/characters?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(limit)}`,
    `/characters?limit=${encodeURIComponent(limit)}&page=2`
  ];

  for (let index = 0; index < pages.length; index += 1) {
    const response = await requestAutoSprite({
      urlPath: pages[index],
      apiKey,
      rawName: `characters-page-${index + 1}.json`
    });
    for (const character of extractCharactersList(response)) {
      const key = String(character.id || character.characterId || `${character.name}-${seen.size}`);
      if (!seen.has(key)) seen.set(key, character);
    }
  }

  return Array.from(seen.values());
}

function characterId(character) {
  return character && (character.id || character.characterId || character.character_id);
}

async function persistRegistry(registryPath, manifest) {
  const registry = await readJsonIfExists(registryPath, {});
  registry[manifest.character_name] = {
    character_id: manifest.character_id,
    source: "autosprite",
    active: true,
    discovered_at: manifest.discovery_timestamp
  };
  await writeJson(registryPath, registry);
}

async function discoverAutoSpriteCharacter(options) {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required for AutoSprite character discovery.");

  const characters = await listCharacters(apiKey, options.limit);
  const matches = characters.filter((character) => character && character.name === options.name);
  if (matches.length === 0) {
    throw new Error(`AutoSprite character discovery found zero exact matches for "${options.name}".`);
  }
  if (matches.length > 1) {
    throw new Error(`AutoSprite character discovery found multiple exact matches for "${options.name}": ${matches.map(characterId).filter(Boolean).join(", ") || "ids unavailable"}.`);
  }

  const match = matches[0];
  const id = characterId(match);
  if (!id) throw new Error(`AutoSprite character "${options.name}" did not include a usable character id.`);

  const manifest = {
    character_name: options.name,
    character_id: String(id),
    discovery_timestamp: new Date().toISOString(),
    source: "AutoSprite API",
    source_api: "AutoSprite API",
    raw_character_path: `output/manifests/autosprite/character-discovery/${slug(options.name)}-match.json`
  };

  await writeJson(path.join(RAW_DIR, `${slug(options.name)}-match.json`), match);
  await writeJson(options.output, manifest);
  if (options.persist) await persistRegistry(options.registry, manifest);

  console.log(`Discovered AutoSprite character ${options.name}: ${manifest.character_id}`);
  console.log(`Manifest written to ${path.relative(REPO_ROOT, options.output).replace(/\\/g, "/")}`);
  if (options.persist) console.log(`Registry updated at ${path.relative(REPO_ROOT, options.registry).replace(/\\/g, "/")}`);
  return manifest;
}

async function main() {
  await discoverAutoSpriteCharacter(parseArgs(process.argv.slice(2)));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  extractCharactersList,
  discoverAutoSpriteCharacter
};
