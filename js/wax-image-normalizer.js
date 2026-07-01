(function () {
  'use strict';

  var gateways = [
    'https://ipfs.hivebp.io/ipfs/',
    'https://atomichub-ipfs.com/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://nftstorage.link/ipfs/',
    'https://dweb.link/ipfs/',
  ];

  function extractCid(value) {
    var raw = String(value || '').trim();
    var match;
    if (!raw) return '';
    if (/^ipfs:\/\//i.test(raw)) return raw.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '').split(/[?#]/)[0];
    match = raw.match(/\/ipfs\/([^/?#]+)/i);
    if (match) return match[1];
    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]+|bafk[a-z0-9]+)$/i.test(raw)) return raw;
    return '';
  }

  function normalizeWaxImage(value) {
    var original = value == null ? null : String(value).trim();
    var cid;
    var candidates;
    if (!original) {
      return { original: null, url: null, gateway_candidates: [], placeholder: true };
    }
    cid = extractCid(original);
    if (cid) {
      candidates = gateways.map(function (gateway) { return gateway + cid; });
      return { original: original, cid: cid, url: candidates[0], gateway_candidates: candidates, placeholder: false };
    }
    if (/^https?:\/\//i.test(original)) {
      return { original: original, cid: null, url: original, gateway_candidates: [original], placeholder: false };
    }
    return { original: original, cid: null, url: null, gateway_candidates: [], placeholder: true };
  }

  window.MOONBOYS_WAX_IMAGE = Object.freeze({
    normalize: normalizeWaxImage,
  });
}());

