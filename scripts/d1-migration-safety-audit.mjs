#!/usr/bin/env node
/**
 * d1-migration-safety-audit.mjs
 *
 * Scans Cloudflare D1 migration files and warns/fails on dangerous SQL patterns.
 *
 * Checks:
 *  - CREATE TABLE without IF NOT EXISTS
 *  - CREATE INDEX without IF NOT EXISTS
 *  - ALTER TABLE ADD COLUMN without any guard (logs warning; D1 lacks native support)
 *  - References to telegram_profiles before any CREATE TABLE IF NOT EXISTS telegram_profiles
 *  - DROP TABLE (not wrapped in IF EXISTS)
 *  - Destructive ALTER patterns (RENAME TO existing tables, DROP COLUMN)
 *
 * Usage:
 *   node scripts/d1-migration-safety-audit.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../workers/moonboys-api/migrations');

// ── helpers ──────────────────────────────────────────────────────────────────

function stripComments(sql) {
  // Remove single-line comments
  let stripped = sql.replace(/--[^\n]*/g, '');
  // Remove block comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  return stripped;
}

function checkFile(filePath, fileName) {
  const raw = readFileSync(filePath, 'utf8');
  const sql = stripComments(raw);
  const lines = sql.split('\n');

  const warnings = [];
  const failures = [];

  let telegramProfilesCreated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;
    const upper = line.trim().toUpperCase();

    // ── CREATE TABLE without IF NOT EXISTS ───────────────────────────────────
    if (/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(line) &&
        !/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(line) &&
        !/CREATE\s+TEMP\s+TABLE/i.test(line) &&
        !/CREATE\s+TEMPORARY\s+TABLE/i.test(line)) {
      // Allow CREATE TABLE name (pattern used inside temp table rebuilds)
      const isRebuild = /CREATE\s+TABLE\s+\S+__\d+_rebuild/i.test(line);
      if (!isRebuild) {
        failures.push(`  line ${lineno}: CREATE TABLE without IF NOT EXISTS — "${line.trim()}"`);
      }
    }

    // ── Track CREATE TABLE IF NOT EXISTS telegram_profiles ───────────────────
    if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+telegram_profiles/i.test(line)) {
      telegramProfilesCreated = true;
    }

    // ── CREATE INDEX without IF NOT EXISTS ───────────────────────────────────
    if (/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i.test(line) &&
        !/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i.test(line)) {
      failures.push(`  line ${lineno}: CREATE INDEX without IF NOT EXISTS — "${line.trim()}"`);
    }

    // ── Reference to telegram_profiles before CREATE TABLE IF NOT EXISTS ──────
    if (/telegram_profiles/i.test(line) && !telegramProfilesCreated) {
      if (!/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+telegram_profiles/i.test(line)) {
        failures.push(
          `  line ${lineno}: Reference to telegram_profiles before CREATE TABLE IF NOT EXISTS telegram_profiles — "${line.trim()}"`
        );
      }
    }

    // ── DROP TABLE without IF EXISTS ─────────────────────────────────────────
    if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(line) &&
        !/DROP\s+TABLE\s+IF\s+EXISTS/i.test(line)) {
      failures.push(`  line ${lineno}: DROP TABLE without IF EXISTS — "${line.trim()}"`);
    }

    // ── ALTER TABLE ADD COLUMN without guard ─────────────────────────────────
    // D1/SQLite does not support ALTER TABLE … ADD COLUMN IF NOT EXISTS.
    // This is a warning only; the migration comments should document expected behaviour.
    if (/ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN/i.test(line)) {
      warnings.push(
        `  line ${lineno}: ALTER TABLE ADD COLUMN has no IF NOT EXISTS guard (D1 limitation — "duplicate column" error is expected on re-run) — "${line.trim()}"`
      );
    }

    // ── Destructive ALTER: RENAME TO existing tables ──────────────────────────
    // Allow renaming _rebuild tables back to canonical names (012 pattern):
    //   ALTER TABLE blocktopia_progression__012_rebuild RENAME TO blocktopia_progression;
    // Only warn on other RENAME TO patterns that could clobber a live table.
    if (/ALTER\s+TABLE\s+\S+\s+RENAME\s+TO/i.test(line)) {
      const isRebuildRename = /ALTER\s+TABLE\s+\S+__\d+_rebuild\s+RENAME\s+TO/i.test(line);
      if (!isRebuildRename) {
        warnings.push(
          `  line ${lineno}: ALTER TABLE RENAME TO — verify this is intentional and not destructive — "${line.trim()}"`
        );
      }
    }

    // ── DROP COLUMN ──────────────────────────────────────────────────────────
    if (/ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN/i.test(line)) {
      failures.push(`  line ${lineno}: ALTER TABLE DROP COLUMN is destructive — "${line.trim()}"`);
    }
  }

  return { warnings, failures };
}

// ── main ─────────────────────────────────────────────────────────────────────

let files;
try {
  files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
} catch (err) {
  console.error(`ERROR: Cannot read migrations directory: ${MIGRATIONS_DIR}`);
  console.error(err.message);
  process.exit(1);
}

let totalWarnings = 0;
let totalFailures = 0;

console.log(`\nD1 Migration Safety Audit`);
console.log(`Scanning: ${MIGRATIONS_DIR}`);
console.log(`Files found: ${files.length}\n`);
console.log('─'.repeat(60));

for (const file of files) {
  const filePath = join(MIGRATIONS_DIR, file);
  const { warnings, failures } = checkFile(filePath, file);

  const hasIssues = warnings.length > 0 || failures.length > 0;
  const status = failures.length > 0 ? '✗ FAIL' : warnings.length > 0 ? '⚠ WARN' : '✓ OK  ';

  console.log(`\n${status}  ${file}`);

  if (warnings.length > 0) {
    totalWarnings += warnings.length;
    for (const w of warnings) {
      console.log(`       WARN: ${w}`);
    }
  }

  if (failures.length > 0) {
    totalFailures += failures.length;
    for (const f of failures) {
      console.log(`       FAIL: ${f}`);
    }
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`\nSummary:`);
console.log(`  Files checked : ${files.length}`);
console.log(`  Warnings      : ${totalWarnings}`);
console.log(`  Failures      : ${totalFailures}`);

if (totalFailures > 0) {
  console.log(`\n✗ Audit FAILED — ${totalFailures} failure(s) require attention.\n`);
  process.exit(1);
} else if (totalWarnings > 0) {
  console.log(`\n⚠ Audit passed with ${totalWarnings} warning(s) — review ALTER TABLE patterns.\n`);
  process.exit(0);
} else {
  console.log(`\n✓ Audit passed — no issues found.\n`);
  process.exit(0);
}
