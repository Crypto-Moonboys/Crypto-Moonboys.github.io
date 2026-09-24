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
    if (Array.isArray(options.wearableTraits)) return options.wearableTraits.filter(Boolean);
    if (options.wearableTraitDebug && state.traitConfig && state.traitConfig.sample_trait_id) {
      return [state.traitConfig.sample_trait_id];
    }
    return [];
  }

  function traitById(traitId) {
    const traits = state.traitConfig && Array.isArray(state.traitConfig.traits) ? state.traitConfig.traits : [];
    return traits.find((trait) => trait && trait.id === traitId) || null;
  }

  function anchorForTrait(role, trait) {
    const roleMap = state.traitConfig && state.traitConfig.supported_role_map || {};
    const anchors = roleMap[role] && roleMap[role].anchors || {};
    return anchors[trait.layer] || anchors[trait.category] || null;
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

  function drawWearableTraits(ctx, role, frame, drawX, drawY, width, height, options) {
    if (!state.traitConfig) return [];
    const rendered = [];
    for (const traitId of traitListFromOptions(options)) {
      const trait = traitById(traitId);
      if (!trait) continue;
      if (Array.isArray(trait.supported_roles) && !trait.supported_roles.includes(role)) continue;
      const anchor = anchorForTrait(role, trait);
      if (!anchor) continue;
      if (options.facing === -1 && anchor.mirror_safe === false && trait.mirror_safe !== true) continue;
      const centerX = drawX + width * Number(anchor.x || 0.5);
      const centerY = drawY + height * Number(anchor.y || 0.5);
      const radius = Math.max(5, 12 * (Number(anchor.scale) || 1) * (width / Math.max(1, frame.w)));
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((Number(anchor.rotation) || 0) * Math.PI / 180);
      drawRoundBadge(ctx, radius, trait.visual || {});
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
      const renderedTraits = drawWearableTraits(ctx, role, frame, drawX, drawY, width, height, options);
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
