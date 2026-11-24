import { streetExchange, streetProfiles, STREET_VARIANTS, BEAR_VARIANTS } from './street-dialogue.mjs?v=2';

const PAIR_DISTANCE = 34;
const TURN_MS = 2_700;
const REST_MS = 16_000;
const near = (a, b, distance) => Math.hypot(a.x - b.x, a.y - b.y) < distance;
export const streetProfileId = id => id.replace(/^roamer:/, '');

// Entirely local. Chance is evaluated once per eligible approach, not per frame.
export function createStreetEncounters(random = Math.random) {
  let nearby = new Set();
  const active = new Map();
  const rests = new Map();
  const variants = new Map();

  return {
    holds: id => active.has(id) || [...active.values()].some(exchange => exchange.listener === id),
    tick(actors, now, busy) {
      const cast = new Map(actors.map(actor => [actor.id, actor]));
      const lines = [];
      const held = new Set();
      for (const [id, exchange] of active) {
        const a = cast.get(id);
        const b = cast.get(exchange.listener);
        const line = exchange.lines[Math.floor((now - exchange.since) / TURN_MS)];
        if (line && a && b && near(a, b, PAIR_DISTANCE * 2)) {
          lines.push({ ...line, id: line.actor === streetProfileId(id) ? id : b.id });
          held.add(id);
          held.add(b.id);
          continue;
        }
        rests.set(id, now + REST_MS);
        rests.set(exchange.listener, now + REST_MS);
        active.delete(id);
      }

      const close = new Set();
      const free = id => !held.has(id) && !busy?.(id) && now >= (rests.get(id) ?? 0);
      for (const a of actors) {
        const speaker = streetProfileId(a.id);
        const profile = streetProfiles[speaker];
        if (profile?.role !== 'police' && profile?.role !== 'bear') continue;
        for (const b of actors) {
          if (a.id === b.id || !near(a, b, PAIR_DISTANCE)) continue;
          const listener = streetProfileId(b.id);
          const other = streetProfiles[listener];
          if (!other || (profile.role === 'police' && other.role === 'police')) continue;
          const pair = [a.id, b.id].sort().join('|');
          if (close.has(pair)) continue;
          close.add(pair);
          if (nearby.has(pair) || !free(a.id) || !free(b.id)) continue;
          const reverse = (other.role === 'bear' || other.role === 'police') && random() >= 0.5;
          const [starter, target] = reverse ? [b.id, a.id] : [a.id, b.id];
          const starterId = streetProfileId(starter);
          const isBear = streetProfiles[starterId].role === 'bear';
          if (random() >= (isBear ? 0.7 : 0.6)) continue;

          const length = isBear ? BEAR_VARIANTS : STREET_VARIANTS;
          const index = variants.get(starterId) ?? Math.floor(random() * length);
          variants.set(starterId, (index + 37) % length);
          const turns = streetExchange(starterId, streetProfileId(target), index);
          active.set(starter, { listener: target, since: now, lines: turns });
          held.add(a.id);
          held.add(b.id);
          lines.push({ ...turns[0], id: starter });
        }
      }
      nearby = close;
      return lines;
    },
  };
}
