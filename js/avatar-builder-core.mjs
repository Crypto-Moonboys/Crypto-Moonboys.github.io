export function indexManifest(manifest) {
  const traitsById = new Map(manifest.traits.map((trait) => [trait.id, trait]));
  const traitsByCategory = new Map(manifest.categories.map((category) => [
    category.id,
    manifest.traits.filter((trait) => trait.category === category.id),
  ]));
  return { traitsById, traitsByCategory };
}

export function defaultStack(manifest) {
  return Object.fromEntries(manifest.categories.map((category) => [category.id, category.defaultTraitId]));
}

export function clearOptionalStack(manifest, current = {}) {
  return Object.fromEntries(manifest.categories.map((category) => [
    category.id,
    category.required ? (current[category.id] || category.defaultTraitId) : null,
  ]));
}

export function randomStack(manifest, random = Math.random) {
  const { traitsByCategory } = indexManifest(manifest);
  return Object.fromEntries(manifest.categories.map((category) => {
    const choices = traitsByCategory.get(category.id) || [];
    if (!choices.length) throw new Error(`Category ${category.id} has no traits`);
    return [category.id, choices[Math.floor(random() * choices.length)].id];
  }));
}

export function isCompleteValidStack(manifest, stack) {
  const { traitsById } = indexManifest(manifest);
  return manifest.categories.every((category) => {
    const trait = traitsById.get(stack[category.id]);
    return trait?.category === category.id;
  });
}
