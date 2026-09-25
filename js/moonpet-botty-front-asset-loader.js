(() => {
  const DEFAULT_MANIFEST_PATH = "/data/moonpet-botty-front-assets.json";
  const FALLBACK_CACHE_VERSION = "20260925-botty-front-live-beta-v2";

  function cacheToken(asset, manifest) {
    return asset && asset.autosprite && asset.autosprite.spritesheet_id
      || manifest && manifest.cache_version
      || window.MOONPET_COMMIT_HASH
      || FALLBACK_CACHE_VERSION;
  }

  function cacheBustedUrl(path, asset, manifest) {
    if (!path) return null;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(cacheToken(asset, manifest))}`;
  }

  async function fetchJson(path, asset, manifest) {
    const url = cacheBustedUrl(path, asset, manifest);
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

  function loadImage(path, asset, manifest) {
    const url = cacheBustedUrl(path, asset, manifest);
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve({ image, error: null, url });
      image.onerror = () => resolve({ image: null, error: `${path} failed to load`, url });
      image.src = url;
    });
  }

  async function loadAsset(asset, manifest, errors) {
    if (!asset || !asset.role || !asset.png_path || !asset.atlas_path) {
      errors.push(`BOTTY asset ${asset && asset.role || "unknown"} is missing role/png/atlas path`);
      return null;
    }
    try {
      const atlas = await fetchJson(asset.atlas_path, asset, manifest);
      const fallbackSize = asset.frame_dimensions && asset.frame_dimensions.w || 256;
      const frames = framesFromAtlas(atlas, fallbackSize);
      if (!frames.length) {
        errors.push(`BOTTY asset ${asset.role} atlas did not contain frames`);
        return null;
      }
      const imageResult = await loadImage(asset.png_path, asset, manifest);
      if (imageResult.error) {
        errors.push(`BOTTY asset ${asset.role} sheet failed: ${imageResult.error}`);
        return null;
      }
      return {
        role: asset.role,
        asset: {
          ...asset,
          frames,
          frame_count: frames.length,
          image: imageResult.image,
          sheet_url: imageResult.url
        }
      };
    } catch (error) {
      errors.push(`BOTTY asset ${asset.role} failed to load: ${error.message}`);
      return null;
    }
  }

  async function loadMoonpetBottyFrontAssets(options = {}) {
    const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
    const errors = [];
    const assetsByRole = {};
    const manifest = await fetchJson(manifestPath, null, { cache_version: FALLBACK_CACHE_VERSION });
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    const required = Object.values(manifest.runtime_role_map || {}).filter((role, index, list) => list.indexOf(role) === index);
    const idleRole = manifest.runtime_role_map && manifest.runtime_role_map.idle || "front_idle";
    const priorityAsset = assets.find((asset) => asset.role === idleRole) || assets[0] || null;

    if (priorityAsset) {
      const idleEntry = await loadAsset(priorityAsset, manifest, errors);
      if (idleEntry && idleEntry.role) assetsByRole[idleEntry.role] = idleEntry.asset;
    }

    const remaining = assets.filter((asset) => !priorityAsset || asset.role !== priorityAsset.role);
    const pendingRoles = remaining.map((asset) => asset.role);
    const preload = Promise.all(remaining.map((asset) => loadAsset(asset, manifest, errors))).then((loaded) => {
      for (const entry of loaded) {
        if (entry && entry.role) assetsByRole[entry.role] = entry.asset;
      }
      return {
        assetsByRole,
        loadedRoles: Object.keys(assetsByRole),
        errors
      };
    });

    return {
      ready: Boolean(assetsByRole[idleRole]),
      manifestPath,
      manifest,
      assetsByRole,
      roleMap: manifest.runtime_role_map || {},
      loadedRoles: Object.keys(assetsByRole),
      requiredRoles: required,
      pendingRoles,
      preload,
      errors
    };
  }

  window.MoonpetBottyFrontAssetLoader = {
    loadMoonpetBottyFrontAssets
  };
})();
