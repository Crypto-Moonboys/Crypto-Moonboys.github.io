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

// Opening lines belong to the bear, regardless of who happens to pass.
const bearApproaches = {
  'burglar-bear': ['Fancy buying some weed, or am I talking to a fucking shutter?', 'Did you see the police? Got a bad feeling in my gut.'],
  'sailor-bear': ['Want to buy some weed before you piss off for the night, mate?', 'You seen any coppers, or was that just a light off the water?'],
  'jamaican-bear': ['You buying weed tonight? Say so before the next record goes on.', 'Did you see the police, or is somebody talking shit over the bass again?'],
  'camo-bear': ['Want to buy some weed? Mind the bloody seedlings while you decide.', 'Any police about? I’m trying to get through one fucking shift in peace.'],
  'gentleman-bear': ['Would you care to buy some weed? You may say no without making a bloody speech.', 'Have you seen the police this evening? I’ve had enough of their bureaucratic bollocks.'],
  'graff-bear': ['You want to buy weed or just stand there watching the fucking paint dry?', 'You seen the police looking at the wall? Merde, I’ve only just got the colour right.'],
  'posh-bear': ['Looking to buy coke, darling? Don’t make me stand here like a spare prick.', 'Did you see the police? I refuse to spend another evening listening to that cabrón on the radio.'],
  'st-patricks-bear': ['Are you buying weed tonight, or have I just interrupted a perfectly good piss-up?', 'Seen the police? Shite, I hope they leave the bakers a way home this time.'],
  'straight-outta-ghetto-bear': ['You buying weed or just wasting my fucking time?', 'You clock the police anywhere? I’ve had enough of that bullshit today.'],
};

const bearReplies = {
  'police-robot': ['I am the patrol you just offered drugs to. This is now a stop.', 'Look at the lamp, then look at my badge. Yes, you have seen the police.'],
  'police-car': ['Dispatch, log that. I just heard a drug offer through the window.', 'You’re talking to the Waiting Room. Pull back from the kerb while I check in.'],
  'police-bike': ['You just offered drugs to a police rider. I’ll be handing those exact fucking words over.', 'You’re looking at a rider on duty. I can carry that question to dispatch myself.'],
  'burglar-bear': ['I’ve had enough weed talk. I’d rather get paid for fixing one bloody lock.', 'I saw a badge reflected in a shutter. Could’ve been the same bastard twice.'],
  'sailor-bear': ['No. I’ve got deck work and I need my head on straight.', 'I saw lights over the rail. Don’t ask me to swear they were police.'],
  'jamaican-bear': ['Pass. I’m trying to return borrowed records without another load of shit kicking off.', 'I heard a radio cut across the music. The record was louder.'],
  'camo-bear': ['Leave it. People already think every damned plant I touch is weed.', 'Someone in uniform came by. I asked them to watch the beds. They didn’t.'],
  'gentleman-bear': ['That is a generous offer and a bloody terrible idea. I decline.', 'A badge asked for a lost bag. I asked him to describe it first.'],
  'graff-bear': ['Merde, I’ve spent enough on paint tonight. Forget the weed.', 'They asked who signed the wall. I gave them the makers’ names and fuck all else.'],
  'posh-bear': ['I’ve done enough coke to know the hangover costs more than the suit. No, darling.', 'I saw somebody flash a badge. It was tarnished as hell.'],
  'st-patricks-bear': ['Feck, I’ve got a procession to clear. Put me down for a clean head.', 'A patrol asked about the parade. I told them which people still needed to get home.'],
  'straight-outta-ghetto-bear': ['Nah. I’ve got a game to get ready and I’m done with that shit tonight.', 'One patrol came through and stood on my fucking touchline. Hard to miss.'],
  'electric-blue': ['I run on charge. Get that shit away from my contacts.', 'I caught a lamp spike. My meter doesn’t read insignia.'],
  'electric-green': ['I’m checking a moisture post. Whatever that is, keep it off the circuit.', 'Saw a blue glare in the garden lights. Could’ve been anything.'],
  boombox: ['Non, putain. I’m carrying records. Ask somebody who takes requests.', 'I heard a siren in the mix. That’s all I’m putting on tape.'],
  samurai: ['No. My job is to walk somebody home with their freight intact.', 'I passed a patrol. My attention was on the carrier I was escorting.'],
  'allcity-bulls-mech': ['Tell the crew why the timer stopped if you’re going to pitch that shit here.', 'Check the board. I time loads and clearances, not cops.'],
  'blockstars-mech': ['Fuck that. I’ve got a show to light and a crew to pay.', 'A radio interrupted rehearsal. Ask the stage crew what they actually heard.'],
  'blockchain-furies-mech': ['Leave me out of it. A shit deal turns into paperwork for people who never agreed to it.', 'Put what you witnessed on record. Guessing at a uniform won’t help anybody.'],
  'graffpunks-mech': ['Scheiße, I asked for paint. Take the rest off the platform.', 'I saw a lamp from the lift. I was busy keeping the wall crew safe.'],
  'hodl-mech': ['I’m carrying relief supplies. Get your shit out of the way.', 'If it mattered to the relief shift, someone will have put it on the order sheet.'],
  'hard-fork-rockers-mech': ['Nah. I need a working bearing, not another bloody problem.', 'I heard a buzz by the bench. Half the tools here make the same racket.'],
  'moongirls-mech': ['No. I’m bringing clean containers to the service crew. Keep your drugs to yourself.', 'I logged who received the supplies. I didn’t log every badge that walked past.'],
  'nomad-bears-block-mech': ['No thanks. This thing’s heavy enough without a pilot making stupid decisions.', 'I saw lights above the trail. Let me set the load down and I’ll think.'],
  'no-ball-games-mech': ['Fuck off with that. Ask me about a fixture if you want me to stop.', 'Somebody in uniform crossed after the whistle. Ask the ref.'],
  'graffiti-kings-mech': ['Joder, I’m here with signwriters. Give the damn lettering some room.', 'I saw lights over the mural supplies. The people working at ground level saw more.'],
  'leader:0': ['No. If I can’t put it on the results board, don’t pitch it to my crew.', 'I kept time on the work. I didn’t keep a tally of every bloody patrol.'],
  'leader:1': ['No. I need a clear head and a way home.', 'I saw lights off the water. Walk it twice before you swear what they were.'],
  'leader:2': ['Fuck that. I’ve got a repair bench to run.', 'A radio cut into Thursday noise. Might’ve been through the wall.'],
  'leader:3': ['Nah. I’ve got wages to sign off and no time for your shit.', 'Somebody with a badge asked for a receipt. I asked whose shift they were covering.'],
  'leader:4': ['No. I still have a waterline reading to take.', 'I saw a flash. I’ll call it a patrol when I’ve checked it twice.'],
  'leader:5': ['Keep that off my table. I use it to hear people who actually need something.', 'I can tell you what was put on record. The rest is hearsay.'],
  'leader:6': ['Merde, I asked who painted the wall. I didn’t ask for a bag.', 'They could’ve asked who signed it. Instead I heard a radio and a load of bullshit.'],
  'leader:7': ['Nah. I’m listening for something quieter tonight.', 'I heard the tyres before I saw any lights. That’s all I know.'],
  'leader:8': ['I’m running rehearsal, darling. I don’t need another fucking scene.', 'If you want the whole story, ask whoever was working backstage.'],
};

const approachSettings = [
  'by the lantern', 'at the east crossing', 'at the seawall', 'on the South Point bridge',
  'outside the Ninth Berth', 'around East Common', 'near the old yards', 'by Southwest Park',
  'near the cargo carts', 'along the meadow path', 'by the match entrance', 'down at the quay',
];

const offerFollowups = [
  'Are you interested', 'Should I take that look as a no', 'Have I got the wrong person',
  'Are you actually buying', 'Should I leave it', 'Are you just here to talk',
  'Have you already had enough', 'Have you got your hands full', 'Am I interrupting your shift',
  'Are you trying to get home',
];
const watchFollowups = [
  'Did anybody in uniform come through', 'Did a patrol hang about', 'Anyone flash a badge',
  'Did you hear a radio', 'Did you see a roof lamp', 'Was that noise a siren',
  'Did the rider stop', 'Did the bot come past', 'Did the police car pull up',
  'Did anybody wearing a badge stop to talk',
];
const offerReplies = [
  'I’ve got work to finish', 'People are trying to get home', 'You’ve got the wrong fucking person',
  'I don’t need the drama', 'I’ve already got enough shit to carry', 'I’ve got people waiting',
  'I’m done talking about that', 'You can give it a bloody rest', 'I need my head straight',
  'Verdammt, let me get on with my night',
];
const watchReplies = [
  'There’s been enough rumour for one night', 'Half the street heard it differently',
  'I only noticed the noise', 'Ask someone who was there the whole time', 'I wasn’t the only one there',
  'Putain, I’ve heard three versions already', 'I was looking the other way', 'Someone else was there before me',
  'I was busy with my own shit', 'That’s as much as I’m willing to say',
];

export const BEAR_VARIANTS = approachSettings.length * offerFollowups.length * 2;

function bearApproach(speaker, listener, index) {
  const mode = index % 2;
  const setting = approachSettings[Math.floor(index / 2) % approachSettings.length];
  const pattern = Math.floor(index / (approachSettings.length * 2));
  const followup = (mode ? watchFollowups : offerFollowups)[pattern];
  const reply = (mode ? watchReplies : offerReplies)[pattern];
  const stopped = !mode && streetProfiles[listener].role === 'police';

  return [
    { actor: speaker, text: bearApproaches[speaker][mode] + ' ' + followup + ' ' + setting + '?' },
    { actor: listener, text: bearReplies[listener][mode] + ' ' + reply + ' ' + setting + '.' },
    { actor: stopped ? listener : speaker, text: streetProfiles[stopped ? listener : speaker].bye },
  ];
}

export const STREET_VARIANTS = cases.length * patrolQuestions.length;

export function streetExchange(speaker, listener, index) {
  const voice = streetProfiles[speaker];
  if (voice.role === 'bear') return bearApproach(speaker, listener, index);
  const other = streetProfiles[listener];
  const [subject, detail] = cases[index % cases.length];
  const variation = Math.floor(index / cases.length);
  const question = patrolQuestions[variation] + ' ' + subject + '?';
  const reply = witnessAngles[variation] + ' ' + detail + '.';
  const counter = (other.question ?? speakingPoints[listener] + '.') + ' ' +
    bearQuestions[(variation + 3) % bearQuestions.length] + ' ' + subject + '?';
  return [
    { actor: speaker, text: voice.hello + ' ' + question },
    { actor: listener, text: other.answer + ' ' + reply },
    { actor: listener, text: counter },
    { actor: speaker, text: voice.answer + ' ' + reply + ' ' + voice.bye },
  ];
}
