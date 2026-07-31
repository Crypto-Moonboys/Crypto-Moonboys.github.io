#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  buildWranglerDeployArgs,
  buildWranglerProcessInvocation,
} from './deploy-worker-with-provenance.mjs';

const SHA = 'dbe3119cc0ccd57a11b32acd12c81c2c8d1c3f18';

for (const service of ['moonboys-api', 'leaderboard', 'anti-cheat']) {
  const deployArgs = buildWranglerDeployArgs(service, SHA);

  const posix = buildWranglerProcessInvocation(service, SHA, { platform: 'linux' });
  assert.equal(posix.command, 'npx');
  assert.deepEqual(posix.args, deployArgs);

  const windows = buildWranglerProcessInvocation(service, SHA, {
    platform: 'win32',
    comspec: 'C:\\Windows\\System32\\cmd.exe',
  });
  assert.equal(windows.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(windows.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(windows.args[3], /^npx wrangler deploy /);
  assert.match(windows.args[3], new RegExp(`--tag ${SHA}`));
  assert.match(windows.args[3], new RegExp(`--message "Deploy ${service} from ${SHA.slice(0, 12)}"$`));
  assert.doesNotMatch(windows.args[3], /npx\.cmd/i, 'Windows must invoke npx through cmd.exe, not spawn npx.cmd directly');
}

console.log('worker-deployment-windows.test.mjs passed');
