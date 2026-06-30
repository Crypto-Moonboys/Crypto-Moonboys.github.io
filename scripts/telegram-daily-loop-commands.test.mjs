import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../workers/moonboys-api/worker.js', import.meta.url), 'utf8');

function functionBlock(name) {
  const start = worker.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = worker.indexOf(') {', start);
  assert.notEqual(bodyStart, -1, `${name} must have a function body`);
  let depth = 0;
  let opened = false;
  for (let i = bodyStart + 2; i < worker.length; i += 1) {
    const char = worker[i];
    if (char === '{') {
      depth += 1;
      opened = true;
    } else if (char === '}') {
      depth -= 1;
      if (opened && depth === 0) return worker.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function asyncFunctionBlock(name) {
  const start = worker.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = worker.indexOf(') {', start);
  assert.notEqual(bodyStart, -1, `${name} must have a function body`);
  let depth = 0;
  let opened = false;
  for (let i = bodyStart + 2; i < worker.length; i += 1) {
    const char = worker[i];
    if (char === '{') {
      depth += 1;
      opened = true;
    } else if (char === '}') {
      depth -= 1;
      if (opened && depth === 0) return worker.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const daily = asyncFunctionBlock('cmdDaily');
const status = asyncFunctionBlock('cmdGkStatus');
const quests = asyncFunctionBlock('cmdGkQuests');
const faction = asyncFunctionBlock('cmdGkFaction');
const builder = asyncFunctionBlock('buildTelegramCommandDailyLoopState');
const verifiedIdentity = functionBlock('buildTelegramLoopVerifiedIdentity');
const sourceFormatter = functionBlock('formatSourceStatusForTelegram');
const dailyReadout = functionBlock('formatDailyLoopReadout');
const wtfLine = functionBlock('formatDailyWtfLine');

assert.ok(
  worker.includes("import { buildDailyLoopState, handleDailyLoopStateRoute } from './routes/daily-loop-state.js';"),
  'Telegram command handlers must import the same buildDailyLoopState used by /daily-loop/state'
);

for (const [name, block] of Object.entries({ cmdDaily: daily, cmdGkStatus: status, cmdGkQuests: quests, cmdGkFaction: faction })) {
  assert.ok(
    block.includes('buildTelegramCommandDailyLoopState(env, telegramId, fromUser)'),
    `${name} must read from the shared daily-loop builder wrapper`
  );
  assert.ok(!block.includes('getWtfDailySchedule('), `${name} must not duplicate Daily WTF schedule logic`);
  assert.ok(!block.includes('buildWtfPreviewSchedule('), `${name} must not build a separate Daily WTF preview schedule`);
}

assert.match(builder, /return\s+buildDailyLoopState\(env,\s*verified\s*\?\s*\{\s*verified\s*\}\s*:\s*\{\s*\}\);/, 'Telegram commands must call buildDailyLoopState with verified identity when available');
assert.ok(verifiedIdentity.includes('telegramId: id'), 'Linked Telegram user state must pass the bot update Telegram id as the verified identity');
assert.ok(builder.includes(': {}'), 'Anonymous/public command paths must fall back to public builder state without pretending to be linked');

assert.ok(daily.includes('const today = loop.utc_day || getTodayUtcDate();'), '/daily must use the builder utc_day for the command readout and daily claim date');
assert.ok(dailyReadout.includes('formatLoopResetLine(loop)'), '/daily readout must use the builder reset/countdown fields');
assert.ok(dailyReadout.includes('<b>Daily Loop</b>'), '/daily output must include the daily-loop readout');
assert.ok(dailyReadout.includes('formatDailyLoopSourceSummary(loop'), '/daily output must include source truth');
assert.ok(dailyReadout.includes('formatMissionSummary(loop.daily_missions)'), '/daily must summarize missions from the daily-loop contract');
assert.ok(status.includes('formatLoopResetLine(loop)'), '/gkstatus output must include UTC day/reset');
assert.ok(status.includes('formatDailyLoopSourceSummary(loop'), '/gkstatus output must include Daily Loop source truth');
assert.ok(quests.includes('formatMissionSummary(loop.daily_missions)'), '/gkquests must use the same daily mission count helper as /daily');
assert.ok(quests.includes('formatWikiMissionSummary(loop.wiki_missions)'), '/gkquests must use daily-loop wiki mission completions');
assert.ok(quests.includes('Daily missions:') && quests.includes('Wiki missions:'), '/gkquests output must include daily and wiki mission summaries');
assert.ok(!quests.includes('FROM telegram_quests'), '/gkquests must not invent or duplicate legacy telegram_quests rows');

assert.ok(wtfLine.includes("formatSourceStatusForTelegram(status)"), 'Daily WTF text must render from source_status');
assert.ok(sourceFormatter.includes("state === 'preview'") && sourceFormatter.includes('preview/scheduled'), 'preview Daily WTF must be labelled preview/scheduled, not live');
assert.ok(sourceFormatter.includes("state === 'query_failed'") && sourceFormatter.includes('sync unavailable'), 'query_failed must render as sync unavailable');
assert.ok(sourceFormatter.includes("state === 'migration_pending'") && sourceFormatter.includes('migration pending'), 'migration_pending must render honestly');
assert.ok(sourceFormatter.includes("state === 'live_empty'") && sourceFormatter.includes('emptyCopy'), 'live_empty must render as no rows/activity/missions yet, not failure');
assert.ok(sourceFormatter.includes("return 'unavailable';"), 'unavailable source states must render honestly');
assert.ok(!sourceFormatter.includes('LIVE'), 'No fake-live fallback label should appear in source-state rendering');

assert.ok(faction.includes('Daily contribution:'), '/gkfaction must render daily contribution from faction_state');
assert.ok(faction.includes('Weekly contribution:'), '/gkfaction must render weekly contribution from faction_state');
assert.ok(faction.includes('Source: ${factionSource}'), '/gkfaction output must include faction source status');
assert.ok(faction.includes("formatSourceStatusForTelegram(loop.source_status?.faction_state"), '/gkfaction must expose faction source_status');
assert.ok(faction.includes('FACTION_UNALIGNED'), '/gkfaction must keep unaligned state explicit when no faction is selected');

assert.ok(daily.includes('hasDailyClaimToday(db, telegramId)'), 'Existing /daily claim check must remain in place');
assert.ok(daily.includes("awardXp(db, telegramId, XP_DAILY_CLAIM, 'daily_claim', today)"), 'Existing /daily XP award behavior must remain in place');
assert.ok(daily.includes("logTelegramActivity(db, telegramId, 'daily_claim')"), 'Existing /daily activity logging must remain in place');

assert.ok(
  !/cmd(?:Daily|GkStatus|GkQuests|GkFaction)[\s\S]*Daily WTF[\s\S]*LIVE/.test(worker),
  'Telegram daily-loop command copy must not render preview/query_failed/migration_pending/unavailable source states as LIVE'
);

console.log('telegram-daily-loop-commands.test.mjs passed');
