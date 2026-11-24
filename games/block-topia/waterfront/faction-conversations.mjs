import { LEADERS } from '../../../js/waterfront-faction-identities.mjs';

const ids = Object.keys(LEADERS);
// Topics draw on the published world. Dialogue is a character's opinion or question.
const topics = [
  ['the lantern route', 'A clear way from the lantern to the dock would help newcomers'],
  ['the seawall mural', 'The path beside the mural needs room for people to stop and look'],
  ['dock shifts', 'Cargo traffic and people on foot need room to pass each other'],
  ['Southwest Park', 'A resting place belongs beside the path where people can reach it'],
  ['West Meadow', 'A garden route could link the old streets to the south'],
  ['East Common', 'A market loop would give the crowd somewhere to go after the docks'],
  ['South Point', 'A lookout could give visitors a place to watch the harbor'],
  ['East Shore', 'Lit landings could make the service strip easier to navigate'],
  ['the offshore islands', 'The islands are visible before they have a walking route'],
  ['the Street Kingdoms', 'People beyond Block Topia keep their own routes and workshops'],
  ['the Paint Path', 'A public mark can carry a warning or preserve a memory'],
  ['the Hard Fork Games', 'The Games bring people seeking entry or recognition into the city'],
  ['Block Topia’s gates', 'The city can keep vital services running and still ask too much at a gate'],
  ['the market factions', 'The Bulls and Bears embody different sides of the same market'],
  ['the Bitcoin Kid Army', 'The Army protects both market factions while Alfie answers to GKniftyHEADS'],
  ['the HODL Warriors', 'Crews can serve in a united army and retain their own identities'],
  ['the HODL X Warriors', 'Block Topia’s X order is a distinction that has to be earned'],
  ['the Bitcoin X Kids', 'Being raised inside Block Topia and serving in Alfie’s Army are different things'],
  ['crew receipts', 'A banked tier gives a crew a result it can check'],
  ['the Final Fork', 'There’s room to argue about the Final Fork while its outcome is unresolved'],
];
const openers = [
  topic => `What’s your crew’s first concern about ${topic}?`,
  topic => `Who gets heard first when the crews discuss ${topic}?`,
  topic => `What do people miss when they talk about ${topic}?`,
  topic => `Where would your crew start a disagreement over ${topic}?`,
  topic => `What would change your mind about ${topic}?`,
  topic => `What would you ask a newcomer to notice about ${topic}?`,
  topic => `What promise about ${topic} would you put on the record?`,
  topic => `Who ends up carrying the work when we talk about ${topic}?`,
  topic => `If the crews could agree on one thing about ${topic}, what would it be?`,
  topic => `What has to be checked before we make a claim about ${topic}?`,
  topic => `What should your crew remember next time ${topic} comes up?`,
  topic => `What would you tell someone hearing about ${topic} for the first time?`,
];
const farewells = [
  name => `Yo, ${name}. I’ll catch you soon.`,
  () => 'Easy. I’m working on it. I’ll holla soon.',
  name => `Hiya, ${name}. I’m busy. I’ll DM you.`,
  () => 'On the clock right now. Save me the good bit.',
  () => 'I’ve got a stop to make. Catch me on the way back.',
];
const total = topics.length * openers.length;
const dayNumber = now => Math.floor(now / 86_400_000);
const keyFor = (left, right) => [left, right].sort((a, b) => a - b).join(':');
const turn = (actor, text) => ({ actor, text });

export function factionQuestion(actor, index) {
  const offset = (index * 47 + actor * 17) % total;
  const [topic, observation] = topics[Math.floor(offset / openers.length)];
  const voice = LEADERS[ids[actor]];
  return { topic, observation, text: voice.motto + '. ' + openers[offset % openers.length](topic) };
}

// Browser-local pair memory follows the faction ID when it becomes the player avatar.
export function createFactionConversations(storage) {
  const key = 'waterfront.faction-encounters.v1';
  let saved;
  try { saved = JSON.parse(storage?.getItem(key)); } catch { /* Storage is optional. */ }
  const memory = {};
  for (let left = 0; left < ids.length; left++) {
    for (let right = left + 1; right < ids.length; right++) {
      const pair = keyFor(left, right);
      const record = saved?.[pair];
      if (Number.isSafeInteger(record?.day) && Number.isSafeInteger(record?.count) && record.count >= 0 &&
          Number.isInteger(record?.index) && record.index >= 0 && record.index < total &&
          (record.speaker === left || record.speaker === right)) memory[pair] = record;
    }
  }
  let nearby = new Set();
  let active;
  let cooldown = 0;

  return {
    holds: index => Boolean(active && (index === active.a || index === active.b)),
    tick(actors, now) {
      const visible = new Map(actors.map(actor => [actor.index, actor]));
      const close = new Set();
      for (const left of actors) for (const right of actors) {
        if (left.index < right.index && Math.hypot(left.x - right.x, left.y - right.y) < 37) {
          close.add(keyFor(left.index, right.index));
        }
      }
      const arrival = [...close].find(pair => !nearby.has(pair));
      // Keep an eligible arrival pending until the current exchange/cooldown ends.
      nearby = new Set([...nearby].filter(pair => close.has(pair)));

      if (active) {
        const line = active.lines[Math.floor((now - active.since) / 4_500)];
        const a = visible.get(active.a), b = visible.get(active.b);
        if (line && a && b && Math.hypot(a.x - b.x, a.y - b.y) < 84) return line;
        if (!line) {
          memory[active.pair] = active.record;
          try { storage?.setItem(key, JSON.stringify(memory)); } catch { /* The current session still remembers. */ }
        }
        active = null;
        cooldown = now + 2_000;
      }
      if (!arrival || now < cooldown) return null;

      nearby.add(arrival);
      const [a, b] = arrival.split(':').map(Number);
      const day = dayNumber(now);
      const previous = memory[arrival];
      const count = (previous?.count ?? 0) + 1;
      const sameDay = previous?.day === day;
      const mode = !previous ? 'new' : count % 3 === 2 ? 'passing' : count % 3 === 0 ? 'resume' : 'new';
      const speaker = count % 2 ? a : b;
      const listener = speaker === a ? b : a;
      const voice = LEADERS[ids[speaker]], other = LEADERS[ids[listener]];
      const index = sameDay ? (previous.index + (mode === 'new' ? 1 : 0)) % total
        : ((day % total) * 13 + a * 9 + b) % total;
      const question = factionQuestion(speaker, index);
      const last = previous && factionQuestion(previous.speaker, previous.index);
      const lines = mode === 'passing' ? [turn(speaker, farewells[count % farewells.length](other.callSign))]
        : mode === 'resume' ? [
          turn(speaker, `About ${last.topic}, would you start in the same place next time?`),
          turn(listener, `I’d still ${other.approach}. What would your crew do first?`),
          turn(speaker, `I’d ${voice.approach}. Let’s pick it up later.`),
        ] : [
          turn(speaker, question.text),
          turn(listener, question.observation + '.'),
          turn(listener, `My first move? I’d ${other.approach}.`),
          turn(speaker, farewells[count % farewells.length](other.callSign)),
        ];
      active = { a, b, pair: arrival, since: now, lines,
        record: { day: mode === 'new' ? day : previous.day, count, index: mode === 'new' ? index : previous.index,
          speaker: mode === 'new' ? speaker : previous.speaker } };
      return lines[0];
    },
  };
}
