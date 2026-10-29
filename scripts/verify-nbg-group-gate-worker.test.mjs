import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptsNbgGroupGateProbe,
  verifyNbgGroupGate,
} from './verify-nbg-group-gate-worker.mjs';

test('only explicit membership route method rejection proves the live route exists', () => {
  assert.equal(acceptsNbgGroupGateProbe(405, { ok:false, error:'method_not_allowed' }), true);
  for (const [status, body] of [
    [404, { error:'not_found' }],
    [405, { error:'method_not_allowed' }],
    [503, { ok:false, error:'telegram_group_membership_not_configured' }],
    [200, { ok:true, member:true }],
  ]) assert.equal(acceptsNbgGroupGateProbe(status, body), false);
});

test('live verifier accepts supported route and rejects old/missing route', async () => {
  const ok = async () => new Response(JSON.stringify({
    ok:false, error:'method_not_allowed'
  }), {status:405, headers:{'content-type':'application/json'}});
  assert.equal(await verifyNbgGroupGate(ok), true);

  const missing = async () => new Response(JSON.stringify({
    error:'not_found'
  }), {status:404, headers:{'content-type':'application/json'}});
  await assert.rejects(() => verifyNbgGroupGate(missing),
    /live moonboys-api must support/);
});
