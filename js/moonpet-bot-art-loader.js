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
    const defaultBot = registry.default_bot || "BOTTY";
    const defaultConfig = registry.bots && registry.bots[defaultBot];
    if (requestedConfig && requestedConfig.status === "complete" && requestedConfig.manifest_path) {
      return { requestedBot, resolvedBot: match[0], config: requestedConfig, fallbackUsed: false, defaultBot, defaultConfig };
    }
    return { requestedBot, resolvedBot: defaultBot, config: defaultConfig, fallbackUsed: true, defaultBot, defaultConfig };
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
    let pack;
    try {
      pack = await loadPack(resolution.resolvedBot, resolution.config);
    } catch (error) {
      if (resolution.resolvedBot === resolution.defaultBot) throw error;
      resolution.resolvedBot = resolution.defaultBot;
      resolution.config = resolution.defaultConfig;
      resolution.fallbackUsed = true;
      pack = await loadPack(resolution.defaultBot, resolution.defaultConfig);
      pack.errors.unshift(`${resolution.requestedBot} pack failed: ${error.message}`);
    }
    if (!pack.ready && resolution.resolvedBot !== resolution.defaultBot) {
      resolution.resolvedBot = resolution.defaultBot;
      resolution.config = resolution.defaultConfig;
      resolution.fallbackUsed = true;
      pack = await loadPack(resolution.defaultBot, resolution.defaultConfig);
    }
    return { registry, ...resolution, ...pack };
  }

  window.MoonpetBotArtLoader = { loadMoonpetBotArt, resolveBot, framesFromAtlas };
})();
