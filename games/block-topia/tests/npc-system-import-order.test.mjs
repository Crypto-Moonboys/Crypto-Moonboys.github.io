import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const npcSystemPath = path.resolve(here, '../world/npc-system.js');
const source = await fs.readFile(npcSystemPath, 'utf8');

const createNpcDefIndex = source.indexOf('function createNpc(');
assert.notEqual(
  createNpcDefIndex,
  -1,
  'Expected module-scope function createNpc(...) to exist in npc-system.js.',
);

const ensureStart = source.indexOf('function ensureHunterEntities(');
assert.notEqual(
  ensureStart,
  -1,
  'Expected ensureHunterEntities(...) to exist in npc-system.js.',
);

const stepHunterStart = source.indexOf('function stepHunterNpc(');
assert.notEqual(
  stepHunterStart,
  -1,
  'Expected stepHunterNpc(...) to exist in npc-system.js.',
);

const ensureBody = source.slice(ensureStart, stepHunterStart);
const createNpcCallInEnsure = ensureBody.indexOf('createNpc(');
assert.notEqual(
  createNpcCallInEnsure,
  -1,
  'Expected ensureHunterEntities(...) to reference createNpc(...).',
);

const createNpcCallIndex = ensureStart + createNpcCallInEnsure;
assert.ok(
  createNpcDefIndex < createNpcCallIndex,
  'createNpc(...) must be defined before ensureHunterEntities(...) references it.',
);

const npcSystemModule = await import(pathToFileURL(npcSystemPath).href);
assert.equal(
  typeof npcSystemModule.createNpcSystem,
  'function',
  'Expected npc-system.js to import successfully and export createNpcSystem.',
);

console.log('npc-system smoke/static checks passed.');
