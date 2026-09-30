import engine from '../../../js/moonpet-practice.js';
import { requirePetFirstReadResult, requirePetReadResult } from './read-result.js';
import { readOwnedRelics, initializeRelicRoute, relicNames, relicRouteChoices, relicRouteSuccess, relicSearchSalvage } from './relic-passives.js';
export const PRACTICE_BONUS_XP=10;
export const PRACTICE_BONUS_LIMIT=3;
const day=now=>now.toISOString().slice(0,10);
const GUARD=`EXISTS (SELECT 1 FROM telegram_pet_instances p JOIN telegram_pet_active_slots a
  ON a.pet_id=p.pet_id AND a.telegram_id=p.telegram_id AND a.season_key=p.season_key
  JOIN telegram_pet_lifecycle_by_pet l ON l.pet_id=p.pet_id AND l.telegram_id=p.telegram_id
  JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
  WHERE p.pet_id=? AND p.telegram_id=? AND p.season_key=? AND p.status='active' AND l.phase<>'egg')`;
const OWNED=`FROM telegram_pet_practice c JOIN telegram_pet_instances p ON p.pet_id=c.pet_id AND p.telegram_id=c.telegram_id AND p.season_key=c.season_key
  JOIN telegram_pet_season_slots s ON s.pet_id=p.pet_id AND s.telegram_id=p.telegram_id AND s.season_key=p.season_key AND s.slot_number=p.slot_number
  WHERE c.telegram_id=?`;
export function practiceChoices(s) {
  if(s.status!=='active')return [];
  if(s.draft.length)return s.draft.map(key=>({key,...engine.perks[key],upgrade:true}));
  const boss=s.depth===11;
  return relicRouteChoices(s,engine.choices(s).map(c=>c.key==='rest'&&boss?{...c,disabled:true,detail:'Clear the final boss with a route; rest cannot win.'}:c),{boss,graffiti:engine.room(s).title==='Graffiti Junction'});
}
export function advancePractice(s,choice,revision,roll,rareRoll) {
  const boss=s.depth===11;
  return engine.step(s,choice,revision,{choices:practiceChoices(s),roll,boss,
    success:(state,ok)=>relicRouteSuccess(state,ok,boss),salvageBonus:relicSearchSalvage(s,choice,rareRoll),restBonus:s.relics?.includes('neon_boots')?1:0});
}
function project(row) {
  if(!row)return null;
  const s=JSON.parse(row.state_json),{seed,...visible}=s;
  return {...visible,run_id:row.run_id,revision:row.revision,choices:practiceChoices(s),room:engine.room(s),goal_progress:engine.goalProgress(s),
    relics:relicNames(s.relics),reward_pending:row.reward_xp>0&&!row.reward_settled,xp_awarded:row.xp_awarded,rank_points:row.rank_points};
}
export async function getPracticeBoard(db,owner,pet,now=new Date()) {
  const pending=requirePetReadResult(await db.prepare(`SELECT c.run_id,c.pet_id,c.reward_day ${OWNED} AND c.reward_xp=10 AND c.reward_settled=0 ORDER BY c.created_at,c.run_id LIMIT 10`).bind(owner).all()).results;
  if(!pet?.pet_id||!requirePetFirstReadResult(await db.prepare(`SELECT 1 WHERE ${GUARD}`).bind(pet.pet_id,owner,pet.season_key).first())) return {available:false,reason:'hatch_required',pending_rewards:pending};
  const [stats,row,bonuses]=await Promise.all([
    db.prepare('SELECT COALESCE(MAX(sequence),0)+1 next_sequence,COALESCE(SUM(rank_points),0) rank_points,COALESCE(SUM(CASE WHEN rank_points>0 THEN 1 ELSE 0 END),0) completed FROM telegram_pet_practice WHERE telegram_id=? AND pet_id=? AND season_key=?').bind(owner,pet.pet_id,pet.season_key).first().then(requirePetFirstReadResult),
    db.prepare('SELECT * FROM telegram_pet_practice WHERE telegram_id=? AND pet_id=? AND season_key=? ORDER BY sequence DESC LIMIT 1').bind(owner,pet.pet_id,pet.season_key).first().then(requirePetFirstReadResult),
    db.prepare('SELECT COUNT(*) used FROM telegram_pet_practice WHERE telegram_id=? AND reward_day=? AND reward_xp>0').bind(owner,day(now)).first().then(requirePetFirstReadResult),
  ]);
  return {available:true,pet_id:pet.pet_id,...stats,run:project(row),builds:engine.builds,goals:engine.goals,bonus_remaining:Math.max(0,3-bonuses.used),bonus_xp:10,bonus_limit:3,pending_rewards:pending};
}
async function settle(db,owner,row,award,now) {
  if(!row.reward_xp||row.reward_settled)return {pet_xp_awarded:0};
  const result=await award(db,{telegram_id:owner,pet_id:row.pet_id,season_key:row.season_key,source:'pet_practice',idempotency_key:row.run_id,
    event_key:`practice:${row.run_id}`,event_type:'practice_complete',reason:'practice_bonus',rewards:{pet_xp:10},now,
    context:{run_id:row.run_id,pet_id:row.pet_id,season_key:row.season_key}});
  const receipt=await db.prepare("SELECT applied_rewards FROM telegram_pet_reward_claims WHERE telegram_id=? AND pet_id=? AND source='pet_practice' AND idempotency_key=? AND status='awarded'").bind(owner,row.pet_id,row.run_id).first();
  if(receipt)await db.prepare('UPDATE telegram_pet_practice SET reward_settled=1,xp_awarded=? WHERE run_id=? AND telegram_id=? AND reward_settled=0').bind(Math.min(10,Number(JSON.parse(receipt.applied_rewards).pet_xp)||0),row.run_id,owner).run();
  return {pet_xp_awarded:Number(result.pet_xp_awarded)||0,reward_pending:!receipt};
}
export async function processPracticeAction(db,owner,pet,request,award,now=new Date()) {
  const reject=reason=>({accepted:false,reason,pet_xp_awarded:0});
  let row;
  if(request.action==='practice_claim') {
    row=await db.prepare(`SELECT c.* ${OWNED} AND c.run_id=? AND c.pet_id=? AND c.reward_xp=10 AND c.status='completed'`).bind(owner,String(request.run_id||''),String(request.pet_id||'')).first();
    if(!row)return reject('practice_not_found');
  } else {
    if(!pet?.pet_id||pet.pet_id!==request.pet_id)return reject('practice_pet_changed');
    const args=[pet.pet_id,owner,pet.season_key];
    if(!await db.prepare(`SELECT 1 WHERE ${GUARD}`).bind(...args).first())return reject('practice_pet_changed');
    if(request.action==='practice_start') {
      if(!Number.isSafeInteger(request.sequence)||request.sequence<1)return reject('practice_stale');
      if (typeof request.build !== 'string' || typeof request.goal !== 'string') return reject('practice_invalid_choice');
      const s=engine.create(crypto.randomUUID(),request.build,request.goal);
      if(!s)return reject('practice_invalid_choice');
      initializeRelicRoute(s,await readOwnedRelics(db,owner));
      row=await db.prepare(`INSERT OR IGNORE INTO telegram_pet_practice (run_id,pet_id,telegram_id,season_key,sequence,status,state_json)
        SELECT ?,?,?,?,?,'active',? WHERE ${GUARD}
        AND ?=(SELECT COALESCE(MAX(sequence),0)+1 FROM telegram_pet_practice WHERE telegram_id=? AND pet_id=?)
        AND NOT EXISTS(SELECT 1 FROM telegram_pet_practice WHERE telegram_id=? AND pet_id=? AND status='active') RETURNING *`)
        .bind(crypto.randomUUID(),pet.pet_id,owner,pet.season_key,request.sequence,JSON.stringify(s),...args,request.sequence,owner,pet.pet_id,owner,pet.pet_id).first();
      return row?{accepted:true,reason:'practice_started',result_copy:'Training saved. Clear 12 rooms and your goal to earn progress.'}:reject('practice_stale');
    }
    row=await db.prepare('SELECT * FROM telegram_pet_practice WHERE run_id=? AND telegram_id=? AND pet_id=? AND season_key=?').bind(String(request.run_id||''),owner,pet.pet_id,pet.season_key).first();
    if(!row||request.action!=='practice_step'||row.status!=='active'||request.revision!==row.revision)return reject('practice_stale');
    const s=JSON.parse(row.state_json),random=crypto.getRandomValues(new Uint32Array(2));
    const next=advancePractice(s,request.choice,s.turn,random[0]%100,random[1]%10000);
    if(next.turn===s.turn)return reject('practice_invalid_choice');
    const complete=next.status==='completed'&&engine.goalProgress(next).completed;
    if (next.status === 'completed' && !complete) {
      next.status = 'failed';
      next.last = 'Circuit finished, but the training goal was missed. No rank or XP. Try another build or route.';
    }
    row=await db.prepare(`UPDATE telegram_pet_practice SET state_json=?,status=?,revision=revision+1,rank_points=?,
      reward_xp=CASE WHEN ?=1 AND (SELECT COUNT(*) FROM telegram_pet_practice WHERE telegram_id=? AND reward_day=? AND reward_xp>0)<3 THEN 10 ELSE 0 END,
      reward_day=CASE WHEN ?=1 THEN ? ELSE NULL END
      WHERE run_id=? AND telegram_id=? AND pet_id=? AND revision=? AND status='active' AND ${GUARD} RETURNING *`)
      .bind(JSON.stringify(next),next.status,complete?Math.max(1,next.score):0,complete?1:0,owner,day(now),complete?1:0,day(now),row.run_id,owner,pet.pet_id,request.revision,...args).first();
    if(!row)return reject('practice_stale');
  }
  try{return {accepted:true,reason:'practice_saved',result_copy:JSON.parse(row.state_json).last,...await settle(db,owner,row,award,now)};}
  catch{return {accepted:true,reason:'practice_bonus_pending',reward_pending:row.reward_xp>0,pet_xp_awarded:0};}
}
