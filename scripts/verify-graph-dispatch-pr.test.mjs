import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatedGraphDispatchBase, fetchVerifiedGraphDispatchBase } from './verify-graph-dispatch-pr.mjs';

const repo = 'Crypto-Moonboys/Crypto-Moonboys.github.io';
const branch = 'automation/verified-graph-refresh';
const head = 'b'.repeat(40);
const base = 'a'.repeat(40);
const context = {
  prNumber: '1589',
  repository: repo,
  ref: 'refs/heads/' + branch,
  sha: head,
};
function pr() {
  return {
    number: 1589, state: 'open',
    head: { sha: head, ref: branch, repo: { full_name: repo } },
    base: { sha: base, ref: 'main', repo: { full_name: repo } },
  };
}
test('accepted generated PR obtains the GitHub-owned distinct main base', () => {
  assert.equal(validatedGraphDispatchBase(pr(), context), base);
});
test('reject caller HEAD as base and all mismatched PR authorities', () => {
  const invalid = [
    x => { x.base.sha = head; },
    x => { x.head.sha = base; },
    x => { x.head.ref = 'another-branch'; },
    x => { x.head.repo.full_name = 'attacker/fork'; },
    x => { x.base.repo.full_name = 'attacker/fork'; },
    x => { x.base.ref = 'development'; },
    x => { x.state = 'closed'; },
    x => { x.number = 100; },
    x => { x.base.sha = 'not-a-sha'; },
  ];
  for (const corrupt of invalid) {
    const data = pr();
    corrupt(data);
    assert.throws(() => validatedGraphDispatchBase(data, context), /Dispatched graph checks/);
  }
  for (const badContext of [
    { ref: 'refs/heads/main' },
    { sha: base },
    { repository: 'another/repository' },
    { prNumber: '1590' },
  ]) {
    assert.throws(() => validatedGraphDispatchBase(pr(), { ...context, ...badContext }), /Dispatched graph checks/);
  }
});
test('lookup failure, invalid JSON, bad auth or invalid input fail closed', async () => {
  const good = async () => ({ ok: true, json: async () => pr() });
  assert.equal(await fetchVerifiedGraphDispatchBase(context, 'test-token', good), base);
  await assert.rejects(fetchVerifiedGraphDispatchBase(context, '', good), /Missing or invalid/);
  await assert.rejects(fetchVerifiedGraphDispatchBase({ ...context, prNumber: head }, 'token', good), /Missing or invalid/);
  await assert.rejects(fetchVerifiedGraphDispatchBase(context, 'token', async () => ({ok: false})), /lookup failed/);
  await assert.rejects(fetchVerifiedGraphDispatchBase(context, 'token', async () => ({ok: true, json: async () => { throw new Error('malformed'); }})), /malformed/);
});
