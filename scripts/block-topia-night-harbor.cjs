#!/usr/bin/env node
"use strict";

const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const roofView = process.argv.includes("--roof-view");
const aligned = process.argv.includes("--aligned");
const style = roofView
  ? "16-bit RPG overworld sprite. Camera 45 degrees above ground, facing the south wall, zero yaw. Show roof TOP occupying about 40% of silhouette; front facade below. Horizontal eaves, no visible left or right wall. Violet shadows, amber lights."
  : aligned
  ? "16-bit pixel art. Straight-on orthographic front from slightly above, horizontal roof edges, front only, no side wall or diagonals. Same scale: single door 16 px high, window 10 px high. Violet shadows, amber light."
  : "16-bit game sprite, elevated top-down view, roof and front visible, crisp pixel clusters, deep violet shadows and warm amber rim light.";
const objects = [
  ["lighthouse", "Tall weathered brick lighthouse with copper cap, turquoise beacon and warm amber service door."],
  ["warehouse", "Dark dock warehouse with ribbed metal roof, brick front, rolling door and original hot-pink wildstyle graffiti."],
  ["record-shop", "Late-night record shop with charcoal brick, teal awning, magenta vinyl sign and amber display window."],
  ["workshop", "Dock mechanic workshop with rusted roof vents, roll-up steel shutter and warm light under a metal canopy."],
  ["apartments", "Compact dockside apartment block with dark red brick, roof vents, teal trim and stacked amber windows."],
  ["graffiti-wall", "Standalone weathered brick wall with original cyan and pink wildstyle graffiti, chipped mortar and a lit concrete cap."]
].filter(([id]) => roofView ? id !== "lighthouse" && id !== "workshop" : !aligned || id !== "lighthouse").map(([id, subject]) => ({
  id,
  name: "Block Topia Night Harbor " + (roofView ? "v3 - " : aligned ? "v2 - " : "v1 - ") + id,
  prompt: (roofView ? ({
    warehouse: "Low tagged warehouse, deep ribbed roof.",
    "record-shop": "Vinyl shop, flat roof behind teal awning.",
    apartments: "Two floors, amber windows, deep flat roof.",
    "graffiti-wall": "Low brick wall, wide visible top cap, neon tags."
  })[id] : aligned ? ({warehouse:"One-story brick warehouse with graffiti on a rolling shutter.", workshop:"One-story workshop, rusted roof and lit work bay.", "record-shop":"One-story vinyl shop, teal awning and magenta sign.", apartments:"Compact two-story brick apartments, stacked amber windows.", "graffiti-wall":"Straight horizontal brick wall, cyan and pink wildstyle."})[id] : subject) + " " + style,
  pixelArt: true
}));

const api = "https://www.autosprite.io/api/v1";

async function request(path, key, payload) {
  const response = await fetch(api + path, {
    method: payload ? "POST" : "GET",
    headers: { "x-api-key": key, ...(payload && { "content-type": "application/json" }) },
    body: payload ? JSON.stringify(payload) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error("AutoSprite returned HTTP " + response.status);
  return response.json();
}

async function existingAssets(key) {
  const names = new Set(objects.map(asset => asset.name));
  const existing = new Map();
  const cursors = new Set();
  let cursor;
  do {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const page = await request("/assets?" + query, key);
    for (const asset of page.assets) {
      if (names.has(asset.name) && !existing.has(asset.name)) existing.set(asset.name, asset);
    }
    if (!page.hasMore || existing.size === names.size) break;
    cursor = page.nextCursor;
    if (!cursor || cursors.has(cursor)) throw new Error("AutoSprite returned an invalid pagination cursor.");
    cursors.add(cursor);
  } while (cursor);
  return existing;
}

async function main() {
  if (objects.some(asset => asset.prompt.length > 300)) throw new Error("Asset prompt exceeds the API limit.");
  if (!process.argv.includes("--generate")) {
    console.log("Planned AutoSprite assets. Run with --generate to download sources and generate missing assets.");
    for (const { name, prompt } of objects) console.log(name + "\n  " + prompt);
    return;
  }

  const key = process.env.AUTOSPRITE_API_KEY;
  if (!key) throw new Error("AUTOSPRITE_API_KEY is required on the runner.");
  const folder = process.env.BLOCK_TOPIA_ART_OUTPUT || "block-topia-night-harbor-source";
  await mkdir(folder, { recursive: true });
  const existing = await existingAssets(key);
  for (const { id, ...payload } of objects) {
    const asset = existing.get(payload.name) ?? await request("/assets", key, payload);
    const url = new URL(asset.baseImageUrl);
    if (url.protocol !== "https:") throw new Error("Expected an HTTPS asset download.");
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const type = response.headers.get("content-type")?.split(";")[0];
    const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[type];
    if (!response.ok || !extension) throw new Error("AutoSprite download did not return an image for " + id);
    const file = id + "." + extension;
    await writeFile(join(folder, file), Buffer.from(await response.arrayBuffer()));
    await writeFile(join(folder, id + ".json"), JSON.stringify({
      assetId: asset.id, file, ...payload
    }, null, 2) + "\n");
    console.log("Saved " + file);
  }
}

main().catch(error => {
  console.error(/^[\w .-]+$/.test(error.message) ? error.message : "AutoSprite generation stopped. Check runner connectivity and retry.");
  process.exitCode = 1;
});
