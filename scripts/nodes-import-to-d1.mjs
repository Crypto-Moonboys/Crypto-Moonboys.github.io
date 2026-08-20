#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INPUT = path.join(ROOT, 'data/nodes/nodes-master.v1.json.gz');
const CONFIG = path.join(ROOT, 'workers/moonboys-api/wrangler.toml');

function sql(value) {
  if (value == null || value === '') return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function loadCatalogue(input = DEFAULT_INPUT) {
  const raw = fs.readFileSync(input);
  const json = input.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const data = JSON.parse(json);
  if (data.schema_version !== '1.0.0' || !Array.isArray(data.records)) throw new Error('Unsupported nodes catalogue schema');
  const ids = new Set();
  for (const record of data.records) {
    if (!record.id || ids.has(record.id)) throw new Error(`Duplicate or missing id: ${record.id}`);
    ids.add(record.id);
    if (!record.name || !record.token?.ticker || !record.classification || !record.technical || !record.links) {
      throw new Error(`Incomplete record: ${record.id}`);
    }
  }
  return data;
}

function buildSql(data) {
  const lines = ['PRAGMA foreign_keys = ON;', 'BEGIN TRANSACTION;'];
  for (const r of data.records) {
    lines.push(`INSERT INTO node_projects(id,name,token_name,ticker,category,node_type,status,wiki_url,market_mode,market_provider,market_provider_id,last_verified,updated_at)
VALUES (${sql(r.id)},${sql(r.name)},${sql(r.token.name)},${sql(r.token.ticker)},${sql(r.classification.category)},${sql(r.classification.node_type)},${sql(r.status)},${sql(r.wiki_url)},${sql(r.market.mode)},${sql(r.market.provider)},${sql(r.market.provider_id)},${sql(r.verification.last_verified)},CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,token_name=excluded.token_name,ticker=excluded.ticker,category=excluded.category,node_type=excluded.node_type,status=excluded.status,wiki_url=excluded.wiki_url,market_mode=excluded.market_mode,market_provider=excluded.market_provider,market_provider_id=excluded.market_provider_id,last_verified=excluded.last_verified,updated_at=CURRENT_TIMESTAMP;`);
    lines.push(`INSERT INTO node_technical(project_id,hardware,reward_type,process)
VALUES (${sql(r.id)},${sql(r.technical.hardware)},${sql(r.technical.reward_type)},${sql(r.technical.process)})
ON CONFLICT(project_id) DO UPDATE SET hardware=excluded.hardware,reward_type=excluded.reward_type,process=excluded.process;`);
    lines.push(`INSERT INTO node_links(project_id,website,whitepaper,roadmap,docs,github)
VALUES (${sql(r.id)},${sql(r.links.website)},${sql(r.links.whitepaper)},${sql(r.links.roadmap)},${sql(r.links.docs)},${sql(r.links.github)})
ON CONFLICT(project_id) DO UPDATE SET website=excluded.website,whitepaper=excluded.whitepaper,roadmap=excluded.roadmap,docs=excluded.docs,github=excluded.github;`);
  }
  lines.push(`INSERT INTO node_runtime_state(key,value,updated_at) VALUES ('catalogue_schema','1.0.0',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;`);
  lines.push(`INSERT INTO node_runtime_state(key,value,updated_at) VALUES ('catalogue_record_count',${sql(String(data.records.length))},CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;`);
  lines.push('COMMIT;');
  return lines.join('\n');
}

function usage() {
  console.log('Usage: node scripts/nodes-import-to-d1.mjs [--input path] [--out file] [--local] [--remote --yes]');
}

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
if (args.includes('--help')) { usage(); process.exit(0); }
const input = path.resolve(arg('--input') || DEFAULT_INPUT);
const data = loadCatalogue(input);
const generated = buildSql(data);
const out = arg('--out');
if (out) fs.writeFileSync(path.resolve(out), generated);

const local = args.includes('--local');
const remote = args.includes('--remote');
if (local && remote) throw new Error('Choose --local or --remote, not both');
if (remote && !args.includes('--yes')) throw new Error('Remote D1 import requires explicit --remote --yes');

if (!local && !remote) {
  console.log(JSON.stringify({ ok: true, records: data.records.length, schema_version: data.schema_version, executed: false, output: out || null }));
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodes-import-'));
const sqlFile = path.join(tempDir, 'nodes-import.sql');
fs.writeFileSync(sqlFile, generated);
const command = ['wrangler', 'd1', 'execute', 'wikicoms', local ? '--local' : '--remote', '--file', sqlFile, '--config', CONFIG];
const result = spawnSync('npx', command, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
fs.rmSync(tempDir, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log(JSON.stringify({ ok: true, records: data.records.length, schema_version: data.schema_version, executed: true, target: local ? 'local' : 'remote' }));
