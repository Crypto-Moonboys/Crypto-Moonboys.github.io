import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_SCRIPT = path.join(ROOT, 'scripts', 'worker-deploy-readiness-audit.mjs');

async function withFixture({ deployStatus, workers }, run) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'worker-audit-fixture-'));
  try {
    const workersDir = path.join(fixtureRoot, 'workers');
    await mkdir(workersDir, { recursive: true });
    await writeFile(path.join(workersDir, 'DEPLOY_STATUS.json'), JSON.stringify(deployStatus, null, 2));
    for (const [folder, wranglerToml] of Object.entries(workers)) {
      const folderPath = path.join(workersDir, folder);
      await mkdir(folderPath, { recursive: true });
      await writeFile(path.join(folderPath, 'wrangler.toml'), wranglerToml);
    }
    await run(fixtureRoot);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

function runAudit(fixtureRoot) {
  try {
    const output = execFileSync('node', [AUDIT_SCRIPT], {
      cwd: ROOT,
      env: { ...process.env, WORKER_AUDIT_ROOT: fixtureRoot },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (err) {
    return {
      ok: false,
      output: `${err.stdout || ''}${err.stderr || ''}`,
    };
  }
}

await withFixture(
  {
    deployStatus: {
      'workers/sample-live': { status: 'live-deployable', deploy: true },
    },
    workers: {
      'sample-live': `
name = "sample-live"
# id = "YOUR_EXAMPLE_KV_ID"
[[kv_namespaces]]
binding = "CACHE"
id = "real_kv_id" # YOUR_COMMENT_ONLY_EXAMPLE
preview_id = "real_kv_preview"
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, true, `placeholders inside comments must not fail audit\n${result.output}`);
  },
);

await withFixture(
  {
    deployStatus: {
      'workers/sample-live': { status: 'live-deployable', deploy: true },
    },
    workers: {
      'sample-live': `
name = "sample-live"
[[kv_namespaces]]
binding = "CACHE"
id = "YOUR_CACHE_KV_ID"
preview_id = "real_kv_preview"
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'live-deployable workers must fail when binding values contain placeholders');
    assert.ok(result.output.includes('YOUR_CACHE_KV_ID'), 'expected placeholder value in audit output');
  },
);

await withFixture(
  {
    deployStatus: {
      'workers/sample-live-single': { status: 'live-deployable', deploy: true },
    },
    workers: {
      'sample-live-single': `
name = "sample-live-single"
[[kv_namespaces]]
binding = "CACHE"
id = 'YOUR_CACHE_KV_ID'
preview_id = 'real_kv_preview'
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'live-deployable workers must fail when single-quoted binding values contain placeholders');
    assert.ok(result.output.includes("id='YOUR_CACHE_KV_ID'"), 'expected single-quoted placeholder value in audit output');
  },
);

await withFixture(
  {
    deployStatus: {
      'workers/sample-live-empty-double': { status: 'live-deployable', deploy: true },
    },
    workers: {
      'sample-live-empty-double': `
name = "sample-live-empty-double"
[[d1_databases]]
binding = "DB"
database_id = ""
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'live-deployable workers must fail when double-quoted binding values are empty');
    assert.ok(result.output.includes('database_id=""'), 'expected empty double-quoted binding in audit output');
  },
);

await withFixture(
  {
    deployStatus: {
      'workers/sample-live-empty-single': { status: 'live-deployable', deploy: true },
    },
    workers: {
      'sample-live-empty-single': `
name = "sample-live-empty-single"
[[d1_databases]]
binding = "DB"
database_id = ''
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'live-deployable workers must fail when single-quoted binding values are empty');
    assert.ok(result.output.includes("database_id=''"), 'expected empty single-quoted binding in audit output');
  },
);

await withFixture(
  {
    deployStatus: {
      'workers/sample-blocked': { status: 'stub-blocked', deploy: false, reason: 'intentional placeholders' },
    },
    workers: {
      'sample-blocked': `
name = "sample-blocked"
[[kv_namespaces]]
binding = "CACHE"
id = 'YOUR_CACHE_KV_ID'
preview_id = "YOUR_CACHE_KV_ID"
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, true, `stub-blocked workers may keep placeholder bindings\n${result.output}`);
  },
);

await withFixture(
  {
    deployStatus: {
      'workers/sample-live-db': { status: 'live-deployable', deploy: true },
    },
    workers: {
      'sample-live-db': `
name = "sample-live-db"
[[d1_databases]]
binding = "DB"
database_id = "YOUR_DB_ID"
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'live-deployable workers must fail when database_id contains placeholders');
    assert.ok(result.output.includes('YOUR_DB_ID'), 'expected database placeholder in audit output');
  },
);
