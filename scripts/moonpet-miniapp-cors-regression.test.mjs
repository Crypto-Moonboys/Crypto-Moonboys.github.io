import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrapper = readFileSync('workers/moonboys-api/worker-phase5-final.js', 'utf8');
const source = readFileSync('workers/moonboys-api/worker.js', 'utf8');

assert.match(wrapper, /path === '\/telegram-pets\/app\/state'/);
assert.match(wrapper, /path === '\/telegram-pets\/app\/action'/);
assert.match(wrapper, /isMoonpetMiniAppRoute && request\.method === 'OPTIONS'/);
assert.match(wrapper, /if \(!petCors\['Access-Control-Allow-Origin'\]\)/);
assert.match(wrapper, /'Access-Control-Allow-Methods': 'POST, OPTIONS'/);
assert.match(wrapper, /'Access-Control-Allow-Headers': 'Content-Type'/);
assert.match(wrapper, /headers\.set\('Access-Control-Allow-Origin', petCors\['Access-Control-Allow-Origin'\]\)/);
assert.match(wrapper, /const baseResponse = await baseWorker\.fetch\(request, env, ctx\)/);
assert.match(source, /requirePetGroupMembership\(request, env, verified\.telegramId\)/);
console.log('MoonPet cross-origin preflight and server gate contracts passed.');
