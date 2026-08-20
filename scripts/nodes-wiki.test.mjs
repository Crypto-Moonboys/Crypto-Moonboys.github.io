#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogue=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT,'data/nodes/nodes-master.v1.json.gz'))).toString('utf8'));
const taxonomy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/nodes/taxonomy.v1.json'),'utf8'));
const api=fs.readFileSync(path.join(ROOT,'workers/moonboys-api/nodes/nodes-api.js'),'utf8');
const migration=fs.readFileSync(path.join(ROOT,'workers/moonboys-api/migrations/069_nodes_wiki.sql'),'utf8');
const directory=fs.readFileSync(path.join(ROOT,'wiki/nodes.html'),'utf8');

assert.equal(catalogue.schema_version,'1.0.0');
assert.equal(catalogue.records.length,144,'v1 bootstrap record count changed unexpectedly');
const ids=new Set();
for(const r of catalogue.records){
  assert.match(r.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(!ids.has(r.id),`duplicate id ${r.id}`); ids.add(r.id);
  assert.ok(r.name && r.token?.ticker && r.classification?.category && r.classification?.node_type);
  assert.ok(r.technical && typeof r.technical.process==='string');
  assert.ok(r.links && r.wiki_url===`/wiki/nodes/${r.id}.html`);
  assert.ok(taxonomy.status.includes(r.status),`unknown status ${r.status}`);
  if(r.market?.provider==='coingecko') assert.ok(r.market.provider_id,`missing provider id ${r.id}`);
}
assert.match(api,/\/api\/nodes/);
assert.match(api,/MARKET_BATCH_SIZE = 80/);
assert.match(api,/isPublicHttpsUrl/);
assert.match(api,/queueReview/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS node_projects/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS node_review_queue/);
assert.match(directory,/id="nodes-grid"/);
assert.match(directory,/nodes-directory\.js/);
console.log(JSON.stringify({ok:true,records:catalogue.records.length,market_mapped:catalogue.records.filter(r=>r.market?.provider_id).length}));
