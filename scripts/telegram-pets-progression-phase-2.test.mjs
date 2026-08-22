import assert from 'node:assert/strict';
import {
  PET_JOB_RANKS,
  PET_LEVEL_MILESTONES,
  PET_PROGRESSION_TRACKS,
  PET_RUN_REGIONS,
  PET_TRAITS,
  PET_VISIBLE_LEVEL_CURVE,
  canEnterPetRunRegion,
  clampPetTrackAward,
  getPetJobRank,
  getPetLevelUnlocks,
  getPetTrackLevel,
  getPetVisibleLevel,
  getPetVisibleLevelSql,
  getPetXpRequiredForVisibleLevel,
  getPetXpToNextVisibleLevel,
  getPetTraitProgress,
  getUnlockedPetTraits,
  normalizePetProgressionTrack,
} from '../workers/moonboys-api/pets/progression-phase-2.js';

assert.deepEqual(Object.keys(PET_PROGRESSION_TRACKS), ['care', 'training', 'adventure', 'arena', 'job', 'bond']);
for (const [key, track] of Object.entries(PET_PROGRESSION_TRACKS)) {
  assert.ok(track.label.endsWith('XP'), `${key} must have an XP label`);
  assert.ok(track.max_daily_award > 0, `${key} must have a positive daily cap`);
  assert.ok(track.sources.length >= 2, `${key} must have multiple progression sources`);
}

assert.equal(normalizePetProgressionTrack('ARENA'), 'arena');
assert.equal(normalizePetProgressionTrack('unknown'), null);
for (const inheritedKey of ['constructor', '__proto__', 'toString']) {
  assert.equal(normalizePetProgressionTrack(inheritedKey), null, `${inheritedKey} must not resolve as a progression track`);
  assert.equal(clampPetTrackAward(inheritedKey, 40, 0), 0, `${inheritedKey} must not award progression XP`);
}
assert.equal(clampPetTrackAward('arena', 40, 280), 20, 'track awards must respect the daily cap');
assert.equal(clampPetTrackAward('arena', 40, 300), 0, 'full daily cap blocks more track XP');
assert.equal(clampPetTrackAward('unknown', 40, 0), 0, 'unknown tracks cannot award XP');
assert.equal(getPetTrackLevel(0), 1);
assert.ok(getPetTrackLevel(8000) > getPetTrackLevel(800));
assert.ok(getPetTrackLevel(99999999) <= 100);

assert.deepEqual(PET_VISIBLE_LEVEL_CURVE, {
  max_level: 100,
  xp_base: 40,
  formula: 'level = 1 + floor(sqrt(pet_xp / xp_base))',
});
assert.equal(getPetVisibleLevel(0), 1);
assert.equal(getPetVisibleLevel(40), 2);
assert.equal(getPetVisibleLevel(3240), 10, 'Level 10 remains reachable early enough for Arena');
assert.equal(getPetVisibleLevel(33640), 30, 'Level 30 requires sustained beta play');
assert.equal(getPetVisibleLevel(96040), 50, 'Level 50 is a late-season target under the daily cap');
assert.equal(getPetVisibleLevel(999999999), 100);
assert.equal(getPetXpRequiredForVisibleLevel(10), 3240);
assert.equal(getPetXpToNextVisibleLevel(3239), 1);
assert.equal(getPetXpToNextVisibleLevel(96040), getPetXpRequiredForVisibleLevel(51) - 96040);
assert.match(getPetVisibleLevelSql('p.pet_xp'), /CASE WHEN p\.pet_xp >= 392040 THEN 100/);

assert.ok(PET_LEVEL_MILESTONES.length >= 10);
assert.deepEqual(getPetLevelUnlocks(1), []);
assert.ok(getPetLevelUnlocks(10).includes('pet_arena'));
assert.ok(getPetLevelUnlocks(25).includes('second_run_region'));
assert.ok(getPetLevelUnlocks(100).includes('legendary_pet_status'));

assert.equal(PET_JOB_RANKS.length, 5);
assert.equal(getPetJobRank(0), 'assistant');
assert.equal(getPetJobRank(200), 'crew_member');
assert.equal(getPetJobRank(5000), 'legendary_contractor');

assert.ok(Object.keys(PET_RUN_REGIONS).length >= 6);
assert.equal(canEnterPetRunRegion('moon_alley', 1, 0), true);
assert.equal(canEnterPetRunRegion('neon_rooftops', 9, 999), false, 'level gate must apply');
assert.equal(canEnterPetRunRegion('neon_rooftops', 10, 99), false, 'mastery gate must apply');
assert.equal(canEnterPetRunRegion('neon_rooftops', 10, 100), true);
assert.equal(canEnterPetRunRegion('missing_region', 100, 99999), false);
for (const inheritedKey of ['constructor', '__proto__', 'toString']) {
  assert.equal(canEnterPetRunRegion(inheritedKey, 100, 99999), false, `${inheritedKey} must not resolve as a run region`);
}

assert.ok(Object.keys(PET_TRAITS).length >= 6);
assert.deepEqual(getPetTraitProgress('arena_attack', 7), { brave: 7 });
assert.deepEqual(getPetTraitProgress('feed', 7), { loyal: 7 });
assert.deepEqual(getPetTraitProgress('feed', 100), { loyal: 25 }, 'trait awards must be clamped');
assert.ok(getUnlockedPetTraits({ brave: 100, loyal: 139, lucky: 100 }).includes('brave'));
assert.ok(!getUnlockedPetTraits({ brave: 99 }).includes('brave'));

console.log('telegram-pets-progression-phase-2.test.mjs passed');
