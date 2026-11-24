import { streetExchange, streetProfiles } from './street-dialogue.mjs?v=3';
import { createNpcDialogue } from './npc-dialogue.mjs?v=1';

const PAIR_DISTANCE = 34;
const TURN_MS = 2_700;
const REST_MS = 16_000;
const near = (a, b, distance) => Math.hypot(a.x - b.x, a.y - b.y) < distance;
export const streetProfileId = id => id.replace(/^roamer:/, '');

// Entirely local. Chance is evaluated once per eligible approach, not per frame.
export function createStreetEncounters(random = Math.random, dialogue = createNpcDialogue()) {
  let nearby = new Set();
  const active = new Map();
  const rests = new Map();

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
      const characters = actors.filter(actor => Object.hasOwn(streetProfiles, streetProfileId(actor.id)));
      // Give police and bear approaches first use of nearby neighbors.
      const role = id => streetProfiles[streetProfileId(id)];
      const priority = actor => Number(role(actor.id) === 'neighbor');
      const starters = characters.toSorted((a, b) => priority(a) - priority(b));
      for (const a of starters) {
        const profile = role(a.id);
        for (const b of characters) {
          if (a.id === b.id || !near(a, b, PAIR_DISTANCE)) continue;
          const other = role(b.id);
          if (profile === 'police' && other === 'police') continue;
          if (a.id.startsWith('leader:') && b.id.startsWith('leader:')) continue;
          const pair = [a.id, b.id].sort().join('|');
          if (close.has(pair)) continue;
          if (profile === 'neighbor' && other !== 'neighbor') continue;
          close.add(pair);
          if (nearby.has(pair) || !free(a.id) || !free(b.id)) continue;
          const reverse = profile === other || other !== 'neighbor' ? random() >= 0.5 : false;
          const [starter, target] = reverse ? [b.id, a.id] : [a.id, b.id];
          const starterRole = role(starter);
          if (random() >= (starterRole === 'bear' ? 0.7 : starterRole === 'police' ? 0.6 : 0.28)) continue;

          const scene = starterRole === 'bear' ? (random() < 0.5 ? 'offer' : 'watch') : starterRole === 'police' ? 'patrol' : 'lore';
          const turns = streetExchange(dialogue, streetProfileId(starter), streetProfileId(target), scene);
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
