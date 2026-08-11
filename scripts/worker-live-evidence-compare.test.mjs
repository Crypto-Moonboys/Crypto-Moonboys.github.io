#!/usr/bin/env node

import assert from 'node:assert/strict';
import { compareWorkerProvenanceEvidence } from './compare-worker-provenance-evidence.mjs';

const API_COMMIT = 'ceb64510c47b19465bc7476d2cef314a525d6d66';
const SHARED_COMMIT = '2323ef3a07794411ff4d5788a02ff63995226cba';
const EXPECTED_COMMITS = {
  'moonboys-api': API_COMMIT,
  'moonboys-leaderboard': SHARED_COMMIT,
  'moonboys-anti-cheat': SHARED_COMMIT,
};
const request = {
  schema_version: 2,
  expected_commits: EXPECTED_COMMITS,
  retained_evidence: 'deployments/evidence/worker-provenance-live-test.json',
  services: ['moonboys-api', 'moonboys-leaderboard', 'moonboys-anti-cheat'],
};
const workers = [
  {
    service: 'moonboys-api',
    commit: API_COMMIT,
    deployed_at: '2026-07-31T07:13:53.589Z',
    url: 'https://moonboys-api.sercullen.workers.dev/deployment-info',
  },
  {
    service: 'moonboys-leaderboard',
    commit: SHARED_COMMIT,
    deployed_at: '2026-07-31T07:15:18.620Z',
    url: 'https://moonboys-leaderboard.sercullen.workers.dev/deployment-info',
  },
  {
    service: 'moonboys-anti-cheat',
    commit: SHARED_COMMIT,
    deployed_at: '2026-07-31T07:16:08.601Z',
    url: 'https://moonboys-anti-cheat.sercullen.workers.dev/deployment-info',
  },
];
const generated = {
  verified_at: '2026-07-31T08:00:00.000Z',
  expected_commits: EXPECTED_COMMITS,
  workers,
};
const committed = {
  schema_version: 2,
  verified_at: '2026-07-31T07:27:19.124Z',
  expected_commits: EXPECTED_COMMITS,
  workflow_run_url: 'https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/30612857045',
  artifact: { id: 1 },
  workers,
};

assert.deepEqual(
  compareWorkerProvenanceEvidence({ generated, committed, request }),
  { expected_commits: EXPECTED_COMMITS, workers },
);

const liveMismatch = structuredClone(generated);
liveMismatch.workers[0].commit = SHARED_COMMIT;
assert.throws(
  () => compareWorkerProvenanceEvidence({ generated: liveMismatch, committed, request }),
  /generated\.moonboys-api\.commit does not match request/,
  'a live Worker commit mismatch must fail closed',
);

const committedExpectationMismatch = structuredClone(committed);
committedExpectationMismatch.expected_commits['moonboys-api'] = SHARED_COMMIT;
assert.throws(
  () => compareWorkerProvenanceEvidence({ generated, committed: committedExpectationMismatch, request }),
  /committed\.expected_commits\.moonboys-api does not match request/,
  'retained evidence cannot relabel a deployed Worker commit as expected',
);

const wrongTimestamp = structuredClone(committed);
wrongTimestamp.workers[1].deployed_at = '2026-07-31T07:15:19.620Z';
assert.throws(
  () => compareWorkerProvenanceEvidence({ generated, committed: wrongTimestamp, request }),
  /does not match freshly captured production output/,
);

const wrongUrl = structuredClone(committed);
wrongUrl.workers[2].url = 'https://example.com/deployment-info';
assert.throws(
  () => compareWorkerProvenanceEvidence({ generated, committed: wrongUrl, request }),
  /does not match freshly captured production output/,
);

const missingService = structuredClone(committed);
missingService.workers.pop();
assert.throws(
  () => compareWorkerProvenanceEvidence({ generated, committed: missingService, request }),
  /missing services/,
);

const extraService = structuredClone(committed);
extraService.workers.push({
  service: 'unexpected-worker',
  commit: SHARED_COMMIT,
  deployed_at: '2026-07-31T07:17:00.000Z',
  url: 'https://unexpected.example/deployment-info',
});
assert.throws(
  () => compareWorkerProvenanceEvidence({ generated, committed: extraService, request }),
  /unsupported service/,
);

console.log('worker-live-evidence-compare.test.mjs passed');
