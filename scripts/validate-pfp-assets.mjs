import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const contractPath = path.join(root, 'games/block-topia/data/pfp-replacement-contract.json');
const traitPath = path.join(root, 'games/block-topia/data/pfp-trait-passives.json');

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const traits = JSON.parse(fs.readFileSync(traitPath, 'utf8'));

for (const key of contract.requiredAssetKeys || []) {
  assert.ok(traits.assets?.[key], `Missing required asset key: ${key}`);
}

for (const file of contract.requiredFiles || []) {
  const fullPath = path.join(root, 'games/block-topia/assets/pfp-fighters', file);
  assert.ok(fs.existsSync(fullPath), `Missing PFP asset file: ${file}`);
  const svg = fs.readFileSync(fullPath, 'utf8');
  assert.ok(svg.includes('width="1024"') && svg.includes('height="1024"'), `${file} must be 1024x1024`);
}

console.log('PFP asset contract validation passed ✅');
