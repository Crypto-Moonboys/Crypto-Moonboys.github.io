const PACK_NAME = 'GKMoonboys';
const FACTION_EMOJI = Object.freeze({
  'All City Bulls': '⚽',
  'Crypto Moongirls': '💋',
  'Crypto Stoned Boys': '🫁',
  'GraffPUNKS': '💉',
  'Hard Fork Rockers': '💊',
  'Rugpull Miners': '💣',
  'Blockchain Furies': '🗡',
  'The Blockstars': '🧱',
  'Nomad Bears': '🐻',
});
// Daily-loop status uses canonical faction IDs as its labels.
const FACTION_LABELS = Object.freeze(Object.fromEntries(
  Object.keys(FACTION_EMOJI).map(label => [
    label === 'The Blockstars' ? 'blockstars' : label.toLowerCase().replaceAll(' ', '-'),
    label,
  ]),
));
const FACTION_LINE = /^Faction: ([^\r\n]+)$/m;
export const isTelegramBotToken = token => /^[0-9]{4,20}:[A-Za-z0-9_-]{20,}$/.test(token);
const normalizeEmoji = value => String(value || '').replace(/\uFE0F/g, '');

let packCache;
let pendingLookup;

async function fetchFactionEmojiPack(token, fetchImpl) {
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/getStickerSet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: PACK_NAME }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const { ok, result } = await response.json();
    if (!ok || result?.sticker_type !== 'custom_emoji' || !Array.isArray(result.stickers)) return null;
    const entries = new Map();
    for (const sticker of result.stickers) {
      const key = normalizeEmoji(sticker.emoji);
      const id = sticker.custom_emoji_id;
      if (entries.has(key) || typeof id !== 'string' || !/^[0-9]{1,20}$/.test(id)) return null;
      entries.set(key, sticker);
    }
    if (!Object.values(FACTION_EMOJI).every(emoji => entries.has(emoji))) return null;
    return entries;
  } catch {
    return null;
  }
}

async function getFactionEmojiPack(token, fetchImpl) {
  if (packCache && Date.now() < packCache.expiresAt) return packCache.entries;
  pendingLookup ||= fetchFactionEmojiPack(token, fetchImpl).then(entries => {
    packCache = { entries, expiresAt: Date.now() + (entries ? 3600_000 : 60_000) };
    pendingLookup = undefined;
    return entries;
  });
  return pendingLookup;
}

export async function addFactionEmojiToStatus(text, token, fetchImpl = fetch) {
  const match = FACTION_LINE.exec(text);
  const label = match && (FACTION_LABELS[match[1]] || match[1]);
  if (!label || !Object.hasOwn(FACTION_EMOJI, label)) return text;
  const entries = await getFactionEmojiPack(token, fetchImpl);
  const sticker = entries?.get(FACTION_EMOJI[label]);
  if (!sticker) return text;
  return text.replace(FACTION_LINE, () =>
    `Faction: <tg-emoji emoji-id="${sticker.custom_emoji_id}">${sticker.emoji}</tg-emoji> ${label}`);
}

// Insert one pack emoji per message. A known faction uses its own icon.
export async function addMoonboysMessageEmoji(text, token, fetchImpl = fetch) {
  if (typeof text !== 'string' || !text.trim() || text.includes('<tg-emoji') ||
      !isTelegramBotToken(token)) return text;
  const match = FACTION_LINE.exec(text);
  const label = match && (FACTION_LABELS[match[1]] || match[1]);
  if (label && Object.hasOwn(FACTION_EMOJI, label)) {
    return addFactionEmojiToStatus(text, token, fetchImpl);
  }
  const entries = await getFactionEmojiPack(token, fetchImpl);
  if (!entries) return text;
  const emojis = Object.values(FACTION_EMOJI);
  const sticker = entries.get(emojis[Math.floor(Math.random() * emojis.length)]);
  return `<tg-emoji emoji-id="${sticker.custom_emoji_id}">${sticker.emoji}</tg-emoji> ${text}`;
}

export function formatMoonboysAnnouncement(text) {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return escaped.replace(/^[^\r\n]+/, heading => `<b>${heading}</b>`);
}

export async function sendMoonboysPlainTelegramPost(token, payload, send, fetchImpl = fetch) {
  if (!isTelegramBotToken(token)) return send(payload);
  const field = typeof payload.caption === 'string' ? 'caption' : 'text';
  const limit = field === 'caption' ? 1024 : 4096;
  const html = formatMoonboysAnnouncement(payload[field]);
  const branded = await addMoonboysMessageEmoji(html, token, fetchImpl);
  const response = await send({
    ...payload, [field]: branded.length <= limit ? branded : html, parse_mode: 'HTML',
  });
  // An explicit 400 means Telegram did not accept the post.
  return response.status === 400 ? send(payload) : response;
}
