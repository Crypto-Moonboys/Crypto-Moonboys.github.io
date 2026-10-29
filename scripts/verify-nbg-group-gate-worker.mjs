#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const LIVE_URL = process.env.NBG_GROUP_GATE_URL ||
  'https://api.cryptomoonboys.com/telegram/group-membership';
const SITE_ORIGIN = 'https://cryptomoonboys.com';

export function acceptsNbgGroupGateProbe(status, body) {
  return status === 200 && body?.ok === true &&
    body?.configured === true && body?.bot_admin === true &&
    body?.native_init_data === true &&
    Number(body?.all_games_gate_version || 0) >= 1 &&
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
      '/telegram/group-membership with WIKICOMSBOT confirmed as a group admin and native all-games membership support ' +
      'before publishing the NBG members-only client. ' +
      'Deploy merged main with: node scripts/deploy-worker-with-provenance.mjs moonboys-api'
    );
  }
  console.log('Verified live moonboys-api supports the NBG Telegram group-membership gate.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyNbgGroupGate().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
