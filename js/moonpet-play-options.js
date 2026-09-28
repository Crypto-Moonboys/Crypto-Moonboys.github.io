(function (root) {
  'use strict';

  // Navigation only. Opening a route never issues a gameplay request or reward.
  function route(next) {
    var key = [next && next.key, next && next.action, next && next.callback_data].filter(Boolean).join(' ').toLowerCase();
    var routes = [
      [/daily.completion/, 'missions', 'daily-completion'],
      [/finale/, 'missions', 'season-finale'],
      [/weekly[_-]journey/, 'missions', 'weekly-journey'],
      [/daily[_-]journey|daily[_-]objectives/, 'missions', 'daily-objectives'],
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
      [/craft/, 'economy', 'crafting'], [/material/, 'economy', 'materials'],
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

  function objectiveRoutes(key, snapshot) {
    var id = String(key || '').replace(/^mission:/, '').split(':')[0];
    var s = snapshot || {}, g = s.guidance || {};
    if (snapshot && /^daily_(combat|explorer|extraction|boss)$/.test(id)) {
      var daily = s.daily_run || {}, currentPet = s.pet && s.pet.pet_id;
      var ownRun = daily.pet_id && daily.pet_id === currentPet;
      var playable = Boolean(daily.available || daily.resumable && ownRun && s.run && s.run.run_id === daily.run_id && (runAvailability(s).step || s.run.settlement_pending && runAvailability(s).extract));
      var title = daily.available ? 'OPEN OFFICIAL DAILY RUN' : playable ? s.run.settlement_pending ? 'FINISH SAVED DAILY RUN' : 'CONTINUE OFFICIAL DAILY RUN' : 'CHECK OFFICIAL DAILY RUN';
      var detail = 'Only today’s official Daily Run for this pet advances this goal. Contracts, Practice and standard Moon Runs do not.';
      if (daily.attempted && !daily.resumable) {
        title = 'DAILY ATTEMPT USED';
        detail = 'Unfinished official run goals wait until the next UTC day. Continue Contracts or Practice for repeatable play; they do not advance this goal.';
      } else if (daily.pet_id && !ownRun) {
        detail = 'This account’s official attempt belongs to another pet. Its progress stays with that source pet; switching pets does not grant another attempt.';
      } else if (s.run && !playable) {
        detail = 'Finish the saved run first. Only a new official attempt for this pet and UTC day can advance this goal.';
      }
      return [Object.assign({ title: title, detail: detail, available: playable }, route({ key: id }))];
    }
    var targets = {
      weekly_care: [['CARE', 'care', 'Accepted Feed, Play, Clean or Sleep actions count.']],
      weekly_training: [['TRAINING', 'train', 'Use the Train care action. A timed activity is a separate action.']],
      weekly_run: [['MOON RUNS', 'run', 'Accepted standard run completions/extractions and official Daily Run finishes count. Contracts and Practice do not.']],
      weekly_boss_attempt: [['WEEKLY BOSS', 'weekly_boss', 'Use an available Weekly Boss attack. Seasonal raids are separate.']],
      weekly_check_in: [['DAILY CACHE', 'daily_chest', 'Collect Daily Cache on two UTC days. One account cache is available each day.']],
      'pet-daily-shop': [['SHOP', 'shop', 'Buy a pet item.'], ['EQUIPMENT', 'gear_upgrade', 'An accepted equipment upgrade also counts.']],
      'pet-daily-adventure': [['ADVENTURE', 'adventure'], ['MOON RUN', 'run'], ['DISTRICTS', 'district'], ['STORY CHOICES', 'story'], ['SEASONAL RAID', 'seasonal_boss']],
      'pet-daily-bank': [['PET JOBS', 'work', 'Hold at least 50 Moon Gold. Spending gold can make this target incomplete again.'], ['DAILY CACHE', 'daily_chest', 'An unclaimed Daily Cache adds 40 Moon Gold.']],
    };
    var routes = !Object.prototype.hasOwnProperty.call(targets, id)
      ? [Object.assign({ title: 'OPEN OBJECTIVE ROUTE' }, route({ key: key }))]
      : targets[id].map(function (entry) { return Object.assign({ title: 'OPEN ' + entry[0], detail: entry[2] || 'Accepted actions count. Check this route’s energy, cooldown and level requirements.' }, route({ key: entry[1] })); });
    if (!snapshot) return routes;
    var careEvents = { daily_care: ['feed', 'play', 'clean', 'sleep'], weekly_care: ['feed', 'play', 'clean', 'sleep'], weekly_training: ['train'] };
    var available, waiting;
    if (Object.prototype.hasOwnProperty.call(careEvents, id)) {
      available = bountyRouteOptions({ event_types: careEvents[id] }, s).some(function (entry) { return entry.available; });
      waiting = 'Qualifying care is waiting on cooldowns, energy or a background activity. Open care to check; Contracts and Practice remain replayable.';
    } else if (id === 'weekly_check_in') {
      available = Boolean(g.daily_cache && g.daily_cache.available);
      waiting = 'Daily Cache is not available now. This target needs cache claims on two UTC days; switching pets cannot claim another account cache today.';
    } else if (id === 'weekly_boss_attempt') {
      available = Boolean(g.weekly_boss && g.weekly_boss.available);
      waiting = 'No Weekly Boss attack is available now. Open the boss panel for its level, energy, daily attack and weekly reset requirements.';
    } else if (id === 'weekly_run') {
      var sourceMatches = !s.run || !s.run.pet_id && !(s.run.source_pet && s.run.source_pet.pet_id)
        || (s.run.source_pet && s.run.source_pet.pet_id || s.run.pet_id) === (s.pet && s.pet.pet_id);
      available = sourceMatches && (s.run ? runAvailability(s).step || runAvailability(s).extract : Number(s.pet && s.pet.energy) >= 12 || Boolean(s.daily_run && s.daily_run.available));
      waiting = sourceMatches ? 'Restore run energy or check the official Daily Run availability. Contracts and Practice do not count toward this target.' : 'The saved run credits its original pet. Finish it before starting a qualifying run for this pet.';
    }
    if (available !== undefined) routes = routes.map(function (entry) {
      return Object.assign({}, entry, { available: Boolean(available), title: available ? entry.title : entry.title.replace(/^OPEN /, 'CHECK '), detail: available ? entry.detail : waiting });
    });
    return routes;
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

  function runAvailability(snapshot) {
    var s = snapshot || {}, run = s.run;
    var source = Boolean(run && run.source_available !== false);
    var energy = Number(run && run.source_pet ? run.source_pet.energy : s.pet && s.pet.energy || 0);
    var progress = run && (run.daily ? Number(run.current_room != null ? run.current_room : run.depth || 0) : Number(run.depth || 0));
    return { step: source && !run.settlement_pending && (Boolean(run.daily) || energy > 0), extract: source && progress > 0 };
  }

  // Recommendations only. The server still validates every gameplay action.
  function bountyRouteOptions(bounty, snapshot) {
    var s = snapshot || {}, g = s.guidance || {}, energy = Number(s.pet && s.pet.energy || 0);
    var ready = function (event) {
      if (!s.adopted || !s.lifecycle || s.lifecycle.phase === 'egg') return false;
      var cooldown = (s.cooldowns && s.cooldowns.entries || []).some(function (entry) {
        return entry.key === 'action:' + event && Number(entry.remaining_seconds) > 0;
      });
      if (cooldown) return false;
      if (['feed', 'play', 'clean'].includes(event)) return true;
      if (event === 'sleep' || event === 'train') return !(g.activity && g.activity.status === 'active') && (event !== 'train' || energy >= 18);
      if (event === 'work') return (g.jobs || []).some(function (job) { return job.available; });
      if (event === 'random_event') return Boolean(s.encounter && (s.encounter.choices || []).some(function (choice) { return !choice.preview || choice.preview.available !== false; }));
      if (event === 'activity_claim') return Boolean(g.activity && g.activity.ready);
      if (event === 'run_complete' || event === 'run_extract') return s.run
        ? !s.run.daily && (runAvailability(s).step || runAvailability(s).extract)
        : energy >= 12;
      if (event === 'adventure') return Boolean(s.adventure && s.adventure.available);
      if (event === 'daily_chest') return Boolean(g.daily_cache && g.daily_cache.available);
      if (event === 'kaiju_battle') {
        var capability = s.capabilities && s.capabilities.systems && s.capabilities.systems.kaiju;
        return s.capabilities_version === 1 && Boolean(capability && capability.state === 'AVAILABLE' && capability.unlocked === true && capability.active === true);
      }
      if (event === 'use_item' || event === 'use_item_reward') return (s.inventory || []).some(function (item) {
        return Number(item.count == null ? item.quantity : item.count) > 0 && (item.usable || item.kind === 'usable_item');
      });
      return false;
    };
    return bountyRoutes(bounty).map(function (target) {
      var available = (bounty.event_types || []).some(function (event) {
        var destination = route({ key: event });
        return destination.screen === target.screen && destination.focus === target.focus && ready(event);
      });
      return Object.assign({}, target, { available: available,
        detail: available ? 'A qualifying action is available in the latest game state. Review its costs before playing.' : 'No qualifying action is ready here now. Open to review its unlocks, cooldowns or resources; Contracts and Practice remain available.' });
    });
  }

  function craftingGoal(snapshot, recipeKey) {
    var s = snapshot || {}, economy = s.guidance && s.guidance.economy || {};
    var recipe = (s.live_systems && s.live_systems.crafting || []).find(function (r) { return r.key === recipeKey; });
    if (!s.adopted || !recipe || !recipe.output) return null;
    var amount = function (n) { return Math.max(0, Math.floor(Number(n) || 0)); };
    var label = function (key) { return String(key).replace(/_/g, ' '); };
    var ingredients = Object.entries(recipe.cost || {}).map(function (entry) {
      var material = (s.materials || []).find(function (m) { return m.key === entry[0]; }) || {};
      var owned = amount(material.quantity), required = amount(entry[1]);
      return { key: entry[0], title: material.label || label(entry[0]), owned: owned, required: required, missing: Math.max(0, required - owned) };
    });
    var missing = ingredients.filter(function (m) { return m.missing > 0; });
    var output = (s.inventory || []).find(function (i) { return (i.key || i.item_key) === recipe.output.item_key; }) || {};
    var outputCount = amount(output.count == null ? output.quantity : output.count);
    var full = outputCount > 999999 - amount(recipe.output.quantity);
    var hatched = Boolean(s.lifecycle && s.lifecycle.phase !== 'egg');
    var routes = [];
    var needed = function (reward) { return missing.filter(function (m) { return amount(reward && reward.materials && reward.materials[m.key]) > 0; }); };
    if (hatched) {
      (s.regions || []).forEach(function (region) {
        var material = missing.find(function (m) { return m.key === (region.mission && region.mission.material_reward); });
        if (!region.available || !material || !(region.retry_energy_charged || Number(s.pet && s.pet.energy) >= Number(region.energy_cost || 10))) return;
        routes.push({ screen: 'explore', focus: 'districts', title: 'DISTRICT // ' + (region.title || label(region.key)),
          detail: 'Possible ' + material.title + ' on a clear. Compare approaches and risk. ' + (region.retry_energy_charged ? 'Saved energy payment; resume the original choice.' : (region.energy_cost || 10) + ' energy; daily route limit.') });
      });
      (economy.expedition_options || []).forEach(function (entry) {
        if (!entry.available || !(entry.rewards || []).some(function (reward) { return needed(reward).length; })) return;
        routes.push({ screen: 'economy', focus: 'expedition', title: 'EXPEDITION // ' + entry.title,
          detail: 'Possible materials for this goal; the find is not guaranteed. ' + entry.energy + ' energy and one shared daily attempt.' });
      });
      (economy.market_offers || []).forEach(function (offer) {
        if (offer.purchased || !offer.unlocked || !offer.affordable || offer.capacity && !offer.capacity.available || offer.available === false) return;
        var direct = amount(offer.reward && offer.reward.items && offer.reward.items[recipe.output.item_key]);
        if (direct && outputCount + direct > 999999) return;
        if (!needed(offer.reward).length && !direct) return;
        routes.push({ screen: 'economy', focus: 'market', title: 'MARKET // ' + offer.title,
          detail: (direct ? 'Buy the finished item instead of crafting. ' : 'Buy missing materials. ') + 'Cost: ' + Object.entries(offer.cost || {}).map(function (entry) { return amount(entry[1]) + ' ' + label(entry[0]); }).join(' + ') + '. One purchase of this offer today.' });
      });
    }
    return { recipe: recipe, ingredients: ingredients, missing: missing, output_count: outputCount, output_full: full,
      ready: hatched && recipe.unlocked === true && recipe.affordable === true && !missing.length && !full, routes: routes };
  }

  function options(snapshot, preferences) {
    var s = snapshot || {}, g = s.guidance || {}, live = s.live_systems || {};
    if (!s.adopted) return [];
    var choices = [];
    var add = function (key, title, detail, destination) {
      choices.push(Object.assign({}, destination || route({ key: key }), { key: key, title: title, detail: detail }));
    };
    var egg = s.lifecycle && s.lifecycle.phase === 'egg';
    if ((g.daily_completion && g.daily_completion.pending || []).some(function (claim) { return claim.pet_id || !egg; })) add('daily_completion', 'CLAIM DAILY 7/7 BONUS', 'Collect a saved daily checklist reward. One per account / UTC day.');
    if ((s.season_finales && s.season_finales.pets || []).some(function (pet) { return pet.status === 'active' || pet.status === 'failed' || pet.status === 'won' && !pet.claimed || pet.eligible && pet.status === 'not_started'; })) add('finale', 'SEASON FINALE // SIGNAL SOVEREIGN', 'Choose a build, resume a saved battle or collect your victory reward. No pet energy cost.');
    var goal = craftingGoal(s, preferences && preferences.crafting_goal);
    if (goal && !egg) add('craft_goal', (goal.ready ? 'READY TO CRAFT // ' : 'CRAFTING GOAL // ') + goal.recipe.title,
      goal.ready ? 'Materials are ready. Review the recipe and choose when to craft.' : 'Compare missing materials, district risks, expedition finds and current market alternatives.');
    if (g.weekly_boss && (g.weekly_boss.pending_rewards || []).length) add('weekly_boss_claim', 'RECOVER WEEKLY BOSS REWARDS', 'Collect saved victories, including earlier weeks. No energy, new attack or current level requirement.');
    if (s.contracts && (s.contracts.pending_rewards || []).length) add('contract_claim', 'RECOVER SAVED CONTRACT XP', 'Collect saved bonuses for the pets that earned them, including earlier seasons. No new run or energy cost.');
    if (!egg && g.daily_cache && g.daily_cache.available) add('daily_chest', 'OPEN DAILY CACHE', 'One account cache per UTC day. Check the current XP allowance before claiming.', { screen: 'home', focus: 'care' });
    var bounties = g.economy && g.economy.bounties || [];
    if (live.seasonal_boss && (live.seasonal_boss.pending_rewards || []).length) add('seasonal_boss_claim', 'CLAIM SAVED RAID REWARDS', 'Collect saved victories for the pets that earned them, including earlier seasons. No energy cost.');
    if (!egg) {
      var seasonClaims = (g.season && g.season.tiers || []).filter(function (tier) { return tier.unlocked && !tier.claimed_at; });
      if (seasonClaims.length) add('season_claims', 'CLAIM SEASON REWARDS // ' + seasonClaims.length, 'Open your unlocked season tiers and choose which rewards to collect. Each tier can be claimed once.');
      if ((s.regions || []).some(function (region) { return region.available && region.pending_choice_key && (region.retry_energy_charged || Number(s.pet && s.pet.energy) >= 10); })) add('district_retry', 'RESUME SAVED DISTRICT CHOICE', 'Finish an interrupted decision without changing its reward or charging energy twice.');
      var ready = bounties.filter(function (b) { return b.complete && !b.claimed; });
      if (ready.length) add('bounty_claims', 'CLAIM READY BOUNTIES // ' + ready.length, 'Open the board to collect verified rewards.');
      if (g.activity && g.activity.ready) add('activity', g.activity.recovery_pending ? 'RECOVER SAVED ACTIVITY REWARD' : 'CLAIM OR CONTINUE ACTIVITY', g.activity.recovery_pending ? 'Retry the interrupted claim. Its saved reward is protected against duplicate payment.' : 'Compare the current reward with the next duration checkpoint before claiming.');
      var nextBounty = bounties.filter(function (b) { return !b.complete && !b.claimed; }).map(function (b) {
        return { bounty: b, routes: bountyRouteOptions(b, s).filter(function (r) { return r.available; }) };
      }).filter(function (entry) { return entry.routes.length; }).sort(function (a, b) {
        return Number(b.bounty.progress || 0) / Math.max(1, Number(b.bounty.required)) - Number(a.bounty.progress || 0) / Math.max(1, Number(a.bounty.required));
      })[0];
      if (nextBounty) add('bounty_target', 'NEXT BOUNTY // ' + nextBounty.bounty.title, nextBounty.bounty.progress + '/' + nextBounty.bounty.required + ' // ' + (nextBounty.bounty.detail || '') + ' A qualifying route is ready; review its costs.', nextBounty.routes[0]);
    }
    if (s.contracts && s.contracts.available) add('contract', s.contracts.run && s.contracts.run.status === 'active' ? 'CONTINUE CONTRACT' : 'CONTINUING CONTRACTS', 'Choose a quest, build and route length. Saved rank and upgrade drafts. New quests after every finish; no pet energy cost.');
    add('practice', 'PRACTICE ROGUELITE', 'Unlimited replays. Build choices, room risks and local goals. No rewards or pet costs.');
    if (egg) {
      add('incubate', 'SECRET BOT CARE', 'Care and reveal remain server-controlled. Practice is available while you wait.');
      return choices;
    }
    if (!g.activity && (g.activity_options || []).length) add('activity', 'CHOOSE A BACKGROUND ACTIVITY', 'Compare four activities and duration rewards. Keep playing contracts while it accumulates.');
    else if (g.activity && !g.activity.ready) add('activity', 'CHECK BACKGROUND ACTIVITY', 'Your timer continues while you play other routes. Check its next reward preview.');
    if (s.run) {
      var playableRun = runAvailability(s);
      if (s.run.settlement_pending && playableRun.extract) add('run', 'FINISH SAVED DAILY RUN', 'The final boss room is saved. Retry its reward and completion without another fight.');
      else if (playableRun.step || playableRun.extract) add('run', playableRun.step ? 'CONTINUE ' + (s.run.daily ? 'DAILY RUN' : 'MOON RUN') : 'EXTRACT SAVED MOON RUN',
        playableRun.step ? 'Choose the next room or extract after clearing a room. Finish this run before opening another.' : 'Your original run pet has no energy for another room. You can still extract and bank this saved run.');
    }
    else {
      if (Number(s.pet && s.pet.energy) >= 12) add('run', 'MOON RUN', 'Repeatable risk / reward routes. Requires energy; server reward caps still apply.');
      if (s.daily_run && s.daily_run.available) add('daily_run', 'OFFICIAL DAILY RUN', 'One official attempt per account / UTC day. Advances Daily Journey.');
    }
    if ((live.chains || []).some(function (x) { return x.available; })) add('event_chain', 'STORY CHOICES', 'Continue an available authored story. One rewarded step per chain / UTC day.');
    if (s.adventure && s.adventure.available) add('adventure', 'ADVENTURE CHOICES', 'Compare outcome odds and costs. One adventure every 30 minutes; entry requires ' + s.adventure.minimum_energy + ' energy.');
    if (s.encounter && (s.encounter.choices || []).some(function (choice) { return !choice.preview || choice.preview.available !== false; })) add('random_event', 'STREET EVENT CHOICES', 'Compare rewards, costs and setbacks. Repeated-play scaling and daily reward caps apply.');
    if ((g.jobs || []).some(function (job) { return job.available; })) add('work', 'AVAILABLE PET JOBS', 'Choose among jobs your pet has unlocked; each job keeps its costs and reward rules.');
    if ((g.economy && g.economy.expedition_options || []).some(function (entry) { return entry.available; })) add('expedition', 'CHOOSE AN EXPEDITION', 'Compare unlocked destinations, energy costs and possible finds. Three shared attempts per UTC day.');
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
    add('daily_journey', 'DAILY JOURNEY OBJECTIVES', 'See Growth Mark goals and the official Daily Run requirements.');
    add('weekly_journey', 'WEEKLY JOURNEY TARGETS', 'Open care, training, run, boss and cache routes directly from unfinished targets.');
    add('mission', 'DAILY MISSIONS', 'Compare qualifying routes for today’s seven mission targets.');
    add('bounty', 'BOUNTY BOARD', 'Check server-tracked targets and claim only completed bounties.');
    if (g.season && (g.season.tiers || []).length && !seasonClaims.length) {
      var nextTier = g.season.tiers.find(function (tier) { return !tier.unlocked; });
      add('season', nextTier ? 'NEXT SEASON REWARD // ' + nextTier.title : 'SEASON REWARDS COMPLETE', nextTier ? Math.max(0, Number(nextTier.required_xp) - Number(g.season.xp || 0)) + ' more season XP to unlock. Rewarded routes keep their daily XP caps.' : 'All current tiers collected. Contracts, Practice and pet progression remain available.');
    }
    return choices;
  }

  // Rank navigation choices, never perform actions or promise a universally best build.
  function recommendations(snapshot, preferences) {
    var s = snapshot || {}, g = s.guidance || {}, lifecycle = s.lifecycle || {};
    if (!s.adopted) return [];
    var candidates = options(s, preferences).map(function (entry, index) {
      var rank = 60;
      if (/claim|daily_completion/.test(entry.key)) rank = 10;
      else if (entry.key === 'activity' && g.activity && g.activity.ready) rank = 12;
      else if (entry.key === 'run' && s.run) rank = 20;
      else if (entry.key === 'contract' && s.contracts.run && s.contracts.run.status === 'active') rank = 22;
      else if (entry.key === 'district_retry') rank = 23;
      else if (entry.key === 'finale') rank = (s.season_finales.pets || []).some(function (pet) { return pet.status === 'won' && !pet.claimed; }) ? 10 : 24;
      else if (entry.key === 'incubate') rank = 25;
      else if (entry.key === 'daily_chest') rank = 30;
      else if (entry.key === 'bounty_target') rank = 38;
      else if (entry.key === 'craft_goal') { var goal = craftingGoal(s, preferences && preferences.crafting_goal); rank = goal && goal.ready ? 40 : goal && goal.routes.length ? 70 : 85; }
      else if (entry.key === 'daily_run' || entry.key === 'weekly_boss') rank = 45;
      else if (['daily_journey', 'weekly_journey', 'mission', 'bounty', 'season'].includes(entry.key)) rank = 85;
      else if (entry.key === 'activity' && g.activity && !g.activity.ready) rank = 90;
      else if (entry.key === 'practice') rank = 100;
      return Object.assign({}, entry, { rank: rank, order: index });
    });
    function add(key, title, detail, destination, rank) {
      candidates.push(Object.assign({}, destination, { key: key, title: title, detail: detail, rank: rank, order: candidates.length }));
    }
    if (lifecycle.phase !== 'egg') {
      var pet = s.pet || {};
      [['feed', Number(pet.hunger) >= 60], ['clean', Number(pet.cleanliness) <= 35], ['play', Number(pet.happiness) <= 35], ['sleep', Number(pet.energy) < 12]].forEach(function (entry) {
        if (entry[1] && bountyRouteOptions({ event_types: [entry[0]] }, s).some(function (r) { return r.available; })) {
          add(entry[0], 'CARE // ' + entry[0].toUpperCase(), 'Restore this need before choosing a costly route. Other ready care is in the same section.', route({ key: entry[0] }), 28);
        }
      });
      [['daily_journey', 'DAILY GOAL'], ['weekly_journey', 'WEEKLY GOAL']].forEach(function (group) {
        (s[group[0]] && s[group[0]].objectives || []).filter(function (goal) {
          return !goal.completed && Number(goal.progress || 0) < Number(goal.target || 1);
        }).forEach(function (goal) {
          // Only advertise objectives whose qualifying route has an explicit ready check.
          var target = objectiveRoutes(goal.objective_id || goal.challenge_id || goal.key, s).find(function (r) { return r.available === true; });
          if (target) add(group[0] + ':' + (goal.objective_id || goal.challenge_id || goal.key), group[1] + ' // ' + (goal.title || goal.label || goal.description || goal.objective_id || goal.challenge_id || goal.key),
            String(goal.progress || 0) + '/' + String(goal.target || 1) + '. ' + (target.detail || 'A qualifying route is ready.'), target, 36);
        });
      });
      if (s.arena && ['readying', 'active'].includes(s.arena.status)) add('arena_resume', 'RETURN TO ARENA MATCH', 'Check the current round before the match expires.', route({ key: 'arena' }), 18);
      if (s.kaiju && s.kaiju.match && ['open', 'selecting'].includes(s.kaiju.match.status)) add('kaiju_resume', 'RETURN TO KAIJU MATCH', 'Review your cards and the current match.', route({ key: 'kaiju' }), 19);
      if (g.evolution && g.evolution.ready) add('evolution_ready', 'EVOLUTION READY // ' + g.evolution.name, 'Your requirements are met. Review the new form and perk before evolving.', route({ key: 'evolution' }), 41);
      if (lifecycle.rare && lifecycle.rare.ready) add('rare_morph', 'ANSWER THE HIDDEN SIGNAL', 'A morph path is ready. Review it before choosing.', route({ key: 'rare_morph' }), 42);
      if ((s.live_systems && s.live_systems.upgrades || []).some(function (item) { return item.affordable && !item.maxed; })) {
        add('gear_upgrade', 'REVIEW EQUIPMENT UPGRADES', 'An upgrade is affordable. Compare its benefit and material cost before spending.', route({ key: 'gear_upgrade' }), 75);
      }
      if (!preferences || !preferences.crafting_goal) {
        if ((s.live_systems && s.live_systems.crafting || []).some(function (recipe) { var goal = craftingGoal(s, recipe.key); return goal && goal.ready; })) {
          add('craft', 'REVIEW READY RECIPES', 'You can craft an item. Choose a recipe and check its material cost.', route({ key: 'craft' }), 74);
        }
      }
      if ((s.inventory || []).some(function (item) { return Number(item.count == null ? item.quantity : item.count) > 0 && (item.usable || item.kind === 'usable_item'); })) {
        add('inventory', 'REVIEW USABLE ITEMS', 'You have items in your bag. Check each effect before choosing whether to use one.', route({ key: 'inventory' }), 72);
      }
      if ((g.economy && g.economy.market_offers || []).some(function (offer) {
        return offer.unlocked && offer.affordable && !offer.purchased && offer.available !== false && (!offer.capacity || offer.capacity.available);
      })) {
        add('market', 'COMPARE AVAILABLE MARKET BUNDLES', 'Optional purchase with game currency. Compare costs, contents and storage before buying.', route({ key: 'market' }), 78);
      }
      if ((g.shop_items || []).some(function (item) { return item.unlocked && item.affordable && !item.equipped; })) {
        add('shop', 'COMPARE AFFORDABLE SHOP ITEMS', 'Optional gear choices are within your budget. Review bonuses and costs before buying.', route({ key: 'shop' }), 79);
      }
      if ((s.live_systems && s.live_systems.cosmetics || []).some(function (item) { return item.affordable && (!item.unlocked || item.repeatable); })) {
        add('cosmetic', 'EXPLORE AVAILABLE STYLES', 'Optional cosmetic collection. Review the game-currency cost before choosing a style.', route({ key: 'cosmetic' }), 80);
      }
      // Preserve server guidance only where it agrees with a currently available route.
      // Browsing a locked panel is useful, but must not become a "ready" recommendation.
      var next = s.next;
      if (next && next.title) {
        var destination = route(next);
        var match = candidates.find(function (entry) { return entry.key === next.key && entry.screen === destination.screen && entry.focus === destination.focus && entry.rank < 85; });
        if (match) add('server:' + next.key, next.title, next.detail || match.detail, destination, Math.max(29, match.rank - 1));
      }
    }
    var seen = new Set();
    return candidates.sort(function (a, b) { return a.rank - b.rank || a.order - b.order; }).filter(function (entry) {
      var destination = entry.screen + ':' + entry.focus;
      if (seen.has(destination)) return false;
      seen.add(destination); return true;
    });
  }

  var api = { recommendations: recommendations, route: route, objectiveRoutes: objectiveRoutes, bountyRoutes: bountyRoutes, bountyRouteOptions: bountyRouteOptions, runAvailability: runAvailability, craftingGoal: craftingGoal, options: options };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoonpetPlayOptions = api;
})(typeof window !== 'undefined' ? window : globalThis);
