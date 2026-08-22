#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeD1StatementResult } from './verify-d1-production-migrations.mjs';

const REQUIRED_SCHEMA_OBJECTS = Object.freeze([
  ['view', 'moonpet_invalid_identity_authority_rows'],
  ['table', 'telegram_pet_specialist_progression'],
  ['table', 'telegram_pet_specialist_events'],
  ['table', 'telegram_pet_live_progression_state'],
  ['table', 'telegram_pet_system_events'],
  ['table', 'telegram_pet_event_chain_progress'],
  ['table', 'telegram_pet_seasonal_boss_progress'],
  ['index', 'idx_pet_specialist_progression_owner'],
  ['index', 'idx_pet_specialist_events_owner_created'],
  ['index', 'idx_pet_system_events_owner'],
  ['index', 'idx_pet_system_events_pet_owner'],
]);

const REQUIRED_ZERO_FIELDS = Object.freeze([
  'invalid_specialist_progression_rows',
  'invalid_specialist_event_rows',
  'specialist_event_pet_crossovers',
  'account_wallet_pet_id_columns',
  'missing_wallet_balance_columns',
  'invalid_live_progression_rows',
  'invalid_system_event_rows',
  'invalid_event_chain_rows',
  'invalid_seasonal_boss_rows',
  'empty_pet_owned_system_events',
  'invalid_daily_journey_rows',
  'invalid_weekly_journey_rows',
  'invalid_daily_run_rows',
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
    if (!key?.startsWith('--') || !value) throw new Error('Expected --schema-input, --specialist-input, --live-input and --output arguments');
    args[key.slice(2)] = value;
  }
  return args;
}

function parseNonNegativeInt(row, field) {
  const raw = row?.[field];
  const validRaw = typeof raw === 'number' || (typeof raw === 'string' && /^[0-9]+$/.test(raw.trim()));
  const value = validRaw ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${field} value`);
  return value;
}

function decodeSingleRow(payload, label) {
  const statement = normalizeD1StatementResult(payload);
  if (statement.results.length !== 1) throw new Error(`Expected one ${label} row, received ${statement.results.length}`);
  const row = statement.results[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid ${label} row`);
  return row;
}

export function verifyMoonpetHardeningSchemaPayload(payload) {
  const statement = normalizeD1StatementResult(payload);
  const actual = new Set(statement.results.map((row, index) => {
    const type = String(row?.type || '').trim().toLowerCase();
    const name = String(row?.name || '').trim();
    if (!type || !name) throw new Error(`Invalid schema object row ${index}`);
    return `${type}:${name}`;
  }));
  const expected = REQUIRED_SCHEMA_OBJECTS.map(([type, name]) => `${type}:${name}`);
  const missing = expected.filter((key) => !actual.has(key));
  if (missing.length) throw new Error(`Missing schema objects: ${missing.join(', ')}`);
  return { verified_schema_objects: expected.length };
}

export function verifyMoonpetHardeningSpecialistPayload(payload) {
  const row = decodeSingleRow(payload, 'specialist ownership audit');
  const result = {};
  for (const field of REQUIRED_ZERO_FIELDS.slice(0, 5)) {
    const value = parseNonNegativeInt(row, field);
    if (value !== 0) throw new Error(`${field} expected 0, got ${value}`);
    result[field] = value;
  }
  return result;
}

export function verifyMoonpetHardeningLivePayload(payload) {
  const row = decodeSingleRow(payload, 'live ownership audit');
  const result = {};
  for (const field of REQUIRED_ZERO_FIELDS.slice(5)) {
    const value = parseNonNegativeInt(row, field);
    if (value !== 0) throw new Error(`${field} expected 0, got ${value}`);
    result[field] = value;
  }
  return result;
}

export function verifyMoonpetHardeningAuditPayloads({ schemaPayload, specialistPayload, livePayload }) {
  const schema = verifyMoonpetHardeningSchemaPayload(schemaPayload);
  const specialist = verifyMoonpetHardeningSpecialistPayload(specialistPayload);
  const live = verifyMoonpetHardeningLivePayload(livePayload);
  return {
    verified_at: new Date().toISOString(),
    status: 'verified',
    schema,
    specialist,
    live,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args['schema-input'] || !args['specialist-input'] || !args['live-input'] || !args.output) {
    throw new Error('--schema-input, --specialist-input, --live-input and --output are required');
  }
  const schemaPayload = readJson(path.resolve(args['schema-input']), 'schema audit payload');
  const specialistPayload = readJson(path.resolve(args['specialist-input']), 'specialist audit payload');
  const livePayload = readJson(path.resolve(args['live-input']), 'live ownership audit payload');
  const evidence = verifyMoonpetHardeningAuditPayloads({ schemaPayload, specialistPayload, livePayload });
  fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log('Moonpet hardening production audit verified');
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  try { runCli(); }
  catch (error) {
    console.error(`[d1-moonpet-hardening-audit] ${error.message}`);
    process.exit(1);
  }
}
