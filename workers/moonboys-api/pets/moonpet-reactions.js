const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const ACTIVITY_LABELS = Object.freeze({
  status: 'checking in', adopt: 'meeting you', feed: 'feeding time', play: 'playtime', clean: 'getting clean', sleep: 'sleep',
  train: 'training', job: 'the job', daily: 'the daily chest', event: 'this encounter', boss: 'the boss fight', evolution: 'evolving',
  item: 'using the item', activity_start: 'the new activity', activity_claim: 'finishing the activity', activity_cancel: 'changing plans',
  trade_win: 'the winning trade', trade_loss: 'the lost trade', rename: 'the new name', purchase: 'the new equipment', run: 'the Moon Run',
  extract: 'the extraction', adventure: 'the adventure', arena: 'the arena', kaiju: 'the Kaiju battle', achievement: 'the achievement',
  season: 'the season reward', generic: 'what comes next',
});

const activities = {
  status: [
    'Your Moonpet meets your eyes, waiting to see what the two of you do next.',
    'A familiar little look says your Moonpet is glad you checked in.',
    'Your Moonpet gives you a careful once-over, as if checking your stats too.',
    'For a quiet second, your Moonpet simply enjoys having you nearby.',
  ],
  adopt: [
    'The Moon Egg gives one brave wobble. Something inside already knows your voice.',
    'A tiny pulse of moonlight answers your touch; your shared story has started.',
    'The shell leans toward you as though it has already chosen its person.',
    'Your new Moonpet cannot speak yet, but the excited tapping says enough.',
  ],
  feed: [
    'Your Moonpet inspects the food for exactly one second before diving in.',
    'A satisfied little sound follows every bite of feeding time.',
    'Your Moonpet saves the best bite until last, then guards it dramatically.',
    'The empty bowl receives a hopeful second inspection.',
  ],
  play: [
    'Your Moonpet launches into playtime like this was the plan all along.',
    'One game becomes three before your Moonpet is willing to stop.',
    'Your Moonpet invents a new rule halfway through and acts as if you forgot it.',
    'A victorious bounce declares your Moonpet the undisputed playtime champion.',
  ],
  clean: [
    'Your Moonpet complains about getting clean, then admires the result.',
    'The last stubborn patch of alley dust finally gives up.',
    'Your Moonpet shakes off one final droplet directly toward you.',
    'Fresh, polished and pretending the whole clean was its own idea.',
  ],
  sleep: [
    'Your Moonpet circles its sleeping spot twice and settles with a long sigh.',
    'A sleepy chirp fades into the soft rhythm of moonlit dreams.',
    'Your Moonpet fights sleep for a heroic three seconds, then loses.',
    'One eye stays open until it is certain you are still nearby.',
  ],
  train: [
    'Your Moonpet resets its stance and asks for one more training round.',
    'The first attempt is messy; the second already looks deliberate.',
    'Your Moonpet studies your reaction, corrects the move and tries again.',
    'Training ends, but your Moonpet quietly rehearses the footwork once more.',
  ],
  job: [
    'Your Moonpet treats the job like its reputation is written on the result.',
    'The shift is finished, and your Moonpet proudly checks what it brought home.',
    'Your Moonpet finds a rhythm, keeps its head down and completes the job properly.',
    'A tired but satisfied look says honest work was worth doing.',
  ],
  daily: [
    'Your Moonpet nudges the daily chest open and peers into the glow.',
    'The daily reward gets a pleased nod before being tucked safely away.',
    'Your Moonpet was definitely waiting for the sound of this chest unlocking.',
    'Another day, another small piece of the journey banked together.',
  ],
  event: [
    'Your Moonpet studies this encounter, then looks to you for the final call.',
    'Something about this encounter has your Moonpet completely alert.',
    'Your choice earns a thoughtful look that your Moonpet will remember.',
    'Your Moonpet checks every exit before committing to the encounter.',
  ],
  boss: [
    'Your Moonpet squares up to the boss and refuses to look away.',
    'The boss is enormous; your Moonpet steps forward anyway.',
    'Your Moonpet watches the boss for one weakness, then spots another.',
    'A low determined growl says this boss has its full attention.',
  ],
  evolution: [
    'New power settles into place while your Moonpet tests every changed movement.',
    'Your Moonpet looks different, but the look it gives you is unmistakably familiar.',
    'The evolution glow fades, leaving confidence where uncertainty used to be.',
    'Your Moonpet turns slowly, taking in the shape of what it has become.',
  ],
  item: [
    'Your Moonpet tests the item, approves it and immediately wants another turn.',
    'The item gets a suspicious sniff followed by enthusiastic acceptance.',
    'Your Moonpet quickly works out exactly how to get the most from the item.',
    'A pleased expression confirms the item was worth keeping in the bag.',
  ],
  activity_start: [
    'Your Moonpet settles into the new activity with a focused little nod.',
    'The timer starts; your Moonpet is already completely absorbed.',
    'Your Moonpet checks the task, checks you, then gets started.',
    'With the activity underway, your Moonpet finds its own steady pace.',
  ],
  activity_claim: [
    'Your Moonpet finishes the activity and proudly presents what it earned.',
    'The work is done; your Moonpet looks tired, pleased and ready to collect.',
    'Your Moonpet checks the reward twice, just to be absolutely certain.',
    'A satisfied stretch marks the end of a properly completed activity.',
  ],
  activity_cancel: [
    'Your Moonpet accepts the change of plan, though not without one questioning look.',
    'The activity stops; your Moonpet shakes it off and waits for the next idea.',
    'Your Moonpet seems disappointed for a moment, then returns to your side.',
    'Plans change. Your Moonpet has already started wondering what comes next.',
  ],
  trade_win: [
    'Your Moonpet watches the winning trade settle and tries to look unsurprised.',
    'The profit lands; your Moonpet gives the screen a very smug nod.',
    'Your Moonpet celebrates the winning trade as if it called the market perfectly.',
    'A bright chirp confirms your Moonpet understands that green numbers are good.',
  ],
  trade_loss: [
    'Your Moonpet stares at the lost trade, then firmly closes the imaginary chart.',
    'The loss stings, but your Moonpet stays close and refuses to dwell on it.',
    'Your Moonpet files the trade under lessons and pointedly looks toward adventure.',
    'One unimpressed blink says the market will not get the final word.',
  ],
  rename: [
    'Your Moonpet repeats the new name in a pleased little rhythm.',
    'The new name earns an immediate tail-wag of approval.',
    'Your Moonpet responds on the first try, as if the name was always right.',
    'A proud pose suggests your Moonpet thinks the new name sounds important.',
  ],
  purchase: [
    'Your Moonpet tries the new equipment and instantly stands a little taller.',
    'The new upgrade is inspected from every angle before earning approval.',
    'Your Moonpet tests the fit, the balance and, most importantly, the style.',
    'A confident pose says the new equipment has already become a favourite.',
  ],
  run: [
    'Your Moonpet reads the Moon Run route and chooses momentum over hesitation.',
    'Every turn of the Moon Run seems to sharpen your Moonpet’s focus.',
    'Your Moonpet checks the path behind, then commits to the road ahead.',
    'The Moon Run deepens; your Moonpet’s steps become quieter and more certain.',
  ],
  extract: [
    'Your Moonpet reaches safety, checks the haul and finally lets itself relax.',
    'The extraction closes behind you; your Moonpet looks proud of what made it home.',
    'Banked rewards feel better when both of you return in one piece.',
    'Your Moonpet gives the danger one last look before turning toward home.',
  ],
  adventure: [
    'Your Moonpet leans into the adventure with equal parts nerve and curiosity.',
    'The alley opens ahead, and your Moonpet is already searching for the next turn.',
    'Your Moonpet keeps close enough to protect you and far enough to scout.',
    'Another adventure becomes another story only the two of you fully understand.',
  ],
  arena: [
    'Your Moonpet enters the arena measuring every opponent in the room.',
    'The arena noise rises; your Moonpet becomes perfectly still and focused.',
    'Your Moonpet plants its feet and waits for the opening move.',
    'Win or lose, your Moonpet intends to leave the arena sharper than it entered.',
  ],
  kaiju: [
    'Your Moonpet studies the Kaiju card like the whole district depends on it.',
    'The Kaiju towers overhead; your Moonpet answers with a fearless stare.',
    'Your Moonpet tracks the Kaiju’s movement and signals the moment to act.',
    'Against something this large, courage becomes its own kind of weapon.',
  ],
  achievement: [
    'Your Moonpet admires the achievement, then looks ready to chase the next one.',
    'The new achievement becomes another mark in the story you built together.',
    'Your Moonpet pretends this achievement was inevitable, but cannot hide the pride.',
    'A small celebration breaks out before your Moonpet returns to business.',
  ],
  season: [
    'Your Moonpet opens the season reward like a veteran collecting hard-earned proof.',
    'The season cache glows; your Moonpet remembers every step that unlocked it.',
    'Your Moonpet sorts the season reward carefully and claims the best-looking piece.',
    'Another season milestone is safely added to your shared history.',
  ],
  generic: [
    'Your Moonpet watches, learns and remembers.',
    'Your Moonpet stays close, quietly adding this moment to its story.',
    'A thoughtful look suggests this moment mattered more than it first appeared.',
    'Your Moonpet takes in every detail before moving on.',
  ],
};

const lifecycleTemperaments = {
  bold: ['A bold little stance turns {activity} into a challenge worth meeting.', 'Your Moonpet steps into {activity} first and checks for danger second.'],
  social: ['Your social Moonpet checks your reaction before committing to {activity}.', 'For your Moonpet, {activity} is better because the two of you are doing it together.'],
  rhythmic: ['Your Moonpet finds a beat inside {activity} and moves exactly on it.', 'A quiet head-nod gives {activity} its own private soundtrack.'],
  calm: ['Your calm Moonpet takes one measured breath before {activity}.', 'Nothing about {activity} can rush your Moonpet out of its steady rhythm.'],
  curious: ['Your Moonpet tilts its head and searches {activity} for the detail everyone missed.', 'Curiosity pulls your Moonpet closer to {activity}.'],
  loyal: ['Your Moonpet stays shoulder-to-ankle close throughout {activity}.', 'A loyal glance confirms your Moonpet will not face {activity} without you.'],
};

const innateTraits = {
  night_owl: ['Moonlight seems to sharpen your Moonpet during {activity}.'],
  beat_seeker: ['Your Moonpet tests {activity} for a bassline before anything else.'],
  snack_scout: ['Your Moonpet completes a quick snack check before {activity}.'],
  alley_brave: ['Old alley nerve makes your Moonpet stand taller during {activity}.'],
  soft_hearted: ['Your Moonpet brings an unexpectedly gentle touch to {activity}.'],
  lucky_steps: ['One lucky-looking sidestep changes the rhythm of {activity}.'],
  collector: ['Your Moonpet quietly checks whether {activity} left anything worth keeping.'],
  showboat: ['Your Moonpet makes absolutely certain you noticed its best moment in {activity}.'],
};

const traits = {
  street_fighter: [
    'Your Street Fighter circles {activity} like a challenge waiting to be solved.',
    'Whatever {activity} brings, your Moonpet would rather meet it head-on.',
    'Your Moonpet rolls its shoulders; even {activity} receives a fighter’s focus.',
    'A battle-tested stare turns {activity} into another chance to prove itself.',
    'Your Moonpet instinctively searches {activity} for pressure, timing and an opening.',
    'The Street Fighter in your Moonpet refuses to do {activity} half-heartedly.',
  ],
  explorer: [
    'Your Explorer treats {activity} as a map with one more secret hidden on it.',
    'Before {activity} is over, your Moonpet has already noticed the route nobody else saw.',
    'Your Moonpet approaches {activity} with its nose forward and its eyes everywhere.',
    'Even familiar {activity} feels new when your Explorer starts checking the edges.',
    'Your Moonpet wonders what lies just beyond {activity}, then takes one careful step closer.',
    'The Explorer in your Moonpet turns {activity} into a small expedition.',
  ],
  loyal: [
    'Before {activity}, your Loyal Moonpet checks that you are coming too.',
    'Your Moonpet stays close through {activity}; doing it together is the important part.',
    'A quick glance during {activity} confirms your Moonpet still has your back.',
    'Your Loyal Moonpet measures {activity} by whether both of you come through it well.',
    'No reward from {activity} matters more to your Moonpet than returning to your side.',
    'Your bond gives your Moonpet confidence as {activity} begins.',
  ],
  curious: [
    'Your Curious Moonpet immediately starts asking silent questions about {activity}.',
    'One strange detail in {activity} has completely captured your Moonpet’s attention.',
    'Your Moonpet pokes at the mystery inside {activity} until it gives something away.',
    'Curiosity wins; your Moonpet is already examining {activity} from the wrong direction.',
    'Your Moonpet studies {activity} as if it contains a secret meant specifically for it.',
    'The Curious side of your Moonpet will not leave {activity} unexplored.',
  ],
};

const moods = {
  exhausted: [
    'Your Moonpet faces {activity}, but its heavy eyes are asking for sleep.',
    'A determined yawn interrupts {activity}; your Moonpet is running on loyalty now.',
    'Your Moonpet tries to focus on {activity}, then nearly nods off standing up.',
    'Even {activity} cannot hide how badly your Moonpet needs rest.',
    'Your Moonpet gives {activity} what it has left, which is not much energy.',
  ],
  hungry: [
    'Your Moonpet attempts to focus on {activity}, but keeps checking for food.',
    'A loudly rumbling stomach offers its own opinion about {activity}.',
    'Your Moonpet can handle {activity}; it would simply prefer lunch first.',
    'Every sound during {activity} briefly becomes the sound of a snack wrapper.',
    'Your Moonpet gives you the unmistakable hungry look halfway through {activity}.',
  ],
  unwell: [
    'Your Moonpet stays brave through {activity}, though it clearly needs gentle care.',
    'There is less bounce in your Moonpet’s step as {activity} begins.',
    'Your Moonpet tries not to worry you, but {activity} is taking real effort.',
    'A quiet lean against you says your Moonpet needs recovery more than {activity}.',
    'Your Moonpet manages {activity} carefully, protecting what strength remains.',
  ],
  grubby: [
    'Your Moonpet leaves a faint trail through {activity} and pretends not to notice.',
    'A layer of alley dust has apparently become part of the outfit for {activity}.',
    'Your Moonpet shakes mid-{activity}; the dust cloud is impressive and unhelpful.',
    'The determined look survives {activity}, even if the clean appearance does not.',
    'Your Moonpet is ready for {activity}, but definitely overdue a wash afterward.',
  ],
  lonely: [
    'Your attention during {activity} lifts your Moonpet’s mood more than the reward does.',
    'Your Moonpet stays especially close through {activity}, grateful not to be alone.',
    'A little encouragement from you changes your Moonpet’s whole approach to {activity}.',
    'Your Moonpet was feeling low, but sharing {activity} brings some spark back.',
    'During {activity}, your Moonpet keeps checking that you have not gone anywhere.',
  ],
  excited: [
    'Your Moonpet can barely stay still long enough for {activity} to begin.',
    'Excitement turns every second of {activity} into a small celebration.',
    'Your Moonpet charges into {activity} with considerably more enthusiasm than planning.',
    'The bright look in your Moonpet’s eyes makes {activity} feel important.',
    'Your Moonpet has enough energy for {activity} and probably three more ideas afterward.',
  ],
  thriving: [
    'Healthy, rested and confident, your Moonpet makes {activity} look effortless.',
    'Your Moonpet brings its best energy to {activity} and knows it.',
    'Everything is in balance; your Moonpet meets {activity} at full strength.',
    'Your Moonpet moves through {activity} with the easy confidence of feeling great.',
    'A bright, steady aura follows your Moonpet throughout {activity}.',
  ],
  steady: [
    'Your Moonpet approaches {activity} with a calm, familiar confidence.',
    'A measured breath, a small nod, and your Moonpet is ready for {activity}.',
    'Your Moonpet takes {activity} in stride and keeps one eye on you.',
    'Nothing feels rushed as your Moonpet settles into {activity}.',
    'Your Moonpet seems comfortable letting {activity} unfold at its own pace.',
  ],
};

const evolutions = {
  moon_egg: [
    'The Moon Egg wobbles at the sound of {activity}.',
    'A soft glow moves beneath the shell while {activity} unfolds.',
    'The shell taps twice, storing another early impression of {activity}.',
    'Your Moon Egg cannot join in fully yet, but it is definitely paying attention.',
    'A warm pulse from the shell answers {activity} in its own quiet language.',
  ],
  street_moonpet: [
    'Your Street Moonpet brings a little Moon Alley nerve to {activity}.',
    'Street instincts keep your Moonpet alert throughout {activity}.',
    'Your Moonpet handles {activity} with the scrappy confidence it learned in the alley.',
    'A quick streetwise glance checks {activity} for trouble and opportunity.',
    'Your Street Moonpet is still growing, but it no longer looks uncertain.',
  ],
  cyber_moonpet: [
    'Cyber senses scan {activity} twice before your Moonpet commits.',
    'A neon pulse crosses your Moonpet’s markings as it processes {activity}.',
    'Your Cyber Moonpet finds a pattern inside {activity} that you almost missed.',
    'The upgraded instincts make {activity} look cleaner, faster and more precise.',
    'Your Moonpet’s cyber glow sharpens as {activity} demands its attention.',
  ],
  elite_moonpet: [
    'Your Elite Moonpet reads {activity} before anyone else understands the stakes.',
    'Experience turns {activity} from a problem into a sequence of choices.',
    'Your Moonpet carries itself through {activity} like it belongs at the top level.',
    'One controlled movement is enough for your Elite Moonpet to take charge of {activity}.',
    'Your Moonpet wastes nothing—not time, energy or attention—during {activity}.',
  ],
  legendary_moon_guardian: [
    'The guardian aura settles around {activity}, calm and impossible to ignore.',
    'Your Legendary Moon Guardian meets {activity} with the weight of the whole journey behind it.',
    'Moonlight gathers along your Guardian’s outline as {activity} begins.',
    'Your Moonpet has faced enough to know when {activity} requires power and when it requires patience.',
    'Even at legendary strength, your Guardian looks to you before completing {activity}.',
  ],
};

const milestones = {
  first_adoption: [
    'Something about {activity} carries the same warmth as the day you first met.',
    'Your Moonpet still remembers the first touch against its shell.',
    'For a moment, {activity} brings back the beginning of your bond.',
    'The memory of being chosen still shapes how your Moonpet trusts you during {activity}.',
  ],
  first_run: [
    'Your Moonpet remembers the nerves of that very first run as {activity} begins.',
    'Compared with the first run, your Moonpet looks far more certain during {activity}.',
    'The route may change, but your Moonpet never forgets taking that first step with you.',
    'A trace of first-run excitement returns during {activity}.',
  ],
  first_run_completed: [
    'Your first completed run taught your Moonpet that difficult routes can end in triumph.',
    'The confidence earned on that first full clear returns during {activity}.',
    'Your Moonpet remembers crossing the finish together and pushes into {activity}.',
    'That first complete run is still the standard your Moonpet measures {activity} against.',
  ],
  first_extraction: [
    'Your Moonpet remembers the relief of the first extraction and keeps an exit in mind.',
    'The lesson from that first safe return quietly guides {activity}.',
    'Your Moonpet checks the way home, a habit formed during the first extraction.',
    'One old extraction memory reminds your Moonpet that surviving is also winning.',
  ],
  first_boss_victory: [
    'Your Moonpet remembers its first boss victory and finds courage for {activity}.',
    'The day the first boss fell still burns behind your Moonpet’s eyes.',
    'Your Moonpet once faced something impossible and won; {activity} knows that confidence now.',
    'A remembered boss victory turns hesitation into focus during {activity}.',
  ],
  first_daily_moon_run: [
    'Your Moonpet remembers learning the rhythm of the first Daily Moon Run.',
    'That first daily route made routines like {activity} feel like part of a bigger journey.',
    'The first Daily Moon Run is now an old story, but your Moonpet still remembers every turn.',
    'A familiar spark from the first Daily Moon Run returns during {activity}.',
  ],
  highest_daily_score: [
    'Your Moonpet remembers setting its best daily score and quietly expects that standard again.',
    'The focus behind that record score returns during {activity}.',
    'Your Moonpet knows what a personal best feels like and searches for it in {activity}.',
    'That highest daily score remains proof that your Moonpet can surprise both of you.',
  ],
  longest_daily_streak: [
    'Your longest daily streak taught your Moonpet that showing up together matters.',
    'The memory of your best streak adds quiet determination to {activity}.',
    'Your Moonpet treats {activity} as another link in the chain you built together.',
    'Consistency became part of your bond during that longest streak.',
  ],
  fastest_moon_alley_clear: [
    'Your fastest Moon Alley clear taught your Moonpet exactly when to move.',
    'The pace of that record clear flashes back as {activity} unfolds.',
    'Your Moonpet remembers flying through Moon Alley and looks for the quickest line again.',
    'Record-setting instincts sharpen your Moonpet’s response to {activity}.',
  ],
  daily_boss_victory: [
    'A remembered Daily Moon Run boss victory makes {activity} feel manageable.',
    'Your Moonpet recalls the moment the daily boss fell and stands a little taller.',
    'The courage earned in that daily boss fight still surfaces during {activity}.',
    'Your Moonpet carries one more boss story into {activity}.',
  ],
  evolution: [
    'Your Moonpet remembers every older form that helped it reach {stage}.',
    'The road through each evolution still shapes how your Moonpet approaches {activity}.',
    'Old forms are gone, but their lessons remain visible during {activity}.',
    'Your Moonpet carries the memory of changing without forgetting who raised it.',
  ],
  veteran_runner: [
    'After {runs} completed runs, your Moonpet recognises the rhythm of {activity}.',
    'Your Moonpet carries lessons from {runs} runs into {activity}.',
    'With {runs} runs behind it, your Moonpet knows when to move and when to wait.',
    'Every completed run has left a small mark on how your Moonpet handles {activity}.',
  ],
  veteran_boss: [
    'After {bosses} boss victories, your Moonpet no longer mistakes size for strength.',
    'Your Moonpet brings the confidence of {bosses} defeated bosses into {activity}.',
    'Boss fights have taught your Moonpet to stay patient when {activity} turns tense.',
    'The memory of past victories steadies your Moonpet during {activity}.',
  ],
  biggest_reward: [
    'Your Moonpet still remembers the thrill of earning {reward} in one moment.',
    'That biggest reward remains the treasure your Moonpet compares every haul against.',
    'Your Moonpet learned from its best reward that patience can suddenly pay off.',
    'The memory of {reward} adds a hopeful spark to {activity}.',
  ],
  favourite_activity: [
    'Your Moonpet’s favourite is still {favourite}, but it gives {activity} a fair chance.',
    'The confidence learned through {favourite} carries into {activity}.',
    'Your Moonpet approaches {activity} with the enthusiasm it usually saves for {favourite}.',
    'A fond memory of {favourite} keeps your Moonpet’s mood steady during {activity}.',
  ],
};

export const MOONPET_REACTION_LIBRARY = deepFreeze({ activities, traits, lifecycleTemperaments, innateTraits, moods, evolutions, milestones });

function safeText(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 120);
}

export function getMoonpetMood(pet = {}) {
  const stats = Object.fromEntries(['health', 'hunger', 'happiness', 'cleanliness', 'energy'].map((key) => {
    const value = pet && typeof pet === 'object' && pet[key] != null ? Number(pet[key]) : NaN;
    return [key, Number.isFinite(value) ? value : null];
  }));
  if (stats.health != null && stats.health <= 45) return 'unwell';
  if (stats.energy != null && stats.energy <= 25) return 'exhausted';
  if (stats.hunger != null && stats.hunger >= 75) return 'hungry';
  if (stats.cleanliness != null && stats.cleanliness <= 35) return 'grubby';
  if (stats.happiness != null && stats.happiness <= 35) return 'lonely';
  const hasCompleteStats = Object.values(stats).every((value) => value != null);
  if (hasCompleteStats && stats.health >= 80 && stats.hunger <= 30 && stats.happiness >= 75 && stats.cleanliness >= 70 && stats.energy >= 60) return 'thriving';
  if (hasCompleteStats && stats.happiness >= 80 && stats.energy >= 55) return 'excited';
  return 'steady';
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function addPool(target, group, id, pool) {
  for (const [index, template] of (pool || []).entries()) target.push({ key: `${group}:${id}:${index}`, template, source: group });
}

function rememberedMilestones(memories = {}) {
  const result = new Set(Array.isArray(memories.milestones) ? memories.milestones.map(String) : []);
  if (memories.first_adoption_at) result.add('first_adoption');
  if (memories.first_run_at) result.add('first_run');
  if (memories.first_extraction_at) result.add('first_extraction');
  if (memories.first_boss_victory_at || memories.first_boss_id) result.add('first_boss_victory');
  if (Number(memories.total_runs || 0) >= 5) result.add('veteran_runner');
  if (Number(memories.total_bosses_defeated || 0) >= 2) result.add('veteran_boss');
  if (Number(memories.biggest_reward_amount || 0) > 0) result.add('biggest_reward');
  if (memories.favourite_activity) result.add('favourite_activity');
  if ([...result].some((key) => key.startsWith('evolution_'))) result.add('evolution');
  return [...result];
}

function renderTemplate(template, context, identity, detail = {}) {
  const memories = identity.memories || {};
  const stage = safeText(identity.current_stage?.name, 'Moonpet');
  const activity = safeText(detail.activity_label || ACTIVITY_LABELS[context] || ACTIVITY_LABELS.generic, 'the moment');
  const rewardCurrency = safeText(memories.biggest_reward_currency || 'reward').replaceAll('_', ' ');
  const reward = Number(memories.biggest_reward_amount || 0) > 0 ? `${Number(memories.biggest_reward_amount)} ${rewardCurrency}` : 'that unforgettable reward';
  return template
    .replaceAll('{activity}', activity)
    .replaceAll('{stage}', stage)
    .replaceAll('{runs}', String(Math.max(0, Number(memories.total_runs || 0))))
    .replaceAll('{bosses}', String(Math.max(0, Number(memories.total_bosses_defeated || 0))))
    .replaceAll('{reward}', reward)
    .replaceAll('{favourite}', safeText(memories.favourite_activity, 'adventure').replaceAll('_', ' '));
}

export function buildMoonpetReactionChoice(contextRaw, identity = {}, detail = {}) {
  const requestedContext = safeText(contextRaw).toLowerCase().replaceAll('-', '_');
  const context = activities[requestedContext] ? requestedContext : 'generic';
  const pet = detail.pet || identity.pet || null;
  const mood = safeText(detail.mood || identity.mood || getMoonpetMood(pet), 'steady');
  const evolutionId = safeText(identity.current_stage?.evolution_id, 'moon_egg');
  const candidates = [];
  addPool(candidates, 'activity', context, activities[context]);
  for (const trait of identity.personalities || []) addPool(candidates, 'trait', trait.trait_id, traits[trait.trait_id]);
  const lifecycle = identity.lifecycle || {};
  addPool(candidates, 'temperament', lifecycle.temperament, lifecycleTemperaments[lifecycle.temperament]);
  for (const trait of lifecycle.innate_traits || []) addPool(candidates, 'innate', trait, innateTraits[trait]);
  addPool(candidates, 'mood', mood, moods[mood] || moods.steady);
  addPool(candidates, 'evolution', evolutionId, evolutions[evolutionId] || evolutions.moon_egg);
  for (const milestone of rememberedMilestones(identity.memories || {})) addPool(candidates, 'milestone', milestone, milestones[milestone]);

  const recent = Array.isArray(detail.recent_dialogue || identity.recent_dialogue) ? (detail.recent_dialogue || identity.recent_dialogue).slice(0, 24) : [];
  const recentKeys = new Set(recent.slice(0, 16).map((entry) => typeof entry === 'string' ? entry : entry?.reaction_key).filter(Boolean));
  const recentTexts = new Set(recent.slice(0, 16).map((entry) => typeof entry === 'string' ? entry : entry?.reaction_text).filter(Boolean));
  let available = candidates.filter((candidate) => !recentKeys.has(candidate.key));
  if (!available.length) available = candidates.filter((candidate) => !recentTexts.has(renderTemplate(candidate.template, context, identity, detail)));
  if (!available.length) available = candidates;
  const seed = hashText([detail.seed || identity.dialogue_seed || '', context, evolutionId, mood, recent[0]?.reaction_key || recent[0] || '', recent.length].join('|'));
  const selected = available[seed % available.length] || { key: 'activity:generic:0', template: activities.generic[0], source: 'activity' };
  return { ...selected, context, mood, text: renderTemplate(selected.template, context, identity, detail) };
}

export function buildMoonpetReaction(contextRaw, identity = {}, detail = {}) {
  return buildMoonpetReactionChoice(contextRaw, identity, detail).text;
}

export async function selectMoonpetReaction(db, telegramIdRaw, contextRaw, identity = {}, detail = {}) {
  const telegramId = safeText(telegramIdRaw);
  let recent = [];
  try {
    const rows = await db.prepare(`SELECT reaction_key, reaction_text, context, created_at FROM telegram_pet_dialogue_history
      WHERE telegram_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 24`).bind(telegramId).all();
    recent = rows.results || [];
  } catch {}
  const choice = buildMoonpetReactionChoice(contextRaw, identity, { ...detail, recent_dialogue: recent });
  if (!telegramId) return choice.text;
  try {
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO telegram_pet_dialogue_history (id, telegram_id, context, reaction_key, reaction_text)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_pet_profiles WHERE telegram_id = ?)`)
        .bind(id, telegramId, choice.context, choice.key, choice.text, telegramId),
      db.prepare(`DELETE FROM telegram_pet_dialogue_history WHERE telegram_id = ? AND id NOT IN
        (SELECT id FROM telegram_pet_dialogue_history WHERE telegram_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 40)`)
        .bind(telegramId, telegramId),
    ]);
  } catch {}
  return choice.text;
}
