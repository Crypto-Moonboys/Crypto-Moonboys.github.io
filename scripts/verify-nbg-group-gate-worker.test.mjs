import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  acceptsNbgGroupGateProbe,
  verifyNbgGroupGate,
} from './verify-nbg-group-gate-worker.mjs';

test('only explicit configured bot-admin readiness proves the gate is ready', () => {
  assert.equal(acceptsNbgGroupGateProbe(200, {
    ok:true, configured:true, bot_admin:true, native_init_data:true, all_games_gate_version:1, group:'@gkniftyheads'
  }), true);
  for (const [status, body] of [
    [404, { error:'not_found' }],
    [405, { error:'method_not_allowed' }],
    [503, { ok:false, error:'telegram_group_membership_not_configured' }],
    [503, { ok:false, error:'telegram_group_membership_bot_not_admin' }],
    [200, { ok:true, member:true }],
    [200, { ok:true, configured:true, bot_admin:false, native_init_data:true, all_games_gate_version:1, group:'@gkniftyheads' }],
    [200, { ok:true, configured:true, bot_admin:true, group:'@gkniftyheads' }],
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

test('readiness CLI runs from a native filesystem path and imports without argv[1]', () => {
  const verifier = resolve('scripts/verify-nbg-group-gate-worker.mjs');
  const prelude = `
    import { pathToFileURL } from 'node:url';
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({
        ok:true, configured:true, bot_admin:true, group:'@gkniftyheads'
      }), {status:200});
    };
  `;
  for (const direct of [true, false]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', prelude + `
      process.argv[1] = ${direct ? JSON.stringify(verifier) : 'undefined'};
      await import(pathToFileURL(${JSON.stringify(verifier)}).href);
      await new Promise(resolve => setImmediate(resolve));
      if (calls !== ${direct ? 1 : 0}) throw Error('unexpected readiness fetch count: ' + calls);
    `], { encoding:'utf8' });
    assert.equal(child.status, 0, child.stderr);
    if (direct) assert.match(child.stdout, /Verified live moonboys-api/);
    else assert.equal(child.stdout, '');
  }
});
