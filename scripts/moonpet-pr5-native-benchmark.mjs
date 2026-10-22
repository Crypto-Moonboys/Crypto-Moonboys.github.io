// Local diagnostic snapshots only. Backup copies pages, not connection-level JS functions.
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function freezeBenchmarkTime(sql, iso) {
 const literal="'"+iso.replaceAll("'","''")+"'";
 // Lex strings, quoted identifiers and comments first so keywords inside them
 // remain untouched. These audited SELECTs use explicit 'now' time arguments.
 const dateFunctions=new Set(['datetime','date','strftime','julianday']);
 const stack=[];let functionName=null;
 const tokens=sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|\[[^\]]*\]|`[^`]*`|--[^\n]*|\/\*[\s\S]*?\*\/|[a-zA-Z_][a-zA-Z_0-9]*|\s+|./g)||[];
 return tokens.map(token=>{
  if(/^\s+$/.test(token)||token.startsWith('--')||token.startsWith('/*'))return token;
  if(token==='('){stack.push(functionName);functionName=null;return token;}
  if(token===')'){stack.pop();functionName=null;return token;}
  if(token.toUpperCase()==='CURRENT_TIMESTAMP'){functionName=null;return "'"+iso.replace('T',' ').slice(0,19)+"'";}
  if(/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(token)){functionName=token.toLowerCase();return token;}
  functionName=null;
  return token==="'now'"&&dateFunctions.has(stack.at(-1))?literal:token;
 }).join('');
}
export async function nativeBenchmarkSnapshot(source) {
 const directory=mkdtempSync(join(tmpdir(),'moonpet-pr5-native-'));
 const filename=join(directory,'fixture.sqlite');
 let db;
 try { await backup(source,filename);db=new DatabaseSync(filename,{readOnly:true}); }
 catch(error){try{unlinkSync(filename);}catch{}rmdirSync(directory);throw error;}
 return {db,close(){db.close();unlinkSync(filename);rmdirSync(directory);}};
}
