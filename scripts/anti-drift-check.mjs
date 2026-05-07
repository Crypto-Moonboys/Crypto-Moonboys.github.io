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
];

const FILE_EXTENSIONS = new Set(['.md', '.txt', '.html', '.js', '.mjs', '.yml', '.yaml']);

const FORBIDDEN_PATHS = [
  ['admin', ['space', 'agent.html'].join('-')].join('/'),
  ['docs', [['space', 'agent'].join('-'), 'protected', 'access', 'runbook.md'].join('-')].join('/'),
  ['docs', 'AAA_TO_AAAA_OG_BUILD_ROADMAP.md'].join('/'),
  ['docs', 'block-topia', 'multiplayer-architecture.md'].join('/'),
  ['docs', 'block-topia', 'player-experience.md'].join('/'),
  ['docs', 'block-topia', 'visual-asset-pipeline.md'].join('/'),
  ['games', 'block-topia', 'CURRENT_STATE_AUDIT.md'].join('/'),
  ['workers', 'moonboys-api', 'blocktopia', 'covert.js'].join('/'),
  'HERMES_AGENT_RUNTIME_HANDOVER.md',
  'HERMES_NPC_AGENT_AUDIT_REPORT.md',
  'Crypto_Moonboys_Master_Source_of_Truth_v1.md',
  'city_block_topia_dev_build_deck.md',
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
];

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

const filesToScan = SCAN_TARGETS.flatMap((relPath) => {
  const absPath = path.join(ROOT, relPath);
  return fs.existsSync(absPath) ? walk(absPath) : [];
});

for (const filePath of filesToScan) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  for (const term of FORBIDDEN_TERMS) {
    if (content.includes(term.value)) {
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
