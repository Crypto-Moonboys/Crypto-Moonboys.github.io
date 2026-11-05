#!/usr/bin/env node
// Local, READ-ONLY production D1 review. Not a payout executor.
// Deliberately no Anchor imports, no D1 writes, no live payout switch change.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { makeD1RestAdapter } from './tag-run-v2-owner-payout.mjs';
import { previewReviewedPayoutAuthorization } from
  '../workers/moonboys-api/tag-run/v2-payout-dry-run.js';
import { assetKey } from '../workers/moonboys-api/tag-run/v2-core.js';

const fail = message => { throw new Error('tag_run_dry_run_' + message); };
const OPTIONS = new Set(['asset','day','bundle','allow-asset','review-digest','reviewer']);
export function parseDryRunArgs(argv) {
  if (!argv.length || argv[0] === '--help')
    return {help:true};
  const out = {};
  for (let i=0; i<argv.length; i+=2) {
    const key = argv[i];
    const value = argv[i+1];
    if (!key?.startsWith('--') || !OPTIONS.has(key.slice(2)) ||
        !value || value.startsWith('--') || out[key.slice(2)] !== undefined)
      fail('invalid_arguments');
    out[key.slice(2)] = value;
  }
  const components = String(out.asset || '').split(':');
  if (components.length !== 3 ||
      !/^[0-8]$/.test(components[2]) ||
      !/^(0|[1-9][0-9]*)$/.test(out.bundle || ''))
    fail('asset_or_bundle_selector_invalid');
  const bundleIndex = Number(out.bundle);
  if (!Number.isSafeInteger(bundleIndex) || bundleIndex > 19)
    fail('bundle_index_invalid');
  const [contract,symbol,precisionRaw] = components;
  const precision = Number(precisionRaw);
  const key = assetKey(contract,symbol,precision);
  return {
    help:false, day:out.day,contract,symbol,precision,bundleIndex,
    operatorAllowlist:out['allow-asset'] === out.asset ? [key] : [],
    reviewDigest:out['review-digest'],reviewedBy:out.reviewer
  };
}
// Only methods supporting SELECT are exposed. A future refactor accidentally
// adding INSERT/UPDATE/DELETE must fail before reaching Cloudflare.
export function selectOnlyDatabase(db) {
  return Object.freeze({
    prepare(sql) {
      if (typeof sql !== 'string' || !/^SELECT\s/i.test(sql) ||
          sql.includes(';') || sql.includes('--') || sql.includes('/*'))
        fail('write_statement_forbidden');
      return Object.freeze({
        bind(...params) {
          const statement = db.prepare(sql).bind(...params);
          return Object.freeze({first: () => statement.first(), all: () => statement.all()});
        }
      });
    }
  });
}
export async function runDryRun(argv,{
  variables=process.env, adapter=makeD1RestAdapter,
  writeLine=value=>console.log(value)
}={}) {
  const args = parseDryRunArgs(argv);
  if (args.help) {
    writeLine('Usage: node scripts/tag-run-v2-payout-dry-run.mjs '+
      '--asset kingsofgraff:LFGK:4 --day YYYY-MM-DD --bundle 0 '+
      '[--allow-asset kingsofgraff:LFGK:4] '+
      '[--review-digest <64-hex-review-reference>] [--reviewer <name>]');
    return {status:'HELP'};
  }
  const accountId=variables.CLOUDFLARE_ACCOUNT_ID;
  const token=variables.CLOUDFLARE_API_TOKEN;
  const chatId=variables.TAG_RUN_OPERATOR_GROUP_ID;
  if (!/^[0-9a-f]{32}$/.test(accountId || '') ||
      !/^-\d{8,24}$/.test(chatId || '') ||
      typeof token !== 'string' || token.length < 12)
    fail('cloudflare_read_only_credentials_required');
  const db=selectOnlyDatabase(adapter({accountId,token}));
  const output=await previewReviewedPayoutAuthorization({
    DB:db,TELEGRAM_GROUP_CHAT_ID:chatId
  },{...args,chatId});
  writeLine(JSON.stringify(output,null,2));
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runDryRun(process.argv.slice(2)).then(result=>{
    if (result.status === 'BLOCKED') process.exitCode=2;
  }).catch(error=>{
    // Never print Cloudflare response headers, tokens or D1 error bodies.
    console.error('DRY RUN FAILED: '+
      (/^tag_run_dry_run_/.test(error?.message || '') ? error.message :
        'private_D1_read_or_validation_error'));
    process.exitCode=1;
  });
