// Interactive Chromium uses the same isolated signed fixture as automated regression tests.
import {createMoonpetBrowserHarness} from './moonpet-browser-fixture.mjs';
import {sandboxPlayers} from './moonpet-sandbox-players.mjs';
const name=process.argv[2] || 'established';
if(!Object.hasOwn(sandboxPlayers,name))throw Error('Choose a sandbox player: '+Object.keys(sandboxPlayers).join(', '));
const harness=await createMoonpetBrowserHarness({headless:!process.argv.includes('--interactive')});
let player;
try{
 player=await harness.setup({...sandboxPlayers[name],viewport:{width:390,height:844}});
 await player.open();
 console.log('Isolated MoonPet '+name+' ready. Synthetic signed player; in-memory SQLite; external traffic blocked.');
 if(process.argv.includes('--interactive'))await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);player.page.once('close',resolve);});
}finally{if(player)await player.close();await harness.close();}
