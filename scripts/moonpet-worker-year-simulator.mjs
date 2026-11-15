/**
 * REAL Worker-backed same-pet virtual calendar campaign.
 *
 * All progression is earned via dispatchRenderedPetAction -> production Worker.
 * No manual XP, Marks, Crests, inventory, wins, or evolution writes.
 * Returned metrics are evidence, not a claim that Legendary is achievable.
 */
import { makeFixture } from './moonpet-worker-virtual-player.mjs';
import { selectConservativeDailyChoice } from './moonpet-run-risk-policy.mjs';
import { __petMediaTestHooks as hooks } from '../workers/moonboys-api/worker.js';
import { getPetVisibleLevel } from '../workers/moonboys-api/pets/progression-phase-2.js';
import { buildPetLifecycleProgress } from '../workers/moonboys-api/pets/season-completion.js';
import { dailyTacticalBoard } from '../workers/moonboys-api/pets/daily-run-tactics.js';
import { PET_WEEKLY_JOURNEY_OBJECTIVES } from '../workers/moonboys-api/pets/weekly-journey.js';

export const WORKER_YEAR_DAY_MS=86_400_000;
export const WORKER_YEAR_START=Date.parse('2026-11-02T08:00:00.000Z');
export const WORKER_YEAR_TARGETS=Object.freeze({
  days:365,marks:240,crests:44,level:50,bossVictories:15,relics:10,scrapMetal:60,evolutionFragments:40,
});
const CHECKPOINT_DAYS=new Set([7,30,90,365]);

function n(value){return Number(value||0);}
function status(f,pet,days){
  const {sql}=f;
  const xp=n(sql.prepare('SELECT pet_xp FROM telegram_pet_instances WHERE pet_id=?').get(pet.petId)?.pet_xp);
  const marks=sql.prepare('SELECT earned_day FROM telegram_pet_growth_marks WHERE pet_id=?').all(pet.petId);
  const crestRows=sql.prepare('SELECT qualification_week FROM telegram_pet_weekly_crests WHERE pet_id=?').all(pet.petId);
  const relicRows=sql.prepare('SELECT relic_id FROM telegram_pet_relics WHERE telegram_id=?').all(pet.owner);
  const materials=sql.prepare('SELECT material_key,quantity FROM telegram_pet_material_balances WHERE telegram_id=?').all(pet.owner);
  const material=Object.fromEntries(materials.map(row=>[row.material_key,n(row.quantity)]));
  // Evolution authority reads the per-pet boss-victory ledger, not the
  // analytics stream, so the annual audit uses the same authoritative source.
  const bossWins=sql.prepare(`SELECT victories AS count FROM telegram_pet_boss_victories
    WHERE pet_id=? AND boss_id='alley_king'`).get(pet.petId)?.count||0;
  const evolutions=sql.prepare('SELECT evolution_id,stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=? ORDER BY stage').all(pet.petId);
  const runRows=sql.prepare('SELECT status,COUNT(*) AS count FROM telegram_pet_runs WHERE pet_id=? GROUP BY status').all(pet.petId);
  const runStatus=Object.fromEntries(runRows.map(row=>[row.status,n(row.count)]));
  // Match weekly objective rows to accepted Worker receipts, never to raw
  // button attempts. Distinct check-in days are counted separately.
  const weeklyEvidence=sql.prepare(`SELECT o.qualification_week AS week,o.objective_id,
      COUNT(*) AS receipts,COUNT(DISTINCT e.day_key) AS distinct_days,SUM(o.progress_value) AS units
    FROM telegram_pet_weekly_journey_objectives o JOIN telegram_pet_events e
      ON e.telegram_id=o.telegram_id AND e.pet_id=o.pet_id AND e.season_key=o.season_key
        AND e.event_key=o.source_event_key AND e.event_type=o.source_event_type AND e.status='accepted'
    WHERE o.pet_id=? AND o.status='accepted'
    GROUP BY o.qualification_week,o.objective_id ORDER BY o.qualification_week,o.objective_id`).all(pet.petId);
  const weeklyByWeek={};
  for(const row of weeklyEvidence){
    const week=String(row.week),definition=PET_WEEKLY_JOURNEY_OBJECTIVES[row.objective_id];
    const progress=row.objective_id==='weekly_check_in'?n(row.distinct_days):
      definition?.progress_mode==='max'?Math.min(1,n(row.units)):n(row.units);
    (weeklyByWeek[week]??={})[row.objective_id]={progress,target:definition?.target??null,
      sourceReceipts:n(row.receipts),distinctDays:n(row.distinct_days)};
  }
  const dailyObjectives=sql.prepare(`SELECT challenge_id,COUNT(DISTINCT utc_day) AS days,COUNT(*) AS receipts
    FROM telegram_pet_daily_journey_objectives WHERE pet_id=? AND status='accepted'
    GROUP BY challenge_id ORDER BY challenge_id`).all(pet.petId);
  const qualifyingWeeks=Object.entries(weeklyByWeek).filter(([,objectives])=>
    Object.entries(PET_WEEKLY_JOURNEY_OBJECTIVES).every(([key,definition])=>
      n(objectives[key]?.progress)>=definition.target)).map(([week])=>n(week));
  const savedCrestWeeks=new Set(crestRows.map(row=>n(row.qualification_week)));
  const fullyQualifiedButUnsettledWeeks=qualifyingWeeks.filter(week=>!savedCrestWeeks.has(week));
  const distinctMarks=new Set(marks.map(row=>row.earned_day)).size;
  const distinctCrests=new Set(crestRows.map(row=>row.qualification_week)).size;
  const distinctRelics=new Set(relicRows.map(row=>row.relic_id)).size;
  const level=getPetVisibleLevel(xp);
  return {
    days,petId:pet.petId,petXp:xp,level,
    growthMarks:marks.length,distinctGrowthDays:distinctMarks,
    weeklyCrests:crestRows.length,distinctQualificationWeeks:distinctCrests,
    relics:relicRows.length,distinctRelics,
    alleyKingWins:n(bossWins),materials:{scrapMetal:n(material.scrap_metal),evolutionFragments:n(material.evolution_fragment)},
    runStatus,evolutions,weeklyByWeek,dailyObjectives,qualifyingWeeks,fullyQualifiedButUnsettledWeeks,
    verifiedFromWorkerPersistedRows:true,
  };
}

/**
 * Call with an isolated, controllable mock clock. `setTime` must advance
 * global Date to the requested epoch; makeFixture wraps CURRENT_TIMESTAMP too.
 */
export async function simulateWorkerCampaign({days=7,startAt=WORKER_YEAR_START,
  owner='worker-year-player',setTime,onCheckpoint=()=>{},maxRunSteps=10}={}){
  if(!Number.isInteger(days)||days<1||days>365)throw new RangeError('days must be 1..365');
  if(!Number.isFinite(startAt)||typeof setTime!=='function')throw new TypeError('controlled UTC clock required');
  setTime(startAt);
  const f=makeFixture(()=>Date.now(),{startingEggEvolution:true});
  const pet=f.createPlayer(owner);
  const actions={attempts:0,accepted:0,rejected:0,byReason:{},byAction:{}};
  const dailyRuns={started:0,completed:0,failed:0,other:0,steps:0,tactics:0};
  const weeklyBoss={previews:0,offered:0,attempts:0,accepted:0,rejected:0,unavailableByReason:{},samplePreviews:[]};
  const checkpoints=[];
  const safeAction=async(day,minute,action,payload={})=>{
    setTime(startAt+day*WORKER_YEAR_DAY_MS+minute*60_000);
    const response=await f.action(owner,action,{request_id:`year:${day}:${minute}:${action}`,...payload});
    actions.attempts++;
    const key=response.accepted&&!response.duplicate?'accepted':'rejected';
    actions[key]++;
    const entry=actions.byAction[action]??{accepted:0,rejected:0};
    entry[key]++;
    actions.byAction[action]=entry;
    if(key==='rejected') {
      const reason=String(response.reason|| (response.duplicate?'duplicate':'unknown'));
      actions.byReason[reason]=(actions.byReason[reason]||0)+1;
    }
    return response;
  };
  // Weekly boss attempts qualify only when actually accepted by the
  // production Worker. Preview before the energy-draining Daily Run, then
  // inspect again after it only if an earlier attempt was never dispatched.
  const tryWeeklyBoss=async(day,minute,phase)=>{
    setTime(startAt+day*WORKER_YEAR_DAY_MS+minute*60_000);
    const state=await hooks.buildPetMiniAppState(f.db,owner,'fixture-token');
    const boss=state.guidance?.weekly_boss;
    const saved=f.sql.prepare('SELECT pet_xp,energy,health FROM telegram_pet_instances WHERE pet_id=?').get(pet.petId);
    weeklyBoss.previews++;
    const snapshot={day,phase,available:Boolean(boss?.available),
      level:getPetVisibleLevel(n(saved?.pet_xp)),energy:n(saved?.energy),health:n(saved?.health),
      choices:Array.isArray(boss?.choices)?boss.choices.map(choice=>choice.key):[],
      reason:boss?.reason||boss?.unavailable_reason||boss?.locked_reason||null};
    if(weeklyBoss.samplePreviews.length<15 && (day<5 || day%7===0 || boss?.available))
      weeklyBoss.samplePreviews.push(snapshot);
    if(!boss?.available){
      const reason=snapshot.reason||(!boss?'guidance_missing':'boss_not_available');
      weeklyBoss.unavailableByReason[reason]=(weeklyBoss.unavailableByReason[reason]||0)+1;
      return {attempted:false,accepted:false};
    }
    weeklyBoss.offered++;
    const choices=Array.isArray(boss.choices)?boss.choices.filter(choice=>choice?.key && choice.available!==false):[];
    const move=choices.find(choice=>choice.key==='strike')||choices[0];
    if(!move){
      weeklyBoss.unavailableByReason.no_legal_move=(weeklyBoss.unavailableByReason.no_legal_move||0)+1;
      return {attempted:false,accepted:false};
    }
    const result=await safeAction(day,minute,'weekly_boss',{move:move.key,pet_id:pet.petId});
    weeklyBoss.attempts++;
    if(result.accepted&&!result.duplicate)weeklyBoss.accepted++;
    else weeklyBoss.rejected++;
    return {attempted:true,accepted:Boolean(result.accepted&&!result.duplicate)};
  };
  try {
    for(let day=0;day<days;day++){
      // The daily decay spends roughly 53 Energy over 24h. The prior
      // strategy attempted the boss AFTER Train and Work, leaving only 5
      // Energy even at level five. Recover via genuine Sleep, then preview
      // the boss BEFORE those activities spend Energy. The same real Worker
      // enforces the level-five gate and 12-Energy attack cost.
      await safeAction(day,0,'sleep');
      const preRunBoss=await tryWeeklyBoss(day,1,'after_sleep');
      for(const [minute,action,payload] of [
        [2,'feed',{}],[4,'play',{}],[6,'clean',{}],
        [8,'train',{}],[10,'daily_chest',{}],[12,'work',{job_key:'street_artist'}],
      ])await safeAction(day,minute,action,payload);
      // Exactly one official Daily Moon Run attempt per UTC day. Read all
      // available choices from the Worker. Failed rooms terminate; no rerolls.
      const started=await safeAction(day,20,'daily_run_start');
      if(started.accepted&&!started.duplicate){
        dailyRuns.started++;
        const row=f.sql.prepare(`SELECT run_id,pet_id,status,current_room FROM telegram_pet_runs
          WHERE telegram_id=? ORDER BY rowid DESC LIMIT 1`).get(owner);
        if(row?.pet_id!==pet.petId)throw new Error('run pet attribution mismatch');
        if(row?.run_id) {
          for(let step=0;step<maxRunSteps;step++){
            const liveRow=f.sql.prepare('SELECT status,current_room FROM telegram_pet_runs WHERE run_id=?').get(row.run_id);
            if(!liveRow||!['active','extractable'].includes(liveRow.status))break;
            setTime(startAt+day*WORKER_YEAR_DAY_MS+(21+step)*60_000);
            // This official V2 tactic is offered only at genuine saved
            // run checkpoints 3 and 6. It improves future odds, but cannot
            // override a failed roll or create an unearned completion.
            const modifiers=f.sql.prepare(`SELECT modifier_id,effects_json FROM telegram_pet_run_modifiers
              WHERE run_id=? AND telegram_id=? ORDER BY modifier_id`).all(row.run_id,owner);
            const board=dailyTacticalBoard({status:liveRow.status,current_room:n(liveRow.current_room)},modifiers);
            if(board.offers.some(offer=>offer.key==='guardian')){
              const tactic=await safeAction(day,21+step,'daily_run_tactic',{
                run_id:row.run_id,checkpoint:n(liveRow.current_room),tactic_id:'guardian',
              });
              if(tactic.accepted&&!tactic.duplicate)dailyRuns.tactics++;
            }
            const live=await hooks.buildPetMiniAppState(f.db,owner,'fixture-token');
            const choice=selectConservativeDailyChoice(live.run?.choices||[]);
            if(!choice?.key)break;
            const result=await safeAction(day,21+step,'run_step',{
              run_id:row.run_id,choice_key:choice.key,expected_step_index:n(liveRow.current_room),
            });
            dailyRuns.steps++;
            if(!result.accepted||result.reason==='daily_room_failed')break;
          }
          const terminal=f.sql.prepare('SELECT status FROM telegram_pet_runs WHERE run_id=?').get(row.run_id)?.status;
          if(terminal==='completed'||terminal==='extracted')dailyRuns.completed++;
          else if(terminal==='failed')dailyRuns.failed++;
          else dailyRuns.other++;
        }
      }
      // Run XP may unlock Level 5 today, but run combat can leave the pet
      // too tired for the boss. Recharge with a genuine, cooldown-spaced
      // Sleep before checking the Worker again. No manual stat writes.
      if(!preRunBoss.attempted){
        await safeAction(day,35,'sleep');
        await tryWeeklyBoss(day,36,'after_run_recovery');
      }
      // Only evolve when server-side eligibility is satisfied; the Worker
      // performs all required material debits and persists stages 1..5.
      // Stage zero is a fixture starting condition, not an earned reward.
      setTime(startAt+day*WORKER_YEAR_DAY_MS+40*60_000);
      const seasonKey=f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(pet.petId).season_key;
      const evolution=await buildPetLifecycleProgress(f.db,pet.petId,seasonKey,new Date(),{telegram_id:owner});
      if(evolution?.evolution_ready && evolution.next_evolution?.evolution_id){
        await safeAction(day,40,'evolve',{pet_id:pet.petId,evolution_id:evolution.next_evolution.evolution_id});
      }
      if(CHECKPOINT_DAYS.has(day+1)||day+1===days){
        // An adoption at day 0 is 365 full days old at day 365, not at
        // the start of day 364. Advance to the next day's 08:00 boundary
        // before reporting elapsed-age checkpoint evidence.
        setTime(startAt+(day+1)*WORKER_YEAR_DAY_MS);
        const point=status(f,pet,day+1);
        if(point.growthMarks!==point.distinctGrowthDays)throw new Error('duplicate Growth Mark day');
        if(point.weeklyCrests!==point.distinctQualificationWeeks)throw new Error('duplicate weekly Crest qualification');
        if(point.relics!==point.distinctRelics)throw new Error('relic inventory contains duplicate IDs');
        checkpoints.push(point);
        await onCheckpoint(point);
      }
    }
    // Legendary is age-gated at *365 elapsed days*, after the day-364
    // actions. Attempt its real Worker evolution at the anniversary; do
    // not misreport an eligible-but-unclaimed evolution as impossible.
    if(days===365){
      setTime(startAt+365*WORKER_YEAR_DAY_MS+60_000);
      const seasonKey=f.sql.prepare('SELECT season_key FROM telegram_pet_instances WHERE pet_id=?').get(pet.petId).season_key;
      const anniversary=await buildPetLifecycleProgress(f.db,pet.petId,seasonKey,new Date(),{telegram_id:owner});
      if(anniversary?.evolution_ready && anniversary.next_evolution?.evolution_id){
        await safeAction(365,1,'evolve',{pet_id:pet.petId,evolution_id:anniversary.next_evolution.evolution_id});
      }
      const last=status(f,pet,days);
      checkpoints[checkpoints.length-1]=last;
      await onCheckpoint(last);
    }
    const final=checkpoints[checkpoints.length-1]??status(f,pet,days);
    const targets=WORKER_YEAR_TARGETS;
    const ageReached=Date.now()-startAt>=targets.days*WORKER_YEAR_DAY_MS;
    const legendaryPersisted=final.evolutions.some(e=>e.evolution_id==='legendary_moon_guardian');
    // Materials may have been spent by legitimate evolution settlement.
    // The authoritative persisted Legendary row verifies their sufficiency.
    const qualified=ageReached && legendaryPersisted &&
      final.growthMarks>=targets.marks && final.weeklyCrests>=targets.crests &&
      final.level>=targets.level && final.alleyKingWins>=targets.bossVictories &&
      final.relics>=targets.relics;
    return {days,startAt:new Date(startAt).toISOString(),owner,actions,dailyRuns,weeklyBoss,checkpoints,final,targets,
      legendaryVerified:qualified,
      blockers:Object.entries({
        age:ageReached,marks:final.growthMarks>=targets.marks,crests:final.weeklyCrests>=targets.crests,
        level:final.level>=targets.level,bosses:final.alleyKingWins>=targets.bossVictories,
        relics:final.relics>=targets.relics,
        // After evolution the inventory is legitimately debited: report
        // remaining quantities in checkpoints, do not mislabel spending as
        // failure once stage-five settlement has been recorded.
        scrap:legendaryPersisted||final.materials.scrapMetal>=targets.scrapMetal,
        fragments:legendaryPersisted||final.materials.evolutionFragments>=targets.evolutionFragments,
        evolution:legendaryPersisted,
      }).filter(([,ok])=>!ok).map(([name])=>name)};
  }finally{f.close();}
}
