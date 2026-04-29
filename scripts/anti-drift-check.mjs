/**
 * anti-drift-check.mjs
 *
 * Level 2 anti-drift enforcement for Crypto Moonboys.
 * Runs as a Node ESM script — no dependencies beyond Node builtins.
 *
 * Checks enforced:
 *  1. Required root files must exist.
 *  2. Required game directories must exist.
 *  3. Forbidden paths must not exist.
 *  4. README.md must not be empty and must contain key headings.
 *  5. HexGL must not be re-activated as an XP source.
 *  6. Block Topia client must not re-introduce removed directories.
 *  7. robots.txt must remain at repo root.
 *  8. Arcade game index pages must not reference removed modules.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

let failures = 0;
let warnings = 0;

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  failures += 1;
}

function warn(msg) {
  console.warn(`  [WARN] ${msg}`);
  warnings += 1;
}

function pass(msg) {
  console.log(`  [PASS] ${msg}`);
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

// ── 1. Required root files ────────────────────────────────────────────────────
console.log('\n[1] Required root files');
const requiredRootFiles = [
  'README.md',
  'robots.txt',
  '.nojekyll',
  'index.html',
  'CNAME',
];
for (const f of requiredRootFiles) {
  if (exists(f)) {
    pass(f);
  } else {
    fail(`Missing required root file: ${f}`);
  }
}

// ── 2. Required game directories ──────────────────────────────────────────────
console.log('\n[2] Required arcade game directories');
const requiredGames = [
  'games/invaders-3008',
  'games/asteroid-fork',
  'games/breakout-bullrun',
  'games/pac-chain',
  'games/snake-run',
  'games/tetris-block-topia',
];
for (const g of requiredGames) {
  if (exists(g)) {
    pass(g);
  } else {
    fail(`Missing required game directory: ${g}`);
  }
}

// ── 3. Forbidden paths (removed modules that must not return) ─────────────────
console.log('\n[3] Forbidden paths');
const forbiddenPaths = [
  // Block Topia removed subsystems
  'games/block-topia/world',
  'games/block-topia/ui',
  'games/block-topia/economy',
  'games/block-topia/duel',
  // Old HexGL variants
  'games/hexgl',
];
for (const f of forbiddenPaths) {
  if (!exists(f)) {
    pass(`Absent (good): ${f}`);
  } else {
    fail(`Forbidden path exists: ${f}`);
  }
}

// ── 4. README.md content checks ───────────────────────────────────────────────
console.log('\n[4] README.md content');
const readme = read('README.md');
if (!readme) {
  fail('README.md is missing or unreadable');
} else if (readme.trim().length < 100) {
  fail('README.md appears to be empty or too short (< 100 chars)');
} else {
  const requiredHeadings = [
    'Repository Scope',
    'Arcade Structure',
    'Current Live Arcade Games',
  ];
  for (const h of requiredHeadings) {
    if (readme.includes(h)) {
      pass(`README contains heading: "${h}"`);
    } else {
      fail(`README.md missing required heading: "${h}"`);
    }
  }
}

// ── 5. HexGL must not be re-activated as an XP source ────────────────────────
console.log('\n[5] HexGL XP source check');
const hexglBootstrap = read('js/arcade/games/hexgl-monster-max/bootstrap.js');
if (hexglBootstrap === null) {
  pass('hexgl-monster-max bootstrap not present (deprecated)');
} else {
  // Score submission must remain disabled.
  // Check each line: if it contains submitScore( and is NOT a comment line, flag it.
  const activeSubmitLine = hexglBootstrap.split('\n').some((line) => {
    const trimmed = line.trim();
    // Skip single-line comments and block-comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return false;
    }
    // Also remove inline trailing comments before testing
    const withoutInlineComment = trimmed.replace(/\/\/.*$/, '');
    return /submitScore\s*\(/.test(withoutInlineComment);
  });
  if (activeSubmitLine) {
    fail('hexgl-monster-max bootstrap appears to have score submission re-enabled');
  } else {
    pass('hexgl-monster-max score submission remains disabled');
  }
}

// ── 6. Block Topia: no Pressure Protocol or street-signal remnants ────────────
console.log('\n[6] Block Topia clean-state check');
const btFiles = ['games/block-topia/main.js', 'games/block-topia/network.js'];
const btForbiddenPatterns = [
  { pattern: /PressureProtocol/i, label: 'PressureProtocol reference' },
  { pattern: /street.signal/i, label: 'street-signal reference' },
  { pattern: /solo.?mode/i, label: 'solo mode reference' },
];
for (const file of btFiles) {
  const src = read(file);
  if (src === null) {
    warn(`Block Topia file not found: ${file}`);
    continue;
  }
  for (const { pattern, label } of btForbiddenPatterns) {
    if (pattern.test(src)) {
      fail(`${file} contains forbidden ${label}`);
    } else {
      pass(`${file}: no ${label}`);
    }
  }
}

// ── 7. robots.txt location ────────────────────────────────────────────────────
console.log('\n[7] robots.txt location');
if (exists('robots.txt')) {
  pass('robots.txt present at root');
  // Must not also exist in a sub-directory that would shadow it
  if (exists('games/robots.txt')) {
    fail('games/robots.txt also exists — may shadow root robots.txt');
  }
} else {
  fail('robots.txt missing from root');
}

// ── 8. Arcade game index pages: forbidden script references ───────────────────
console.log('\n[8] Arcade index pages: forbidden script references');
const gameDirs = requiredGames;
const forbiddenScriptRefs = [
  'hexgl-score-submit',
  'pressure-protocol',
  'street-signal',
];
for (const gameDir of gameDirs) {
  const indexPath = `${gameDir}/index.html`;
  const src = read(indexPath);
  if (src === null) {
    warn(`No index.html found for game: ${gameDir}`);
    continue;
  }
  let hasForbiddenRef = false;
  for (const ref of forbiddenScriptRefs) {
    if (src.includes(ref)) {
      hasForbiddenRef = true;
      fail(`${indexPath} references forbidden script: "${ref}"`);
    }
  }
  if (!hasForbiddenRef) {
    pass(`${gameDir}/index.html: no forbidden script references`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Anti-drift check complete.`);
console.log(`  Failures : ${failures}`);
console.log(`  Warnings : ${warnings}`);
console.log('─────────────────────────────────────────\n');

if (failures > 0) {
  process.exit(1);
}
