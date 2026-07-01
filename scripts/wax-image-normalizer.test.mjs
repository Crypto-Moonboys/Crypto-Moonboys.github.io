import assert from 'node:assert/strict';
import { normalizeWaxImage } from '../workers/moonboys-api/routes/wax/image-normalizer.js';

const cid = 'QmQ9CwboL2gj4NK12Yr49FiL7zQxyMWD7LAEYeDaqFRbY4';

for (const value of [
  cid,
  `ipfs://${cid}`,
  `https://atomichub-ipfs.com/ipfs/${cid}`,
  `/ipfs/${cid}`,
]) {
  const normalized = normalizeWaxImage(value);
  assert.equal(normalized.placeholder, false, `${value} should not normalize to placeholder`);
  assert.equal(normalized.cid, cid, `${value} should expose the CID`);
  assert.equal(normalized.url, `https://ipfs.hivebp.io/ipfs/${cid}`, `${value} should use the safe first gateway`);
  assert.ok(normalized.gateway_candidates.includes(`https://atomichub-ipfs.com/ipfs/${cid}`), 'gateway candidates should include AtomicHub IPFS gateway');
}

const https = normalizeWaxImage('https://example.com/nft.png');
assert.equal(https.url, 'https://example.com/nft.png', 'full HTTPS image URL should remain usable');
assert.deepEqual(https.gateway_candidates, ['https://example.com/nft.png'], 'full HTTPS image URL should remain the only candidate');

const empty = normalizeWaxImage('');
assert.equal(empty.placeholder, true, 'missing image should mark placeholder');
assert.equal(empty.url, null, 'missing image should not invent a URL');

console.log('WAX image normalizer regression passed.');

