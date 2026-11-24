import { npcVoices } from './npc-voices.mjs?v=1';

// The district events follow The Ninth Berth. Wider-world entries follow
// the public Crypto Moonboys, First Witness, and faction articles.
const lore = [
  ['the upper landing trial', 'the depot paid for one trial shift'],
  ['the garden turnout', 'the garden crew set out a temporary turnout with boards'],
  ['the shutter under the painted arrow', 'the crew put the new arrow on a removable board'],
  ['the repair bay keys', 'both custodians tried their keys in front of the shifts'],
  ['the claims table', 'Danny’s table let people describe losses out of earshot'],
  ['the gap in the broadcast', 'the gap in the record let the apprentice be heard'],
  ['the closing game', 'the bag filled the gap and the pitch line moved uphill'],
  ['Lumina’s lantern', 'the blue lantern marks a way through the harbor'],
  ['the East Common market', 'the eastern crossing gives East Common a second approach'],
  ['the seawall mural', 'the mural shares its edge with a working walkway'],
  ['the South Point crossing', 'the southern path links the old streets and the island'],
  ['the lighthouse shelter', 'Joe still wants a shelter near the lighthouse'],
  ['the Paint Path', 'marks on the Paint Path can preserve a memory or warn a walker'],
  ['the Hard Fork Games', 'the Games draw people seeking entry or recognition in Block Topia'],
  ['the Street Kingdoms', 'the people beyond Block Topia keep routes and workshops of their own'],
  ['the First Witness', 'the First Witness preserves the Covenant and different readings of it'],
  ['Block Topia’s gates', 'Block Topia has its own admission rules and service crews'],
  ['the All City Bulls and Nomad Bears', 'the Bulls and Bears are the two market factions'],
  ['the Bitcoin Kid Army', 'Alfie’s Army protects the market factions and takes its orders from GKniftyHEADS'],
  ['the HODL Warriors', 'the HODL Warriors unite crews without erasing their faction names'],
  ['the HODL X Warriors', 'Block Topia’s HODL X order answers to Queen Sarah P-fly'],
  ['the Bitcoin X Kids', 'the Bitcoin X Kids come from inside Block Topia and some leave to join Alfie’s Army'],
  ['the Sacred Chain', 'the archive houses preserve records and argue over who can keep them'],
  ['the unresolved Final Fork', 'no one here knows how the Final Fork will end'],
];
export const loreTopics = lore.map(([topic]) => topic);

const streetPlaces = [
  'the upper landing', 'the garden turnout', 'the signwriter’s shutter',
  'the repair bay', 'the claims table', 'the mixing desk',
  'the uphill pitch', 'Lumina’s lantern', 'the East Common stalls',
  'the seawall mural', 'the South Point crossing', 'the lighthouse',
  'the freight quay', 'the bakery door', 'the East Shore sheds',
  'the West Meadow plots', 'the Southwest Park benches', 'the east bridge',
  'the dock ledger', 'the handcart queue', 'the closed lower landing',
  'the shop steps', 'the slipway', 'the market approach',
];

const openings = [
  (topic, subject) => `When people bring up ${topic}, who remembers ${subject}?`,
  (topic, subject) => `How did ${topic} change ${subject} for the people there?`,
  (topic, subject) => `Before we get into ${topic}, will you tell me what you make of ${subject}?`,
  (topic, subject) => `What's your honest read on ${subject} when the subject is ${topic}?`,
  (topic, subject) => `If you had to explain ${topic} from scratch, where would you put ${subject}?`,
  (topic, subject) => `What have I missed about ${topic} if I’m still wondering about ${subject}?`,
  (topic, subject) => `Who would you trust to talk about ${subject} in the same breath as ${topic}?`,
  (topic, subject) => `Does what you’ve heard about ${topic} tell you anything about ${subject}?`,
  (topic, subject) => `Can we go over ${topic} from the point where somebody first noticed ${subject}?`,
  (topic, subject) => `Tell me straight about ${topic}: what would you want recorded about ${subject}?`,
];

const replies = [
  (topic, memory, fact) => fact ? `When I think about ${topic}, I start with the fact that ${fact} and remember how ${memory}.` : `My take on ${topic} comes from what happened here: ${memory}.`,
  (topic, memory, fact) => fact ? `It matters when we talk about ${topic} that ${fact}, and I still remember how ${memory}.` : `I come at ${topic} with this in mind: ${memory}.`,
  (topic, memory, fact) => fact ? `I see two things in ${topic}: ${fact}, and from where I stood ${memory}.` : `Here’s why I’m listening when you mention ${topic}: ${memory}.`,
  (topic, memory) => `When I hear ${topic} I think of my own shift, when ${memory}.`,
  (topic, memory) => `That puts ${topic} alongside something I actually saw: ${memory}.`,
  (topic, memory) => `The bit about ${topic} that sticks with me goes back to the day ${memory}.`,
  (topic, memory) => `I’ve got a reason for taking ${topic} seriously: ${memory}.`,
  (topic, memory) => `In all this talk about ${topic}, the one thing I can speak to is what happened when ${memory}.`,
  (topic, memory) => `There’s room to argue about ${topic}, but I remember the time ${memory}.`,
  (topic, memory) => `This is where I start with ${topic}: ${memory}.`,
];

const endings = [
  (topic, action) => `I’ll ${action} before I give ${topic} another thought.`,
  (topic, action) => `Right, before we come back to ${topic} I’m going to ${action}.`,
  (topic, action) => `Keep ${topic} in mind till we meet again because I’m off to ${action}.`,
  (topic, action) => `Put a pin in ${topic} for me while I go and ${action}.`,
  (topic, action) => `Next time ${topic} comes up, ask whether I managed to ${action}.`,
  (topic, action) => `Before I catch you again about ${topic}, I need to ${action}.`,
  (topic, action) => `We can pick up ${topic} later, once I’ve had the time to ${action}.`,
  (topic, action) => `I’ll leave you to it and ${action} before the next word about ${topic}.`,
  (topic, action) => `When I’ve had a chance to ${action}, come find me about ${topic}.`,
  (topic, action) => `Save the rest about ${topic} for next time while I go to ${action}.`,
];

const patrol = [
  (place, subject) => `Hold up and tell me what you saw at ${place} involving ${subject}?`,
  (place, subject) => `For the patrol log, who was at ${place} when you noticed ${subject}?`,
  (place, subject) => `Witness check for ${place}: where were you standing when you saw ${subject}?`,
  (place, subject) => `Can you tell me when you last passed ${place} and what you saw of ${subject}?`,
  (place, subject) => `For the record, is there somebody at ${place} who can speak to ${subject}?`,
  (place, subject) => `Before you move on, what was the first thing you noticed about ${subject} at ${place}?`,
  (place, subject) => `In my follow-up at ${place}, which part of the report about ${subject} did you actually witness?`,
  (place, subject) => `While I check this, who else was near ${place} when you heard about ${subject}?`,
  (place, subject) => `If you were there, what time did you see ${subject} near ${place}?`,
  (place, subject) => `To settle what happened at ${place}, what can you tell me about ${subject}?`,
];

const offers = [
  (p, s, drug) => `Buying ${drug} tonight, or are you just here for ${s} at ${p}?`,
  (p, s, drug) => `Anyone at ${p} looking to buy ${drug}, or is the whole damn street talking about ${s}?`,
  (p, s, drug) => `Want to buy ${drug} before we get stuck listening to the row over ${s} at ${p}?`,
  (p, s, drug) => `Say, do you buy ${drug}, or would you rather discuss ${s} at ${p} all night?`,
  (p, s, drug) => `Before someone starts up about ${s} again, fancy buying ${drug} before I leave ${p}?`,
  (p, s, drug) => `You looking to buy ${drug} while I’m here at ${p} sorting out ${s}?`,
  (p, s, drug) => `You buying ${drug}, mate, or should I head back to ${p} to see about ${s}?`,
  (p, s, drug) => `Do you want to buy ${drug} or should I get back to ${p} and deal with ${s}?`,
  (p, s, drug) => `If you’ve finished with ${s} at ${p}, are you in the mood to buy ${drug}?`,
  (p, s, drug) => `Quick one: want to buy ${drug} before someone at ${p} brings up ${s} again?`,
];

const watch = [
  (p, s) => `Were those coppers at ${p}, or was somebody making a noise about ${s}?`,
  (p, s) => `Have the police been through ${p} asking about ${s}?`,
  (p, s) => `Merde, did you see police lights by ${p} when everyone was talking about ${s}?`,
  (p, s) => `Before I go to ${p} to find out about ${s}, were any police there when you left?`,
  (p, s) => `Did somebody call the coppers to ${p} over ${s}, or am I hearing bullshit?`,
  (p, s) => `Do you know if police are still at ${p} after that business with ${s}?`,
  (p, s) => `Who saw actual coppers at ${p} while I was dealing with ${s}?`,
  (p, s) => `Do me a favour and tell me if there were police at ${p}, before I get into ${s} again?`,
  (p, s) => `Have you heard anything solid about coppers near ${p} since the trouble over ${s}?`,
  (p, s) => `Joder, was that the police I passed at ${p} or someone coming to ask about ${s}?`,
];

export const DIALOGUE_VARIANTS = loreTopics.length * openings.length;
const resumed = [
  (t, s) => `Did anything change about ${s} after we spoke about ${t}?`,
  (t, s) => `Last time we crossed paths we left ${t} hanging; where did you land on ${s}?`,
  (t, s) => `Has anyone come back to you about ${s} since we talked through ${t}?`,
  (t, s) => `I haven’t let ${t} go yet; what have you heard since about ${s}?`,
  (t, s) => `After our last word about ${t}, did you get a chance to look into ${s}?`,
  (t, s) => `What would you say differently about ${s} if we started that talk about ${t} again?`,
  (t, s) => `Can we pick up where we left ${t} and see who’s dealt with ${s}?`,
  (t, s) => `I took the long way since we spoke about ${t}; have you learnt anything new about ${s}?`,
  (t, s) => `Before we leave ${t} where it was, could we settle what to do about ${s}?`,
  (t, s) => `Last time you gave me something to think about on ${t}; has it changed your mind about ${s}?`,
];
const openerBanks = { patrol, offer: offers, watch, resume: resumed };
const streetScenes = new Set(['patrol', 'offer', 'watch', 'street']);

export function npcLine(id, phase, index, scene = 'lore') {
  const slot = index % loreTopics.length;
  const pattern = Math.floor(index / loreTopics.length);
  const topic = (streetScenes.has(scene) ? streetPlaces : loreTopics)[slot];
  const [subject, memory, action] = npcVoices[id][(slot + pattern) % npcVoices[id].length];
  if (phase === 'open') {
    const bank = Object.hasOwn(openerBanks, scene) ? openerBanks[scene] : openings;
    return bank[pattern](topic, subject, id === 'posh-bear' ? 'coke' : 'weed');
  }
  if (phase === 'middle') {
    if (scene === 'offer' || scene === 'watch') {
      const police = id.startsWith('police-');
      const reaction = scene === 'offer'
        ? police ? 'I’m logging that offer' : 'I’m passing on the deal'
        : police ? 'You’re speaking to the patrol' : 'I won’t swear to what I didn’t see';
      // Retain the in-character memory and say the explicit reaction as a
      // varied clause, without a stock stand-alone sentence in every turn.
      const line = replies[pattern](topic, memory);
      return `${line.slice(0, -1)}, and ${reaction}.`;
    }
    return replies[pattern](topic, memory, streetScenes.has(scene) ? undefined : lore[slot][1]);
  }
  return endings[pattern](topic, action);
}

const personaOffset = Object.fromEntries(Object.keys(npcVoices).map((id, index) => [id, index % openings.length]));

const STORAGE_KEY = 'waterfront.npc-dialogue.v1';

export function createNpcDialogue(storage) {
  const cursors = new Map();
  try {
    for (const [key, next] of Object.entries(JSON.parse(storage?.getItem(STORAGE_KEY)) ?? {})) {
      if (Number.isSafeInteger(next) && next >= 0 && next < DIALOGUE_VARIANTS) cursors.set(key, next);
    }
  } catch { /* A blocked or damaged save can still play in memory. */ }

  return {
    take(id, phase, scene, topic, seed = 0) {
      const fixedTopic = topic !== undefined;
      // Offer and lookout sounds have different openings and replies.
      // Plain replies and exits share their history across street scenes.
      const voiceBank = phase === 'end' || (phase === 'middle' && scene === 'patrol')
        ? streetScenes.has(scene) ? 'street' : 'lore' : scene;
      const key = [id, phase, voiceBank, fixedTopic ? topic : 'all'].join('/');
      const size = fixedTopic ? openings.length : DIALOGUE_VARIANTS;
      const cursor = (cursors.get(key) ?? seed) % size;
      cursors.set(key, (cursor + 1) % size);
      // Move through the whole bank before repeating. Responders rotate
      // independently on the same topic even when meeting different speakers.
      const index = fixedTopic ? topic + ((cursor + personaOffset[id]) % openings.length) * loreTopics.length : (cursor * 37) % size;
      return { topic: index % loreTopics.length, text: npcLine(id, phase, index, scene) };
    },
    save() {
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cursors))); } catch { /* Optional storage. */ }
    },
  };
}

export function createCrewSpeech(dialogue) {
  let lastExchange = -1;
  let lines;
  return elapsed => {
    const turn = Math.floor((elapsed ?? 0) / 12);
    if (turn % 4 === 3) return null;
    const exchange = Math.floor(turn / 4);
    if (exchange !== lastExchange) {
      const speaker = exchange % 2;
      const partner = 1 - speaker;
      const opening = dialogue.take('crew:' + speaker, 'open', 'lore');
      lines = [
        { speaker, text: opening.text },
        { speaker: partner, text: dialogue.take('crew:' + partner, 'middle', 'lore', opening.topic).text },
        { speaker, text: dialogue.take('crew:' + speaker, 'end', 'lore', opening.topic).text },
      ];
      lastExchange = exchange;
      dialogue.save();
    }
    return lines[turn % 4];
  };
}
