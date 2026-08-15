#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_D1_MIGRATIONS = Object.freeze([
  '038_telegram_pet_equipment_progression.sql',
  '039_telegram_pet_runtime_progression.sql',
  '041_telegram_pet_repeat_reward_slots.sql',
  '042_telegram_pet_roguelite_foundation.sql',
  '043_telegram_pet_identity_expansion.sql',
  '044_telegram_pet_daily_runs.sql',
  '045_telegram_pet_inventory_cutover_reconciliation.sql',
  '046_fix_pet_runtime_unique_constraints.sql',
  '047_fix_telegram_leaderboard_reward_constraint.sql',
  '048_telegram_pet_player_expansion.sql',
  '049_telegram_pet_dialogue_history.sql',
  '050_telegram_pet_guided_progression.sql',
  '051_telegram_pet_content_reconciliation.sql',
  '052_telegram_pet_live_systems.sql',
  '053_telegram_pet_species_lifecycle.sql',
  '054_telegram_pet_client_performance.sql',
  '055_telegram_pet_season_slots.sql',
]);

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('Expected --input, --request and --output arguments');
    args[key.slice(2)] = value;
  }
  return args;
}

export function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('D1 evidence request must be an object');
  if (request.schema_version !== 1) throw new Error('D1 evidence request schema_version must equal 1');
  if (request.database !== 'wikicoms') throw new Error('D1 evidence request database must be wikicoms');
  if (request.config !== 'workers/moonboys-api/wrangler.toml') throw new Error('D1 evidence request must use the production moonboys-api config');
  if (request.migrations_table !== 'd1_migrations') throw new Error('D1 evidence request must use the default migrations table');
  const migrations = request.required_migrations;
  if (!Array.isArray(migrations)) throw new Error('D1 evidence request required_migrations must be an array');
  if (new Set(migrations).size !== migrations.length) throw new Error('D1 evidence request contains duplicate migrations');
  for (const migration of migrations) {
    if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(String(migration))) throw new Error(`Invalid migration filename: ${migration}`);
  }
  const expected = [...REQUIRED_D1_MIGRATIONS].sort();
  const actual = migrations.map(String).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((migration) => !actual.includes(migration));
    const unexpected = actual.filter((migration) => !expected.includes(migration));
    throw new Error([
      missing.length ? `D1 evidence request missing required migrations: ${missing.join(', ')}` : '',
      unexpected.length ? `D1 evidence request contains unexpected migrations: ${unexpected.join(', ')}` : '',
    ].filter(Boolean).join('; '));
  }
  return request;
}

function extractStatement(payload) {
  let statements;
  if (Array.isArray(payload)) statements = payload;
  else if (payload && typeof payload === 'object' && Array.isArray(payload.result)) statements = payload.result;
  else if (payload && typeof payload === 'object' && Array.isArray(payload.results)) statements = [payload];
  else throw new Error('Wrangler D1 JSON did not contain a recognised query result');

  if (statements.length !== 1) throw new Error(`Expected one D1 statement result, received ${statements.length}`);
  const statement = statements[0];
  if (!statement || typeof statement !== 'object' || Array.isArray(statement)) throw new Error('Wrangler D1 statement result is invalid');
  if (statement.success !== true) throw new Error('Wrangler D1 query did not report success');
  if (!Array.isArray(statement.results)) throw new Error('Wrangler D1 query did not return a results array');
  return statement;
}

export function verifyD1MigrationPayload(payload, request, verifiedAt = new Date().toISOString()) {
  validateRequest(request);
  const statement = extractStatement(payload);
  const names = statement.results.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`D1 migration result row ${index} is invalid`);
    if (Object.keys(row).length !== 1 || typeof row.name !== 'string') throw new Error(`D1 migration result row ${index} must contain only name`);
    return row.name;
  });
  if (new Set(names).size !== names.length) throw new Error('D1 migration query returned duplicate rows');

  const expected = [...request.required_migrations].sort();
  const actual = [...names].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((name) => !actual.includes(name));
    const unexpected = actual.filter((name) => !expected.includes(name));
    throw new Error([missing.length ? `missing migrations: ${missing.join(', ')}` : '', unexpected.length ? `unexpected migrations: ${unexpected.join(', ')}` : ''].filter(Boolean).join('; '));
  }

  return {
    schema_version: 1,
    verified_at: verifiedAt,
    status: 'verified-applied',
    database: request.database,
    verification_mode: 'read-only-d1-migrations-table-query',
    migrations_table: request.migrations_table,
    required_migrations: expected,
    verified_migrations: actual
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.input || !args.request || !args.output) throw new Error('--input, --request and --output are required');
  const request = validateRequest(readJson(path.resolve(args.request), 'D1 evidence request'));
  const payload = readJson(path.resolve(args.input), 'Wrangler D1 JSON');
  const evidence = verifyD1MigrationPayload(payload, request);
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`D1 production migrations verified: ${evidence.verified_migrations.join(', ')}`);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  try { runCli(); }
  catch (error) {
    console.error(`[d1-production-verify] ${error.message}`);
    process.exit(1);
  }
}
