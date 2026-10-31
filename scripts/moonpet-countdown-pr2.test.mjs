import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync('js/moonpet-mini-app.js','utf8');
const begin=source.indexOf('  function tickCooldownDom() {');
const end=source.indexOf('  // TEST-EXPORT: cooldownRefresh:end',begin);
assert.ok(begin>=0&&end>begin);
const fn=source.slice(begin,end);

test('unchanged and hidden countdown labels are not rewritten',()=>{
  let writes=0;
  const node={value:'Available in 5s',attributes:{'data-cooldown-expires-at':'end','data-cooldown-prefix':'Available in '}};
  Object.defineProperty(node,'textContent',{get(){return this.value;},set(value){writes++;this.value=value;}});
  node.getAttribute=name=>node.attributes[name];
  const context=vm.createContext({
    document:{hidden:false,querySelectorAll:()=>[node]},
    countdownText:()=> 'Available in 5s'
  });
  vm.runInContext(fn+'tickCooldownDom()',context);
  assert.equal(writes,0);
  vm.runInContext('countdownText=()=>"Available in 4s";tickCooldownDom()',context);
  assert.equal(writes,1);
  assert.equal(node.value,'Available in 4s');
  context.document.hidden=true;
  vm.runInContext('countdownText=()=>"Ready now";tickCooldownDom()',context);
  assert.equal(writes,1);
});

test('seasonal timer leaves countdown scans to one-second timer',()=>{
  const a=source.indexOf('  function tickSeasonDisplay() {');
  const b=source.indexOf('  // TEST-EXPORT: seasonalStateRefresh:end',a);
  assert.ok(a>=0&&b>a);
  const tick=source.slice(a,b);
  assert.match(tick,/refreshSeasonSnapshot\(false\)/);
  assert.doesNotMatch(tick,/tickCooldownDom\(\)/);
  assert.match(source,/window\.setInterval\(tickCooldownDom, 1000\)/);
});
