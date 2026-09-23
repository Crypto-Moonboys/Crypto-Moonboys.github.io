#!/usr/bin/env node

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "moonpet-promote-"));
  const generatedDir = path.join(REPO_ROOT, "output", "moonpets", "spritesheets", "fixture");
  const sheetPath = path.join(generatedDir, "fixture-sheet.png");
  const atlasPath = path.join(generatedDir, "fixture-atlas.json");
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(sheetPath, "fixture-png");
  await fs.writeFile(atlasPath, JSON.stringify({ frames: [] }));

  const registryPath = path.join(tempRoot, "moonpet-approved-assets.json");
  const sandboxPath = path.join(tempRoot, "moonpet-animation-sandbox.generated.json");
  const spritesheetPath = path.join(tempRoot, "moonpet-spritesheets.generated.json");
  const publicDir = path.join(tempRoot, "public", "moonbot");

  await writeJson(registryPath, {
    assets: [
      {
        local_id: "moonbot_pet_visor_v1",
        character_name: "MOONBOT PET VISOR V1",
        animation_kind: "iso_idle_down",
        role: "base_idle",
        approved: true,
        sheet_path: "/img/moonpets/moonbot-pet-visor-v1/iso_idle_down.png",
        atlas_path: "/img/moonpets/moonbot-pet-visor-v1/iso_idle_down.json"
      }
    ],
    rejected: [
      {
        character_name: "MOONBOT PET VISOR V1",
        animation_kind: "attack",
        rejected: true
      }
    ]
  });

  await writeJson(sandboxPath, {
    assets: [
      {
        character_name: "MOONBOT PET VISOR V1",
        animation_kind: "iso_idle_down",
        role: "base_idle",
        approved: true,
        rejected: false,
        generated_sheet_path: "output/moonpets/spritesheets/fixture/fixture-sheet.png",
        generated_atlas_path: "output/moonpets/spritesheets/fixture/fixture-atlas.json"
      }
    ]
  });

  await writeJson(spritesheetPath, { spriteSheets: [] });

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, "scripts", "promote-moonpet-approved-assets.js"),
    "--registry", registryPath,
    "--sandbox-manifest", sandboxPath,
    "--spritesheet-manifest", spritesheetPath,
    "--public-dir", publicDir,
    "--public-base", "/fixture/moonbot"
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error("Promotion fixture failed.");
  }

  await fs.access(path.join(publicDir, "iso_idle_down.png"));
  await fs.access(path.join(publicDir, "iso_idle_down.json"));
  const updated = JSON.parse(await fs.readFile(registryPath, "utf8"));
  const asset = updated.assets[0];
  if (asset.promoted !== true || !asset.promoted_at) {
    throw new Error("Promotion fixture did not update promoted fields.");
  }
  if (asset.sheet_path !== "/fixture/moonbot/iso_idle_down.png") {
    throw new Error(`Unexpected promoted sheet path: ${asset.sheet_path}`);
  }

  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.rm(generatedDir, { recursive: true, force: true });
  console.log("promotion fixture ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
