'use strict';

// Preloaded only by the transactional website-payload importer. It gives the
// legacy real-root generators a tiny copy-on-write view of their declared
// output files: writes go to a private inherited directory, and later
// generators read the newest staged version. The importer remains the only
// process that commits those bytes to live repository paths.

const fs = require('node:fs');
const path = require('node:path');

const descriptorText = process.env.WIKI_PUBLISH_STAGE_FD || '';
const repositoryRoot = path.resolve(process.env.WIKI_PUBLISH_ROOT || '');
let relativeOutputs;
try {
  relativeOutputs = JSON.parse(process.env.WIKI_PUBLISH_STAGED_OUTPUTS || '[]');
} catch (error) {
  throw new Error(`Invalid WIKI_PUBLISH_STAGED_OUTPUTS: ${error.message}`);
}

if (!/^[0-9]+$/.test(descriptorText) || Number(descriptorText) < 3) {
  throw new Error('WIKI_PUBLISH_STAGE_FD must identify an inherited directory descriptor');
}
if (!path.isAbsolute(repositoryRoot) || !Array.isArray(relativeOutputs)) {
  throw new Error('Invalid staged wiki publisher environment');
}

const stageRoot = `/proc/self/fd/${Number(descriptorText)}`;
const stageStat = fs.statSync(stageRoot);
if (!stageStat.isDirectory()) throw new Error('Inherited wiki publisher stage is not a directory');

const outputMap = new Map();
for (const relativeValue of relativeOutputs) {
  const relativePath = String(relativeValue || '').replaceAll('\\', '/');
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const check = path.relative(repositoryRoot, absolutePath);
  if (
    !relativePath ||
    !check ||
    check === '..' ||
    check.startsWith(`..${path.sep}`) ||
    path.isAbsolute(check)
  ) {
    throw new Error(`Unsafe staged wiki publisher output: ${relativePath}`);
  }
  outputMap.set(absolutePath, path.join(stageRoot, ...relativePath.split('/')));
}

const original = {
  existsSync: fs.existsSync.bind(fs),
  lstatSync: fs.lstatSync.bind(fs),
  mkdirSync: fs.mkdirSync.bind(fs),
  readFileSync: fs.readFileSync.bind(fs),
  statSync: fs.statSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
};

function mappedOutput(filePath) {
  if (typeof filePath !== 'string' && !Buffer.isBuffer(filePath)) return null;
  return outputMap.get(path.resolve(String(filePath))) || null;
}

function stagedReadPath(filePath) {
  const stagedPath = mappedOutput(filePath);
  return stagedPath && original.existsSync(stagedPath) ? stagedPath : filePath;
}

fs.existsSync = function stagedExistsSync(filePath) {
  const stagedPath = mappedOutput(filePath);
  if (stagedPath && original.existsSync(stagedPath)) return true;
  return original.existsSync(filePath);
};

fs.readFileSync = function stagedReadFileSync(filePath, ...args) {
  return original.readFileSync(stagedReadPath(filePath), ...args);
};

fs.statSync = function stagedStatSync(filePath, ...args) {
  return original.statSync(stagedReadPath(filePath), ...args);
};

fs.lstatSync = function stagedLstatSync(filePath, ...args) {
  return original.lstatSync(stagedReadPath(filePath), ...args);
};

fs.writeFileSync = function stagedWriteFileSync(filePath, data, ...args) {
  const stagedPath = mappedOutput(filePath);
  if (!stagedPath) return original.writeFileSync(filePath, data, ...args);
  original.mkdirSync(path.dirname(stagedPath), { recursive: true, mode: 0o700 });
  if (original.existsSync(stagedPath) && original.lstatSync(stagedPath).isSymbolicLink()) {
    throw new Error(`Refusing staged output symlink: ${stagedPath}`);
  }
  return original.writeFileSync(stagedPath, data, ...args);
};
