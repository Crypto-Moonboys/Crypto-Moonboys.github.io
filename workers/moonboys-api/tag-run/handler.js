import {
  TAG_RUN_RANKS, rankFor, weekOf, previousWeek, previousDay, utcDay, parseTagCommand,
  eligibleTagComment, isValidWaxAccount, isValidTokenContract,
  parseTokenUnits, formatTokenUnits, adminTelegramIds, authenticatedGroupId
} from './core.js';

const TAG_COMMANDS = new Set([
  'profile', 'tagprofile', 'top', 'rewards', 'ranks', 'help', 'taghelp', 'rain',
  'tagtoken', 'tagamount', 'tagbonus', 'tagstatus', 'tagplan', 'tagalerts', 'tagenable', 'tagdisable'
]);
const ADMIN_COMMANDS = new Set([
  'tagtoken', 'tagamount', 'tagbonus', 'tagstatus', 'tagplan', 'tagalerts', 'tagenable', 'tagdisable'
]);
const COOLDOWN_SECONDS = 45;
const DAILY_LIMIT = 30;
const BASE_POINTS = 10;
const STREAK_BONUS = 5;
const REPLY_BONUS = 2;
const RPC_URL = 'https://wax.greymass.com/v1/chain/get_currency_stats';
const MAX_WEEKLY_RECIPIENTS = 1000;

// No signer or transfer endpoint is present anywhere in TAG RUN. A draft
// allocation is NOT a WAX claim. The only spend authority is future review.
const ACTIVE = env => env?.TAG_RUN_ENABLED === 'true' && !!env?.DB &&
  !!authenticatedGroupId(env);
const isTelegramId = value => /^[0-9]{1,20}$/.test(String(value || ''));
const isGroupChat = message => ['group', 'supergroup'].includes(message?.chat?.type);
const isPrivateChat = message => message?.chat?.type === 'private' &&
  String(message.chat.id) === String(message.from?.id);
const groupMatches = (message, env) => isGroupChat(message) &&
  String(message.chat.id) === authenticatedGroupId(env);
const cleanName = from => (String(from?.first_name || '') + ' ' +
  String(from?.last_name || '')).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 70)
  || ('Member ' + String(from?.id || '').slice(-4));

async function messageReply(env, chatId, message, fetchImpl = fetch) {
  const token = String(env?.TELEGRAM_BOT_TOKEN || '');
  if (!token || !chatId) return false;
  const response = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: String(message).slice(0, 3500),
      disable_web_page_preview: true })
  });
  return response.ok;
}
function recentWeekText(score, posts) {
  return String(Number(score) || 0) + ' Street Cred · ' + String(Number(posts) || 0) + ' comments';
}
async function memberScore(db, chatId, telegramId) {
  return db.prepare('SELECT score,posts FROM tag_run_member_totals ' +
    'WHERE chat_id=? AND telegram_id=?').bind(chatId, telegramId).first();
}
async function weeklyScore(db, chatId, telegramId, weekKey) {
  return db.prepare('SELECT COALESCE(SUM(points),0) AS score, COUNT(*) AS posts ' +
    'FROM tag_run_messages WHERE chat_id=? AND telegram_id=? AND week_key=?')
    .bind(chatId, telegramId, weekKey).first();
}
async function streakCount(db, chatId, telegramId, nowMs) {
  const result = await db.prepare(
    'SELECT DISTINCT day_key FROM tag_run_messages WHERE chat_id=? AND telegram_id=? ' +
    'ORDER BY day_key DESC LIMIT 3660'
  ).bind(chatId, telegramId).all();
  const dates = new Set((result.results || []).map(row => row.day_key));
  const today = utcDay(nowMs);
  const yesterday = previousDay(nowMs);
  let cursor = dates.has(today) ? today : dates.has(yesterday) ? yesterday : null;
  let streak = 0;
  while (cursor && dates.has(cursor)) {
    streak++;
    cursor = utcDay(Date.parse(cursor + 'T00:00:00.000Z') - 86400000);
  }
  return streak;
}
async function weeklyTop(db, chatId, weekKey) {
  const rows = await db.prepare(
    'SELECT m.telegram_id, MAX(m.display_name) AS display_name, ' +
    'SUM(m.points) AS score, COUNT(*) AS posts, ' +
    'COALESCE(t.score,0) AS lifetime_score ' +
    'FROM tag_run_messages m LEFT JOIN tag_run_member_totals t ' +
    'ON t.chat_id=m.chat_id AND t.telegram_id=m.telegram_id ' +
    'WHERE m.chat_id=? AND m.week_key=? ' +
    'GROUP BY m.telegram_id ORDER BY score DESC, posts DESC, m.telegram_id ASC LIMIT 10'
  ).bind(chatId, weekKey).all();
  return rows.results || [];
}
async function allTimeTop(db, chatId) {
  const rows = await db.prepare(
    'SELECT telegram_id, display_name, score, posts FROM tag_run_member_totals ' +
    'WHERE chat_id=? ORDER BY score DESC, posts DESC, telegram_id ASC LIMIT 10'
  ).bind(chatId).all();
  return rows.results || [];
}
async function configFor(db, chatId) {
  return db.prepare('SELECT * FROM tag_run_reward_config WHERE chat_id=?')
    .bind(chatId).first();
}
function describeProgram(program) {
  if (!program) return 'LFGK (kingsofgraff) · quantity not configured · WAX rewards OFF';
  const label = program.token_symbol + ' (' + program.token_contract + ')';
  if (program.token_precision == null) return label + ' · token not verified · rewards OFF';
  const base = formatTokenUnits(program.base_amount_units, program.token_precision);
  const budget = formatTokenUnits(program.max_weekly_units, program.token_precision);
  return label + '\nWeekly base: ' + base + ' ' + program.token_symbol +
    ' per active member; #1 ×' + program.top1_multiplier +
    ', #2 ×' + program.top2_multiplier + ', #3 ×' + program.top3_multiplier +
    '\nBudget ceiling: ' + budget + ' ' + program.token_symbol +
    '\nReward planning: ' + (program.enabled ? 'configured (review-only)' : 'OFF');
}
function helpMessage() {
  return 'TAG RUN · Street Cred (separate from Arcade XP)\n' +
    'Send meaningful chat messages of 10+ characters for 10 pts, up to 30 eligible ' +
    'messages daily (45-second cooldown). +2 for replying to another member. ' +
    '+5 for the first eligible message after an active previous day.\n' +
    '/profile — existing bot profile plus TAG RUN stats\n' +
    '/tagprofile — TAG RUN points, rank and streak only\n' +
    '/top — weekly leaderboard (/top all for all time)\n' +
    '/ranks — complete TAG RUN rank ladder\n' +
    '/rewards — weekly reward information\n' +
    '/rain — register a WAX account privately with the bot\n' +
    '/help or /taghelp — this TAG RUN guide\n' +
    'Other bot commands such as /games, /daily and /gklink remain separate.\n' +
    'No website linking is required to earn TAG RUN points.';
}
async function tokenInfoFromChain(contract, symbol, fetchImpl = fetch) {
  const response = await fetchImpl(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: contract, symbol })
  });
  if (!response.ok) return null;
  const data = await response.json();
  const supply = data?.[symbol]?.max_supply;
  const match = typeof supply === 'string'
    ? supply.match(/^([0-9]+)(?:\.([0-9]{1,8}))? ([A-Z]{1,7})$/)
    : null;
  if (!match || match[3] !== symbol) return null;
  return (match[2] || '').length;
}

export function isTagRunCommand(update, env) {
  if (!ACTIVE(env)) return false;
  const message = update?.message;
  if (!message || !isTelegramId(message.from?.id) ||
      message.from?.is_bot || message.sender_chat) return false;
  if (!groupMatches(message, env) && !isPrivateChat(message)) return false;
  const command = parseTagCommand(message.text, env?.TELEGRAM_BOT_USERNAME);
  if (!command || !TAG_COMMANDS.has(command.name)) return false;
  // Never hijack the existing bot's private /help command.
  if (command.name === 'help' && isPrivateChat(message)) return false;
  return true;
}

// /profile already exists in WIKICOMSBOT. Keep its XP/faction response and
// append TAG RUN's own profile as an additional message, not a replacement.
export function isSharedLegacyProfile(update, env) {
  if (!isTagRunCommand(update, env)) return false;
  // The original bot also accepts /PROFILE, /profile@BotName and profile
  // commands with arguments. Route all recognised variants through the
  // legacy handler so XP/faction/quest details are never silently dropped.
  return parseTagCommand(update?.message?.text, env?.TELEGRAM_BOT_USERNAME)?.name === 'profile';
}
export async function handleTagRunCommand(update, env, options = {}) {
  if (!isTagRunCommand(update, env)) return false;
  const message = update.message;
  const isPrivate = isPrivateChat(message);
  const chatId = authenticatedGroupId(env);
  const telegramId = String(message.from.id);
  const { name, args } = parseTagCommand(message.text, env.TELEGRAM_BOT_USERNAME);
  const nowMs = options.nowMs ?? Date.now();
  const fetchImpl = options.fetchImpl || fetch;
  const send = text => messageReply(env, message.chat.id, text, fetchImpl);
  const isAdmin = adminTelegramIds(env).has(telegramId);
  try {
    if (ADMIN_COMMANDS.has(name) && (!isAdmin || !isPrivate)) {
      await send('TAG RUN admin settings are available only to authorised admins in a private bot chat.');
      return true;
    }
    if (name === 'help' || name === 'taghelp') {
      await send(helpMessage());
      return true;
    }
    if (name === 'rain') {
      if (!isPrivate) {
        await send('Earn points here automatically. To register a WAX account, DM @' +
          String(env.TELEGRAM_BOT_USERNAME || 'WIKICOMSBOT').replace(/^@/, '') +
          ' with /rain yourwaxaccount. XRP addresses are not used for WAX rewards.');
        return true;
      }
      if (!isValidWaxAccount(args)) {
        await send('Usage: /rain yourwaxaccount\nEnter a WAX account name (not an XRP address). ' +
          'Registration is pending verification; never send private keys or seed phrases.');
        return true;
      }
      await env.DB.prepare('INSERT INTO tag_run_wallets ' +
        '(telegram_id,wax_account,verification_status,verified_at) VALUES (?,?,' +
        "'pending',NULL) ON CONFLICT(telegram_id) DO UPDATE SET " +
        "wax_account=excluded.wax_account, verification_status='pending', " +
        'verified_at=NULL,registered_at=CURRENT_TIMESTAMP')
        .bind(telegramId, args).run();
      await send('WAX account ' + args + ' registered as PENDING verification. ' +
        'This does not prove wallet ownership or activate token transfers.');
      return true;
    }
    if (name === 'profile' || name === 'tagprofile') {
      const [total, weekly, streak, wallet] = await Promise.all([
        memberScore(env.DB, chatId, telegramId),
        weeklyScore(env.DB, chatId, telegramId, weekOf(nowMs)),
        streakCount(env.DB, chatId, telegramId, nowMs),
        env.DB.prepare('SELECT wax_account,verification_status FROM tag_run_wallets ' +
          'WHERE telegram_id=?').bind(telegramId).first()
      ]);
      const rank = rankFor(total?.score);
      await send('TAG RUN PROFILE · ' + cleanName(message.from) + '\n' +
        'Total: ' + recentWeekText(total?.score, total?.posts) +
        '\nRank: ' + rank.name +
        (rank.next ? ' (next at ' + rank.next.toLocaleString('en-US') + ')' : ' · MAX RANK') +
        '\nThis week: ' + recentWeekText(weekly?.score, weekly?.posts) +
        '\nDaily streak: ' + streak + ' day(s)' +
        '\nWAX account: ' + (wallet ? (isPrivate
          ? wallet.wax_account + ' (' + wallet.verification_status + ')'
          : 'registered (' + wallet.verification_status + ') — details in bot DM') :
          'not registered — DM /rain yourwaxaccount'));
      return true;
    }
    if (name === 'ranks') {
      await send('TAG RUN · ALL 29 RANKS\n' +
        TAG_RUN_RANKS.map(([points, title]) => points.toLocaleString('en-US') +
          ' — ' + title).join('\n'));
      return true;
    }
    if (name === 'top') {
      const all = args.toLowerCase() === 'all';
      const rows = all ? await allTimeTop(env.DB, chatId) :
        await weeklyTop(env.DB, chatId, weekOf(nowMs));
      const lines = rows.map((row, i) => (i + 1) + '. ' +
        String(row.display_name || 'Tagger').slice(0, 70) + ' — ' +
        String(row.score) + ' pts · ' + rankFor(all ? row.score : row.lifetime_score).name);
      await send('TAG RUN ' + (all ? 'ALL-TIME' : 'WEEKLY') + ' TOP 10\n' +
        (lines.join('\n') || 'No qualifying chat activity yet.') +
        '\nOnly trusted group chat messages count.');
      return true;
    }
    if (name === 'rewards') {
      const config = await configFor(env.DB, chatId);
      const current = await weeklyScore(env.DB, chatId, telegramId, weekOf(nowMs));
      const plan = await env.DB.prepare('SELECT status,token_symbol,recipient_count ' +
        'FROM tag_run_weekly_plans WHERE chat_id=? AND week_key=?')
        .bind(chatId, previousWeek(nowMs)).first();
      await send('TAG RUN · WEEKLY REWARDS\n' + describeProgram(config) +
        '\nYour current-week activity: ' + recentWeekText(current?.score,current?.posts) +
        '\nPrevious week: ' + (plan ? plan.recipient_count +
          ' allocations drafted for admin review' : 'No approved reward draft') +
        '\nEvery eligible active member can be included once the reward programme is ' +
        'configured. Top 3 receive multipliers. No tokens transfer automatically. ' +
        'No website account sync needed to earn points; WAX wallet proof is required before payout.');
      return true;
    }
    if (name === 'tagstatus') {
      await send('TAG RUN ADMIN\n' + describeProgram(await configFor(env.DB, chatId)) +
        '\nCommands (private admin chat):\n' +
        '/tagtoken SYMBOL contract\n/tagamount base maxWeeklyBudget\n' +
        '/tagbonus first second third\n/tagplan [YYYY-MM-DD]\n/tagalerts\n/tagenable\n/tagdisable\n' +
        'Scheduled plans also require TAG_RUN_WEEKLY_REWARDS_ENABLED=true. ' +
        'All allocations remain review-only; automatic payments are disabled.');
      return true;
    }
    if (name === 'tagalerts') {
      const alerts = await env.DB.prepare(
        'SELECT rank_name,display_name,telegram_id,total_points,status,' +
        'attempt_count,created_at FROM tag_run_rank_announcements ' +
        "WHERE chat_id=? AND status IN ('pending','attempted','needs_review') " +
        'ORDER BY created_at DESC,source_message_id DESC LIMIT 20'
      ).bind(chatId).all();
      const lines = (alerts.results || []).map(alert =>
        alert.status + ' · ' + String(alert.display_name || 'Tagger').slice(0, 70) +
        ' · ' + alert.rank_name + ' (' + alert.total_points + ' pts)');
      await send('TAG RUN RANK ANNOUNCEMENTS · ADMIN REVIEW\n' +
        (lines.join('\n') || 'No pending or uncertain celebrations.') +
        '\nAn attempted/needs_review send is never retried automatically; ' +
        'check the group history before taking manual action.');
      return true;
    }
    if (name === 'tagplan') {
      const week = args || previousWeek(nowMs);
      const weekDateMs = /^\d{4}-\d{2}-\d{2}$/.test(week)
        ? Date.parse(week + 'T00:00:00.000Z') : NaN;
      if (!Number.isFinite(weekDateMs) || weekOf(weekDateMs) !== week) {
        await send('Usage: /tagplan [YYYY-MM-DD] where the date is a UTC Monday.');
        return true;
      }
      const plan = await env.DB.prepare('SELECT * FROM tag_run_weekly_plans ' +
        'WHERE chat_id=? AND week_key=?').bind(chatId,week).first();
      if (!plan) {
        await send('TAG RUN · No review-only draft for week ' + week + '.');
        return true;
      }
      const items = await env.DB.prepare('SELECT telegram_id,rank_position,street_cred,' +
        'amount_units,wallet_verification_status FROM tag_run_weekly_allocations ' +
        'WHERE chat_id=? AND week_key=? ORDER BY rank_position ASC LIMIT 20')
        .bind(chatId,week).all();
      const lines = (items.results || []).map(item =>
        '#' + item.rank_position + ' · Telegram ' + item.telegram_id + ' · ' +
        item.street_cred + ' pts · ' +
        formatTokenUnits(item.amount_units,plan.token_precision) + ' ' +
        plan.token_symbol + ' · WAX ' + item.wallet_verification_status);
      await send('TAG RUN REVIEW DRAFT · ' + week + '\n' +
        'Token: ' + plan.token_symbol + ' @ ' + plan.token_contract +
        '\nTotal: ' + formatTokenUnits(plan.planned_units,plan.token_precision) +
        ' ' + plan.token_symbol + ' across ' + plan.recipient_count +
        ' members\nStatus: review_only; NO transfers\n' +
        (lines.join('\n') || 'No allocation rows') +
        '\nView all recipients in the D1 review ledger. Never pay an unverified WAX account.');
      return true;
    }
    if (name === 'tagtoken') {
      const [symbol, contract, ...extra] = args.split(/\s+/);
      if (extra.length || !/^[A-Z]{1,7}$/.test(symbol || '') ||
          !isValidTokenContract(contract)) {
        await send('Usage: /tagtoken LFGK kingsofgraff (symbol + issuing WAX contract).');
        return true;
      }
      const precision = await tokenInfoFromChain(contract, symbol, fetchImpl);
      if (precision == null) {
        await send('Token was not confirmed by WAX get_currency_stats. No changes made. ' +
          'Check the symbol and contract or retry later.');
        return true;
      }
      await env.DB.prepare('INSERT INTO tag_run_reward_config ' +
        '(chat_id,token_symbol,token_contract,token_precision) VALUES (?,?,?,?) ' +
        'ON CONFLICT(chat_id) DO UPDATE SET token_symbol=excluded.token_symbol,' +
        'token_contract=excluded.token_contract,token_precision=excluded.token_precision,' +
        'base_amount_units=0,max_weekly_units=0,enabled=0,updated_at=CURRENT_TIMESTAMP')
        .bind(chatId, symbol, contract, precision).run();
      await send('Verified on WAX: ' + precision + '-decimal ' + symbol + ' @ ' + contract +
        '. Previous reward amounts reset and rewards disabled. Set /tagamount next.');
      return true;
    }
    if (name === 'tagamount') {
      const cfg = await configFor(env.DB, chatId);
      const [base, max, ...extra] = args.split(/\s+/);
      if (!cfg || cfg.token_precision == null || extra.length) {
        await send('First verify the reward token with /tagtoken SYMBOL contract.');
        return true;
      }
      const baseUnits = parseTokenUnits(base, cfg.token_precision);
      const budgetUnits = parseTokenUnits(max, cfg.token_precision);
      if (!baseUnits || !budgetUnits || baseUnits * cfg.top1_multiplier > budgetUnits ||
          !Number.isSafeInteger(baseUnits * 1000 * 20)) {
        await send('Usage: /tagamount 10 10000 (base per eligible member, total weekly budget). ' +
          'Both quantities must be positive; top rewards must fit the budget.');
        return true;
      }
      await env.DB.prepare('UPDATE tag_run_reward_config SET base_amount_units=?,' +
        'max_weekly_units=?,enabled=0,updated_at=CURRENT_TIMESTAMP WHERE chat_id=?')
        .bind(baseUnits, budgetUnits, chatId).run();
      await send('Weekly base set to ' + formatTokenUnits(baseUnits,cfg.token_precision) +
        ' ' + cfg.token_symbol + ' per active member, budget capped at ' +
        formatTokenUnits(budgetUnits,cfg.token_precision) + ' ' + cfg.token_symbol +
        '. Rewards OFF until /tagenable; existing drafted weeks unchanged.');
      return true;
    }
    if (name === 'tagbonus') {
      const mult = args.split(/\s+/).map(Number);
      if (mult.length !== 3 || mult.some(v => !Number.isInteger(v) || v < 1 || v > 20) ||
          !(mult[0] >= mult[1] && mult[1] >= mult[2])) {
        await send('Usage: /tagbonus 5 3 2 (top 1, 2, 3 multipliers, 1–20 descending).');
        return true;
      }
      await env.DB.prepare('INSERT INTO tag_run_reward_config(chat_id,top1_multiplier,' +
        'top2_multiplier,top3_multiplier) VALUES(?,?,?,?) ON CONFLICT(chat_id) ' +
        'DO UPDATE SET top1_multiplier=excluded.top1_multiplier,' +
        'top2_multiplier=excluded.top2_multiplier,top3_multiplier=excluded.top3_multiplier,' +
        'enabled=0,updated_at=CURRENT_TIMESTAMP').bind(chatId,...mult).run();
      await send('Top-three multipliers updated to ×' + mult.join(' / ×') +
        '. Rewards OFF until /tagenable.');
      return true;
    }
    if (name === 'tagenable' || name === 'tagdisable') {
      if (name === 'tagdisable') {
        await env.DB.prepare('UPDATE tag_run_reward_config SET enabled=0,' +
          'updated_at=CURRENT_TIMESTAMP WHERE chat_id=?').bind(chatId).run();
        await send('TAG RUN weekly reward planning disabled. Street Cred continues.');
        return true;
      }
      const cfg = await configFor(env.DB, chatId);
      if (!cfg || cfg.token_precision == null || cfg.base_amount_units <= 0 ||
          cfg.max_weekly_units < cfg.base_amount_units * cfg.top1_multiplier) {
        await send('Cannot enable: verify token via /tagtoken and set sufficient /tagamount budget.');
        return true;
      }
      await env.DB.prepare('UPDATE tag_run_reward_config SET enabled=1,' +
        'updated_at=CURRENT_TIMESTAMP WHERE chat_id=?').bind(chatId).run();
      await send('TAG RUN reward drafting configured. Actual cron activation requires ' +
        'TAG_RUN_WEEKLY_REWARDS_ENABLED=true in Worker deployment. ' +
        'NO on-chain payouts will be sent; drafts require separate approval.');
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[TAG RUN] command failed', { command: name, reason: String(error?.message || error) });
    try { await send('TAG RUN is temporarily unavailable; no token transfers were attempted.'); } catch (_) {}
    return true;
  }
}

// Promotion delivery is an outbox consumer, not a second award calculation.
// SQLite's AFTER INSERT trigger writes the pending receipt atomically with the
// accepted chat message. Concurrent webhooks and cron can each attempt to drain
// it, but only the one winning the pending→attempted CAS is allowed to send.
// Ambiguous Telegram send failures are never auto-retried (prevent double posts).
function rankAnnouncementText(row) {
  return '🏆 TAG RUN · RANK UP!\n' +
    '🎨 ' + String(row.display_name || 'A member').slice(0, 70) +
    ' just reached ' + row.rank_name + '!\n' +
    '⭐ ' + Number(row.total_points).toLocaleString('en-US') +
    ' Street Cred\n' +
    (rankFor(row.total_points).next
      ? 'Next rank at ' + rankFor(row.total_points).next.toLocaleString('en-US') + ' pts.\n'
      : 'Highest TAG RUN rank achieved!\n') +
    'Keep making your mark in the community.';
}

async function sendRankAnnouncement(env, row, fetchImpl) {
  const token = String(env?.TELEGRAM_BOT_TOKEN || '');
  const chatId = authenticatedGroupId(env);
  if (!token || !chatId) return null;
  const payload = {
    chat_id: chatId,
    text: rankAnnouncementText(row),
    disable_web_page_preview: true
  };
  const threadId = String(env?.TELEGRAM_GROUP_THREAD_ID || '').trim();
  if (/^[1-9][0-9]{0,12}$/.test(threadId)) {
    payload.message_thread_id = Number(threadId);
  }
  const response = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return null;
  const body = await response.json();
  const messageId = Number(body?.result?.message_id);
  return body?.ok === true && Number.isSafeInteger(messageId) && messageId > 0
    ? messageId : null;
}

export async function deliverTagRunRankAnnouncements(env, options = {}) {
  if (!ACTIVE(env) || !env?.TELEGRAM_BOT_TOKEN) return { status: 'disabled' };
  const chatId = authenticatedGroupId(env);
  const limit = Math.min(10, Math.max(1, Number(options.limit) || 10));
  const fetchImpl = options.fetchImpl || fetch;
  const pending = await env.DB.prepare(
    'SELECT chat_id,telegram_id,rank_threshold,rank_name,display_name,' +
    'total_points,source_message_id FROM tag_run_rank_announcements ' +
    "WHERE chat_id=? AND status='pending' ORDER BY created_at ASC, " +
    'source_message_id ASC LIMIT ?'
  ).bind(chatId, limit).all();
  let sent = 0;
  let needsReview = 0;
  for (const row of pending.results || []) {
    const claim = await env.DB.prepare(
      "UPDATE tag_run_rank_announcements SET status='attempted'," +
      'attempt_count=attempt_count+1,attempted_at=CURRENT_TIMESTAMP ' +
      "WHERE chat_id=? AND telegram_id=? AND rank_threshold=? AND status='pending'"
    ).bind(chatId, row.telegram_id, row.rank_threshold).run();
    if (Number(claim?.meta?.changes || 0) !== 1) continue;
    let telegramMessageId = null;
    try {
      telegramMessageId = await sendRankAnnouncement(env, row, fetchImpl);
    } catch (error) {
      // May have sent despite network error: leave for review; do not retry.
      console.warn('[TAG RUN] rank announcement delivery uncertain',
        String(error?.message || error));
    }
    if (telegramMessageId) {
      await env.DB.prepare(
        "UPDATE tag_run_rank_announcements SET status='sent'," +
        'telegram_message_id=?,sent_at=CURRENT_TIMESTAMP ' +
        "WHERE chat_id=? AND telegram_id=? AND rank_threshold=? AND status='attempted'"
      ).bind(telegramMessageId, chatId, row.telegram_id, row.rank_threshold).run();
      sent++;
    } else {
      // A timed-out or malformed send could already be visible to members.
      // Manual review is safer than an automatic duplicate celebration.
      await env.DB.prepare(
        "UPDATE tag_run_rank_announcements SET status='needs_review' " +
        "WHERE chat_id=? AND telegram_id=? AND rank_threshold=? AND status='attempted'"
      ).bind(chatId, row.telegram_id, row.rank_threshold).run();
      needsReview++;
    }
  }
  return { status: 'processed', sent, needsReview };
}

async function hashComment(value, cryptoImpl) {
  const cryptoApi = cryptoImpl || globalThis.crypto;
  if (!cryptoApi?.subtle) return null;
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function recordTagRunMessage(update, env, options = {}) {
  if (!ACTIVE(env)) return false;
  const message = update?.message;
  if (!groupMatches(message, env) || !isTelegramId(message?.from?.id) ||
      !Number.isSafeInteger(message?.message_id) || message?.from?.is_bot) return false;
  const comment = eligibleTagComment(message);
  if (!comment) return false;
  const nowMs = options.nowMs ?? Date.now();
  const sentSec = Number(message?.date);
  // No backdated or long-queued updates cross a UTC reward boundary.
  if (!Number.isFinite(sentSec) || Math.abs(nowMs / 1000 - sentSec) > 300 ||
      utcDay(sentSec * 1000) !== utcDay(nowMs)) return false;
  const hash = await hashComment(comment, options.cryptoImpl);
  if (!hash) return false;
  const chatId = authenticatedGroupId(env);
  const telegramId = String(message.from.id);
  const nowSeconds = Math.floor(nowMs / 1000);
  const day = utcDay(nowMs);
  const week = weekOf(nowMs);
  const previous = previousDay(nowMs);
  const replyId = String(message.reply_to_message?.from?.id || '');
  const replyBonus = isTelegramId(replyId) && replyId !== telegramId &&
    !message.reply_to_message?.from?.is_bot ? REPLY_BONUS : 0;
  // One atomic statement owns idempotency, daily caps, cooldown, repeat-content
  // filtering and streak bonus. Replaying an update never awards points twice.
  const query = [
    'INSERT OR IGNORE INTO tag_run_messages',
    '(chat_id,telegram_id,message_id,day_key,week_key,content_hash,points,message_unix,display_name)',
    'SELECT ?,?,?,?,?,?,',
    '  ' + BASE_POINTS + ' + ? + CASE WHEN',
    '  EXISTS (SELECT 1 FROM tag_run_messages WHERE chat_id=? AND telegram_id=? AND day_key=?)',
    '  AND NOT EXISTS (SELECT 1 FROM tag_run_messages WHERE chat_id=? AND telegram_id=? AND day_key=?)',
    '  THEN ' + STREAK_BONUS + ' ELSE 0 END, ?, ?',
    'WHERE (SELECT COUNT(*) FROM tag_run_messages WHERE chat_id=? AND telegram_id=? AND day_key=?) < ' + DAILY_LIMIT,
    'AND NOT EXISTS (SELECT 1 FROM tag_run_messages WHERE chat_id=? AND telegram_id=? AND day_key>=? AND message_unix>?)',
    'AND NOT EXISTS (SELECT 1 FROM tag_run_messages WHERE chat_id=? AND telegram_id=? AND content_hash=? AND message_unix>?)'
  ].join(' ');
  const result = await env.DB.prepare(query).bind(
    chatId,telegramId,message.message_id,day,week,hash,replyBonus,
    chatId,telegramId,previous, chatId,telegramId,day,
    nowSeconds,cleanName(message.from),
    chatId,telegramId,day,
    chatId,telegramId,previous,nowSeconds - COOLDOWN_SECONDS,
    chatId,telegramId,hash,nowSeconds - 86400
  ).run();
  // D1 reports total statement changes, including member-total and rank-up
  // trigger writes. The INSERT OR IGNORE is the only potential source of
  // changes here, so any positive count means the message was accepted.
  return Number(result?.meta?.changes || 0) > 0;
}

export async function draftTagRunWeeklyRewards(env, options = {}) {
  if (!ACTIVE(env) || env?.TAG_RUN_WEEKLY_REWARDS_ENABLED !== 'true') {
    return { status: 'disabled' };
  }
  const chatId = authenticatedGroupId(env);
  const week = previousWeek(options.nowMs ?? Date.now());
  const existing = await env.DB.prepare(
    'SELECT status FROM tag_run_weekly_plans WHERE chat_id=? AND week_key=?'
  ).bind(chatId,week).first();
  if (existing) return { status: 'already_drafted', week };
  const cfg = await configFor(env.DB, chatId);
  if (!cfg || Number(cfg.enabled) !== 1 || cfg.token_precision == null ||
      cfg.base_amount_units <= 0 || cfg.max_weekly_units <= 0) {
    return { status: 'not_configured', week };
  }

  // D1.batch is a single transaction. The first write derives rankings,
  // count, budget, and a frozen JSON roster from ONE SQL statement. The second
  // write materialises ONLY that frozen roster, never live chat messages.
  // A late message cannot change who receives a top-three multiplier or push
  // the plan beyond the checked recipient/budget caps.
  const insertPlan = env.DB.prepare([
    'WITH scores AS (',
    ' SELECT telegram_id, SUM(points) AS score, COUNT(*) AS posts',
    ' FROM tag_run_messages WHERE chat_id=? AND week_key=?',
    ' GROUP BY telegram_id',
    '), ranked AS (',
    ' SELECT telegram_id,score,posts,ROW_NUMBER() OVER',
    ' (ORDER BY score DESC, posts DESC, telegram_id ASC) AS position',
    ' FROM scores',
    '), census AS (',
    ' SELECT COUNT(*) AS recipient_count,',
    ' COALESCE(SUM(? * CASE r.position WHEN 1 THEN ?',
    ' WHEN 2 THEN ? WHEN 3 THEN ? ELSE 1 END),0) AS planned_units,',
    " json_group_array(json_object('telegram_id',r.telegram_id,",
    " 'position',r.position,'score',r.score,'posts',r.posts,",
    " 'wax_account',w.wax_account,'wallet_status',",
    " COALESCE(w.verification_status,'pending'))) AS standings_json",
    ' FROM ranked r LEFT JOIN tag_run_wallets w ON w.telegram_id=r.telegram_id',
    ') INSERT INTO tag_run_weekly_plans',
    '(chat_id,week_key,token_contract,token_symbol,token_precision,base_amount_units,',
    'max_weekly_units,top1_multiplier,top2_multiplier,top3_multiplier,',
    'planned_units,recipient_count,standings_json,status)',
    'SELECT ?,?,?,?,?,?,?,?,?,?,census.planned_units,census.recipient_count,census.standings_json,',
    "'review_only' FROM census",
    'WHERE census.recipient_count BETWEEN 1 AND ?',
    'AND census.planned_units BETWEEN 1 AND ?',
    'ON CONFLICT(chat_id,week_key) DO NOTHING'
  ].join(' ')).bind(
    chatId,week,cfg.base_amount_units,cfg.top1_multiplier,
    cfg.top2_multiplier,cfg.top3_multiplier,
    chatId,week,cfg.token_contract,cfg.token_symbol,cfg.token_precision,
    cfg.base_amount_units,cfg.max_weekly_units,cfg.top1_multiplier,
    cfg.top2_multiplier,cfg.top3_multiplier, // Snapshotted config
    // The SELECT has 10 fixed config fields, then frozen planned/count/JSON.
    MAX_WEEKLY_RECIPIENTS,cfg.max_weekly_units
  );
  const insertAllocations = env.DB.prepare([
    'INSERT INTO tag_run_weekly_allocations',
    '(chat_id,week_key,telegram_id,rank_position,street_cred,amount_units,',
    'registered_wax_account,wallet_verification_status,status)',
    'SELECT p.chat_id,p.week_key,',
    "json_extract(member.value,'$.telegram_id'),",
    "CAST(json_extract(member.value,'$.position') AS INTEGER),",
    "CAST(json_extract(member.value,'$.score') AS INTEGER),",
    "p.base_amount_units * CASE CAST(json_extract(member.value,'$.position') AS INTEGER)",
    'WHEN 1 THEN p.top1_multiplier WHEN 2 THEN p.top2_multiplier',
    'WHEN 3 THEN p.top3_multiplier ELSE 1 END,',
    "json_extract(member.value,'$.wax_account'),",
    "json_extract(member.value,'$.wallet_status'),'review_only'",
    'FROM tag_run_weekly_plans AS p JOIN json_each(p.standings_json) AS member',
    'WHERE p.chat_id=? AND p.week_key=? AND',
    'NOT EXISTS (SELECT 1 FROM tag_run_weekly_allocations existing',
    'WHERE existing.chat_id=p.chat_id AND existing.week_key=p.week_key)',
    'ON CONFLICT(chat_id,week_key,telegram_id) DO NOTHING'
  ].join(' ')).bind(chatId,week);

  await env.DB.batch([insertPlan,insertAllocations]);
  const created = await env.DB.prepare(
    'SELECT planned_units,recipient_count,token_symbol FROM tag_run_weekly_plans ' +
    'WHERE chat_id=? AND week_key=?'
  ).bind(chatId,week).first();
  if (!created) {
    const activity = await env.DB.prepare(
      'SELECT COUNT(DISTINCT telegram_id) AS recipients FROM tag_run_messages ' +
      'WHERE chat_id=? AND week_key=?'
    ).bind(chatId,week).first();
    const count = Number(activity?.recipients || 0);
    if (count === 0) return { status: 'no_activity', week };
    if (count > MAX_WEEKLY_RECIPIENTS) {
      return { status: 'needs_batched_review', week, recipientCount: count };
    }
    return { status: 'over_budget', week, recipientCount: count };
  }
  const tally = await env.DB.prepare(
    'SELECT COUNT(*) AS members,COALESCE(SUM(amount_units),0) AS units ' +
    'FROM tag_run_weekly_allocations WHERE chat_id=? AND week_key=?'
  ).bind(chatId,week).first();
  if (Number(tally?.members) !== Number(created.recipient_count) ||
      Number(tally?.units) !== Number(created.planned_units)) {
    throw new Error('TAG RUN draft invariant failed: allocations do not equal frozen plan');
  }
  return { status: 'review_only', week, recipientCount: created.recipient_count,
    plannedUnits: created.planned_units, tokenSymbol: created.token_symbol };
}
