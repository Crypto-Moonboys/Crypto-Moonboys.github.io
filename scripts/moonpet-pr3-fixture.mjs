import assert from 'node:assert/strict';
import { PET_DAILY_CHALLENGES } from '../workers/moonboys-api/pets/daily-moon-run.js';
import { PET_WEEKLY_JOURNEY_OBJECTIVES, recordWeeklyJourneyObjectiveEvidence } from '../workers/moonboys-api/pets/weekly-journey.js';

function qualifyingDaily(f, petId, season) {
  for (const [id, goal] of Object.entries(PET_DAILY_CHALLENGES).slice(0,3)) {
    const key = `qualifying-daily:${id}`;
    f.sql.prepare(`INSERT INTO telegram_pet_daily_journey_objectives
      (event_id,telegram_id,pet_id,season_key,utc_day,challenge_id,event_key,progress_value,status)
      VALUES (?,?,?,?,?,?,?,?, 'accepted')`).run(key,f.owner,petId,season,'2026-10-15',id,key,goal.target);
  }
}
export async function qualifyingWeekly(f, petId, season) {
  const types = { weekly_care:'feed', weekly_training:'train', weekly_run:'run_complete', weekly_boss_attempt:'boss_fought', weekly_check_in:'check_in' };
  for (const [id, goal] of Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES)) {
    for (let n=0;n<goal.target;n++) {
      const key = `qualifying-weekly:${petId}:${id}:${n}`, day = id==='weekly_check_in' && n===1 ? '2026-10-16':'2026-10-15';
      f.sql.prepare(`INSERT INTO telegram_pet_events
        (id,pet_id,telegram_id,event_type,event_key,season_key,day_key,week_key,status)
        VALUES (?,?,?,?,?,?,?,'2026-W42','accepted')`).run(key,petId,f.owner,types[id],key,season,day);
      const saved = await recordWeeklyJourneyObjectiveEvidence(f.db, {
        telegram_id:f.owner,pet_id:petId,season_key:season,qualification_week:3,objective_id:id,source_event_key:key,
      }, { defer_award:true });
      assert.equal(saved.accepted,true);
    }
  }
}
function pendingBoss(f, petId, season) {
  const week='2026-W40', boss=f.hooks.getPetWeeklyBoss(week);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_events
    (event_id,telegram_id,week_key,day_key,boss_id,event_key,action,damage,created_at)
    VALUES ('profile-win',?,?,'2026-10-01',?,'profile-win','strike',?,'2026-10-01T12:00:00.000Z')`).run(f.owner,week,boss.boss_id,boss.hp);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_progress
    (telegram_id,week_key,boss_id,damage,attempts,defeated_at)
    VALUES (?,?,?,?,1,'2026-10-01T12:00:00.000Z')`).run(f.owner,week,boss.boss_id,boss.hp);
  f.sql.prepare(`INSERT INTO telegram_pet_weekly_boss_victories_by_pet
    (telegram_id,week_key,boss_id,pet_id,season_key,victory_event_key,defeated_at)
    VALUES (?,?,?,?,?,'profile-win','2026-10-01T12:00:00.000Z')`).run(f.owner,week,boss.boss_id,petId,season);
}

export async function seedPr3Recovery(f,{archived=false}={}) {
const petId='current-'+f.owner,season='pet-s2026-004';
f.sql.prepare("UPDATE telegram_pet_season_slots SET journey_clock='created_at',created_at='2026-10-01 00:00:00' WHERE pet_id=?").run(petId);
qualifyingDaily(f,petId,season);await qualifyingWeekly(f,petId,season);pendingBoss(f,petId,season);
if(archived){f.active('fixture-space-2',season);for(const table of ['telegram_pet_instances','telegram_pet_season_slots']) f.sql.prepare(`UPDATE ${table} SET status='archived' WHERE pet_id=?`).run(petId);}
}
