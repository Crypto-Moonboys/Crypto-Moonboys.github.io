import { LEADERS } from '../../../js/waterfront-faction-identities.mjs?v=2';

import { createNpcDialogue, DIALOGUE_VARIANTS, loreTopics } from './npc-dialogue.mjs?v=1';

const ids = Object.keys(LEADERS);
const total = DIALOGUE_VARIANTS;
// Map the original twenty topic positions to their closest current subjects.
const legacyTopics = [7, 9, 0, 1, 1, 8, 10, 11, 10, 14, 12, 13, 16, 17, 18, 19, 20, 21, 4, 23];
const dayNumber = now => Math.floor(now / 86_400_000);
const keyFor = (left, right) => [left, right].sort((a, b) => a - b).join(':');
const turn = (actor, text) => ({ actor, text });

// Browser-local pair memory follows the faction ID when it becomes the player avatar.
export function createFactionConversations(storage, dialogue = createNpcDialogue(storage)) {
  const key = 'waterfront.faction-encounters.v1';
  let saved;
  try { saved = JSON.parse(storage?.getItem(key)); } catch { /* Storage is optional. */ }
  const memory = {};
  for (let left = 0; left < ids.length; left++) {
    for (let right = left + 1; right < ids.length; right++) {
      const pair = keyFor(left, right);
      const record = saved?.[pair];
      if (!Number.isSafeInteger(record?.day) || !Number.isSafeInteger(record?.count) || record.count < 0) continue;
      const topic = record.topic ?? (Number.isInteger(record.index) && record.index >= 0 &&
        record.index < total && (record.speaker === left || record.speaker === right)
        ? legacyTopics[Math.floor(((record.index * 47 + record.speaker * 17) % total) / 12)]
        : undefined);
      if (Number.isInteger(topic) && topic >= 0 && topic < loreTopics.length) {
        memory[pair] = { day: record.day, count: record.count, topic };
      }
    }
  }
  let nearby = new Set();
  const active = new Map();
  let waiting = new Set();

  return {
    holds: index => waiting.has(index) || [...active.values()].some(exchange => index === exchange.a || index === exchange.b),
    tick(actors, now) {
      const visible = new Map(actors.map(actor => [actor.index, actor]));
      const close = new Set();
      for (const left of actors) for (const right of actors) {
        if (left.index < right.index && Math.hypot(left.x - right.x, left.y - right.y) < 37) {
          close.add(keyFor(left.index, right.index));
        }
      }
      nearby = new Set([...nearby].filter(pair => close.has(pair)));
      const linesNow = [];
      const occupied = new Set();
      for (const [pair, exchange] of active) {
        const line = exchange.lines[Math.floor((now - exchange.since) / 4_500)];
        const a = visible.get(exchange.a), b = visible.get(exchange.b);
        if (line && a && b && Math.hypot(a.x - b.x, a.y - b.y) < 84) {
          linesNow.push(line);
          occupied.add(exchange.a);
          occupied.add(exchange.b);
          continue;
        }
        if (!line && a && b && Math.hypot(a.x - b.x, a.y - b.y) < 84) {
          memory[pair] = exchange.record;
          try { storage?.setItem(key, JSON.stringify(memory)); } catch { /* The current session still remembers. */ }
        }
        active.delete(pair);
      }

      waiting = new Set();
      for (const arrival of close) {
        if (nearby.has(arrival)) continue;
        const [a, b] = arrival.split(':').map(Number);
        if (occupied.has(a) || occupied.has(b)) {
          // Keep nearby walkers in range until both participants are available.
          waiting.add(a);
          waiting.add(b);
          continue;
        }
        nearby.add(arrival);
        occupied.add(a);
        occupied.add(b);
        const day = dayNumber(now);
        const previous = memory[arrival];
        const count = (previous?.count ?? 0) + 1;
        const mode = !previous ? 'new' : count % 3 === 2 ? 'passing' : count % 3 === 0 ? 'resume' : 'new';
        const speaker = count % 2 ? a : b;
        const listener = speaker === a ? b : a;
        const speakerId = 'leader:' + speaker;
        const listenerId = 'leader:' + listener;
        const previousTopic = previous?.topic;
        const opening = mode === 'passing' ? null : dialogue.take(speakerId, 'open', mode === 'resume' ? 'resume' : 'lore',
          mode === 'resume' ? previousTopic : undefined, ((day % total) * 13 + a * 9 + b) % total);
        const topic = opening?.topic ?? previousTopic;
        const ending = dialogue.take(speakerId, 'end', 'lore', topic);
        const lines = mode === 'passing' ? [turn(speaker, ending.text)] : [
          turn(speaker, opening.text),
          turn(listener, dialogue.take(listenerId, 'middle', 'lore', topic).text),
          turn(speaker, dialogue.take(speakerId, 'middle', 'lore', topic).text),
          turn(speaker, ending.text),
        ];
        dialogue.save();
        active.set(arrival, { a, b, since: now, lines,
          record: { day: mode === 'new' ? day : previous.day, count, topic } });
        linesNow.push(lines[0]);
      }
      return linesNow;
    },
  };
}
