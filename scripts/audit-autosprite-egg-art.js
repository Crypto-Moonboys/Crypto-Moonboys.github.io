#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const API_BASE_URL = "https://www.autosprite.io/api/v1";
const OUTPUT_PATH = path.join(REPO_ROOT, "data", "moonpet-egg-art-audit.json");
const REQUIRED_ROLES = ["egg_idle", "egg_wobble", "egg_sleep", "egg_react", "egg_care", "egg_crack", "egg_hatch"];

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function request(urlPath, apiKey) {
  const response = await fetch(`${API_BASE_URL}${urlPath}`, { headers: { "x-api-key": apiKey, "Content-Type": "application/json" } });
  const text = await response.text();
  let value;
  try { value = text ? JSON.parse(text) : null; } catch { value = { rawText: text }; }
  if (!response.ok) throw new Error(`AutoSprite GET ${urlPath} failed HTTP ${response.status}`);
  return value;
}

function listFrom(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    const candidate = value && value[key] || value && value.data && value.data[key] || value && value.result && value.result[key];
    if (Array.isArray(candidate)) return candidate;
  }
  if (Array.isArray(value && value.data)) return value.data;
  return [];
}

function characterId(character) {
  return String(character && (character.id || character.characterId || character.character_id) || "");
}

function sheetId(sheet) {
  return String(sheet && (sheet.id || sheet.spriteSheetId || sheet.spritesheetId || sheet.spritesheet_id) || "");
}

function collectStrings(value, output = []) {
  if (value == null) return output;
  if (["string", "number", "boolean"].includes(typeof value)) output.push(String(value));
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, output));
  else if (typeof value === "object") Object.entries(value).forEach(([key, entry]) => { output.push(key); collectStrings(entry, output); });
  return output;
}

function complete(sheet) {
  const status = String(sheet && (sheet.status || sheet.state || sheet.phase) || "").toLowerCase();
  return !status || ["succeeded", "success", "completed", "complete", "ready", "done"].includes(status);
}

async function listCharacters(apiKey) {
  const records = new Map();
  for (const urlPath of ["/characters?limit=100", "/characters?limit=100&offset=100", "/characters?limit=100&page=2"]) {
    for (const character of listFrom(await request(urlPath, apiKey), ["characters"])) {
      const id = characterId(character) || `${character.name}-${records.size}`;
      if (!records.has(id)) records.set(id, character);
    }
  }
  return Array.from(records.values());
}

async function listSheets(apiKey, id) {
  const records = new Map();
  const errors = [];
  for (const urlPath of [
    `/characters/${encodeURIComponent(id)}/spritesheets?limit=100`,
    `/spritesheets?characterId=${encodeURIComponent(id)}&limit=100`,
    `/spritesheets?character_id=${encodeURIComponent(id)}&limit=100`
  ]) {
    try {
      for (const sheet of listFrom(await request(urlPath, apiKey), ["spritesheets", "spriteSheets", "items", "results"])) {
        const idValue = sheetId(sheet) || String(records.size + 1);
        if (!records.has(idValue)) records.set(idValue, sheet);
      }
    } catch (error) {
      errors.push({ endpoint: urlPath, message: error.message });
    }
  }
  return { sheets: Array.from(records.values()), errors };
}

async function auditEggArt() {
  const apiKey = process.env.AUTOSPRITE_API_KEY;
  if (!apiKey) throw new Error("AUTOSPRITE_API_KEY is required for the Moon Egg art audit.");
  const characters = await listCharacters(apiKey);
  const candidates = characters.filter((character) => /egg/i.test(String(character && character.name || "")));
  const exact = candidates.filter((character) => String(character.name || "").trim().toUpperCase() === "MOON EGG");
  const exactDetails = [];
  for (const character of exact) {
    const id = characterId(character);
    const listing = id ? await listSheets(apiKey, id) : { sheets: [], errors: [{ message: "character id unavailable" }] };
    const foundRoles = REQUIRED_ROLES.filter((role) => listing.sheets.some((sheet) => complete(sheet) && collectStrings(sheet).some((value) => value.toLowerCase().includes(role))));
    exactDetails.push({
      character_name: character.name,
      character_id: id || null,
      complete_spritesheet_count: listing.sheets.filter(complete).length,
      found_roles: foundRoles,
      missing_roles: REQUIRED_ROLES.filter((role) => !foundRoles.includes(role)),
      endpoint_errors: listing.errors
    });
  }
  const approvedPack = exactDetails.length === 1 && exactDetails[0].missing_roles.length === 0;
  const result = {
    schema_version: 1,
    audited_at: new Date().toISOString(),
    source: "AutoSprite API",
    exact_character_name: "MOON EGG",
    required_roles: REQUIRED_ROLES,
    status: approvedPack ? "complete" : exactDetails.length ? "incomplete" : "not_found",
    genuine_authored_pack_available: approvedPack,
    exact_matches: exactDetails,
    egg_named_candidates: candidates.map((character) => ({ name: character.name || null, character_id: characterId(character) || null })),
    live_fallback: approvedPack ? null : "TEMPORARY LEGACY EGG FALLBACK"
  };
  await writeJson(OUTPUT_PATH, result);
  console.log(`Moon Egg AutoSprite audit: ${result.status}`);
  return result;
}

if (require.main === module) {
  auditEggArt().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { REQUIRED_ROLES, auditEggArt, listFrom, collectStrings };
