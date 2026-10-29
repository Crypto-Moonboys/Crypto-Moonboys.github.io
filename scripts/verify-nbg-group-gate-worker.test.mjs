import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  acceptsNbgGroupGateProbe,
  verifyNbgGroupGate,
} from './verify-nbg-group-gate-worker.mjs';

test('only explicit membership route method rejection proves the live route exists', () => {
  assert.equal(acceptsNbgGroupGateProbe(200, {
    ok:true, configured:true, bot_admin:true, group:'@gkniftyheads'
  }), true);
  for (const [status, body] of [
    [404, { error:'not_found' }],
    [405, { error:'method_not_allowed' }],
    [503, { ok:false, error:'telegram_group_membership_not_configured' }],
    [503, { ok:false, error:'telegram_group_membership_bot_not_admin' }],
    [200, { ok:true, member:true }],
    [200, { ok:true, configured:true, bot_admin:false, group:'@gkniftyheads' }],
  ]) assert.equal(acceptsNbgGroupGateProbe(status, body), false);
});

test('live verifier accepts supported route and rejects old/missing route', async () => {
  const ok = async () => new Response(JSON.stringify({
    ok:true, configured:true, bot_admin:true, group:'@gkniftyheads'
  }), {status:200, headers:{'content-type':'application/json'}});
  assert.equal(await verifyNbgGroupGate(ok), true);

  const missing = async () => new Response(JSON.stringify({
    error:'not_found'
  }), {status:404, headers:{'content-type':'application/json'}});
  await assert.rejects(() => verifyNbgGroupGate(missing),
    /live moonboys-api must support/);
});


test('Pages checks live membership API before uploading the site', () => {
  const yaml = readFileSync('.github/workflows/pages.yml', 'utf8');
  const membershipGate = yaml.indexOf('node scripts/verify-nbg-group-gate-worker.mjs');
  const configure = yaml.indexOf('actions/configure-pages@');
  const upload = yaml.indexOf('actions/upload-pages-artifact@');
  assert.ok(membershipGate >= 0, 'Pages workflow must invoke membership API rollout gate');
  assert.ok(configure > membershipGate,
    'membership API gate must pass before Pages is configured');
  assert.ok(upload > membershipGate,
    'membership API gate must pass before Pages artifact upload');
});
