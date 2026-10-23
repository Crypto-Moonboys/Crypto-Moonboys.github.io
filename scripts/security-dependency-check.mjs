import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const rootManifest = read('../package.json');
const blockManifest = read('../server/block-topia/package.json');
const root = read('../package-lock.json');
const block = read('../server/block-topia/package-lock.json');

function assertPatched(label, manifest, lock, name, minimum) {
  assert.equal(manifest.overrides?.[name], '^' + minimum, label + ' override must remain pinned to the patched line');
  assert.equal(lock.packages[''].overrides?.[name], manifest.overrides[name], label + ' lockfile override mismatch');
  const entries = Object.entries(lock.packages).filter(([path]) => path === 'node_modules/' + name || path.endsWith('/node_modules/' + name));
  assert.ok(entries.length, label + ': missing ' + name + ' dependency');
  for (const [path, pkg] of entries) {
    const version = pkg.version?.split('.').map(Number);
    const floor = minimum.split('.').map(Number);
    assert.ok(version?.length === 3 && version.every(Number.isInteger), path + ': invalid version');
    assert.ok(version[0] > floor[0] || version[0] === floor[0] && (
      version[1] > floor[1] || version[1] === floor[1] && version[2] >= floor[2]
    ), path + ': vulnerable version ' + pkg.version);
    assert.match(pkg.resolved ?? '', /^https:\/\/registry\.npmjs\.org\//, path + ': unexpected registry');
    assert.match(pkg.integrity ?? '', /^sha512-[A-Za-z0-9+/]{86}==$/, path + ': missing or invalid SHA-512 integrity');
    console.log(label + ': ' + path + '@' + pkg.version + ' verified metadata');
  }
}

assertPatched('root', rootManifest, root, 'ip-address', '10.7.4');
assertPatched('Block Topia', blockManifest, block, 'proxy-addr', '2.0.8');
