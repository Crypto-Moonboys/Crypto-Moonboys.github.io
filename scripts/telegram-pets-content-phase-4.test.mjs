import assert from 'node:assert/strict';
import {
  PET_ARENA_STATUS_EFFECTS,
  PET_ELITE_JOBS,
  PET_DISTRICT_COMPLICATIONS,
  PET_EVENT_CHAINS,
  PET_FACTION_BONUSES,
  PET_REGION_CONTENT,
  PET_SEASONAL_BOSSES,
  applyPetArenaStatus,
  canStartPetEliteJob,
  getPetEventChain,
  getPetFactionBonus,
  getPetRegionContent,
  getPetSeasonalBoss,
} from '../workers/moonboys-api/pets/content-phase-4.js';

assert.ok(Object.keys(PET_REGION_CONTENT).length >= 6);
for (const [key, region] of Object.entries(PET_REGION_CONTENT)) {
  assert.ok(region.encounters.length >= 3, `${key} needs encounter variety`);
  assert.ok(region.boss, `${key} needs a boss`);
  assert.ok(region.reward_focus.length >= 2, `${key} needs reward focus`);
}
assert.equal(getPetRegionContent('NEON_ROOFTOPS').boss, 'skyline_hunter');
assert.equal(getPetRegionContent('constructor'), null);
assert.ok(PET_DISTRICT_COMPLICATIONS.length >= 6, 'district missions need replay complications beyond the base encounter pool');
assert.ok(PET_DISTRICT_COMPLICATIONS.every((entry) => entry.key && entry.intro && entry.objective && entry.threat_delta >= 0));
assert.throws(() => { PET_DISTRICT_COMPLICATIONS.push({}); }, TypeError);

assert.ok(Object.keys(PET_EVENT_CHAINS).length >= 4);
for (const chain of Object.values(PET_EVENT_CHAINS)) {
  assert.equal(chain.steps.length, 3);
  assert.ok(chain.final_outcomes.length >= 3);
}
assert.equal(getPetEventChain('__proto__'), null);

assert.ok(Object.keys(PET_ELITE_JOBS).length >= 4);
assert.equal(canStartPetEliteJob('mural_commission', { level: 20, job_xp: 750 }), true);
assert.equal(canStartPetEliteJob('mural_commission', { level: 19, job_xp: 9999 }), false);
assert.equal(canStartPetEliteJob('vault_security', { level: 30, training_xp: 999 }), false);
assert.equal(canStartPetEliteJob('toString', { level: 100, job_xp: 99999 }), false);

assert.ok(Object.keys(PET_ARENA_STATUS_EFFECTS).length >= 5);
assert.deepEqual(applyPetArenaStatus('bleed', 0), { status: 'bleed', stacks: 1, duration_rounds: 3 });
assert.deepEqual(applyPetArenaStatus('bleed', 99), { status: 'bleed', stacks: 2, duration_rounds: 3 });
assert.equal(applyPetArenaStatus('constructor', 0), null);

assert.ok(Object.keys(PET_SEASONAL_BOSSES).length >= 4);
assert.equal(getPetSeasonalBoss('neon_titan', 24), null);
assert.equal(getPetSeasonalBoss('neon_titan', 25).phases, 3);
assert.equal(getPetSeasonalBoss('__proto__', 100), null);

assert.equal(Object.keys(PET_FACTION_BONUSES).length, 9);
for (const bonus of Object.values(PET_FACTION_BONUSES)) {
  assert.ok(bonus.system);
  assert.ok(Object.keys(bonus.effect).length >= 2);
}
assert.equal(getPetFactionBonus('GRAFFPUNKS').system, 'events');
assert.equal(getPetFactionBonus('constructor'), null);

assert.throws(() => { PET_REGION_CONTENT.moon_alley.encounters.push('mutated'); }, TypeError);
assert.throws(() => { PET_EVENT_CHAINS.lost_delivery_drone.steps[0] = 'mutated'; }, TypeError);
assert.throws(() => { PET_ELITE_JOBS.mural_commission.min_level = 1; }, TypeError);
assert.throws(() => { PET_ARENA_STATUS_EFFECTS.bleed.max_stacks = 999; }, TypeError);
assert.throws(() => { PET_SEASONAL_BOSSES.neon_titan.phases = 1; }, TypeError);
assert.throws(() => { PET_FACTION_BONUSES.graffpunks.effect.event_reward_pct = 999; }, TypeError);

console.log('telegram-pets-content-phase-4.test.mjs passed');
