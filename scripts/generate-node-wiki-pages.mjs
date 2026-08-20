#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.join(ROOT,'data/nodes/nodes-master.v1.json.gz');
const outDir=path.join(ROOT,'wiki/nodes');
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(input)).toString('utf8'));
fs.mkdirSync(outDir,{recursive:true});

function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function page(r){
return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="description" content="${esc(r.name)} node, mining and infrastructure guide on Crypto Moonboys Wiki.">
<link rel="stylesheet" href="/css/wiki.css"><link rel="stylesheet" href="/wiki/components/header.css"><link rel="stylesheet" href="/css/nodes-directory.css"><link rel="icon" href="/favicon.png" type="image/png">
<title>${esc(r.name)} | Crypto Moonboys Node Wiki</title></head>
<body class="page-wiki page-standard-shell" data-wiki-shell="locked" data-node-id="${esc(r.id)}">
<main id="content" role="main"><article id="node-detail" class="node-detail-shell"><section class="node-detail-hero"><p class="nodes-kicker">CRYPTO NODES WIKI</p><h1>${esc(r.name)}</h1><p>Loading verified node data…</p></section></article></main>
<script data-cfasync="false" src="/js/api-config.js"></script><script data-cfasync="false" src="/js/arcade/core/global-event-bus.js"></script><script data-cfasync="false" src="/js/identity-gate.js"></script><script data-cfasync="false" src="/js/core/moonboys-state.js"></script><script data-cfasync="false" src="/js/core/daily-loop-state.js"></script><script data-cfasync="false" src="/js/site-shell.js"></script><script data-cfasync="false" src="/js/wiki.js"></script><script data-cfasync="false" src="/js/node-detail.js"></script></body></html>`;
}
const expected=new Set();
for(const r of data.records){const target=path.join(outDir,`${r.id}.html`); expected.add(path.resolve(target)); fs.writeFileSync(target,page(r));}
for(const name of fs.readdirSync(outDir)){if(!name.endsWith('.html'))continue;const full=path.resolve(path.join(outDir,name));if(!expected.has(full))fs.unlinkSync(full);}
console.log(JSON.stringify({ok:true,generated:data.records.length,directory:path.relative(ROOT,outDir)}));
