// Request-scoped context for text-only Telegram command replies.
//
// The Worker has a large command surface whose helpers already accept the bot
// token.  This wrapper preserves that interface (and stringifies to the real
// token for non-message Telegram methods) while carrying stable, per-update
// media identity into the single sendTelegramMessage gateway.  It is never
// stored globally, so concurrent Worker requests cannot leak or share state.

const CONTEXT = Symbol('telegram-command-media-context');
const NUMERIC_ID = /^-?[0-9]{1,20}$/;

function normalizeChatKind(value) {
  return value === 'private' ? 'private' :
    (value === 'group' || value === 'supergroup' ? 'group' : 'unknown');
}

export function createTelegramCommandMediaContext(env, update = {}) {
  const message = update.message || update.edited_message ||
    update.callback_query?.message || null;
  const token = String(env?.TELEGRAM_BOT_TOKEN || '');
  const sourceId = String(message?.message_id || update.update_id || '0');
  let sequence = 0;
  return Object.freeze({
    [CONTEXT]: true,
    env,
    token,
    chatKind: normalizeChatKind(String(message?.chat?.type || '')),
    logicalId: NUMERIC_ID.test(sourceId) ? sourceId : '0',
    nextSequence: () => sequence++,
    toString: () => token,
    valueOf: () => token,
    [Symbol.toPrimitive]: () => token,
  });
}

export function readTelegramCommandMediaContext(value) {
  return value && value[CONTEXT] === true ? value : null;
}

export function unwrapTelegramBotToken(value) {
  const context = readTelegramCommandMediaContext(value);
  return context ? context.token : String(value || '');
}
