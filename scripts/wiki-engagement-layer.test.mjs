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
const wikiCss = read('css/wiki.css');
const apiConfig = read('js/api-config.js');
const worker = read('workers/moonboys-api/worker.js');
const wuffi = read('wiki/wuffi.html');
const alcor = read('wiki/alcor-exchange.html');
const rugPullWars = read('wiki/rug-pull-wars.html');

console.log('\nWiki engagement layer regression\n');

check(battleLayer.includes('wuffi:') && battleLayer.includes(WUF_GIF), 'WUF Battle Heat media map uses the exact supplied GIF');
check(!alcor.includes(WUF_GIF) && !rugPullWars.includes(WUF_GIF), 'Other wiki pages do not hardcode the WUF GIF');
check(css.includes('.battle-page-media') && css.includes('max-height: 260px'), 'Battle Heat page media has responsive CSS');

check(battleLayer.includes('<h3>Daily Missions</h3>') && battleLayer.includes('MISSION_DEFINITIONS'), 'Daily Missions render from mission definitions on wiki pages');
check(battleLayer.includes('battle-engagement-deck--collection') && battleLayer.includes('buildCollectionEngagementHTML(pageId, engagement)'), 'NFT collection pages render collection art, About The Collection, and Daily Missions in one engagement deck');
check(battleLayer.includes('buildCollectionMediaShell() + buildCollectionAboutHTML() + buildMissionHTML(pageId, engagement)'), 'NFT collection engagement order is art, about, missions');
check(battleLayer.includes('battle-engagement-deck--nft-template') && battleLayer.includes('buildTemplateMediaShell() + buildMissionHTML(pageId, engagement)'), 'NFT template pages render page art beside a Daily Missions card with embedded Battle Heat');
check(css.includes('battle-engagement-deck--collection') && css.includes('gk-collection-about-title') && css.includes('gkCollectionCardPulse'), 'NFT collection engagement styles include the cyberpunk three-card dashboard treatment');
check(css.includes('battle-engagement-deck--nft-template') && css.includes('battle-heat-summary') && css.includes('battle-shell--media') && css.includes('battle-page-media'), 'NFT template engagement card styles keep art separate from the Battle Heat meter');
check(battleLayer.includes("ensurePageLikeWidget(pageId)") && battleLayer.includes("className = 'page-like-widget'"), 'Page-like widget is auto-injected when missing');
check(battleLayer.includes("'.citations-list li, .source-ref-list li, .sources-list li'"), 'Citation votes inject into citations-list, source-ref-list, and sources-list items');
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
check(comments.includes('Comments &amp; Battle Layer') && comments.includes('Share knowledge. Earn XP. Build the archive.'), 'Comment section renders the redesigned battle-layer dashboard header');
check(comments.includes('name="discord_username"') && comments.includes('Gravatar used for avatar. Email never displayed.'), 'Comment form includes Discord and clear Gravatar privacy copy');
check(comments.includes('maxlength="2000"') && comments.includes('comment-character-counter') && comments.includes("textEl.addEventListener('input', updateCounter)"), 'Comment form includes a 2000-character counter wired to textarea input');
check(!/<span class="comment-character-counter"[^>]*aria-live/.test(comments), 'Comment character counter is not live-announced on every keystroke');
for (const name of ['Swarmsy', 'Alfie Blaze', 'CrypticYuna', 'Boneidol INK', 'P-Fly']) {
  check(comments.includes(name), `Fallback top contributors include ${name}`);
}
check(comments.includes('window.MOONBOYS_TOP_CONTRIBUTORS') && comments.includes('top-contributor-tab') && comments.includes('contributorRows(rows)') && comments.includes('data-top-contributor-leader') && comments.includes('aria-pressed'), 'Top Contributors card is data-driven with synced week/all-time toggles');
check(comments.includes('function normalizeContributorColor(color)') && comments.includes("String(color || '').trim().toLowerCase()") && comments.includes('top-contributor-row--') && comments.includes('robotAvatar(color'), 'Top contributor colors are normalized before classes and avatars are rendered');
for (const color of ['gold', 'cyan', 'purple', 'green', 'orange']) {
  check(comments.includes("color: '" + color + "'") && comments.includes('comment-robot-avatar--'), `Top contributor fallback includes ${color} robot avatar variant`);
}
check(comments.includes('XP For Engagement') && comments.includes('Cite To Earn') && comments.includes('Quality Matters') && comments.includes('Real Community'), 'Comment dashboard includes four bottom guidance cards');
check(wikiCss.includes('.comments-battle-dashboard') && wikiCss.includes('.comments-top-contributors') && wikiCss.includes('.comments-info-card--xp') && wikiCss.includes('commentsDashboardGlow'), 'Comment dashboard cyberpunk layout styles are present');
check(wikiCss.includes('.comments-info-card--cite') && wikiCss.includes('.comments-info-card--quality') && wikiCss.includes('.comments-info-card--community'), 'Comment dashboard info cards have distinct color-family styles');
check(wikiCss.includes('@media (max-width: 1180px)') && wikiCss.includes('@media (max-width: 720px)') && wikiCss.includes('prefers-reduced-motion: reduce'), 'Comment dashboard supports responsive and reduced-motion layouts');
const profileSave = section(comments, 'function saveCommentProfile(profile)', 'function cleanTelegramUsername');
check(profileSave.includes("'name'") && profileSave.includes("'email'") && profileSave.includes("'telegram_username'") && profileSave.includes("'discord_username'") && profileSave.includes("'avatar_url'"), 'Saved commenter profile includes only expected identity fields');
check(!profileSave.includes('telegram_auth') && !profileSave.includes('text'), 'Saved commenter profile excludes raw Telegram auth and comment text');
check(!/gravatar(?:\.com)?\s+(?:login|account)/i.test(comments), 'Comment form does not claim fake Gravatar account detection');
check(engagement.includes("CustomEvent('moonboys:page-liked'"), 'Successful page likes notify mission completion');
check(engagement.includes("CustomEvent('moonboys:citation-voted'"), 'Successful citation votes notify mission completion');
check(battleLayer.includes('if (isMissionComplete(pageId, missionId)) return;'), 'Mission completion is guarded once per page/window');
check(battleLayer.includes('if (!mission || mission.completed !== true) return;'), 'Mission UI requires backend mission completion proof before marking complete');
check(battleLayer.includes("window.sessionStorage.setItem(getMissionStorageKey(pageId, missionId), 'complete')"), 'Mission completion persists once per session mission window');
check(battleLayer.includes("CustomEvent(WIKI_MISSION_EVENT"), 'Mission layer emits a reward/completion event for Telegram-linked reward plumbing');

check(worker.includes("path === '/comments'") && worker.includes("path === '/likes'") && worker.includes("path === '/citation-votes'"), 'Backend article engagement routes are present in moonboys-api worker');
check(!worker.includes('COMMENT_MODERATION_URL') && !worker.includes('COMMENT_MODERATION_TOKEN') && !worker.includes('moderateWikiComment'), 'Wiki comment publishing has no external moderation provider dependency');
check(worker.includes("let finalModerationStatus = auth.verified?.telegramId ? 'approved' : 'pending'") && worker.includes('UPDATE wiki_comments') && worker.includes("target_status: 'approved'"), 'Verified Telegram comments auto-approve after pending insert');
check(worker.includes('wiki_comment_auto_approval_status_update_failed') && worker.includes("error_type: 'd1_update_failed'"), 'Wiki comment auto-approval status update fails closed with safe metadata');
check(worker.includes("path === '/public/npc-chat'") && worker.includes('/api/swarmsy/public/npc-chat'), 'Existing /public/npc-chat bridge remains unchanged');
check(/^main\s*=\s*"worker\.js"/m.test(read('workers/moonboys-api/wrangler.toml')), 'wrangler.toml main remains worker.js');
check(worker.includes('async scheduled(event, env, _ctx)'), 'Worker scheduled handler remains present');
check(comments.includes('Comment posted.') && comments.includes('Comment received and awaiting automated review.') && comments.includes('Comment could not be published.'), 'Comment form displays backend moderation states honestly');
check(comments.includes('if (moderation === \'approved\')') && comments.includes('loadComments(pageId, listEl)'), 'Comment form refreshes list only for approved comments');
check(comments.includes("moderation === 'rejected'") && comments.includes("'comment-form-status cm-error'"), 'Rejected moderation responses render as comment form errors');

if (process.exitCode) {
  console.error('\nWiki engagement layer regression FAILED.\n');
  process.exit(process.exitCode);
}

console.log('\nWiki engagement layer regression PASSED.\n');
