import {
  TAG_RUN_RANKS, rankFor, weekOf, previousWeek, previousDay, utcDay, parseTagCommand,
  eligibleTagComment, isValidWaxAccount, isValidTokenContract,
  parseTokenUnits, formatTokenUnits, adminTelegramIds, authenticatedGroupId
} from './core.js';
import { V2_COMMANDS, V2_ADMIN_COMMANDS, handleTagRunV2Command } from './v2-service.js';
import { checkWaxDestination } from './wallet-destination.js';
import { sendControlledMoonboyTelegram, moonboyTelegramMessageSeed } from '../telegram/moonboy-message-gateway.js';

const TAG_COMMANDS = new Set([
  'profile', 'tagprofile', 'top', 'rewards', 'ranks', 'help', 'taghelp', 'rain', 'rainstatus',
  'block', 'unblock',
  'tagtoken', 'tagamount', 'tagbonus', 'tagstatus', 'tagplan', 'tagalerts', 'tagenable', 'tagdisable',
  ...V2_COMMANDS
]);
const ADMIN_COMMANDS = new Set([
  'tagtoken', 'tagamount', 'tagbonus', 'tagstatus', 'tagplan', 'tagalerts', 'tagenable', 'tagdisable',
  'block', 'unblock',
  ...V2_ADMIN_COMMANDS
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

async function messageReply(env, chatId, message, fetchImpl = fetch, useGroupTopic = false, mediaContext = null) {
  const token = String(env?.TELEGRAM_BOT_TOKEN || '');
  if (!token || !chatId) return false;
  const payload = {
    chat_id: chatId, text: String(message).slice(0, 3500),
    disable_web_page_preview: true
  };
  // Scheduled group bulletins belong in the configured announcement topic.
  // Ordinary command replies retain their existing chat routing.
  if (useGroupTopic && String(chatId) === authenticatedGroupId(env)) {
    const threadId = String(env?.TELEGRAM_GROUP_THREAD_ID || '').trim();
    if (/^[1-9][0-9]{0,12}$/.test(threadId)) {
      payload.message_thread_id = Number(threadId);
    }
  }
  // Strict opt-in: the legacy transport remains byte-for-byte unchanged when
  // media is OFF, unavailable or the image failed before any Telegram request.
  // Never use text fallback after an uncertain Telegram photo submission.
  if (mediaContext) {
    const media = await sendControlledMoonboyTelegram({
      env, chatId, chatKind: mediaContext.chatKind,
      messageKind: mediaContext.messageKind, seed: mediaContext.seed,
      text: payload.text, options: {
        ...(payload.message_thread_id
          ? { message_thread_id: payload.message_thread_id } : {})
      }, fetchImpl
    });
    if (media.status !== 'disabled' && media.status !== 'composition_failed') {
      return media.status === 'sent';
    }
  }
  const response = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
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
    'SELECT m.telegram_id, COALESCE(MAX(t.display_name),MAX(m.display_name)) AS display_name, ' +
    'SUM(m.points) AS score, COUNT(*) AS posts, ' +
    'COALESCE(t.score,0) AS lifetime_score ' +
    'FROM tag_run_messages m LEFT JOIN tag_run_member_totals t ' +
    'ON t.chat_id=m.chat_id AND t.telegram_id=m.telegram_id ' +
    'WHERE m.chat_id=? AND m.week_key=? ' +
    'GROUP BY m.telegram_id ORDER BY score DESC, posts DESC, m.telegram_id ASC LIMIT 10'
  ).bind(chatId, weekKey).all();
  return rows.results || [];
}
// Four-hour group bulletin. The schedule is separate from the 5-minute
// maintenance tick, and never posts for groups other than the configured one.
export async function postTagRunGroupBulletin(env, options = {}) {
  if (!ACTIVE(env)) return { status: 'disabled' };
  const chatId = authenticatedGroupId(env);
  const nowMs = options.nowMs ?? Date.now();
  const rows = await weeklyTop(env.DB, chatId, weekOf(nowMs));
  const ranks = rows.map((row, index) =>
    (index + 1) + '. ' + String(row.display_name || 'Tagger')
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .slice(0, 70) + ' — ' + String(Number(row.score) || 0) +
    ' pts · ' + rankFor(row.lifetime_score).name);
  const bot = String(env.TELEGRAM_BOT_USERNAME || 'WIKICOMSBOT').replace(/^@/, '');
  const message = 'TAG RUN · STREET CRED\n' +
    'Make your mark in this group. Meaningful messages (10+ characters) earn ' +
    '10 Street Cred; replies to other members add 2, and an active-day streak adds 5. ' +
    'Maximum 30 credited messages per UTC day, with a 45-second cooldown. ' +
    'No spam or repeated comments. Points here are separate from Arcade XP.\n\n' +
    'THIS WEEK’S TOP 10 (UTC)\n' +
    (ranks.join('\n') || 'No qualifying messages yet. Be the first to get on the wall.') +
    '\n\n/tagprofile — your points and rank\n/top — live weekly top 10' +
    '\n/ranks — all 29 ranks\n/taghelp — full guide' +
    '\n/rain yourwaxaccount — register a WAX account by private DM to @' + bot +
    ' (verification pending; no automatic payouts).';
  const sent = await messageReply(env, chatId, message, options.fetchImpl || fetch, true, {
    chatKind: 'group', messageKind: 'tag-bulletin',
    seed: moonboyTelegramMessageSeed('tag-bulletin', chatId,
      Math.floor(nowMs / (4 * 60 * 60 * 1000)))
  });
  // Never retry an uncertain send: a delivered-but-unacknowledged Telegram
  // response must not cause duplicate group notices.
  if (!sent) console.warn('[TAG RUN] four-hour bulletin delivery unconfirmed');
  return { status: sent ? 'sent' : 'unconfirmed', count: rows.length };
}

async function allTimeTop(db, chatId) {
  const rows = await db.prepare(
    'SELECT telegram_id,display_name,score,posts FROM tag_run_member_totals ' +
    'WHERE chat_id=? ORDER BY score DESC,posts DESC,telegram_id ASC LIMIT 10'
  ).bind(chatId).all();
  return rows.results || [];
}
async function configFor(db, chatId) {
  return db.prepare('SELECT * FROM tag_run_reward_config WHERE chat_id=?')
    .bind(chatId).first();
}

// Administrator writes use a monotonic compare-and-swap revision, NOT the
// second-resolution updated_at timestamp. A stale /tagamount must never commit
// values converted using an obsolete WAX token precision; a delayed /tagenable
// must never reverse /tagdisable, /tagtoken or /tagbonus.
async function writeConfigIfCurrent(db, query, args) {
  const result = await db.prepare(query).bind(...args).run();
  const changes = Number(result?.meta?.changes);
  if (!result || result.success === false ||
      !Number.isSafeInteger(changes) || changes < 0) {
    throw new Error('tag_run_config_write_unconfirmed');
  }
  return changes > 0;
}
function configRevision(config) {
  const revision = Number(config?.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('tag_run_config_revision_invalid');
  }
  return revision;
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
    '/rainstatus — check your registered WAX account privately\n' +
    '/pool — community token pot status (V2, when enabled)\n' +
    '/myrewards — unfunded participation weight (V2, when enabled)\n' +
    '/help or /taghelp — this TAG RUN guide\n' +
    'Other bot commands such as /games, /daily and /gklink remain separate.\n' +
    'No website linking is required to earn TAG RUN points.';
}
const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{5,32}$/;
function commandUsername(args) {
  const match = String(args || '').trim().match(/^@([A-Za-z0-9_]{5,32})$/);
  return match ? match[1] : null;
}
async function usernameRows(db, query, args) {
  const result = await db.prepare(query).bind(...args).all();
  if (result?.success === false || !Array.isArray(result?.results)) {
    throw new Error('tag_run_username_lookup_unavailable');
  }
  return result.results;
}
async function resolveMemberByUsername(db, chatId, username, includeBlockedAlias) {
  let rows = await usernameRows(db,
    'SELECT telegram_id,username FROM telegram_users ' +
    'WHERE username=? COLLATE NOCASE ORDER BY updated_at DESC,telegram_id LIMIT 2',
    [username]);
  if (!rows.length && includeBlockedAlias) {
    rows = await usernameRows(db,
      'SELECT telegram_id,username FROM tag_run_member_blocks ' +
      'WHERE chat_id=? AND username=? COLLATE NOCASE ' +
      'ORDER BY updated_at DESC,telegram_id LIMIT 2',
      [chatId,username]);
  }
  if (rows.length !== 1) return { status: rows.length ? 'ambiguous' : 'missing' };
  const telegramId = String(rows[0].telegram_id || '');
  const resolvedUsername = String(rows[0].username || '');
  if (!isTelegramId(telegramId) || !TELEGRAM_USERNAME.test(resolvedUsername)) {
    throw new Error('tag_run_username_lookup_invalid');
  }
  return { status: 'found', telegramId, username: resolvedUsername };
}
async function handleMemberBlockCommand(env, {
  name,args,chatId,telegramId,send
}) {
  const username = commandUsername(args);
  if (!username) {
    await send('Usage: /' + name + ' @username');
    return true;
  }
  const target = await resolveMemberByUsername(
    env.DB,chatId,username,name === 'unblock'
  );
  if (target.status === 'missing') {
    await send('@' + username + ' is not known to TAG RUN yet. ' +
      'They must send at least one eligible message in the group first.');
    return true;
  }
  if (target.status === 'ambiguous') {
    await send('@' + username + ' matches more than one Telegram identity. ' +
      'Nothing changed; resolve the duplicate identity before retrying.');
    return true;
  }
  const checkedChanges = result => {
    const changes = Number(result?.meta?.changes);
    if (result?.success === false || !Number.isSafeInteger(changes) ||
        changes < 0) throw new Error('tag_run_reward_block_write_unconfirmed');
    return changes;
  };
  if (name === 'block') {
    const state = env.DB.prepare(
      'INSERT INTO tag_run_member_blocks ' +
      '(chat_id,telegram_id,username,blocked,updated_by,blocked_at,unblocked_at,updated_at) ' +
      'VALUES (?,?,?,1,?,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(chat_id,telegram_id) DO UPDATE SET ' +
      'username=excluded.username,blocked=1,updated_by=excluded.updated_by,' +
      'blocked_at=CASE WHEN tag_run_member_blocks.blocked=1 ' +
      'THEN tag_run_member_blocks.blocked_at ELSE CURRENT_TIMESTAMP END,' +
      'unblocked_at=NULL,updated_at=CURRENT_TIMESTAMP'
    ).bind(chatId,target.telegramId,target.username,telegramId);
    const period = env.DB.prepare(
      'INSERT INTO tag_run_reward_exclusion_periods ' +
      '(chat_id,telegram_id,updated_by) SELECT ?,?,? WHERE NOT EXISTS (' +
      'SELECT 1 FROM tag_run_reward_exclusion_periods ' +
      'WHERE chat_id=? AND telegram_id=? AND ended_at IS NULL)'
    ).bind(chatId,target.telegramId,telegramId,chatId,target.telegramId);
    const results = await env.DB.batch([state,period]);
    if (!Array.isArray(results) || results.length !== 2 ||
        checkedChanges(results[0]) < 1) {
      throw new Error('tag_run_reward_block_write_unconfirmed');
    }
    checkedChanges(results[1]);
    await send('TAG RUN REWARDS BLOCKED\n@' + target.username +
      ' · Telegram ID ' + target.telegramId +
      '\nStreet Cred, ranks and leaderboards: ON' +
      '\nCommunity participation: ON' +
      '\nCommunity Pot rewards: OFF' +
      '\nExisting unpaid reward weight is paused. Messages sent while ' +
      'reward-blocked remain in Street Cred history but earn no token weight.' +
      (adminTelegramIds(env).has(target.telegramId)
        ? '\nAdmin access: unchanged.' : ''));
    return true;
  }
  const state = env.DB.prepare(
    'UPDATE tag_run_member_blocks SET blocked=0,updated_by=?,' +
    'unblocked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP ' +
    'WHERE chat_id=? AND telegram_id=? AND blocked=1'
  ).bind(telegramId,chatId,target.telegramId);
  const period = env.DB.prepare(
    'UPDATE tag_run_reward_exclusion_periods SET ended_at=CURRENT_TIMESTAMP ' +
    'WHERE chat_id=? AND telegram_id=? AND ended_at IS NULL'
  ).bind(chatId,target.telegramId);
  const results = await env.DB.batch([state,period]);
  if (!Array.isArray(results) || results.length !== 2) {
    throw new Error('tag_run_reward_unblock_write_unconfirmed');
  }
  const stateChanges = checkedChanges(results[0]);
  const periodChanges = checkedChanges(results[1]);
  if (stateChanges === 0 && periodChanges === 0) {
    await send('@' + target.username + ' is already reward-unblocked.');
    return true;
  }
  if (stateChanges !== 1 || periodChanges !== 1) {
    throw new Error('tag_run_reward_unblock_write_unconfirmed');
  }
  await send('TAG RUN REWARDS UNBLOCKED\n@' + target.username +
    ' · Telegram ID ' + target.telegramId +
    '\nStreet Cred, ranks and leaderboards remained ON' +
    '\nCommunity Pot rewards: ON' +
    '\nPreviously earned unpaid eligibility resumes. Messages sent during ' +
    'the exclusion period remain Street Cred only.' +
    (adminTelegramIds(env).has(target.telegramId)
      ? '\nAdmin access: unchanged.' : ''));
  return true;
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
  let replySequence = 0;
  const send = text => messageReply(env, message.chat.id, text, fetchImpl, false, {
    chatKind: isPrivate ? 'private' : 'group',
    messageKind: 'tag-command',
    seed: moonboyTelegramMessageSeed('tag-command', message.chat.id,
      message.message_id ?? 0, replySequence++)
  });
  const isAdmin = adminTelegramIds(env).has(telegramId);
  try {
    if (ADMIN_COMMANDS.has(name) && (!isAdmin || !isPrivate)) {
      await send('TAG RUN admin settings are available only to authorised admins in a private bot chat.');
      return true;
    }
    if (V2_COMMANDS.has(name)) {
      return await handleTagRunV2Command(env, { name, args, isAdmin, isPrivate, chatId,
        telegramId, send, nowMs, fetchImpl });
    }
    if (name === 'block' || name === 'unblock') {
      return await handleMemberBlockCommand(env, {
        name,args,chatId,telegramId,send
      });
    }
    if (name === 'help' || name === 'taghelp') {
      await send(helpMessage());
      return true;
    }
    if (name === 'rain') {
      if (!isPrivate) {
        await send('To register your chosen WAX payout destination, DM @' +
          String(env.TELEGRAM_BOT_USERNAME || 'WIKICOMSBOT').replace(/^@/, '') +
          ' with /rain yourwaxaccount.');
        return true;
      }
      if (!isValidWaxAccount(args)) {
        await send('Usage: /rain yourwaxaccount\nEnter a valid WAX account name. ' +
          'No wallet login or signature is needed. Double-check the destination: ' +
          'tokens sent to the wrong account may be unrecoverable.');
        return true;
      }
      let check;
      try {
        check = await checkWaxDestination(args, fetchImpl);
      } catch (error) {
        console.warn('[TAG RUN] WAX destination validation unavailable', {
          reason: String(error?.message || error)
        });
        await send('WAX account could not be confirmed on mainnet right now. ' +
          'Your registration was NOT changed. Retry /rain when the WAX RPC is available.');
        return true;
      }
      if (check.status !== 'exists') {
        await send('Invalid WAX destination. Nothing was registered.');
        return true;
      }
      // Telegram assigns increasing message IDs within the same private chat.
      // Encode the message's UTC second plus its numeric ID in the fractional
      // part of registered_at. This remains a sortable UTC timestamp while
      // preserving ordering even when two requests share the same second.
      // Older existing CURRENT_TIMESTAMP rows sort before newer registrations.
      const messageUnix = Number(message.date);
      const messageId = Number(message.message_id);
      if (!Number.isSafeInteger(messageUnix) || messageUnix <= 0 ||
          !Number.isSafeInteger(messageId) || messageId <= 0 ||
          messageId > 999999999999999) {
        throw new Error('wax_destination_message_order_unavailable');
      }
      const registeredAt = new Date(messageUnix * 1000).toISOString()
        .slice(0, 19).replace('T', ' ') + '.' +
        String(messageId).padStart(15, '0');
      // Atomic DB compare-and-swap: network validation may finish out of order,
      // but the earlier Telegram message can NEVER replace a later selection.
      const write = await env.DB.prepare('INSERT INTO tag_run_wallets ' +
        '(telegram_id,wax_account,verification_status,verified_at,registered_at) ' +
        "VALUES (?,?,'pending',NULL,?) ON CONFLICT(telegram_id) DO UPDATE SET " +
        "wax_account=excluded.wax_account, verification_status='pending', " +
        'verified_at=NULL,registered_at=excluded.registered_at ' +
        'WHERE tag_run_wallets.registered_at < excluded.registered_at')
        .bind(telegramId, args, registeredAt).run();
      if (write?.success === false || !Number.isSafeInteger(write?.meta?.changes) ||
          write.meta.changes < 0) {
        throw new Error('wax_destination_registration_write_failed');
      }
      if (write.meta.changes === 0) {
        await send('This older /rain request was ignored because a newer ' +
          'wallet destination was already registered. Use /rainstatus to check.');
        return true;
      }
      await send('WAX payout destination REGISTERED: ' + args +
        '\nAccount exists on WAX mainnet. This does not prove account ownership, ' +
        'and no signature is required by TAG RUN.' +
        '\nYou chose this receiving account; check the spelling carefully. ' +
        'Tokens sent to an incorrect account may be unrecoverable.' +
        '\nFunded payouts are currently DISABLED.');
      return true;
    }
    if (name === 'rainstatus') {
      if (!isPrivate) {
        await send('Wallet details are private. DM @' +
          String(env.TELEGRAM_BOT_USERNAME || 'WIKICOMSBOT').replace(/^@/, '') +
          ' with /rainstatus.');
        return true;
      }
      const wallet = await env.DB.prepare(
        'SELECT wax_account,verification_status,verified_at FROM tag_run_wallets ' +
        'WHERE telegram_id=?'
      ).bind(telegramId).first();
      if (!wallet) {
        await send('TAG RUN WAX WALLET\nNo WAX account registered. ' +
          'DM /rain yourwaxaccount to set your destination. ' +
          'No token transfers are enabled.');
        return true;
      }
      // Old /rain registrations may predate the mainnet existence check.
      // Show them as saved destinations, not as independently proven ownership.
      let exists = false;
      try {
        exists = (await checkWaxDestination(wallet.wax_account, fetchImpl)).status === 'exists';
      } catch (_) {
        // Do not transform RPC failure into an assertion that the account exists.
      }
      await send('TAG RUN WAX WALLET\nRegistered destination: ' +
        String(wallet.wax_account) +
        '\nRegistration: ' + (exists
          ? 'REGISTERED — WAX mainnet account confirmed'
          : 'SAVED — chain account check currently unavailable; retry /rainstatus') +
        '\nNo wallet signature or ownership proof is required to choose ' +
        'your payout destination. You are responsible for entering the correct account.' +
        '\nFuture route: approved rewards sent directly to your chosen WAX account.' +
        '\nCurrent status: FUNDED PAYOUTS DISABLED.');
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
          ? wallet.wax_account + ' (registered destination)'
          : 'destination registered — details in bot DM') :
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
      // Once V2 has been explicitly enabled, the legacy fixed-budget LFGK
      // description is replaced by the funded-by-tips token pot. V1 history
      // remains readable, and the V1 weekly draft cron remains disabled.
      if (env?.TAG_RUN_V2_POOL_ENABLED === 'true') {
        return await handleTagRunV2Command(env, { name: 'pool', isAdmin, isPrivate,
          chatId, telegramId, send, nowMs, fetchImpl });
      }
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
        'No website account sync needed for Street Cred. Recipients choose a WAX account with /rain; funded payouts remain disabled.');
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
        '\nView all recipients in the D1 review ledger. Review-only; no payments. Payout destinations must be valid WAX accounts.');
      return true;
    }
    if (name === 'tagtoken') {
      const [symbol, contract, ...extra] = args.split(/\s+/);
      if (extra.length || !/^[A-Z]{1,7}$/.test(symbol || '') ||
          !isValidTokenContract(contract)) {
        await send('Usage: /tagtoken LFGK kingsofgraff (symbol + issuing WAX contract).');
        return true;
      }
      // Capture the config revision BEFORE the external WAX RPC call. A slow
      // response cannot undo a newer admin /tagdisable or token change.
      const prior = await configFor(env.DB, chatId);
      const revision = prior ? configRevision(prior) : null;
      const precision = await tokenInfoFromChain(contract, symbol, fetchImpl);
      if (precision == null) {
        await send('Token was not confirmed by WAX get_currency_stats. No changes made. ' +
          'Check the symbol and contract or retry later.');
        return true;
      }
      const saved = prior
        ? await writeConfigIfCurrent(env.DB,
          'UPDATE tag_run_reward_config SET token_symbol=?,token_contract=?,' +
          'token_precision=?,base_amount_units=0,max_weekly_units=0,' +
          'enabled=0,revision=revision+1,updated_at=CURRENT_TIMESTAMP ' +
          'WHERE chat_id=? AND revision=?',
          [symbol,contract,precision,chatId,revision])
        : await writeConfigIfCurrent(env.DB,
          'INSERT OR IGNORE INTO tag_run_reward_config ' +
          '(chat_id,token_symbol,token_contract,token_precision,enabled,revision) ' +
          'VALUES (?,?,?,?,0,1)',
          [chatId,symbol,contract,precision]);
      if (!saved) {
        await send('TAG RUN configuration changed while the WAX token was being verified. ' +
          'No changes made. Check /tagstatus and retry /tagtoken if still needed.');
        return true;
      }
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
      const revision = configRevision(cfg);
      const baseUnits = parseTokenUnits(base, cfg.token_precision);
      const budgetUnits = parseTokenUnits(max, cfg.token_precision);
      if (!baseUnits || !budgetUnits || baseUnits * cfg.top1_multiplier > budgetUnits ||
          !Number.isSafeInteger(baseUnits * 1000 * 20)) {
        await send('Usage: /tagamount 10 10000 (base per eligible member, total weekly budget). ' +
          'Both quantities must be positive; top rewards must fit the budget.');
        return true;
      }
      // A token replacement changes the revision. Never apply quantities
      // converted with an earlier token's precision to a different token.
      const saved = await writeConfigIfCurrent(env.DB,
        'UPDATE tag_run_reward_config SET base_amount_units=?,' +
        'max_weekly_units=?,enabled=0,revision=revision+1,' +
        'updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND revision=? ' +
        'AND token_symbol=? AND token_contract=? AND token_precision=?',
        [baseUnits,budgetUnits,chatId,revision,
          cfg.token_symbol,cfg.token_contract,cfg.token_precision]);
      if (!saved) {
        await send('TAG RUN token or reward settings changed before /tagamount was saved. ' +
          'No amounts changed. Review /tagstatus and enter quantities again.');
        return true;
      }
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
      const prior = await configFor(env.DB, chatId);
      const saved = prior
        ? await writeConfigIfCurrent(env.DB,
          'UPDATE tag_run_reward_config SET top1_multiplier=?,' +
          'top2_multiplier=?,top3_multiplier=?,enabled=0,revision=revision+1,' +
          'updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND revision=?',
          [...mult,chatId,configRevision(prior)])
        : await writeConfigIfCurrent(env.DB,
          'INSERT OR IGNORE INTO tag_run_reward_config ' +
          '(chat_id,top1_multiplier,top2_multiplier,top3_multiplier,enabled,revision) ' +
          'VALUES (?,?,?,?,0,1)',[chatId,...mult]);
      if (!saved) {
        await send('TAG RUN settings changed while /tagbonus was being applied. ' +
          'No changes made. Review /tagstatus and retry.');
        return true;
      }
      await send('Top-three multipliers updated to ×' + mult.join(' / ×') +
        '. Rewards OFF until /tagenable.');
      return true;
    }
    if (name === 'tagenable' || name === 'tagdisable') {
      if (name === 'tagdisable') {
        // Even a repeated disable must bump the revision, invalidating any
        // /tagenable that read the settings before this command.
        const saved = await writeConfigIfCurrent(env.DB,
          'INSERT INTO tag_run_reward_config(chat_id,enabled,revision) VALUES (?,0,1) ' +
          'ON CONFLICT(chat_id) DO UPDATE SET enabled=0,' +
          'revision=tag_run_reward_config.revision+1,updated_at=CURRENT_TIMESTAMP',
          [chatId]);
        if (!saved) throw new Error('tag_run_disable_write_unconfirmed');
        await send('TAG RUN weekly reward planning disabled. Street Cred continues.');
        return true;
      }
      const cfg = await configFor(env.DB, chatId);
      if (!cfg || cfg.token_precision == null || cfg.base_amount_units <= 0 ||
          cfg.max_weekly_units < cfg.base_amount_units * cfg.top1_multiplier) {
        await send('Cannot enable: verify token via /tagtoken and set sufficient /tagamount budget.');
        return true;
      }
      const saved = await writeConfigIfCurrent(env.DB,
        'UPDATE tag_run_reward_config SET enabled=1,revision=revision+1,' +
        'updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND revision=? ' +
        'AND token_precision IS NOT NULL AND base_amount_units>0 ' +
        'AND max_weekly_units>=base_amount_units*top1_multiplier',
        [chatId,configRevision(cfg)]);
      if (!saved) {
        await send('TAG RUN settings were changed or disabled while /tagenable ran. ' +
          'Reward drafting was NOT enabled. Review /tagstatus and retry if intended.');
        return true;
      }
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
  const media = await sendControlledMoonboyTelegram({
    env, chatId, chatKind: 'group', messageKind: 'tag-rank',
    seed: moonboyTelegramMessageSeed('tag-rank', chatId,
      String(row.source_message_id) + '-' + String(row.rank_threshold)),
    text: payload.text,
    options: payload.message_thread_id
      ? { message_thread_id: payload.message_thread_id } : {},
    fetchImpl
  });
  if (media.status === 'sent') return media.telegramMessageId;
  if (media.status !== 'disabled' && media.status !== 'composition_failed') {
    // The outbox caller will mark needs_review. A timeout/unknown photo send
    // must never fall through to a second text message.
    return null;
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
    "WHERE chat_id=? AND status='pending' " +
    'ORDER BY created_at ASC, source_message_id ASC LIMIT ?'
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
  if (env?.TAG_RUN_ENABLED !== 'true') return false;
  const message = update?.message;
  if (!groupMatches(message, env) || !isTelegramId(message?.from?.id) ||
      !Number.isSafeInteger(message?.message_id) || message?.from?.is_bot) return false;
  const comment = eligibleTagComment(message);
  if (!comment) return false;
  // A missing D1 binding is a scoring outage, not an ineligible message.
  // Fail this authenticated group update with 503 through the wrapper.
  if (!env?.DB) throw new Error('tag_run_database_unavailable');
  const nowMs = options.nowMs ?? Date.now();
  const sentSec = Number(message?.date);
  // No backdated or long-queued updates cross a UTC reward boundary.
  if (!Number.isFinite(sentSec) || Math.abs(nowMs / 1000 - sentSec) > 300 ||
      utcDay(sentSec * 1000) !== utcDay(nowMs)) return false;
  const hash = await hashComment(comment, options.cryptoImpl);
  if (!hash) throw new Error('tag_run_content_hash_unavailable');
  const chatId = authenticatedGroupId(env);
  const telegramId = String(message.from.id);
  const observedUsername = TELEGRAM_USERNAME.test(String(message.from.username || ''))
    ? String(message.from.username) : null;
  const identity = await env.DB.prepare(
    'INSERT INTO telegram_users(telegram_id,username,first_name,last_name,updated_at) ' +
    'VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(telegram_id) DO UPDATE SET ' +
    'username=COALESCE(excluded.username,telegram_users.username),' +
    'first_name=COALESCE(excluded.first_name,telegram_users.first_name),' +
    'last_name=COALESCE(excluded.last_name,telegram_users.last_name),' +
    'updated_at=CURRENT_TIMESTAMP'
  ).bind(telegramId,observedUsername,
    String(message.from.first_name || '').slice(0,64) || null,
    String(message.from.last_name || '').slice(0,64) || null).run();
  if (identity?.success === false ||
      !Number.isSafeInteger(Number(identity?.meta?.changes)) ||
      Number(identity.meta.changes) < 1) {
    throw new Error('tag_run_member_identity_write_unconfirmed');
  }
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
  // A successful INSERT OR IGNORE may change zero rows for spam/replays. A
  // missing result or failed DB write is NOT equivalent to a rejected post:
  // throw so Telegram receives a 503 and retries the signed webhook.
  if (!result || result.success === false ||
      !Number.isSafeInteger(Number(result.meta?.changes)) ||
      Number(result.meta.changes) < 0) {
    throw new Error('tag_run_scoring_write_unconfirmed');
  }
  // D1 reports trigger writes (lifetime totals and rank-up outbox) too.
  return Number(result.meta.changes) > 0;
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
    // One SQL snapshot owns BOTH configuration and membership. A concurrent
    // /tagdisable, /tagtoken, /tagamount or /tagbonus committed before this
    // statement cannot be overridden by an earlier configFor() read.
    'WITH live_config AS (',
    ' SELECT token_contract,token_symbol,token_precision,base_amount_units,',
    ' max_weekly_units,top1_multiplier,top2_multiplier,top3_multiplier',
    ' FROM tag_run_reward_config',
    ' WHERE chat_id=? AND enabled=1 AND token_precision IS NOT NULL',
    ' AND base_amount_units>0 AND max_weekly_units>0',
    '), scores AS (',
    ' SELECT telegram_id, SUM(points) AS score, COUNT(*) AS posts',
    ' FROM tag_run_messages m WHERE m.chat_id=? AND m.week_key=?',
    ' AND NOT EXISTS (SELECT 1 FROM tag_run_member_blocks b',
    ' WHERE b.chat_id=m.chat_id AND b.telegram_id=m.telegram_id AND b.blocked=1)',
    ' AND NOT EXISTS (SELECT 1 FROM tag_run_reward_exclusion_periods e',
    ' WHERE e.chat_id=m.chat_id AND e.telegram_id=m.telegram_id',
    ' AND unixepoch(e.started_at)<=m.message_unix',
    ' AND (e.ended_at IS NULL OR m.message_unix<unixepoch(e.ended_at)))',
    ' GROUP BY m.telegram_id',
    '), ranked AS (',
    ' SELECT telegram_id,score,posts,ROW_NUMBER() OVER',
    ' (ORDER BY score DESC, posts DESC, telegram_id ASC) AS position',
    ' FROM scores',
    '), census AS (',
    ' SELECT COUNT(*) AS recipient_count,',
    ' COALESCE(SUM(lc.base_amount_units * CASE r.position',
    ' WHEN 1 THEN lc.top1_multiplier WHEN 2 THEN lc.top2_multiplier',
    ' WHEN 3 THEN lc.top3_multiplier ELSE 1 END),0) AS planned_units,',
    " json_group_array(json_object('telegram_id',r.telegram_id,",
    " 'position',r.position,'score',r.score,'posts',r.posts,",
    " 'wax_account',w.wax_account,'wallet_status',",
    " COALESCE(w.verification_status,'pending'))) AS standings_json",
    ' FROM ranked r LEFT JOIN tag_run_wallets w ON w.telegram_id=r.telegram_id',
    ' CROSS JOIN live_config lc',
    ') INSERT INTO tag_run_weekly_plans',
    '(chat_id,week_key,token_contract,token_symbol,token_precision,base_amount_units,',
    'max_weekly_units,top1_multiplier,top2_multiplier,top3_multiplier,',
    'planned_units,recipient_count,standings_json,status)',
    'SELECT ?,?,lc.token_contract,lc.token_symbol,lc.token_precision,',
    'lc.base_amount_units,lc.max_weekly_units,lc.top1_multiplier,',
    'lc.top2_multiplier,lc.top3_multiplier,census.planned_units,',
    "census.recipient_count,census.standings_json,'review_only'",
    'FROM live_config lc CROSS JOIN census',
    'WHERE census.recipient_count BETWEEN 1 AND ?',
    'AND census.planned_units BETWEEN 1 AND lc.max_weekly_units',
    'ON CONFLICT(chat_id,week_key) DO NOTHING'
  ].join(' ')).bind(chatId,chatId,week,chatId,week,MAX_WEEKLY_RECIPIENTS);
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
    // Report a config race as disabled/not-configured, never as an erroneous
    // budget failure. The real INSERT cannot write under a disabled setting.
    const liveCfg = await configFor(env.DB, chatId);
    if (!liveCfg || Number(liveCfg.enabled) !== 1 ||
        liveCfg.token_precision == null || liveCfg.base_amount_units <= 0 ||
        liveCfg.max_weekly_units <= 0) {
      return { status: 'not_configured', week };
    }
    const activity = await env.DB.prepare(
      'SELECT COUNT(DISTINCT m.telegram_id) AS recipients FROM tag_run_messages m ' +
      'WHERE m.chat_id=? AND m.week_key=? AND NOT EXISTS (' +
      'SELECT 1 FROM tag_run_member_blocks b WHERE b.chat_id=m.chat_id ' +
      'AND b.telegram_id=m.telegram_id AND b.blocked=1) AND NOT EXISTS (' +
      'SELECT 1 FROM tag_run_reward_exclusion_periods e ' +
      'WHERE e.chat_id=m.chat_id AND e.telegram_id=m.telegram_id ' +
      'AND unixepoch(e.started_at)<=m.message_unix AND ' +
      '(e.ended_at IS NULL OR m.message_unix<unixepoch(e.ended_at)))'
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
