#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const TRAITS_PATH = path.join(REPO_ROOT, "data", "moonpet-traits.json");
const MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-assets.generated.json");
const API_ENDPOINT = "https://www.autosprite.io/api/v1/characters";

const OUTPUT_FOLDERS = [
  "output/moonpets/base",
  "output/moonpets/skins",
  "output/moonpets/faces",
  "output/moonpets/headwear",
  "output/moonpets/accessories",
  "output/moonpets/elements",
  "output/moonpets/frames",
  "output/manifests"
];

function parseArgs(argv) {
  const options = {
    dryRun: true,
    execute: false,
    resume: true,
    phase: "dry-run",
    limit: null,
    rateLimitMs: null,
    traitsPath: TRAITS_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") {
      options.execute = true;
      options.dryRun = false;
    } else if (arg === "--no-resume") options.resume = false;
    else if (arg === "--resume") options.resume = true;
    else if (arg === "--phase") options.phase = argv[++index] || options.phase;
    else if (arg.startsWith("--phase=")) options.phase = arg.slice("--phase=".length);
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--rate-limit-ms") options.rateLimitMs = Number(argv[++index]);
    else if (arg.startsWith("--rate-limit-ms=")) options.rateLimitMs = Number(arg.slice("--rate-limit-ms=".length));
    else if (arg === "--traits") options.traitsPath = path.resolve(argv[++index]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.execute && options.phase !== "test") {
    throw new Error("Real AutoSprite generation is locked to --phase=test for the initial 18 asset batch.");
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    options.limit = null;
  }

  if (!Number.isFinite(options.rateLimitMs) || options.rateLimitMs < 0) {
    options.rateLimitMs = null;
  }

  return options;
}

function printHelp() {
  console.log(`Moonpet Art Factory

Usage:
  node scripts/generate-moonpet-assets.js --dry-run
  node scripts/generate-moonpet-assets.js --phase=test --execute

Options:
  --dry-run              Build prompts and manifest without calling AutoSprite. Default.
  --execute              Call AutoSprite. Only allowed with --phase=test.
  --phase <name>         Phase to generate. Initial real phase is "test".
  --resume / --no-resume Skip existing PNG + response JSON pairs. Resume is on by default.
  --limit <n>            Cap the generated plan.
  --rate-limit-ms <n>    Delay between API calls.
  --traits <path>        Alternate moonpet trait JSON path.
`);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureFolders() {
  await Promise.all(
    OUTPUT_FOLDERS.map((folder) => fs.mkdir(path.join(REPO_ROOT, folder), { recursive: true }))
  );
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildPrompt(traits, skin, action) {
  const requiredStyle = traits.promptStyle.join(", ");
  return [
    `${requiredStyle}.`,
    traits.baseCharacter.description,
    skin.description,
    `Action: ${action.prompt}.`,
    "Keep the same body proportions, silhouette, scale, and framing as the Crypto Moonboys Pets Moonpet asset set.",
    "Cute collectible pet game asset direction: cyber bot, graffiti, streetwear, neon, glossy toy finish."
  ].join(" ");
}

function buildPlan(traits, options) {
  const skins = traits.skins.filter((skin) => options.phase === "dry-run" || skin.phase === options.phase);
  const actions = traits.actions;
  const jobs = [];

  for (const skin of skins) {
    for (const action of actions) {
      const id = `${slug(skin.id)}__${slug(action.id)}`;
      const fileBase = `${slug(skin.id)}-${slug(action.id)}`;
      const outputDir = path.join(REPO_ROOT, "output", "moonpets", skin.folder, slug(skin.id));
      const imagePath = path.join(outputDir, `${fileBase}.png`);
      const responsePath = path.join(outputDir, `${fileBase}.autosprite.json`);

      jobs.push({
        id,
        name: `${skin.name} ${action.name}`,
        phase: skin.phase,
        skin: skin.id,
        action: action.id,
        category: skin.folder,
        prompt: buildPrompt(traits, skin, action),
        outputDir,
        imagePath,
        responsePath,
        relativeImagePath: path.relative(REPO_ROOT, imagePath).replace(/\\/g, "/"),
        relativeResponsePath: path.relative(REPO_ROOT, responsePath).replace(/\\/g, "/")
      });
    }
  }

  const limitedJobs = options.limit ? jobs.slice(0, options.limit) : jobs;
  const batchLimit = traits.safety && Number.isFinite(traits.safety.batchLimit) ? traits.safety.batchLimit : 18;
  if (limitedJobs.length > batchLimit) {
    throw new Error(`Refusing to plan ${limitedJobs.length} assets. Initial batch limit is ${batchLimit}.`);
  }

  return limitedJobs;
}

async function sleep(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

function redactForManifest(job) {
  return {
    id: job.id,
    name: job.name,
    phase: job.phase,
    skin: job.skin,
    action: job.action,
    category: job.category,
    image: job.relativeImagePath,
    response: job.relativeResponsePath,
    prompt: job.prompt
  };
}

function extractImagePayload(responseJson) {
  const candidates = [
    responseJson.image,
    responseJson.image_url,
    responseJson.imageUrl,
    responseJson.url,
    responseJson.asset_url,
    responseJson.assetUrl,
    responseJson.png,
    responseJson.output && responseJson.output.image,
    responseJson.output && responseJson.output.image_url,
    responseJson.output && responseJson.output.url,
    Array.isArray(responseJson.images) && responseJson.images[0],
    Array.isArray(responseJson.assets) && responseJson.assets[0]
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = candidate.url || candidate.image_url || candidate.imageUrl || candidate.data || candidate.base64;
      if (typeof nested === "string") return nested;
    }
  }

  return null;
}

function base64ToBuffer(value) {
  const match = value.match(/^data:image\/(?:png|webp|jpeg);base64,(.+)$/i);
  if (match) return Buffer.from(match[1], "base64");
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 128) {
    return Buffer.from(value, "base64");
  }
  return null;
}

async function downloadImage(assetRef) {
  const directBuffer = base64ToBuffer(assetRef);
  if (directBuffer) return directBuffer;

  if (!/^https?:\/\//i.test(assetRef)) {
    throw new Error("AutoSprite response did not include a supported image URL or base64 PNG payload.");
  }

  const response = await fetch(assetRef);
  if (!response.ok) {
    throw new Error(`Image download failed with HTTP ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function callAutoSprite(job, apiKey, traits) {
  const response = await fetch(traits.api && traits.api.endpoint ? traits.api.endpoint : API_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: job.name,
      prompt: job.prompt
    })
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const message = json && (json.error || json.message) ? ` ${json.error || json.message}` : "";
    throw new Error(`AutoSprite request failed with HTTP ${response.status}.${message}`);
  }

  return json;
}

async function withRetries(label, maxRetries, baseDelayMs, operation) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt > maxRetries) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`${label} failed on attempt ${attempt}; retrying after ${delay}ms.`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const traits = JSON.parse(await fs.readFile(options.traitsPath, "utf8"));
  const rateLimitMs = options.rateLimitMs ?? traits.generation.rateLimitMs;
  const maxRetries = traits.generation.maxRetries;
  const retryBaseDelayMs = traits.generation.retryBaseDelayMs;
  const jobs = buildPlan(traits, options);
  const apiKey = process.env.AUTOSPRITE_API_KEY;

  await ensureFolders();

  if (!options.dryRun && !apiKey) {
    throw new Error("AUTOSPRITE_API_KEY is required for real generation.");
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    provider: "AutoSprite",
    phase: options.phase,
    dryRun: options.dryRun,
    resume: options.resume,
    batchSize: jobs.length,
    assets: [],
    summary: {
      planned: jobs.length,
      generated: 0,
      skipped: 0,
      dryRun: 0,
      failed: 0
    }
  };

  console.log(`Moonpet Art Factory: ${options.dryRun ? "dry-run" : "execute"} phase=${options.phase} jobs=${jobs.length}`);

  for (const [index, job] of jobs.entries()) {
    await fs.mkdir(job.outputDir, { recursive: true });

    const imageExists = await pathExists(job.imagePath);
    const responseExists = await pathExists(job.responsePath);
    const manifestAsset = redactForManifest(job);

    if (options.resume && imageExists && responseExists) {
      console.log(`[${index + 1}/${jobs.length}] skip existing ${job.id}`);
      manifest.assets.push({ ...manifestAsset, status: "skipped_existing" });
      manifest.summary.skipped += 1;
      continue;
    }

    if (options.dryRun) {
      console.log(`[${index + 1}/${jobs.length}] dry-run ${job.id}`);
      manifest.assets.push({ ...manifestAsset, status: "dry_run" });
      manifest.summary.dryRun += 1;
      continue;
    }

    console.log(`[${index + 1}/${jobs.length}] generate ${job.id}`);

    try {
      const responseJson = await withRetries(
        `AutoSprite ${job.id}`,
        maxRetries,
        retryBaseDelayMs,
        () => callAutoSprite(job, apiKey, traits)
      );

      await writeJson(job.responsePath, {
        generatedAt: new Date().toISOString(),
        provider: "AutoSprite",
        job: redactForManifest(job),
        response: responseJson
      });

      const imagePayload = extractImagePayload(responseJson);
      if (!imagePayload) {
        throw new Error("AutoSprite response saved, but no image payload was found.");
      }

      const imageBuffer = await withRetries(
        `Download ${job.id}`,
        maxRetries,
        retryBaseDelayMs,
        () => downloadImage(imagePayload)
      );

      await fs.writeFile(job.imagePath, imageBuffer);
      manifest.assets.push({ ...manifestAsset, status: "generated" });
      manifest.summary.generated += 1;
      await sleep(rateLimitMs);
    } catch (error) {
      manifest.assets.push({ ...manifestAsset, status: "failed", error: error.message });
      manifest.summary.failed += 1;
      console.error(`[${index + 1}/${jobs.length}] failed ${job.id}: ${error.message}`);
    }
  }

  await writeJson(MANIFEST_PATH, manifest);
  console.log(`Manifest written to ${path.relative(REPO_ROOT, MANIFEST_PATH).replace(/\\/g, "/")}`);

  if (manifest.summary.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
