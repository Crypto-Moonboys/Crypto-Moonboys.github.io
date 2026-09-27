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
// Only wallet currencies require full payment. Pet stat costs are clamped by
// gameplay; do not turn them into new entry requirements. Inspect each possible
// outcome independently so an affordable branch is never hidden.
export function previewChoiceAffordability(costOutcomes, wallet) {
  if (wallet == null) return {};
  const currencies = ['moon_gold', 'moon_crystals', 'style_tokens'];
  const outcomes = costOutcomes.map(amounts);
  const balance = (key) => Math.max(0, Math.floor(Number(wallet[key]) || 0));
  const affordableAt = (costs, bound) => currencies.every((key) => Math.floor(costs[key]?.[bound] || 0) <= balance(key));
  const available = outcomes.some((costs) => affordableAt(costs, 0));
  const guaranteed = outcomes.every((costs) => affordableAt(costs, 1));
  const affordability = !available ? 'unavailable' : guaranteed ? 'available' : 'conditional';
  const requirements = currencies.flatMap((key) => {
    const maximum = Math.max(0, ...outcomes.map((costs) => Math.floor(costs[key]?.[1] || 0)));
    return maximum > balance(key) ? [`${key.replaceAll('_', ' ').toUpperCase()}: HAVE ${balance(key)}, COST UP TO ${maximum}`] : [];
  });
  const affordability_detail = guaranteed ? '' : `${available ? 'Some rolled costs exceed your balance; choose a cheaper route or add currency.' : 'Cannot afford this choice; choose another route or add currency.'} ${requirements.join(' // ')}`;
  return { available, affordability, affordability_detail };
}

export function previewEncounterChoice(choice, wallet) {
  const risk = choice.risk;
  const chance = risk && Number.isFinite(Number(risk.chance)) ? Math.max(0, Math.min(1, Number(risk.chance))) : 0;
  const outcomes = [];
  if (chance < 1) outcomes.push({ kind: 'standard', chance: (1 - chance) * 100, rewards: amounts(choice.rewards), costs: amounts(choice.costs) });
  if (chance > 0) outcomes.push({ kind: 'setback', chance: chance * 100, rewards: amounts(risk.rewards), costs: amounts(risk.costs) });
  const affordability = previewChoiceAffordability(outcomes.map((outcome) => outcome.costs), wallet);
  return { outcomes, ...affordability, detail: [outcomes.map((outcome) => `${Number(outcome.chance.toFixed(2))}% ${outcome.kind.toUpperCase()} // BASE REWARD ${describe(outcome.rewards)} // COST ${describe(outcome.costs)}`).join(' | '), affordability.affordability_detail].filter(Boolean).join(' // ') };
}
