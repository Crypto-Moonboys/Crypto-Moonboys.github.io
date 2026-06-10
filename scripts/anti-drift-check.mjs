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
  // Crypto_Moonboys_Master_Source_of_Truth_v1.md and city_block_topia_dev_build_deck.md
  // are intentionally omitted from FORBIDDEN_PATHS because they are canonical root
  // project references, and Sparky / future site-brain documentation need stable root paths.
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

/* ── Canonical domain drift check ──────────────────────────────────────────
 * Public-facing deploy files must never reference the old github.io domain.
 * Canonical public domain is https://cryptomoonboys.com.
 *
 * Using a regex with escaped dots so the match is precise to the hostname
 * rather than an open-ended substring search.
 */
const OLD_DOMAIN_RE = /crypto-moonboys\.github\.io/;

// Explicit public-facing files that must be clean of the old domain
const DEPLOY_FILE_PATTERNS = [
  'robots.txt',
  'sitemap.xml',
  'index.html',
  'about/index.html',
];

// Directories whose *.html files are all public-facing deploy pages
const DEPLOY_HTML_DIRS = [
  'about',
  'categories',
  'wiki',
  'games',
];

function collectDeployHtmlFiles(absDir, files = []) {
  if (!fs.existsSync(absDir)) return files;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const absEntry = path.join(absDir, entry.name);

    if (entry.isDirectory()) {
      const name = entry.name;
      if (
        name.startsWith('.') ||
        name === 'node_modules' ||
        name === '.git' ||
        name.startsWith('_')
      ) {
        continue;
      }
      collectDeployHtmlFiles(absEntry, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.html')) continue;
    if (entry.name.startsWith('_')) continue;
    files.push(absEntry);
  }
  return files;
}

const deployFilesToCheck = [
  ...DEPLOY_FILE_PATTERNS.map((f) => path.join(ROOT, f)),
  ...DEPLOY_HTML_DIRS.flatMap((dir) => {
    const absDir = path.join(ROOT, dir);
    return collectDeployHtmlFiles(absDir);
  }),
  // Root-level HTML pages (excluding _ prefixed templates)
  ...fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.html') && !e.name.startsWith('_'))
    .map((e) => path.join(ROOT, e.name)),
];

for (const absPath of deployFilesToCheck) {
  if (!fs.existsSync(absPath)) continue;
  const content = fs.readFileSync(absPath, 'utf8');
  if (OLD_DOMAIN_RE.test(content)) {
    failures.push(`Canonical domain drift: "crypto-moonboys.github.io" found in ${path.relative(ROOT, absPath)}`);
  }
}

/* ── robots/sitemap contradiction guards ─────────────────────────────────── */
const ROBOTS_PATH = path.join(ROOT, 'robots.txt');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const EXPECTED_SITEMAP_URL = 'https://cryptomoonboys.com/sitemap.xml';
const SITEMAP_FORBIDDEN_PATHS = [
  '/agent.html',
  '/about/index.html',
  '/articles.html',
];

if (!fs.existsSync(ROBOTS_PATH)) {
  failures.push('robots.txt missing');
}

if (!fs.existsSync(SITEMAP_PATH)) {
  failures.push('sitemap.xml missing');
}

if (fs.existsSync(ROBOTS_PATH) && fs.existsSync(SITEMAP_PATH)) {
  const robotsContent = fs.readFileSync(ROBOTS_PATH, 'utf8');
  const sitemapContent = fs.readFileSync(SITEMAP_PATH, 'utf8');

  const sitemapLine = robotsContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^sitemap:/i.test(line));

  const robotsSitemapUrl = sitemapLine ? sitemapLine.replace(/^sitemap:\s*/i, '').trim() : '';
  if (robotsSitemapUrl !== EXPECTED_SITEMAP_URL) {
    const observedSitemapUrl = robotsSitemapUrl || '(missing)';
    const observedSitemapLine = sitemapLine || '(no Sitemap line found)';
    failures.push(
      `robots.txt Sitemap must be exactly ${EXPECTED_SITEMAP_URL}; found ${observedSitemapUrl} from line: ${observedSitemapLine}`,
    );
  }

  for (const forbiddenPath of SITEMAP_FORBIDDEN_PATHS) {
    if (sitemapContent.includes(`<loc>https://cryptomoonboys.com${forbiddenPath}</loc>`)) {
      failures.push(`sitemap.xml must not contain ${forbiddenPath}`);
    }
  }

  const disallowedExactPaths = robotsContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^disallow:/i.test(line))
    .map((line) => line.replace(/^disallow:\s*/i, '').trim())
    .filter((value) => value.startsWith('/') && value.endsWith('.html') && !value.includes('*'));

  for (const disallowedPath of disallowedExactPaths) {
    if (sitemapContent.includes(`<loc>https://cryptomoonboys.com${disallowedPath}</loc>`)) {
      failures.push(`sitemap.xml includes robots-disallowed page ${disallowedPath}`);
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
