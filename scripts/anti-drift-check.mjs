import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SCAN_TARGETS = [
  'README.md',
  '.copilot-instructions.md',
  'robots.txt',
  '.github/workflows',
  'about/what-is-crypto-moonboys.html',
  'admin',
  'api',
  'docs',
  'games/block-topia',
  'js/arcade-leaderboard.js',
  'js/battle-layer.js',
  'js/components/ui-status-copy.js',
  'workers/moonboys-api/README.md',
  'workers/moonboys-api/blocktopia',
  'scripts',
  'workers',
];

const FILE_EXTENSIONS = new Set(['.md', '.txt', '.html', '.js', '.mjs', '.yml', '.yaml']);

const FORBIDDEN_PATHS = [
  ['admin', ['space', 'agent.html'].join('-')].join('/'),
  ['docs', [['space', 'agent'].join('-'), 'protected', 'access', 'runbook.md'].join('-')].join('/'),
  ['docs', ['AAA', 'TO', 'AAAA', 'OG', 'BUILD', 'ROADMAP.md'].join('_')].join('/'),
  ['docs', 'block-topia', ['multiplayer', 'architecture.md'].join('-')].join('/'),
  ['docs', 'block-topia', ['player', 'experience.md'].join('-')].join('/'),
  ['docs', 'block-topia', ['visual', 'asset', 'pipeline.md'].join('-')].join('/'),
  // CURRENT_STATE_AUDIT.md (games/block-topia/CURRENT_STATE_AUDIT.md) is now
  // a live truth document — no longer forbidden
  ['workers', 'moonboys-api', 'blocktopia', ['covert', 'js'].join('.')].join('/'),
  [['HERMES', 'AGENT', 'RUNTIME', 'HANDOVER.md'].join('_')][0],
  [['HERMES', 'NPC', 'AGENT', 'AUDIT', 'REPORT.md'].join('_')][0],
  [['Crypto', 'Moonboys', 'Master', 'Source', 'of', 'Truth', 'v1.md'].join('_')][0],
  [['city', 'block', 'topia', 'dev', 'build', 'deck.md'].join('_')][0],
  // Anti-drift: old block-topia room file that was replaced by MinimalCityRoom.js
  ['server', 'block-topia', 'src', 'rooms', ['City', 'Room.js'].join('')].join('/'),
];

const FORBIDDEN_TERMS = [
  { label: 'term-1', value: ['Space', 'Agent'].join(' ') },
  { label: 'term-2', value: ['space', 'agent'].join('-') },
  { label: 'term-3', value: ['space', 'cryptomoonboys', 'com'].join('.') },
  { label: 'term-4', value: ['inspect', 'explain', 'propose'].join(' -> ') },
  { label: 'term-5', value: ['Pressure', 'Protocol'].join(' ') },
  { label: 'term-6', value: ['street', 'signal'].join('-') },
  { label: 'term-7', value: ['solo', 'mode'].join(' ') },
  { label: 'term-8', value: ['covert', 'system'].join(' ') },
  { label: 'term-9', value: ['archived', 'runtime', 'wording'].join(' ') },
  { label: 'term-10', value: ['planned', 'integration'].join(' ') },
  { label: 'term-11', value: ['future', 'layer'].join(' ') },
  { label: 'term-12', value: ['coming', 'later'].join(' ') },
  { label: 'term-13', value: ['package', 'present'].join('-') },
  { label: 'term-14', value: ['integration', 'staged'].join('-') },
  { label: 'term-15', value: ['source', 'present'].join('-') },
  { label: 'term-16', value: ['space', 'agent'].join('_') },
  { label: 'term-17', value: ['space', 'agent'].join('/') },
  { label: 'term-18', value: ['space', 'agent'].join('.') },
  // Anti-drift: block-topia runtime protection terms
  { label: 'term-19', value: ['faction', 'war', 'runtime'].join(' ') },
  { label: 'term-21', value: ['Neon', 'Sprawl', 'merge'].join(' ') },
  { label: 'term-24', value: ['SAM', 'world', 'brain'].join(' ') },
  { label: 'term-25', value: ['covert', 'ops'].join(' ') },
];
// Files whose content must not be checked for forbidden terms.
// These are truth/audit documents that explicitly list forbidden patterns for documentation.
const SCAN_TERM_EXCLUDED_FILES = new Set([
  path.join(ROOT, 'games', 'block-topia', 'CURRENT_STATE_AUDIT.md'),
]);

const FORBIDDEN_TERMS_LOWER = FORBIDDEN_TERMS.map((term) => ({
  ...term,
  valueLower: String(term.value).toLowerCase(),
}));

function isScanFile(filePath) {
  return FILE_EXTENSIONS.has(path.extname(filePath));
}

function walk(absPath, files = []) {
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    if (isScanFile(absPath)) files.push(absPath);
    return files;
  }

  for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    walk(path.join(absPath, entry.name), files);
  }
  return files;
}

const failures = [];

for (const relPath of FORBIDDEN_PATHS) {
  if (fs.existsSync(path.join(ROOT, relPath))) {
    failures.push(`Forbidden path exists: ${relPath}`);
  }
}

const filesToScan = Array.from(new Set(SCAN_TARGETS.flatMap((relPath) => {
  const absPath = path.join(ROOT, relPath);
  return fs.existsSync(absPath) ? walk(absPath) : [];
}))).sort();

for (const filePath of filesToScan) {
  const relPath = path.relative(ROOT, filePath);
  if (SCAN_TERM_EXCLUDED_FILES.has(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const contentLower = content.toLowerCase();
  for (const term of FORBIDDEN_TERMS_LOWER) {
    if (contentLower.includes(term.valueLower)) {
      failures.push(`Forbidden term "${term.label}" found in ${relPath}`);
    }
  }
}

if (failures.length) {
  console.error('Anti-drift check failed.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Anti-drift check passed.');
