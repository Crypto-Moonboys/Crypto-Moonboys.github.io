// One-time migration of the old per-chat Telegram Games Web App menu.
// Existing users may never send another command. Scan their stored Telegram
// IDs on the existing five-minute Worker cron, resetting each old override.
// SQL queue makes the rollout resumable, bounded and independently auditable.

export const CHAT_MENU_CLEANUP_SEED_LIMIT = 48;
export const CHAT_MENU_CLEANUP_RUN_LIMIT = 12;
export const CHAT_MENU_CLEANUP_MAX_ATTEMPTS = 4;
const PARALLEL_TELEGRAM_REQUESTS = 3;

const validChatId = (value) => /^[1-9]\d{0,19}$/.test(String(value || ''));

export async function resetLegacyTelegramChatMenu(botToken, telegramId, fetchImpl = fetch) {
  if (!validChatId(telegramId)) return { ok: false, retryable: false, category: 'invalid_telegram_id' };
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(telegramId),
        menu_button: { type: 'commands' },
      }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result?.ok === true) return { ok: true };
    const status = Number(result?.error_code || response.status);
    // Keep only stable, generic error classifications. Never persist Telegram
    // API response descriptions, credentials, chat identities or raw payloads.
    if (status === 400) return { ok: false, retryable: false, category: 'chat_not_found' };
    if (status === 403) return { ok: false, retryable: false, category: 'bot_blocked' };
    if (status === 429) return { ok: false, retryable: true, category: 'rate_limited' };
    if (status === 401) return { ok: false, retryable: true, category: 'bot_auth_failed' };
    return { ok: false, retryable: true, category: 'telegram_unavailable' };
  } catch {
    return { ok: false, retryable: true, category: 'telegram_transport_failed' };
  }
}

export async function runTelegramChatMenuCleanup(env, {
  fetchImpl = fetch,
  now = Math.floor(Date.now() / 1000),
  limit = CHAT_MENU_CLEANUP_RUN_LIMIT,
} = {}) {
  if (!env?.DB || !env?.TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'chat_menu_cleanup_not_configured', seeded: 0, considered: 0 };
  }
  const db = env.DB;
  const runLimit = Math.min(CHAT_MENU_CLEANUP_RUN_LIMIT, Math.max(1, Math.trunc(Number(limit) || 1)));
  // Queue only incremental user IDs. MAX(user_id) is a durable high-water
  // mark; a Worker restart or repeated cron never restarts the whole rollout.
  // Covers users registered between applying migration 102 and Worker deploy.
  const seed = await db.prepare(`INSERT OR IGNORE INTO telegram_chat_menu_cleanup (user_id, telegram_id)
    SELECT id, telegram_id FROM telegram_users
    WHERE id > COALESCE((SELECT MAX(user_id) FROM telegram_chat_menu_cleanup), 0)
    ORDER BY id ASC LIMIT ?`).bind(CHAT_MENU_CLEANUP_SEED_LIMIT).run();
  if (seed?.success !== true) throw new Error('chat_menu_cleanup_seed_failed');

  const due = await db.prepare(`SELECT user_id, telegram_id, attempts
    FROM telegram_chat_menu_cleanup
    WHERE state IN ('pending', 'retry') AND next_attempt_at <= ?
      AND attempts < ?
    ORDER BY next_attempt_at ASC, user_id ASC LIMIT ?`)
    .bind(now, CHAT_MENU_CLEANUP_MAX_ATTEMPTS, runLimit).all();
  if (due?.success !== true || !Array.isArray(due.results)) throw new Error('chat_menu_cleanup_query_failed');

  const stats = { ok: true, seeded: Number(seed?.meta?.changes || 0),
    considered: due.results.length, cleared: 0, unavailable: 0, retry: 0, exhausted: 0, persist_failed: 0 };
  async function handle(job) {
    const attempts = Number(job.attempts || 0);
    const result = await resetLegacyTelegramChatMenu(env.TELEGRAM_BOT_TOKEN, job.telegram_id, fetchImpl);
    const nextAttempt = attempts + 1;
    const state = result.ok ? 'cleared'
      : !result.retryable ? 'unavailable'
      : nextAttempt >= CHAT_MENU_CLEANUP_MAX_ATTEMPTS ? 'exhausted' : 'retry';
    const dueAt = state === 'retry' ? now + 300 * (2 ** attempts) : 0;
    const terminal = ['cleared', 'unavailable', 'exhausted'].includes(state);
    try {
      const saved = await db.prepare(`UPDATE telegram_chat_menu_cleanup
        SET state = ?, attempts = attempts + 1, next_attempt_at = ?,
            last_error_code = ?, finished_at = ?
        WHERE user_id = ? AND attempts = ? AND state IN ('pending', 'retry')`)
        .bind(state, dueAt, result.ok ? null : result.category, terminal ? now : null,
          job.user_id, attempts).run();
      if (saved?.success !== true || Number(saved?.meta?.changes) !== 1) {
        stats.persist_failed++;
        return;
      }
      stats[state]++;
    } catch {
      // Leave row eligible for retry if Telegram succeeded but D1 write failed.
      // Resetting a menu to commands is idempotent.
      stats.persist_failed++;
    }
  }
  for (let index = 0; index < due.results.length; index += PARALLEL_TELEGRAM_REQUESTS) {
    await Promise.all(due.results.slice(index, index + PARALLEL_TELEGRAM_REQUESTS).map(handle));
  }
  stats.ok = stats.persist_failed === 0;
  if (!stats.ok) stats.error = 'chat_menu_cleanup_write_failed';
  return stats;
}
