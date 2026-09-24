(() => {
  const FEATURE_FLAG = "MOONPET_USE_SIDE_SCROLLER_SPRITES";
  const FRAME_RATE = 12;

  const state = {
    initialized: false,
    loading: null,
    enabled: false,
    ready: false,
    fallback: true,
    reason: "not initialized",
    errors: [],
    assetsByRole: {},
    roleMap: {},
    traitConfig: null,
    loadedRoles: [],
    pendingRoles: [],
    lastRender: null
  };

  function flagEnabled() {
    return window[FEATURE_FLAG] === true;
  }

  function resetForFallback(reason, errors = []) {
    state.initialized = true;
    state.enabled = flagEnabled();
    state.ready = false;
    state.fallback = true;
    state.reason = reason;
    state.errors = errors;
    state.assetsByRole = {};
    state.traitConfig = null;
    state.loadedRoles = [];
    state.pendingRoles = [];
    state.lastRender = null;
    return getMoonpetSideScrollerRendererState();
  }

  async function initMoonpetSideScrollerRenderer(options = {}) {
    if (!flagEnabled()) return resetForFallback(`${FEATURE_FLAG} is false`);
    if (!window.MoonpetSideScrollerAssetLoader) {
      return resetForFallback("MoonpetSideScrollerAssetLoader is unavailable");
    }
    if (state.loading) return state.loading;

    state.loading = window.MoonpetSideScrollerAssetLoader
      .loadMoonpetSideScrollerAssets(options)
      .then((result) => {
        state.initialized = true;
        state.enabled = true;
        state.ready = result.ready;
        state.fallback = !result.ready;
        state.reason = result.ready ? "side-scroller sprites ready" : "side-scroller sprites failed to load";
        state.errors = result.errors || [];
        state.assetsByRole = result.assetsByRole || {};
        state.roleMap = result.roleMap || {};
        state.traitConfig = result.traitConfig || null;
        state.loadedRoles = Object.keys(state.assetsByRole);
        state.pendingRoles = result.pendingRoles || [];
        state.loading = null;
        if (result.preload && typeof result.preload.then === "function") {
          result.preload.then(() => {
            state.loadedRoles = Object.keys(state.assetsByRole);
            state.pendingRoles = state.pendingRoles.filter((role) => !state.assetsByRole[role]);
            if (state.ready) state.reason = "side-scroller sprites ready";
          });
        }
        return getMoonpetSideScrollerRendererState();
      })
      .catch((error) => {
        state.loading = null;
        return resetForFallback("side-scroller renderer initialization failed", [error.message]);
      });

    return state.loading;
  }

  function getMoonpetSideScrollerRendererState() {
    return {
      initialized: state.initialized,
      enabled: state.enabled,
      ready: state.ready,
      fallback: state.fallback,
      reason: state.reason,
      errors: [...state.errors],
      assetsByRole: state.assetsByRole,
      roleMap: state.roleMap,
      traitConfig: state.traitConfig,
      loadedRoles: [...state.loadedRoles],
      pendingRoles: [...state.pendingRoles],
      lastRender: state.lastRender
    };
  }

  function frameForTime(asset, time) {
    const frames = asset.frames || [];
    if (!frames.length) return null;
    const timestamp = typeof time === "number" ? time : performance.now();
    const frameMs = 1000 / FRAME_RATE;
    return frames[Math.floor(timestamp / frameMs) % frames.length];
  }

  function availableRole(role) {
    return role && state.assetsByRole[role] ? role : null;
  }

  function variantIndex(options, count) {
    if (!count) return -1;
    const seed = Number(options && options.variantSeed || 0);
    const offset = Number(options && options.variantOffset || 0);
    return Math.abs(Math.floor(seed + offset)) % count;
  }

  function variantCadence(mapping) {
    const cadence = Number(mapping && mapping.variant_cadence);
    return Number.isFinite(cadence) && cadence >= 2 ? Math.floor(cadence) : 4;
  }

  function roleForAnimationMode(animationMode, active, options = {}) {
    const mode = active ? animationMode : "idle";
    const mapping = state.roleMap[mode] || state.roleMap.idle || {};
    const primaryRole = availableRole(options.role || mapping.role) || mapping.role || null;
    const variants = Array.isArray(mapping.variants) ? mapping.variants.filter(availableRole) : [];
    if (active && variants.length && options.preferPrimary !== true) {
      if (!primaryRole) return variants[variantIndex(options, variants.length)] || null;
      const seed = Math.abs(Math.floor(Number(options && options.variantSeed || 0)));
      const cadence = variantCadence(mapping);
      if (seed > 0 && seed % cadence === 0) {
        const variantSeed = Math.floor(seed / cadence) + Number(options && options.variantOffset || 0);
        return variants[Math.abs(variantSeed) % variants.length] || primaryRole;
      }
    }
    return primaryRole || variants[0] || null;
  }

  function traitListFromOptions(options) {
    if (typeof options.wearableTraitDebug === "string" && state.traitConfig && state.traitConfig.debug_trait_sets) {
      const selected = state.traitConfig.debug_trait_sets[options.wearableTraitDebug];
      if (Array.isArray(selected)) return selected.filter(Boolean);
    }
    if (options.wearableTraitDebug && state.traitConfig && state.traitConfig.sample_trait_id) {
      return [state.traitConfig.sample_trait_id];
    }
    if (Array.isArray(options.wearableTraits)) return options.wearableTraits.filter(Boolean);
    if (state.traitConfig && state.traitConfig.default_loadout) {
      return Object.values(state.traitConfig.default_loadout).filter(Boolean);
    }
    return [];
  }

  function traitById(traitId) {
    const traits = state.traitConfig && Array.isArray(state.traitConfig.traits) ? state.traitConfig.traits : [];
    return traits.find((trait) => trait && trait.id === traitId) || null;
  }

  function anchorForTrait(role, trait) {
    const roleMap = state.traitConfig && state.traitConfig.supported_role_map || {};
    const fallbackMap = state.traitConfig && state.traitConfig.role_anchor_fallbacks || {};
    const adaptation = fallbackMap[role] || {};
    const sourceRole = roleMap[role] ? role : adaptation.source_role;
    const anchors = roleMap[sourceRole] && roleMap[sourceRole].anchors || {};
    const source = anchors[trait.anchor_key] || anchors[trait.layer] || anchors[trait.category] || null;
    if (!source) return null;
    return Object.assign({}, source, {
      x: Number(source.x || 0.5) + Number(adaptation.offset_x || 0),
      y: Number(source.y || 0.5) + Number(adaptation.offset_y || 0),
      scale: Number(source.scale || 1) * Number(adaptation.scale || 1),
      rotation: Number(source.rotation || 0) + Number(adaptation.rotation || 0),
      quality: adaptation.quality || source.quality
    });
  }

  function layerIndex(trait) {
    const order = state.traitConfig && Array.isArray(state.traitConfig.layer_order) ? state.traitConfig.layer_order : [];
    const index = order.indexOf(trait.layer);
    return index >= 0 ? index : order.length + Number(trait.z_index || 0);
  }

  function wearablePhase(trait) {
    return trait.layer === "aura_back" || trait.layer === "backpack" ? "behind" : "front";
  }

  function drawRoundBadge(ctx, radius, visual) {
    const fill = visual && visual.fill || "#31dfff";
    const accent = visual && visual.accent || "#ff4fc8";
    const outline = visual && visual.outline || "#061025";
    ctx.save();
    ctx.shadowColor = visual && visual.glow || "rgba(49, 223, 255, 0.65)";
    ctx.shadowBlur = radius * 1.5;
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, radius * 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = Math.max(1, radius * 0.1);
    ctx.beginPath();
    ctx.arc(-radius * 0.18, -radius * 0.2, radius * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCap(ctx, radius, visual) {
    const fill = visual && visual.fill || "#3fe7ff";
    const accent = visual && visual.accent || "#ff4fc8";
    const outline = visual && visual.outline || "#061025";
    ctx.save();
    ctx.shadowColor = visual && visual.glow || "rgba(63, 231, 255, 0.45)";
    ctx.shadowBlur = radius;
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, radius * 0.16);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.15, radius * 0.55, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(radius * 0.58, radius * 0.08, radius * 0.62, radius * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawGlasses(ctx, radius, visual) {
    const fill = visual && visual.fill || "#10162f";
    const accent = visual && visual.accent || "#8affff";
    const outline = visual && visual.outline || "#061025";
    ctx.save();
    ctx.shadowColor = visual && visual.glow || "rgba(138, 255, 255, 0.55)";
    ctx.shadowBlur = radius * 0.9;
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, radius * 0.14);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(side * radius * 0.42 - radius * 0.34, -radius * 0.22, radius * 0.68, radius * 0.44, radius * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillRect(side * radius * 0.42 - radius * 0.24, -radius * 0.05, radius * 0.48, radius * 0.08);
      ctx.fillStyle = fill;
    }
    ctx.beginPath();
    ctx.moveTo(-radius * 0.1, 0);
    ctx.lineTo(radius * 0.1, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawJetpack(ctx, radius, visual) {
    const fill = visual && visual.fill || "#4d5bff";
    const accent = visual && visual.accent || "#ffd447";
    const outline = visual && visual.outline || "#061025";
    ctx.save();
    ctx.shadowColor = visual && visual.glow || "rgba(255, 212, 71, 0.45)";
    ctx.shadowBlur = radius;
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, radius * 0.14);
    ctx.beginPath();
    ctx.roundRect(-radius * 0.42, -radius * 0.68, radius * 0.84, radius * 1.22, radius * 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(-radius * 0.22, radius * 0.5, radius * 0.16, radius * 0.38);
    ctx.fillRect(radius * 0.06, radius * 0.5, radius * 0.16, radius * 0.38);
    ctx.restore();
  }

  function drawWrench(ctx, radius, visual) {
    const fill = visual && visual.fill || "#d7f2ff";
    const accent = visual && visual.accent || "#ff4fc8";
    const outline = visual && visual.outline || "#061025";
    ctx.save();
    ctx.strokeStyle = outline;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(5, radius * 0.26);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.45, radius * 0.48);
    ctx.lineTo(radius * 0.36, -radius * 0.34);
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = Math.max(3, radius * 0.14);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.45, radius * 0.48);
    ctx.lineTo(radius * 0.36, -radius * 0.34);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, radius * 0.12);
    ctx.beginPath();
    ctx.arc(radius * 0.46, -radius * 0.44, radius * 0.28, Math.PI * 0.15, Math.PI * 1.55);
    ctx.stroke();
    ctx.restore();
  }

  function drawAura(ctx, radius, visual) {
    const fill = visual && visual.fill || "rgba(63, 231, 255, 0.16)";
    const accent = visual && visual.accent || "#ffd447";
    const outline = visual && visual.outline || "rgba(138, 255, 255, 0.78)";
    ctx.save();
    ctx.shadowColor = visual && visual.glow || "rgba(63, 231, 255, 0.7)";
    ctx.shadowBlur = radius * 0.9;
    ctx.fillStyle = fill;
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.65, radius * 2.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, radius * 0.05);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.9, -radius * 0.8);
    ctx.lineTo(-radius * 0.55, -radius * 0.35);
    ctx.lineTo(-radius * 0.78, -radius * 0.32);
    ctx.moveTo(radius * 0.85, radius * 0.65);
    ctx.lineTo(radius * 0.48, radius * 0.28);
    ctx.lineTo(radius * 0.72, radius * 0.23);
    ctx.stroke();
    ctx.restore();
  }

  function drawWearableVisual(ctx, radius, trait) {
    const visual = trait.visual || {};
    switch (visual.type) {
      case "runtime_vector_cap":
        drawCap(ctx, radius, visual);
        return;
      case "runtime_vector_glasses":
        drawGlasses(ctx, radius, visual);
        return;
      case "runtime_vector_jetpack":
        drawJetpack(ctx, radius, visual);
        return;
      case "runtime_vector_wrench":
        drawWrench(ctx, radius, visual);
        return;
      case "runtime_vector_aura":
        drawAura(ctx, radius, visual);
        return;
      default:
        drawRoundBadge(ctx, radius, visual);
    }
  }

  function drawBitmapWearable(ctx, role, frame, drawX, drawY, width, height, trait, options) {
    const visual = trait.visual || {};
    const fit = visual.pose_fits && visual.pose_fits[role];
    const frameIndex = Number(frame.index || 0) % Math.max(1, (fit && fit.frame_centers_x || []).length);
    const fittedAssetKey = fit && Array.isArray(fit.frame_assets) ? fit.frame_assets[frameIndex] : fit && fit.asset;
    const cancelSceneMirror = options.facing === -1;
    const assetKey = cancelSceneMirror && visual.opposite_assets
      ? visual.opposite_assets[fittedAssetKey] || fittedAssetKey
      : fittedAssetKey;
    const image = fit && visual.images && visual.images[assetKey];
    if (!fit || !image) return false;
    const geometry = visual.asset_geometry && visual.asset_geometry[assetKey] || fit;
    const centerX = Number((fit.frame_centers_x || [])[frameIndex]);
    const headTop = Number((fit.frame_head_tops || [])[frameIndex]);
    if (!Number.isFinite(centerX) || !Number.isFinite(headTop)) return false;
    const headWidth = Number((fit.frame_head_widths || [])[frameIndex]);
    const frameWidthFactor = Number((fit.frame_width_factors || [])[frameIndex]);
    const targetWidth = Number.isFinite(headWidth)
      ? width * headWidth * (Number.isFinite(frameWidthFactor) ? frameWidthFactor : Number(fit.width_factor || 1))
      : width * Number(fit.width || 0);
    const targetHeight = targetWidth * Number(geometry.height_ratio || fit.height_ratio || 1);
    const centerRatio = Number(geometry.center_ratio == null ? fit.center_ratio == null ? 0.5 : fit.center_ratio : geometry.center_ratio);
    const headX = drawX + width * centerX;
    const headY = geometry.top_mode === "head_overlap"
      ? drawY + height * headTop
      : drawY + height * (headTop + Number(fit.brim_offset || geometry.brim_offset || 0));
    const anchorY = geometry.top_mode === "head_overlap" ? Number(geometry.top_overlap || fit.top_overlap || 0) : 1;
    const fittedRotation = Number((fit.frame_rotations || [])[frameIndex] || 0);
    const rotation = cancelSceneMirror ? -fittedRotation : fittedRotation;
    ctx.save();
    ctx.translate(headX, headY);
    if (cancelSceneMirror) ctx.scale(-1, 1);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(image, -targetWidth * centerRatio, -targetHeight * anchorY, targetWidth, targetHeight);
    ctx.restore();
    return true;
  }

  function drawWearableTraits(ctx, role, frame, drawX, drawY, width, height, options, phase = "front") {
    if (!state.traitConfig) return [];
    const traits = traitListFromOptions(options)
      .map(traitById)
      .filter((trait) => trait && wearablePhase(trait) === phase)
      .sort((a, b) => layerIndex(a) - layerIndex(b));
    const rendered = [];
    for (const trait of traits) {
      if (Array.isArray(trait.supported_roles) && !trait.supported_roles.includes(role)) continue;
      if (Array.isArray(trait.blocked_roles) && trait.blocked_roles.includes(role)) continue;
      if (trait.visual && trait.visual.type === "runtime_bitmap") {
        if (drawBitmapWearable(ctx, role, frame, drawX, drawY, width, height, trait, options)) rendered.push(trait.id);
        continue;
      }
      const anchor = anchorForTrait(role, trait);
      if (!anchor) continue;
      if (options.facing === -1 && anchor.mirror_safe === false && trait.mirror_safe !== true) continue;
      const centerX = drawX + width * Number(anchor.x || 0.5);
      const centerY = drawY + height * Number(anchor.y || 0.5);
      const radius = Math.max(5, 12 * (Number(anchor.scale) || 1) * (width / Math.max(1, frame.w)));
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((Number(anchor.rotation) || 0) * Math.PI / 180);
      drawWearableVisual(ctx, radius, trait);
      ctx.restore();
      rendered.push(trait.id);
    }
    return rendered;
  }

  function renderSideScrollerMoonbot(ctx, animationMode, x, y, scale = 1, time, options = {}) {
    if (!flagEnabled()) {
      state.reason = `${FEATURE_FLAG} is false`;
      state.lastRender = { animationMode, role: null, drew: false, reason: state.reason };
      return false;
    }
    if (!state.ready) {
      state.reason = state.reason || "side-scroller sprites are not ready";
      state.lastRender = { animationMode, role: null, drew: false, reason: state.reason };
      return false;
    }

    const role = roleForAnimationMode(animationMode, options.active !== false, options);
    if (!role) {
      state.reason = `no approved side-scroller role for ${animationMode}`;
      state.lastRender = { animationMode, role: null, drew: false, reason: state.reason };
      return false;
    }
    const asset = state.assetsByRole[role];
    const frame = asset && frameForTime(asset, time);
    if (!asset || !asset.image || !frame) {
      state.reason = `side-scroller sprite asset unavailable for ${role}`;
      state.lastRender = { animationMode, role, drew: false, reason: state.reason };
      return false;
    }

    try {
      const drawScale = Number(scale) || 1;
      const width = frame.w * drawScale;
      const height = frame.h * drawScale;
      let drawX = x - width / 2;
      const drawY = y - height / 2;
      ctx.save();
      if (options.facing === -1) {
        ctx.translate(x, 0);
        ctx.scale(-1, 1);
        x = 0;
        drawX = x - width / 2;
      }
      const behindTraits = drawWearableTraits(ctx, role, frame, drawX, drawY, width, height, options, "behind");
      ctx.drawImage(
        asset.image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        drawX,
        drawY,
        width,
        height
      );
      const frontTraits = drawWearableTraits(ctx, role, frame, drawX, drawY, width, height, options, "front");
      const renderedTraits = [...behindTraits, ...frontTraits];
      ctx.restore();
      state.reason = `rendered ${role}`;
      state.lastRender = { animationMode, role, drew: true, reason: state.reason, wearableTraits: renderedTraits };
      return true;
    } catch (error) {
      state.reason = `side-scroller sprite render failed: ${error.message}`;
      state.errors = [state.reason, ...state.errors];
      state.lastRender = { animationMode, role, drew: false, reason: state.reason };
      return false;
    }
  }

  window.MOONPET_USE_SIDE_SCROLLER_SPRITES = window.MOONPET_USE_SIDE_SCROLLER_SPRITES === true;
  window.MoonpetSideScrollerSpriteRenderer = {
    FEATURE_FLAG,
    initMoonpetSideScrollerRenderer,
    getMoonpetSideScrollerRendererState,
    renderSideScrollerMoonbot,
    roleForAnimationMode
  };
  window.renderSideScrollerMoonbot = renderSideScrollerMoonbot;
})();
