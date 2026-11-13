// GK's curated Moonboys, shared by the homepage and permanent standalone builder.
// Add presets here once to update the click cycle in both places.
const PRESETS = Object.freeze([
  {
    "background": "background-mb-bg-2",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-2",
    "clothes": null,
    "chains": "chains-mb-chain-96",
    "face": "face-mb-face-27",
    "hat": "hat-mb-hat-22",
    "left-arm": "left-arm-mb-left-5",
    "right-arm": "right-arm-mb-right-2"
  },
  {
    "background": "background-bitcoin-code-rain",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-1",
    "clothes": "clothes-mc-clothes-23",
    "chains": "chains-mb-chain-111",
    "face": "face-mb-face-14",
    "hat": "hat-mb-hat-24",
    "left-arm": "left-arm-mb-left-1",
    "right-arm": "right-arm-mb-right-12"
  },
  {
    "background": "background-mb-background",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-6",
    "clothes": "clothes-mc-clothes-21",
    "chains": "chains-mb-chain-132",
    "face": "face-mb-face-50",
    "hat": "hat-mb-hat-33",
    "left-arm": "left-arm-mb-left-8",
    "right-arm": "right-arm-mb-right-25"
  },
  {
    "background": "background-mb-bg-6",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-12",
    "clothes": "clothes-mc-clothes-9",
    "chains": "chains-mb-chain-93",
    "face": "face-mb-face-23",
    "hat": "hat-mb-hat-31",
    "left-arm": "left-arm-mb-left-10",
    "right-arm": "right-arm-mb-right-57"
  },
  {
    "background": "background-mb-bg-33",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-12",
    "clothes": "clothes-mc-clothes-1",
    "chains": "chains-mb-chain-89",
    "face": "face-mb-face-44",
    "hat": "hat-mb-hat-7",
    "left-arm": "left-arm-mb-left-60",
    "right-arm": "right-arm-mb-right-40"
  },
  {
    "background": "background-mb-bg-36",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-12",
    "clothes": "clothes-mc-clothes-111",
    "chains": "chains-mb-chain-105",
    "face": "face-mb-face-25",
    "hat": "hat-mb-hat-3",
    "left-arm": "left-arm-mb-left-58",
    "right-arm": "right-arm-mb-right-11"
  },
  {
    "background": "background-mb-bg-3",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-12",
    "clothes": "clothes-mc-clothes-110",
    "chains": "chains-mb-chain-100",
    "face": "face-mb-face-110",
    "hat": "hat-mb-hat-2",
    "left-arm": "left-arm-mb-left-56",
    "right-arm": "right-arm-mb-right-67"
  },
  {
    "background": "background-mb-bg-23",
    "body": "body-mb-body",
    "tattoos": "tattoos-mb-tattoo-11",
    "clothes": "clothes-mc-clothes-118",
    "chains": "chains-mb-chain-103",
    "face": "face-mb-face-19",
    "hat": "hat-mb-hat-5",
    "left-arm": "left-arm-mb-left-59",
    "right-arm": "right-arm-mb-right-43"
  }
].map(Object.freeze));

export function createHomepagePresetCycle(manifest) {
  const traits = new Map(manifest.traits.map(trait => [trait.id, trait]));
  // Resolve every preset before enabling the cycle: a stale ID must not
  // silently replace one of GK's chosen traits with a different layer.
  for (const preset of PRESETS) {
    if (Object.keys(preset).length !== manifest.categories.length) {
      throw new Error('Homepage preset categories do not match the manifest.');
    }
    for (const category of manifest.categories) {
      const id = preset[category.id];
      if (id === null && !category.required) continue;
      if (!id || traits.get(id)?.category !== category.id) {
        throw new Error('Homepage preset trait is unavailable: ' + category.id + '/' + id);
      }
    }
  }
  let cursor = 0;
  return () => {
    const stack = { ...PRESETS[cursor] };
    cursor = (cursor + 1) % PRESETS.length;
    return stack;
  };
}
