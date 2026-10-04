#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'canon-prose-change-approved';
const SHA = /^[a-f0-9]{40}$/i;
const DIRECT_REPOSITORY = 'Crypto-Moonboys/Crypto-Moonboys.github.io';
const DIRECT_BASE = '221d7df26e50e2b9c6a9e450ee5195c8f02930ed';
const DIRECT_DERIVED = new Set([
  'brand-canon/wiki-content-state.json', 'brand-canon/wiki-rewrite-audit.md',
  'brand-canon/wiki-rewrites/issue-1436-progress.md',
  'js/wiki-index.json', 'js/entity-map.json', 'js/entity-graph.json',
  'js/entity-graph-lite.json', 'js/graph-data.json', 'js/link-map.json',
  'js/link-graph.json', 'sam-memory.json', 'sitemap.xml', 'js/site-stats.json',
]);

// Issue #1436 authorises direct publication, not a permanent bypass. The
// publisher must create a separate annotated receipt tag for each exact commit
// before advancing main. An ordinary SAM push has no receipt and stays blocked.
async function approvedDirectPublication({ repository, sha, before, requestJson }) {
  if (repository !== DIRECT_REPOSITORY) return false;
  const name = `canon-direct-1436-${sha}`;
  const ref = await requestJson(`/repos/${repository}/git/ref/tags/${name}`);
  if (ref?.ref !== `refs/tags/${name}` || ref.object?.type !== 'tag' || !SHA.test(ref.object.sha || '')) return false;
  const tag = await requestJson(`/repos/${repository}/git/tags/${ref.object.sha}`);
  if (tag?.tag !== name || tag.object?.type !== 'commit' || tag.object.sha !== sha) return false;
  const receipt = JSON.parse(tag.message);
  if (receipt.schema_version !== 1 || receipt.issue !== 1436 || receipt.repository !== repository
    || receipt.commit !== sha || receipt.base !== before || !Array.isArray(receipt.paths)) return false;
  const detail = await requestJson(`/repos/${repository}/commits/${sha}?per_page=100`);
  if (detail?.sha !== sha || detail.parents?.length !== 1 || detail.parents[0].sha !== before
    || !Array.isArray(detail.files) || !detail.files.length || detail.files.length >= 100) return false;
  const paths = detail.files.map(file => file.filename).sort();
  if (new Set(receipt.paths).size !== receipt.paths.length
    || JSON.stringify([...receipt.paths].sort()) !== JSON.stringify(paths)) return false;
  let articles = 0;
  for (const file of detail.files) {
    if (/^wiki\/(?!first-witness-)[a-z0-9-]+\.html$/.test(file.filename)) {
      if (file.status !== 'modified') return false; // Never approve new/deleted pages.
      articles++;
    } else if (DIRECT_DERIVED.has(file.filename)) {
      if (file.status !== 'modified'
        && !(file.filename === 'brand-canon/wiki-rewrites/issue-1436-progress.md' && file.status === 'added')) return false;
    } else if (before === DIRECT_BASE && [
      'scripts/resolve-canon-prose-approval.mjs', 'scripts/resolve-canon-prose-approval.test.mjs',
    ].includes(file.filename) && file.status === 'modified') {
      // One-time installation of this exact-commit mechanism, explicitly
      // requested by #1436. Subsequent publication cannot change protection.
    } else return false;
  }
  return articles > 0;
}

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
    if (Array.isArray(pulls) && pulls.some(pr => approvedPullRequest(pr, repository)
      && pr.state === 'closed' && Boolean(pr.merged_at) && pr.merge_commit_sha === sha)) return true;
    return await approvedDirectPublication({ repository, sha, before: event.before, requestJson });
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
