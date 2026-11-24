import { npcVoices } from './npc-voices.mjs?v=1';

const police = ['police-bike', 'police-car', 'police-robot'];
const bears = [
  'burglar-bear', 'sailor-bear', 'jamaican-bear', 'camo-bear', 'gentleman-bear',
  'graff-bear', 'posh-bear', 'st-patricks-bear', 'straight-outta-ghetto-bear',
];

export const streetProfiles = Object.freeze(Object.fromEntries(
  Object.keys(npcVoices).filter(id => !id.startsWith('crew:')).map(id => [
    id, police.includes(id) ? 'police' : bears.includes(id) ? 'bear' : 'neighbor',
  ]),
));

export function streetExchange(dialogue, speaker, listener, scene) {
  const opening = dialogue.take(speaker, 'open', scene);
  const topic = opening.topic;
  const closer = scene === 'offer' && streetProfiles[listener] === 'police' ? listener : speaker;
  const turns = [
    { actor: speaker, text: opening.text },
    { actor: listener, text: dialogue.take(listener, 'middle', scene, topic).text },
    { actor: speaker, text: dialogue.take(speaker, 'middle', scene === 'offer' || scene === 'watch' ? 'street' : scene, topic).text },
    { actor: closer, text: dialogue.take(closer, 'end', scene, topic).text },
  ];
  dialogue.save();
  return turns;
}
