#!/usr/bin/env node

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { generateCustomAnimation } = require("./generate-moonpet-custom-animation");
const { promoteCustomAnimation } = require("./promote-moonpet-custom-animation");

const REPO_ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(REPO_ROOT, "data", "moonpet-custom-animation-queue.json");
const GENERATED_MANIFEST_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-custom-animation.generated.json");
const REVIEW_REPORT_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-custom-animation-review.generated.json");
const REVIEW_ARCHIVE_DIR = path.join(REPO_ROOT, "output", "manifests", "moonpet-custom-animation-reviews");
const ALLOWED_IDS = new Set(["custom_eat"]);
const REVIEWABLE_STATUSES = new Set(["planned", "generated_pending_review", "rejected_pending_regeneration"]);
const FRAME_COUNT = 25;
const FRAME_SIZE = 256;
const SHEET_SIZE = { w: 1280, h: 1280 };

function parseArgs(argv) {
  const options = {
    id: "custom_eat",
    execute: false,
    review: true,
    promoteIfPassed: false,
    queuePath: QUEUE_PATH
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--id") options.id = argv[++index];
    else if (arg.startsWith("--id=")) options.id = arg.slice("--id=".length);
    else if (arg === "--execute") options.execute = true;
    else if (arg === "--no-review") options.review = false;
    else if (arg === "--review") options.review = true;
    else if (arg === "--promote-if-passed") options.promoteIfPassed = true;
    else if (arg === "--queue") options.queuePath = path.resolve(argv[++index]);
    else if (arg.startsWith("--queue=")) options.queuePath = path.resolve(arg.slice("--queue=".length));
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function safeTimestamp(value = new Date().toISOString()) {
  return String(value).replace(/[:.]/g, "-");
}

async function writeReviewReport(report) {
  if (await pathExists(REVIEW_REPORT_PATH)) {
    try {
      const previous = await readJson(REVIEW_REPORT_PATH);
      const previousId = previous.custom_animation_id || "custom-animation";
      const previousCreatedAt = previous.created_at || previous.generated_at || new Date().toISOString();
      const archivePath = path.join(REVIEW_ARCHIVE_DIR, `${previousId}-${safeTimestamp(previousCreatedAt)}.json`);
      await writeJson(archivePath, previous);
      report.previous_report_archived_path = relative(archivePath);
    } catch (error) {
      report.previous_report_archive_error = error.message;
    }
  }
  await writeJson(REVIEW_REPORT_PATH, report);
}

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function repoPath(value) {
  return path.join(REPO_ROOT, String(value || "").replace(/^\/+/, ""));
}

function pass(id, label, detail = "") {
  return { id, label, status: "pass", detail };
}

function fail(id, label, detail = "") {
  return { id, label, status: "fail", detail };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findQueueItem(queue, id) {
  return (queue.items || []).find((item) => item.id === id) || null;
}

async function readGeneratedRecord(id) {
  try {
    const manifest = await readJson(GENERATED_MANIFEST_PATH);
    return (manifest.customAnimations || [])
      .filter((entry) => entry.id === id && ["generated_pending_review", "generated"].includes(entry.status))
      .at(-1) || null;
  } catch {
    return null;
  }
}

function getOutputPaths(item, record) {
  const sheetPath = record && (record.generated_sheet_path || record.source_sheet_path || record.sheet_path_source);
  const atlasPath = record && (record.generated_atlas_path || record.source_atlas_path || record.atlas_path_source);
  return {
    sheetPath: sheetPath ? repoPath(sheetPath) : path.join(REPO_ROOT, "output", "moonpets", "custom", `${item.id}.png`),
    atlasPath: atlasPath ? repoPath(atlasPath) : path.join(REPO_ROOT, "output", "moonpets", "custom", `${item.id}.json`)
  };
}

function normalizeAtlasFrames(atlas) {
  if (!atlas || typeof atlas !== "object") return [];
  if (Array.isArray(atlas.frames)) return atlas.frames;
  if (atlas.frames && typeof atlas.frames === "object") {
    return Object.keys(atlas.frames)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => atlas.frames[key]);
  }
  return [];
}

async function checkImageOccupancy(sheetPath) {
  const image = sharp(sheetPath);
  const metadata = await image.metadata();
  const raw = await image.ensureAlpha().raw().toBuffer();
  const frameBytes = FRAME_SIZE * FRAME_SIZE * 4;
  let nonTransparent = 0;
  const frameOccupancies = [];
  const frameHashes = [];

  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    const column = frame % 5;
    const row = Math.floor(frame / 5);
    let frameNonTransparent = 0;
    let hash = 2166136261;
    for (let y = 0; y < FRAME_SIZE; y += 1) {
      const sourceY = row * FRAME_SIZE + y;
      for (let x = 0; x < FRAME_SIZE; x += 1) {
        const sourceX = column * FRAME_SIZE + x;
        const index = (sourceY * metadata.width + sourceX) * 4;
        const alpha = raw[index + 3];
        if (alpha > 8) {
          nonTransparent += 1;
          frameNonTransparent += 1;
        }
        hash ^= raw[index] + (raw[index + 1] << 8) + (raw[index + 2] << 16) + (alpha << 24);
        hash = Math.imul(hash, 16777619);
      }
    }
    frameOccupancies.push(frameNonTransparent / (frameBytes / 4));
    frameHashes.push(hash >>> 0);
  }

  const totalPixels = metadata.width * metadata.height;
  const nonTransparentRatio = nonTransparent / totalPixels;
  const occupiedFrames = frameOccupancies.filter((value) => value > 0.01).length;
  const uniqueFrames = new Set(frameHashes).size;
  return {
    width: metadata.width,
    height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    nonTransparentRatio,
    occupiedFrames,
    uniqueFrames,
    minFrameOccupancy: Math.min(...frameOccupancies),
    maxFrameOccupancy: Math.max(...frameOccupancies)
  };
}

async function reviewOutput({ item, record }) {
  const checks = [];
  const { sheetPath, atlasPath } = getOutputPaths(item, record);
  const sheetRelative = relative(sheetPath);
  const atlasRelative = relative(atlasPath);
  const targetSheet = item.promotion_target && item.promotion_target.sheet_path;
  const targetAtlas = item.promotion_target && item.promotion_target.atlas_path;

  checks.push(item.id !== "attack" && item.animation_kind !== "attack" && item.role !== "attack"
    ? pass("not_attack", "Animation is not rejected attack", item.id)
    : fail("not_attack", "Animation must not be attack", item.id));
  checks.push(record && record.id === item.id
    ? pass("record_matches_id", "Generated manifest id matches requested id", record.id)
    : fail("record_matches_id", "Generated manifest id must match requested id", record && record.id || "missing"));
  checks.push(targetSheet === `/img/moonpets/moonbot-pet-visor-v1/${item.id}.png` &&
    targetAtlas === `/img/moonpets/moonbot-pet-visor-v1/${item.id}.json`
    ? pass("stable_public_targets", "Output paths are stable", `${targetSheet} / ${targetAtlas}`)
    : fail("stable_public_targets", "Output paths must be stable", `${targetSheet || "missing"} / ${targetAtlas || "missing"}`));

  const sheetExists = await pathExists(sheetPath);
  const atlasExists = await pathExists(atlasPath);
  checks.push(sheetExists
    ? pass("generated_sheet_path_exists", "Generated sheet path exists", sheetRelative)
    : fail("generated_sheet_path_exists", "Generated sheet path missing", sheetRelative));
  checks.push(atlasExists
    ? pass("generated_atlas_path_exists", "Generated atlas path exists", atlasRelative)
    : fail("generated_atlas_path_exists", "Generated atlas path missing", atlasRelative));
  checks.push(sheetExists ? pass("png_exists", "PNG file exists", sheetRelative) : fail("png_exists", "PNG file missing", sheetRelative));
  checks.push(atlasExists ? pass("atlas_exists", "Atlas file exists", atlasRelative) : fail("atlas_exists", "Atlas file missing", atlasRelative));

  let sheetBytes = 0;
  if (sheetExists) {
    sheetBytes = (await fs.stat(sheetPath)).size;
    checks.push(sheetBytes > 50 * 1024
      ? pass("png_size", "PNG file is larger than 50KB", `${sheetBytes} bytes`)
      : fail("png_size", "PNG file must be larger than 50KB", `${sheetBytes} bytes`));
  }

  let atlas = null;
  let frames = [];
  if (atlasExists) {
    try {
      atlas = await readJson(atlasPath);
      frames = normalizeAtlasFrames(atlas);
      checks.push(frames.length === FRAME_COUNT
        ? pass("atlas_frame_count", "Atlas has 25 frames", String(frames.length))
        : fail("atlas_frame_count", "Atlas must have 25 frames", String(frames.length)));
      const frameSizesOk = frames.every((frame) => frame && frame.w === FRAME_SIZE && frame.h === FRAME_SIZE);
      checks.push(frameSizesOk
        ? pass("atlas_frame_size", "Atlas frames are 256x256", "all frames")
        : fail("atlas_frame_size", "Atlas frames must be 256x256", "one or more frames differ"));
      const metaSize = atlas.meta && atlas.meta.size || {};
      const metaFrameSize = atlas.meta && (atlas.meta.frame_size || atlas.meta.frameSize) || {};
      checks.push(metaSize.w === SHEET_SIZE.w && metaSize.h === SHEET_SIZE.h
        ? pass("atlas_sheet_size", "Atlas sheet size is 1280x1280", `${metaSize.w}x${metaSize.h}`)
        : fail("atlas_sheet_size", "Atlas sheet size must be 1280x1280", `${metaSize.w || "?"}x${metaSize.h || "?"}`));
      checks.push(metaFrameSize.w === FRAME_SIZE && metaFrameSize.h === FRAME_SIZE
        ? pass("atlas_meta_frame_size", "Atlas meta frame size is 256x256", `${metaFrameSize.w}x${metaFrameSize.h}`)
        : fail("atlas_meta_frame_size", "Atlas meta frame size must be 256x256", `${metaFrameSize.w || "?"}x${metaFrameSize.h || "?"}`));
    } catch (error) {
      checks.push(fail("atlas_json_parse", "Atlas JSON parses", error.message));
    }
  }

  let imageStats = null;
  if (sheetExists) {
    try {
      imageStats = await checkImageOccupancy(sheetPath);
      checks.push(imageStats.width === SHEET_SIZE.w && imageStats.height === SHEET_SIZE.h
        ? pass("png_sheet_size", "PNG sheet size is 1280x1280", `${imageStats.width}x${imageStats.height}`)
        : fail("png_sheet_size", "PNG sheet size must be 1280x1280", `${imageStats.width}x${imageStats.height}`));
      checks.push(imageStats.nonTransparentRatio > 0.02
        ? pass("not_fully_transparent", "PNG is not fully transparent", imageStats.nonTransparentRatio.toFixed(4))
        : fail("not_fully_transparent", "PNG appears transparent or empty", imageStats.nonTransparentRatio.toFixed(4)));
      checks.push(imageStats.occupiedFrames >= 20
        ? pass("occupied_frames", "Most frames contain visible pixels", `${imageStats.occupiedFrames}/${FRAME_COUNT}`)
        : fail("occupied_frames", "Too many frames appear blank", `${imageStats.occupiedFrames}/${FRAME_COUNT}`));
      checks.push(imageStats.uniqueFrames > 1
        ? pass("not_static_one_frame", "Frames are not all identical", `${imageStats.uniqueFrames} unique frames`)
        : fail("not_static_one_frame", "Sheet looks like a repeated single frame", `${imageStats.uniqueFrames} unique frames`));
      checks.push(imageStats.maxFrameOccupancy < 0.9
        ? pass("reasonable_occupancy", "Frame occupancy is reasonable", `${imageStats.minFrameOccupancy.toFixed(3)}-${imageStats.maxFrameOccupancy.toFixed(3)}`)
        : fail("reasonable_occupancy", "Frame occupancy is suspiciously high", `${imageStats.maxFrameOccupancy.toFixed(3)}`));
    } catch (error) {
      checks.push(fail("image_analysis", "Image analysis completed", error.message));
    }
  }

  const failed = checks.filter((check) => check.status === "fail");
  return {
    checks,
    review_status: failed.length ? "fail" : "pass",
    reason: failed.length ? failed.map((check) => check.label).join("; ") : "Mechanical checks passed. Visual review still required before final approval.",
    output_png_path: sheetRelative,
    output_atlas_path: atlasRelative,
    frame_count: frames.length || item.output_expectations && item.output_expectations.frame_count || null,
    frame_size: FRAME_SIZE,
    sheet_size: imageStats ? { w: imageStats.width, h: imageStats.height } : item.output_expectations && item.output_expectations.sheet_size || null,
    image_stats: imageStats
  };
}

function validateItem(item, id) {
  const checks = [];
  checks.push(ALLOWED_IDS.has(id)
    ? pass("id_enabled", "Custom animation id is enabled", id)
    : fail("id_enabled", "Only custom_eat is enabled", id));
  checks.push(Boolean(item) ? pass("queue_item_exists", "Queue item exists", id) : fail("queue_item_exists", "Queue item missing", id));
  if (!item) return checks;
  checks.push(REVIEWABLE_STATUSES.has(item.status)
    ? pass("queue_status_reviewable", "Queue status is reviewable", item.status)
    : fail("queue_status_reviewable", "Queue status must be planned, generated_pending_review, or rejected_pending_regeneration", item.status));
  checks.push(item.approved === false
    ? pass("not_already_approved", "Item is not already approved", "approved=false")
    : fail("not_already_approved", "Approved items cannot be regenerated/reviewed here", "approved=true"));
  checks.push(item.rejected !== true
    ? pass("not_rejected", "Item is not terminally rejected", "rejected=false")
    : fail("not_rejected", "Terminally rejected item cannot be generated or promoted", "rejected=true"));
  checks.push(item.rejected !== true && id !== "attack" && item.animation_kind !== "attack" && item.role !== "attack"
    ? pass("no_rejected_state_promotion", "No rejected state is being promoted", id)
    : fail("no_rejected_state_promotion", "Rejected states must not be promoted", id));
  checks.push(item.id !== "attack" && item.animation_kind !== "attack" && item.role !== "attack"
    ? pass("queue_not_attack", "Queue item is not attack", item.id)
    : fail("queue_not_attack", "Rejected attack cannot be used", item.id));
  checks.push(item.custom_required === true
    ? pass("custom_required", "Item requires custom generation", "custom_required=true")
    : fail("custom_required", "Item must declare custom_required=true", String(item.custom_required)));
  return checks;
}

async function runCustomAnimationAutopilot(options) {
  const queue = await readJson(options.queuePath);
  const item = findQueueItem(queue, options.id);
  const setupChecks = validateItem(item, options.id);
  const setupFailed = setupChecks.filter((check) => check.status === "fail");
  let generationStatus = "not_run";
  let generationError = "";
  let record = await readGeneratedRecord(options.id);
  let review = null;
  let promoted = false;
  let promotionError = "";
  const shouldReview = options.review || options.execute || options.promoteIfPassed;

  if (!setupFailed.length && options.execute && ["planned", "rejected_pending_regeneration"].includes(item.status)) {
    try {
      const entry = await generateCustomAnimation({
        id: options.id,
        execute: true,
        dryRun: false,
        queuePath: options.queuePath,
        pollTimeoutMs: 10 * 60 * 1000
      });
      generationStatus = entry.status || "generated_pending_review";
      record = entry;
    } catch (error) {
      generationStatus = "failed";
      generationError = error.message;
    }
  } else if (!setupFailed.length && options.execute && item.status === "generated_pending_review") {
    generationStatus = record && record.status || "generated_pending_review";
  } else if (record) {
    generationStatus = record.status || "generated_pending_review";
  }

  if (!setupFailed.length && shouldReview) {
    if (record || fsSync.existsSync(path.join(REPO_ROOT, "output", "moonpets", "custom", `${options.id}.png`))) {
      review = await reviewOutput({ item, record });
    } else {
      review = {
        checks: [],
        review_status: "manual_review_required",
        reason: options.execute
          ? "Generation did not produce a reviewable output."
          : "No generated output found. Run with --execute or add output files before review.",
        output_png_path: relative(path.join(REPO_ROOT, "output", "moonpets", "custom", `${options.id}.png`)),
        output_atlas_path: relative(path.join(REPO_ROOT, "output", "moonpets", "custom", `${options.id}.json`)),
        frame_count: item && item.output_expectations && item.output_expectations.frame_count || null,
        frame_size: item && item.output_expectations && item.output_expectations.frame_size || null,
        sheet_size: item && item.output_expectations && item.output_expectations.sheet_size || null
      };
    }
  }

  if (options.promoteIfPassed && review && review.review_status === "pass") {
    try {
      await promoteCustomAnimation({ id: options.id, force: false });
      promoted = true;
    } catch (error) {
      promotionError = error.message;
    }
  }

  const allChecks = [
    ...setupChecks,
    ...(review && review.checks || []),
    ...(generationError ? [fail("generation_error", "Generation completed without error", generationError)] : []),
    ...(promotionError ? [fail("promotion_error", "Promotion completed without error", promotionError)] : [])
  ];
  const failed = allChecks.filter((check) => check.status === "fail");
  const reviewStatus = setupFailed.length || generationError || promotionError
    ? "fail"
    : review && review.review_status || "manual_review_required";
  const report = {
    created_at: new Date().toISOString(),
    custom_animation_id: options.id,
    source_character_name: item && item.source_character_name || null,
    prompt: item && item.prompt || null,
    generation_status: generationStatus,
    review_status: reviewStatus,
    queue_status: item && item.status || null,
    visual_rejected: Boolean(item && item.visual_rejected),
    rejected_pending_regeneration: item && item.status === "rejected_pending_regeneration",
    rejection_reason: item && item.rejection_reason || null,
    previous_artifact_url: item && item.previous_artifact_url || null,
    regeneration_allowed: Boolean(item && item.regeneration_allowed === true && item.status === "rejected_pending_regeneration" && item.approved === false),
    reason: failed.length ? failed.map((check) => check.detail || check.label).join("; ") : review && review.reason || "Manual review required.",
    checks: allChecks,
    output_png_path: review && review.output_png_path || null,
    output_atlas_path: review && review.output_atlas_path || null,
    frame_count: review && review.frame_count || item && item.output_expectations && item.output_expectations.frame_count || null,
    frame_size: review && review.frame_size || item && item.output_expectations && item.output_expectations.frame_size || null,
    sheet_size: review && review.sheet_size || item && item.output_expectations && item.output_expectations.sheet_size || null,
    visual_review_required: true,
    promoted,
    approved: false,
    auto_promote_if_passed: options.promoteIfPassed,
    recommendations: reviewStatus === "pass"
      ? ["Open the sandbox/runtime preview for visual approval.", "Promote only with explicit auto_promote_if_passed=true or a separate promotion step.", "Do not set approved=true until explicit human approval."]
      : ["Do not promote or approve until failed checks are resolved.", "Inspect output/manifests/ and output/moonpets/custom/ artifacts."]
  };
  await writeReviewReport(report);
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runCustomAnimationAutopilot(options);
  console.log(`Moonpet custom animation autopilot: ${report.review_status}`);
  console.log(`Report: ${relative(REVIEW_REPORT_PATH)}`);
  console.log(`Reason: ${report.reason}`);
  if (report.review_status === "fail") process.exitCode = 1;
}

if (require.main === module) {
  main().catch(async (error) => {
    const report = {
      created_at: new Date().toISOString(),
      custom_animation_id: parseArgs(process.argv.slice(2)).id,
      generation_status: "failed",
      review_status: "fail",
      reason: error.message,
      checks: [fail("autopilot_exception", "Autopilot completed without exception", error.message)],
      recommendations: ["Inspect the exception and rerun after fixing the queue or generator."]
    };
    await writeReviewReport(report);
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runCustomAnimationAutopilot,
  reviewOutput,
  validateItem,
  normalizeAtlasFrames
};
