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

  function roleForAnimationMode(animationMode, active, options = {}) {
    const mode = active ? animationMode : "idle";
    const mapping = state.roleMap[mode] || state.roleMap.idle || {};
    const primaryRole = availableRole(options.role || mapping.role) || mapping.role || null;
    const variants = Array.isArray(mapping.variants) ? mapping.variants.filter(availableRole) : [];
    if (active && variants.length && options.preferPrimary !== true) {
      const candidates = primaryRole ? [primaryRole, ...variants] : variants;
      return candidates[variantIndex(options, candidates.length)] || primaryRole || null;
    }
    return primaryRole || variants[0] || null;
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
      ctx.save();
      if (options.facing === -1) {
        ctx.translate(x, 0);
        ctx.scale(-1, 1);
        x = 0;
      }
      ctx.drawImage(
        asset.image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        x - width / 2,
        y - height / 2,
        width,
        height
      );
      ctx.restore();
      state.reason = `rendered ${role}`;
      state.lastRender = { animationMode, role, drew: true, reason: state.reason };
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
