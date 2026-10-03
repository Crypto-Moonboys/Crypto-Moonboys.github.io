#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'canon-prose-change-approved';
const SHA = /^[a-f0-9]{40}$/i;

function approvedPullRequest(pr, repository) {
  return pr?.base?.ref === 'main'
    && pr.base.repo?.full_name === repository
    && Array.isArray(pr.labels) && pr.labels.some(label => label?.name === LABEL);
}

// A main push may inherit the label only from its exact merged PR. Its first
// parent must also match the push baseline, so one approved merge cannot bless
// additional commits in the same push range.
export async function resolveCanonProseApproval({ eventName, event, repository, sha, requestJson }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) return false;
  if (eventName === 'pull_request') return approvedPullRequest(event?.pull_request, repository);
  if (eventName !== 'push' || event?.ref !== 'refs/heads/main'
    || !SHA.test(sha || '') || event.after !== sha
    || !SHA.test(event.before || '') || /^0+$/.test(event.before)) return false;
  try {
    const commit = await requestJson(`/repos/${repository}/git/commits/${sha}`);
    if (commit?.sha !== sha || commit.parents?.[0]?.sha !== event.before) return false;
    const pulls = await requestJson(`/repos/${repository}/commits/${sha}/pulls?per_page=100`);
    return Array.isArray(pulls) && pulls.some(pr => approvedPullRequest(pr, repository)
      && pr.state === 'closed' && Boolean(pr.merged_at) && pr.merge_commit_sha === sha);
  } catch {
    // Missing credentials, malformed responses and API outages grant no approval.
    return false;
  }
}

async function main() {
  let approved = false;
  try {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    approved = await resolveCanonProseApproval({
      eventName: process.env.GITHUB_EVENT_NAME,
      event,
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
      requestJson: async endpoint => {
        if (!process.env.GITHUB_TOKEN) throw new Error('GitHub token unavailable');
        const response = await fetch(`https://api.github.com${endpoint}`, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('GitHub approval lookup unavailable');
        return response.json();
      },
    });
  } catch {
    approved = false;
  }
  const value = approved ? '1' : '0';
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `approved=${value}\n`);
  console.log(`Canon prose approval: ${approved ? 'verified' : 'not granted'}.`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await main();
