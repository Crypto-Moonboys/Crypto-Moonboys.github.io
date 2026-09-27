// Raid counters resolve one attack; they do not apply Arena status effects.
const COUNTERS = Object.freeze({
  armor_break: { label: 'BREAK ARMOR', chance: 75, multiplier: 1.65 },
  bleed: { label: 'PRESSURE STRIKE', chance: 85, multiplier: 1.45 },
  blinded: { label: 'SIGNAL JAM', chance: 70, multiplier: 1.8 },
  barrier: { label: 'BARRIER COUNTER', chance: 90, multiplier: 1.35 },
});

export function seasonalRaidChoices(level, boss) {
  const base = 35 + Math.max(1, Math.floor(Number(level) || 1)) * 2;
  const choices = [
    { key: 'conserve', label: 'CONSERVE ENERGY', energy: 12, chance: 100, damage: Math.floor(base * 0.65), setback_damage: Math.floor(base * 0.65), detail: 'Lower damage; save energy for other routes.' },
    { key: 'strike', label: 'STEADY STRIKE', energy: 18, chance: 100, damage: base, setback_damage: base, detail: 'Reliable damage with the original raid cost.' },
  ];
  const counter = Object.hasOwn(COUNTERS, boss.weakness) ? COUNTERS[boss.weakness] : null;
  if (counter) choices.push({ key: 'counter', label: counter.label, energy: 18, chance: counter.chance,
    damage: Math.floor(base * counter.multiplier), setback_damage: Math.floor(base * 0.5),
    detail: 'Exploit this boss’s weakness for higher damage, with a lower-damage setback if it fails.' });
  return choices;
}

export function resolveSeasonalRaidAttack(level, boss, key = 'strike', roll = 0) {
  const choice = seasonalRaidChoices(level, boss).find((entry) => entry.key === key);
  if (!choice || !Number.isInteger(roll) || roll < 0 || roll > 99) return null;
  const success = roll < choice.chance;
  return { ...choice, success, damage: success ? choice.damage : choice.setback_damage };
}
