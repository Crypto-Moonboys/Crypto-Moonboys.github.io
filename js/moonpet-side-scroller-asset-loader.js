(() => {
  const DEFAULT_REGISTRY_PATH = "data/moonpet-side-scroller-approved-assets.json";

  function cacheToken(asset) {
    return asset && asset.promoted_at || window.MOONPET_COMMIT_HASH || "dev";
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
      label: frame.filename || frame.name || String(index)
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

  async function loadMoonpetSideScrollerAssets(options = {}) {
    const registryPath = options.registryPath || DEFAULT_REGISTRY_PATH;
    const errors = [];
    const assetsByRole = {};
    const registry = await fetchJson(registryPath);
    const roleMap = registry.runtime_role_map || {};
    const approvedAssets = (registry.assets || []).filter((asset) =>
      asset.approved === true && asset.promoted === true && !asset.rejected
    );

    for (const asset of approvedAssets) {
      if (!asset.role || !asset.sheet_path || !asset.atlas_path) {
        errors.push(`Side asset ${asset.id || "unknown"} is missing role/sheet/atlas path`);
        continue;
      }
      try {
        const atlas = await fetchJson(asset.atlas_path, asset);
        const frames = framesFromAtlas(atlas, asset.frame_size || 256);
        if (!frames.length) {
          errors.push(`Side asset ${asset.role} atlas did not contain frames`);
          continue;
        }
        const imageResult = await loadImage(asset.sheet_path, asset);
        if (imageResult.error) {
          errors.push(`Side asset ${asset.role} sheet failed: ${imageResult.error}`);
          continue;
        }
        assetsByRole[asset.role] = {
          ...asset,
          frames,
          image: imageResult.image,
          sheet_url: imageResult.url
        };
      } catch (error) {
        errors.push(`Side asset ${asset.role || asset.id} failed to load: ${error.message}`);
      }
    }

    return {
      ready: Boolean(Object.keys(assetsByRole).length),
      registryPath,
      assetsByRole,
      roleMap,
      rejected: registry.rejected || [],
      errors
    };
  }

  window.MoonpetSideScrollerAssetLoader = {
    loadMoonpetSideScrollerAssets
  };
})();
