import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const client=fs.readFileSync('js/moonpet-mini-app.js','utf8');
const source=client.split('// TEST-EXPORT: frogGuardian:start')[1].split('// TEST-EXPORT: frogGuardian:end')[0];
function painter(){
 const calls=[];const runtime=vm.createContext({state:{adopted:true,pet:{pet_id:'one',level:1},lifecycle:{phase:'egg'}},reducedMotion:false,backgroundArtState:{},
  ctx:{save(){},restore(){},drawImage:(image,...args)=>calls.push({source:image.src,args})},
  Image:function(){this.complete=true;this.naturalWidth=1280;this.naturalHeight=1280;},drawWorld(){},performance:{now:()=>0}});
 vm.runInContext(source,runtime);return {runtime,calls};
}
test('guardian has stable transparent bounds flush with the bottom edge and outside pet standing area',()=>{
 const {runtime,calls}=painter();runtime.drawFrogGuardian(0);const first=calls.at(-1);
 assert.equal(first.source,'/img/pepe-pepeb0y.png');assert.deepEqual(first.args.slice(0,4),[31,68,171,156]);
 const [x,y,width,height]=first.args.slice(4);assert.equal(x,32);assert.equal(width,55);assert.equal(y+height,220);assert.ok(x+width<90);
 runtime.drawFrogGuardian(125);assert.deepEqual(calls.at(-1).args.slice(0,4),[287,68,171,156]);assert.deepEqual(calls.at(-1).args.slice(4),first.args.slice(4));
 runtime.drawFrogGuardian(3125);assert.deepEqual(calls.at(-1),first);
 runtime.reducedMotion=true;runtime.drawFrogGuardian(2375);assert.deepEqual(calls.at(-1),first);
});
test('guardian stays with eggs and pets at any level, without selection or save mutation',()=>{
 const {runtime}=painter();for(const phase of ['egg','young','adult'])for(const level of [1,2,20]){
  runtime.state.lifecycle.phase=phase;runtime.state.pet.level=level;const before=JSON.stringify(runtime.state);
  runtime.drawFrogGuardian(0);assert.equal(runtime.backgroundArtState.guardian.source,'/img/pepe-pepeb0y.png');assert.equal(JSON.stringify(runtime.state),before);
 }
 runtime.state={adopted:false};runtime.drawFrogGuardian(0);assert.equal(runtime.backgroundArtState.guardian,null);
 assert.doesNotMatch(source,/fetch\(|localStorage|runAction|setInterval|requestAnimationFrame/);
});
test('composition always draws guardian above furniture and pet, even during hatch reveal',()=>{
 const world=client.split('// TEST-EXPORT: drawWorld:start')[1].split('// TEST-EXPORT: drawWorld:end')[0],calls=[];
 const runtime=vm.createContext({state:{adopted:true,pet:{pet_id:'one'}},reducedMotion:false,backgroundArtState:{},STAGE_ZERO_BACKGROUND_URL:'egg',
  stageZeroPresentationActive:()=>true,drawStageZeroBackground:()=>calls.push('background'),hatchArtTransitionActive:()=>true,
  ctx:{save(){},restore(){}},drawEquippedStyles:()=>{},drawCompanionWings:()=>{},drawPet:()=>calls.push('pet'),drawFrogGuardian:()=>calls.push('guardian')});
 vm.runInContext(world,runtime);runtime.drawWorld(0);assert.deepEqual(calls,['background','pet','guardian']);
});
