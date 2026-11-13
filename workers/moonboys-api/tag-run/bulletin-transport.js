// Every four-hour bulletin uses GK's fixed launch artwork.
// Its full body is a separate message: Telegram photo captions are limited to 1024 characters.
import { authenticatedGroupId } from './core.js';

export const TAG_RUN_BULLETIN_IMAGE =
  'https://cryptomoonboys.com/img/Neon%20GKNIFTYHEADS%20Tag-Run%20Launch.jpg';

async function request(token, method, payload, fetchImpl) {
  try {
    const response = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    return response.ok && body?.ok === true &&
      Number.isSafeInteger(body.result?.message_id) && body.result.message_id > 0
      ? 'sent' : 'unconfirmed';
  } catch (_) {
    // A timeout or unreadable acknowledgement may have followed delivery.
    // Never retry this request or expose the token-bearing URL in logs.
    return 'unconfirmed';
  }
}

export async function sendTagRunBulletin(env, text, fetchImpl = fetch) {
  const token = String(env?.TELEGRAM_BOT_TOKEN || '');
  const chatId = authenticatedGroupId(env);
  if (!token || !chatId) return {
    status: 'unconfirmed', photoStatus: 'not_attempted', textStatus: 'not_attempted'
  };
  if (typeof text !== 'string' || !text.length || text.length > 4096) {
    throw new Error('tag_run_bulletin_invalid_text');
  }
  const topic = String(env.TELEGRAM_GROUP_THREAD_ID || '').trim();
  const routing = {
    chat_id: chatId,
    ...(/^[1-9][0-9]{0,12}$/.test(topic) ? { message_thread_id: Number(topic) } : {})
  };
  const photoStatus = await request(token, 'sendPhoto', {
    ...routing, photo: TAG_RUN_BULLETIN_IMAGE,
    caption: 'TAG RUN · STREET CRED + COMMUNITY POT'
  }, fetchImpl);
  // This is always the distinct, full bulletin body, never a duplicate photo
  // fallback. Preserve it even when the independent image request is unconfirmed.
  const textStatus = await request(token, 'sendMessage', {
    ...routing, text, disable_web_page_preview: true
  }, fetchImpl);
  return {
    status: photoStatus === 'sent' && textStatus === 'sent' ? 'sent'
      : textStatus === 'sent' ? 'partial' : 'unconfirmed',
    photoStatus, textStatus
  };
}
