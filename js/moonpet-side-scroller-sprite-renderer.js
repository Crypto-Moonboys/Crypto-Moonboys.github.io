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
    roleMap: {}
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
        state.loading = null;
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
      roleMap: state.roleMap
    };
  }

  function frameForTime(asset, time) {
    const frames = asset.frames || [];
    if (!frames.length) return null;
    const timestamp = typeof time === "number" ? time : performance.now();
    const frameMs = 1000 / FRAME_RATE;
    return frames[Math.floor(timestamp / frameMs) % frames.length];
  }

  function roleForAnimationMode(animationMode, active) {
    const mode = active ? animationMode : "idle";
    const mapping = state.roleMap[mode] || state.roleMap.idle || {};
    return mapping.role || null;
  }

  function renderSideScrollerMoonbot(ctx, animationMode, x, y, scale = 1, time, options = {}) {
    if (!flagEnabled()) {
      state.reason = `${FEATURE_FLAG} is false`;
      return false;
    }
    if (!state.ready) {
      state.reason = state.reason || "side-scroller sprites are not ready";
      return false;
    }

    const role = options.role || roleForAnimationMode(animationMode, options.active !== false);
    if (!role) {
      state.reason = `no approved side-scroller role for ${animationMode}`;
      return false;
    }
    const asset = state.assetsByRole[role];
    const frame = asset && frameForTime(asset, time);
    if (!asset || !asset.image || !frame) {
      state.reason = `side-scroller sprite asset unavailable for ${role}`;
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
      return true;
    } catch (error) {
      state.reason = `side-scroller sprite render failed: ${error.message}`;
      state.errors = [state.reason, ...state.errors];
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
