// Pin a persistent OPEN GAMES shortcut during deliberate private-chat commands.
// Telegram never emits an update when a returning user simply opens a chat.
// Preserve other pins; detect an existing Games pin instead of sending one
// every time /start or /games is used. No D1 migration is required.
const PIN_TEXT = 'Crypto Moonboys Games\nQuick access to your games.';
const validPrivateChatId = id => /^[1-9]\d{0,19}$/.test(String(id || ''));

export async function ensureTelegramGamesPinned(botToken, chatId, gamesUrl, {
  fetchImpl = fetch,
} = {}) {
  if (!botToken || !validPrivateChatId(chatId) ||
      typeof gamesUrl !== 'string' || !gamesUrl.startsWith('https://')) {
    return { ok: false, status: 'invalid_input' };
  }
  const base = `https://api.telegram.org/bot${botToken}/`;
  async function call(method, args) {
    const res = await fetchImpl(base + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.ok === true ? data.result : null;
  }
  // Fail closed if Telegram cannot confirm existing pinned state, so a
  // temporary read failure cannot cause a duplicate pinned message.
  let chat;
  try {
    chat = await call('getChat', { chat_id: chatId });
  } catch {
    return { ok: false, status: 'chat_lookup_failed' };
  }
  if (!chat) return { ok: false, status: 'chat_lookup_failed' };
  const pinned = chat.pinned_message;
  if (pinned?.text === PIN_TEXT && pinned.reply_markup?.inline_keyboard?.some(row =>
    row.some(button => button.text === 'OPEN GAMES' &&
      (button.web_app?.url === gamesUrl || button.url === gamesUrl)))) {
    return { ok: true, status: 'already_pinned' };
  }

  // Telegram exposes only the most recent pin; a different pin could be
  // above an existing Games pin. Do not create duplicates or override it.
  if (pinned) return { ok: true, status: 'other_pin_present' };

  let sent;
  try {
    sent = await call('sendMessage', {
      chat_id: chatId, text: PIN_TEXT,
      reply_markup: { inline_keyboard: [[{ text: 'OPEN GAMES', web_app: { url: gamesUrl } }]] },
      disable_notification: true,
    });
  } catch {
    return { ok: false, status: 'send_failed' };
  }
  const messageId = sent?.message_id;
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return { ok: false, status: 'send_failed' };
  }
  try {
    const pinnedResult = await call('pinChatMessage', {
      chat_id: chatId, message_id: messageId, disable_notification: true,
    });
    if (pinnedResult === true) return { ok: true, status: 'pinned' };
  } catch {
    // Pinning can fail for users or clients that restrict bot pins.
  }
  // Avoid leaving an orphan shortcut on failed pin; only delete our own newly
  // created message. Do not unpin or delete any pre-existing user pins.
  try { await call('deleteMessage', { chat_id: chatId, message_id: messageId }); }
  catch {}
  return { ok: false, status: 'pin_failed' };
}
