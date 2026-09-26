(() => {
  const FEATURE_FLAG = "MOONPET_USE_BOT_ART";
  const DEFAULT_FRAME_RATE = 12;
  let selectionGeneration = 0;
  const state = {
    initialized: false, enabled: false, ready: false, reason: "not initialized", errors: [],
    identityKey: "", requestedBot: null, resolvedBot: null, fallbackUsed: false,
    requestedEvolution: "stage_1", resolvedEvolution: "stage_1", evolutionFallbackUsed: false, manifest: null,
    assetsByRole: {}, roleMap: {}, display: {}, pendingRoles: [], lastRender: null
  };

  function enabled() { return window[FEATURE_FLAG] !== false; }

  function snapshot() {
    const loadedRoles = Object.keys(state.assetsByRole);
    return {
      initialized: state.initialized, enabled: state.enabled, ready: state.ready,
      reason: state.reason, errors: [...state.errors], requestedBot: state.requestedBot,
      resolvedBot: state.resolvedBot, fallbackUsed: state.fallbackUsed, manifest: state.manifest,
      requestedEvolution: state.requestedEvolution, resolvedEvolution: state.resolvedEvolution,
      evolutionFallbackUsed: state.evolutionFallbackUsed,
      assetsByRole: state.assetsByRole, roleMap: state.roleMap, display: state.display,
      loadedRoles, pendingRoles: state.pendingRoles.filter((role) => !state.assetsByRole[role]),
      lastRender: state.lastRender
    };
  }

  async function selectMoonpetBot(identity = {}) {
    const identityKey = `${identity.speciesId || identity.species_id || ""}|${identity.speciesName || identity.species_name || identity.displayName || ""}|${identity.evolutionStage ?? identity.evolution_stage ?? identity.stage ?? 1}`;
    if (state.ready && state.identityKey === identityKey) return snapshot();
    const generation = ++selectionGeneration;
    state.initialized = true;
    state.enabled = enabled();
    state.ready = false;
    state.reason = enabled() ? "loading selected bot idle" : `${FEATURE_FLAG} is false`;
    state.errors = [];
    state.assetsByRole = {};
    state.roleMap = {};
    state.pendingRoles = [];
    state.lastRender = null;
    state.identityKey = identityKey;
    if (!enabled()) return snapshot();
    if (!window.MoonpetBotArtLoader) {
      state.reason = "MoonpetBotArtLoader is unavailable";
      return snapshot();
    }
    try {
      const result = await window.MoonpetBotArtLoader.loadMoonpetBotArt(identity);
      if (generation !== selectionGeneration) return snapshot();
      state.ready = result.ready;
      state.requestedBot = result.requestedBot;
      state.resolvedBot = result.resolvedBot;
      state.fallbackUsed = result.fallbackUsed;
      state.requestedEvolution = result.requestedEvolution || "stage_1";
      state.resolvedEvolution = result.resolvedEvolution || "stage_1";
      state.evolutionFallbackUsed = Boolean(result.evolutionFallbackUsed);
      state.manifest = result.manifest;
      state.assetsByRole = result.assetsByRole || {};
      state.roleMap = result.roleMap || {};
      state.display = result.display || {};
      state.pendingRoles = result.pendingRoles || [];
      state.errors = result.errors || [];
      state.reason = result.ready ? `${result.resolvedBot} ${state.resolvedEvolution} idle ready` : `${result.resolvedBot} idle failed to load`;
      if (result.preload && typeof result.preload.then === "function") {
        result.preload.then(() => {
          if (generation === selectionGeneration) state.reason = `${state.resolvedBot} pack ready`;
        }).catch((error) => {
          if (generation === selectionGeneration) state.errors = [error.message, ...state.errors];
        });
      }
    } catch (error) {
      if (generation === selectionGeneration) {
        state.ready = false;
        state.reason = `bot art selection failed: ${error.message}`;
        state.errors = [error.message];
      }
    }
    return snapshot();
  }

  function roleForAnimationMode(animationMode, active) {
    if (!active) return state.roleMap.idle || "front_idle";
    return state.roleMap[animationMode] || state.roleMap.interact || state.roleMap.idle || "front_idle";
  }

  function frameForTime(asset, time, options = {}) {
    const frames = asset.frames || [];
    if (!frames.length) return null;
    const frameMs = 1000 / Number(asset.fps || DEFAULT_FRAME_RATE);
    const now = Number(time) || performance.now();
    const startedAt = Number(options.startedAt || 0);
    const index = Math.floor(Math.max(0, startedAt ? now - startedAt : now) / frameMs);
    if (asset.loop === false || asset.one_shot === true) return frames[Math.min(frames.length - 1, index)];
    return frames[index % frames.length];
  }

  function renderMoonpetBot(ctx, animationMode, x, y, scale = 1, time, options = {}) {
    if (!enabled() || !state.ready) return false;
    const requestedRole = roleForAnimationMode(animationMode, options.active !== false);
    const idleRole = state.roleMap.idle || "front_idle";
    const role = state.assetsByRole[requestedRole] ? requestedRole : idleRole;
    const asset = state.assetsByRole[role];
    const frame = asset && frameForTime(asset, time, options);
    if (!asset || !asset.image || !frame) return false;
    const packScale = Number(state.display.scale || 0.72);
    const pivotY = Number(state.display.pivot_y || 0.86);
    const drawScale = Math.max(0.45, Math.min(1.05, Number(scale) || 1)) * packScale;
    const width = frame.w * drawScale;
    const height = frame.h * drawScale;
    ctx.save();
    ctx.drawImage(asset.image, frame.x, frame.y, frame.w, frame.h, x - width * 0.5, y - height * pivotY, width, height);
    ctx.restore();
    state.lastRender = {
      requestedBot: state.requestedBot, resolvedBot: state.resolvedBot, fallbackUsed: state.fallbackUsed,
      requestedEvolution: state.requestedEvolution, resolvedEvolution: state.resolvedEvolution,
      evolutionFallbackUsed: state.evolutionFallbackUsed,
      animationMode, requestedRole, role, frameIndex: frame.index, frameCount: asset.frames.length,
      loop: asset.loop !== false && asset.one_shot !== true, drew: true
    };
    return true;
  }

  window.MOONPET_USE_BOT_ART = window.MOONPET_USE_BOT_ART !== false;
  window.MoonpetBotArtRenderer = {
    FEATURE_FLAG, selectMoonpetBot, initMoonpetBotArtRenderer: selectMoonpetBot,
    getMoonpetBotArtRendererState: snapshot, renderMoonpetBot, roleForAnimationMode
  };
})();
