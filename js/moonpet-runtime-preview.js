(() => {
  const PATHS = {
    registry: "data/moonpet-approved-assets.json",
    generated: "output/manifests/moonpet-animation-sandbox.generated.json",
    sample: "data/moonpet-animation-sandbox.sample.json"
  };

  const ROLE_TO_ANIMATION = {
    base_idle: "iso_idle_down",
    base_walk: "iso_walk_down",
    base_run: "iso_run_down"
  };

  const state = {
    assets: new Map(),
    currentKind: "iso_idle_down",
    currentFrames: [],
    currentImage: null,
    frameIndex: 0,
    lastFrameAt: 0,
    frameRate: 12,
    time: 0,
    source: [],
    renderError: null,
    loadError: null
  };

  const canvas = document.getElementById("runtime-canvas");
  const ctx = canvas.getContext("2d");
  const missingMessage = document.getElementById("missing-message");
  const sourceLine = document.getElementById("data-source");
  const buttons = Array.from(document.querySelectorAll("[data-animation]"));

  function cacheToken(asset) {
    return (asset && asset.promoted_at) || window.MOONPET_COMMIT_HASH || "dev";
  }

  function cacheBustedUrl(path, asset) {
    if (!path) return null;
    if (!asset || !asset.promoted) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(cacheToken(asset))}`;
  }

  async function fetchJson(path, options = {}) {
    const url = options.cacheBust ? cacheBustedUrl(path, options.asset) : path;
    if (options.logLabel) {
      console.info(`[Moonpet runtime preview] fetching ${options.logLabel}`, {
        path,
        url
      });
    }
    const response = await fetch(url, { cache: "no-store" });
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

  function keyFor(characterName, animationKind) {
    return `${characterName}::${animationKind}`;
  }

  function normalizeAsset(asset, registry) {
    const characterName = asset.character_name || asset.autospriteName || asset.name || "MOONBOT PET VISOR V1";
    const animationKind = asset.animation_kind || asset.kind;
    const approved = (registry.assets || []).find((entry) =>
      entry.character_name === characterName && entry.animation_kind === animationKind && entry.approved === true
    );
    const rejected = (registry.rejected || []).find((entry) =>
      entry.character_name === characterName && entry.animation_kind === animationKind && entry.rejected === true
    );

    return {
      character_name: characterName,
      source_character_name: asset.source_character_name || characterName,
      animation_kind: animationKind,
      role: (approved && approved.role) || asset.role || null,
      approved: Boolean(approved || asset.approved),
      rejected: Boolean(rejected || asset.rejected),
      rejection_reason: (rejected && rejected.reason) || asset.rejection_reason || null,
      sheet_path: (approved && approved.sheet_path) || asset.sheet_path || null,
      atlas_path: (approved && approved.atlas_path) || asset.atlas_path || null,
      promoted: Boolean((approved && approved.promoted) || asset.promoted),
      promoted_at: (approved && approved.promoted_at) || asset.promoted_at || null,
      frame_count: Number(asset.frame_count || asset.frameCount || (approved && approved.frame_count) || 0) || null,
      frame_size: Number(asset.frame_size || asset.frameSize || (approved && approved.frame_size) || 0) || null,
      sheet_size: normalizeSize(asset.sheet_size || asset.sheetSize || (approved && approved.sheet_size)),
      autosprite_job_id: asset.autosprite_job_id || asset.jobId || null,
      autosprite_spritesheet_id: asset.autosprite_spritesheet_id || asset.spriteSheetId || null
    };
  }

  async function loadAssets() {
    const registry = await fetchJson(PATHS.registry);
    state.source.push(PATHS.registry);

    let manifest = null;
    try {
      manifest = await fetchJson(PATHS.generated);
      state.source.push(PATHS.generated);
    } catch {
      manifest = await fetchJson(PATHS.sample);
      state.source.push(PATHS.sample);
    }

    const manifestAssets = manifest.assets || [];
    const registryAssets = registry.assets || [];
    for (const asset of [...registryAssets, ...manifestAssets]) {
      const normalized = normalizeAsset(asset, registry);
      if (!normalized.animation_kind || normalized.rejected) continue;
      if (!Object.values(ROLE_TO_ANIMATION).includes(normalized.animation_kind)) continue;
      state.assets.set(keyFor(normalized.character_name, normalized.animation_kind), normalized);
    }

    for (const rejected of registry.rejected || []) {
      if (rejected.animation_kind === "attack") {
        state.source.push("attack rejected");
      }
    }
  }

  function frameFromAtlas(frame, fallbackSize, index) {
    const source = frame.frame || frame;
    return {
      x: Number(source.x || 0),
      y: Number(source.y || 0),
      w: Number(source.w || source.width || fallbackSize),
      h: Number(source.h || source.height || fallbackSize),
      label: frame.filename || frame.name || String(index + 1)
    };
  }

  function framesFromAtlas(atlas, fallbackSize) {
    if (!atlas) return [];
    if (Array.isArray(atlas.frames)) {
      return atlas.frames.map((frame, index) => frameFromAtlas(frame, fallbackSize, index));
    }
    if (atlas.frames && typeof atlas.frames === "object") {
      return Object.entries(atlas.frames).map(([name, frame], index) =>
        frameFromAtlas({ ...frame, filename: name }, fallbackSize, index)
      );
    }
    return [];
  }

  function inferredFrames(asset) {
    const count = asset.frame_count || 25;
    const size = asset.frame_size || 256;
    const sheetSize = asset.sheet_size || { w: 1280, h: 1280 };
    const columns = Math.max(1, Math.floor(sheetSize.w / size) || 5);
    return Array.from({ length: count }, (_, index) => ({
      x: (index % columns) * size,
      y: Math.floor(index / columns) * size,
      w: size,
      h: size,
      label: String(index + 1)
    }));
  }

  async function loadImage(path, asset) {
    if (!path) return { image: null, error: "missing sheet_path", url: null };
    const url = cacheBustedUrl(path, asset);
    console.info("[Moonpet runtime preview] fetching sheet", { path, url });
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ image, error: null, url });
      image.onerror = () => resolve({ image: null, error: `${path} failed to load`, url });
      image.src = url;
    });
  }

  async function loadFrames(asset) {
    if (asset.atlas_path) {
      try {
        const atlas = await fetchJson(asset.atlas_path, {
          asset,
          cacheBust: true,
          logLabel: "atlas"
        });
        const frames = framesFromAtlas(atlas, asset.frame_size || 256);
        if (frames.length) return { frames, error: null };
        if (asset.promoted) return { frames: [], error: `${asset.atlas_path} did not contain renderable frames` };
      } catch (error) {
        if (asset.promoted) return { frames: [], error: error.message };
      }
    }
    if (asset.promoted) return { frames: [], error: "missing atlas_path for promoted asset" };
    return { frames: inferredFrames(asset), error: null };
  }

  function assetFor(kind) {
    for (const asset of state.assets.values()) {
      if (asset.animation_kind === kind && asset.approved && !asset.rejected) return asset;
    }
    return null;
  }

  async function setAnimation(kind) {
    state.currentKind = kind;
    const asset = assetFor(kind);
    state.frameIndex = 0;
    state.currentImage = null;
    state.currentFrames = [];
    state.renderError = null;
    state.loadError = null;

    buttons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.animation === kind);
    });

    if (!asset) {
      missingMessage.textContent = `Missing approved asset for ${kind}. Add it to the registry and generated sandbox manifest before live integration.`;
      updateDebug(null, kind);
      return;
    }

    const frameResult = await loadFrames(asset);
    const imageResult = await loadImage(asset.sheet_path, asset);
    state.currentFrames = frameResult.frames;
    state.currentImage = imageResult.image;
    missingMessage.textContent = "";
    updateDebug(asset, kind);

    if (asset.promoted && asset.sheet_path && imageResult.error) {
      state.loadError = `missing promoted sprite file: ${imageResult.error}`;
      missingMessage.textContent = state.loadError;
    } else if (asset.promoted && asset.atlas_path && frameResult.error) {
      state.loadError = `atlas load error: ${frameResult.error}`;
      missingMessage.textContent = state.loadError;
    } else if (!asset.sheet_path) {
      missingMessage.textContent = "approved metadata found but sprite file missing.";
    }
  }

  function updateDebug(asset, kind) {
    const values = {
      "debug-animation": kind,
      "debug-role": asset ? asset.role : "missing",
      "debug-approved": asset ? String(asset.approved) : "false",
      "debug-frame-count": asset && asset.frame_count ? String(asset.frame_count) : "none",
      "debug-frame-size": asset && asset.frame_size ? `${asset.frame_size}px` : "none",
      "debug-sheet-path": asset && asset.sheet_path ? asset.sheet_path : "none",
      "debug-atlas-path": asset && asset.atlas_path ? asset.atlas_path : "none"
    };
    for (const [id, value] of Object.entries(values)) {
      document.getElementById(id).textContent = value;
    }
  }

  function drawBackground(time) {
    const w = canvas.width;
    const h = canvas.height;
    const pulse = (Math.sin(time / 600) + 1) / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#11182a");
    sky.addColorStop(0.62, "#161422");
    sky.addColorStop(1, "#0b0f16");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = `rgba(93, 225, 255, ${0.18 + pulse * 0.18})`;
    ctx.lineWidth = 2;
    for (let x = -80; x < w + 160; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, 360);
      ctx.lineTo(x + 180, h);
      ctx.stroke();
    }
    for (let y = 372; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#111720";
    ctx.fillRect(0, 378, w, 162);
    ctx.fillStyle = "#1d2633";
    ctx.fillRect(0, 396, w, 8);
    ctx.fillStyle = `rgba(255, 94, 196, ${0.2 + pulse * 0.25})`;
    ctx.fillRect(0, 404, w, 3);

    ctx.fillStyle = "#141b25";
    for (let i = 0; i < 9; i += 1) {
      const x = i * 124 - 24;
      const buildingH = 90 + (i % 4) * 28;
      ctx.fillRect(x, 300 - buildingH, 90, buildingH);
      ctx.fillStyle = i % 2 ? "#5de1ff" : "#ffd166";
      for (let wy = 318 - buildingH; wy < 286; wy += 22) {
        ctx.fillRect(x + 16, wy, 9, 5);
        ctx.fillRect(x + 48, wy + 8, 9, 5);
      }
      ctx.fillStyle = "#141b25";
    }
  }

  function drawPlaceholder(asset, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#f4f8fb";
    ctx.beginPath();
    ctx.ellipse(0, -62, 54, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#10151d";
    ctx.fillRect(-36, -70, 72, 22);
    ctx.fillStyle = "#ff5ec4";
    ctx.fillRect(-18, -63, 36, 5);
    ctx.fillStyle = "#eef4f8";
    ctx.beginPath();
    ctx.ellipse(0, 22, 40, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dfeaf1";
    ctx.fillRect(-52, 8, 24, 46);
    ctx.fillRect(28, 8, 24, 46);
    ctx.fillRect(-38, 62, 34, 18);
    ctx.fillRect(4, 62, 34, 18);
    ctx.fillStyle = "#5de1ff";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(asset ? asset.animation_kind : "missing asset", 0, 106);
    ctx.restore();
  }

  function drawRenderError(asset, x, y, size, message) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(26, 16, 20, 0.92)";
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeStyle = "#ff6370";
    ctx.lineWidth = 4;
    ctx.strokeRect(-size / 2 + 14, -size / 2 + 14, size - 28, size - 28);
    ctx.fillStyle = "#f3f7fb";
    ctx.font = "bold 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("render unavailable", 0, -18);
    ctx.fillStyle = "#ffb3ba";
    ctx.font = "13px system-ui";
    const clipped = message.length > 36 ? `${message.slice(0, 33)}...` : message;
    ctx.fillText(clipped, 0, 12);
    ctx.fillStyle = "#9aa8b8";
    ctx.fillText(asset ? asset.animation_kind : "missing asset", 0, 40);
    ctx.restore();
  }

  function drawMoonbot() {
    const asset = assetFor(state.currentKind);
    const frame = state.currentFrames[state.frameIndex] || state.currentFrames[0];
    const x = 480;
    const y = 292;
    const size = 256;

    ctx.save();
    ctx.shadowColor = "rgba(93, 225, 255, 0.48)";
    ctx.shadowBlur = 24;
    if (state.renderError || (asset && asset.promoted && (!state.currentImage || !frame))) {
      drawRenderError(asset, x, y, size, state.renderError || state.loadError || "promoted asset could not render");
    } else if (state.currentImage && frame) {
      try {
        ctx.drawImage(state.currentImage, frame.x, frame.y, frame.w, frame.h, x - size / 2, y - size / 2, size, size);
      } catch (error) {
        state.renderError = error.message;
        missingMessage.textContent = `render error: ${error.message}`;
        drawRenderError(asset, x, y, size, error.message);
      }
    } else {
      drawPlaceholder(asset, x, y + 44, size);
    }
    ctx.restore();
  }

  function tick(time) {
    state.time = time;
    drawBackground(time);

    const frameMs = 1000 / state.frameRate;
    if (state.currentFrames.length && time - state.lastFrameAt >= frameMs) {
      state.frameIndex = (state.frameIndex + 1) % state.currentFrames.length;
      state.lastFrameAt = time;
    }

    drawMoonbot();
    requestAnimationFrame(tick);
  }

  async function init() {
    try {
      await loadAssets();
      sourceLine.textContent = `Loaded: ${state.source.join(" | ")}`;
      await setAnimation("iso_idle_down");
      requestAnimationFrame(tick);
    } catch (error) {
      sourceLine.textContent = error.message;
      missingMessage.textContent = "Runtime preview could not load its static data files.";
      requestAnimationFrame(tick);
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => setAnimation(button.dataset.animation));
  });

  init();
})();
