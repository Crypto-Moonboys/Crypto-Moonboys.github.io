const fs = require("node:fs/promises");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const { findSpritesheetIds, collectUrlCandidates, buildLocalAtlas } = require("./generate-moonpet-assets");

const repo = "Crypto-Moonboys/Crypto-Moonboys.github.io";
const branch = "block-topia/lumina-top-down-walk-preview";
const characterId = "cmwriml8w00u1c2zesdafgm48";
const output = "games/block-topia/founder-preview/top-down";
const stateDir = path.join(os.homedir(), ".local/state/block-topia-art");
const statePath = path.join(stateDir, "lumina-top-down-walk-south.json");
const size = 256;
const count = 25;
const sheetSize = { w: 1280, h: 1280 };

async function request(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(60_000)
  }).catch(() => { throw new Error(`${new URL(url).hostname} ${method} failed or timed out.`); });
  if (!response.ok) throw new Error(`${new URL(url).hostname} ${method} returned HTTP ${response.status}.`);
  return response;
}

async function auto(route, body) {
  const response = await request("https://www.autosprite.io/api/v1" + route, {
    method: body ? "POST" : "GET",
    headers: { "x-api-key": process.env.AUTOSPRITE_API_KEY },
    body
  });
  return response.json();
}

async function github(route, body, method = body ? "POST" : "GET") {
  const response = await request(`https://api.github.com/repos/${repo}${route}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json" },
    body
  });
  return response.json();
}

async function save(state) {
  const temp = statePath + ".tmp";
  await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600 });
  await fs.rename(temp, statePath);
}

async function obtainJob() {
  let state;
  try {
    state = JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (state?.jobId) return state.jobId;
  if (state) throw new Error("Previous submission outcome is unknown. Reconcile top_down_walk_south in AutoSprite before allowing another paid request.");
  await auto("/account");
  await save({ submitting: true });
  const submitted = await auto(`/characters/${characterId}/spritesheets`, {
    animations: [{
      kind: "custom",
      name: "top_down_walk_south",
      prompt: "Redraw the supplied Lumina reference for a fixed overhead, top-down 2D pixel-art camera on a square grid. Animate her walking in place facing south, straight toward the bottom edge of the screen. Show the top of her head and shoulders with enough front detail to read her expression and outfit. Use seamless alternating steps, a common foot anchor and a transparent background. Preserve her white smock, red apron, blue boots and compact lantern. Keep the full character visible in every frame."
    }],
    videoTier: "turbo",
    frameCount: count,
    frameSize: size,
    removeBg: "ultra"
  });
  const workflows = submitted.workflows ?? submitted.data?.workflows ?? submitted.result?.workflows;
  const jobId = workflows?.length === 1 && (workflows[0].jobId ?? workflows[0].job_id);
  if (!jobId) throw new Error("AutoSprite did not return exactly one job ID. The submission needs reconciliation.");
  await save({ jobId, spritesheetIds: findSpritesheetIds(submitted) });
  return jobId;
}

async function waitForSheet(jobId) {
  const end = Date.now() + 20 * 60_000;
  while (Date.now() < end) {
    const job = await auto(`/jobs/${encodeURIComponent(jobId)}`);
    const status = String(job.status ?? job.job?.status ?? job.data?.status ?? "").toLowerCase();
    if (["succeeded", "success", "completed", "complete"].includes(status)) {
      const saved = JSON.parse(await fs.readFile(statePath, "utf8"));
      const sheetId = findSpritesheetIds(job)[0] ?? saved.spritesheetIds?.[0];
      return { sheetId, record: sheetId ? await auto(`/spritesheets/${encodeURIComponent(sheetId)}`) : job };
    }
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(`AutoSprite job ${jobId} ended with status ${status}.`);
    }
    await sleep(15_000);
  }
  throw new Error("AutoSprite is still processing. Rerun to resume the saved job.");
}

const preview = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lumina walk preview</title>
<style>
body{background:#121c2b;color:#e6efff;font:1rem system-ui;margin:2rem}
canvas{background:#22334a;image-rendering:pixelated;max-width:100%}
</style>
<h1>Lumina</h1>
<p>Top-down south-facing walk cycle · Block Topia founder preview</p>
<canvas id="sprite" width="256" height="256" aria-label="Lumina walking in place"></canvas>
<p><button id="play" type="button" disabled>Pause animation</button></p>
<p id="status" role="status">Loading sprite sheet…</p>
<script>
const canvas = document.querySelector("#sprite");
const play = document.querySelector("#play");
const status = document.querySelector("#status");
const context = canvas.getContext("2d");
const sheet = new Image();
let frame = 0;
let timer;
function draw() {
  context.clearRect(0, 0, 256, 256);
  context.drawImage(sheet, frame % 5 * 256, Math.floor(frame / 5) * 256, 256, 256, 0, 0, 256, 256);
}
function toggle() {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
    play.textContent = "Play animation";
  } else {
    timer = setInterval(() => { frame = (frame + 1) % 25; draw(); }, 80);
    play.textContent = "Pause animation";
  }
}
sheet.onload = () => {
  draw();
  play.disabled = false;
  status.textContent = "Sprite sheet loaded.";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) play.textContent = "Play animation";
  else toggle();
};
sheet.onerror = () => { status.textContent = "Could not load the sprite sheet."; };
play.onclick = toggle;
sheet.src = "walk-south.png";
</script>
</html>
`;

async function existingPR() {
  const prs = await github(`/pulls?state=all&head=${encodeURIComponent("Crypto-Moonboys:" + branch)}&base=main`);
  return prs[0];
}

async function publish(files) {
  const prior = await existingPR();
  if (prior) return prior.html_url;
  const refs = await github(`/git/matching-refs/heads/${branch}`);
  let commitSha = refs.find(ref => ref.ref === `refs/heads/${branch}`)?.object.sha;
  if (commitSha) {
    const commit = await github(`/git/commits/${commitSha}`);
    if (commit.message !== "Add Lumina top-down south-facing walk preview") {
      throw new Error("The preview branch already exists with a different commit.");
    }
  } else {
    const base = await github("/git/ref/heads/main");
    const parent = await github(`/git/commits/${base.object.sha}`);
    const tree = [];
    for (const [name, bytes] of Object.entries(files)) {
      const blob = await github("/git/blobs", {
        content: Buffer.from(bytes).toString("base64"), encoding: "base64"
      });
      tree.push({ path: `${output}/${name}`, mode: "100644", type: "blob", sha: blob.sha });
    }
    const result = await github("/git/trees", { base_tree: parent.tree.sha, tree });
    const commit = await github("/git/commits", {
      message: "Add Lumina top-down south-facing walk preview", tree: result.sha, parents: [parent.sha]
    });
    commitSha = commit.sha;
    await github("/git/refs", { ref: `refs/heads/${branch}`, sha: commitSha });
  }
  const pr = await github("/pulls", {
    title: "Preview Lumina's top-down south-facing walk cycle",
    head: branch,
    base: "main",
    draft: true,
    body: "Part of #1921. Adds the AutoSprite sheet, grid atlas and isolated Lumina preview. The runner checked the PNG signature, dimensions and transparency support. Browser and visual sprite review are pending. Merge/deploy remains pending GK approval."
  });
  return pr.html_url;
}

function inspectPng(png) {
  if (png.length < 33 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    || png.readUInt32BE(8) !== 13 || png.toString("ascii", 12, 16) !== "IHDR") {
    return { description: "not a PNG with a valid header" };
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const color = png[25];
  let transparency = [4, 6].includes(color);
  // Optimized PNGs can store transparent colors in tRNS instead of an alpha channel.
  for (let offset = 33; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const next = offset + 12 + length;
    if (next > png.length) break;
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT" || type === "IEND") break;
    if (type === "tRNS") {
      transparency ||= (color === 0 && length === 2) || (color === 2 && length === 6)
        || (color === 3 && length > 0 && length <= 256
          && png.subarray(offset + 8, offset + 8 + length).some(alpha => alpha < 255));
    }
    offset = next;
  }
  return {
    valid: width === sheetSize.w && height === sheetSize.h && transparency,
    description: `${width}x${height} PNG (color type ${color}, transparency ${transparency ? "present" : "absent"})`
  };
}

async function downloadSheet(record) {
  const failures = [];
  const tried = new Set();
  for (const target of collectUrlCandidates(record)) {
    if (target.kind !== "png" || new URL(target.url).protocol !== "https:" || tried.has(target.url)) continue;
    tried.add(target.url);
    try {
      const png = Buffer.from(await (await request(target.url)).arrayBuffer());
      const result = inspectPng(png);
      if (result.valid) return png;
      failures.push(result.description);
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(`Expected a transparent ${sheetSize.w}x${sheetSize.h} sprite sheet. Found: ${failures.join("; ") || "no HTTPS PNG candidates"}.`);
}

async function run() {
  for (const key of ["GH_TOKEN", "AUTOSPRITE_API_KEY"]) {
    if (!process.env[key]) throw new Error(`Missing ${key}.`);
  }
  const prior = await existingPR();
  if (prior) {
    console.log(prior.html_url);
    return;
  }
  const jobId = await obtainJob();
  console.log(`AutoSprite job ${jobId}`);
  const { sheetId, record } = await waitForSheet(jobId);
  const png = await downloadSheet(record);
  const atlas = buildLocalAtlas({ frameCount: count, frameSize: size, sheetSize });
  console.log(await publish({
    "index.html": preview,
    "walk-south.png": png,
    "walk-south.json": JSON.stringify(atlas, null, 2) + "\n",
    "provenance.json": JSON.stringify({ character: "Lumina", characterId, jobId, sheetId, view: "top-down", direction: "south", source: "AutoSprite" }, null, 2) + "\n"
  }));
}

async function main() {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const lock = await fs.open(statePath + ".lock", "a", 0o600);
  try {
    // flock locks the inherited file description, which stays open in Node.
    // Keep the inode on disk so concurrent invocations always lock the same file.
    const result = spawnSync("flock", ["-n", "-E", "75", "3"], {
      stdio: ["ignore", "ignore", "pipe", lock.fd]
    });
    if (result.error) throw new Error(`Cannot run flock: ${result.error.message}`);
    if (result.status === 75) throw new Error("Another Block Topia art runner is active.");
    if (result.status !== 0) throw new Error("Could not acquire the Block Topia art runner lock.");
    await run();
  } finally {
    await lock.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
