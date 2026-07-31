#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [stdoutPath, stderrPath, outputPath = 'd1-query-failure.txt'] = process.argv.slice(2);
if (!stdoutPath || !stderrPath) {
  console.error('Usage: node scripts/report-d1-query-failure.mjs <stdout-file> <stderr-file> [output-file]');
  process.exit(2);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function redact(text) {
  let result = String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
  for (const value of [process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID]) {
    if (value) result = result.split(value).join('[REDACTED]');
  }
  result = result.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[REDACTED-ID]');
  return result.trim();
}

function collectMessages(value, output = [], seen = new Set()) {
  if (value === null || value === undefined) return output;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    if (text) output.push(text);
    return output;
  }
  if (typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectMessages(item, output, seen);
    return output;
  }

  const preferredKeys = ['error', 'message', 'code', 'name', 'text', 'notes', 'detail', 'cause'];
  let foundPreferred = false;
  for (const key of preferredKeys) {
    if (Object.hasOwn(value, key)) {
      foundPreferred = true;
      collectMessages(value[key], output, seen);
    }
  }
  if (!foundPreferred) {
    for (const nested of Object.values(value)) collectMessages(nested, output, seen);
  }
  return output;
}

const stdoutText = readText(stdoutPath);
const stderrText = readText(stderrPath);
const messages = [];

try {
  const parsed = JSON.parse(stdoutText);
  messages.push(...collectMessages(parsed));
} catch {
  if (stdoutText.trim()) messages.push(stdoutText.trim());
}
if (stderrText.trim()) messages.push(stderrText.trim());

const unique = [...new Set(messages.map(redact).filter(Boolean))];
const report = [
  'Wrangler D1 query failed.',
  unique.length ? unique.join('\n') : 'Wrangler returned no readable diagnostic output.',
].join('\n');

fs.writeFileSync(path.resolve(outputPath), `${report}\n`, 'utf8');
console.error(report);
