#!/usr/bin/env node

import fs from 'node:fs';

const TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '');
const CHAT_ID = String(process.env.TELEGRAM_GROUP_CHAT_ID || '').trim();
const THREAD_ID = String(process.env.TELEGRAM_GROUP_THREAD_ID || '').trim();
const STATE = String(process.env.MOONPET_ALERT_STATE || '').trim().toLowerCase();
const RUN_URL = String(process.env.MOONPET_ALERT_RUN_URL || '').trim();
const REPORT_PATH = String(process.env.MOONPET_HEALTH_REPORT || 'moonpet-production-health-report.json');
const API_BASE = String(process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/$/, '');

function fail(message) {
  throw new Error(`Moonpet Telegram alert failed: ${message}`);
}

if (!TOKEN) fail('TELEGRAM_BOT_TOKEN is required');
if (!CHAT_ID) fail('TELEGRAM_GROUP_CHAT_ID is required');
if (!['failed', 'recovered', 'test'].includes(STATE)) fail('MOONPET_ALERT_STATE must be failed, recovered or test');
if (THREAD_ID && !/^\d+$/.test(THREAD_ID)) fail('TELEGRAM_GROUP_THREAD_ID must be numeric when supplied');

let report = {};
try { report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')); } catch { fail('health report is missing or invalid'); }
const commit = String(report.deployed_commit || report.probes?.find((probe) => probe?.deployed_commit)?.deployed_commit || 'unknown');
const checkedAt = String(report.checked_at || new Date().toISOString());
const defaultDetail = STATE === 'failed'
  ? 'Two consecutive production probes failed.'
  : STATE === 'recovered'
    ? 'Two consecutive production probes passed.'
    : 'Manual monitor test completed after two healthy production probes.';
const detail = String(STATE === 'test' ? defaultDetail : (report.summary || defaultDetail))
  .replace(/[\r\n]+/g, ' ').slice(0, 800);
const icon = STATE === 'failed' ? '🚨' : STATE === 'recovered' ? '✅' : '🧪';
const heading = STATE === 'failed'
  ? 'MOONPET PRODUCTION ALERT'
  : STATE === 'recovered'
    ? 'MOONPET RECOVERED'
    : 'MOONPET MONITOR TEST';
const text = [
  `${icon} ${heading}`,
  '',
  `State: ${STATE.toUpperCase()}`,
  `Worker commit: ${commit}`,
  `Checked: ${checkedAt}`,
  `Details: ${detail}`,
  RUN_URL ? `Investigation: ${RUN_URL}` : '',
].filter(Boolean).join('\n');

const body = { chat_id: CHAT_ID, text, disable_web_page_preview: true };
if (THREAD_ID) body.message_thread_id = Number(THREAD_ID);
let response;
try {
  response = await fetch(`${API_BASE}/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
} catch {
  fail('Telegram sendMessage request failed');
}
let payload;
try { payload = await response.json(); } catch { payload = null; }
if (!response.ok || payload?.ok !== true) fail(`Telegram sendMessage returned HTTP ${response.status}`);
console.log(`Moonpet ${STATE} notification sent to the configured Telegram destination.`);
