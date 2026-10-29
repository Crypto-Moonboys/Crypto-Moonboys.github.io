#!/usr/bin/env node

const LIVE_URL = process.env.NBG_GROUP_GATE_URL ||
  'https://api.cryptomoonboys.com/telegram/group-membership';
const SITE_ORIGIN = 'https://cryptomoonboys.com';

export function acceptsNbgGroupGateProbe(status, body) {
  return status === 200 && body?.ok === true &&
    body?.configured === true && body?.bot_admin === true &&
    body?.group === '@gkniftyheads';
}

export async function verifyNbgGroupGate(fetchImpl = fetch) {
  const response = await fetchImpl(LIVE_URL, {
    method: 'GET',
    headers: { Origin: SITE_ORIGIN, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => null);
  if (!acceptsNbgGroupGateProbe(response.status, body)) {
    throw new Error(
      'GitHub Pages rollout BLOCKED: live moonboys-api must support ' +
      '/telegram/group-membership with WIKICOMSBOT confirmed as a group admin ' +
      'before publishing the NBG members-only client. ' +
      'Deploy merged main with: node scripts/deploy-worker-with-provenance.mjs moonboys-api'
    );
  }
  console.log('Verified live moonboys-api supports the NBG Telegram group-membership gate.');
  return true;
}

if (import.meta.url === new URL('file://' + process.argv[1]).href) {
  verifyNbgGroupGate().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
