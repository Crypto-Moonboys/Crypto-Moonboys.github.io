export const STUDIO_FEATURE = 'underpass-studio-v1';
export const UNDERPASS_ROUTE = 1;

export const OPTIONS = {
  sketch: [
    ['tag', 'Tag', 1], ['throw-up', 'Throw-up', 3], ['wildstyle', 'Wildstyle', 5],
  ],
  width: [['tight', 'Tight', 0], ['balanced', 'Balanced', 1], ['wide', 'Wide', 2]],
  lean: [['back', 'Back lean', 0], ['upright', 'Upright', 0], ['forward', 'Forward lean', 0]],
  placement: [['left', 'Left', 0], ['center', 'Centred', 0], ['right', 'Right', 0], ['split', 'Split at seam', 1]],
  fill: [['none', 'Bare wall', 0], ['flat', 'Flat colour', 2], ['fade', 'Two-tone fade', 5], ['chrome', 'Chrome', 5]],
  palette: [['lime', 'Acid lime', 0], ['uv', 'Ultraviolet', 0], ['cold', 'Ice blue', 0], ['pink', 'Signal pink', 0]],
  outline: [['none', 'No outline', 0], ['skinny', 'Skinny cap', 2], ['fat', 'Fat cap', 4]],
  depth: [['none', 'Flat', 0], ['shadow', 'Drop shadow', 2], ['extrusion', '3D extrusion', 4]],
  direction: [['down-left', 'Down left', 0], ['down-right', 'Down right', 0], ['up-right', 'Up right', 0]],
  reach: [['short', 'Short', 0], ['long', 'Long', 2]],
  finish: [['lime-keyline', 'Lime keyline', 3], ['highlights', 'Highlights', 3], ['cutbacks', 'Cutbacks', 2],
    ['arrows', 'Arrows', 2], ['signature', 'Signature', 1]],
};

export const DEFAULT_RECIPE = {
  sketch: 'tag', width: 'balanced', lean: 'upright', placement: 'center',
  fill: 'flat', palette: 'uv', outline: 'none',
  depth: 'none', direction: 'down-right', reach: 'short', finish: [],
};

const BRIEFS = [
  {
    title: 'Chalk Rubbing', budget: 17,
    checks: [
      ['Build a throw-up', r => r.sketch === 'throw-up'],
      ['Lay a chrome fill', r => r.fill === 'chrome'],
      ['Leave the centre seam clear', r => r.placement === 'split'],
      ['Add a lime keyline', r => r.finish.includes('lime-keyline')],
    ],
  },
  {
    title: 'UV Throwie', budget: 18,
    checks: [
      ['Use a wide throw-up or wildstyle', r => r.width === 'wide' && r.sketch !== 'tag'],
      ['Fade two tones from the ultraviolet palette', r => r.fill === 'fade' && r.palette === 'uv'],
      ['Keep the outline tight with a skinny cap', r => r.outline === 'skinny'],
      ['Give the piece depth', r => r.depth !== 'none'],
    ],
  },
  {
    title: 'Lime Overprint', budget: 25,
    checks: [
      ['Build a wildstyle with a painted fill', r => r.sketch === 'wildstyle' && r.fill !== 'none'],
      ['Outline the piece', r => r.outline !== 'none'],
      ['Pull a long 3D extrusion', r => r.depth === 'extrusion' && r.reach === 'long'],
      ['Add a lime keyline and another finish', r => r.finish.includes('lime-keyline') && r.finish.length >= 2],
    ],
  },
];

export function readRecipe(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const recipe = {};
  for (const [part, choices] of Object.entries(OPTIONS)) {
    if (!Object.hasOwn(input, part)) return null;
    const value = input[part];
    if (part === 'finish') {
      if (!Array.isArray(value) || value.length > choices.length || new Set(value).size !== value.length) return null;
      if (!value.every(id => choices.some(([choice]) => choice === id))) return null;
      recipe.finish = choices.map(([id]) => id).filter(id => value.includes(id));
    } else {
      if (!choices.some(([id]) => value === id)) return null;
      recipe[part] = value;
    }
  }
  return recipe;
}

export function assessRecipe(tier, input) {
  const brief = BRIEFS[tier];
  const recipe = readRecipe(input);
  if (!brief || !recipe) return null;
  const spent = Object.entries(OPTIONS).reduce((cost, [part, choices]) => {
    if (part === 'reach' && recipe.depth === 'none') return cost;
    if (part === 'finish') return cost + choices.filter(([id]) => recipe.finish.includes(id))
      .reduce((sum, [, , units]) => sum + units, 0);
    return cost + choices.find(([id]) => id === recipe[part])[2];
  }, 0);
  const checks = brief.checks.map(([label, passes]) => ({ label, met: passes(recipe) }));
  return { recipe, title: brief.title, budget: brief.budget, spent, checks,
    canBank: spent <= brief.budget && checks.every(check => check.met) };
}
