#!/usr/bin/env node
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const artifactDir = process.argv[2] || 'public-site';

const ROOT_FILES = [
  '.nojekyll',
  'CNAME',
  'favicon.png',
  'robots.txt',
  'sitemap.xml',
  'index_stats.json',
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

async function copyIfExists(source, target) {
  if (!(await exists(source))) return false;
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  return true;
}

async function main() {
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  const rootEntries = await readdir('.', { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (ROOT_PUBLIC_EXTENSIONS.has(extension)) {
      await copyIfExists(entry.name, path.join(artifactDir, entry.name));
    }
  }

  for (const file of ROOT_FILES) {
    await copyIfExists(file, path.join(artifactDir, file));
  }

  for (const directory of PUBLIC_DIRECTORIES) {
    await copyIfExists(directory, path.join(artifactDir, directory));
  }

  for (const forbiddenPath of FORBIDDEN_ARTIFACT_PATHS) {
    if (await exists(path.join(artifactDir, forbiddenPath))) {
      throw new Error(`Forbidden path copied into Pages artifact: ${forbiddenPath}`);
    }
  }

  const requiredPaths = ['index.html', 'js', 'css', 'games'];
  for (const requiredPath of requiredPaths) {
    if (!(await exists(path.join(artifactDir, requiredPath)))) {
      throw new Error(`Required Pages artifact path missing: ${requiredPath}`);
    }
  }

  console.log(`Prepared GitHub Pages artifact: ${artifactDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
