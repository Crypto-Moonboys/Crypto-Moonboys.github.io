const IPFS_GATEWAYS = Object.freeze([
  'https://ipfs.hivebp.io/ipfs/',
  'https://atomichub-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://dweb.link/ipfs/',
]);

function extractCid(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^ipfs:\/\//i.test(raw)) return raw.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '').split(/[?#]/)[0];
  const match = raw.match(/\/ipfs\/([^/?#]+)/i);
  if (match) return match[1];
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]+|bafk[a-z0-9]+)$/i.test(raw)) return raw;
  return '';
}

export function normalizeWaxImage(value) {
  const original = value == null ? null : String(value).trim();
  if (!original) {
    return {
      original: null,
      url: null,
      gateway_candidates: [],
      placeholder: true,
    };
  }
  const cid = extractCid(original);
  if (cid) {
    const gatewayCandidates = IPFS_GATEWAYS.map((gateway) => `${gateway}${cid}`);
    return {
      original,
      cid,
      url: gatewayCandidates[0],
      gateway_candidates: gatewayCandidates,
      placeholder: false,
    };
  }
  if (/^https?:\/\//i.test(original)) {
    return {
      original,
      cid: null,
      url: original,
      gateway_candidates: [original],
      placeholder: false,
    };
  }
  return {
    original,
    cid: null,
    url: null,
    gateway_candidates: [],
    placeholder: true,
  };
}

export function collectWaxImageFields(data = {}) {
  const fields = ['img', 'image', 'image_url', 'media', 'video'];
  for (const field of fields) {
    const normalized = normalizeWaxImage(data[field]);
    if (!normalized.placeholder) return normalized;
  }
  return normalizeWaxImage(null);
}

