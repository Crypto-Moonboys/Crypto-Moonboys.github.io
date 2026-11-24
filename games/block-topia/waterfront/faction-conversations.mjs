import { LEADERS } from '../../../js/waterfront-faction-identities.mjs?v=2';

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
// Each leader writes their own questions, follow-up and exits. Keep the saved topic slots stable.
const dialogue = {
  'all-city-bulls': {
    openers: ["Who’s doing the lifting when it comes to", "What result would convince your whole crew about", "Who gets left off the results board when people talk about", "What could we put to a fair test about"],
    resume: "Give me one result we can check on",
    passing: "I’m due back with the crew. We’ll talk after the last load.",
    finishes: ["I’ll leave you to it. Bring me something the whole crew can check.", "I’ll put that to the crew. Everybody who did the work gets a say."],
  },
  'nomad-bears': {
    openers: ["Where would you send a new guide to learn about", "Who knows a second way through when it comes to", "What would you mark on a scout’s map about", "Who should we ask before we lead anyone into a decision about"],
    resume: "What did we miss on the first pass about",
    passing: "I’ve got a route to check. I’ll find you on the way back.",
    finishes: ["I’ll walk it again before I send anyone that way.", "I’ll take the long way back and see what we missed."],
  },
  'hard-fork-rockers': {
    openers: ["What’s the smallest thing we could try about", "What breaks first if we get clever about", "Who could keep things running if we changed our approach to", "Is there a working alternative nobody has tried for"],
    resume: "Could we try a smaller version of your idea about",
    passing: "I’ve got a repair waiting. Tell me the short version next time.",
    finishes: ["I’ll try it on a small scale. You’ll hear if it works.", "Leave it with me. I’ll see whether I can get a test running."],
  },
  'rugpull-miners': {
    openers: ["Who’s covering the next shift when it comes to", "What would the night crew tell us about", "Who’d sign for the work if we changed anything about", "Would the people on the clock get a fair deal out of"],
    resume: "Have you worked out who’s on the hook for",
    passing: "My shift’s starting. Save it for the break.",
    finishes: ["I’m off to clock in. We’ll talk when the handover’s done.", "I’ll check with the next shift. They’re the ones who’ll have to make it work."],
  },
  'crypto-moongirls': {
    openers: ["Who depends on things staying steady when we talk about", "What would you measure twice before changing anything about", "Whose service would feel it first if we got this wrong about", "What would the people keeping the lights on tell us about"],
    resume: "What would a second reading tell us about",
    passing: "I need to check a reading. I’ll find you when I’m done.",
    finishes: ["I’ll take another reading before we decide.", "I’ll ask the people who rely on it. They’ll spot what we missed."],
  },
  'blockchain-furies': {
    openers: ["Whose account is missing when it comes to", "What could we actually put on the record about", "Who would have to make it right if we got things wrong about", "What evidence would you want before taking a side on"],
    resume: "Can you back up what you said about",
    passing: "I’ve got someone waiting to be heard. Catch me afterwards.",
    finishes: ["I’ll keep a chair free if there’s more to put on the record.", "I’ll keep the details straight. Bring anything you can put on the record."],
  },
  'graffpunks': {
    openers: ["Whose name should be on the wall when people talk about", "What would you paint so people remember the truth about", "Who did the work before anyone started talking about", "What’s the bit nobody gets credit for when it comes to"],
    resume: "Who should get the credit for that idea about",
    passing: "I’ve got ink drying. Find me when the print’s pulled.",
    finishes: ["I’ll leave space for the names. Catch you by the wall.", "I’ll sketch it out. The people who made it get their names on it."],
  },
  'crypto-stoned-boys': {
    openers: ["What’s the quietest thing people miss about", "What would we hear if everyone stopped talking for a minute about", "What’s worth listening for when people bring up", "What detail would you keep for the night library about"],
    resume: "Did anything else come to you after we talked about",
    passing: "I’m following a sound. We can pick this up when I’m back.",
    finishes: ["I’ll sit with that a bit. Catch you when the water’s quiet.", "Bring it to the listening table sometime. I’d like to hear the whole thing."],
  },
  'blockstars': {
    openers: ["Who should have the mic when we talk about", "What would we hear from backstage about", "Who ought to get a line in the programme about", "If the person who lived it took the stage, what would they say about"],
    resume: "Who would you put on stage to tell our side of",
    passing: "I’ve got a cue coming up. Tell me after the show.",
    finishes: ["I’m due at rehearsal. I’ll save you a seat.", "I’ll find the person who lived it. They should tell it in their own words."],
  },
};
const topicSlots = 12;
const total = topics.length * topicSlots;
const dayNumber = now => Math.floor(now / 86_400_000);
const keyFor = (left, right) => [left, right].sort((a, b) => a - b).join(':');
const turn = (actor, text) => ({ actor, text });

export function factionQuestion(actor, index) {
  const offset = (index * 47 + actor * 17) % total;
  const [topic, observation] = topics[Math.floor(offset / topicSlots)];
  const { openers } = dialogue[ids[actor]];
  return { topic, observation, text: `${openers[offset % openers.length]} ${topic}?` };
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
      const voice = dialogue[ids[speaker]], other = LEADERS[ids[listener]];
      const finish = voice.finishes[day % voice.finishes.length];
      const index = sameDay ? (previous.index + (mode === 'new' ? 1 : 0)) % total
        : ((day % total) * 13 + a * 9 + b) % total;
      const question = factionQuestion(speaker, index);
      const last = previous && factionQuestion(previous.speaker, previous.index);
      const lines = mode === 'passing' ? [turn(speaker, voice.passing)]
        : mode === 'resume' ? [
          turn(speaker, `${voice.resume} ${last.topic}?`),
          turn(listener, `I’d still ${other.approach}. ${other.agenda}`),
          turn(speaker, finish),
        ] : [
          turn(speaker, question.text),
          turn(listener, question.observation + '.'),
          turn(listener, index % 2 === 0 ? other.intro : other.agenda),
          turn(speaker, finish),
        ];
      active = { a, b, pair: arrival, since: now, lines,
        record: { day: mode === 'new' ? day : previous.day, count, index: mode === 'new' ? index : previous.index,
          speaker: mode === 'new' ? speaker : previous.speaker } };
      return lines[0];
    },
  };
}
