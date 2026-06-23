#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WUF_GIF = 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXJ4dHVlaHJ0ZWdvem92dW1zanFyYnc5bmxmM3Fyb2N6Z2YxbG55dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GwigOL3Iw4kAa2ugsZ/giphy.gif';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function check(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] ${message}`);
}

function section(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start < 0) return '';
  const end = endNeedle ? source.indexOf(endNeedle, start + startNeedle.length) : -1;
  return source.slice(start, end > start ? end : undefined);
}

const battleLayer = read('js/battle-layer.js');
const engagement = read('js/engagement.js');
const comments = read('js/comments.js');
const css = read('css/battle-layer.css');
const apiConfig = read('js/api-config.js');
const worker = read('workers/moonboys-api/worker.js');
const wrangler = read('workers/moonboys-api/wrangler.toml');
const wuffi = read('wiki/wuffi.html');
const alcor = read('wiki/alcor-exchange.html');
const rugPullWars = read('wiki/rug-pull-wars.html');

console.log('\nWiki engagement layer regression\n');

check(battleLayer.includes('wuffi:') && battleLayer.includes(WUF_GIF), 'WUF Battle Heat media map uses the exact supplied GIF');
check(!alcor.includes(WUF_GIF) && !rugPullWars.includes(WUF_GIF), 'Other wiki pages do not hardcode the WUF GIF');
check(css.includes('.battle-page-media') && css.includes('max-height: 260px'), 'Battle Heat page media has responsive CSS');

check(battleLayer.includes('<h3>Daily Missions</h3>') && battleLayer.includes('MISSION_DEFINITIONS'), 'Daily Missions render from mission definitions on wiki pages');
check(battleLayer.includes("ensurePageLikeWidget(pageId)") && battleLayer.includes("className = 'page-like-widget'"), 'Page-like widget is auto-injected when missing');
check(battleLayer.includes("'.citations-list li, .source-ref-list li'"), 'Citation votes inject into both citations-list and source-ref-list items');
check(wuffi.includes('class="source-ref-list"'), 'WUF uses source-ref-list and is covered by citation injection');

check(engagement.includes('COPY.FEATURE_UNAVAILABLE') && battleLayer.includes('mission-status--unavailable'), 'Disabled engagement features show unavailable state');
check(apiConfig.includes('COMMENTS:           true') && apiConfig.includes('LIKES:              true') && apiConfig.includes('CITATION_VOTES:     true'), 'Article engagement feature flags are enabled after migration/deploy verification');
check(apiConfig.includes('LEADERBOARD:        false') && apiConfig.includes('LIVE_FEED:          false') && apiConfig.includes('ACTIVITY_PANEL:     false'), 'Unimplemented engagement panels remain disabled');

check(comments.includes("CustomEvent('moonboys:comment-posted'"), 'Successful comment posts notify mission completion');
check(comments.includes("COMMENT_PROFILE_KEY = 'moonboys_comment_profile_v1'"), 'Comment form stores a browser-local commenter profile');
check(comments.includes('applyLinkedTelegramIdentity(form)') && comments.includes('getTelegramName') && comments.includes('getTelegramAuth') && comments.includes('isTelegramLinked'), 'Linked Telegram identity auto-fills comment form fields from identity-gate state');
check(comments.includes("fillIfEmpty(form, 'name'") && comments.includes("fillIfEmpty(form, 'telegram_username'"), 'Comment auto-fill does not overwrite manually typed values');
check(!comments.includes('telegram-widget.js') && !comments.includes('data-telegram-login') && !comments.includes('Bot domain invalid'), 'Linked/comment form path avoids the broken Telegram widget');
check(comments.includes('Telegram linked:') && comments.includes('Email optional — Telegram identity will be used.'), 'Linked Telegram users see email-optional Telegram identity copy');
check(comments.includes('if (!email && !telegramAuth)') && comments.includes('if (email)   payload.email = email;'), 'Comment submit requires email only when signed Telegram auth is unavailable');
check(comments.includes('Telegram quick-fill unavailable. Link through the Incubator Hub /gklink flow.'), 'Unlinked users see a clean Telegram quick-fill fallback');
check(comments.includes('Gravatar avatar ready from saved email.') && comments.includes('Email required for Gravatar avatar, never displayed.'), 'Gravatar copy reflects saved-email reality without fake account detection');
const profileSave = section(comments, 'function saveCommentProfile(profile)', 'function cleanTelegramUsername');
check(profileSave.includes("'name'") && profileSave.includes("'email'") && profileSave.includes("'telegram_username'") && profileSave.includes("'discord_username'") && profileSave.includes("'avatar_url'"), 'Saved commenter profile includes only expected identity fields');
check(!profileSave.includes('telegram_auth') && !profileSave.includes('text'), 'Saved commenter profile excludes raw Telegram auth and comment text');
check(!/gravatar(?:\.com)?\s+(?:login|account)/i.test(comments), 'Comment form does not claim fake Gravatar account detection');
check(comments.includes('function loadComments(pageId, listEl)') && comments.includes("if (moderation === 'approved')") && comments.includes("Comment received and awaiting automated review."), 'Comment form refreshes approved posts and shows honest moderation states');
check(engagement.includes("CustomEvent('moonboys:page-liked'"), 'Successful page likes notify mission completion');
check(engagement.includes("CustomEvent('moonboys:citation-voted'"), 'Successful citation votes notify mission completion');
check(battleLayer.includes('if (isMissionComplete(pageId, missionId)) return;'), 'Mission completion is guarded once per page/window');
check(battleLayer.includes('if (!mission || mission.completed !== true) return;'), 'Mission UI requires backend mission completion proof before marking complete');
check(battleLayer.includes("window.sessionStorage.setItem(getMissionStorageKey(pageId, missionId), 'complete')"), 'Mission completion persists once per session mission window');
check(battleLayer.includes("CustomEvent(WIKI_MISSION_EVENT"), 'Mission layer emits a reward/completion event for Telegram-linked reward plumbing');

check(worker.includes("path === '/comments'") && worker.includes("path === '/likes'") && worker.includes("path === '/citation-votes'"), 'Backend article engagement routes are present in moonboys-api worker');
check(worker.includes('moderateWikiCommentWithSwarmsy') && worker.includes('/api/swarmsy/internal/moderate-comment') && worker.includes('X-SWARMSY-BRIDGE-TOKEN'), 'Wiki comments use dedicated server-side SWARMSY moderation bridge');
check(worker.includes("decision === 'approved' || decision === 'rejected' || decision === 'pending'") && worker.includes("SET status = ?"), 'Wiki comment moderation strictly validates decisions before publishing');
check(!worker.includes('telegram_auth: auth.verified') && !worker.includes('email: body?.email'), 'Wiki comment moderation payload does not forward raw email or telegram_auth');
check(worker.includes('let finalModerationStatus = moderationStatus') && worker.includes('wiki_comment_moderation_status_update_failed') && worker.includes("target_status: moderationStatus") && worker.includes("error_type: 'd1_update_failed'"), 'Wiki comment status update failure fails closed to pending with safe log metadata');
check(worker.includes("path === '/public/npc-chat'") && worker.includes('/api/swarmsy/public/npc-chat'), 'Existing /public/npc-chat Sparky bridge remains present');
check(/^main\s*=\s*"worker\.js"/m.test(wrangler), 'wrangler.toml main remains worker.js');
check(worker.includes('async scheduled(event, env, _ctx)'), 'Worker scheduled handler remains present');

if (process.exitCode) {
  console.error('\nWiki engagement layer regression FAILED.\n');
  process.exit(process.exitCode);
}

console.log('\nWiki engagement layer regression PASSED.\n');
