(function (root) {
  'use strict';

  // Navigation only. Opening a route never issues a gameplay request or reward.
  function route(next) {
    var key = [next && next.key, next && next.action, next && next.callback_data].filter(Boolean).join(' ').toLowerCase();
    var routes = [
      [/daily[_-]run|daily_(combat|explorer|extraction|boss)/, 'explore', 'moon-run'],
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
      [/incubat|hatch/, 'home', 'incubation'],
      [/feed|sleep|clean|play|health|train|care|dance|cuddle|energy.drink/, 'home', 'care'],
      [/rare.morph/, 'profile', 'rare-morph'],
      [/evol/, 'profile', 'evolution'], [/season/, 'profile', 'season'],
      [/achievement|trait/, 'missions', 'achievements'], [/mission/, 'missions', 'missions'],
    ];
    for (var entry of routes) if (entry[0].test(key)) return { screen: entry[1], focus: entry[2] };
    return { screen: 'home', focus: 'care' };
  }

  function options(snapshot) {
    var s = snapshot || {}, g = s.guidance || {}, live = s.live_systems || {};
    if (!s.adopted) return [];
    var choices = [];
    var add = function (key, title, detail, destination) {
      choices.push(Object.assign({ key: key, title: title, detail: detail }, destination || route({ key: key })));
    };
    add('practice', 'PRACTICE ROGUELITE', 'Unlimited replays. Build choices, room risks and local goals. No rewards or pet costs.');
    if (s.lifecycle && s.lifecycle.phase === 'egg') {
      add('incubate', 'SECRET BOT CARE', 'Care and reveal remain server-controlled. Practice is available while you wait.');
      return choices;
    }
    if (s.run) add('run', 'CONTINUE ' + (s.run.daily ? 'DAILY RUN' : 'MOON RUN'), 'Choose the next room or extract. Finish this run before opening another.');
    else {
      if (Number(s.pet && s.pet.energy) >= 12) add('run', 'MOON RUN', 'Repeatable risk / reward routes. Requires energy; server reward caps still apply.');
      if (s.daily_run && s.daily_run.available) add('daily_run', 'OFFICIAL DAILY RUN', 'One official attempt per account / UTC day. Advances Daily Journey.');
    }
    if (g.activity && g.activity.ready) add('activity', 'CLAIM FINISHED ACTIVITY', 'Your timed activity is ready to settle.');
    if ((live.chains || []).some(function (x) { return x.available; })) add('event_chain', 'STORY CHOICES', 'Continue an available authored story. One rewarded step per chain / UTC day.');
    if ((s.regions || []).some(function (x) { return x.available; }) && Number(s.pet && s.pet.energy) >= 10) add('district', 'DISTRICT MISSIONS', 'Choose safe, balanced or bold approaches. Build mastery toward boss checkpoints.');
    if (g.weekly_boss && g.weekly_boss.available) add('weekly_boss', 'WEEKLY BOSS', 'Strike, outsmart or endure. One attack per UTC day.');
    if (live.seasonal_boss && live.seasonal_boss.available && Number(s.pet && s.pet.energy) >= 18) add('seasonal_boss', 'SEASONAL RAID', 'Take an available raid attempt. Costs 18 energy.');
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

  var api = { route: route, options: options };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoonpetPlayOptions = api;
})(typeof window !== 'undefined' ? window : globalThis);
