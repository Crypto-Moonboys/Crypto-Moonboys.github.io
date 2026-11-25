// Short answers derived from the linked public wiki. Add exact aliases for
// the same intent. Compound questions and requests for new fiction use chat.
const entries = [
  {
    names: ['crypto moonboys', 'moonboys', 'the crypto moonboys project'],
    reply: 'Crypto Moonboys is the Graffiti Kings creator brand and the name for the characters in its shared fantasy world. Real people create and play those characters. In the Year 3008 story, the All City Bulls and Nomad Bears embody the two sides of the crypto market.',
    source: 'crypto-moonboys',
    title: 'Crypto Moonboys',
  },
  {
    names: ['all city bulls', 'allcity bulls'],
    reply: 'The All City Bulls embody the bullish side of the market. They make achievement public through contests, champions and visible records. Their drive to rank everything can crowd out people whose work is harder to measure.',
    source: 'the-allcity-bulls',
    title: 'The AllCity Bulls',
  },
  {
    names: ['nomad bears', 'nomad bares'],
    reply: 'The Nomad Bears embody the bearish side of the market. They are wanderers, artists and couriers whose knowledge of damaged routes connects fragile refuges. Stories about immunity to NULL are uncertain.',
    source: 'the-nomad-bears',
    title: 'The Nomad Bears',
  },
  {
    names: ['market factions', 'two market factions', 'two main factions', 'bulls and bears', 'who protects the bulls and bears'],
    reply: 'The All City Bulls and Nomad Bears are the two main market factions. Members of both are shadowed around the clock by the undercover guards of the Bitcoin Kid Army.',
    source: 'crypto-moonboys',
    title: 'Crypto Moonboys',
  },
  {
    names: ['bitcoin kid army', 'who leads the bitcoin kid army', 'who commands the bitcoin kid army', 'who runs the bitcoin kid army', 'is the bitcoin kid army a faction'],
    reply: 'Alfie Blaze leads the Bitcoin Kid Army and takes orders only from GKniftyHEADS. It is a military force for the crypto market, protecting the Bulls and Bears undercover. It holds no GK street-faction seat.',
    source: 'bitcoin-kid-army',
    title: 'Bitcoin Kid Army',
  },
  {
    names: ['alfie blaze', 'alfie bitcoin kid blaze', 'alfie the bitcoin kid blaze', 'bitcoin kid', 'who does alfie take orders from', 'who does alfie blaze answer to'],
    reply: 'Alfie “The Bitcoin KiD” Blaze is an escaped rebel, teacher and leader of the Bitcoin Kid Army. He takes orders only from GKniftyHEADS. His reputation gives the outside Bitcoin Kids a rallying point, and the story questions how much a free movement should depend on one leader.',
    source: 'alfie-bitcoin-kid-blaze',
    title: 'Alfie “The Bitcoin KiD” Blaze',
  },
  {
    names: ['gkniftyheads', 'gk niftyheads', 'immortal architects', 'who commands the gk factions'],
    reply: 'In Year 3008, GKniftyHEADS are the underworld authority above the Bulls, Bears and the other GK factions. They are also called the Immortal Architects, keepers of fragmented records. The real-world name is used for the creator and character identity foundation.',
    source: 'gkniftyheads',
    title: 'GKniftyHEADS',
  },
  {
    names: ['forty factions', 'political forty', 'how many gk factions are there', 'how many factions are in the forty'],
    reply: 'The political Forty consists of GKniftyHEADS, the two market factions and 37 other GK factions. The Bitcoin Kid Army and the collective HODL Warriors muster add no seats.',
    source: 'crypto-moonboys',
    title: 'Crypto Moonboys',
  },
  {
    names: ['hodl warriors', 'hodl warrior army', 'is hodl warriors a faction', 'are the hodl warriors a faction'],
    reply: 'In Year 3008, the HODL Warriors are an underworld army formed when members of the GK factions muster together. They keep their own faction identities. Their aspiration is service in Block Topia’s HODL X order.',
    source: 'hodl-warriors',
    title: 'HODL Warriors',
  },
  {
    names: ['hodl x warriors', 'hodl x warrior', 'hodl warriors and hodl x warriors', 'what is the difference between hodl warriors and hodl x warriors', 'are hodl warriors and hodl x warriors the same'],
    reply: 'The HODL X Warriors are Block Topia’s champion and service order under Queen Sarah P-fly and her Crypto Moongirls army. The HODL Warriors are the united GK underworld army. Their members aspire to the X order, and the title has to be earned.',
    source: 'hodl-x-warriors',
    title: 'HODL X Warriors',
  },
  {
    names: ['bitcoin kids', 'outside bitcoin kids'],
    reply: 'The Bitcoin Kids are the outside community associated with Alfie Blaze, including people who escaped Block Topia. The Bitcoin X Kids are the city’s engineered generation, and enlistment in Alfie’s Army is a separate step.',
    source: 'bitcoin-kids',
    title: 'Bitcoin Kids',
  },
  {
    names: ['bitcoin x kids', 'bitcoin x kid', 'bitcoin kids and bitcoin x kids', 'what is the difference between bitcoin kids and bitcoin x kids'],
    reply: 'The Bitcoin X Kids are the generation engineered inside Block Topia. Some escape and join the Bitcoin Kid Army. The wider outside Bitcoin Kids community and enlisted Army service are distinct.',
    source: 'bitcoin-x-kids',
    title: 'Bitcoin X Kids',
  },
  {
    names: ['queen sarah p fly', 'queen sarah pfly', 'queen sarah', 'who rules block topia', 'who runs block topia'],
    reply: 'Queen Sarah P-fly rules Block Topia in Year 3008 with her Crypto Moongirls army. The city’s infrastructure keeps people alive, and much of her conflict with the outside world concerns how far that gives her the right to control identity, movement and family life.',
    source: 'queen-sarah-p-fly',
    title: 'Queen Sarah P-fly',
  },
  {
    names: ['crypto moongirls', 'crypto moon girls', 'moongirls'],
    reply: 'The Crypto Moongirls are a female-led governing and military culture at the heart of Block Topia. Their institutions keep services working and exercise power over who can belong, serve or leave.',
    source: 'the-crypto-moongirls',
    title: 'The Crypto Moongirls',
  },
  {
    names: ['block topia', 'blocktopia', 'block topia city'],
    reply: 'Block Topia is the fortified city that grew from the Queens secure region after the World Chain collapse. Its government keeps farms, air and power working, and uses that achievement to justify control over movement and identity.',
    source: 'block-topia',
    title: 'Block Topia',
  },
  {
    names: ['true bitcoin fork', 'block topia true bitcoin fork'],
    reply: 'Block Topia uses the True Bitcoin Fork to anchor law, identity and permission inside the city. An entry in that system can determine who is recognised and what they can access.',
    source: 'block-topia',
    title: 'Block Topia',
  },
  {
    names: ['street kingdoms', 'street kingdom'],
    reply: 'The Street Kingdoms are communities beyond Block Topia that maintain their own routes, work and systems of authority. Power can sit with workshops, household networks or the crews responsible for a crossing.',
    source: 'street-kingdoms',
    title: 'Street Kingdoms',
  },
  {
    names: ['squeaky pinks'],
    reply: 'The Squeaky Pinks enforce Block Topia’s order. Their conspicuous uniforms make the city’s authority visible at gates, checkpoints and receiving yards. The stories examine how their discretion can turn inspection into coercion.',
    source: 'the-squeaky-pinks',
    title: 'The Squeaky Pinks',
  },
  {
    names: ['hard fork games', 'hardfork games'],
    reply: 'The Hard Fork Games are Block Topia’s recurring Year 3008 competition and recruitment institution. The city summons candidates seeking status or access. The gathering also reveals outsiders to the Authority and gives rebels a rare way inside.',
    source: 'hard-fork-games',
    title: 'Hard Fork Games',
  },
  {
    names: ['hard fork rockers', 'hardfork rockers', 'what do the hard fork rockers stand for'],
    reply: 'The Hard Fork Rockers seek a break with systems they believe cannot be repaired into freedom. Their culture mixes punk performance, experimental engineering and rescue work. Their stories ask who ends up paying for revolutionary choices.',
    source: 'the-hard-fork-rockers',
    title: 'The Hard Fork Rockers',
  },
  {
    names: ['mosh pit networks', 'mosh pit network'],
    reply: 'The Mosh Pit Networks are spaces where the Hard Fork Rockers can grow alternatives outside established systems. They appear in a culture that combines experimental engineering, performance and rescue work.',
    source: 'the-hard-fork-rockers',
    title: 'The Hard Fork Rockers',
  },
  {
    names: ['rugpull miners', 'rug pull miners'],
    reply: 'The Rugpull Miners profit by turning shared trust into private gain. Their stories follow the unpaid workers, ruined ventures and arguments over restitution left behind when promoters move on.',
    source: 'the-rugpull-miners',
    title: 'The Rugpull Miners',
  },
  {
    names: ['blockchain furies', 'blockchain fury faction'],
    reply: 'The Blockchain Furies investigate fraud and abusive power and try to reverse gains made through betrayal. Their stories test when anger helps repair a wrong and when certainty moves ahead of the evidence.',
    source: 'the-blockchain-furies',
    title: 'The Blockchain Furies',
  },
  {
    names: ['graffpunks', 'graff punks', 'paint path'],
    reply: 'The Year 3008 GraffPUNKS carry the Paint Path through the Street Kingdoms, using public marks to carry warnings and keep memory visible. The real-world GraffPUNKS brings together graffiti, music, publishing and digital art.',
    source: 'graffpunks',
    title: 'GraffPUNKS',
  },
  {
    names: ['crypto stoned boys', 'cryptostoned boys', 'stoned boys'],
    reply: 'The Crypto Stoned Boys are Year 3008 philosophers and satirists. They question the pursuit of status and control, and their stories ask when reflection becomes a way of leaving the work to someone else.',
    source: 'the-crypto-stoned-boys',
    title: 'The Crypto Stoned Boys',
  },
  {
    names: ['blockstars', 'block stars', 'final broadcast'],
    reply: 'The Blockstars turn performance and broadcasting into cultural power. Their stories ask whether attention preserves a voice or replaces what happened with a better-selling version. The Final Broadcast is their imagined answer to being forgotten.',
    source: 'the-blockstars',
    title: 'The Blockstars',
  },
  {
    names: ['null the prophet', 'null prophet', 'antichain', 'what does null do'],
    reply: 'NULL THE PROPHET is the name given to the Antichain threat. It can sever the link between a record and the person, place or obligation it should identify. Accounts disagree about where NULL came from and what it is.',
    source: 'null-the-prophet',
    title: 'NULL THE PROPHET',
  },
  {
    names: ['hodl wars', 'year 3008', '3008', 'when is the main saga set', 'what year is the moonboys story set in'],
    reply: 'Year 3008 is the main HODL WARS era. The saga follows a divided coalition facing NULL, with crises at North Sluice, the Borough Exchange and Holdfast. The public story leaves the Final Fork unresolved.',
    source: 'hodl-wars',
    title: 'HODL WARS',
  },
  {
    names: ['final fork', 'who wins the final fork', 'how does the final fork end', 'has the final fork happened'],
    reply: 'The Final Fork remains unresolved in the public Year 3008 story. Different traditions offer prophecies or imagined futures, and those are attributed accounts.',
    source: 'hodl-wars',
    title: 'HODL WARS',
  },
  {
    names: ['north sluice', 'north sluice stand', 'what happened at north sluice'],
    reply: 'The North Sluice crisis centres on keeping crossings open. Bitcoin Kid Army work, HODL support and HODL X personnel overlap, with each force retaining its own role.',
    source: 'hodl-wars',
    title: 'HODL WARS',
  },
  {
    names: ['white shutter', 'open crate bargain', 'what happened at the borough exchange'],
    reply: 'The White Shutter closes the Borough Exchange for nine days, disrupting supplies, work and households. The Open Crate bargain reopens passage through a compromise between the city and outside communities.',
    source: 'hodl-wars',
    title: 'HODL WARS',
  },
  {
    names: ['holdfast', 'sena rill', 'what happened at holdfast'],
    reply: 'At Holdfast, Sena Rill’s responsive fragment falls silent. Her earlier words survive, but the exchange her family depended on does not return.',
    source: 'hodl-wars',
    title: 'HODL WARS',
  },
  {
    names: ['first witness', 'nine books', 'first witness covenant'],
    reply: 'The First Witness is the inherited Covenant commonly treated as scripture in Year 3008. Its accepted origin is the 2030 Great Concord, whose early Covenant was witnessed by Bitcoin. The nine Books are inherited by communities that disagree about how to live by them.',
    source: 'the-first-witness',
    title: 'The First Witness',
  },
  {
    names: ['great concord', 'great concord 2030', 'what happened in 2030', 'when was the great concord'],
    reply: 'In 2030, people from different traditions established a common Covenant at the Great Concord. Bitcoin witnessed an early version. The later Great Consensus and the 2040 SAM Reset are separate events and traditions.',
    source: 'first-witness-master-chronology',
    title: 'First Witness Master Chronology',
  },
  {
    names: ['great consensus', 'divine lineage'],
    reply: 'The Great Consensus is a religious tradition whose adherents read the Aether-Chain as divine resonance and name Denise, Etherstan III and Tracey Vara as a sacred lineage. Its promised synchronization is a sectarian vision.',
    source: 'great-consensus',
    title: 'The Great Consensus',
  },
  {
    names: ['sacred chain', 'aether chain', 'sacred fork', 'when was the sacred fork'],
    reply: 'The Sacred Chain, also called the Aether-Chain, is a tradition of preserving memory and proof, including the First Witness Covenant. The Sacred Fork is undated and distinct from the World Chain’s 2880 Triple Fork.',
    source: 'sacred-chain',
    title: 'The Sacred Chain',
  },
  {
    names: ['world chain', 'triple fork', 'world chain triple fork', 'what happened in 2880', 'when was the triple fork'],
    reply: 'In 2880, the World Chain fractured at the Triple Fork. Chainfire and the Great Unravelling followed as systems for identity, ownership and public authority stopped agreeing.',
    source: 'first-witness-master-chronology',
    title: 'First Witness Master Chronology',
  },
  {
    names: ['agent sam', 'hyrosam', 'samuel blake', 'samuel hyrosam blake'],
    reply: 'Fictional Agent SAM is Samuel “HyroSAM” Blake, a GraffPUNK whose story links train painting, his South Croydon household and the digital guardian known to the House of Rackinsats. The accepted chronology places his upload in 2036.',
    source: 'agent-sam',
    title: 'Agent SAM',
  },
  {
    names: ['jodie zoom 2000', 'jodie zoom', 'jodie zoom2000'],
    reply: 'Jodie ZOOM 2000 grew up around murals and her mother’s painted resistance. Her story follows her escape with Aleema and her use of dream-glyphs and painted doors as contested routes.',
    source: 'jodie-zoom-2000',
    title: 'Jodie ZOOM 2000',
  },
  {
    names: ['lady ink', 'ladyink'],
    reply: 'Lady-INK is the fictional artist of permanent record. Her Echo-Ink murals resist erasure, and her story asks how an artist can keep a mark alive while leaving others free to correct it.',
    source: 'lady-ink',
    title: 'Lady-INK',
  },
  {
    names: ['whisper codex', 'operation echo', 'omega hash'],
    reply: 'The Whisper Codex is a GraffPUNK tradition about leaving a cultural mark in the next universe. Its believers organise work around Operation Echo. There is no authenticated complete original, and its promised outcome is unconfirmed.',
    source: 'whisper-codex',
    title: 'Whisper Codex',
  },
  {
    names: ['dream sovereign', 'child of the shard cycle'],
    reply: 'The Dream Sovereign is a disputed nightmare power. In the Child of the Shard cycle, fear and nightmare machinery threaten to trap a child’s possible future. Other accounts give the Sovereign different origins.',
    source: 'dream-sovereign',
    title: 'Dream Sovereign',
  },
  {
    names: ['forty paths', 'first witness forty paths'],
    reply: 'The Forty Paths are different survival cultures and institutions reading the same inherited Covenant through their own histories. The cultural readings and the political Forty serve different purposes.',
    source: 'first-witness-forty-paths',
    title: 'First Witness Forty Paths',
  },
  {
    names: ['concordance of broken records', 'first witness concordance'],
    reply: 'The Concordance records disagreements between the surviving accounts and shows what the current canon accepts. It is where to look when two histories give different dates or details.',
    source: 'first-witness-concordance',
    title: 'First Witness Concordance',
  },
];

const byName = new Map(entries.flatMap(entry => entry.names.map(name => [name, entry])));

export function localClanCanonReply(normalizedQuestion) {
  const question = normalizedQuestion.replace(/^(?:hello|hi|hey|yo) /, '').replace(/^please /, '').replace(/ please$/, '');
  const topic = question.replace(/^(?:(?:who|what) (?:is|are|was|were)|tell me about|explain|define) /, '').replace(/^the /, '');
  const entry = byName.get(question) ?? byName.get(topic);
  if (!entry) return null;
  const { reply, source, title } = entry;
  return { ok: true, reply, sources: [{ title, path: '/wiki/' + source + '.html' }] };
}
