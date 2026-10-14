import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const client=fs.readFileSync('js/moonpet-mini-app.js','utf8');
const source=client.split('// TEST-EXPORT: companionWings:start')[1].split('// TEST-EXPORT: companionWings:end')[0];
function runtime(storage=new Map()){
 const calls=[],messages=[];
 const ctx=vm.createContext({state:{adopted:true,pet:{pet_id:'one',level:2},lifecycle:{phase:'young'}},botArtRendererReady:true,reducedMotion:false,
   backgroundArtState:{},BOT_RENDER_CENTER_X:160,Image:function(){this.complete=true;this.naturalWidth=1280;this.naturalHeight=1280;},
   localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
   ctx:{save(){calls.push('save');},restore(){calls.push('restore');},drawImage:(image,...args)=>calls.push({source:image.src,args})},
   tell:message=>messages.push(message),render(){},drawWorld(){},performance:{now:()=>0},hatchArtTransitionActive:()=>false});
 vm.runInContext(source,ctx);return {ctx,calls,messages,storage};
}
test('wings unlock from HUD level two and remain hidden for level one, eggs and unavailable pets',()=>{
 const f=runtime();for(const level of [2,3,20]){f.ctx.state.pet.level=level;assert.equal(f.ctx.wingsEligible(f.ctx.state),true);}
 for(const snapshot of [null,{adopted:false},{adopted:true,pet:{pet_id:'one',level:1}},{adopted:true,pet:{pet_id:'one',level:2},lifecycle:{phase:'egg'}}])assert.equal(f.ctx.wingsEligible(snapshot),false);
 f.ctx.state.pet.level=1;assert.doesNotMatch(f.ctx.renderCompanionWings(),/data-local-wings/);
 f.ctx.toggleCompanionWings();assert.equal(f.storage.size,0);
});
test('toggle persists independently per pet and restores after a fresh page runtime',()=>{
 const f=runtime(),original=JSON.stringify(f.ctx.state);
 assert.equal(f.ctx.companionWingsEnabled(f.ctx.state),false);f.ctx.toggleCompanionWings();
 assert.equal(f.ctx.companionWingsEnabled(f.ctx.state),true);assert.equal(JSON.stringify(f.ctx.state),original,'no saved gameplay state changes');
 assert.equal(runtime(f.storage).ctx.companionWingsEnabled(f.ctx.state),true);
 f.ctx.state.pet.pet_id='two';assert.equal(f.ctx.companionWingsEnabled(f.ctx.state),false);
 f.ctx.state.pet.pet_id='one';f.ctx.toggleCompanionWings();assert.equal(runtime(f.storage).ctx.companionWingsEnabled(f.ctx.state),false);
});
test('twenty-five transparent wing frames loop at fixed bounds, with reduced motion and level/hatch hiding',()=>{
 const f=runtime();f.ctx.toggleCompanionWings();f.ctx.drawCompanionWings(0);
 const first=f.calls.find(call=>call.args);assert.equal(first.source,'/img/BOTTY%20WINGS-waveone-v1.png');
 assert.deepEqual(first.args,[6,38,250,176,40,26,240,240*176/250]);
 f.ctx.drawCompanionWings(125);assert.equal(f.ctx.backgroundArtState.wings.frame,1);
 f.ctx.drawCompanionWings(3125);assert.equal(f.ctx.backgroundArtState.wings.frame,0);
 f.ctx.reducedMotion=true;f.ctx.drawCompanionWings(1500);assert.equal(f.ctx.backgroundArtState.wings.frame,0);
 f.ctx.hatchArtTransitionActive=()=>true;f.ctx.drawCompanionWings(0);assert.equal(f.ctx.backgroundArtState.wings,null);
 f.ctx.hatchArtTransitionActive=()=>false;f.ctx.state.pet.level=1;f.ctx.drawCompanionWings(0);assert.equal(f.ctx.backgroundArtState.wings,null);
 assert.ok(client.indexOf('drawCompanionWings(renderTime);')<client.indexOf('drawPet(renderTime);'),'wing layer stays behind pet');
});
test('blocked device storage retains a session-only toggle and explains persistence',()=>{
 const f=runtime();f.ctx.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 f.ctx.toggleCompanionWings();assert.equal(f.ctx.companionWingsEnabled(f.ctx.state),true);assert.match(f.messages.at(-1),/THIS SESSION ONLY/);
});
