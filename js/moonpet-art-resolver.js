(() => {
  const BACKGROUND_REGISTRY_PATH = "/data/moonpet-rare-background-registry.json";
  const ITEM_REGISTRY_PATH = "/data/moonpet-item-art-registry.json";
  const DEFAULT_BACKGROUND = "/games/assets/BITTY%20BACKGROUND.jpg";
  let backgroundRegistryPromise = null;
  let itemRegistryPromise = null;

  function normalized(value) {
    return String(value || "").trim().toUpperCase();
  }

  function fetchRegistry(path) {
    return fetch(path, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      return response.json();
    });
  }

  function findBot(registry, identity = {}) {
    const speciesId = String(identity.speciesId || identity.species_id || "").trim();
    const displayName = normalized(identity.displayName || identity.speciesName || identity.species_name || identity.botName);
    return Object.entries(registry.bots || {}).find(([botName, bot]) =>
      (bot.canonical_species_ids || []).includes(speciesId) || normalized(botName) === displayName);
  }

  function resolveMoonpetBackground(registry, identity = {}, rareMorphId = null) {
    const fallback = registry.default_background || DEFAULT_BACKGROUND;
    const match = findBot(registry, identity);
    const botName = match && match[0] || null;
    const bot = match && match[1];
    const rareKey = String(rareMorphId || "").trim().toLowerCase();
    if (!bot) return { botName, rareMorphId: rareKey || null, imagePath: fallback, status: "default", fallbackUsed: true };
    if (!rareKey) return { botName, rareMorphId: null, imagePath: bot.default || fallback, status: "default", fallbackUsed: false };
    const rare = bot[rareKey];
    if (rare && rare.status === "approved" && rare.image_path) {
      return { botName, rareMorphId: rareKey, imagePath: rare.image_path, status: "approved", fallbackUsed: false };
    }
    return { botName, rareMorphId: rareKey, imagePath: bot.default || fallback, status: rare && rare.status || "missing", fallbackUsed: true };
  }

  async function loadMoonpetBackground(identity = {}, rareMorphId = null) {
    if (!backgroundRegistryPromise) backgroundRegistryPromise = fetchRegistry(BACKGROUND_REGISTRY_PATH);
    const registry = await backgroundRegistryPromise;
    return { registry, ...resolveMoonpetBackground(registry, identity, rareMorphId) };
  }

  async function loadMoonpetItemArtRegistry() {
    if (!itemRegistryPromise) itemRegistryPromise = fetchRegistry(ITEM_REGISTRY_PATH);
    return itemRegistryPromise;
  }

  window.MoonpetArtResolver = { loadMoonpetBackground, resolveMoonpetBackground, loadMoonpetItemArtRegistry };
})();
