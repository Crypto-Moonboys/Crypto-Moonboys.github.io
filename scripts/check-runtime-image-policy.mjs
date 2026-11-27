import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const RASTER = /\.(?:png|jpe?g|webp)$/iu;
const MASTER = /-master\.(?:png|jpe?g|webp)$/iu;
const RUNTIME = /-runtime\.webp$/u;
const PIPELINE_PATH = /^(?:\.github\/workflows\/runtime-image-(?:derivatives|policy)\.yml|data\/runtime-image-(?:manifest|lock)\.json|docs\/runtime-image-pipeline\.md|scripts\/(?:build-runtime-images|check-runtime-image-policy)(?:\.test)?\.mjs|package(?:-lock)?\.json)$/u;

function normalized(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function isRuntimeImagePolicyRelevant(paths) {
  return paths.some(value => {
    const candidate = normalized(value);
    return RASTER.test(candidate) || PIPELINE_PATH.test(candidate);
  });
}

export function runtimeImagePolicyViolations(paths, manifest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    return ['data/runtime-image-manifest.json must be a version 1 manifest with an assets array'];
  }
  const sources = new Set(manifest.assets.map(asset => normalized(String(asset.source || ''))));
  const outputs = new Set(manifest.assets.map(asset => normalized(String(asset.output || ''))));
  const violations = [];
  for (const value of paths) {
    const candidate = normalized(value);
    if (!RASTER.test(candidate)) continue;
    if (MASTER.test(candidate)) {
      if (!sources.has(candidate)) violations.push(`${candidate}: master is not registered in data/runtime-image-manifest.json`);
      continue;
    }
    if (RUNTIME.test(candidate)) {
      if (!outputs.has(candidate)) violations.push(`${candidate}: runtime WebP is not a declared manifest output`);
      continue;
    }
    violations.push(`${candidate}: changed raster files must be named *-master.png|jpg|jpeg|webp or be a declared *-runtime.webp output`);
  }
  return violations;
}

function changedPaths(base, head, root = REPOSITORY_ROOT) {
  if (!head) throw new Error('A head commit SHA is required');
  const args = !base || /^0+$/u.test(base)
    ? ['show', '--pretty=', '--name-only', '--diff-filter=AMCR', head]
    : ['diff', '--name-only', '--diff-filter=AMCR', base, head];
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/u)
    .map(value => value.trim())
    .filter(Boolean);
}

async function runCli(args) {
  const scopeOnly = args[0] === '--scope';
  const offset = scopeOnly ? 1 : 0;
  const base = args[offset];
  const head = args[offset + 1];
  const paths = changedPaths(base, head);
  const relevant = isRuntimeImagePolicyRelevant(paths);
  if (scopeOnly) {
    console.log(`relevant=${relevant}`);
    return;
  }
  if (!relevant) {
    console.log('Runtime image policy passed: no relevant files changed.');
    return;
  }
  const manifest = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, 'data/runtime-image-manifest.json'), 'utf8'));
  const violations = runtimeImagePolicyViolations(paths, manifest);
  if (violations.length) {
    throw new Error(`Runtime image policy violations:\n- ${violations.join('\n- ')}\nUpload the high-quality source as *-master and let the branch workflow generate the declared *-runtime.webp.`);
  }
  console.log(`Runtime image policy passed for ${paths.filter(value => RASTER.test(value)).length} changed raster file(s).`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
