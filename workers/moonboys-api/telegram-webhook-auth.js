const SECRET_FORMAT = /^[A-Za-z0-9_-]{1,256}$/;
export const TELEGRAM_WEBHOOK_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

// Telegram sends this header only when setWebhook was registered with
// secret_token. Never treat the bot token or request-body identity as proof.
export async function verifyTelegramWebhookSecret(request, env, webCrypto = globalThis.crypto) {
  const expected = env?.TELEGRAM_WEBHOOK_SECRET;
  if (typeof expected !== 'string' || !SECRET_FORMAT.test(expected)) {
    return { ok: false, status: 503, error: 'telegram_webhook_not_configured' };
  }
  const supplied = request.headers.get(TELEGRAM_WEBHOOK_SECRET_HEADER);
  if (!supplied || !SECRET_FORMAT.test(supplied)) {
    return { ok: false, status: 401, error: 'telegram_webhook_unauthorized' };
  }
  try {
    const encoder = new TextEncoder();
    // Fixed-length hashes let Workers' native timingSafeEqual compare every
    // request, including a supplied token whose length differs from the secret.
    const [expectedHash, suppliedHash] = await Promise.all([
      webCrypto.subtle.digest('SHA-256', encoder.encode(expected)),
      webCrypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    ]);
    let equal;
    if (typeof webCrypto.subtle.timingSafeEqual === 'function') {
      equal = webCrypto.subtle.timingSafeEqual(expectedHash, suppliedHash);
    } else {
      // Portable WebCrypto runtimes lack the Workers extension. Compare all
      // digest bytes without a secret-dependent early return.
      const left = new Uint8Array(expectedHash), right = new Uint8Array(suppliedHash);
      let difference = 0;
      for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
      equal = difference === 0;
    }
    return equal ? { ok: true } : { ok: false, status: 401, error: 'telegram_webhook_unauthorized' };
  } catch {
    // Verification outages must not become authorization or leak inputs.
    return { ok: false, status: 503, error: 'telegram_webhook_verification_unavailable' };
  }
}
