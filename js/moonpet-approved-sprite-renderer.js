(() => {
  const FEATURE_FLAG = "MOONPET_USE_APPROVED_SPRITES";
  const SUPPORTED_ROLES = ["base_idle", "base_walk", "base_run", "custom_sleep"];
  const FRAME_RATE = 12;

  const state = {
    initialized: false,
    loading: null,
    enabled: false,
    ready: false,
    fallback: true,
    reason: "not initialized",
    errors: [],
    assetsByRole: {}
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
    return getApprovedMoonpetSpriteRendererState();
  }

  async function initApprovedMoonpetSpriteRenderer(options = {}) {
    if (!flagEnabled()) {
      return resetForFallback(`${FEATURE_FLAG} is false`);
    }
    if (!window.MoonpetApprovedAssetLoader) {
      return resetForFallback("MoonpetApprovedAssetLoader is unavailable");
    }
    if (state.loading) return state.loading;

    state.loading = window.MoonpetApprovedAssetLoader
      .loadApprovedMoonpetAssets(options)
      .then((result) => {
        state.initialized = true;
        state.enabled = true;
        state.ready = result.ready;
        state.fallback = !result.ready;
        state.reason = result.ready ? "approved sprites ready" : "approved sprites failed to load";
        state.errors = result.errors || [];
        state.assetsByRole = result.assetsByRole || {};
        state.loading = null;
        return getApprovedMoonpetSpriteRendererState();
      })
      .catch((error) => {
        state.loading = null;
        return resetForFallback("approved sprite renderer initialization failed", [error.message]);
      });

    return state.loading;
  }

  function getApprovedMoonpetSpriteRendererState() {
    return {
      initialized: state.initialized,
      enabled: state.enabled,
      ready: state.ready,
      fallback: state.fallback,
      reason: state.reason,
      errors: [...state.errors],
      assetsByRole: state.assetsByRole
    };
  }

  function frameForTime(asset, time) {
    const frames = asset.frames || [];
    if (!frames.length) return null;
    const timestamp = typeof time === "number" ? time : performance.now();
    const frameMs = 1000 / FRAME_RATE;
    return frames[Math.floor(timestamp / frameMs) % frames.length];
  }

  function renderApprovedMoonpet(ctx, animationRole, x, y, scale = 1, time) {
    if (!flagEnabled()) {
      state.reason = `${FEATURE_FLAG} is false`;
      return false;
    }
    if (!SUPPORTED_ROLES.includes(animationRole)) {
      state.reason = `unsupported approved sprite role: ${animationRole}`;
      return false;
    }
    if (!state.ready) {
      state.reason = state.reason || "approved sprites are not ready";
      return false;
    }

    const asset = state.assetsByRole[animationRole];
    const frame = asset && frameForTime(asset, time);
    if (!asset || !asset.image || !frame) {
      state.reason = `approved sprite asset unavailable for ${animationRole}`;
      return false;
    }

    try {
      const drawScale = Number(scale) || 1;
      const width = frame.w * drawScale;
      const height = frame.h * drawScale;
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
      return true;
    } catch (error) {
      state.reason = `approved sprite render failed: ${error.message}`;
      state.errors = [state.reason, ...state.errors];
      return false;
    }
  }

  window.MOONPET_USE_APPROVED_SPRITES = window.MOONPET_USE_APPROVED_SPRITES === true;
  window.MoonpetApprovedSpriteRenderer = {
    FEATURE_FLAG,
    SUPPORTED_ROLES,
    initApprovedMoonpetSpriteRenderer,
    getApprovedMoonpetSpriteRendererState,
    renderApprovedMoonpet
  };
  window.renderApprovedMoonpet = renderApprovedMoonpet;
})();
