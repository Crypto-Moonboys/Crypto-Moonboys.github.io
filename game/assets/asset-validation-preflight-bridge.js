// NBG asset validation preflight bridge
// Connects Phase 2 asset checks to Level 1 startup validation.

export function runAssetPreflight(assetValidation, requiredAssets = []) {
  if (!assetValidation) {
    return {
      ready: false,
      reason: 'asset validation unavailable'
    };
  }

  const result = assetValidation.check(requiredAssets);

  return {
    ready: result.missing.length === 0,
    missing: result.missing,
    loaded: result.loaded
  };
}
