import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${label}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}`);
  }
}

const SITE_SHELL = read('js/site-shell.js');
const CSP = read('js/components/connection-status-panel.js');
const LAS = read('js/components/live-activity-summary.js');
const WTF_SYSTEM = read('js/arcade/systems/daily-wtf-event-system.js');
const WORKER = read('workers/moonboys-api/worker.js');
const LEADERBOARD = read('js/leaderboard-client.js');

console.log('\n--- Right Rail Live Panels Tests ---\n');

// 1) Top notice exists and stays compact
check(CSP.includes('LIVE SYNC'), 'top compact live sync notice label exists');
check(CSP.includes('Telegram Sync Required'), 'top notice unlinked CTA copy exists');
check(CSP.includes('csp-badge-name'), 'top notice has compact name field');
check(!CSP.includes('Telegram: <strong>') && !CSP.includes('Telegram: '), 'top notice avoids duplicate Telegram label block rendering');

// 2) Panel separation and purpose
check(SITE_SHELL.includes('PLAYER LIVE FEED'), 'right rail box 1 title is PLAYER LIVE FEED');
check(SITE_SHELL.includes('FACTION DAILY OPS'), 'right rail box 2 title is FACTION DAILY OPS');
check(SITE_SHELL.includes('data-csp-panel'), 'player panel mount marker exists');
check(SITE_SHELL.includes('data-las-panel'), 'faction panel mount marker exists');
check(!SITE_SHELL.includes('Player Status') && !SITE_SHELL.includes('Next Actions'), 'legacy right-rail titles removed');

// 3) WTF event visibility in faction panel
check(LAS.includes('MOONBOYS_WTF_EVENTS'), 'faction panel reads MOONBOYS_WTF_EVENTS');
check(LAS.includes('Active event') && LAS.includes('Next signal'), 'active/upcoming WTF event labels render');
check(LAS.includes('data-las-countdown'), 'countdown field placeholder exists');
check(LAS.includes('data-las-action="checkin"'), 'check-in CTA wiring exists');

// 4) Missed perks visibility and reset copy
check(LAS.includes('The city kept moving while you were away.'), 'missed opportunities copy renders');
check(LAS.includes('Missed history does not reset.'), 'missed history non-reset copy renders');
check(LAS.includes('Daily options reset at UTC midnight.'), 'daily reset copy remains separate');

// 5) Safety and protected systems unchanged
check(WORKER.includes('const ARCADE_XP_PER_POINT = 0.02;'), 'Arcade XP formula unchanged');
check(LEADERBOARD.includes('export async function submitScore'), 'leaderboard accepted-score flow remains in client');
check(WORKER.includes('hard-fork-rockers') && WORKER.includes('crypto-stoned-boys'), 'faction canon keys remain');
check(WORKER.includes('getOrCreateBlockTopiaProgression'), 'Block Topia core logic remains present');
check(!WTF_SYSTEM.includes('telegram_auth='), 'daily WTF system avoids auth query strings');
check(!read('js/battle-chamber-faction-bridge.js').includes('telegram_auth='), 'battle chamber bridge avoids auth query strings');

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
