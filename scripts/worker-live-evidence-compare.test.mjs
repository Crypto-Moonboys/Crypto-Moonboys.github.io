#!/usr/bin/env node

import assert from 'node:assert/strict';
import { compareWorkerProvenanceEvidence } from './compare-worker-provenance-evidence.mjs';

const COMMIT = 'd554b56713f2d0fb6d881dd0b6200f9850575194';
const request = {
  schema_version: 1,
  expected_commit: COMMIT,
  services: ['moonboys-api', 'moonboys-leaderboard', 'moonboys-anti-cheat'],
};
const workers = [
  {
    service: 'moonboys-api',
    commit: COMMIT,
    deployed_at: '2026-07-31T07:13:53.589Z',
    url: 'https://moonboys-api.sercullen.workers.dev/deployment-info',
  },
  {
    service: 'moonboys-leaderboard',
    commit: COMMIT,
    deployed_at: '2026-07-31T07:15:18.620Z',
    url: 'https://moonboys-leaderboard.sercullen.workers.dev/deployment-info',
  },
  {
    service: 'moonboys-anti-cheat',
    commit: COMMIT,
    deployed_at: '2026-07-31T07:16:08.601Z',
    url: 'https://moonboys-anti-cheat.sercullen.workers.dev/deployment-info',
  },
];
const generated = {
  verified_at: '2026-07-31T08:00:00.000Z',
  expected_commit: COMMIT,
  workers,
};
const committed = {
  schema_version: 1,
  verified_at: '2026-07-31T07:27:19.124Z',
  expected_commit: COMMIT,
  workflow_run_url: 'https://github.com/Crypto-Moonboys/Crypto-Moonboys.github.io/actions/runs/30612857045',
  artifact: { id: 1 },
  workers,
};

assert.deepEqual(
  compareWorkerProvenanceEvidence({ generated, committed, request }),
  { expected_commit: COMMIT, workers },
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
  commit: COMMIT,
  deployed_at: '2026-07-31T07:17:00.000Z',
  url: 'https://unexpected.example/deployment-info',
});
assert.throws(
  () => compareWorkerProvenanceEvidence({ generated, committed: extraService, request }),
  /unsupported service/,
);

console.log('worker-live-evidence-compare.test.mjs passed');
