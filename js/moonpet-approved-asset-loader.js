(() => {
  const DEFAULT_REGISTRY_PATH = "data/moonpet-approved-assets.json";
  const SUPPORTED_ROLES = ["base_idle", "base_walk", "base_run"];
  const ROLE_TO_ANIMATION = {
    base_idle: "iso_idle_down",
    base_walk: "iso_walk_down",
    base_run: "iso_run_down"
  };

  function cacheToken(asset) {
    return (asset && asset.promoted_at) || window.MOONPET_COMMIT_HASH || "dev";
  }

  function cacheBustedUrl(path, asset) {
    if (!path) return null;
    if (!asset || !asset.promoted) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(cacheToken(asset))}`;
  }

  async function fetchJson(path, options = {}) {
    const url = options.cacheBust ? cacheBustedUrl(path, options.asset) : path;
    if (options.logLabel) {
      console.info(`[Moonpet approved asset loader] fetching ${options.logLabel}`, {
        path,
        url
      });
    }
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }

  function normalizeSize(size) {
    if (!size) return null;
    if (typeof size === "string") {
      const match = size.match(/(\d+)\s*x\s*(\d+)/i);
      return match ? { w: Number(match[1]), h: Number(match[2]) } : null;
    }
    return {
      w: Number(size.w || size.width || 0),
      h: Number(size.h || size.height || 0)
    };
  }

  function frameFromAtlas(frame, fallbackSize, index) {
    const source = frame.frame || frame;
    return {
      x: Number(source.x || 0),
      y: Number(source.y || 0),
      w: Number(source.w || source.width || fallbackSize),
      h: Number(source.h || source.height || fallbackSize),
      label: frame.filename || frame.name || String(index + 1)
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

  async function loadImage(path, asset) {
    const url = cacheBustedUrl(path, asset);
    console.info("[Moonpet approved asset loader] fetching sheet", { path, url });
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve({ image, error: null, url });
      image.onerror = () => resolve({ image: null, error: `${path} failed to load`, url });
      image.src = url;
    });
  }

  function rejectedAnimationSet(registry) {
    return new Set(
      (registry.rejected || [])
        .filter((asset) => asset.rejected)
        .map((asset) => `${asset.character_name}::${asset.animation_kind}`)
    );
  }

  function approvedAssetForRole(registry, role, rejectedSet) {
    const animationKind = ROLE_TO_ANIMATION[role];
    return (registry.assets || []).find((asset) => {
      const key = `${asset.character_name}::${asset.animation_kind}`;
      return (
        asset.role === role &&
        asset.animation_kind === animationKind &&
        asset.approved === true &&
        asset.promoted === true &&
        !asset.rejected &&
        !rejectedSet.has(key)
      );
    });
  }

  async function loadApprovedMoonpetAssets(options = {}) {
    const registryPath = options.registryPath || DEFAULT_REGISTRY_PATH;
    const roles = options.roles || SUPPORTED_ROLES;
    const errors = [];
    const assetsByRole = {};
    const registry = await fetchJson(registryPath);
    const rejectedSet = rejectedAnimationSet(registry);

    for (const role of roles) {
      const animationKind = ROLE_TO_ANIMATION[role];
      if (!animationKind) {
        errors.push(`Unsupported animation role: ${role}`);
        continue;
      }

      const approved = approvedAssetForRole(registry, role, rejectedSet);
      if (!approved) {
        errors.push(`Missing approved promoted asset for ${role}`);
        continue;
      }
      if (!approved.sheet_path || !approved.atlas_path) {
        errors.push(`Approved asset ${role} is missing sheet_path or atlas_path`);
        continue;
      }

      try {
        const atlas = await fetchJson(approved.atlas_path, {
          asset: approved,
          cacheBust: true,
          logLabel: `${role} atlas`
        });
        const frames = framesFromAtlas(atlas, approved.frame_size || 256);
        if (!frames.length) {
          errors.push(`Approved asset ${role} atlas did not contain renderable frames`);
          continue;
        }

        const imageResult = await loadImage(approved.sheet_path, approved);
        if (imageResult.error) {
          errors.push(`Approved asset ${role} sheet failed: ${imageResult.error}`);
          continue;
        }

        assetsByRole[role] = {
          ...approved,
          animation_kind: animationKind,
          sheet_size: normalizeSize(approved.sheet_size),
          frames,
          image: imageResult.image,
          sheet_url: imageResult.url
        };
      } catch (error) {
        errors.push(`Approved asset ${role} failed to load: ${error.message}`);
      }
    }

    return {
      ready: roles.every((role) => Boolean(assetsByRole[role])),
      registryPath,
      roles,
      assetsByRole,
      errors
    };
  }

  window.MoonpetApprovedAssetLoader = {
    SUPPORTED_ROLES,
    ROLE_TO_ANIMATION,
    loadApprovedMoonpetAssets
  };
})();
