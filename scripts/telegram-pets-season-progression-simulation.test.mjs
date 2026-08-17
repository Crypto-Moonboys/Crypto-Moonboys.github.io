import assert from 'node:assert/strict';
import evolutions from '../workers/moonboys-api/pets/content/evolutions.json' with { type: 'json' };

const stages = evolutions.map(({ stage, name }) => ({ stage, name }));
assert.deepEqual(stages, [
  { stage: 0, name: 'Moon Egg' },
  { stage: 1, name: 'Street Moonpet' },
  { stage: 2, name: 'Cyber Moonpet' },
  { stage: 3, name: 'Elite Moonpet' },
  { stage: 4, name: 'Moon Guardian' },
  { stage: 5, name: 'Legendary Moon Guardian' },
]);

function simulateSeason(activeDaysPerWeek) {
  let marks = 0;
  let crests = 0;
  let stage = 0;
  let hatchProgress = 0;
  let hatchedDay = null;
  let level = 1;
  let bossVictories = 0;
  let relics = 0;
  const materials = { scrap_metal: 0, evolution_fragment: 0 };
  const reached = new Map([[0, 0]]);
  for (let day = 1; day <= 90; day += 1) {
    const dayOfWeek = (day - 1) % 7;
    const active = dayOfWeek < activeDaysPerWeek;
    if (active) {
      marks += 1;
      hatchProgress += 1;
      level += 1;
      materials.scrap_metal += 2;
      materials.evolution_fragment += 1;
      if (marks % 5 === 0) relics += 1;
    }
    if (dayOfWeek === 0 && activeDaysPerWeek > 0) {
      crests += 1;
      bossVictories += 2;
    }
    if (!hatchedDay && day >= 7 && hatchProgress >= 7) hatchedDay = day;
    if (!hatchedDay && day === 14) hatchedDay = day;
    const next = evolutions[stage + 1];
    const requirements = next?.requirements;
    const inventoryReady = Object.entries(requirements?.inventory?.material || {})
      .every(([key, required]) => materials[key] >= required);
    const bossesReady = Object.values(requirements?.boss_victories || {}).every((required) => bossVictories >= required);
    if (hatchedDay && next && day >= requirements.min_age_days && level >= requirements.pet_level
      && marks >= requirements.growth_marks && crests >= requirements.weekly_crests
      && relics >= requirements.relics_owned && bossesReady && inventoryReady) {
      for (const [key, required] of Object.entries(requirements.inventory.material || {})) materials[key] -= required;
      stage = next.stage;
      reached.set(stage, day);
    }
  }
  return { marks, crests, stage, reached, hatchedDay };
}

const casual = simulateSeason(3);
assert.ok(casual.stage >= 2, 'three active days per week produce meaningful progression');
assert.ok(casual.stage < 5, 'casual activity does not guarantee Legendary');

const regular = simulateSeason(5);
assert.ok(regular.hatchedDay >= 7 && regular.hatchedDay <= 14, 'a fresh regular player hatches in the day 7-14 window');
assert.equal(regular.stage, 5, 'five active days per week can naturally reach Legendary');
assert.ok(regular.reached.get(5) >= 80 && regular.reached.get(5) <= 90,
  'regular play reaches Legendary inside the intended day 80-90 window');
assert.ok(regular.marks >= 60 && regular.crests >= 10, 'regular play can earn both season evidence targets');

const hardcore = simulateSeason(7);
assert.equal(hardcore.stage, 5, 'daily play reaches Legendary');
assert.ok(hardcore.reached.get(1) >= 14, 'daily play cannot compress the first evolution below its age gate');
assert.ok(hardcore.reached.get(5) >= 78, 'daily play cannot compress Legendary into an early-season completion');

for (const evolution of evolutions.slice(1)) {
  const requirements = evolution.requirements;
  assert.ok(requirements.pet_level > 0 && requirements.min_age_days > 0 && requirements.growth_marks > 0
    && requirements.weekly_crests > 0 && Object.keys(requirements.inventory || {}).length > 0,
  `${evolution.name} retains level, calendar, evidence, and material gates`);
}
assert.ok(evolutions.slice(2).every(({ requirements }) => Object.keys(requirements.boss_victories || {}).length > 0),
  'Cyber and later evolutions retain boss gates');
assert.ok(evolutions.every(({ requirements }) => !('arcade_xp' in requirements)),
  'Arcade XP cannot satisfy or skip an evolution requirement');

console.log('Telegram Pets Season 1 progression simulations passed.');
