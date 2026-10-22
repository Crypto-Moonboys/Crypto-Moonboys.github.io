// Only the interactive entry starts this clock; automated fixtures stay deterministic.
export function startSandboxClock(fixture, {now=()=>performance.now(),schedule=setInterval,cancel=clearInterval}={}) {
 let previous=now(),active=true;
 const timer=schedule(()=>{
  if(!active)return;
  const current=now();
  fixture.advance(Math.max(0,current-previous));
  previous=current;
 },100);
 return ()=>{active=false;cancel(timer);};
}
