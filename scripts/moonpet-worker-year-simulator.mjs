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
  const bossWins=sql.prepare(`SELECT COUNT(*) AS count FROM telegram_pet_run_analytics
    WHERE pet_id=? AND event_type='boss_fought'
      AND json_extract(event_data,'$.outcome')='win'
      AND json_extract(event_data,'$.boss_id')='alley_king'`).get(pet.petId).count;
  const evolutions=sql.prepare('SELECT evolution_id,stage FROM telegram_pet_evolutions_by_pet WHERE pet_id=? ORDER BY stage').all(pet.petId);
  const runRows=sql.prepare('SELECT status,COUNT(*) AS count FROM telegram_pet_runs WHERE pet_id=? GROUP BY status').all(pet.petId);
  const runStatus=Object.fromEntries(runRows.map(row=>[row.status,n(row.count)]));
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
    runStatus,evolutions,
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
  const f=makeFixture(()=>Date.now());
  const pet=f.createPlayer(owner);
  const actions={attempts:0,accepted:0,rejected:0,byReason:{},byAction:{}};
  const dailyRuns={started:0,completed:0,failed:0,other:0,steps:0};
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
  try {
    for(let day=0;day<days;day++){
      // Six ordinary, legal Worker care/economy actions in staggered time.
      // Sleep before Train avoids the known `pet_tired` failure after decay.
      for(const [minute,action,payload] of [
        [0,'sleep',{}],[2,'feed',{}],[4,'play',{}],[6,'clean',{}],
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
      // One actual weekly boss attempt if the Worker says it is available.
      // Never force the damage or choose an unadvertised attack.
      setTime(startAt+day*WORKER_YEAR_DAY_MS+36*60_000);
      const state=await hooks.buildPetMiniAppState(f.db,owner,'fixture-token');
      const boss=state.guidance?.weekly_boss;
      if(boss?.available){
        const choices=Array.isArray(boss.choices)?boss.choices:[];
        const move=choices.find(choice=>choice.key==='strike')||choices[0];
        if(move?.key)await safeAction(day,36,'weekly_boss',{move:move.key,pet_id:pet.petId});
      }
      if(CHECKPOINT_DAYS.has(day+1)||day+1===days){
        const point=status(f,pet,day+1);
        if(point.growthMarks!==point.distinctGrowthDays)throw new Error('duplicate Growth Mark day');
        if(point.weeklyCrests!==point.distinctQualificationWeeks)throw new Error('duplicate weekly Crest qualification');
        if(point.relics!==point.distinctRelics)throw new Error('relic inventory contains duplicate IDs');
        checkpoints.push(point);
        await onCheckpoint(point);
      }
    }
    const final=checkpoints[checkpoints.length-1]??status(f,pet,days);
    const targets=WORKER_YEAR_TARGETS;
    const ageReached=days>=targets.days;
    const qualified=ageReached &&
      final.growthMarks>=targets.marks && final.weeklyCrests>=targets.crests &&
      final.level>=targets.level && final.alleyKingWins>=targets.bossVictories &&
      final.relics>=targets.relics && final.materials.scrapMetal>=targets.scrapMetal &&
      final.materials.evolutionFragments>=targets.evolutionFragments &&
      final.evolutions.some(e=>e.evolution_id==='legendary_moon_guardian');
    return {days,startAt:new Date(startAt).toISOString(),owner,actions,dailyRuns,checkpoints,final,targets,
      legendaryVerified:qualified,
      blockers:Object.entries({
        age:ageReached,marks:final.growthMarks>=targets.marks,crests:final.weeklyCrests>=targets.crests,
        level:final.level>=targets.level,bosses:final.alleyKingWins>=targets.bossVictories,
        relics:final.relics>=targets.relics,scrap:final.materials.scrapMetal>=targets.scrapMetal,
        fragments:final.materials.evolutionFragments>=targets.evolutionFragments,
        evolution:final.evolutions.some(e=>e.evolution_id==='legendary_moon_guardian'),
      }).filter(([,ok])=>!ok).map(([name])=>name)};
  }finally{f.close();}
}
