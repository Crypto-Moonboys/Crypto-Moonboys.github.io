import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/u;
const REPO = 'Crypto-Moonboys/Crypto-Moonboys.github.io';
const BRANCH = 'automation/verified-graph-refresh';

// Never trust caller-provided base_sha in a dispatched CI run. The GitHub API
// owns the PR base. Bind the dispatched ref and exact SHA to that PR as well.
export function validatedGraphDispatchBase(pr, context) {
  const expectedNumber = Number(context.prNumber);
  if (!Number.isSafeInteger(expectedNumber) || expectedNumber <= 0 ||
    pr?.number !== expectedNumber || pr?.state !== 'open' ||
    context.repository !== REPO ||
    context.ref !== 'refs/heads/' + BRANCH ||
    !SHA.test(context.sha || '') ||
    pr?.head?.sha !== context.sha ||
    pr?.head?.ref !== BRANCH ||
    pr?.head?.repo?.full_name !== REPO ||
    pr?.base?.ref !== 'main' ||
    pr?.base?.repo?.full_name !== REPO ||
    !SHA.test(pr?.base?.sha || '') ||
    pr.base.sha === pr.head.sha) {
    throw new Error('Dispatched graph checks do not match an open, same-repository, main-targeting PR and exact branch head');
  }
  return pr.base.sha;
}

export async function fetchVerifiedGraphDispatchBase(context, token, request = fetch) {
  if (!/^[1-9]\d*$/u.test(String(context.prNumber || '')) ||
    context.repository !== REPO ||
    context.ref !== 'refs/heads/' + BRANCH ||
    !SHA.test(context.sha || '') ||
    typeof token !== 'string' || !token) {
    throw new Error('Missing or invalid generated graph PR dispatch context');
  }
  const url = 'https://api.github.com/repos/' + REPO + '/pulls/' + context.prNumber;
  const response = await request(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response?.ok) throw new Error('GitHub PR lookup failed; refusing dispatched CI');
  return validatedGraphDispatchBase(await response.json(), context);
}

async function main() {
  try {
    const base = await fetchVerifiedGraphDispatchBase({
      prNumber: process.env.PR_NUMBER,
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    }, process.env.GITHUB_TOKEN);
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT required to publish verified base');
    appendFileSync(process.env.GITHUB_OUTPUT, 'base_sha=' + base + '\n');
    console.log('Verified generated graph dispatch: current PR base and exact head bound to GitHub.');
  } catch (error) {
    console.error('Graph CI dispatch rejected: ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
