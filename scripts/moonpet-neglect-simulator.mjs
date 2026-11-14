#!/usr/bin/env node
// Moonpet neglect model: SANDBOX ONLY. No production imports or database writes.
// Usage: node scripts/moonpet-neglect-simulator.mjs [dailyCareBudget=100]
const budget = Number(process.argv[2] ?? 100);
if (!Number.isFinite(budget) || budget <= 0) throw new Error('dailyCareBudget must be positive');
function simulate(days, missedFraction=1) {
  let total=0;
  const rows=[];
  for(let day=1;day<=days;day++){
    const multiplier=Math.min(8,day+1);
    const loss=Math.round(budget*missedFraction*multiplier);
    total+=loss;
    rows.push({day,missed_pct:Math.round(missedFraction*100),multiplier,loss,cumulative:total});
  }
  return rows;
}
console.log('ILLUSTRATIVE care-standing penalties only; NOT lifetime Pet XP.');
console.log('Daily care budget:',budget);
for (const fraction of [0,0.25,0.5,1]) {
  for (const horizon of [7,30,90,365]) {
    const rows=simulate(horizon,fraction);
    console.log(JSON.stringify({days:horizon,missed_pct:fraction*100,final_day_loss:rows.at(-1).loss,total_loss:rows.at(-1).cumulative}));
  }
}
console.log('First 14 fully missed days:');
console.table(simulate(14,1));
