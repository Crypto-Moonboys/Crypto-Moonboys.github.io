// Preview catalog ranges, not a rolled outcome. Reward caps/scaling still apply.
function range(value) {
  const values = (Array.isArray(value) ? value : [value]).map(Number).filter(Number.isFinite);
  return values.length ? [Math.max(0, Math.min(...values)), Math.max(0, Math.max(...values))] : [0, 0];
}
function amounts(values) {
  return Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, range(value)]).filter(([, bounds]) => bounds[1] > 0));
}
function describe(values) {
  return Object.entries(values).map(([key, bounds]) => `${bounds[0] === bounds[1] ? bounds[0] : bounds.join('–')} ${key.replaceAll('_', ' ').toUpperCase()}`).join(', ') || 'NONE';
}
export function previewEncounterChoice(choice) {
  const risk = choice.risk;
  const chance = risk && Number.isFinite(Number(risk.chance)) ? Math.max(0, Math.min(1, Number(risk.chance))) : 0;
  const outcomes = [];
  if (chance < 1) outcomes.push({ kind: 'standard', chance: (1 - chance) * 100, rewards: amounts(choice.rewards), costs: amounts(choice.costs) });
  if (chance > 0) outcomes.push({ kind: 'setback', chance: chance * 100, rewards: amounts(risk.rewards), costs: amounts(risk.costs) });
  return { outcomes, detail: outcomes.map((outcome) => `${Number(outcome.chance.toFixed(2))}% ${outcome.kind.toUpperCase()} // BASE REWARD ${describe(outcome.rewards)} // COST ${describe(outcome.costs)}`).join(' | ') };
}
