import { LEADERS } from '../../../js/waterfront-faction-identities.mjs?v=2';

// These are opinions and incidents written for the Year 3008 game scene.
// Keep biography references aligned with the linked roamer profiles.
const police = {
  'police-robot': ['Patrol check.', 'The queue counts from the back.', 'Statement logged. Keep the crossing clear.'],
  'police-car': ['Dispatch. Pull up by the kerb.', 'They call me the Waiting Room. I can wait.', 'Cabin’s clear. Move on when it’s safe.'],
  'police-bike': ['Rider to dispatch. Hold here a second.', 'I carry the exact words when the radio cuts out.', 'I’ve got your words. I’ll hand them over myself.'],
};

const bears = {
  'burglar-bear': ['Keep it low. The shutters have ears.', 'I work locks. The mask gives the badge a story before I open my mouth.', 'I’ve got a shutter to look at. See you round.'],
  'sailor-bear': ['Come on, mate. Out of the wind.', 'I’ve worked decks in a worse swell than this. Your little blue lights don’t impress me.', 'Tide’s changing. I’m heading back to the rail.'],
  'jamaican-bear': ['Walk with me. I’ve got a record to return.', 'I can name every lender in that record case. A bassline isn’t a bloody confession.', 'Catch me when the shops close. I’ve a side left to play.'],
  'camo-bear': ['Mind the bed. I’ve just cleared that edge.', 'That’s soil on my knees. Take your damn boots off the seedlings.', 'I’m going back to the path edges. Keep your feet on the stones.'],
  'gentleman-bear': ['A moment, if you please.', 'Describe the stitching under the handle. A title and a loud voice prove bugger all.', 'If you lose something, describe it before you ask for it. Good evening.'],
  'graff-bear': ['Watch the shirt. Some of that paint’s fresh.', 'It’s blue paint, same as the mess on my shirt. Eddie Stax taught me to credit the hands that put it there.', 'I’ve got scraps to test. Leave room for the names.'],
  'posh-bear': ['Darling, you look like somebody sold you a very bad evening.', 'I look at old tool marks through a green monocle. This suit doesn’t make me your accountant.', 'The hinge on my bench is more promising. Good night.'],
  'st-patricks-bear': ['Easy now. People are trying to get home.', 'The bakery shift gets that path first. I learned that the hard way with a parade and a lot of pissed-off bakers.', 'I’ll see you after the procession clears. Leave the bakers a way through.'],
  'straight-outta-ghetto-bear': ['What’s good? Keep it moving by the old yards.', 'I chalked that line before your lot showed up. Don’t rewrite the game because you’ve got a radio.', 'I’ve got lines to chalk. Show up before kick-off this time.'],
};

// The dealing is new game-scene fiction. Their day jobs and habits come from their bios.
const bearBusiness = {
  'burglar-bear': 'I’ve sold weed and fixed your bloody shutters. Somehow the second thing is always left out.',
  'sailor-bear': 'I’ve peddled enough weed to know the money goes fast and the shit it starts lingers.',
  'jamaican-bear': 'I’ve dealt weed, sure. Those records are borrowed. I give a damn about bringing them back.',
  'camo-bear': 'I sell weed, and I spend my mornings clearing the actual weeds. I’d rather people noticed the work.',
  'gentleman-bear': 'I’ve sold pills. I still remember the people who came looking for a mate who never showed.',
  'graff-bear': 'Dealing paid for paint once. It also paid for a fight that took months to get out of my head.',
  'posh-bear': 'I’ve sold coke in a better suit than this. It made me rich for about five bloody minutes.',
  'st-patricks-bear': 'I’ve sold weed on rough nights. I still clear the procession route when the bakery shift gets out.',
  'straight-outta-ghetto-bear': 'I’ve dealt weed. I’ve also chalked a pitch for a crew that could barely afford boots. I’m both those things.',
};

const others = {
  'electric-blue': 'Blue charge light means I’m checking the load. You can ask without grabbing the damn cable.',
  'electric-green': 'I check the return path before I close a circuit. I wish your patrol did the same.',
  boombox: 'You want a statement? Turn me down one notch and ask it on the beat.',
  samurai: 'The walkway is narrow. If you want an answer, give the next person room to pass.',
  'allcity-bulls-mech': 'Put the result where the whole crew can see it. My loader logged the time.',
  'blockstars-mech': 'Ask the crew behind the curtain. Their names belong in your bloody report.',
  'blockchain-furies-mech': 'Open a proper record. Say who was affected and what you intend to put right.',
  'graffpunks-mech': 'Look at the wall before you call it damage. The maker’s credit is right there.',
  'hodl-mech': 'I answer for the people still on the ground. Speak to them before you close the matter.',
  'hard-fork-rockers-mech': 'Bring a working alternative and I’ll test it. A flashing light is a piss-poor argument.',
  'moongirls-mech': 'I need two readings before I call that fault. Your radio gave me half of one.',
  'nomad-bears-block-mech': 'Give me a clear way back and I’ll hear you out. My weight’s no joke on that bridge.',
  'no-ball-games-mech': 'The whistle went before you pulled up. Ask the ref if you think I moved the line.',
  'graffiti-kings-mech': 'The makers signed the work. Ask them what it took before you decide what it’s worth.',
};

const speakingPoints = {
  'burglar-bear': 'Ask a locksmith straight',
  'sailor-bear': 'Give me the dockside version',
  'jamaican-bear': 'Tell me what you actually heard over the music',
  'camo-bear': 'Look at the ground before you answer',
  'gentleman-bear': 'For my ledger, if you please',
  'graff-bear': 'I want to hear it from the people on the wall',
  'posh-bear': 'Drop the sales pitch for a second',
  'st-patricks-bear': 'Think about the people getting off shift',
  'straight-outta-ghetto-bear': 'Give it to me straight from the old yards',
  'electric-blue': 'Give me a clean reading',
  'electric-green': 'Trace it back to the garden circuit',
  boombox: 'I’m turning down the bass for this',
  samurai: 'Tell me while the path is clear',
  'allcity-bulls-mech': 'Let’s put this on the results board',
  'blockstars-mech': 'Can the stage crew hear this too',
  'blockchain-furies-mech': 'For the hearing record',
  'graffpunks-mech': 'From the lift I could see the wall',
  'hodl-mech': 'Put this on the relief crew’s order sheet',
  'hard-fork-rockers-mech': 'I want an answer I can test on the bench',
  'moongirls-mech': 'Tell me what the service crew logged',
  'nomad-bears-block-mech': 'Let’s hear it before I take the load back',
  'no-ball-games-mech': 'Say it where the referee can hear',
  'graffiti-kings-mech': 'Before you paint over anybody’s name',
};

export const streetProfiles = Object.freeze({
  ...Object.fromEntries(Object.entries(police).map(([id, [hello, answer, bye]]) => [id, { role: 'police', hello, answer, bye, wiki: '/wiki/' + id + '.html' }])),
  ...Object.fromEntries(Object.entries(bears).map(([id, [hello, answer, bye]]) => [id, {
    role: 'bear', hello, answer, bye, wiki: '/wiki/' + (id === 'st-patricks-bear' ? 'st-patricks-day-bear' : id) + '.html',
  }])),
  ...Object.fromEntries(Object.entries(others).map(([id, answer]) => [id, { role: 'witness', answer }])),
  ...Object.fromEntries(Object.values(LEADERS).map(({ bio, intro, approach }, index) =>
    ['leader:' + index, { role: 'witness', wiki: bio, answer: intro, question: 'Before I go, would you ' + approach + '?' }])),
});

const cases = [
  ['the weed complaint by the lantern', 'the complaint at the lantern'],
  ['the pills rumour at East Common', 'the rumour by the market'],
  ['the row over coke at the freight quay', 'what people shouted by the freight carts'],
  ['the missing dock-shift receipt', 'the dock ledger'],
  ['the crowd at South Point bridge', 'the queue and the people still on it'],
  ['the Paint Path mark on the seawall', 'the names on the wall'],
  ['the late finish at the Hard Fork Games', 'the match and who was there'],
  ['the open path through Southwest Park', 'the footpath beside the planters'],
  ['the shouting outside the Ninth Berth', 'the noise by the repair bench'],
  ['the handover at the eastern crossing', 'what happened at the crossing'],
];

const streetTopics = [
  ['the weed rumours following us past the lantern', 'Everybody’s got an opinion about weed once a blue light turns up.'],
  ['the pills and dodgy debts people keep pinning on us', 'Pills and debts don’t make anybody ten feet tall. I’ve watched them ruin a mate.'],
  ['the coke talk outside the Berth', 'Half the quay is talking shit about coke and the other half is pretending it never heard a word.'],
  ['the heat on the docks', 'That patrol has got the whole night shift walking on eggshells.'],
  ['the old South Point route', 'Keep the bridge open. People have to live here after we’ve all fucked off.'],
  ['the Paint Path wall', 'The wall remembers a lot more than that station notebook does.'],
  ['the Hard Fork Games crowd', 'Once the whistle goes, everyone’s brave enough to tell you what really happened.'],
  ['the drama down Southwest Park', 'I’m sick of burying good evenings under somebody else’s drama.'],
  ['the repair bench at the Ninth Berth', 'The bench will still be there when the big mouths have gone home.'],
  ['the questions at the east crossing', 'I’ll answer for what I saw. The rest of the street can speak for itself.'],
];

const patrolQuestions = [
  'What did you see around', 'When did you first hear about', 'Who else saw',
  'What were you doing near', 'Can anyone confirm your account of', 'Did anyone get hurt around',
  'What changed after', 'What will the next shift need to know about', 'Who should give us a firsthand account of',
  'What did the first report get wrong about',
];
const bearQuestions = [
  'What the hell is going on with', 'What have you heard about', 'Who’s still talking about',
  'What’s your read on', 'Did anybody get hurt over', 'How much of it is bullshit about',
  'Who’s getting blamed for', 'What should we tell the crew about', 'What’s changed since you last heard about',
  'Who actually knows anything about',
];
const witnessAngles = [
  'I saw enough to say this much about', 'I’ll give you my own account of', 'You’ve heard the rumour. Ask who was there for',
  'Check the first report before you repeat the story about', 'I can tell you what I remember of', 'I’m not speaking for the whole crew about',
  'Keep the timestamp if you’re writing about', 'You’ll need another witness for the rest of', 'People still have to live here after',
  'That’s all I can put my name to about',
];

const bearAngles = [
  'Listen.', 'You want my take?', 'I’ll tell you this much.', 'I had to think about it.',
  'I heard enough last night.', 'Somebody needed to say it.', 'I’ve got one thing to add.',
  'It’s been on my mind since the lights came on.', 'Keep this between us.', 'Here’s where I stand.',
];

export const STREET_VARIANTS = cases.length * patrolQuestions.length;

export function streetExchange(speaker, listener, index) {
  const voice = streetProfiles[speaker];
  const other = streetProfiles[listener];
  const patrol = voice.role === 'police';
  const [subject, detail] = (patrol ? cases : streetTopics)[index % cases.length];
  const variation = Math.floor(index / cases.length);
  const question = (patrol ? patrolQuestions : bearQuestions)[variation] + ' ' + subject + '?';
  const reply = patrol ? witnessAngles[variation] + ' ' + detail + '.' : bearAngles[variation] + ' ' + detail;
  const counter = (other.question ?? speakingPoints[listener] + '.') + ' ' +
    bearQuestions[(variation + 3) % bearQuestions.length] + ' ' + subject + '?';
  const response = patrol ? other.answer : bearBusiness[listener];
  return [
    { actor: speaker, text: voice.hello + ' ' + question },
    { actor: listener, text: response + ' ' + reply },
    { actor: listener, text: counter },
    { actor: speaker, text: (patrol ? voice.answer + ' ' + witnessAngles[variation] + ' ' + detail + '. ' : '') + voice.bye },
  ];
}
