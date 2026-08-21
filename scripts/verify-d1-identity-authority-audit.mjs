#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeD1StatementResult } from './verify-d1-production-migrations.mjs';

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
    if (!key?.startsWith('--') || !value) throw new Error('Expected --input and --output arguments');
    args[key.slice(2)] = value;
  }
  return args;
}

export function verifyD1IdentityAuthorityAuditPayload(payload) {
  const statement = normalizeD1StatementResult(payload);
  if (statement.results.length !== 1) throw new Error(`Expected one identity authority audit row, received ${statement.results.length}`);
  const raw = statement.results[0]?.invalid_identity_authority_rows ?? statement.results[0]?.count;
  const validRaw = typeof raw === 'number' || (typeof raw === 'string' && /^[0-9]+$/.test(raw.trim()));
  const count = validRaw ? Number(raw) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid identity authority audit output');
  if (count > 0) throw new Error(`Expected 0 invalid identity authority rows, got ${count}`);
  return { invalid_identity_authority_rows: count };
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.input || !args.output) throw new Error('--input and --output are required');
  const payload = readJson(path.resolve(args.input), 'Wrangler D1 identity authority audit JSON');
  const result = verifyD1IdentityAuthorityAuditPayload(payload);
  fs.writeFileSync(path.resolve(args.output), `0 invalid identity authority rows\n`, 'utf8');
  console.log(`${result.invalid_identity_authority_rows} invalid identity authority rows`);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  try { runCli(); }
  catch (error) {
    console.error(`[d1-identity-authority-audit] ${error.message}`);
    process.exit(1);
  }
}
