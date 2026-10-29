import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync('workers/moonboys-api/worker.js', 'utf8');

assert.match(worker, /import \{ checkTelegramGroupMember \} from '\.\/telegram-group-membership\.js';/,
  'MoonPet server must use shared Telegram group-membership authority');
assert.match(worker, /PET_GROUP_MEMBERSHIP_CACHE_TTL_MS\s*=\s*60 \* 1000/,
  'MoonPet membership lookups must be briefly cached instead of calling Telegram every refresh');
assert.match(worker, /async function requirePetGroupMembership\(/,
  'MoonPet server must expose a fail-closed membership helper');

for (const route of ['/telegram-pets/app/state', '/telegram-pets/app/action']) {
  const routeIndex = worker.indexOf(`path === '${route}'`);
  assert.ok(routeIndex >= 0, route + ' route must exist');
  const nextRoute = worker.indexOf("\n    if (path === '", routeIndex + 1);
  const block = worker.slice(routeIndex, nextRoute > routeIndex ? nextRoute : routeIndex + 10000);
  assert.match(block, /authenticatePetMiniApp\(body, env\)/,
    route + ' must authenticate Telegram Mini App identity first');
  assert.match(block, /requirePetGroupMembership\(request, env, verified\.telegramId\)/,
    route + ' must verify current GKniftyHEADS membership before serving gameplay');
  assert.match(block, /if \(!membership\.ok\)[^\n]*return err\(membership\.error/,
    route + ' must fail closed when Telegram membership is absent/unavailable');
}

const helperStart = worker.indexOf('async function requirePetGroupMembership(');
const helperEnd = worker.indexOf('\nfunction publicPetArenaSnapshot', helperStart);
const helper = worker.slice(helperStart, helperEnd);
assert.match(helper, /telegram_group_membership_required/,
  'non-member must receive a stable membership-required error');
assert.match(helper, /telegram_group_membership_not_configured/,
  'production must fail closed if group configuration disappears');
assert.match(helper, /petMembershipProductionContext/,
  'local/unit fixture bypass must not become the production behavior');

console.log('MoonPet server membership gate contract passed.');
