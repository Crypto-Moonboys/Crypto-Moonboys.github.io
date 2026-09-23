(() => {
  const ANIMATION_TO_ROLE = {
    iso_idle_down: "base_idle",
    iso_walk_down: "base_walk",
    iso_run_down: "base_run"
  };

  const state = {
    currentKind: "iso_idle_down",
    currentRole: "base_idle",
    rendererState: null
  };

  const canvas = document.getElementById("runtime-canvas");
  const ctx = canvas.getContext("2d");
  const missingMessage = document.getElementById("missing-message");
  const sourceLine = document.getElementById("data-source");
  const buttons = Array.from(document.querySelectorAll("[data-animation]"));

  function rendererApi() {
    return window.MoonpetApprovedSpriteRenderer || null;
  }

  function assetForCurrentRole() {
    return state.rendererState &&
      state.rendererState.assetsByRole &&
      state.rendererState.assetsByRole[state.currentRole]
      ? state.rendererState.assetsByRole[state.currentRole]
      : null;
  }

  function setStatusMessage() {
    if (!state.rendererState) {
      missingMessage.textContent = "Approved sprite renderer has not initialized.";
      return;
    }
    if (state.rendererState.ready) {
      missingMessage.textContent = "";
      return;
    }
    const details = state.rendererState.errors && state.rendererState.errors.length
      ? ` ${state.rendererState.errors.join(" | ")}`
      : "";
    missingMessage.textContent = `${state.rendererState.reason}.${details}`;
  }

  function updateDebug() {
    const asset = assetForCurrentRole();
    const values = {
      "debug-animation": state.currentKind,
      "debug-role": asset ? asset.role : state.currentRole,
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

  function setAnimation(kind) {
    state.currentKind = kind;
    state.currentRole = ANIMATION_TO_ROLE[kind] || "missing";
    buttons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.animation === kind);
    });
    updateDebug();
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

  function drawFallbackMoonbot(x, y) {
    ctx.save();
    ctx.translate(x, y + 44);
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
    ctx.fillText("fallback renderer", 0, 106);
    ctx.restore();
  }

  function drawMoonbot(time) {
    const renderer = rendererApi();
    const x = 480;
    const y = 292;
    const drewSprite = renderer
      ? renderer.renderApprovedMoonpet(ctx, state.currentRole, x, y, 1, time)
      : false;

    if (!drewSprite) {
      state.rendererState = renderer ? renderer.getApprovedMoonpetSpriteRendererState() : state.rendererState;
      setStatusMessage();
      drawFallbackMoonbot(x, y);
      return;
    }

    if (missingMessage.textContent) missingMessage.textContent = "";
  }

  function tick(time) {
    drawBackground(time);
    drawMoonbot(time);
    requestAnimationFrame(tick);
  }

  async function init() {
    const renderer = rendererApi();
    if (!renderer) {
      sourceLine.textContent = "Approved sprite renderer script missing.";
      missingMessage.textContent = "Runtime preview could not load the approved sprite renderer.";
      updateDebug();
      requestAnimationFrame(tick);
      return;
    }

    state.rendererState = await renderer.initApprovedMoonpetSpriteRenderer();
    sourceLine.textContent = `Renderer: ${state.rendererState.reason}`;
    if (state.rendererState.errors.length) {
      sourceLine.textContent += ` | ${state.rendererState.errors.join(" | ")}`;
    }
    setAnimation("iso_idle_down");
    setStatusMessage();
    requestAnimationFrame(tick);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => setAnimation(button.dataset.animation));
  });

  init();
})();
