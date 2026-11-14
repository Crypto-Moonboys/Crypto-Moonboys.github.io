/**
 * Sandbox-only policy for selecting among choices actually offered by Moonpet.
 * Not an outcome oracle. It NEVER predicts or overrides the server's random roll.
 */
const finite = x => Number.isFinite(Number(x)) ? Number(x) : null;
export function selectConservativeDailyChoice(choices, { riskTolerance = 'minimize-failure' } = {}) {
  if (!Array.isArray(choices) || choices.length===0) return null;
  const legal=choices.map((choice,index)=>{
    const key=typeof choice?.key==='string' && choice.key.trim() ? choice.key.trim() :
      typeof choice?.choice_id==='string' && choice.choice_id.trim() ? choice.choice_id.trim() : null;
    const chance=finite(choice?.success_chance_bps);
    const score=finite(choice?.score);
    return {key,index,chance,score,choice};
  }).filter(x=>x.key && x.choice.available!==false && x.choice.disabled!==true);
  if(!legal.length)return null;
  // Only use advertised, authoritative preview values. An absent preview
  // does not become an invented chance of success.
  legal.sort((a,b)=>{
    if(a.chance===null&&b.chance!==null)return 1;
    if(b.chance===null&&a.chance!==null)return -1;
    if(a.chance!==null&&b.chance!==null&&a.chance!==b.chance)return b.chance-a.chance;
    // Do not sacrifice success probability for speculative score.
    if(riskTolerance==='score-on-tie' && a.score!==null && b.score!==null && a.score!==b.score)return b.score-a.score;
    return a.index-b.index;
  });
  const best=legal[0];
  return Object.freeze({
    key:best.key,
    advertisedChanceBps:best.chance,
    advertisedScore:best.score,
    previewAvailable:best.chance!==null,
    // Chance below 100% can still lose. No server outcome is inferred here.
    guaranteedSuccess:false,
    source:'worker_advertised_choice',
  });
}
export function summarizeLegalRunProgress({days,marks,crests,completedRuns,failedRuns}={}) {
  for(const [key,v] of Object.entries({days,marks,crests,completedRuns,failedRuns})){
    if(!Number.isInteger(v)||v<0)throw new Error('invalid_'+key);
  }
  if(days===0)return {days,marks,crests,marksRemaining:240,crestsRemaining:44,marksPerDay:null,crestsPerWeek:null,projected365Marks:null,projected365Crests:null,legendaryProven:false};
  const marksPerDay=marks/days;
  const crestsPerWeek=crests/(days/7);
  return Object.freeze({
    days,marks,crests,completedRuns,failedRuns,
    marksRemaining:Math.max(0,240-marks),
    crestsRemaining:Math.max(0,44-crests),
    marksPerDay,crestsPerWeek,
    projected365Marks:Number((marksPerDay*365).toFixed(2)),
    projected365Crests:Number((crestsPerWeek*365/7).toFixed(2)),
    // Forecast is advisory; final evolution additionally requires level,
    // materials, victories, relics, and real 365-day ownership.
    legendaryProven:false,
  });
}
