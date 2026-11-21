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
