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

for (const { requiredSecrets, toml, ok } of [
  { requiredSecrets: [], toml: 'name = "moonboys-api"', ok: false },
  { requiredSecrets: ['TELEGRAM_WEBHOOK_SECRET'], toml: 'name = "moonboys-api"', ok: true },
  { requiredSecrets: ['TELEGRAM_WEBHOOK_SECRET'], toml: 'name = "moonboys-api"\n[vars]\nTELEGRAM_WEBHOOK_SECRET = "fixture-do-not-print"', ok: false },
]) {
  await withFixture({
    deployStatus: { 'workers/moonboys-api': { status: 'live-deployable', deploy: true, required_secrets: requiredSecrets } },
    workers: { 'moonboys-api': toml },
  }, async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, ok, result.output);
    if (!ok) assert.match(result.output, /TELEGRAM_WEBHOOK_SECRET/);
    assert.ok(!result.output.includes('fixture-do-not-print'), 'readiness errors must not print a configured secret value');
  });
}

const plaintextSecret = 'fixture-do-not-print';
for (const [label, binding] of [
  ['inline root variables', `vars = { TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}" }`],
  ['inline second property', `vars = { PUBLIC_MODE = "live", TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}" }`],
  ['dotted root variables', `vars.TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}"`],
  ['double-quoted dotted keys', `"vars"."TELEGRAM_WEBHOOK_SECRET" = "${plaintextSecret}"`],
  ['literal-quoted dotted keys', `'vars'.'TELEGRAM_WEBHOOK_SECRET' = '${plaintextSecret}'`],
  ['double-quoted key in table', `[vars]\n"TELEGRAM_WEBHOOK_SECRET" = "${plaintextSecret}"`],
  ['literal-quoted key in table', `[vars]\n'TELEGRAM_WEBHOOK_SECRET' = '${plaintextSecret}'`],
  ['escaped key', `vars."TELEGRAM_WEBHOOK_\\u0053ECRET" = "${plaintextSecret}"`],
  ['long Unicode escape key', `vars."TELEGRAM_WEBHOOK_\\U00000053ECRET" = "${plaintextSecret}"`],
  ['inline quoted key', `vars = { "TELEGRAM_WEBHOOK_SECRET" = "${plaintextSecret}" }`],
  ['inline escaped key', `vars = { "TELEGRAM_WEBHOOK_\\u0053ECRET" = "${plaintextSecret}" }`],
  ['named environment table', `[env.production.vars]\nTELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}"`],
  ['quoted environment table', `[env."production".'vars']\n'TELEGRAM_WEBHOOK_SECRET' = '${plaintextSecret}'`],
  ['named environment dotted keys', `env.production.vars.TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}"`],
  ['named environment inline variables', `[env.production]\nvars = { TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}" }`],
  ['nested inline environment', `env = { production = { vars = { TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}" } } }`],
  ['object-valued binding', `[vars.TELEGRAM_WEBHOOK_SECRET]\nvalue = "${plaintextSecret}"`],
  ['array-valued binding', `vars = { TELEGRAM_WEBHOOK_SECRET = ["${plaintextSecret}"] }`],
  ['multiline value', `[vars]\nTELEGRAM_WEBHOOK_SECRET = """\n${plaintextSecret}\n"""`],
  ['malformed inline configuration', `vars = { TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}"`],
  ['duplicate configuration keys', `vars.TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}"\nvars.TELEGRAM_WEBHOOK_SECRET = "${plaintextSecret}"`],
]) {
  await withFixture({
    deployStatus: { 'workers/moonboys-api': { status: 'live-deployable', required_secrets: ['TELEGRAM_WEBHOOK_SECRET'] } },
    workers: { 'moonboys-api': `name = "moonboys-api"\n${binding}` },
  }, async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, `${label} must reject a plaintext secret or unreadable configuration`);
    assert.match(result.output, /TELEGRAM_WEBHOOK_SECRET/);
    assert.ok(!result.output.includes(plaintextSecret), `${label} must not expose a secret in diagnostics`);
  });
}

for (const [label, configuration] of [
  ['commented examples', '# vars = { TELEGRAM_WEBHOOK_SECRET = "example" }\n# vars.TELEGRAM_WEBHOOK_SECRET = "example"'],
  ['quoted string example', `vars = { HELP = 'TELEGRAM_WEBHOOK_SECRET = "example"' }`],
  ['multiline string example', `vars = { HELP = '''\nTELEGRAM_WEBHOOK_SECRET = "example"\n# still literal string text\n''' }`],
  ['normal root variables', 'vars = { PUBLIC_MODE = "live" }'],
  ['normal named environment', '[env.production.vars]\nPUBLIC_MODE = "live"'],
]) {
  await withFixture({
    deployStatus: { 'workers/moonboys-api': { status: 'live-deployable', required_secrets: ['TELEGRAM_WEBHOOK_SECRET'] } },
    workers: { 'moonboys-api': `name = "moonboys-api"\n${configuration}` },
  }, async fixtureRoot => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, true, `${label} must not be mistaken for a configured secret: ${result.output}`);
  });
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

await withFixture(
  {
    deployStatus: {
      'workers/sample-live-secret': {
        status: 'live-deployable',
        deploy: true,
        required_secrets: ['ADMIN_SECRET'],
      },
    },
    workers: {
      'sample-live-secret': `
name = "sample-live-secret"

# Required for POST /public/example.
# Set via Wrangler CLI:
#   wrangler secret put ADMIN_SECRET
#   wrangler secret put SAMPLE_BRIDGE_TOKEN
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, false, 'live-deployable workers must list documented required secrets in DEPLOY_STATUS.json');
    assert.ok(result.output.includes('SAMPLE_BRIDGE_TOKEN'), 'expected missing required secret in audit output');
  },
);

await withFixture(
  {
    deployStatus: {
      'workers/sample-live-optional-secret': {
        status: 'live-deployable',
        deploy: true,
        required_secrets: ['ADMIN_SECRET'],
      },
    },
    workers: {
      'sample-live-optional-secret': `
name = "sample-live-optional-secret"

# Required for POST /public/example.
# Set via Wrangler CLI:
#   wrangler secret put ADMIN_SECRET
#   wrangler secret put OPTIONAL_THREAD_ID # optional topic/thread
`,
    },
  },
  async (fixtureRoot) => {
    const result = runAudit(fixtureRoot);
    assert.equal(result.ok, true, `optional documented secrets must not be required in DEPLOY_STATUS.json\n${result.output}`);
  },
);
