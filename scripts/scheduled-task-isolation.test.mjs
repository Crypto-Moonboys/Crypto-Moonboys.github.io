import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = await fs.readFile(path.join(ROOT, 'workers/moonboys-api/worker.js'), 'utf8');

const scheduledStart = worker.indexOf('async scheduled(event, env, _ctx)');
assert.notEqual(scheduledStart, -1, 'Worker must keep scheduled handler');
const scheduledEndMatch = /\r?\n  },\r?\n};/.exec(worker.slice(scheduledStart));
const scheduledEnd = scheduledEndMatch ? scheduledStart + scheduledEndMatch.index : -1;
assert.notEqual(scheduledEnd, -1, 'scheduled handler block must be detectable');
const scheduled = worker.slice(scheduledStart, scheduledEnd);

for (const task of [
  'runWaxOnEdgeScheduledSync(env, cron).catch',
  'runTelegramDailyDigest(env, {',
  'runTelegramGroupAnnouncements(env, {',
]) {
  assert.ok(scheduled.includes(task), `scheduled handler must invoke ${task}`);
}

assert.ok(
  /runTelegramDailyDigest\(env,\s*\{[\s\S]*?\}\)\.catch/.test(scheduled),
  'daily digest scheduled task must have its own catch boundary',
);
assert.ok(
  /runTelegramGroupAnnouncements\(env,\s*\{[\s\S]*?\}\)\.catch/.test(scheduled),
  'group announcements scheduled task must have its own catch boundary',
);
assert.ok(
  scheduled.includes("task: 'waxonedge_sync'") &&
  scheduled.includes("task: 'telegram_daily_digest'") &&
  scheduled.includes("task: 'telegram_group_announcements'"),
  'scheduled handler must record per-task results',
);
assert.ok(
  scheduled.includes("logApiFailure('scheduled_partial_failure'"),
  'scheduled handler must log partial failures without throwing',
);

console.log('Scheduled task isolation tests PASSED.');
