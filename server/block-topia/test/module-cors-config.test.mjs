import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('shared Block Topia constants load as explicit ESM without typeless warning', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP } from './shared/block-topia/constants.js'; if (BLOCKTOPIA_MULTIPLAYER_REQUIRED_XP !== 5000) process.exit(1);"
  ], { cwd: new URL('../../..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /MODULE_TYPELESS_PACKAGE_JSON/);
});

test('Block Topia browser origin policy remains explicitly allowlisted', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /ALLOWED_ORIGINS\.includes\(origin\)/);
  assert.match(source, /process\.env\.CORS_ORIGIN/);
  assert.doesNotMatch(source, /origin:\s*['"]\*['"]/);
});
