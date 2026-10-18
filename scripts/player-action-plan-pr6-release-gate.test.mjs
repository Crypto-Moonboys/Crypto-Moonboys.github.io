import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(path.join(ROOT, name), 'utf8');
const EVIDENCE_PATH = 'data/player-action-plan-pr6-release-evidence.v1.json';
const evidence = JSON.parse(read(EVIDENCE_PATH));
const runner = read('scripts/ci-domain-runner.mjs');

function releaseErrors(record) {
  const errors = [];
  const p = record?.provenance || {};
  if (record?.production_state !== 'verified') return errors;
  if (record.owner_approval !== 'approved') errors.push('GK approval is missing');
  if (record.automation_state !== 'ci_green') errors.push('all CI domains are not confirmed');
  const sha = record.ci?.reviewed_head_sha;
  const isSha = value => /^[0-9a-f]{40}$/u.test(value || '');
  const githubEvidence = value => /^https:\/\/github\.com\/Crypto-Moonboys\/Crypto-Moonboys\.github\.io\/(?:actions\/runs\/\d+|pull\/1558(?:#.*)?)$/u.test(value || '');
  if (!isSha(sha)) errors.push('reviewed CI head SHA is missing');
  for (const domain of ['ci-wiki', 'ci-worker-api', 'ci-arcade', 'ci-wax', 'ci-visual']) {
    const result = record.ci?.domains?.[domain];
    if (!isSha(result?.head_sha) || result.head_sha !== sha ||
        result.conclusion !== 'success' || !githubEvidence(result.run_url) ||
        !/\/actions\/runs\/\d+$/u.test(result.run_url || ''))
      errors.push(domain + ' success evidence missing or not tied to reviewed head SHA');
  }
  if (!isSha(record.gk_approval?.approved_head_sha) ||
      record.gk_approval.approved_head_sha !== sha ||
      !/^https:\/\/github\.com\/Crypto-Moonboys\/Crypto-Moonboys\.github\.io\/(?:pull\/1558|issues\/1552)#(?:issuecomment|pullrequestreview)-\d+$/u.test(record.gk_approval?.approval_url || ''))
    errors.push('explicit GK approval link is missing or does not match reviewed head SHA');
  if (!Array.isArray(record.scenarios) || record.scenarios.length !== 15 ||
      record.scenarios.some(s => s.live_status !== 'pass' || !/^https:\/\//u.test(s.evidence_url || ''))) {
    errors.push('signed-account acceptance evidence is incomplete');
  }
  if (!/^[0-9a-f]{40}$/u.test(p.pages?.expected_merge_sha || '') ||
      p.pages.expected_merge_sha !== p.pages.deployed_sha ||
      !/^https:\/\//u.test(p.pages.deployment_run_url || '') ||
      !p.pages.verified_at_utc) errors.push('Pages published SHA unverified');
  if (!/^[0-9a-f]{40}$/u.test(p.worker?.deployment_info_sha || '') ||
      p.worker.deployment_info_sha !== p.worker.expected_sha ||
      !/^https:\/\//u.test(p.worker.verification_url || '') ||
      !p.worker.verified_at_utc) errors.push('Worker provenance unverified');
  if (!p.d1?.verified_at_utc || !/^https:\/\//u.test(p.d1.applied_migration_evidence_url || ''))
    errors.push('D1 applied migration evidence unverified');
  if (!/^[0-9a-f]{40}$/u.test(p.rollback?.last_known_good_pages_sha || '') ||
      !/^[0-9a-f]{40}$/u.test(p.rollback?.last_known_good_worker_sha || '') ||
      !p.rollback.operator || !/^https:\/\//u.test(p.rollback.exercise_evidence_url || ''))
    errors.push('rollback proof incomplete');
  return errors;
}

test('PR6 acceptance inventory preserves all fifteen issue #1552 scenarios and their executable coverage pointers', () => {
  assert.equal(evidence.schema_version, 1);
  assert.equal(evidence.issue, 1552);
  assert.equal(evidence.phase, 'PR6');
  assert.match(evidence.baseline_main_sha, /^[0-9a-f]{40}$/u);
  assert.deepEqual(evidence.scenarios.map(s => s.id),
    Array.from({length:15}, (_, i) => 'AC-' + String(i + 1).padStart(2, '0')));
  for (const scenario of evidence.scenarios) {
    assert.ok(scenario.title && scenario.live_check, scenario.id + ' needs a live verification instruction');
    assert.ok(Array.isArray(scenario.automated) && scenario.automated.length,
      scenario.id + ' needs an automated regression pointer');
    for (const item of scenario.automated) {
      assert.match(item.suite, /^scripts\/[a-z0-9-]+\.test\.mjs$/u);
      assert.ok(existsSync(path.join(ROOT, item.suite)), scenario.id + ' missing suite: ' + item.suite);
      assert.ok(read(item.suite).includes(item.marker),
        scenario.id + ' coverage anchor not found: ' + item.marker);
      assert.ok(runner.includes("'" + item.suite + "'"),
        scenario.id + ' suite is not registered in a CI domain: ' + item.suite);
    }
  }
});

test('tracked PR6 manifest stays a pre-release inventory; final attestation is external to its subject commit', () => {
  assert.equal(evidence.production_state, 'not_verified',
    'do not commit final verification into the code whose SHA is being certified');
  assert.equal(evidence.automation_state, 'requires_ci_execution');
  assert.equal(evidence.owner_approval, 'pending');
  assert.equal(evidence.ci.reviewed_head_sha, null);
  assert.equal(evidence.gk_approval.approved_head_sha, null);
  assert.ok(Object.values(evidence.ci.domains).every(item =>
    item.head_sha === null && item.conclusion === null && item.run_url === null));
  assert.ok(evidence.scenarios.every(item =>
    item.live_status === 'pending' && item.evidence_url === null));
  assert.deepEqual(releaseErrors(evidence), []);
});

test('PR6 evidence cannot claim deployment or sign-off merely because tests exist', () => {
  assert.ok(['not_verified', 'verified'].includes(evidence.production_state));
  assert.ok(['requires_ci_execution', 'ci_green'].includes(evidence.automation_state));
  assert.ok(['pending', 'approved'].includes(evidence.owner_approval));
  assert.equal(evidence.provenance.d1.migration_required, 'no_new_migration_in_pr6');
  for (const item of evidence.scenarios) {
    assert.ok(['pending', 'pass', 'fail'].includes(item.live_status), item.id + ' has an invalid result');
    if (item.live_status === 'pending') assert.equal(item.evidence_url, null,
      item.id + ' must not attach a success reference to a pending test');
    if (item.live_status === 'pass') assert.match(item.evidence_url || '', /^https:\/\//u,
      item.id + ' cannot be passed without a reviewable redacted evidence link');
  }
  assert.deepEqual(releaseErrors(evidence), [],
    'a verified release needs all actual CI, signed, deployment, D1 and rollback evidence');
  const falselyApproved = structuredClone(evidence);
  falselyApproved.production_state = 'verified';
  falselyApproved.owner_approval = 'approved';
  falselyApproved.automation_state = 'ci_green';
  falselyApproved.scenarios.forEach(s => { s.live_status = 'pending'; s.evidence_url = null; });
  falselyApproved.ci = { reviewed_head_sha: null, domains: {} };
  falselyApproved.gk_approval = { approved_head_sha: null, approval_url: null };
  falselyApproved.provenance = {
    pages: { expected_merge_sha: null, deployed_sha: null, deployment_run_url: null, verified_at_utc: null },
    worker: { deployment_info_sha: null, expected_sha: null, verification_url: null, verified_at_utc: null },
    d1: { migration_required: 'no_new_migration_in_pr6', applied_migration_evidence_url: null, verified_at_utc: null },
    rollback: { last_known_good_pages_sha: null, last_known_good_worker_sha: null, operator: null, exercise_evidence_url: null },
  };
  const negativeErrors = releaseErrors(falselyApproved);
  for (const message of ['signed-account acceptance evidence is incomplete',
    'Pages published SHA unverified', 'Worker provenance unverified',
    'D1 applied migration evidence unverified', 'rollback proof incomplete',
    'reviewed CI head SHA is missing', 'explicit GK approval link is missing or does not match reviewed head SHA']) {
    assert.ok(negativeErrors.includes(message), 'negative fixture must expose missing: ' + message);
  }
  for (const domain of ['ci-wiki', 'ci-worker-api', 'ci-arcade', 'ci-wax', 'ci-visual'])
    assert.ok(negativeErrors.some(message => message.startsWith(domain + ' success evidence')),
      'negative fixture missing ' + domain);

});

test('PR6 deploy/rollback manual references and user instructions stay in place', () => {
  const runbook = read('docs/player-action-plan-pr6-release-2026-10-18.md');
  const guide = read('how-to-play.html');
  for (const item of ['#1552', 'PR 6', '/deployment-info', 'D1', 'Pages',
    'rollback', 'GK', 'signed', 'hold', '360', '390', '1280']) {
    assert.ok(runbook.toLowerCase().includes(item.toLowerCase()), 'runbook is missing ' + item);
  }
  assert.match(guide, /href="\/my-moonboy\.html"/u);
  assert.match(guide, /My Moonboy/u);
  assert.match(guide, /read.only/u);
  assert.match(guide, /Saved Status/u);
});

test('PR6 release boundary retains authenticated, read-only action plan and source-only accepted signals', () => {
  const route = read('workers/moonboys-api/routes/player-action-plan.js');
  const sync = read('js/player-action-sync.js');
  assert.match(route, /request\.method !== 'POST'/u);
  assert.match(route, /containsForbiddenSelector/u);
  assert.match(route, /createReadOnlyActionPlanDb/u);
  assert.match(route, /no-store, private/u);
  assert.match(sync, /new BroadcastChannel\(CHANNEL\)/u);
  assert.match(sync, /action_sync_ready/u);
  assert.ok(!sync.includes("addEventListener('moonboys:score-updated'"),
    'public leaderboard display movement cannot masquerade as an accepted owner action');
});
