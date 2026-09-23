(() => {
  const PATHS = {
    registry: "data/moonpet-approved-assets.json",
    sandboxManifest: "output/manifests/moonpet-animation-sandbox.generated.json",
    spritesheetManifest: "output/manifests/moonpet-spritesheets.generated.json",
    sample: "data/moonpet-animation-sandbox.sample.json"
  };

  const state = {
    assets: [],
    players: [],
    speed: 12,
    pausedAll: false,
    filter: "all"
  };

  const grid = document.getElementById("sandbox-grid");
  const template = document.getElementById("asset-card-template");
  const sourceLabel = document.getElementById("manifest-source");
  const speedControl = document.getElementById("speed-control");
  const statusFilter = document.getElementById("status-filter");
  const toggleAll = document.getElementById("toggle-all");

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  function normalizeSize(size) {
    if (!size) return null;
    if (typeof size === "string") {
      const match = size.match(/(\d+)\s*x\s*(\d+)/i);
      return match ? { w: Number(match[1]), h: Number(match[2]) } : null;
    }
    return {
      w: Number(size.w || size.width || 0),
      h: Number(size.h || size.height || 0)
    };
  }

  function approvedLookup(registry) {
    const map = new Map();
    for (const asset of registry.assets || []) {
      map.set(`${asset.character_name}::${asset.animation_kind}`, asset);
    }
    return map;
  }

  function rejectedLookup(registry) {
    const map = new Map();
    for (const asset of registry.rejected || []) {
      map.set(`${asset.character_name}::${asset.animation_kind}`, asset);
    }
    return map;
  }

  function normalizeSandboxAsset(asset, registry) {
    const characterName = asset.character_name || asset.autospriteName || asset.name || "Unknown Moonpet";
    const animationKind = asset.animation_kind || asset.kind || "unknown";
    const approved = approvedLookup(registry).get(`${characterName}::${animationKind}`);
    const rejected = rejectedLookup(registry).get(`${characterName}::${animationKind}`);
    return {
      character_name: characterName,
      source_character_name: asset.source_character_name || characterName,
      animation_kind: animationKind,
      role: (approved && approved.role) || asset.role || (rejected && "rejected_side_scroller_output") || null,
      approved: Boolean(approved || asset.approved),
      rejected: Boolean(rejected || asset.rejected),
      rejection_reason: (rejected && rejected.reason) || asset.rejection_reason || asset.reason || null,
      sheet_path: (approved && approved.sheet_path) || asset.sheet_path || null,
      atlas_path: (approved && approved.atlas_path) || asset.atlas_path || null,
      frame_count: Number(asset.frame_count || asset.frameCount || 0) || null,
      frame_size: Number(asset.frame_size || asset.frameSize || 0) || null,
      sheet_size: normalizeSize(asset.sheet_size || asset.sheetSize),
      created_at: asset.created_at || asset.createdAt || null,
      autosprite_job_id: asset.autosprite_job_id || asset.jobId || null,
      autosprite_spritesheet_id: asset.autosprite_spritesheet_id || asset.spriteSheetId || null
    };
  }

  function fromSpritesheetManifest(manifest, registry) {
    const sheets = manifest.spriteSheets || manifest.spritesheets || [];
    return sheets.map((sheet) => normalizeSandboxAsset(sheet, registry));
  }

  function fromRegistry(registry) {
    return [
      ...(registry.assets || []).map((asset) => normalizeSandboxAsset(asset, registry)),
      ...(registry.rejected || []).map((asset) => normalizeSandboxAsset(asset, registry))
    ];
  }

  async function loadData() {
    const registry = await fetchJson(PATHS.registry);
    const sources = [`registry:${PATHS.registry}`];
    const assetMap = new Map();
    const putAsset = (asset) => {
      const normalized = normalizeSandboxAsset(asset, registry);
      assetMap.set(`${normalized.character_name}::${normalized.animation_kind}`, {
        ...(assetMap.get(`${normalized.character_name}::${normalized.animation_kind}`) || {}),
        ...normalized
      });
    };

    try {
      const sandbox = await fetchJson(PATHS.sandboxManifest);
      sources.push(`sandbox:${PATHS.sandboxManifest}`);
      for (const asset of sandbox.assets || []) putAsset(asset);
    } catch {}

    try {
      const spritesheets = await fetchJson(PATHS.spritesheetManifest);
      sources.push(`spritesheets:${PATHS.spritesheetManifest}`);
      for (const asset of fromSpritesheetManifest(spritesheets, registry)) putAsset(asset);
    } catch {}

    if (assetMap.size > 0) {
      for (const asset of fromRegistry(registry)) {
        const key = `${asset.character_name}::${asset.animation_kind}`;
        if (!assetMap.has(key)) assetMap.set(key, asset);
      }
      return { assets: Array.from(assetMap.values()), sources };
    }

    try {
      const sample = await fetchJson(PATHS.sample);
      sources.push(`sample:${PATHS.sample}`);
      return {
        assets: (sample.assets || []).map((asset) => normalizeSandboxAsset(asset, registry)),
        sources
      };
    } catch {
      try {
        return { assets: fromRegistry(registry), sources };
      } catch {}
    }
  }

  async function loadImage(path) {
    if (!path) return null;
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = path;
    });
  }

  function normalizeFrame(frame, fallbackSize, index) {
    const source = frame.frame || frame;
    const x = Number(source.x || 0);
    const y = Number(source.y || 0);
    const w = Number(source.w || source.width || fallbackSize);
    const h = Number(source.h || source.height || fallbackSize);
    return { x, y, w, h, label: frame.filename || frame.name || String(index + 1) };
  }

  function framesFromAtlas(atlas, fallbackSize) {
    if (!atlas) return [];
    if (Array.isArray(atlas.frames)) {
      return atlas.frames.map((frame, index) => normalizeFrame(frame, fallbackSize, index));
    }
    if (atlas.frames && typeof atlas.frames === "object") {
      return Object.entries(atlas.frames).map(([name, frame], index) =>
        normalizeFrame({ ...frame, filename: name }, fallbackSize, index)
      );
    }
    return [];
  }

  function inferredGridFrames(asset) {
    const count = asset.frame_count || 25;
    const size = asset.frame_size || 256;
    const sheetSize = asset.sheet_size || { w: 1280, h: 1280 };
    const columns = Math.max(1, Math.floor(sheetSize.w / size) || Math.ceil(Math.sqrt(count)));
    return Array.from({ length: count }, (_, index) => ({
      x: (index % columns) * size,
      y: Math.floor(index / columns) * size,
      w: size,
      h: size,
      label: String(index + 1)
    }));
  }

  async function getFrames(asset) {
    if (!asset.atlas_path) return inferredGridFrames(asset);
    try {
      const atlas = await fetchJson(asset.atlas_path);
      const frames = framesFromAtlas(atlas, asset.frame_size || 256);
      return frames.length ? frames : inferredGridFrames(asset);
    } catch {
      return inferredGridFrames(asset);
    }
  }

  function statusFor(asset) {
    if (asset.rejected) return "rejected";
    if (asset.approved) return "approved";
    return "pending";
  }

  function statusLabel(status) {
    if (status === "approved") return "approved";
    if (status === "rejected") return "rejected";
    return "pending review";
  }

  function addMeta(dl, label, value) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value || "none";
    dl.append(dt, dd);
  }

  function drawPlaceholder(ctx, asset, frameIndex) {
    const size = asset.frame_size || 256;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#151a21";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = asset.rejected ? "#ff6370" : asset.approved ? "#38d996" : "#f2c94c";
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, size - 28, size - 28);
    ctx.fillStyle = "#f3f7fb";
    ctx.font = "bold 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(asset.animation_kind, size / 2, 112);
    ctx.fillStyle = "#9aa8b8";
    ctx.font = "14px system-ui";
    ctx.fillText(`frame ${frameIndex + 1}`, size / 2, 140);
    ctx.fillText("sheet pending", size / 2, 164);
  }

  function startPlayer({ canvas, image, frames, asset }) {
    const ctx = canvas.getContext("2d");
    const player = {
      asset,
      canvas,
      frameIndex: 0,
      playing: !asset.rejected,
      lastTick: 0,
      draw(time) {
        const frameMs = 1000 / state.speed;
        if (this.playing && !state.pausedAll && time - this.lastTick >= frameMs) {
          this.frameIndex = (this.frameIndex + 1) % frames.length;
          this.lastTick = time;
        }
        const frame = frames[this.frameIndex] || frames[0];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (image && frame) {
          ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, canvas.width, canvas.height);
        } else {
          drawPlaceholder(ctx, asset, this.frameIndex);
        }
      }
    };
    state.players.push(player);
    return player;
  }

  async function renderAsset(asset) {
    const status = statusFor(asset);
    const card = template.content.firstElementChild.cloneNode(true);
    const canvas = card.querySelector("canvas");
    const title = card.querySelector("h2");
    const badge = card.querySelector(".badge");
    const meta = card.querySelector(".asset-meta");
    const note = card.querySelector(".asset-note");
    const button = card.querySelector(".play-toggle");

    card.dataset.status = status;
    title.textContent = asset.animation_kind;
    badge.textContent = statusLabel(status);
    note.textContent = asset.rejection_reason || (asset.sheet_path ? "Using promoted/static spritesheet output." : "approved metadata found but sprite file missing.");

    const sheetSize = asset.sheet_size ? `${asset.sheet_size.w}x${asset.sheet_size.h}` : "unknown";
    addMeta(meta, "character", asset.character_name);
    addMeta(meta, "role", asset.role || "pending review");
    addMeta(meta, "frames", asset.frame_count);
    addMeta(meta, "frame size", asset.frame_size ? `${asset.frame_size}px` : null);
    addMeta(meta, "sheet size", sheetSize);
    addMeta(meta, "sheet", asset.sheet_path);
    addMeta(meta, "atlas", asset.atlas_path);
    addMeta(meta, "job", asset.autosprite_job_id);

    const image = await loadImage(asset.sheet_path);
    const frames = await getFrames(asset);
    const player = startPlayer({ canvas, image, frames, asset });

    button.textContent = player.playing ? "Pause" : "Play";
    if (asset.sheet_path && !image) {
      note.textContent = "approved metadata found but sprite file missing.";
    }
    button.addEventListener("click", () => {
      player.playing = !player.playing;
      button.textContent = player.playing ? "Pause" : "Play";
    });

    grid.append(card);
  }

  function animationLoop(time) {
    for (const player of state.players) player.draw(time);
    requestAnimationFrame(animationLoop);
  }

  function applyFilter() {
    for (const card of grid.querySelectorAll(".asset-card")) {
      card.classList.toggle("is-hidden", state.filter !== "all" && card.dataset.status !== state.filter);
    }
  }

  function updateSummary() {
    const counts = state.assets.reduce((acc, asset) => {
      acc[statusFor(asset)] += 1;
      return acc;
    }, { approved: 0, pending: 0, rejected: 0 });
    document.getElementById("summary-approved").textContent = `${counts.approved} approved`;
    document.getElementById("summary-pending").textContent = `${counts.pending} pending`;
    document.getElementById("summary-rejected").textContent = `${counts.rejected} rejected`;
  }

  async function init() {
    try {
      const data = await loadData();
      state.assets = data.assets;
      sourceLabel.textContent = data.sources.join(" | ");
      updateSummary();
      for (const asset of state.assets) await renderAsset(asset);
      applyFilter();
      requestAnimationFrame(animationLoop);
    } catch (error) {
      sourceLabel.textContent = error.message;
    }
  }

  speedControl.addEventListener("input", () => {
    state.speed = Number(speedControl.value);
  });

  statusFilter.addEventListener("change", () => {
    state.filter = statusFilter.value;
    applyFilter();
  });

  toggleAll.addEventListener("click", () => {
    state.pausedAll = !state.pausedAll;
    toggleAll.textContent = state.pausedAll ? "Play All" : "Pause All";
  });

  init();
})();
