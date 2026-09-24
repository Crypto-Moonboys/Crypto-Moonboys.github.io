#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  generateSideScrollerAnimation,
  SIDE_SEQUENCE
} = require("./generate-moonpet-side-scroller-animation");

const REPO_ROOT = path.resolve(__dirname, "..");
const QUEUE_PATH = path.join(REPO_ROOT, "data", "moonpet-side-scroller-animation-queue.json");
const REPORT_PATH = path.join(REPO_ROOT, "output", "manifests", "moonpet-side-scroller-autopilot.generated.json");
const PUBLIC_BASE_DIR = path.join(REPO_ROOT, "img", "moonpets", "moonbot-pet-visor-v1-side");

function parseArgs(argv) {
  const options = {
    execute: false,
    autopilot: false,
    limit: SIDE_SEQUENCE.length,
    autoContinueOnPass: true,
    promote: false,
    queuePath: QUEUE_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") options.execute = true;
    else if (arg === "--autopilot") options.autopilot = true;
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--auto-continue-on-pass") options.autoContinueOnPass = true;
    else if (arg === "--no-auto-continue-on-pass") options.autoContinueOnPass = false;
    else if (arg === "--promote") options.promote = true;
    else if (arg === "--queue") options.queuePath = path.resolve(argv[++index]);
    else if (arg.startsWith("--queue=")) options.queuePath = path.resolve(arg.slice("--queue=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = SIDE_SEQUENCE.length;
  options.limit = Math.min(SIDE_SEQUENCE.length, Math.floor(options.limit));
  return options;
}

function printHelp() {
  console.log(`Moonpet side-scroller overnight autopilot

Usage:
  node scripts/moonpet-side-scroller-autopilot.js --autopilot --limit 9
  node scripts/moonpet-side-scroller-autopilot.js --autopilot --execute --limit 9

Options:
  --autopilot                  Required intent flag for the overnight sequence.
  --execute                    Call AutoSprite after each dry-run gate passes.
  --limit <n>                  Number of queued animations to attempt.
  --auto-continue-on-pass      Continue to the next animation when checks pass. Default.
  --no-auto-continue-on-pass   Stop after the first passed animation.
  --promote                    Copy mechanically passing assets to public side-scroller paths.
  --queue <path>               Alternate side-scroller queue JSON path.
`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function repoPath(value) {
  return path.join(REPO_ROOT, String(value || "").replace(/^\/+/, ""));
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

function setQueueStatus(queue, id, fields) {
  const item = findQueueItem(queue, id);
  if (!item) return null;
  Object.assign(item, fields, { updated_at: new Date().toISOString() });
  return item;
}

function summarizeChecks(checks = []) {
  const find = (checkId) => checks.find((check) => check.id === checkId);
  return {
    nonblank_check: find("not_blank") || null,
    frame_count_check: find("frame_count") || null,
    frame_size_check: find("frame_size") || null,
    sheet_size_check: find("png_sheet_size") || find("atlas_sheet_size") || null
  };
}

async function copyIfExists(source, destination) {
  if (!(await pathExists(source))) {
    throw new Error(`Promotion source missing: ${relative(source)}`);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function promoteEntry(queue, item, entry) {
  const target = item.promotion_target || {};
  if (!target.sheet_path || !target.atlas_path) {
    throw new Error(`${item.id} is missing promotion target paths.`);
  }
  const sourceSheet = repoPath(entry.generated_sheet_path || entry.output_png_path);
  const sourceAtlas = repoPath(entry.generated_atlas_path || entry.output_atlas_path);
  const targetSheet = path.join(PUBLIC_BASE_DIR, `${item.id}.png`);
  const targetAtlas = path.join(PUBLIC_BASE_DIR, `${item.id}.json`);
  await copyIfExists(sourceSheet, targetSheet);
  await copyIfExists(sourceAtlas, targetAtlas);
  setQueueStatus(queue, item.id, {
    status: "promoted",
    promoted: true,
    promoted_at: new Date().toISOString(),
    approved: false,
    visual_review_required: true,
    sheet_path: target.sheet_path,
    atlas_path: target.atlas_path
  });
  return {
    sheet_path: relative(targetSheet),
    atlas_path: relative(targetAtlas)
  };
}

function buildStepReport({ id, item, dryRunEntry, generatedEntry, promoted, promotedPaths, status, reason }) {
  const entry = generatedEntry || dryRunEntry || {};
  const checks = entry.checks || [];
  const summarized = summarizeChecks(checks);
  return {
    requested_id: id,
    dry_run_status: dryRunEntry && dryRunEntry.review_status === "pass" ? "pass" : "fail",
    generation_attempted: Boolean(generatedEntry),
    png_path: entry.generated_sheet_path || entry.output_png_path || `output/moonpets/side-scroller/${id}.png`,
    json_path: entry.generated_atlas_path || entry.output_atlas_path || `output/moonpets/side-scroller/${id}.json`,
    frame_count: entry.frame_count || item && item.output_expectations && item.output_expectations.frame_count || null,
    frame_size: entry.frame_size || item && item.output_expectations && item.output_expectations.frame_size || null,
    sheet_size: entry.sheet_size || item && item.output_expectations && item.output_expectations.sheet_size || null,
    nonblank_check: summarized.nonblank_check,
    prompt_used: item && item.prompt || null,
    negative_prompt_used: item && item.negative_prompt || null,
    checks,
    promoted,
    promoted_paths: promotedPaths,
    status,
    reason_stopped: reason || null
  };
}

async function runSideScrollerAutopilot(options) {
  if (!options.autopilot) {
    throw new Error("Use --autopilot to run the side-scroller overnight sequence.");
  }

  const queue = await readJson(options.queuePath);
  const attemptedIds = SIDE_SEQUENCE.slice(0, options.limit);
  const steps = [];
  const mutateQueue = options.execute || options.promote;
  let overallStatus = "pass";
  let stoppedAt = null;
  let stopReason = null;

  for (const id of attemptedIds) {
    const item = findQueueItem(queue, id);
    let dryRunEntry = null;
    let generatedEntry = null;
    let promoted = false;
    let promotedPaths = null;
    let status = "skipped";
    let reason = "";

    try {
      if (!item) throw new Error(`${id} is missing from the side-scroller queue.`);
      if (item.approved === true || item.promoted === true || item.status === "promoted") {
        status = "skipped";
        reason = "Already promoted or approved; skipping overwrite.";
        steps.push(buildStepReport({ id, item, dryRunEntry, generatedEntry, promoted, promotedPaths, status, reason }));
        continue;
      }
      if (mutateQueue) setQueueStatus(queue, id, { status: "pending", approved: false, promoted: false });
      dryRunEntry = await generateSideScrollerAnimation({
        id,
        execute: false,
        dryRun: true,
        review: true,
        queuePath: options.queuePath
      });
      const dryRunFailed = (dryRunEntry.checks || []).some((check) => check.status === "fail");
      if (dryRunFailed || dryRunEntry.review_status !== "pass") {
        status = "rejected_pending_regeneration";
        reason = "Dry-run validation failed.";
        if (mutateQueue) setQueueStatus(queue, id, {
          status,
          approved: false,
          promoted: false,
          rejection_reason: reason
        });
        overallStatus = "fail";
        stoppedAt = id;
        stopReason = reason;
        steps.push(buildStepReport({ id, item, dryRunEntry, generatedEntry, promoted, promotedPaths, status, reason }));
        break;
      }

      if (!options.execute) {
        status = "skipped";
        reason = "Dry-run passed; execute flag disabled.";
        steps.push(buildStepReport({ id, item, dryRunEntry, generatedEntry, promoted, promotedPaths, status, reason }));
        continue;
      }

      generatedEntry = await generateSideScrollerAnimation({
        id,
        execute: true,
        dryRun: false,
        review: true,
        queuePath: options.queuePath,
        pollTimeoutMs: 10 * 60 * 1000
      });

      if (generatedEntry.review_status !== "pass") {
        status = "rejected_pending_regeneration";
        reason = "Mechanical review failed.";
        if (mutateQueue) setQueueStatus(queue, id, {
          status,
          approved: false,
          promoted: false,
          rejection_reason: reason,
          generated_sheet_path: generatedEntry.generated_sheet_path || null,
          generated_atlas_path: generatedEntry.generated_atlas_path || null
        });
        overallStatus = "fail";
        stoppedAt = id;
        stopReason = reason;
        steps.push(buildStepReport({ id, item, dryRunEntry, generatedEntry, promoted, promotedPaths, status, reason }));
        break;
      }

      status = "mechanically_passed";
      if (mutateQueue) setQueueStatus(queue, id, {
        status,
        approved: false,
        promoted: false,
        visual_review_required: true,
        generated_sheet_path: generatedEntry.generated_sheet_path,
        generated_atlas_path: generatedEntry.generated_atlas_path,
        autosprite_job_id: generatedEntry.autosprite_job_id || null,
        autosprite_spritesheet_id: generatedEntry.autosprite_spritesheet_id || null
      });

      if (options.promote) {
        promotedPaths = await promoteEntry(queue, item, generatedEntry);
        promoted = true;
        status = "promoted";
      }

      steps.push(buildStepReport({ id, item, dryRunEntry, generatedEntry, promoted, promotedPaths, status, reason }));

      if (!options.autoContinueOnPass) {
        stoppedAt = id;
        stopReason = "auto_continue_on_pass=false";
        break;
      }
    } catch (error) {
      status = "rejected_pending_regeneration";
      reason = error.message;
      if (item && mutateQueue) {
        setQueueStatus(queue, id, {
          status,
          approved: false,
          promoted: false,
          rejection_reason: reason
        });
      }
      overallStatus = "fail";
      stoppedAt = id;
      stopReason = reason;
      steps.push(buildStepReport({ id, item, dryRunEntry, generatedEntry, promoted, promotedPaths, status, reason }));
      break;
    }
  }

  if (mutateQueue) await writeJson(options.queuePath, queue);
  const report = {
    generated_at: new Date().toISOString(),
    overall_status: overallStatus,
    mode: options.execute ? "execute" : "dry_run",
    auto_continue_on_pass: options.autoContinueOnPass,
    auto_promote_side_scroller_assets: options.promote,
    attempted_count: steps.length,
    requested_sequence: attemptedIds,
    stopped_at: stoppedAt,
    reason_stopped: stopReason,
    steps,
    output_manifest: "output/manifests/moonpet-side-scroller.generated.json",
    output_dir: "output/moonpets/side-scroller",
    live_game_changed: false
  };
  await writeJson(REPORT_PATH, report);
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runSideScrollerAutopilot(options);
  console.log(`Moonpet side-scroller autopilot: ${report.overall_status}`);
  console.log(`Report: ${relative(REPORT_PATH)}`);
  if (report.reason_stopped) console.log(`Stopped: ${report.reason_stopped}`);
  if (report.overall_status === "fail") process.exitCode = 1;
}

if (require.main === module) {
  main().catch(async (error) => {
    const report = {
      generated_at: new Date().toISOString(),
      overall_status: "fail",
      reason_stopped: error.message,
      steps: []
    };
    await writeJson(REPORT_PATH, report);
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runSideScrollerAutopilot,
  SIDE_SEQUENCE
};
