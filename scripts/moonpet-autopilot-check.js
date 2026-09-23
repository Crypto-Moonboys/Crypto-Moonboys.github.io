#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");

const REQUIRED_APPROVED = [
  { animation_kind: "iso_idle_down", role: "base_idle" },
  { animation_kind: "iso_walk_down", role: "base_walk" },
  { animation_kind: "iso_run_down", role: "base_run" }
];

const PUBLIC_ASSET_DIR = "img/moonpets/moonbot-pet-visor-v1";
const REGISTRY_PATH = "data/moonpet-approved-assets.json";

const REQUIRED_PUBLIC_RUNTIME_FILES = [
  "moonpet-game.html",
  "js/moonpet-mini-app.js",
  "js/moonpet-approved-asset-loader.js",
  "js/moonpet-approved-sprite-renderer.js",
  "data/moonpet-approved-assets.json",
  "css/moonpet-mini-app.css",
  `${PUBLIC_ASSET_DIR}/iso_idle_down.png`,
  `${PUBLIC_ASSET_DIR}/iso_idle_down.json`,
  `${PUBLIC_ASSET_DIR}/iso_walk_down.png`,
  `${PUBLIC_ASSET_DIR}/iso_walk_down.json`,
  `${PUBLIC_ASSET_DIR}/iso_run_down.png`,
  `${PUBLIC_ASSET_DIR}/iso_run_down.json`
];

const NOT_REQUIRED_FOR_PUBLIC_RUNTIME = [
  "output/",
  "output/manifests/",
  "output/moonpets/",
  "scripts/generate-moonpet-assets.js",
  "scripts/promote-moonpet-approved-assets.js",
  ".github/workflows/moonpet-art-factory.yml"
];

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function toPublicPath(relativePath) {
  return `/${relativePath.replace(/\\/g, "/")}`;
}

function exists(relativePath) {
  return fs.existsSync(repoPath(relativePath));
}

function fileSize(relativePath) {
  try {
    return fs.statSync(repoPath(relativePath)).size;
  } catch (_) {
    return 0;
  }
}

function readText(relativePath) {
  return fs.readFileSync(repoPath(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function makeCheck(id, label, pass, detail, meta = {}) {
  return {
    id,
    label,
    status: pass ? "pass" : "fail",
    detail,
    ...meta
  };
}

function listRepoFiles() {
  try {
    return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean);
  } catch (_) {
    const output = [];
    const ignoredDirs = new Set([".git", "node_modules", "output", "dist", "build", "public-site", ".wrangler"]);
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignoredDirs.has(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        const relative = path.relative(repoRoot, absolute).replace(/\\/g, "/");
        if (entry.isDirectory()) walk(absolute);
        else output.push(relative);
      }
    }
    walk(repoRoot);
    return output;
  }
}

function findPotentialApiKeys() {
  const findings = [];
  const assignmentPattern = /AUTOSPRITE_API_KEY\s*=\s*["']?([A-Za-z0-9_-]{16,})["']?/g;
  const longAutospriteTokenPattern = /autosprite[_-]?(?:api[_-]?)?key["'\s:=]+([A-Za-z0-9_-]{24,})/gi;
  for (const file of listRepoFiles()) {
    if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|mp3|mp4|zip)$/i.test(file)) continue;
    let text = "";
    try {
      text = readText(file);
    } catch (_) {
      continue;
    }
    const matches = [...text.matchAll(assignmentPattern), ...text.matchAll(longAutospriteTokenPattern)];
    for (const match of matches) {
      const value = String(match[1] || "");
      if (!value || value === "replace_me") continue;
      if (/^secrets$/i.test(value) || /^process$/i.test(value)) continue;
      if (file.endsWith(".md") && /replace_me|process\.env|secrets\.AUTOSPRITE_API_KEY/.test(match[0])) continue;
      findings.push({ file, match: match[0].replace(value, "[redacted]") });
    }
  }
  return findings;
}

function registryAssetKey(asset) {
  return `${asset.character_name || ""}::${asset.animation_kind || ""}`;
}

function runMoonpetAutopilotChecks() {
  const checks = [];
  let registry = null;
  let registryError = null;

  if (exists(REGISTRY_PATH)) {
    try {
      registry = readJson(REGISTRY_PATH);
    } catch (error) {
      registryError = error.message;
    }
  }

  checks.push(makeCheck(
    "approved_registry_exists",
    "Approved asset registry exists and parses",
    Boolean(registry) && !registryError,
    registryError || REGISTRY_PATH
  ));

  const approvedAssets = registry && Array.isArray(registry.assets) ? registry.assets : [];
  const rejectedAssets = registry && Array.isArray(registry.rejected) ? registry.rejected : [];

  for (const required of REQUIRED_APPROVED) {
    const asset = approvedAssets.find((entry) =>
      entry.animation_kind === required.animation_kind &&
      entry.role === required.role &&
      entry.approved === true &&
      entry.promoted === true
    );
    const sheetPath = `${PUBLIC_ASSET_DIR}/${required.animation_kind}.png`;
    const atlasPath = `${PUBLIC_ASSET_DIR}/${required.animation_kind}.json`;
    checks.push(makeCheck(
      `approved_registry_${required.animation_kind}`,
      `Registry approves ${required.animation_kind}`,
      Boolean(asset),
      asset ? registryAssetKey(asset) : `Missing approved promoted ${required.animation_kind}`
    ));
    checks.push(makeCheck(
      `approved_sheet_${required.animation_kind}`,
      `Promoted sheet exists for ${required.animation_kind}`,
      exists(sheetPath) && fileSize(sheetPath) > 10240,
      `${sheetPath} (${fileSize(sheetPath)} bytes)`
    ));
    checks.push(makeCheck(
      `approved_atlas_${required.animation_kind}`,
      `Promoted atlas exists for ${required.animation_kind}`,
      exists(atlasPath) && fileSize(atlasPath) > 100,
      `${atlasPath} (${fileSize(atlasPath)} bytes)`
    ));
    checks.push(makeCheck(
      `approved_public_paths_${required.animation_kind}`,
      `Registry uses public paths for ${required.animation_kind}`,
      Boolean(asset) &&
        asset.sheet_path === toPublicPath(sheetPath) &&
        asset.atlas_path === toPublicPath(atlasPath),
      asset ? `${asset.sheet_path || "missing"} / ${asset.atlas_path || "missing"}` : "No registry asset"
    ));
  }

  const attackRejected = rejectedAssets.find((entry) =>
    entry.animation_kind === "attack" &&
    entry.rejected === true &&
    /side/i.test(String(entry.role || entry.reason || ""))
  );
  checks.push(makeCheck(
    "attack_rejected",
    "Rejected attack remains rejected",
    Boolean(attackRejected),
    attackRejected ? attackRejected.reason || attackRejected.role : "attack rejection missing"
  ));

  const requiredFiles = [
    ["sandbox_page_exists", "Sandbox page exists", "moonpet-animation-sandbox.html"],
    ["runtime_preview_exists", "Runtime preview page exists", "moonpet-runtime-preview.html"],
    ["approved_asset_loader_exists", "Approved asset loader exists", "js/moonpet-approved-asset-loader.js"],
    ["approved_sprite_renderer_exists", "Approved sprite renderer exists", "js/moonpet-approved-sprite-renderer.js"],
    ["live_game_exists", "Live game page exists", "moonpet-game.html"]
  ];
  for (const [id, label, file] of requiredFiles) {
    checks.push(makeCheck(id, label, exists(file), file));
  }

  let miniAppText = "";
  let rendererText = "";
  let liveHtmlText = "";
  try { miniAppText = readText("js/moonpet-mini-app.js"); } catch (_) {}
  try { rendererText = readText("js/moonpet-approved-sprite-renderer.js"); } catch (_) {}
  try { liveHtmlText = readText("moonpet-game.html"); } catch (_) {}

  const defaultOff = /window\.MOONPET_USE_APPROVED_SPRITES\s*=\s*approvedSpriteModeEnabled/.test(miniAppText) &&
    /launchParameter\('approvedSprites'\)\s*===\s*'1'/.test(miniAppText) &&
    /window\.MOONPET_USE_APPROVED_SPRITES\s*=\s*window\.MOONPET_USE_APPROVED_SPRITES\s*===\s*true/.test(rendererText) &&
    !/MOONPET_USE_APPROVED_SPRITES\s*=\s*true/.test(liveHtmlText);
  checks.push(makeCheck(
    "live_flag_default_off",
    "Live approved sprite flag defaults off",
    defaultOff,
    "Enabled only by pre-set true flag or ?approvedSprites=1"
  ));

  const noOutputRuntimeDependency = approvedAssets.every((asset) =>
    !String(asset.sheet_path || "").startsWith("/output/") &&
    !String(asset.atlas_path || "").startsWith("/output/")
  ) && !/output\/manifests|output\/moonpets/.test(`${miniAppText}\n${rendererText}\n${liveHtmlText}`);
  checks.push(makeCheck(
    "no_output_required_for_public_runtime",
    "No output/ generated folders are required for public runtime",
    noOutputRuntimeDependency,
    "Public runtime uses data/, js/, css/, moonpet-game.html, and img/moonpets/"
  ));

  const apiKeyFindings = findPotentialApiKeys();
  checks.push(makeCheck(
    "no_api_key_present",
    "No real AutoSprite API key appears in repo files",
    apiKeyFindings.length === 0,
    apiKeyFindings.length ? `${apiKeyFindings.length} potential secret finding(s)` : "No committed key-like AutoSprite values found",
    { findings: apiKeyFindings }
  ));

  const overallStatus = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  return {
    timestamp: new Date().toISOString(),
    overall_status: overallStatus,
    checks,
    approved_assets: approvedAssets,
    rejected_assets: rejectedAssets,
    next_recommended_action: overallStatus === "pass"
      ? "Run the live game with ?approvedSprites=1 in a controlled browser session and verify visual fallback behaviour."
      : "Fix failed Moonpet autopilot checks before testing or promoting live sprite changes.",
    files_required_for_public_runtime: REQUIRED_PUBLIC_RUNTIME_FILES,
    files_not_required_for_public_runtime: NOT_REQUIRED_FOR_PUBLIC_RUNTIME
  };
}

function printSummary(report) {
  console.log(`Moonpet Autopilot: ${report.overall_status.toUpperCase()}`);
  for (const check of report.checks) {
    const icon = check.status === "pass" ? "PASS" : "FAIL";
    console.log(`[${icon}] ${check.label} - ${check.detail}`);
  }
}

if (require.main === module) {
  const report = runMoonpetAutopilotChecks();
  printSummary(report);
  process.exit(report.overall_status === "pass" ? 0 : 1);
}

module.exports = {
  runMoonpetAutopilotChecks,
  REQUIRED_PUBLIC_RUNTIME_FILES,
  NOT_REQUIRED_FOR_PUBLIC_RUNTIME
};
