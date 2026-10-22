import {createMoonpetBrowserHarness} from './moonpet-browser-fixture.mjs';
const h=await createMoonpetBrowserHarness({clientRoot:process.env.MOONPET_AUDIT_CLIENT_ROOT||process.cwd()});const f=await h.setup({clock:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{await f.open();await f.started;await pause(100);const before=f.requests.length;
await f.page.evaluate(()=>{window.auditMutations=0;new MutationObserver(records=>window.auditMutations+=records.length).observe(document.getElementById('screen'),{childList:true});Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
for(let i=0;i<11;i++){await f.page.clock.fastForward(30000);await pause(60);}
console.log('HIDDEN_AUDIT '+JSON.stringify({requests:f.requests.slice(before).map(r=>r.body.mode||'full'),dom_replacements:await f.page.evaluate(()=>window.auditMutations)}));
}finally{await f.close();await h.close();}
