(() => {
  const DEFAULT_REGISTRY_PATH = "data/moonpet-side-scroller-approved-assets.json";
  const DEFAULT_WEARABLE_TRAITS_PATH = "data/moonpet-wearable-traits.json";
  const DEFAULT_FRAME_ANCHORS_PATH = "data/moonpet-frame-anchors.json";
  const CACHE_VERSION = "20260925-moonbot-anchor-category-proof-v17";
  const PRIORITY_ROLES = new Set(["side_idle", "side_walk", "side_run"]);

  function cacheToken(asset) {
    return asset && (asset.promoted_at || asset.updated_at || asset.version) || window.MOONPET_COMMIT_HASH || CACHE_VERSION;
  }

  function cacheBustedUrl(path, asset) {
    if (!path) return null;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(cacheToken(asset))}`;
  }

  async function fetchJson(path, asset) {
    const url = cacheBustedUrl(path, asset);
    console.info("[Moonpet side-scroller loader] fetching JSON", { path, url });
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  function frameFromAtlas(frame, fallbackSize, index) {
    const source = frame.frame || frame;
    return {
      x: Number(source.x || 0),
      y: Number(source.y || 0),
      w: Number(source.w || source.width || fallbackSize),
      h: Number(source.h || source.height || fallbackSize),
      label: frame.filename || frame.name || String(index),
      index
    };
  }

  function framesFromAtlas(atlas, fallbackSize) {
    if (!atlas) return [];
    if (Array.isArray(atlas.frames)) {
      return atlas.frames.map((frame, index) => frameFromAtlas(frame, fallbackSize, index));
    }
    if (atlas.frames && typeof atlas.frames === "object") {
      return Object.entries(atlas.frames).map(([name, frame], index) =>
        frameFromAtlas({ ...frame, filename: name }, fallbackSize, index)
      );
    }
    return [];
  }

  function loadImage(path, asset) {
    const url = cacheBustedUrl(path, asset);
    console.info("[Moonpet side-scroller loader] fetching sheet", { path, url });
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve({ image, error: null, url });
      image.onerror = () => resolve({ image: null, error: `${path} failed to load`, url });
      image.src = url;
    });
  }

  async function loadAsset(asset, errors) {
    if (!asset.role || !asset.sheet_path || !asset.atlas_path) {
      errors.push(`Side asset ${asset.id || "unknown"} is missing role/sheet/atlas path`);
      return null;
    }
    try {
      const atlas = await fetchJson(asset.atlas_path, asset);
      const frames = framesFromAtlas(atlas, asset.frame_size || 256);
      if (!frames.length) {
        errors.push(`Side asset ${asset.role} atlas did not contain frames`);
        return null;
      }
      const imageResult = await loadImage(asset.sheet_path, asset);
      if (imageResult.error) {
        errors.push(`Side asset ${asset.role} sheet failed: ${imageResult.error}`);
        return null;
      }
      return {
        role: asset.role,
        asset: {
          ...asset,
          frames,
          image: imageResult.image,
          sheet_url: imageResult.url
        }
      };
    } catch (error) {
      errors.push(`Side asset ${asset.role || asset.id} failed to load: ${error.message}`);
      return null;
    }
  }

  async function loadAssetGroup(assets, errors, assetsByRole) {
    const loaded = await Promise.all(assets.map((asset) => loadAsset(asset, errors)));
    for (const entry of loaded) {
      if (entry && entry.role) assetsByRole[entry.role] = entry.asset;
    }
    return loaded.filter(Boolean).length;
  }

  async function loadWearableTraitConfig(registry, errors) {
    const configPath = registry && registry.wearable_traits && registry.wearable_traits.config_path || DEFAULT_WEARABLE_TRAITS_PATH;
    try {
      const config = await fetchJson(configPath, { version: CACHE_VERSION });
      const imageCache = {};
      const bitmapTraits = (config.traits || []).filter((trait) => trait && trait.visual && trait.visual.type === "runtime_bitmap");
      await Promise.all(bitmapTraits.flatMap((trait) => Object.entries(trait.visual.assets || {}).map(async ([key, path]) => {
        if (!imageCache[path]) imageCache[path] = loadImage(path, { version: CACHE_VERSION });
        const result = await imageCache[path];
        if (result.error) {
          errors.push(`Wearable ${trait.id} asset ${key} skipped: ${result.error}`);
          return;
        }
        trait.visual.images = trait.visual.images || {};
        trait.visual.images[key] = result.image;
      })));
      return config;
    } catch (error) {
      errors.push(`Wearable trait config skipped: ${error.message}`);
      return null;
    }
  }

  async function loadFrameAnchors(registry, errors) {
    const configPath = registry && registry.frame_anchors && registry.frame_anchors.config_path || DEFAULT_FRAME_ANCHORS_PATH;
    try {
      return await fetchJson(configPath, { version: CACHE_VERSION });
    } catch (error) {
      errors.push(`Moonbot frame anchors skipped: ${error.message}`);
      return null;
    }
  }

  async function loadMoonpetSideScrollerAssets(options = {}) {
    const registryPath = options.registryPath || DEFAULT_REGISTRY_PATH;
    const errors = [];
    const assetsByRole = {};
    const registry = await fetchJson(registryPath);
    const roleMap = registry.runtime_role_map || {};
    const approvedAssets = (registry.assets || []).filter((asset) =>
      asset.approved === true && asset.promoted === true && !asset.rejected
    );
    const [traitConfig, frameAnchors] = await Promise.all([
      loadWearableTraitConfig(registry, errors),
      loadFrameAnchors(registry, errors)
    ]);
    const priorityAssets = approvedAssets.filter((asset) => PRIORITY_ROLES.has(asset.role));
    const secondaryAssets = approvedAssets.filter((asset) => !PRIORITY_ROLES.has(asset.role));

    await loadAssetGroup(priorityAssets.length ? priorityAssets : approvedAssets.slice(0, 1), errors, assetsByRole);
    const preload = loadAssetGroup(secondaryAssets, errors, assetsByRole).then((count) => {
      console.info("[Moonpet side-scroller loader] background assets loaded", {
        count,
        roles: Object.keys(assetsByRole)
      });
      return { count, assetsByRole, errors };
    });

    return {
      ready: Boolean(Object.keys(assetsByRole).length),
      registryPath,
      assetsByRole,
      roleMap,
      traitConfig,
      frameAnchors,
      rejected: registry.rejected || [],
      errors,
      loadedRoles: Object.keys(assetsByRole),
      pendingRoles: secondaryAssets.map((asset) => asset.role),
      preload
    };
  }

  window.MoonpetSideScrollerAssetLoader = {
    loadMoonpetSideScrollerAssets
  };
})();
