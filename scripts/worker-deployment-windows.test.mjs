#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildWindowsCmdInvocation,
  buildWranglerDeployArgs,
  buildWranglerProcessInvocation,
} from './deploy-worker-with-provenance.mjs';

const SHA = 'dbe3119cc0ccd57a11b32acd12c81c2c8d1c3f18';

for (const service of ['moonboys-api', 'leaderboard', 'anti-cheat']) {
  const deployArgs = buildWranglerDeployArgs(service, SHA);

  const posix = buildWranglerProcessInvocation(service, SHA, { platform: 'linux' });
  assert.equal(posix.command, 'npx');
  assert.deepEqual(posix.args, deployArgs);
  assert.equal(posix.windowsVerbatimArguments, false);

  const windows = buildWranglerProcessInvocation(service, SHA, {
    platform: 'win32',
    comspec: 'C:\\Windows\\System32\\cmd.exe',
  });
  assert.equal(windows.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(windows.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(windows.windowsVerbatimArguments, true);
  assert.match(windows.args[3], /^"npx wrangler deploy /);
  assert.match(windows.args[3], new RegExp(`--tag ${SHA}`));
  assert.match(windows.args[3], new RegExp(`--message "Deploy ${service} from ${SHA.slice(0, 12)}""$`));
  assert.doesNotMatch(windows.args[3], /npx\.cmd/i, 'Windows must invoke npx through cmd.exe, not spawn npx.cmd directly');
}

// This section runs on the Windows Actions runner and executes cmd.exe for real.
// It verifies that an argument containing spaces survives the same outer-quoted,
// windowsVerbatimArguments path used by production Worker deployments.
if (process.platform === 'win32') {
  const probeScript = fileURLToPath(new URL('./windows-command-argv-probe.mjs', import.meta.url));
  const expectedMessage = `Deploy moonboys-api from ${SHA.slice(0, 12)}`;
  const invocation = buildWindowsCmdInvocation(
    process.execPath,
    [probeScript, '--message', expectedMessage],
    { comspec: process.env.ComSpec || 'cmd.exe' },
  );

  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout || ''}${result.stderr || ''}`);
  assert.deepEqual(JSON.parse(String(result.stdout || '').trim()), [
    '--message',
    expectedMessage,
  ]);
}

console.log('worker-deployment-windows.test.mjs passed');
