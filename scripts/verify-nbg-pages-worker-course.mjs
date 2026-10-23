// Pages must not publish a newer course revision before the live leaderboard Worker
// understands its independently simulated gameplay. Read-only production gate.
// Does not deploy a Worker, mutate D1, or flip any prize/source flags.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const LIVE_HEALTH_URL = 'https://moonboys-leaderboard.sercullen.workers.dev/health';

export function requiredNbgCourseVersion(gameSource) {
  const match = String(gameSource).match(/var COURSE_LAYOUT_VERSION\s*=\s*(\d+)\s*;/);
  if (!match) return 1; // Prior game builds were the original course.
  return Number(match[1]);
}

export function acceptsNbgCourse(health, requiredVersion) {
  return Number.isInteger(requiredVersion) && requiredVersion >= 1 &&
    health?.ok === true &&
    health.service === 'moonboys-leaderboard' &&
    health.nbg_london_ranked_scoring_available === true &&
    health.database_configured === true &&
    health.leaderboard_store_configured === true &&
    health.telegram_auth_configured === true &&
    Number.isSafeInteger(health.nbg_london_course_version_supported) &&
    health.nbg_london_course_version_supported >= requiredVersion;
}

async function main() {
  const code = readFileSync(resolve('game/nbg-level1.js'), 'utf8');
  const requiredVersion = requiredNbgCourseVersion(code);
  if (requiredVersion < 2) {
    console.log('NBG original course: no newer Worker contract required.');
    return;
  }
  const response = await fetch(LIVE_HEALTH_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store'
  });
  const body = response.ok ? await response.json() : null;
  if (!response.ok || !acceptsNbgCourse(body, requiredVersion)) {
    throw new Error(
      'GitHub Pages rollout BLOCKED: live leaderboard Worker must first report ' +
      'NBG course >= ' + requiredVersion + ' with auth/D1/KV ready. ' +
      'Obtain GK authorization, deploy leaderboard from merged main using ' +
      'node scripts/deploy-worker-with-provenance.mjs leaderboard, verify /health, ' +
      'then re-run Deploy GitHub Pages. Existing public NBG v1 remains live.'
    );
  }
  console.log('Verified live leaderboard supports NBG course ' + requiredVersion +
    '; GitHub Pages may publish the updated browser.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
