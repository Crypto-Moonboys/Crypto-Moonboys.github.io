import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../js/telegram-game-fullscreen.js', import.meta.url), 'utf8');
function run({platform='webk',width=1440,height=900,frame=true,supported=true,already=false,throws=false,hint=false,missing=false}={}) {
  const calls=[]; const app={platform,isFullscreen:already,expand(){calls.push('expand')},isVersionAtLeast(v){assert.equal(v,'8.0');return supported},requestFullscreen(){calls.push('fullscreen');if(throws)throw Error('unsupported')}};
  const window={screen:{width,height},Telegram:missing?undefined:{WebApp:app},location:{hash:''},sessionStorage:{getItem:()=>hint?'1':null}};
  window.parent=frame?{}:window;
  const document={readyState:'complete',querySelector:()=>null,createElement:()=>({setAttribute(){}}),head:{appendChild(s){calls.push('sdk');window.Telegram={WebApp:app};s.onload()}}};
  const context={window,document,URLSearchParams}; vm.runInNewContext(source,context);vm.runInNewContext(source,context);return calls;
}
for(const platform of ['web','weba','webk'])assert.deepEqual(run({platform}),['expand','fullscreen']);
for(const options of [{frame:false},{width:800},{height:500},{platform:'android'},{platform:'ios'},{platform:'tdesktop'},{platform:'macos'},{already:true},{missing:true}])assert.deepEqual(run(options),[]);
assert.deepEqual(run({supported:false}),['expand']);
assert.deepEqual(run({throws:true}),['expand','fullscreen']);
assert.deepEqual(run({missing:true,hint:true}),['sdk','expand','fullscreen']);
for(const path of ["games/index.html","games/nbg-london-run/index.html","games/dead-run/index.html","games/meme-swarm-3008/index.html","games/invaders-3008/index.html","games/chain-maze/index.html","games/pac-chain/index.html","games/forkfield/index.html","games/asteroid-fork/index.html","games/bullrun-brick-smash/index.html","games/breakout-bullrun/index.html","games/block-topia-dropzone/index.html","games/tetris-block-topia/index.html","games/block-topia-quest-maze/index.html","games/snake-run/index.html","games/kaiju-sticker-battle/index.html","games/block-topia/index.html","moonpet-game.html"])assert.ok(readFileSync(new URL('../'+path,import.meta.url),'utf8').includes('/js/telegram-game-fullscreen.js'),path+' must load the helper');
console.log('Telegram game fullscreen tests passed');
