(function (root) {
  'use strict';

  // Navigation only. Opening a route never issues a gameplay request or reward.
  function route(next) {
    var key = [next && next.key, next && next.action, next && next.callback_data].filter(Boolean).join(' ').toLowerCase();
    var routes = [
      [/daily[_-]run|daily_(combat|explorer|extraction|boss)/, 'explore', 'moon-run'],
      [/contract/, 'missions', 'contracts'],
      [/district/, 'explore', 'districts'],
      [/event.chain|story/, 'explore', 'story-chains'],
      [/seasonal.boss/, 'explore', 'seasonal-boss'],
      [/weekly.boss|pet:boss/, 'explore', 'weekly-boss'],
      [/adventure/, 'explore', 'adventure'],
      [/random.event|pet:event/, 'explore', 'street-event'],
      [/arena/, 'explore', 'arena'], [/kaiju/, 'explore', 'kaiju'],
      [/activity|timed/, 'work', 'timed-activity'],
      [/practice/, 'explore', 'practice'], [/run/, 'explore', 'moon-run'],
      [/job|work|bank/, 'work', 'jobs'],
      [/bount/, 'economy', 'bounties'], [/expedition/, 'economy', 'expedition'],
      [/market/, 'economy', 'market'], [/trade/, 'economy', 'trade'],
      [/cosmetic/, 'economy', 'style-lab'], [/gear|upgrade/, 'economy', 'equipment'],
      [/shop|buy|equip/, 'economy', 'shop'],
      [/use.item|inventory/, 'economy', 'inventory'],
      [/daily.chest|daily.cache/, 'home', 'care'],
      [/incubat|hatch/, 'home', 'incubation'],
      [/feed|sleep|clean|play|health|train|care|dance|cuddle|energy.drink/, 'home', 'care'],
      [/rare.morph/, 'profile', 'rare-morph'],
      [/evol/, 'profile', 'evolution'], [/season/, 'profile', 'season'],
      [/achievement|trait/, 'missions', 'achievements'], [/mission/, 'missions', 'missions'],
    ];
    for (var entry of routes) if (entry[0].test(key)) return { screen: entry[1], focus: entry[2] };
    return { screen: 'home', focus: 'care' };
  }

  function bountyRoutes(bounty) {
    var labels = { feed: 'CARE', play: 'CARE', clean: 'CARE', sleep: 'CARE', train: 'CARE', work: 'PET JOBS',
      random_event: 'STREET EVENT', activity_claim: 'TIMED ACTIVITY', run_complete: 'MOON RUN', run_extract: 'MOON RUN',
      adventure: 'ADVENTURE', daily_chest: 'DAILY CACHE', kaiju_battle: 'KAIJU', use_item: 'INVENTORY', use_item_reward: 'INVENTORY' };
    var destinations = [];
    (bounty.event_types || []).forEach(function (event) {
      if (!Object.prototype.hasOwnProperty.call(labels, event)) return;
      var target = route({ key: event });
      if (!destinations.some(function (entry) { return entry.screen === target.screen && entry.focus === target.focus; })) {
        destinations.push(Object.assign({ title: 'OPEN ' + labels[event] }, target));
      }
    });
    return destinations;
  }

  function options(snapshot) {
    var s = snapshot || {}, g = s.guidance || {}, live = s.live_systems || {};
    if (!s.adopted) return [];
    var choices = [];
    var add = function (key, title, detail, destination) {
      choices.push(Object.assign({}, destination || route({ key: key }), { key: key, title: title, detail: detail }));
    };
    var egg = s.lifecycle && s.lifecycle.phase === 'egg';
    var bounties = g.economy && g.economy.bounties || [];
    if (!egg) {
      if (live.seasonal_boss && (live.seasonal_boss.pending_rewards || []).length) add('seasonal_boss_claim', 'CLAIM SAVED RAID REWARDS', 'Recover defeated boss rewards, including older rotations. No energy cost.');
      if ((s.regions || []).some(function (region) { return region.available && region.pending_choice_key && (region.retry_energy_charged || Number(s.pet && s.pet.energy) >= 10); })) add('district_retry', 'RESUME SAVED DISTRICT CHOICE', 'Finish an interrupted decision without changing its reward or charging energy twice.');
      var ready = bounties.filter(function (b) { return b.complete && !b.claimed; });
      if (ready.length) add('bounty_claims', 'CLAIM READY BOUNTIES // ' + ready.length, 'Open the board to collect verified rewards.');
      if (g.activity && g.activity.ready) add('activity', g.activity.recovery_pending ? 'RECOVER SAVED ACTIVITY REWARD' : 'CLAIM OR CONTINUE ACTIVITY', g.activity.recovery_pending ? 'Retry the interrupted claim. Its saved reward is protected against duplicate payment.' : 'Compare the current reward with the next duration checkpoint before claiming.');
      var nextBounty = bounties.filter(function (b) { return !b.complete && !b.claimed && bountyRoutes(b).length; }).sort(function (a, b) {
        return Number(b.progress || 0) / Math.max(1, Number(b.required)) - Number(a.progress || 0) / Math.max(1, Number(a.required));
      })[0];
      if (nextBounty) add('bounty_target', 'NEXT BOUNTY // ' + nextBounty.title, nextBounty.progress + '/' + nextBounty.required + ' // ' + nextBounty.detail + ' Open the route to check its requirements.', bountyRoutes(nextBounty)[0]);
    }
    if (s.contracts && s.contracts.available) add('contract', s.contracts.run && s.contracts.run.status === 'active' ? 'CONTINUE CONTRACT' : 'CONTINUING CONTRACTS', 'New quests after every finish. Saved rank, three builds and route upgrades. No pet energy cost.');
    add('practice', 'PRACTICE ROGUELITE', 'Unlimited replays. Build choices, room risks and local goals. No rewards or pet costs.');
    if (egg) {
      add('incubate', 'SECRET BOT CARE', 'Care and reveal remain server-controlled. Practice is available while you wait.');
      return choices;
    }
    if (!g.activity && (g.activity_options || []).length) add('activity', 'CHOOSE A BACKGROUND ACTIVITY', 'Compare four activities and duration rewards. Keep playing contracts while it accumulates.');
    else if (g.activity && !g.activity.ready) add('activity', 'CHECK BACKGROUND ACTIVITY', 'Your timer continues while you play other routes. Check its next reward preview.');
    if (s.run) add('run', 'CONTINUE ' + (s.run.daily ? 'DAILY RUN' : 'MOON RUN'), 'Choose the next room or extract. Finish this run before opening another.');
    else {
      if (Number(s.pet && s.pet.energy) >= 12) add('run', 'MOON RUN', 'Repeatable risk / reward routes. Requires energy; server reward caps still apply.');
      if (s.daily_run && s.daily_run.available) add('daily_run', 'OFFICIAL DAILY RUN', 'One official attempt per account / UTC day. Advances Daily Journey.');
    }
    if ((live.chains || []).some(function (x) { return x.available; })) add('event_chain', 'STORY CHOICES', 'Continue an available authored story. One rewarded step per chain / UTC day.');
    if (s.adventure && s.adventure.available) add('adventure', 'ADVENTURE CHOICES', 'Compare outcome odds and costs. One adventure every 30 minutes; entry requires ' + s.adventure.minimum_energy + ' energy.');
    if (s.encounter && (s.encounter.choices || []).length) add('random_event', 'STREET EVENT CHOICES', 'Compare rewards, costs and setbacks. Repeated-play scaling and daily reward caps apply.');
    if ((g.jobs || []).some(function (job) { return job.available; })) add('work', 'AVAILABLE PET JOBS', 'Choose among jobs your pet has unlocked; each job keeps its costs and reward rules.');
    if ((s.regions || []).some(function (x) { return x.available; }) && Number(s.pet && s.pet.energy) >= 10) add('district', 'DISTRICT MISSIONS', 'Choose safe, balanced or bold approaches. Build mastery toward boss checkpoints.');
    if (g.weekly_boss && g.weekly_boss.available) add('weekly_boss', 'WEEKLY BOSS', 'Strike, outsmart or endure. One attack per UTC day.');
    if (live.seasonal_boss && live.seasonal_boss.available && (live.seasonal_boss.pending_move && live.seasonal_boss.retry_energy_charged || (live.seasonal_boss.choices || [{ key: 'strike', energy: 18 }]).some(function (choice) { return (!live.seasonal_boss.pending_move || choice.key === live.seasonal_boss.pending_move) && Number(s.pet && s.pet.energy) >= choice.energy; }))) add('seasonal_boss', 'SEASONAL RAID', 'Conserve energy, strike steadily or counter the boss weakness. One attack per pet / UTC day.');
    var systems = s.capabilities && s.capabilities.systems || {};
    if (s.capabilities_version === 1) for (var name of ['arena', 'kaiju']) {
      var capability = systems[name];
      if (capability && capability.state === 'AVAILABLE' && capability.unlocked === true && capability.active === true) {
        add(name, name === 'arena' ? 'ARENA CHOICES' : 'KAIJU CARDS', 'Open the battle panel for entry requirements, opponents and active matches.');
      }
    }
    add('mission', 'DAILY & WEEKLY OBJECTIVES', 'See recorded progress and jump directly to unfinished goals.');
    add('bounty', 'BOUNTY BOARD', 'Check server-tracked targets and claim only completed bounties.');
    return choices;
  }

  var api = { route: route, bountyRoutes: bountyRoutes, options: options };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoonpetPlayOptions = api;
})(typeof window !== 'undefined' ? window : globalThis);
