import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
function read(path) { return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')); }
function atLeast(version, floor) {
  const a = version.split('.').map(Number), b = floor.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return true;
}
const main = read('../package-lock.json');
const block = read('../server/block-topia/package-lock.json');
for (const [label,lock,pkg,min] of [
  ['root',main,'ip-address','10.7.4'],
  ['Block Topia',block,'proxy-addr','2.0.8']
]) {
  const version = lock.packages['node_modules/' + pkg]?.version;
  assert.ok(version && atLeast(version,min), label + ': expected ' + pkg + ' >= ' + min + ', got ' + version);
  console.log(label + ': ' + pkg + '@' + version + ' >= ' + min);
}
