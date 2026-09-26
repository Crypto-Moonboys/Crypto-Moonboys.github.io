(() => {
  const REGISTRY_PATH = "/data/moonpet-bot-art-registry.json";
  const FALLBACK_CACHE_VERSION = "20260926-multi-bot-art-v1";
  const packCache = new Map();
  let registryPromise = null;

  function cacheBustedUrl(assetPath, token) {
    if (!assetPath) return null;
    return `${assetPath}${assetPath.includes("?") ? "&" : "?"}v=${encodeURIComponent(token || FALLBACK_CACHE_VERSION)}`;
  }

  async function fetchJson(assetPath, token) {
    const response = await fetch(cacheBustedUrl(assetPath, token), { cache: "no-store" });
    if (!response.ok) throw new Error(`${assetPath} returned HTTP ${response.status}`);
    return response.json();
  }

  function loadImage(assetPath, token) {
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve({ image, error: null });
      image.onerror = () => resolve({ image: null, error: `${assetPath} failed to load` });
      image.src = cacheBustedUrl(assetPath, token);
    });
  }

  function frameFromAtlas(frame, fallbackSize, index) {
    const source = frame.frame || frame;
    return {
      x: Number(source.x || 0), y: Number(source.y || 0),
      w: Number(source.w || source.width || fallbackSize),
      h: Number(source.h || source.height || fallbackSize),
      label: frame.filename || frame.name || String(index), index
    };
  }

  function framesFromAtlas(atlas, fallbackSize) {
    if (Array.isArray(atlas && atlas.frames)) {
      return atlas.frames.map((frame, index) => frameFromAtlas(frame, fallbackSize, index));
    }
    if (atlas && atlas.frames && typeof atlas.frames === "object") {
      return Object.entries(atlas.frames).map(([name, frame], index) =>
        frameFromAtlas({ ...frame, filename: name }, fallbackSize, index));
    }
    return [];
  }

  async function loadAsset(asset, manifest, errors) {
    if (!asset || !asset.role || !asset.png_path || !asset.atlas_path) return null;
    try {
      const token = asset.autosprite && asset.autosprite.spritesheet_id || manifest.cache_version;
      const atlas = await fetchJson(asset.atlas_path, token);
      const frames = framesFromAtlas(atlas, asset.frame_dimensions && asset.frame_dimensions.w || 256);
      if (!frames.length) throw new Error("atlas did not contain frames");
      const imageResult = await loadImage(asset.png_path, token);
      if (imageResult.error) throw new Error(imageResult.error);
      return { role: asset.role, asset: { ...asset, frames, frame_count: frames.length, image: imageResult.image } };
    } catch (error) {
      errors.push(`${manifest.character_name} ${asset.role}: ${error.message}`);
      return null;
    }
  }

  async function loadRegistry() {
    if (!registryPromise) registryPromise = fetchJson(REGISTRY_PATH, FALLBACK_CACHE_VERSION);
    return registryPromise;
  }

  function normalized(value) {
    return String(value || "").trim().toUpperCase();
  }

  function evolutionStageKey(identity = {}) {
    const raw = Number(identity.evolutionStage ?? identity.evolution_stage ?? identity.stage ?? 1);
    const stage = Number.isFinite(raw) ? Math.max(0, Math.min(5, Math.floor(raw))) : 1;
    return `stage_${stage}`;
  }

  function eggRoleForAnimationMode(animationMode, lifecycle = {}) {
    const mode = String(animationMode || "idle").toLowerCase();
    if (["hatch", "evolve"].includes(mode)) return "egg_hatch";
    if (mode === "sleep") return "egg_sleep";
    if (["feed", "clean", "play"].includes(mode)) return "egg_care";
    if (["interact", "greet", "blocked"].includes(mode)) return "egg_react";
    const incubation = lifecycle.incubation || {};
    const progress = Math.max(0, Number(incubation.progress || 0));
    const target = Math.max(1, Number(incubation.target || 12));
    const ratio = progress / target;
    if (ratio >= 0.9) return "egg_crack";
    if (ratio >= 0.66) return "egg_wobble";
    return "egg_idle";
  }

  function artConfig(botConfig, stageKey) {
    const stages = botConfig && botConfig.evolution_art || {};
    const selected = stages[stageKey];
    const base = stages.stage_1 || (botConfig && botConfig.manifest_path ? {
      form: "base", status: botConfig.status, manifest_path: botConfig.manifest_path,
      autosprite_character_id: botConfig.autosprite_character_id
    } : null);
    return { selected, base };
  }

  function packConfig(botConfig, art) {
    return { ...botConfig, manifest_path: art && art.manifest_path, autosprite_character_id: art && art.autosprite_character_id };
  }

  function resolveBot(registry, identity = {}) {
    const speciesId = String(identity.speciesId || identity.species_id || "").trim();
    const displayName = normalized(identity.displayName || identity.speciesName || identity.species_name || identity.botName);
    const entries = Object.entries(registry.bots || {});
    let match = entries.find(([, config]) => (config.canonical_species_ids || []).includes(speciesId));
    if (!match && displayName) {
      match = entries.find(([key, config]) => normalized(key) === displayName || (config.display_names || []).some((name) => normalized(name) === displayName));
    }
    const requestedBot = match ? match[0] : displayName || speciesId || registry.default_bot;
    const requestedConfig = match && match[1];
    const requestedEvolution = evolutionStageKey(identity);
    const defaultBot = registry.default_bot || "BOTTY";
    const defaultConfig = registry.bots && registry.bots[defaultBot];
    const defaultBase = artConfig(defaultConfig, "stage_1").base;
    if (requestedEvolution === "stage_0") {
      const egg = registry.egg_art || {};
      return {
        requestedBot, resolvedBot: egg.character_name || "MOON EGG", config: egg, fallbackUsed: egg.status !== "complete",
        requestedEvolution, resolvedEvolution: "stage_0", evolutionFallbackUsed: false, artKind: "egg",
        baseConfig: null, defaultBot, defaultConfig: packConfig(defaultConfig, defaultBase)
      };
    }
    const street = registry.shared_stages && registry.shared_stages.stage_1;
    if (requestedEvolution === "stage_1" && street && street.status === "complete" && street.manifest_path) {
      return {
        requestedBot, resolvedBot: street.character_name || "WTFBOI", config: street, fallbackUsed: false,
        requestedEvolution, resolvedEvolution: "stage_1", evolutionFallbackUsed: false, artKind: "shared_stage",
        sharedStage: true, baseConfig: null, defaultBot, defaultConfig: packConfig(defaultConfig, defaultBase)
      };
    }
    if (requestedConfig) {
      const requestedArt = artConfig(requestedConfig, requestedEvolution);
      const resolvedArt = requestedArt.selected && requestedArt.selected.status === "complete" && requestedArt.selected.manifest_path
        ? requestedArt.selected : requestedArt.base;
      if (resolvedArt && resolvedArt.status === "complete" && resolvedArt.manifest_path) {
        return {
          requestedBot, resolvedBot: match[0], config: packConfig(requestedConfig, resolvedArt), fallbackUsed: false,
          requestedEvolution, resolvedEvolution: resolvedArt === requestedArt.selected ? requestedEvolution : "stage_1",
          evolutionFallbackUsed: resolvedArt !== requestedArt.selected, baseConfig: packConfig(requestedConfig, requestedArt.base),
          defaultBot, defaultConfig: packConfig(defaultConfig, defaultBase),
          artKind: "identity", streetStagePending: requestedEvolution === "stage_1"
        };
      }
    }
    return {
      requestedBot, resolvedBot: defaultBot, config: packConfig(defaultConfig, defaultBase), fallbackUsed: true,
      requestedEvolution, resolvedEvolution: "stage_1", evolutionFallbackUsed: requestedEvolution !== "stage_1",
      baseConfig: packConfig(defaultConfig, defaultBase), defaultBot, defaultConfig: packConfig(defaultConfig, defaultBase), artKind: "identity"
    };
  }

  function loadPack(botKey, config) {
    if (!config || !config.manifest_path) return Promise.reject(new Error(`${botKey} has no production manifest`));
    const cacheKey = `${botKey}:${config.manifest_path}`;
    if (packCache.has(cacheKey)) return packCache.get(cacheKey);
    const promise = fetchJson(config.manifest_path, FALLBACK_CACHE_VERSION).then(async (manifest) => {
      const errors = [];
      const assetsByRole = {};
      const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
      const idleRole = manifest.runtime_role_map && manifest.runtime_role_map.idle || "front_idle";
      const idleAsset = assets.find((asset) => asset.role === idleRole);
      const idleEntry = idleAsset && await loadAsset(idleAsset, manifest, errors);
      if (idleEntry) assetsByRole[idleEntry.role] = idleEntry.asset;
      const remaining = assets.filter((asset) => asset.role !== idleRole);
      const preload = Promise.all(remaining.map((asset) => loadAsset(asset, manifest, errors))).then((loaded) => {
        for (const entry of loaded) if (entry) assetsByRole[entry.role] = entry.asset;
        return { assetsByRole, errors };
      });
      return {
        ready: Boolean(assetsByRole[idleRole]), manifest, assetsByRole, errors, preload,
        roleMap: manifest.runtime_role_map || {}, display: config.display || {},
        botKey, pendingRoles: remaining.map((asset) => asset.role)
      };
    });
    packCache.set(cacheKey, promise);
    return promise;
  }

  async function loadMoonpetBotArt(identity = {}) {
    const registry = await loadRegistry();
    const resolution = resolveBot(registry, identity);
    if (resolution.artKind === "egg" && (!resolution.config || resolution.config.status !== "complete" || !resolution.config.manifest_path)) {
      return {
        registry, ...resolution, ready: false, manifest: null, assetsByRole: {}, errors: [], pendingRoles: [],
        roleMap: {}, display: resolution.config && resolution.config.display || {}, preload: Promise.resolve()
      };
    }
    let pack;
    try {
      pack = await loadPack(resolution.resolvedBot, resolution.config);
    } catch (error) {
      if (resolution.sharedStage) {
        return {
          registry, ...resolution, ready: false, manifest: null, assetsByRole: {}, errors: [error.message], pendingRoles: [],
          roleMap: {}, display: resolution.config && resolution.config.display || {}, preload: Promise.resolve()
        };
      }
      if (!resolution.fallbackUsed && resolution.resolvedEvolution !== "stage_1") {
        resolution.resolvedEvolution = "stage_1";
        resolution.evolutionFallbackUsed = true;
        resolution.config = resolution.baseConfig;
        try {
          pack = await loadPack(resolution.resolvedBot, resolution.baseConfig);
          pack.errors.unshift(`${resolution.requestedBot} ${resolution.requestedEvolution} pack failed: ${error.message}`);
        } catch (baseError) {
          resolution.resolvedBot = resolution.defaultBot;
          resolution.config = resolution.defaultConfig;
          resolution.fallbackUsed = true;
          pack = await loadPack(resolution.defaultBot, resolution.defaultConfig);
          pack.errors.unshift(`${resolution.requestedBot} base pack failed: ${baseError.message}`);
          pack.errors.unshift(`${resolution.requestedBot} ${resolution.requestedEvolution} pack failed: ${error.message}`);
        }
      } else {
        if (resolution.resolvedBot === resolution.defaultBot) throw error;
        resolution.resolvedBot = resolution.defaultBot;
        resolution.resolvedEvolution = "stage_1";
        resolution.config = resolution.defaultConfig;
        resolution.fallbackUsed = true;
        pack = await loadPack(resolution.defaultBot, resolution.defaultConfig);
        pack.errors.unshift(`${resolution.requestedBot} pack failed: ${error.message}`);
      }
    }
    if (!pack.ready && !resolution.sharedStage && !resolution.fallbackUsed && resolution.resolvedEvolution !== "stage_1") {
      const failedEvolution = resolution.resolvedEvolution;
      resolution.resolvedEvolution = "stage_1";
      resolution.evolutionFallbackUsed = true;
      resolution.config = resolution.baseConfig;
      pack = await loadPack(resolution.resolvedBot, resolution.baseConfig);
      pack.errors.unshift(`${resolution.requestedBot} ${failedEvolution} idle failed to load`);
    }
    if (!pack.ready && !resolution.sharedStage && resolution.resolvedBot !== resolution.defaultBot) {
      resolution.resolvedBot = resolution.defaultBot;
      resolution.config = resolution.defaultConfig;
      resolution.fallbackUsed = true;
      pack = await loadPack(resolution.defaultBot, resolution.defaultConfig);
    }
    return { registry, ...resolution, ...pack };
  }

  window.MoonpetBotArtLoader = { loadMoonpetBotArt, resolveBot, evolutionStageKey, eggRoleForAnimationMode, framesFromAtlas };
})();
