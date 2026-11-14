#!/usr/bin/env node
/**
 * Permanent Moonpet progression authority contract.
 *
 * This is NOT a simulation of earning 240 Marks and 44 Crests.
 * It checks that the requirements, source-owned evidence schema, and
 * eligibility calendar remain consistent while full Worker campaigns
 * are implemented in the virtual-player engine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PET_SEASON_COMPLETION_CONFIG,
} from '../workers/moonboys-api/pets/season-completion.js';
import {
  PET_WEEKLY_JOURNEY_OBJECTIVES,
  WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,
  WEEKLY_JOURNEY_TOTAL_OBJECTIVES,
} from '../workers/moonboys-api/pets/weekly-journey.js';
import { getPetXpRequiredForVisibleLevel } from '../workers/moonboys-api/pets/progression-phase-2.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const entries = JSON.parse(read('workers/moonboys-api/pets/content/evolutions.json'));
const legendary = entries.find(entry=>entry.evolution_id==='legendary_moon_guardian');

test('current permanent progression requires age 365, 240 distinct Marks, 44 distinct Crests and level 50',()=>{
  assert.ok(legendary);
  assert.equal(legendary.requirements.min_age_days,365);
  assert.equal(legendary.requirements.growth_marks,240);
  assert.equal(legendary.requirements.weekly_crests,44);
  assert.equal(legendary.requirements.pet_level,50);
  assert.equal(PET_SEASON_COMPLETION_CONFIG.season_days,365);
  assert.equal(PET_SEASON_COMPLETION_CONFIG.required_growth_marks,240);
  assert.equal(PET_SEASON_COMPLETION_CONFIG.required_weekly_crests,44);
  assert.equal(getPetXpRequiredForVisibleLevel(50),96040);
  assert.equal(legendary.requirements.boss_victories.alley_king,15);
  assert.equal(legendary.requirements.relics_owned,10);
  assert.equal(legendary.requirements.inventory.material.scrap_metal,60);
  assert.equal(legendary.requirements.inventory.material.evolution_fragment,40);
});

test('weekly journey cannot award a Crest until all five genuine source objectives qualify',()=>{
  assert.equal(WEEKLY_JOURNEY_TOTAL_OBJECTIVES,5);
  assert.equal(WEEKLY_JOURNEY_REQUIRED_OBJECTIVES,5);
  assert.deepEqual(Object.fromEntries(Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)
    .map(([key,objective])=>[key,objective.target])),{
      weekly_care:5,weekly_training:3,weekly_run:3,weekly_boss_attempt:1,weekly_check_in:2,
    });
});

test('365-day clock provides adequate distinct days and weeks but not awarded evidence',()=>{
  const start=Date.UTC(2026,10,1,8);
  const utcDays = new Set();
  const sevenDayEpochBuckets = new Set();
  for(let day=0;day<365;day++){
    const at=new Date(start+day*86400000);
    utcDays.add(at.toISOString().slice(0,10));
    sevenDayEpochBuckets.add(Math.floor(at.getTime()/604800000));
  }
  assert.equal(utcDays.size,365);
  assert.ok(sevenDayEpochBuckets.size>=52);
  assert.ok(240<=utcDays.size);
  assert.ok(44<=sevenDayEpochBuckets.size);
  // Calendar capacity is not authority to insert or award a receipt.
});

test('real virtual-player harness contains no direct insert of accepted XP, Marks or Crests',()=>{
  const source=read('scripts/moonpet-virtual-player-engine.test.mjs');
  assert.match(source,/dispatchRenderedPetAction/);
  assert.doesNotMatch(source,/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+telegram_pet_growth_marks/i);
  assert.doesNotMatch(source,/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+telegram_pet_weekly_crests/i);
  assert.doesNotMatch(source,/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+telegram_pet_events/i);
});

test('permanent progress receipts must remain source-pet bound',()=>{
  const schema=read('workers/moonboys-api/migrations/058_telegram_pet_season_completion.sql');
  for(const table of ['telegram_pet_growth_marks','telegram_pet_weekly_crests']){
    assert.match(schema,new RegExp('CREATE TABLE IF NOT EXISTS '+table+' \\('));
    assert.match(schema,new RegExp('FOREIGN KEY \\(pet_id, telegram_id, season_key\\)'));
  }
  const weekly=read('workers/moonboys-api/pets/weekly-journey.js');
  assert.match(weekly,/source_event_key|source_event/);
  assert.match(weekly,/weekly_journey_threshold_drift/);
});
