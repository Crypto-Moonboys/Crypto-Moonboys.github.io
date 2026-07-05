import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PUBLIC_DIRS = [
  'about',
  'analytics',
  'battle-chamber',
  'categories',
  'css',
  'games',
  'js',
];

const PUBLIC_ROOT_FILES = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.html') && !entry.name.startsWith('_'))
  .map((entry) => entry.name);

const EXTENSIONS = new Set(['.html', '.js', '.css']);
const EXCLUDED_FILE_PATTERNS = [
  /(^|[\\/])[^\\/]*\.test\.mjs$/i,
  /(^|[\\/])[^\\/]*-test\.mjs$/i,
  /(^|[\\/])wiki-index\.json$/i,
  /(^|[\\/])draft-index\.json$/i,
];

const FORBIDDEN_COPY = [
  { label: 'coming-soon', pattern: /\bcoming\s+soon\b/i },
  { label: 'comming-soon-typo', pattern: /\bcomming\s+soon\b/i },
  { label: 'under-construction', pattern: /\bunder\s+construction\b/i },
  { label: 'not-implemented', pattern: /\bnot\s+implemented\b/i },
  { label: 'not-live-yet', pattern: /\bnot\s+live\s+yet\b/i },
  { label: 'not-live-wired', pattern: /\bnot\s+live\s+wired\b/i },
  { label: 'not-yet-available', pattern: /\bnot\s+yet\s+available\b/i },
  { label: 'connect-wallet-trading', pattern: /\bconnect\s+wallet\b/i },
  { label: 'swap-trading-cta', pattern: /\btrade\s+on\s+swap\b/i },
  { label: 'buy-now-cta', pattern: /\bbuy\s+now\b/i },
  { label: 'guaranteed-reward', pattern: /\bguaranteed\s+rewards?\b/i },
  { label: 'passive-income', pattern: /\bpassive\s+income\b/i },
  { label: 'financial-reward', pattern: /\bfinancial\s+rewards?\b/i },
  { label: 'earn-money', pattern: /\bearn\s+money\b/i },
  { label: 'claim-reward', pattern: /\bclaim\s+rewards?\b/i },
];

function walk(absPath, files = []) {
  if (!fs.existsSync(absPath)) return files;
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(absPath)) && !isExcluded(absPath)) files.push(absPath);
    return files;
  }

  for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    walk(path.join(absPath, entry.name), files);
  }
  return files;
}

function isExcluded(absPath) {
  const rel = path.relative(ROOT, absPath);
  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(rel));
}

function stripComments(content, ext) {
  let stripped = content;
  if (ext === '.html') {
    stripped = stripped.replace(/<!--[\s\S]*?-->/g, (match) => '\n'.repeat(match.split(/\r?\n/).length - 1));
  }
  if (ext === '.js' || ext === '.css') {
    stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, (match) => '\n'.repeat(match.split(/\r?\n/).length - 1));
    stripped = stripped.replace(/(^|[^:])\/\/.*$/gm, '$1');
  }
  return stripped;
}

function lineForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

const files = [
  ...PUBLIC_ROOT_FILES.map((file) => path.join(ROOT, file)),
  ...PUBLIC_DIRS.flatMap((dir) => walk(path.join(ROOT, dir))),
].sort();

const failures = [];

for (const file of files) {
  const ext = path.extname(file);
  const raw = fs.readFileSync(file, 'utf8');
  const content = stripComments(raw, ext);
  for (const rule of FORBIDDEN_COPY) {
    const match = rule.pattern.exec(content);
    if (match) {
      failures.push(`${path.relative(ROOT, file)}:${lineForIndex(content, match.index)} ${rule.label}: "${match[0]}"`);
    }
  }
}

if (failures.length) {
  console.error('Public copy trust guard failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public copy trust guard passed: ${files.length} public files scanned.`);
