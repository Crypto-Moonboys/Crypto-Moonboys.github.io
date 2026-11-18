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

// Only accept explicitly listed error categories from the public readiness
// response. Never interpolate raw Telegram descriptions or token-bearing URLs
// into CI logs.
const SAFE_DIAGNOSTICS = new Set([
  'ok', 'unknown', 'transport_timeout', 'transport_unavailable',
  'bot_token_rejected', 'telegram_forbidden', 'telegram_rate_limited',
  'telegram_service_unavailable', 'group_lookup_rejected',
  'member_lookup_rejected', 'telegram_bad_request', 'telegram_http_failure',
  'telegram_response_invalid', 'telegram_result_missing',
]);
const SAFE_GATE_ERRORS = new Set([
  'telegram_group_membership_unavailable',
  'telegram_group_membership_not_configured',
  'telegram_group_membership_bot_not_admin',
  'website_origin_required',
]);
export function groupGateDiagnosticSummary(status, body) {
  const http = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const reason = SAFE_GATE_ERRORS.has(body?.error) ? body.error : 'unknown';
  const membership = SAFE_DIAGNOSTICS.has(body?.diagnostic?.membership)
    ? body.diagnostic.membership : 'unknown';
  const botIdentity = SAFE_DIAGNOSTICS.has(body?.diagnostic?.bot_identity)
    ? body.diagnostic.bot_identity : 'unknown';
  return 'HTTP ' + http + '; gate=' + reason +
    '; membership=' + membership + '; bot_identity=' + botIdentity;
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
      'Readiness diagnosis: ' + groupGateDiagnosticSummary(response.status, body) + '. ' +
      'Verify the Worker-to-Telegram connection and configuration; do not disable the gate.'
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
