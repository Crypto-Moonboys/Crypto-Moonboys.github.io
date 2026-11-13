// Engagement reads credited messages and settled payouts; never reserves or sends tokens.
import { utcDay, previousDay, previousWeek, rankFor } from './core.js';
import { sendControlledMoonboyTelegram, moonboyTelegramMessageSeed } from '../telegram/moonboy-message-gateway.js';

const DAY = 86400000;
const idOrder = (a,b) => String(a).length-String(b).length ||
  (String(a)<String(b)?-1:String(a)>String(b)?1:0);
const label = value => String(value || 'Tagger')
  .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,70);
async function all(db, sql, ...args) {
  const r = await db.prepare(sql).bind(...args).all();
  if (r?.success !== true || !Array.isArray(r.results)) throw new Error('engagement_read_failed');
  return r.results;
}
export function missionFor(day, telegramId) {
  // Stable per-person daily assignment; no resets from reopening the command.
  const n = [...day + String(telegramId)].reduce((sum,c)=>sum+c.charCodeAt(0),0);
  return n%2 ? 'conversation' : 'steady';
}
export function missionProgress(kind, stats) {
  const replies = Number(stats?.targets || 0);
  const posts = Number(stats?.posts || 0);
  const span = Number(stats?.last || 0)-Number(stats?.first || 0);
  return kind === 'conversation'
    ? { complete: replies>=2, text: 'Reply to 2 different members in credited messages: '+Math.min(2,replies)+'/2' }
    : { complete: posts>=3 && span>=600, text: '3 credited messages over at least 10 minutes: '+
      Math.min(3,posts)+'/3 · '+Math.min(10,Math.floor(Math.max(0,span)/60))+'/10 min' };
}
export async function personalTagRun(env, telegramId, nowMs) {
  if (env.TAG_RUN_ENGAGEMENT_ENABLED !== 'true') return 'TAG RUN dashboard is not enabled yet.';
  const day=utcDay(nowMs), db=env.DB, chat=String(env.TELEGRAM_GROUP_CHAT_ID);
  const stats=await db.prepare('SELECT COUNT(*) posts,COALESCE(SUM(points),0) points,'+
    'MIN(message_unix) first,MAX(message_unix) last,COUNT(DISTINCT reply_to_id) targets '+
    'FROM tag_run_messages WHERE chat_id=? AND telegram_id=? AND day_key=?')
    .bind(chat,telegramId,day).first();
  const total=await db.prepare('SELECT score FROM tag_run_member_totals WHERE chat_id=? AND telegram_id=?')
    .bind(chat,telegramId).first();
  const blocked=await db.prepare('SELECT blocked FROM tag_run_member_blocks WHERE chat_id=? AND telegram_id=?')
    .bind(chat,telegramId).first();
  const wallet=await db.prepare('SELECT wax_account FROM tag_run_wallets WHERE telegram_id=?').bind(telegramId).first();
  const pending=await db.prepare('SELECT COALESCE(SUM(earned_weight-spent_historical_weight),0) weight '+
    'FROM tag_run_v2_participation WHERE chat_id=? AND telegram_id=?').bind(chat,telegramId).first();
  const activeDays=await all(db,'SELECT DISTINCT day_key FROM tag_run_messages WHERE chat_id=? AND telegram_id=? ORDER BY day_key DESC LIMIT 366',
    chat,telegramId);
  const dates=new Set(activeDays.map(r=>r.day_key));
  let cursor=dates.has(day)?day:previousDay(nowMs), streak=0;
  while(dates.has(cursor)) { streak++; cursor=previousDay(Date.parse(cursor+'T00:00:00Z')); }
  const rank=rankFor(total?.score || 0), mission=missionProgress(missionFor(day,telegramId),stats);
  return 'TAG RUN · YOUR DAILY WALL · '+day+' UTC\n'+
    'Today: '+Number(stats?.points || 0)+' Street Cred · '+Number(stats?.posts || 0)+'/30 credited messages\n'+
    'Daily capacity remaining: '+Math.max(0,30-Number(stats?.posts || 0))+' messages\n'+
    'Active-day streak: '+streak+' days\n'+
    'Lifetime: '+Number(total?.score || 0)+' · '+rank.name+
    (rank.next ? ' · next rank in '+Math.max(0,rank.next-Number(total?.score || 0))+' points' : ' · highest rank')+'\n'+
    'DAILY MISSION: '+mission.text+'\n'+(mission.complete?'COMPLETE · daily mission badge earned':'IN PROGRESS')+
    '\nMission badges and weekly titles are cosmetic; leaderboard ticket boosts apply separately.\n'+
    'Rewards: '+(blocked?.blocked===1?'BLOCKED · Street Cred continues':wallet?'registered destination':'register a WAX destination with /rain')+
    '\nWAX destination: '+(wallet?.wax_account || 'not registered')+
    '\nUnused recorded participation: '+Number(pending?.weight || 0)+
    (blocked?.blocked===1?' (paused)':'')+' · not a guaranteed token entitlement.\n'+
    'Missions reset at 00:00 UTC. /pool for current pot status.';
}
export function weeklyAwardWinners(rows, week) {
  const end=utcDay(Date.parse(week+'T00:00:00Z')+6*DAY);
  const members=new Map();
  for(const r of rows) {
    const id=String(r.telegram_id);
    const m=members.get(id)||{id,name:label(r.display_name),score:0,prior:0,days:new Set(),targets:0,first:r.first_day};
    if(r.day_key>=week && r.day_key<=end) {
      m.score+=Number(r.points); m.days.add(r.day_key);
      m.targets+=Number(r.targets || 0); // SQL supplies one week's distinct target total once.
    } else if(r.day_key<week) m.prior+=Number(r.points);
    members.set(id,m);
  }
  const active=[...members.values()].filter(m=>m.score>0);
  const streak=m=>{
    let best=0,n=0,previous=null;
    for(const day of [...m.days].sort()) {
      n=previous!==null && Date.parse(day)-previous===DAY?n+1:1;
      best=Math.max(best,n); previous=Date.parse(day);
    }
    return best;
  };
  const pick=(title,value,filter=()=>true)=>{
    const ranked=active.filter(filter).map(m=>({...m,value:value(m)})).filter(m=>m.value>0)
      .sort((a,b)=>b.value-a.value||idOrder(a.id,b.id));
    return ranked[0]?{title,telegramId:ranked[0].id,name:ranked[0].name,value:ranked[0].value}:null;
  };
  return [
    pick('Top Tagger',m=>m.score),
    pick('Biggest Climber',m=>m.score-m.prior,m=>m.prior>0),
    pick('Best Streak',streak),
    pick('Community Helper',m=>m.targets),
    pick('Newcomer of the Week',m=>m.score,m=>m.first>=week && m.first<=end)
  ].filter(Boolean);
}
export function exactQuantity(units, precision) {
  if(!/^[0-9]+$/.test(String(units)) || !Number.isInteger(precision) || precision<0 || precision>18)
    throw new Error('engagement_invalid_quantity');
  const n=BigInt(units), factor=10n**BigInt(precision);
  return precision ? String(n/factor)+'.'+String(n%factor).padStart(precision,'0') : String(n);
}
// Claim BEFORE sending. A timeout is terminal: no automatic duplicate Telegram posts.
export async function publishEngagement(env, eventKey, text, fetchImpl=fetch) {
  const chat=String(env.TELEGRAM_GROUP_CHAT_ID);
  if(!env.TELEGRAM_BOT_TOKEN || text.length>3500) throw new Error('engagement_delivery_unavailable');
  const claim=await env.DB.prepare('INSERT OR IGNORE INTO tag_run_engagement_posts '+
    "(chat_id,event_key,status,body) VALUES (?,?,'attempted',?)").bind(chat,eventKey,text).run();
  if(claim?.success!==true) throw new Error('engagement_claim_failed');
  if(Number(claim.meta?.changes)!==1) return 'already_attempted';
  let status='needs_review';
  try {
    const topic=String(env.TELEGRAM_GROUP_THREAD_ID || '');
    const options=/^[1-9][0-9]{0,12}$/.test(topic)?{message_thread_id:Number(topic)}:{};
    const media=await sendControlledMoonboyTelegram({
      env,chatId:chat,chatKind:'group',messageKind:'tag-bulletin',
      seed:moonboyTelegramMessageSeed('tag-bulletin',chat,eventKey),text,options,fetchImpl
    });
    if(media.status==='sent') status='sent';
    else if(media.status==='disabled' || media.status==='composition_failed') {
      const r=await fetchImpl('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true,...options})
      });
      const body=await r.json();
      if(r.ok && body?.ok===true) status='sent';
    }
  } catch (_) { /* Ambiguous delivery is retained for inspection, never retried. */ }
  await env.DB.prepare('UPDATE tag_run_engagement_posts SET status=? WHERE chat_id=? AND event_key=?')
    .bind(status,chat,eventKey).run();
  return status;
}
async function sendDailyRecap(env, day, fetchImpl) {
  if(await env.DB.prepare('SELECT 1 present FROM tag_run_engagement_posts WHERE chat_id=? AND event_key=?')
    .bind(String(env.TELEGRAM_GROUP_CHAT_ID),'recap:'+day).first()) return;
  const rows=await all(env.DB,'SELECT telegram_id,COUNT(*) posts,SUM(points) points,'+
    'MIN(message_unix) first,MAX(message_unix) last,COUNT(DISTINCT reply_to_id) targets '+
    'FROM tag_run_messages WHERE chat_id=? AND day_key=? GROUP BY telegram_id',
    String(env.TELEGRAM_GROUP_CHAT_ID),day);
  if(!rows.length) return;
  const missions=rows.filter(r=>missionProgress(missionFor(day,r.telegram_id),r).complete).length;
  await publishEngagement(env,'recap:'+day,'TAG RUN · DAILY RECAP · '+day+' UTC\n'+
    rows.length+' active taggers · '+rows.reduce((n,r)=>n+Number(r.points),0)+' Street Cred\n'+
    rows.reduce((n,r)=>n+Number(r.posts),0)+' credited messages · '+missions+' daily missions complete\n'+
    'Fresh wall today: /mytagrun in private for your mission and progress.\n'+
    'Token delivery is reported separately with confirmed transaction evidence.',fetchImpl);
}
async function sendWeeklyAwards(env, week, fetchImpl) {
  const chat=String(env.TELEGRAM_GROUP_CHAT_ID);
  if(await env.DB.prepare('SELECT 1 present FROM tag_run_engagement_posts WHERE chat_id=? AND event_key=?')
    .bind(chat,'awards:'+week).first()) return;
  const prior=utcDay(Date.parse(week+'T00:00:00Z')-7*DAY);
  const end=utcDay(Date.parse(week+'T00:00:00Z')+6*DAY);
  const rows=await all(env.DB,'WITH firsts AS (SELECT telegram_id,MIN(day_key) first_day FROM tag_run_messages WHERE chat_id=? GROUP BY telegram_id) '+
    'SELECT m.telegram_id,m.day_key,MAX(t.display_name) display_name,SUM(m.points) points,'+
    'MAX(f.first_day) first_day,0 targets '+
    'FROM tag_run_messages m JOIN tag_run_member_totals t ON t.chat_id=m.chat_id AND t.telegram_id=m.telegram_id '+
    'JOIN firsts f ON f.telegram_id=m.telegram_id '+
    'WHERE m.chat_id=? AND m.day_key BETWEEN ? AND ? GROUP BY m.telegram_id,m.day_key',
    chat,chat,prior,end);
  // Helper totals must be attached to an active day, even if they missed Monday.
  const helperRows=await all(env.DB,'SELECT telegram_id,COUNT(DISTINCT reply_to_id) targets FROM tag_run_messages '+
    'WHERE chat_id=? AND day_key BETWEEN ? AND ? GROUP BY telegram_id',chat,week,end);
  for(const h of helperRows) {
    const memberRows=rows.filter(r=>r.telegram_id===h.telegram_id && r.day_key>=week);
    memberRows.forEach(r=>r.targets=0);
    if(memberRows[0]) memberRows[0].targets=h.targets;
  }
  const awards=weeklyAwardWinners(rows,week);
  if(!awards.length) return;
  await publishEngagement(env,'awards:'+week,'TAG RUN · WEEKLY AWARDS · '+week+' UTC\n'+
    awards.map(a=>a.title+': '+a.name+' · '+a.value).join('\n')+
    '\nCosmetic titles. Biggest Climber = score gain over the previous week; Best Streak = consecutive active days this week; '+
    'Helper = distinct members replied to in credited messages. No extra token allocation.',fetchImpl);
}
async function sendWinner(env, fetchImpl, startDay) {
  const chat=String(env.TELEGRAM_GROUP_CHAT_ID);
  const rows=await all(env.DB,'SELECT i.intent_key,i.day_key,i.telegram_id,i.amount_units,i.signed_tx_id,'+
    'a.token_symbol,a.token_contract,a.token_precision,t.display_name,t.score '+
    'FROM tag_run_v2_payout_intents i JOIN tag_run_v2_assets a ON a.asset_key=i.asset_key '+
    'LEFT JOIN tag_run_member_totals t ON t.chat_id=i.chat_id AND t.telegram_id=i.telegram_id '+
    "WHERE i.chat_id=? AND i.status='confirmed' AND i.day_key>=? AND NOT EXISTS ("+
    "SELECT 1 FROM tag_run_engagement_posts p WHERE p.chat_id=i.chat_id AND p.event_key='winner:'||i.intent_key) "+
    'ORDER BY i.day_key,i.intent_key LIMIT 1',chat,startDay);
  for(const r of rows) {
    if(!/^[0-9a-f]{64}$/.test(r.signed_tx_id || '')) continue;
    await publishEngagement(env,'winner:'+r.intent_key,'TAG RUN · TOKEN DROP CONFIRMED\n'+
      label(r.display_name)+' · '+rankFor(r.score || 0).name+'\n'+
      exactQuantity(r.amount_units,r.token_precision)+' '+r.token_symbol+' @ '+r.token_contract+'\n'+
      'Draw: '+r.day_key+' UTC · Irreversibly confirmed on WAX\n'+
      'https://waxblock.io/transaction/'+r.signed_tx_id,fetchImpl);
  }
}
async function sendNearMiss(env, fetchImpl, startDay) {
  const chat=String(env.TELEGRAM_GROUP_CHAT_ID);
  const workflows=await all(env.DB,'SELECT day_key,input_json FROM tag_run_v2_draw_workflows w '+
    "WHERE chat_id=? AND state='reviewed' AND day_key>=? AND NOT EXISTS ("+
    "SELECT 1 FROM tag_run_engagement_posts p WHERE p.chat_id=w.chat_id AND p.event_key='near-miss:'||w.day_key) "+
    'ORDER BY day_key LIMIT 1',chat,startDay);
  for(const w of workflows) {
    const input=JSON.parse(w.input_json);
    const eligible=new Set(input.participation.filter(r=>r.blocked===0 &&
      r.earned_weight>r.spent_historical_weight).map(r=>String(r.telegram_id)));
    const rows=await all(env.DB,'SELECT p.telegram_id,MAX(t.display_name) display_name,'+
      'SUM(p.earned_weight-p.spent_historical_weight) remaining '+
      'FROM tag_run_v2_participation p JOIN tag_run_member_totals t ON t.chat_id=p.chat_id AND t.telegram_id=p.telegram_id '+
      'WHERE p.chat_id=? AND p.day_key<=? AND NOT EXISTS ('+
      'SELECT 1 FROM tag_run_v2_bundles b WHERE b.chat_id=p.chat_id AND b.day_key=? AND b.telegram_id=p.telegram_id) '+
      'AND NOT EXISTS (SELECT 1 FROM tag_run_member_blocks mb WHERE mb.chat_id=p.chat_id AND mb.telegram_id=p.telegram_id AND mb.blocked=1) '+
      'GROUP BY p.telegram_id HAVING remaining>0 ORDER BY length(p.telegram_id),p.telegram_id',
      chat,w.day_key,w.day_key);
    const selected=rows.filter(r=>eligible.has(String(r.telegram_id))).slice(0,3);
    const text='TAG RUN · STILL IN THE MIX · '+w.day_key+' UTC\n'+
      (selected.length ? selected.map(r=>label(r.display_name)+': '+r.remaining+' unused participation weight').join('\n')+
      '\nThese members entered the recorded draw and received no bundle. Their unused weight remains recorded for future eligible draws.' :
      'No eligible non-winners with unused recorded participation to highlight.')+
      '\nDraws are random; future tokens are not guaranteed.';
    await publishEngagement(env,'near-miss:'+w.day_key,text,fetchImpl);
  }
}
export async function runTagRunEngagement(env,{nowMs=Date.now(),fetchImpl=fetch}={}) {
  if(env.TAG_RUN_ENGAGEMENT_ENABLED!=='true') return {status:'disabled'};
  const config=await env.DB.prepare('SELECT started_day FROM tag_run_engagement_config WHERE config_id=1').first();
  if(!config) throw new Error('engagement_migration_required');
  const day=previousDay(nowMs), week=previousWeek(nowMs);
  const outcomes=[];
  // Each notification is isolated from payouts and from other notification failures.
  for(const [name,action] of [
    ['recap',()=>day>=config.started_day?sendDailyRecap(env,day,fetchImpl):null],
    ['awards',()=>week>=config.started_day?sendWeeklyAwards(env,week,fetchImpl):null],
    ['winner',()=>sendWinner(env,fetchImpl,config.started_day)],
    ['near_miss',()=>sendNearMiss(env,fetchImpl,config.started_day)]
  ]) {
    try { await action(); outcomes.push({step:name,status:'serviced'}); }
    catch (_) { outcomes.push({step:name,status:'unavailable'}); }
  }
  return {status:'serviced',outcomes};
}
