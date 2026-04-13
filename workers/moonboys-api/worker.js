/**
 * Moonboys API — Cloudflare Worker entrypoint
 *
 * Handles community engagement endpoints backed by a D1 database (binding: DB).
 * Configure the D1 database ID in wrangler.toml before deploying.
 *
 * NOTE:
 * The only modification from your original file is the updated
 * `sendTelegramMessage` function, which now logs Telegram API responses
 * to help diagnose why the bot may not be replying.
 */

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const MAX_NAME_LENGTH    = 60;
const MAX_COMMENT_LENGTH = 2000;
const MAX_TG_LENGTH      = 60;
const MAX_DISCORD_LENGTH = 60;
const MAX_AVATAR_URL_LEN = 500;

const TELEGRAM_AUTH_MAX_AGE = 86400; // 24 hours

// XP Rules
const XP_FIRST_START  = 50;
const XP_DAILY_CLAIM  = 20;
const XP_QUEST_SOLVE  = 0;
const XP_GROUP_JOIN   = 10;

// Season Constants
const TG_SEASON_LENGTH_MS = 90 * 24 * 60 * 60 * 1000;
const TG_ARCHIVE_TOP_N    = 50;
const MS_PER_DAY          = 86400000;
const SEASON_EPOCH_MS     = 1704067200000;

// Approved factions
const APPROVED_FACTIONS = new Set([
  'diamond-hands',
  'hodl-warriors',
  'moon-mission',
  'graffpunks',
]);

const SITE_URL = 'https://crypto-moonboys.github.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

async function sha256Hex(str) {
  const data   = new TextEncoder().encode(String(str || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getTodayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function getTelegramDisplayName(user) {
  if (!user) return 'Unknown';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') ||
         user.username ||
         String(user.id);
}

function tgSeasonDaysRemaining(seasonStartIso) {
  const elapsed = Date.now() - new Date(seasonStartIso).getTime();
  return Math.max(0, Math.ceil((TG_SEASON_LENGTH_MS - elapsed) / MS_PER_DAY));
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// -----------------------------------------------------------------------------
// ✅ UPDATED TELEGRAM MESSAGE SENDER
// -----------------------------------------------------------------------------
/**
 * Send a text message via the Telegram Bot API.
 * This version logs Telegram API responses to help diagnose issues.
 */
async function sendTelegramMessage(botToken, chatId, text, extra = {}) {
  if (!botToken || !chatId) {
    console.log('TG send skipped', JSON.stringify({
      hasBotToken: !!botToken,
      hasChatId: !!chatId,
      chatId: chatId || null,
    }));
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          ...extra,
        }),
      }
    );

    const responseText = await response.text();

    console.log('TG send status:', response.status);
    console.log('TG send response:', responseText);

    if (!response.ok) {
      console.log('TG send failed', JSON.stringify({
        status: response.status,
        chatId,
        response: responseText,
      }));
    }
  } catch (error) {
    console.log('TG send exception:', error?.message || error);
  }
}

// -----------------------------------------------------------------------------
// Remaining Helper Functions (Unchanged)
// -----------------------------------------------------------------------------
async function upsertTelegramProfile(db, user) {
  const telegramId  = String(user.id);
  const username    = user.username || null;
  const displayName = getTelegramDisplayName(user);
  const avatarUrl   = user.photo_url || null;

  await db.prepare(`
    INSERT INTO telegram_profiles (telegram_id, username, display_name, avatar_url, last_seen_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username     = excluded.username,
      display_name = excluded.display_name,
      avatar_url   = COALESCE(excluded.avatar_url, telegram_profiles.avatar_url),
      last_seen_at = CURRENT_TIMESTAMP
  `).bind(telegramId, username, displayName, avatarUrl).run();

  return telegramId;
}

async function awardXp(db, telegramId, xpDelta, eventType, source, sourceRef = '') {
  if (!xpDelta || xpDelta < 0) return;
  const eventId = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO telegram_xp_events (id, telegram_id, event_type, xp_delta, source, source_ref)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(eventId, telegramId, eventType, xpDelta, source, sourceRef).run();

  await db.prepare(`
    UPDATE telegram_profiles
    SET xp_total    = xp_total    + ?,
        xp_seasonal = xp_seasonal + ?,
        xp_yearly   = xp_yearly   + ?
    WHERE telegram_id = ?
  `).bind(xpDelta, xpDelta, xpDelta, telegramId).run();
}

// -----------------------------------------------------------------------------
// Worker Fetch Handler
// -----------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true });
    }

    // Telegram webhook endpoint
    if (path === '/telegram/webhook' && request.method === 'POST') {
      const update = await request.json().catch(() => null);
      if (update) {
        await handleTelegramUpdate(update, env).catch(err => {
          console.log('Webhook error:', err);
        });
      }
      return json({ ok: true });
    }

    return err('Not found', 404);
  },
};

// -----------------------------------------------------------------------------
// Telegram Update Handler
// -----------------------------------------------------------------------------
async function handleTelegramUpdate(update, env) {
  const db  = env.DB;
  const tok = env.TELEGRAM_BOT_TOKEN;

  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId     = String(msg.chat.id);
  const fromUser   = msg.from;
  const telegramId = String(fromUser.id);
  const text       = msg.text.trim();

  await upsertTelegramProfile(db, fromUser);

  if (!text.startsWith('/')) return;

  const cmd = text.split(' ')[0].replace('/', '').split('@')[0].toLowerCase();

  switch (cmd) {
    case 'gkstart':
    case 'start':
      await cmdGkStart(db, tok, chatId, telegramId, fromUser);
      break;

    case 'gkhelp':
    case 'help':
      await cmdGkHelp(tok, chatId);
      break;

    default:
      await sendTelegramMessage(tok, chatId, '❓ Unknown command. Use /gkhelp.');
  }
}

// -----------------------------------------------------------------------------
// GK Commands
// -----------------------------------------------------------------------------
async function cmdGkStart(db, tok, chatId, telegramId, fromUser) {
  const name = getTelegramDisplayName(fromUser);
  await awardXp(db, telegramId, XP_FIRST_START, 'first_start', 'bot_command');

  await sendTelegramMessage(tok, chatId,
    `🚀 <b>Welcome to Crypto Moonboys GK, ${escapeHtml(name)}!</b>\n\n` +
    `Use /gkhelp to see available commands.`
  );
}

async function cmdGkHelp(tok, chatId) {
  await sendTelegramMessage(tok, chatId,
    `📖 <b>Moonboys GK Commands</b>\n\n` +
    `/gkstart — Start and register\n` +
    `/gklink — Link account to website\n` +
    `/gkstatus — Season stats\n` +
    `/gkseason — Season info\n` +
    `/gkleaderboard — Leaderboard\n` +
    `/gkquests — Missions\n` +
    `/gkfaction — Faction\n` +
    `/gkunlink — Unlink account\n`
  );
}
