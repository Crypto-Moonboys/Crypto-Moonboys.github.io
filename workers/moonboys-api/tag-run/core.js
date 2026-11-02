// TAG RUN Street Cred is separate from Arcade XP and MoonPet progression.
// Pure helpers are intentionally usable by isolated Node contract tests.
export const TAG_RUN_RANKS = Object.freeze([
  [0, 'Newbie Tagger'], [25, 'Fresh Ink'], [60, 'Sticker Bandit'],
  [100, 'Street Rat'], [150, 'Marker Maniac'], [220, 'Alley Artist'],
  [300, 'Stencil Starter'], [420, 'Throwie Trainee'], [580, 'Rooftop Rookie'],
  [760, 'Trackside Tagger'], [1000, 'Train Bomber'],
  [1300, 'Night Shift Sprayer'], [1700, 'Chrome Chaser'],
  [2200, 'Outline Operator'], [2800, 'Fill-In Fiend'],
  [3500, 'Drip Doctor'], [4400, 'Wildstyle Wrangler'],
  [5500, 'Freight Phantom'], [7000, 'Tunnel Tactician'],
  [9000, 'Yard Ninja'], [11500, 'Roller Renegade'],
  [14500, 'Piece Prodigy'], [18500, 'Burner Maker'],
  [23500, 'Style General'], [30000, 'City-Wide'],
  [38000, 'Hall of Fame'], [48000, 'Graffiti Veteran'],
  [60000, 'Graffiti Legend'], [95000, 'Graffiti King']
]);
export function rankFor(points) {
  const safe = Number.isFinite(Number(points)) ? Math.max(0, Number(points)) : 0;
  for (let i = TAG_RUN_RANKS.length - 1; i >= 0; i--) {
    if (safe >= TAG_RUN_RANKS[i][0]) {
      return { threshold: TAG_RUN_RANKS[i][0], name: TAG_RUN_RANKS[i][1],
        next: TAG_RUN_RANKS[i + 1]?.[0] ?? null };
    }
  }
  return { threshold: 0, name: 'Newbie Tagger', next: 25 };
}
export function utcDay(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}
export function weekOf(nowMs = Date.now()) {
  const d = new Date(nowMs);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return utcDay(d.getTime());
}
export function previousWeek(nowMs = Date.now()) {
  return weekOf(nowMs - 7 * 86400 * 1000);
}
export function previousDay(nowMs = Date.now()) {
  return utcDay(nowMs - 86400 * 1000);
}
export function parseTagCommand(text, botUsername = '') {
  const value = String(text || '').trim();
  const match = value.match(/^\/([a-z][a-z0-9_]{0,31})(?:@([a-z0-9_]{5,32}))?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  if (match[2] && match[2].toLowerCase() !== String(botUsername).replace(/^@/, '').toLowerCase()) return null;
  return { name: match[1].toLowerCase(), args: (match[3] || '').trim() };
}
export function eligibleTagComment(message) {
  if (!message || message.from?.is_bot || message.sender_chat || message.forward_origin || !message.message_id) return null;
  const raw = typeof message.text === 'string' ? message.text : '';
  const normalized = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (normalized.length < 10 || normalized.length > 2048 || normalized.startsWith('/') ||
      /^(https?:\/\/|www\.)/i.test(normalized)) return null;
  const letters = (normalized.match(/[\p{L}\p{N}]/gu) || []);
  if (letters.length < 8 || new Set(letters.map(x => x.toLowerCase())).size < 5 ||
      normalized.split(/\s+/u).filter(Boolean).length < 2) return null;
  return normalized.toLowerCase();
}
export function isValidWaxAccount(value) {
  return /^[a-z1-5.]{1,12}$/.test(String(value || '')) &&
    !String(value).startsWith('.') && !String(value).endsWith('.') &&
    !String(value).includes('..');
}
export function isValidTokenContract(value) {
  return isValidWaxAccount(value);
}
export function parseTokenUnits(input, precision) {
  const p = Number(precision);
  if (!Number.isInteger(p) || p < 0 || p > 8) return null;
  const raw = String(input || '').trim();
  if (!/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,8})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  if (fraction.length > p) return null;
  const units = Number(whole) * 10 ** p + Number(fraction.padEnd(p, '0') || '0');
  if (!Number.isSafeInteger(units) || units < 0 || units > 1e12) return null;
  return units;
}
export function formatTokenUnits(units, precision) {
  const p = Math.max(0, Math.min(8, Number(precision) || 0));
  const n = Math.max(0, Math.trunc(Number(units) || 0));
  const factor = 10 ** p;
  return p ? String(Math.floor(n / factor)) + '.' + String(n % factor).padStart(p, '0') : String(n);
}
export function adminTelegramIds(env) {
  return new Set(String(env?.ADMIN_TELEGRAM_IDS || '').split(',').map(v => v.trim()).filter(v => /^[0-9]{1,20}$/.test(v)));
}
export function authenticatedGroupId(env) {
  const id = String(env?.TELEGRAM_GROUP_CHAT_ID || '').trim();
  return /^-100[0-9]{5,20}$/.test(id) ? id : '';
}
