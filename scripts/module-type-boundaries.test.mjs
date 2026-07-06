import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function check(condition, message) {
  if (condition) pass(message);
  else failures.push(message);
}

const rootPackage = readJson('package.json');
const arcadePackage = readJson('js/arcade/package.json');
const workersPackage = readJson('workers/package.json');

check(rootPackage.type !== 'module', 'root package remains CommonJS-compatible for legacy generator scripts');
check(arcadePackage.type === 'module', 'js/arcade declares an ESM package boundary');
check(workersPackage.type === 'module', 'workers declares an ESM package boundary');

const probe = spawnSync(process.execPath, [
  '-e',
  "Promise.all([import('./js/arcade/arcade-manifest.js'), import('./workers/moonboys-api/worker.js')]).then(() => console.log('module-boundary-ok'))",
], {
  cwd: ROOT,
  encoding: 'utf8',
});

check(probe.status === 0, 'Node can import arcade and Worker ESM modules');
check(probe.stdout.includes('module-boundary-ok'), 'module import probe completed');
check(!probe.stderr.includes('MODULE_TYPELESS_PACKAGE_JSON'), 'ESM imports do not emit MODULE_TYPELESS_PACKAGE_JSON warnings');

if (failures.length) {
  console.error('\nmodule-type-boundaries.test.mjs failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  if (probe.error) console.error(`\nProbe error:\n${probe.error.stack || probe.error}`);
  if (probe.stderr) console.error(`\nProbe stderr:\n${probe.stderr}`);
  process.exit(1);
}

console.log('\nmodule-type-boundaries.test.mjs passed');
