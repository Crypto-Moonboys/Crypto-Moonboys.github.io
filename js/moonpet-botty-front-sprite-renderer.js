(() => {
  const FEATURE_FLAG = "MOONPET_USE_BOTTY_FRONT_SPRITES";
  const DEFAULT_FRAME_RATE = 12;

  const state = {
    initialized: false,
    loading: null,
    enabled: false,
    ready: false,
    fallback: true,
    reason: "not initialized",
    errors: [],
    manifest: null,
    assetsByRole: {},
    roleMap: {},
    loadedRoles: [],
    lastRender: null
  };

  function flagEnabled() {
    return window[FEATURE_FLAG] !== false;
  }

  function resetForFallback(reason, errors = []) {
    state.initialized = true;
    state.enabled = flagEnabled();
    state.ready = false;
    state.fallback = true;
    state.reason = reason;
    state.errors = errors;
    state.assetsByRole = {};
    state.roleMap = {};
    state.loadedRoles = [];
    state.lastRender = null;
    return getMoonpetBottyFrontRendererState();
  }

  async function initMoonpetBottyFrontRenderer(options = {}) {
    if (!flagEnabled()) return resetForFallback(`${FEATURE_FLAG} is false`);
    if (!window.MoonpetBottyFrontAssetLoader) return resetForFallback("MoonpetBottyFrontAssetLoader is unavailable");
    if (state.loading) return state.loading;

    state.loading = window.MoonpetBottyFrontAssetLoader
      .loadMoonpetBottyFrontAssets(options)
      .then((result) => {
        state.initialized = true;
        state.enabled = true;
        state.ready = result.ready;
        state.fallback = !result.ready;
        state.reason = result.ready ? "BOTTY front sprites ready" : "BOTTY front sprites failed to load";
        state.errors = result.errors || [];
        state.manifest = result.manifest || null;
        state.assetsByRole = result.assetsByRole || {};
        state.roleMap = result.roleMap || {};
        state.loadedRoles = Object.keys(state.assetsByRole);
        state.loading = null;
        return getMoonpetBottyFrontRendererState();
      })
      .catch((error) => {
        state.loading = null;
        return resetForFallback("BOTTY front renderer initialization failed", [error.message]);
      });

    return state.loading;
  }

  function getMoonpetBottyFrontRendererState() {
    return {
      initialized: state.initialized,
      enabled: state.enabled,
      ready: state.ready,
      fallback: state.fallback,
      reason: state.reason,
      errors: [...state.errors],
      manifest: state.manifest,
      assetsByRole: state.assetsByRole,
      roleMap: state.roleMap,
      loadedRoles: [...state.loadedRoles],
      lastRender: state.lastRender
    };
  }

  function roleForAnimationMode(animationMode, active) {
    if (!active) return state.roleMap.idle || "front_idle";
    return state.roleMap[animationMode] || state.roleMap.interact || state.roleMap.idle || "front_idle";
  }

  function frameForTime(asset, time, options = {}) {
    const frames = asset.frames || [];
    if (!frames.length) return null;
    const frameMs = 1000 / Number(asset.fps || DEFAULT_FRAME_RATE);
    const startedAt = Number(options.startedAt || 0);
    const elapsed = Math.max(0, (Number(time) || performance.now()) - (startedAt || 0));
    const index = Math.floor((startedAt ? elapsed : Number(time) || performance.now()) / frameMs);
    if (asset.loop === false || asset.one_shot === true) {
      return frames[Math.min(frames.length - 1, index)];
    }
    return frames[index % frames.length];
  }

  function renderBottyFrontMoonpet(ctx, animationMode, x, y, scale = 1, time, options = {}) {
    if (!flagEnabled()) {
      state.reason = `${FEATURE_FLAG} is false`;
      state.lastRender = { animationMode, role: null, drew: false, reason: state.reason };
      return false;
    }
    if (!state.ready) {
      state.reason = state.reason || "BOTTY front sprites are not ready";
      state.lastRender = { animationMode, role: null, drew: false, reason: state.reason };
      return false;
    }

    const active = options.active !== false;
    const role = roleForAnimationMode(animationMode, active);
    const asset = state.assetsByRole[role];
    const frame = asset && frameForTime(asset, time, options);
    if (!asset || !asset.image || !frame) {
      state.reason = `BOTTY front sprite asset unavailable for ${role}`;
      state.lastRender = { animationMode, role, drew: false, reason: state.reason };
      return false;
    }

    try {
      const drawScale = Math.max(0.45, Math.min(1.05, Number(scale) || 1)) * 0.72;
      const width = frame.w * drawScale;
      const height = frame.h * drawScale;
      const drawX = x - width * 0.5;
      const drawY = y - height * 0.86;
      ctx.save();
      ctx.drawImage(asset.image, frame.x, frame.y, frame.w, frame.h, drawX, drawY, width, height);
      ctx.restore();
      state.reason = `rendered ${role}`;
      state.lastRender = {
        animationMode,
        role,
        frameIndex: frame.index,
        frameCount: asset.frames.length,
        loop: asset.loop !== false && asset.one_shot !== true,
        drew: true,
        reason: state.reason
      };
      return true;
    } catch (error) {
      state.reason = `BOTTY front sprite render failed: ${error.message}`;
      state.errors = [state.reason, ...state.errors];
      state.lastRender = { animationMode, role, drew: false, reason: state.reason };
      return false;
    }
  }

  window.MOONPET_USE_BOTTY_FRONT_SPRITES = window.MOONPET_USE_BOTTY_FRONT_SPRITES !== false;
  window.MoonpetBottyFrontSpriteRenderer = {
    FEATURE_FLAG,
    initMoonpetBottyFrontRenderer,
    getMoonpetBottyFrontRendererState,
    renderBottyFrontMoonpet,
    roleForAnimationMode
  };
})();
