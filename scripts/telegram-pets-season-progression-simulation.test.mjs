import assert from 'node:assert/strict';
import evolutions from '../workers/moonboys-api/pets/content/evolutions.json' with { type: 'json' };
import {
  PET_PROGRESSION_TRACKS,
  getPetTrackLevel,
  getPetVisibleLevel,
} from '../workers/moonboys-api/pets/progression-phase-2.js';

const CHECKPOINT_DAYS = [1, 7, 14, 30, 60, 78, 90];
const PET_DAILY_XP_CAP = 1200;
const ARENA_LEVEL = 10;

const PET_XP_SOURCE_AUDIT = Object.freeze([
  'care_actions',
  'train',
  'sleep',
  'work',
  'daily_chest',
  'timed_activities',
  'moon_runs',
  'daily_moon_run',
  'weekly_journey',
  'arena',
  'kaiju',
  'seasonal_boss',
  'district_story_event_systems',
  'reward_settlement_helpers',
  'mini_app_action_paths',
  'telegram_command_paths',
]);

const SPECIALIST_SOURCE_AUDIT = Object.freeze({
  care: ['feed', 'play', 'clean', 'sleep', 'train'],
  training: ['train', 'timed_train'],
  adventure: ['run_step', 'run_extract', 'run_boss', 'explore'],
  arena: ['arena_attack', 'arena_block', 'arena_complete'],
  job: ['job', 'timed_work'],
  bond: ['feed', 'play', 'clean', 'sleep', 'daily_chest'],
});

const APTITUDE_SOURCE_AUDIT = Object.freeze(['brave', 'loyal', 'clever', 'stylish', 'tough', 'lucky']);

const PROFILE_PATTERNS = Object.freeze({
  light_casual: Object.freeze({
    activeDaysPerWeek: 3,
    dailyPetXp: 130,
    weeklyPetXp: 0,
    trackDaily: { care: 45, training: 10, adventure: 20, arena: 0, job: 15, bond: 35 },
    aptitudeDaily: { brave: 0, loyal: 5, clever: 1, stylish: 1, tough: 1, lucky: 1 },
    dailyJourneyCompletionRate: 0.45,
    weeklyCrestsPerWeek: 0,
    bossVictoriesPerWeek: 0,
  }),
  normal_daily: Object.freeze({
    activeDaysPerWeek: 7,
    dailyPetXp: 240,
    weeklyPetXp: 90,
    trackDaily: { care: 80, training: 35, adventure: 55, arena: 10, job: 25, bond: 65 },
    aptitudeDaily: { brave: 2, loyal: 8, clever: 4, stylish: 2, tough: 3, lucky: 3 },
    dailyJourneyCompletionRate: 0.85,
    weeklyCrestsPerWeek: 1,
    bossVictoriesPerWeek: 1,
  }),
  strong_daily: Object.freeze({
    activeDaysPerWeek: 7,
    dailyPetXp: 620,
    weeklyPetXp: 120,
    trackDaily: { care: 130, training: 85, adventure: 130, arena: 65, job: 70, bond: 95 },
    aptitudeDaily: { brave: 7, loyal: 11, clever: 8, stylish: 5, tough: 8, lucky: 5 },
    dailyJourneyCompletionRate: 1,
    weeklyCrestsPerWeek: 1,
    bossVictoriesPerWeek: 2,
  }),
  heavy_beta_grinder: Object.freeze({
    activeDaysPerWeek: 7,
    dailyPetXp: 1600,
    weeklyPetXp: 180,
    trackDaily: { care: 340, training: 310, adventure: 470, arena: 360, job: 310, bond: 220 },
    aptitudeDaily: { brave: 15, loyal: 18, clever: 14, stylish: 10, tough: 16, lucky: 10 },
    dailyJourneyCompletionRate: 1,
    weeklyCrestsPerWeek: 1,
    bossVictoriesPerWeek: 2,
  }),
});

const stages = evolutions.map(({ stage, name }) => ({ stage, name }));
assert.deepEqual(stages, [
  { stage: 0, name: 'Moon Egg' },
  { stage: 1, name: 'Street Moonpet' },
  { stage: 2, name: 'Cyber Moonpet' },
  { stage: 3, name: 'Elite Moonpet' },
  { stage: 4, name: 'Moon Guardian' },
  { stage: 5, name: 'Legendary Moon Guardian' },
]);

assert.deepEqual(PET_XP_SOURCE_AUDIT, [
  'care_actions',
  'train',
  'sleep',
  'work',
  'daily_chest',
  'timed_activities',
  'moon_runs',
  'daily_moon_run',
  'weekly_journey',
  'arena',
  'kaiju',
  'seasonal_boss',
  'district_story_event_systems',
  'reward_settlement_helpers',
  'mini_app_action_paths',
  'telegram_command_paths',
]);
assert.deepEqual(Object.keys(SPECIALIST_SOURCE_AUDIT), Object.keys(PET_PROGRESSION_TRACKS));
assert.deepEqual(APTITUDE_SOURCE_AUDIT, ['brave', 'loyal', 'clever', 'stylish', 'tough', 'lucky']);

function activeOnDay(profile, day) {
  return ((day - 1) % 7) < profile.activeDaysPerWeek;
}

function blankTrackState() {
  return Object.fromEntries(Object.keys(PET_PROGRESSION_TRACKS).map((track) => [track, 0]));
}

function clampRate(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function accrueDailyJourneyMarks(accumulator, rate) {
  let nextAccumulator = accumulator + clampRate(rate);
  let awarded = 0;
  while (nextAccumulator >= 1) {
    awarded += 1;
    nextAccumulator -= 1;
  }
  return { awarded, accumulator: nextAccumulator };
}

function simulateActiveDayGrowthMarks(rate, activeDays) {
  let marks = 0;
  let accumulator = 0;
  for (let day = 0; day < activeDays; day += 1) {
    const result = accrueDailyJourneyMarks(accumulator, rate);
    marks += result.awarded;
    accumulator = result.accumulator;
  }
  return marks;
}

assert.ok([76, 77].includes(simulateActiveDayGrowthMarks(0.85, 90)),
  '0.85 daily journey completion rate over 90 active days must award about 76-77 Growth Marks');
assert.equal(simulateActiveDayGrowthMarks(1, 90), 90, '1.0 daily journey completion rate awards one Growth Mark per active day');
assert.equal(simulateActiveDayGrowthMarks(0, 90), 0, '0 daily journey completion rate awards zero Growth Marks');

function simulateProfile(profile) {
  let petXp = 0;
  let marks = 0;
  let dailyJourneyAccumulator = 0;
  let crests = 0;
  let stage = 0;
  let hatchProgress = 0;
  let hatchedDay = null;
  let bossVictories = 0;
  let relics = 0;
  let arenaAvailableDay = null;
  const materials = { scrap_metal: 0, evolution_fragment: 0 };
  const tracks = blankTrackState();
  const aptitudes = Object.fromEntries(APTITUDE_SOURCE_AUDIT.map((key) => [key, 0]));
  const reached = new Map([[0, 0]]);
  const checkpoints = new Map();

  for (let day = 1; day <= 90; day += 1) {
    const active = activeOnDay(profile, day);
    if (active) {
      petXp += Math.min(PET_DAILY_XP_CAP, profile.dailyPetXp);
      const journeyMarks = accrueDailyJourneyMarks(dailyJourneyAccumulator, profile.dailyJourneyCompletionRate);
      marks += journeyMarks.awarded;
      dailyJourneyAccumulator = journeyMarks.accumulator;
      hatchProgress += 1;
      materials.scrap_metal += 2;
      materials.evolution_fragment += 1;
      if (marks > 0 && marks % 5 === 0) relics = Math.max(relics, Math.floor(marks / 5));
      for (const [track, amount] of Object.entries(profile.trackDaily)) {
        tracks[track] += Math.min(PET_PROGRESSION_TRACKS[track].max_daily_award, amount);
      }
      for (const [aptitude, amount] of Object.entries(profile.aptitudeDaily)) {
        aptitudes[aptitude] += Math.min(25, amount);
      }
    }
    if ((day - 1) % 7 === 0 && profile.weeklyCrestsPerWeek > 0) {
      crests += profile.weeklyCrestsPerWeek;
      bossVictories += profile.bossVictoriesPerWeek;
      petXp += Math.min(PET_DAILY_XP_CAP, profile.weeklyPetXp);
    }
    if (!hatchedDay && day >= 7 && hatchProgress >= 7) hatchedDay = day;
    if (!hatchedDay && day === 14) hatchedDay = day;

    const level = getPetVisibleLevel(petXp);
    if (!arenaAvailableDay && hatchedDay && level >= ARENA_LEVEL) arenaAvailableDay = day;

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

    if (CHECKPOINT_DAYS.includes(day)) {
      checkpoints.set(day, {
        day,
        pet_xp: petXp,
        visible_level: level,
        specialist_totals: { ...tracks },
        specialist_levels: Object.fromEntries(Object.entries(tracks).map(([track, xp]) => [track, getPetTrackLevel(xp)])),
        learned_aptitudes: { ...aptitudes },
        growth_marks: marks,
        weekly_crests: crests,
        arena_available_day: arenaAvailableDay,
        legendary_day: reached.get(5) || null,
      });
    }
  }

  return { checkpoints, reached, stage, hatchedDay, arenaAvailableDay };
}

const simulations = Object.fromEntries(Object.entries(PROFILE_PATTERNS)
  .map(([name, profile]) => [name, simulateProfile(profile)]));

const lightDay90 = simulations.light_casual.checkpoints.get(90);
assert.ok(lightDay90.visible_level >= 10 && lightDay90.visible_level < 20, 'light casual play shows visible growth without maxing early beta');
assert.equal(lightDay90.weekly_crests, 0, 'light casual play does not imply Weekly Crest completion');
assert.ok(simulations.light_casual.stage < 5, 'light casual play does not guarantee Legendary');

const normalDay14 = simulations.normal_daily.checkpoints.get(14);
const normalDay90 = simulations.normal_daily.checkpoints.get(90);
assert.ok(normalDay14.visible_level >= 10, 'normal daily play can reach Level 10 without completed-season authority');
assert.ok(simulations.normal_daily.arenaAvailableDay >= 7 && simulations.normal_daily.arenaAvailableDay <= 14,
  'normal daily play opens Arena after hatch, not instantly on day 1');
assert.ok(normalDay90.visible_level >= 20 && normalDay90.visible_level < 35, 'normal daily play is steady but does not max visible levels');
assert.equal(simulations.normal_daily.reached.get(5), undefined, 'normal daily play does not shorten Legendary into guaranteed completion');

const strongDay30 = simulations.strong_daily.checkpoints.get(30);
const strongDay90 = simulations.strong_daily.checkpoints.get(90);
assert.ok(strongDay30.visible_level >= 20 && strongDay30.visible_level < 30, 'strong daily play is ahead by Day 30 without trivial Level 30');
assert.ok(strongDay90.visible_level < 50, 'strong daily play still leaves Level 50 as a late heavy target');

const heavyDay1 = simulations.heavy_beta_grinder.checkpoints.get(1);
const heavyDay7 = simulations.heavy_beta_grinder.checkpoints.get(7);
const heavyDay90 = simulations.heavy_beta_grinder.checkpoints.get(90);
assert.ok(heavyDay1.visible_level < 10, 'heavy beta grinder cannot reach Level 10 on Day 1 through capped Pet XP');
assert.ok(heavyDay7.visible_level >= 10, 'heavy beta grinder can be ahead once hatch timing allows Arena');
assert.ok(heavyDay90.visible_level >= 50 && heavyDay90.visible_level < 60, 'heavy beta grinder reaches Level 50 late without approaching Level 100');
assert.ok(simulations.heavy_beta_grinder.reached.get(5) >= 78 && simulations.heavy_beta_grinder.reached.get(5) <= 90,
  'heavy capped play reaches Legendary only inside the intended Day 78-90 window');

for (const snapshot of Object.values(simulations).flatMap((simulation) => [...simulation.checkpoints.values()])) {
  assert.ok(snapshot.visible_level < 100, `Day ${snapshot.day} profile remains below Level 100`);
  for (const [track, total] of Object.entries(snapshot.specialist_totals)) {
    assert.ok(total >= 0, `${track} specialist XP is tracked`);
    assert.ok(snapshot.specialist_levels[track] <= snapshot.visible_level,
      `${track} specialist level remains slower than visible level at Day ${snapshot.day}`);
  }
  for (const aptitude of APTITUDE_SOURCE_AUDIT) {
    assert.ok(Number.isFinite(snapshot.learned_aptitudes[aptitude]), `${aptitude} aptitude progress is simulated`);
  }
}

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
