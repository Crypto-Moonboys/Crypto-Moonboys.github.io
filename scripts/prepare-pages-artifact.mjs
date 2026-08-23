#!/usr/bin/env node
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const artifactDir = process.argv[2] || 'public-site';
const repoRoot = path.resolve('.');
const resolvedArtifactDir = path.resolve(artifactDir);
const filesystemRoot = path.parse(resolvedArtifactDir).root;
const PROTECTED_REPO_PATHS = ['.git', '.github'];

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

if (resolvedArtifactDir === repoRoot || resolvedArtifactDir === filesystemRoot) {
  throw new Error(`Refusing to use unsafe Pages artifact path: ${artifactDir}`);
}

if (!resolvedArtifactDir.startsWith(repoRoot + path.sep)) {
  throw new Error(`Refusing to use Pages artifact path outside repository: ${artifactDir}`);
}

for (const protectedPath of PROTECTED_REPO_PATHS) {
  const resolvedProtectedPath = path.join(repoRoot, protectedPath);
  if (isPathInside(resolvedProtectedPath, resolvedArtifactDir)) {
    throw new Error(`Refusing to use unsafe Pages artifact path: ${artifactDir}`);
  }
}

const ROOT_FILES = [
  '.nojekyll',
  'CNAME',
  'favicon.png',
  'robots.txt',
  'sitemap.xml',
  'index_stats.json',
  'sam-memory.json',
];

const ROOT_PUBLIC_EXTENSIONS = new Set([
  '.html',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.xml',
  '.txt',
]);

const PUBLIC_DIRECTORIES = [
  'about',
  'api',
  'art',
  'assets',
  'battle-chamber',
  'brand-canon',
  'categories',
  'css',
  'data',
  'docs',
  'game',
  'games',
  'img',
  'js',
  'lib',
  'og-templates',
  'shared',
  'snapshots',
  'wiki',
];

const FORBIDDEN_ARTIFACT_PATHS = [
  'workers',
  'server',
  'scripts',
  'patches',
  '.github',
  'node_modules',
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function shouldCopyIntoArtifact(sourcePath) {
  const relativeSourcePath = path.relative(repoRoot, sourcePath);
  if (relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) {
    return false;
  }

  const pathSegments = relativeSourcePath.split(path.sep);
  if (pathSegments.includes('test') || pathSegments.includes('tests')) {
    return false;
  }

  const lowerName = path.basename(sourcePath).toLowerCase();
  if (lowerName.includes('.test.') || lowerName.includes('.spec.')) {
    return false;
  }

  return true;
}

async function copyIfExists(source, target) {
  if (!(await exists(source))) return false;
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: shouldCopyIntoArtifact,
  });
  return true;
}

async function main() {
  await rm(resolvedArtifactDir, { recursive: true, force: true });
  await mkdir(resolvedArtifactDir, { recursive: true });

  const rootEntries = await readdir('.', { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (ROOT_PUBLIC_EXTENSIONS.has(extension)) {
      await copyIfExists(entry.name, path.join(resolvedArtifactDir, entry.name));
    }
  }

  for (const file of ROOT_FILES) {
    await copyIfExists(file, path.join(resolvedArtifactDir, file));
  }

  for (const directory of PUBLIC_DIRECTORIES) {
    await copyIfExists(directory, path.join(resolvedArtifactDir, directory));
  }

  for (const forbiddenPath of FORBIDDEN_ARTIFACT_PATHS) {
    if (await exists(path.join(resolvedArtifactDir, forbiddenPath))) {
      throw new Error(`Forbidden path copied into Pages artifact: ${forbiddenPath}`);
    }
  }

  const requiredPaths = ['index.html', 'js', 'css', 'games', 'sam-memory.json'];
  for (const requiredPath of requiredPaths) {
    if (!(await exists(path.join(resolvedArtifactDir, requiredPath)))) {
      throw new Error(`Required Pages artifact path missing: ${requiredPath}`);
    }
  }

  console.log(`Prepared GitHub Pages artifact: ${path.relative(repoRoot, resolvedArtifactDir)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
