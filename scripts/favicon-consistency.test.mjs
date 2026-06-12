import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const REQUIRED_FAVICON_TAG = /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']\/favicon\.png["'])(?=[^>]*\btype=["']image\/png["'])[^>]*>/i;
const failures = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (rel.includes('/node_modules/') || rel.startsWith('node_modules/') || rel.startsWith('_codex_context/')) continue;
      walk(full);
      continue;
    }
    if (!entry.isFile() || !rel.endsWith('.html')) continue;
    const html = fs.readFileSync(full, 'utf8');
    if (!REQUIRED_FAVICON_TAG.test(html)) {
      failures.push(`${rel}: missing standardized favicon tag`);
    }
    if (html.includes('href="/favicon.ico"')) {
      failures.push(`${rel}: references /favicon.ico`);
    }
  }
}

walk(ROOT);

if (failures.length) {
  console.error('Favicon consistency check failed:');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log('PASS favicon consistency across HTML pages');
