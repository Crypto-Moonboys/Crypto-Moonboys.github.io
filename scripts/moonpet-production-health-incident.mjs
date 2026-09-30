#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';

const TITLE = '[Production alert] Moonpet health check failed';
const RESULT = String(process.env.RESULT || '');
const REPORT = String(process.env.MOONPET_HEALTH_REPORT || 'moonpet-production-health-report.json');
const ALERT = new URL('./moonpet-production-health-alert.mjs', import.meta.url);

function fail(message) {
  throw new Error(`Moonpet production incident update failed: ${message}`);
}

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    fail('GitHub issue operation failed');
  }
}

function hasLabel(issue, name) {
  return issue.labels?.some((label) => (typeof label === 'string' ? label : label.name) === name);
}

function notify(state) {
  const result = spawnSync(process.execPath, [ALERT.pathname], {
    env: { ...process.env, MOONPET_ALERT_STATE: state },
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) fail('Telegram notification failed; the incident remains retryable');
}

if (!['healthy', 'failed', 'degraded'].includes(RESULT)) fail('RESULT must be healthy, failed, or degraded');

gh(['label', 'create', 'production-alert', '--color', 'B60205', '--description', 'Automated production health incident', '--force']);
gh(['label', 'create', 'alert-pending', '--color', 'FBCA04', '--description', 'Telegram notification pending', '--force']);
gh(['label', 'create', 'alert-sent', '--color', '0E8A16', '--description', 'Telegram notification sent', '--force']);

const issues = JSON.parse(gh([
  'issue', 'list', '--state', 'open', '--label', 'production-alert',
  '--search', `${TITLE} in:title`, '--json', 'number,title,labels', '--limit', '100',
]));
let issue = issues.find((item) => item.title === TITLE) || null;

if (RESULT === 'failed' && !issue) {
  const url = gh([
    'issue', 'create', '--title', TITLE, '--label', 'production-alert',
    '--label', 'alert-pending', '--body-file', REPORT,
  ]);
  const number = url.match(/\/issues\/(\d+)\s*$/)?.[1];
  if (!number) fail('could not determine the newly created issue number');
  issue = { number: Number(number), title: TITLE, labels: ['production-alert', 'alert-pending'] };
}

if (!issue) process.exit(0);

let notification = null;
if (hasLabel(issue, 'alert-pending')) notification = 'failed';
else if (RESULT === 'healthy') notification = 'recovered';

if (!notification) process.exit(0);

notify(notification);
if (notification === 'failed') {
  gh(['issue', 'edit', String(issue.number), '--remove-label', 'alert-pending', '--add-label', 'alert-sent']);
} else {
  gh([
    'issue', 'close', String(issue.number), '--comment',
    `Two consecutive production probes passed. Closing the automated incident. Run: ${process.env.MOONPET_ALERT_RUN_URL || ''}`,
  ]);
}

console.log(`Moonpet ${notification} incident notification delivered.`);
