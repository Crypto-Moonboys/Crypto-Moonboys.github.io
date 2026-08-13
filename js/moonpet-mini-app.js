(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var apiConfig = window.MOONBOYS_API || {};
  var apiBase = apiConfig.BASE_URL || 'https://api.cryptomoonboys.com';
  var initData = '';
  var telegramAuth = null;
  var state = null;
  var requestedScreen = launchParameter('screen');
  var activeScreen = ['home', 'missions', 'explore', 'work', 'economy', 'profile'].includes(requestedScreen) ? requestedScreen : 'home';
  var busy = false;
  var typingToken = 0;
  var animationMode = 'idle';
  var animationUntil = 0;
  var animationLabel = '';
  var actionSequence = 0;
  var reducedMotionAnimationTimer = 0;
  var actionResultHoldMs = 3600;
  var noticesBusy = false;
  var lastPassiveRefreshAt = 0;
  var reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var app = document.getElementById('moonpet-app');
  var canvas = document.getElementById('moonpet-canvas');
  var ctx = canvas.getContext('2d', { alpha: false });
  var hud = document.getElementById('hud');
  var screen = document.getElementById('screen');
  var nav = document.getElementById('nav');
  var output = document.getElementById('terminal-output');
  var bootLayer = document.getElementById('boot-layer');
  var bootText = document.getElementById('boot-text');
  var title = document.getElementById('system-title');
  var clock = document.getElementById('system-clock');

  function launchParameter(name) {
    var locations = [String(window.location.hash || '').replace(/^#/, ''), String(window.location.search || '').replace(/^\?/, '')];
    for (var index = 0; index < locations.length; index += 1) {
      if (!locations[index]) continue;
      var value = new URLSearchParams(locations[index]).get(name);
      if (value) return String(value);
    }
    return '';
  }

  function refreshTelegramContext() {
    tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : tg;
    initData = String(tg && tg.initData || launchParameter('tgWebAppData') || '');
    return Boolean(initData);
  }

  async function waitForTelegramContext() {
    if (refreshTelegramContext()) return true;
    for (var attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(function (resolve) { setTimeout(resolve, 50); });
      if (refreshTelegramContext()) return true;
    }
    return false;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function words(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function number(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-GB');
  }

  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === 'success' || kind === 'error') tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.impactOccurred(kind || 'light');
    } catch (_) {}
  }

  function authBody() {
    if (initData) return { init_data: initData };
    if (telegramAuth) return { telegram_auth: telegramAuth };
    return {};
  }

  async function restoreBrowserAuth() {
    if (initData || !window.MOONBOYS_IDENTITY || typeof window.MOONBOYS_IDENTITY.restoreLinkedTelegramAuth !== 'function') return;
    try {
      var restored = await window.MOONBOYS_IDENTITY.restoreLinkedTelegramAuth();
      telegramAuth = restored && restored.ok ? restored.telegram_auth : null;
    } catch (_) { telegramAuth = null; }
  }

  async function post(path, payload) {
    var response = await fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, authBody(), payload || {})),
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok && response.status !== 409) throw new Error(data.error || 'NETWORK HANDSHAKE FAILED');
    return data;
  }

  async function typeBoot(lines, options) {
    var token = ++typingToken;
    var content = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join('\n');
    var reduced = reducedMotion;
    bootLayer.classList.toggle('is-compact', Boolean(state) && !(options && options.full));
    bootLayer.classList.toggle('is-notice', Boolean(options && options.notice));
    bootLayer.scrollTop = 0;
    bootLayer.classList.remove('is-hidden');
    bootText.textContent = '';
    var speed = reduced ? 0 : Number(options && options.speed || 7);
    for (var index = 0; index < content.length; index += 1) {
      if (token !== typingToken) return;
      bootText.textContent += content[index];
      if (speed && (content[index] === '\n' || index % 2 === 0)) await new Promise(function (resolve) { setTimeout(resolve, speed); });
    }
    await new Promise(function (resolve) { setTimeout(resolve, reduced ? 10 : Number(options && options.hold || 280)); });
    if (token === typingToken) bootLayer.classList.add('is-hidden');
  }

  function tell(message, tone) {
    output.dataset.tone = tone || '';
    output.textContent = String(message || 'READY.');
  }

  function button(label, action, payload, options) {
    var disabled = options && options.disabled;
    var detail = options && options.detail ? '<small>' + escapeHtml(options.detail) + '</small>' : '';
    return '<button class="terminal-button' + (options && options.danger ? ' danger' : '') + '" type="button" data-action="' + escapeHtml(action) + '" data-payload="' + escapeHtml(JSON.stringify(payload || {})) + '"' + (disabled ? ' disabled' : '') + '>' + escapeHtml(label) + detail + '</button>';
  }

  function panel(name, body, panelId) {
    return '<section class="panel"' + (panelId ? ' data-panel="' + escapeHtml(panelId) + '"' : '') + '><h2 class="panel-title">' + escapeHtml(name) + '</h2><div class="panel-body">' + body + '</div></section>';
  }

  function recommendedFocus(next) {
    var key = String(next && next.key || '') + ' ' + String(next && next.action || '') + ' ' + String(next && next.callback_data || '');
    if (/feed|sleep|clean|play|health/.test(key)) return 'care';
    if (/activity/.test(key)) return 'timed-activity';
    if (/mission/.test(key)) return 'missions';
    if (/evol/.test(key)) return 'evolution';
    if (/season/.test(key)) return 'season';
    if (/achievement|trait/.test(key)) return 'achievements';
    if (/weekly.boss/.test(key)) return 'weekly-boss';
    if (/seasonal.boss/.test(key)) return 'seasonal-boss';
    if (/district/.test(key)) return 'districts';
    if (/event.chain/.test(key)) return 'story-chains';
    if (/arena/.test(key)) return 'arena';
    if (/kaiju/.test(key)) return 'kaiju';
    if (/run|adventure/.test(key)) return 'moon-run';
    if (/job|work/.test(key)) return 'jobs';
    if (/bount/.test(key)) return 'bounties';
    if (/expedition/.test(key)) return 'expedition';
    if (/market/.test(key)) return 'market';
    if (/cosmetic/.test(key)) return 'style-lab';
    if (/gear|upgrade/.test(key)) return 'equipment';
    if (/shop|buy/.test(key)) return 'shop';
    if (/prestige/.test(key)) return 'prestige';
    return 'care';
  }

  function meter(label, value, invert) {
    var amount = Math.max(0, Math.min(100, Number(value) || 0));
    if (invert) amount = 100 - amount;
    return '<div class="meter"><span>' + escapeHtml(label) + '</span><span class="meter-track"><span class="meter-fill" style="width:' + amount + '%"></span></span><strong>' + Math.floor(amount) + '</strong></div>';
  }

  function renderHud() {
    if (!state || !state.pet) { hud.innerHTML = ''; return; }
    var pet = state.pet;
    hud.innerHTML = [
      ['LVL', pet.level], ['GOLD', number(pet.moon_gold)], ['GEMS', number(pet.moon_crystals)],
    ].map(function (item) { return '<div class="hud-chip"><strong>' + item[0] + '</strong> ' + escapeHtml(item[1]) + '</div>'; }).join('');
  }

  function renderHome() {
    if (!state.adopted) {
      return panel('DORMANT MOON EGG', '<div class="line">NO COMPANION RECORD FOUND.</div><div class="button-grid one">' + button('INITIALISE MOONPET', 'adopt') + '</div>');
    }
    var pet = state.pet;
    var lifecycle = state.lifecycle || {};
    var incubation = lifecycle.incubation || {};
    if (lifecycle.phase === 'egg') {
      var signals = incubation.signals || {};
      return '<div class="ticker"><span>MOON EGG // SIGNAL ' + number(incubation.progress) + '/' + number(incubation.target) + ' // IDENTITY FORMING //</span></div>' +
        panel('INCUBATION CHAMBER', '<div class="line complete">THE EGG REMEMBERS HOW YOU TREAT IT.</div><div class="line muted">Use at least three types of care. Your pattern shapes the hatch; no species odds are exposed.</div>' + meter('HATCH SIGNAL', Number(incubation.progress || 0) / Math.max(1, Number(incubation.target || 12)) * 100) + '<div class="line">WARM ' + number(signals.warm) + ' // TALK ' + number(signals.talk) + ' // MUSIC ' + number(signals.music) + ' // REST ' + number(signals.rest) + '</div><div class="button-grid">' + button('WARM EGG', 'incubate', { care_type: 'warm' }) + button('TALK TO EGG', 'incubate', { care_type: 'talk' }) + button('PLAY A BEAT', 'incubate', { care_type: 'music' }) + button('LET IT REST', 'incubate', { care_type: 'rest' }) + '</div><div class="button-grid one">' + button('HATCH MOONPET', 'hatch', {}, { disabled: !incubation.ready }) + '</div><div class="line muted">DAILY SIGNALS ' + number(incubation.actions_today) + '/' + number(incubation.daily_cap) + '</div>', 'incubation');
    }
    var next = state.next || {};
    var nextKey = String(next.key || '') + ' ' + String(next.callback_data || '') + ' ' + String(next.title || '');
    var nextScreen = next.destination || (/buy|shop|market|bount|econom|gear|cosmetic/i.test(nextKey) ? 'economy' : /run|boss|arena|adventure|district|event.chain/i.test(nextKey) ? 'explore' : /job|work|activity/i.test(nextKey) ? 'work' : /mission/i.test(nextKey) ? 'missions' : /evol|season|achievement|trait|prestige/i.test(nextKey) ? 'profile' : 'home');
    var focus = recommendedFocus(next);
    var equipped = ['food', 'toy', 'outfit', 'armor', 'weapon', 'charm'].map(function (slot) {
      return '<div class="line"><strong>' + slot.toUpperCase() + '</strong> // ' + escapeHtml(words(pet['equipped_' + slot] || (slot === 'food' ? 'basic food' : slot === 'toy' ? 'basic toy' : 'none equipped'))) + '</div>';
    }).join('');
    return '<div class="ticker"><span>MOONPET OS // ' + escapeHtml(pet.pet_name || 'MOONPET') + ' // ' + escapeHtml(words(pet.stage)) + ' // STREAK ' + number(pet.streak_days) + ' DAYS //</span></div>' +
      panel('RECOMMENDED NEXT MOVE', '<div class="line complete">' + escapeHtml(next.title || 'Maintain current route') + '</div><div class="line muted">' + escapeHtml(next.detail || 'All systems nominal.') + '</div><div class="button-grid one"><button class="terminal-button" type="button" data-jump="' + nextScreen + '" data-focus="' + focus + '">OPEN RECOMMENDED ROUTE</button></div>', 'recommended') +
      panel('VITAL SYSTEMS', meter('HEALTH', pet.health) + meter('ENERGY', pet.energy) + meter('HUNGER', pet.hunger, true) + meter('FUN', pet.happiness) + meter('CLEAN', pet.cleanliness), 'vitals') +
      panel('CARE CONSOLE', '<div class="button-grid">' +
        button('FEED', 'feed') + button('PLAY', 'play') + button('CLEAN', 'clean') + button('SLEEP', 'sleep') + button('TRAIN', 'train') + button('DAILY CACHE', 'daily_chest') +
      '</div>', 'care') +
      panel('COMPANION DETAILS', '<div class="line complete">' + escapeHtml(lifecycle.species_name || words(pet.species)) + ' // ' + escapeHtml(words(lifecycle.phase || pet.stage)) + '</div><div class="line">LEVEL ' + number(pet.level) + ' // ' + number(pet.pet_xp) + ' XP // ' + number(pet.style_tokens) + ' STYLE // ' + number(pet.streak_days) + '-DAY STREAK</div><div class="line muted">' + escapeHtml(words(lifecycle.temperament || 'forming')) + ' TEMPERAMENT // ' + escapeHtml(words(lifecycle.appearance && lifecycle.appearance.marking || 'moon mark')) + '</div>' + equipped, 'details');
  }

  function renderMissions() {
    var guidance = state.guidance || {};
    var missions = state.guidance && state.guidance.missions || [];
    var rows = missions.map(function (mission) {
      return '<div class="line ' + (mission.completed ? 'complete' : '') + '">' + (mission.completed ? '[OK] ' : '[  ] ') + escapeHtml(mission.title) + '</div>';
    }).join('') || '<div class="line muted">NO MISSION DATA.</div>';
    var achievements = state.guidance && state.guidance.achievements || [];
    var unlockedCount = achievements.filter(function (entry) { return entry.unlocked_at; }).length;
    var achievementRows = achievements.map(function (entry) {
      return '<div class="line ' + (entry.unlocked_at ? 'complete' : '') + '">' + (entry.unlocked_at ? '[UNLOCKED] ' : '[LOCKED] ') + escapeHtml(entry.title) + ' ' + number(Math.min(entry.progress, entry.target)) + '/' + number(entry.target) + '</div><div class="line muted">' + escapeHtml(entry.description || '') + '</div>';
    }).join('');
    return panel('DAILY MISSION BUFFER', '<div class="line muted">DAY ' + escapeHtml(guidance.day_key || 'UTC') + ' // WEEK ' + escapeHtml(guidance.week_key || 'UTC') + '</div>' + rows, 'missions') +
      panel('ACHIEVEMENT ARCHIVE // ' + number(unlockedCount) + '/' + number(achievements.length), achievementRows || '<div class="line muted">EMPTY ARCHIVE.</div>', 'achievements');
  }

  function renderExplore() {
    var guidance = state.guidance || {};
    var encounter = state.encounter;
    var eventButtons = encounter ? encounter.choices.map(function (choice) {
      return button(choice.label, 'random_event', { choice: choice.key, challenge_token: encounter.challenge_token });
    }).join('') : '';
    var adventure = state.adventure;
    var adventureButtons = adventure ? adventure.choices.map(function (choice) {
      return button(choice.label, 'adventure', { adventure_key: choice.key, challenge_token: adventure.challenge_token });
    }).join('') : '';
    var boss = guidance.weekly_boss || {};
    var run = state.run;
    var runBody;
    if (run) {
      runBody = '<div class="line">DEPTH ' + number(run.current_room != null ? run.current_room : run.depth) + '/' + number(run.max_room || run.max_depth) + ' // RISK ' + number(run.risk_level) + '</div><div class="line muted">UNBANKED: ' + number(run.unbanked_pet_xp) + ' XP / ' + number(run.unbanked_moon_gold) + ' GOLD</div><div class="button-grid">' +
        (run.choices || []).map(function (choice) { return button(choice.label, 'run_step', { run_id: run.run_id, choice_key: choice.key, expected_step_index: run.expected_step_index }); }).join('') +
        button('EXTRACT', 'run_extract', { run_id: run.run_id }, { danger: true }) + '</div>';
    } else {
      runBody = '<div class="line">NO ACTIVE RUN.</div><div class="button-grid">' + button('START MOON RUN', 'run_start') + button('DAILY RUN', 'daily_run_start') + '</div>';
    }
    var arena = state.arena;
    var arenaQueue = state.arena_queue;
    var arenaBody;
    if (arena) {
      var arenaHeader = '<div class="line complete">' + escapeHtml(arena.mode === 'multiplayer' ? 'PLAYER VS PLAYER' : 'PLAYER VS CRT') + ' // ' + escapeHtml(arena.opponent && arena.opponent.pet_name || 'RIVAL') + '</div><div class="line">ROUND ' + number(arena.current_round) + ' // HP ' + number(arena.player_hp) + ' : ' + number(arena.opponent_hp) + '</div>';
      arenaBody = arenaHeader + (arena.status === 'readying'
        ? '<div class="line muted">' + (arena.ready ? 'YOU ARE READY. WAITING FOR RIVAL.' : 'MATCH FOUND. LOCK IN WHEN READY.') + '</div><div class="button-grid">' + button('READY', 'arena_ready', { battle_id: arena.battle_id }, { disabled: arena.ready }) + button('FORFEIT MATCH', 'arena_forfeit', { battle_id: arena.battle_id }, { danger: true }) + '</div>'
        : '<div class="button-grid three">' + ['ah:ATTACK HEAD', 'ab:ATTACK BODY', 'bh:BLOCK HEAD', 'bb:BLOCK BODY', 'ch:CHARGE', 'sp:SPECIAL'].map(function (move) { var bits = move.split(':'); return button(bits[1], 'arena_move', { battle_id: arena.battle_id, expected_round: arena.current_round, move: bits[0] }); }).join('') + '</div><div class="button-grid one">' + button('FORFEIT BATTLE', 'arena_forfeit', { battle_id: arena.battle_id }, { danger: true }) + '</div>');
    } else if (arenaQueue) {
      arenaBody = '<div class="line">MATCHMAKING QUEUE // POSITION ' + number(arenaQueue.position) + ' // ' + escapeHtml(words(arenaQueue.rank_bucket)) + '</div><div class="button-grid">' +
        button('ACCEPT ANY RANK', 'arena_matchmake', { accept_any_rank: true }, { disabled: arenaQueue.accept_any_rank }) + button('LEAVE QUEUE', 'arena_queue_cancel', {}, { danger: true }) + '</div>';
    } else {
      var arenaResult = state.arena_result;
      arenaBody = (arenaResult ? '<div class="line complete">LAST RESULT // ' + escapeHtml(words(arenaResult.outcome || arenaResult.result)) + ' // ' + escapeHtml(arenaResult.opponent && arenaResult.opponent.pet_name || 'RIVAL') + '</div>' : '') + '<div class="line muted">RANKED PLAYER MATCHMAKING OR SOLO PRACTICE.</div><div class="button-grid">' + button('FIND PLAYER BATTLE', 'arena_matchmake') + button('ENTER SOLO ARENA', 'arena_start') + '</div>';
    }
    var kaiju = state.kaiju || {};
    var kaijuMatch = kaiju.match;
    var kaijuQueue = kaiju.queue;
    var kaijuBody = kaijuMatch
      ? '<div class="line">' + escapeHtml(kaijuMatch.mode === 'group' ? 'PLAYER VS PLAYER' : 'PLAYER VS CRT') + ' // TABLE ' + escapeHtml(kaijuMatch.match_id) + '</div><div class="line muted">' + (kaijuMatch.own_card_locked ? 'YOUR CARD LOCKED. ' : 'SELECT A CODE CARD. ') + (kaijuMatch.opponent_card_locked ? 'RIVAL LOCKED.' : 'WAITING ON RIVAL.') + '</div>' + (kaijuMatch.own_card_locked ? '' : '<div class="button-grid">' + (kaiju.cards || []).map(function (card) {
        var statLine = Object.entries(card.stats || {}).map(function (entry) { return entry[0].slice(0, 3).toUpperCase() + ':' + entry[1]; }).join(' ');
        return button(card.name, 'kaiju_card', { match_id: kaijuMatch.match_id, card_key: card.id }, { detail: statLine });
      }).join('') + '</div>')
      : kaijuQueue
        ? '<div class="line">KAIJU MATCHMAKING // POSITION ' + number(kaijuQueue.position) + '</div><div class="button-grid one">' + button('LEAVE KAIJU QUEUE', 'kaiju_queue_cancel', {}, { danger: true }) + '</div>'
        : (kaiju.result ? '<div class="line complete">LAST RESULT // ' + escapeHtml(words(kaiju.result.outcome || kaiju.result.result)) + '</div>' : '') + '<div class="line">PLAYER MATCHMAKING OR CRT PRACTICE.</div><div class="button-grid">' + button('FIND KAIJU PLAYER', 'kaiju_matchmake') + button('START SOLO KAIJU', 'kaiju_start') + '</div>';
    var regions = (state.regions || []).map(function (region) {
      return '<div class="region-entry ' + (region.playable ? 'complete' : 'locked') + '"><div class="line"><strong>' + escapeHtml(region.title) + '</strong> // ' + escapeHtml(region.used_today ? 'COMPLETE TODAY' : region.playable ? 'ONLINE' : region.status.toUpperCase()) + '</div><div class="line muted">' + escapeHtml(region.strapline) + '</div><div class="line">' + escapeHtml(region.lore) + '</div><div class="line">MASTERY ' + number(region.mastery_xp) + ' // BOSS: ' + escapeHtml(words(region.boss)) + ' // FOCUS: ' + escapeHtml(region.focus.map(words).join(' + ')) + '</div>' + (region.lock_reason ? '<div class="line locked">LOCK: ' + escapeHtml(region.lock_reason) + '</div>' : '<div class="button-grid one">' + button(region.used_today ? 'DISTRICT COMPLETE TODAY' : 'RUN DISTRICT MISSION // 10 ENERGY', 'district_mission', { region_key: region.key }, { disabled: !region.available }) + '</div>') + '</div>';
    }).join('');
    var live = state.live_systems || {};
    var chains = (live.chains || []).map(function (chain) {
      return '<div class="line">' + escapeHtml(words(chain.key)) + ' // STEP ' + number(chain.step_index + 1) + '/' + number(chain.steps.length) + '</div><div class="button-grid one">' + button(chain.used_today ? 'STEP COMPLETE TODAY' : 'CONTINUE // ' + words(chain.current_step), 'event_chain', { chain_key: chain.key }, { disabled: !chain.available }) + '</div>';
    }).join('');
    var seasonal = live.seasonal_boss || {};
    var seasonalBody = '<div class="line">' + escapeHtml(words(seasonal.title || 'offline')) + ' // ' + number(seasonal.damage) + '/' + number(seasonal.hp) + ' DAMAGE</div><div class="line muted">WEAKNESS ' + escapeHtml(words(seasonal.weakness)) + ' // REWARD ' + escapeHtml(words(seasonal.reward)) + '</div><div class="button-grid one">' + button(seasonal.attempted_today ? 'ATTACK USED TODAY' : 'ATTACK SEASONAL BOSS // 18 ENERGY', 'seasonal_boss', {}, { disabled: !seasonal.available }) + '</div>';
    var bossReward = valueText(boss.reward);
    var bossBody = '<div class="line">' + (boss.defeated ? 'TARGET DEFEATED.' : boss.attempt_used ? 'DAILY ATTEMPT USED.' : 'SELECT AN ATTACK ROUTINE.') + '</div>' +
      '<div class="line muted">HP ' + number(boss.remaining_hp) + '/' + number(boss.hp) + ' // DAMAGE ' + number(boss.damage) + ' // ATTEMPTS ' + number(boss.attempts) + '/' + number(boss.max_attempts || 7) + '</div>' +
      '<div class="line muted">WEAKNESS ' + escapeHtml(words(boss.weakness || 'unknown')) + ' // REWARD ' + escapeHtml(bossReward) + '</div>' +
      '<div class="button-grid three">' + button('STRIKE', 'weekly_boss', { move: 'strike' }, { disabled: !boss.available }) + button('OUTSMART', 'weekly_boss', { move: 'outsmart' }, { disabled: !boss.available }) + button('ENDURE', 'weekly_boss', { move: 'endure' }, { disabled: !boss.available }) + '</div>';
    return panel('DISTRICT NETWORK', regions, 'districts') + panel('MOON RUN', runBody, 'moon-run') +
      panel(adventure ? adventure.title : 'PET ADVENTURE', '<div class="line">' + escapeHtml(adventure ? adventure.intro : 'NO ADVENTURE SIGNAL.') + '</div><div class="button-grid three">' + adventureButtons + '</div>', 'adventure') +
      panel(encounter ? encounter.title : 'STREET EVENT', '<div class="line">' + escapeHtml(encounter ? encounter.intro : 'NO EVENT SIGNAL.') + '</div><div class="button-grid three">' + eventButtons + '</div>', 'street-event') +
      panel('WEEKLY BOSS // ' + (boss.title || 'LOCKED'), bossBody, 'weekly-boss') +
      panel('STREET STORY CHAINS', chains || '<div class="line muted">NO CHAIN SIGNAL.</div>', 'story-chains') + panel('SEASONAL RAID', seasonalBody, 'seasonal-boss') +
      panel('PET ARENA', arenaBody, 'arena') + panel('KAIJU CODE CARDS', kaijuBody, 'kaiju');
  }

  function renderWork() {
    var guidance = state.guidance || {};
    var jobs = guidance.jobs || state.jobs || [];
    var jobsHtml = jobs.map(function (job) {
      var specialistGate = job.required_track ? ' // ' + words(job.required_track).toUpperCase() + ' ' + number(job.current_xp) + '/' + number(job.required_xp) : '';
      var jobRewards = valueText({ pet_xp: job.pet_xp, moon_gold: job.moon_gold, moon_crystals: job.moon_crystals, style_tokens: job.style_tokens });
      return button(job.title, 'work', { job_key: job.key }, { disabled: job.available === false, detail: 'LVL ' + job.min_level + ' // STAGE ' + number(job.min_evolution_stage) + specialistGate + ' // REWARD ' + jobRewards + ' // ' + (job.lore || '') });
    }).join('');
    var activity = guidance.activity;
    var activityHtml = activity
      ? '<div class="line">ACTIVE: ' + escapeHtml(words(activity.activity_type)) + ' // ' + escapeHtml(activity.detail) + '</div><div class="button-grid">' + button('CLAIM', 'activity_claim', {}, { disabled: !activity.ready }) + button('CANCEL', 'activity_cancel', {}, { danger: true }) + '</div>'
      : '<div class="button-grid">' + ['sleep', 'train', 'work', 'explore'].map(function (kind) { return button(kind, 'activity_start', { activity_type: kind }); }).join('') + '</div>';
    return panel('TIMED ACTIVITY', activityHtml, 'timed-activity') + panel('JOB TERMINAL', '<div class="button-grid">' + jobsHtml + '</div>', 'jobs');
  }

  function valueText(value) {
    var output = [];
    Object.entries(value || {}).forEach(function (entry) {
      var key = entry[0];
      var amount = entry[1];
      if (amount == null || amount === 0) return;
      if ((key === 'items' || key === 'materials') && typeof amount === 'object') {
        Object.entries(amount).forEach(function (asset) { if (Number(asset[1]) > 0) output.push(number(asset[1]) + ' ' + words(asset[0])); });
      } else if (typeof amount !== 'object') output.push(number(amount) + ' ' + words(key));
    });
    return output.join(' + ') || 'FREE';
  }

  function costText(cost) {
    return valueText(cost);
  }

  function renderEconomy() {
    var guidance = state.guidance || {};
    var economy = guidance.economy || {};
    var bounties = (economy.bounties || []).map(function (bounty) {
      return '<div class="line ' + (bounty.complete ? 'complete' : '') + '">' + escapeHtml(bounty.title) + ' ' + number(bounty.progress) + '/' + number(bounty.required) + '</div>' +
        '<div class="line muted">' + escapeHtml(bounty.detail || '') + ' // REWARD ' + escapeHtml(valueText(bounty.reward)) + '</div>' +
        (bounty.complete && !bounty.claimed ? '<div class="button-grid one">' + button('CLAIM ' + bounty.title, 'bounty_claim', { bounty_key: bounty.key }) + '</div>' : '');
    }).join('');
    var offers = (economy.market_offers || []).map(function (offer) {
      return button(offer.title, 'market_buy', { offer_key: offer.key }, { disabled: !offer.unlocked || !offer.affordable || offer.purchased, detail: (offer.purchased ? 'SOLD // ' : '') + (offer.unlocked ? '' : 'REQUIRES LEVEL ' + number(offer.min_level) + ' // ') + (offer.detail || '') + ' // COST ' + costText(offer.cost) + ' // GIVES ' + valueText(offer.reward) });
    }).join('');
    var shop = (guidance.shop_items || []).map(function (item) {
      return button(item.title, 'buy', { item_key: item.key }, { disabled: !item.unlocked || !item.affordable || item.equipped, detail: item.equipped ? 'EQUIPPED // ' + (item.description || '') : (item.unlocked ? '' : 'REQUIRES LEVEL ' + number(item.min_level) + ' // ') + (item.description || '') + ' // COST ' + costText(item.cost) });
    }).join('');
    var inventory = (state.inventory || []).filter(function (item) { return Number(item.count || item.quantity || 0) > 0; }).map(function (item) {
      return '<div class="line">' + escapeHtml(words(item.title || item.key || item.item_key)) + ' x' + number(item.count || item.quantity) + '</div>' +
        ((item.kind === 'usable_item' || item.usable) ? '<div class="button-grid one">' + button('USE ' + (item.title || item.key), 'use_item', { item_key: item.key || item.item_key }) + '</div>' : '');
    }).join('');
    var expedition = economy.expedition || {};
    var live = state.live_systems || {};
    var upgrades = new Map((live.upgrades || []).map(function (item) { return [item.item_key, item]; }));
    var gear = (state.gear || []).map(function (item) {
      var upgrade = upgrades.get(item.item_key) || {};
      return '<div class="line complete">' + escapeHtml(words(item.slot)) + ' // ' + escapeHtml(words(item.item_key)) + '</div>' +
        '<div class="line muted">LEVEL ' + number(item.item_level) + ' // ITEM XP ' + number(item.item_xp) + ' // MASTERY ' + number(item.mastery_tier) + ' (' + number(item.mastery_xp) + ' XP)</div>' +
        (upgrade.maxed ? '<div class="line complete">MAX LEVEL</div>' : '<div class="button-grid one">' + button('UPGRADE TO LEVEL ' + number(upgrade.target_level), 'gear_upgrade', { item_key: item.item_key }, { disabled: !upgrade.affordable, detail: (upgrade.unlocked ? '' : 'REQUIRES LEVEL ' + number(upgrade.required_level) + ' // ') + costText(upgrade.cost) }) + '</div>');
    }).join('');
    var materials = (state.materials || []).map(function (item) {
      return '<div class="line ' + (item.quantity ? 'complete' : 'locked') + '">' + escapeHtml(item.label) + ' x' + number(item.quantity) + '</div><div class="line muted">SOURCE: ' + escapeHtml((item.sources || []).map(words).join(' / ')) + '</div>';
    }).join('');
    var relics = (state.relics || []).map(function (item) { return '<div class="line complete">◆ ' + escapeHtml(words(item.relic_id)) + '</div>'; }).join('');
    var cosmetics = (live.cosmetics || []).map(function (item) { return button(words(item.key), 'cosmetic_unlock', { cosmetic_key: item.key }, { disabled: !item.affordable || item.unlocked && !item.repeatable, detail: (item.unlocked ? 'OWNED x' + number(item.quantity) + ' // ' : '') + costText(item.cost) }); }).join('');
    return panel('EQUIPMENT PROGRESSION', gear || '<div class="line muted">NO EQUIPMENT MASTERY RECORDS.</div>', 'equipment') +
      panel('CRAFTING MATERIALS', materials || '<div class="line muted">NO MATERIAL DATA.</div>', 'materials') +
      panel('RELIC VAULT', relics || '<div class="line muted">NO RELICS RECOVERED.</div>', 'relics') +
      panel('DAILY BOUNTIES', bounties || '<div class="line muted">NO BOUNTIES.</div>', 'bounties') +
      panel('CRYSTAL EXPEDITION // ' + escapeHtml(expedition.title || 'LOCKED'), '<div class="line">' + number(economy.expedition_attempts_left) + '/3 ATTEMPTS // COST ' + number(expedition.energy) + ' ENERGY</div><div class="line muted">POSSIBLE FINDS // ' + escapeHtml((expedition.rewards || []).map(valueText).join(' / ')) + '</div><div class="button-grid one">' + button('RUN EXPEDITION', 'expedition', {}, { disabled: !economy.expedition_attempts_left || Number(state.pet && state.pet.energy || 0) < Number(expedition.energy || 0) }) + '</div>', 'expedition') +
      panel('MOON MARKET', '<div class="button-grid">' + offers + '</div>', 'market') +
      panel('PERMANENT SHOP', '<div class="button-grid">' + shop + '</div>', 'shop') + panel('STYLE LAB', '<div class="button-grid">' + cosmetics + '</div>', 'style-lab') +
      panel('INVENTORY', inventory || '<div class="line muted">BAG EMPTY.</div>', 'inventory') +
      panel('MOON GOLD TRADE', '<div class="button-grid three">' + [10, 25, 50].map(function (wager) { return button(wager + ' GOLD', 'trade', { wager: wager }); }).join('') + '</div>', 'trade');
  }

  function renderProfile() {
    if (!state.pet) return panel('IDENTITY CORE', '<div class="line muted">INITIALISE A MOONPET TO UNLOCK THIS MODULE.</div>');
    var guidance = state.guidance || {};
    var identity = guidance.identity || {};
    var evolution = guidance.evolution;
    var currentPerk = guidance.current_evolution_perk || {};
    var evoHtml = evolution
      ? '<div class="line complete">CURRENT PERK // ' + escapeHtml(currentPerk.perk || 'Memories and traits are active.') + '</div><div class="line">NEXT: ' + escapeHtml(evolution.name) + '</div><div class="line muted">NEXT PERK // ' + escapeHtml(evolution.perk || '') + '</div>' + (evolution.missing || []).map(function (entry) { return '<div class="line muted">' + escapeHtml(entry.label) + ' ' + number(entry.current) + '/' + number(entry.required) + ' // ' + escapeHtml(entry.source || '') + '</div>'; }).join('') + '<div class="button-grid one">' + button('EVOLVE', 'evolve', { evolution_id: evolution.evolution_id }, { disabled: !evolution.ready }) + '</div>'
      : '<div class="line complete">FINAL EVOLUTION ONLINE.</div><div class="line muted">' + escapeHtml(currentPerk.perk || '') + '</div>';
    var season = guidance.season || {};
    var tiers = (season.tiers || []).map(function (tier) {
      return '<div class="line ' + (tier.claimed_at ? 'complete' : tier.unlocked ? '' : 'locked') + '">' + escapeHtml(tier.title) + ' // ' + number(tier.required_xp) + ' XP</div>' +
        '<div class="line muted">REWARD ' + escapeHtml(valueText(tier.reward)) + ' // +' + number(season.evolution_bonus_style) + ' EVOLUTION STYLE</div>' +
        (tier.unlocked && !tier.claimed_at ? '<div class="button-grid one">' + button('CLAIM ' + tier.title, 'season_claim', { tier_id: tier.tier_id }) + '</div>' : '');
    }).join('');
    var traits = (guidance.personalities || []).map(function (trait) { return '<div class="line complete">[' + escapeHtml(words(trait.trait_id || trait.name || trait)) + ']</div>'; }).join('');
    var progress = state.progress || {};
    var learnedTraits = {};
    try { learnedTraits = JSON.parse(progress.traits_json || '{}'); } catch (_) {}
    var tracks = ['care', 'training', 'adventure', 'arena', 'job', 'bond'].map(function (key) {
      var xp = progress[key + '_xp'];
      return '<div class="line">' + escapeHtml(key.toUpperCase()) + ' XP ' + number(xp) + '</div>';
    }).join('');
    var leaders = (state.leaderboard || []).map(function (entry) {
      var form = entry.phase === 'rare'
        ? entry.rare_morph_name
        : entry.species_name || (entry.phase === 'egg' ? 'Moon Egg' : entry.stage);
      return '<div class="line">#' + number(entry.rank) + ' ' + escapeHtml(entry.pet_name || 'MOONPET') +
        ' // ' + escapeHtml(words(form || 'moonpet')) + ' // LVL ' + number(entry.level) + ' // ' + number(entry.pet_xp) + ' XP</div>' +
        '<div class="line muted">GOLD ' + number(entry.moon_gold) + ' // GEMS ' + number(entry.moon_crystals) +
        ' // STYLE ' + number(entry.style_tokens) + '</div>';
    }).join('');
    var notifications = state.notifications || {};
    var live = state.live_systems || {};
    var faction = live.faction || {};
    var prestige = live.prestige || {};
    var notificationPanel = '<div class="line ' + (notifications.enabled ? 'complete' : 'muted') + '">PROGRESSION ALERTS: ' + (notifications.enabled ? 'ONLINE' : 'OFFLINE') + '</div><div class="button-grid">' +
      button('ENABLE ALERTS', 'notification_set', { enabled: true }, { disabled: notifications.enabled }) +
      button('DISABLE ALERTS', 'notification_set', { enabled: false }, { disabled: !notifications.enabled, danger: true }) + '</div>';
    var aptitudeRows = ['brave', 'loyal', 'clever', 'stylish', 'tough', 'lucky'].map(function (key) { return '<div class="line">' + key.toUpperCase() + ' ' + number(learnedTraits[key]) + '</div>'; }).join('');
    var memory = identity.memories || {};
    var memoryRows = [
      memory.first_boss_id ? 'FIRST BOSS // ' + words(memory.first_boss_id) : '',
      Number(memory.total_runs) > 0 ? 'RUNS COMPLETED // ' + number(memory.total_runs) : '',
      Number(memory.total_bosses_defeated) > 0 ? 'BOSSES DEFEATED // ' + number(memory.total_bosses_defeated) : '',
      memory.favourite_activity ? 'FAVOURITE // ' + words(memory.favourite_activity) : '',
      Number(memory.biggest_reward_amount) > 0 ? 'BIGGEST REWARD // ' + number(memory.biggest_reward_amount) + ' ' + words(memory.biggest_reward_currency) : '',
      'CARE / EVENT / ADVENTURE / COMBAT // ' + number(memory.care_actions) + ' / ' + number(memory.event_actions) + ' / ' + number(memory.adventure_actions) + ' / ' + number(memory.combat_actions),
    ].filter(Boolean).map(function (line) { return '<div class="line">' + escapeHtml(line) + '</div>'; }).join('');
    var milestones = (memory.milestones || []).map(function (milestone) { return '<div class="line complete">◆ ' + escapeHtml(words(milestone)) + '</div>'; }).join('');
    var featureRows = (guidance.features || []).map(function (feature) {
      return '<div class="line ' + (feature.available ? 'complete' : 'locked') + '">' + (feature.available ? '[ONLINE] ' : '[LOCKED] ') + escapeHtml(feature.title) + '</div><div class="line muted">' + escapeHtml(feature.detail || '') + '</div>';
    }).join('');
    var lifecycle = state.lifecycle || {};
    var rare = lifecycle.rare || {};
    var innate = (lifecycle.innate_traits || []).map(function (trait) { return '<div class="line complete">◆ ' + escapeHtml(words(trait)) + '</div>'; }).join('');
    var rarePanel = '<div class="line ' + (rare.ready ? 'complete' : 'muted') + '">HIDDEN SIGNAL // ' + escapeHtml(words(rare.signal || 'dormant')) + ' // ' + number(rare.progress) + '%</div>' + (rare.name ? '<div class="line complete">REVEALED // ' + escapeHtml(rare.name) + '</div>' : '<div class="line muted">The route remains hidden until your evolution, traits and memories align.</div>') + (rare.ready ? '<div class="button-grid one">' + button('ANSWER RARE SIGNAL', 'rare_morph') + '</div>' : '');
    return panel('IDENTITY CORE', '<div class="line complete">' + escapeHtml(lifecycle.species_name || identity.current_stage && identity.current_stage.name || words(state.pet.stage)) + ' // ' + escapeHtml(words(lifecycle.phase || 'companion')) + '</div><div class="line muted">' + escapeHtml(words(lifecycle.temperament || 'forming')) + ' TEMPERAMENT</div>' + innate + '<div class="line muted">LEARNED PERSONALITY</div>' + (traits || '<div class="line muted">TRAITS STILL FORMING.</div>')) + panel('HIDDEN MORPH SIGNAL', rarePanel, 'rare-morph') +
      panel('LEARNED APTITUDES', aptitudeRows) +
      panel('MEMORY ARCHIVE', memoryRows + (milestones || '<div class="line muted">NO MILESTONES RECORDED YET.</div>'), 'memories') +
      panel('CALLSIGN', '<label class="line" for="pet-name-input">MOONPET NAME</label><input id="pet-name-input" class="terminal-input" maxlength="32" value="' + escapeHtml(state.pet.pet_name || '') + '"><div class="button-grid one">' + button('WRITE NEW CALLSIGN', 'rename') + '</div>') +
      panel('EVOLUTION', evoHtml, 'evolution') + panel('FACTION PERK', '<div class="line complete">' + escapeHtml(words(faction.key || 'unaligned')) + '</div><div class="line muted">' + escapeHtml(faction.bonus ? words(faction.bonus.system) + ' // ' + costText(faction.bonus.effect) : 'JOIN A FACTION TO ACTIVATE A GAMEPLAY BONUS') + '</div>', 'faction') +
      panel('PRESTIGE', '<div class="line">RANK ' + number(prestige.count) + ' // MASTERED GEAR ' + number(prestige.mastered_items) + '/3 // DISTRICTS ' + number(prestige.completed_regions) + '/4</div><div class="line muted">REQUIRES LEVEL 100 + 5,000 GOLD + 50 GEMS</div><div class="button-grid one">' + button('ASCEND PRESTIGE', 'prestige', {}, { disabled: !prestige.ready }) + '</div>', 'prestige') +
      panel('SPECIALIST TRACKS', tracks, 'tracks') + panel('UNLOCK DIRECTORY', featureRows, 'features') + panel('ALERT CONTROL', notificationPanel, 'alerts') + panel('SEASON // ' + (season.key || ''), '<div class="line">' + number(season.xp) + ' SEASON XP</div>' + tiers, 'season') + panel('TOP MOONPETS', leaders, 'leaderboard');
  }

  var screens = { home: renderHome, missions: renderMissions, explore: renderExplore, work: renderWork, economy: renderEconomy, profile: renderProfile };
  var navItems = [
    ['home', '⌂', 'PET'], ['missions', '☷', 'TASKS'], ['explore', '⚔', 'RUN'], ['work', '⚒', 'WORK'], ['economy', '◇', 'GEAR'], ['profile', '★', 'CORE'],
  ];

  function renderNav() {
    nav.innerHTML = navItems.map(function (item) {
      return '<button type="button" data-screen="' + item[0] + '" aria-current="' + (item[0] === activeScreen ? 'page' : 'false') + '"><span>' + item[1] + '</span>' + item[2] + '</button>';
    }).join('');
  }

  function render() {
    renderHud();
    renderNav();
    screen.innerHTML = state ? screens[activeScreen]() : '';
    title.textContent = state && state.pet ? (state.pet.pet_name || 'MOONPET') + ' OS' : 'MOONPET OS';
    if (reducedMotion) drawWorld(0);
  }

  function resultMessage(result) {
    if (!result) return 'SYSTEM RESPONSE LOST.';
    var reward = result.rewards || result.applied || result.computed && result.computed.rewards || {};
    var gains = Object.entries(reward).filter(function (entry) { return Number(entry[1]) > 0 && typeof entry[1] !== 'object'; }).map(function (entry) { return '+' + number(entry[1]) + ' ' + words(entry[0]); });
    var parts = [result.accepted ? 'ACTION ACCEPTED' : 'ACTION BLOCKED', words(result.reason)];
    var terminalResult = result.battle && (result.battle.outcome || result.battle.result) || result.match && (result.match.outcome || result.match.result) || result.resolved && result.resolved.result;
    if (terminalResult) parts.push('OUTCOME ' + words(terminalResult.replace('player1', 'you').replace('player2', 'opponent')));
    if (result.result_copy) parts.push(String(result.result_copy));
    if (result.damage) parts.push('DAMAGE ' + number(result.damage));
    if (result.pet_xp_awarded) parts.push('+' + number(result.pet_xp_awarded) + ' PET XP');
    if (gains.length) parts.push(gains.join(' // '));
    if (result.reaction) parts.push('MOONPET: ' + String(result.reaction));
    return parts.join(' // ');
  }

  function scrollToPanel(panelId) {
    if (!panelId) return;
    window.setTimeout(function () {
      var target = screen.querySelector('[data-panel="' + CSS.escape(panelId) + '"]');
      if (target) {
        var relativeTop = target.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop;
        screen.scrollTo({ top: Math.max(0, relativeTop - 8), behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    }, 0);
  }

  async function showPendingNotices() {
    var notices = state && Array.isArray(state.notices) ? state.notices : [];
    if (!notices.length || noticesBusy) return;
    noticesBusy = true;
    var visible = notices.slice(0, 5);
    haptic('success');
    await typeBoot(['PROGRESSION MILESTONE DETECTED'].concat(visible.map(function (notice) { return notice.title + (notice.detail ? ' // ' + notice.detail : ''); })), { speed: 6, hold: 1600, notice: true });
    try {
      var acknowledged = await post('/telegram-pets/app/action', { action: 'guidance_ack', notice_keys: visible.map(function (notice) { return notice.key; }), request_id: crypto.randomUUID() });
      state = acknowledged.state || state;
      render();
    } catch (_) {}
    noticesBusy = false;
  }

  function actionAnimationFamily(action, payload) {
    var key = String(action || '').toLowerCase();
    if (key === 'activity_start') key = String(payload && payload.activity_type || '').toLowerCase();
    if (key === 'activity_claim') return 'celebrate';
    if (key === 'activity_cancel') return 'interact';
    if (/feed|use_item/.test(key)) return 'feed';
    if (/play/.test(key)) return 'play';
    if (/clean/.test(key)) return 'clean';
    if (/hatch|rare_morph/.test(key)) return 'evolve';
    if (/incubate/.test(key)) return String(payload && payload.care_type || '') === 'music' ? 'play' : String(payload && payload.care_type || '') === 'rest' ? 'sleep' : 'interact';
    if (/sleep|rest/.test(key)) return 'sleep';
    if (/train/.test(key)) return 'train';
    if (/boss|arena|kaiju|fight|attack|district/.test(key)) return 'battle';
    if (/run|adventure|expedition|random_event|event_chain/.test(key)) return 'travel';
    if (/job|activity|work/.test(key)) return 'work';
    if (/buy|market|equipment|cosmetic|gear/.test(key)) return 'equip';
    if (/evolve|prestige/.test(key)) return 'evolve';
    if (/trade/.test(key)) return 'trade';
    if (/claim|chest|bounty|season|reward|achievement/.test(key)) return 'celebrate';
    return 'interact';
  }

  function animateAction(action, accepted, duration, payload) {
    animationMode = accepted === false ? 'blocked' : actionAnimationFamily(action, payload);
    animationLabel = accepted === false ? 'NOT READY' : words(animationMode);
    actionSequence += 1;
    var animationDuration = duration || 2400;
    animationUntil = performance.now() + animationDuration;
    if (reducedMotion) {
      window.clearTimeout(reducedMotionAnimationTimer);
      var sequence = actionSequence;
      drawWorld(performance.now());
      reducedMotionAnimationTimer = window.setTimeout(function () {
        if (sequence !== actionSequence) return;
        animationMode = 'idle';
        animationLabel = '';
        drawWorld(performance.now());
      }, animationDuration);
    }
  }

  async function runAction(action, payload, buttonElement) {
    if (busy) return;
    busy = true;
    if (buttonElement) buttonElement.classList.add('is-active');
    haptic('medium');
    animateAction(action, true, 8000, payload);
    tell('TRANSMITTING ' + words(action) + '...');
    try {
      var data = await post('/telegram-pets/app/action', Object.assign({ action: action, request_id: crypto.randomUUID() }, payload || {}));
      state = data.state || state;
      var message = resultMessage(data.result);
      tell(message, data.result && data.result.accepted ? '' : 'danger');
      haptic(data.result && data.result.accepted ? 'success' : 'error');
      animateAction(action, Boolean(data.result && data.result.accepted), 2800, payload);
      render();
      await typeBoot(['EXEC ' + action.toUpperCase(), message, 'STATE CACHE REFRESHED'], { speed: 5, hold: actionResultHoldMs });
      await showPendingNotices();
    } catch (error) {
      animateAction('blocked', false, 2800);
      tell(error.message || 'CONNECTION FAILED', 'danger');
      haptic('error');
      await typeBoot(['FAULT DETECTED', error.message || 'CONNECTION FAILED', 'RETRY WHEN LINK IS STABLE'], { speed: 8, hold: 2200 });
    } finally {
      busy = false;
      if (buttonElement) buttonElement.classList.remove('is-active');
    }
  }

  screen.addEventListener('click', function (event) {
    var jump = event.target.closest('[data-jump]');
    if (jump && !busy) {
      activeScreen = jump.dataset.jump;
      render();
      scrollToPanel(jump.dataset.focus);
      haptic('light');
      typeBoot(['ROUTING COACH RECOMMENDATION', 'MOUNT /' + activeScreen.toUpperCase(), 'REQUIREMENTS DISPLAYED'], { speed: 4, hold: 150 });
      return;
    }
    var target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    var payload = {};
    try { payload = JSON.parse(target.dataset.payload || '{}'); } catch (_) {}
    if (target.dataset.action === 'rename') {
      var input = document.getElementById('pet-name-input');
      payload.pet_name = input ? input.value.trim() : '';
    }
    runAction(target.dataset.action, payload, target);
  });

  nav.addEventListener('click', function (event) {
    var target = event.target.closest('[data-screen]');
    if (!target || busy) return;
    activeScreen = target.dataset.screen;
    render();
    screen.scrollTop = 0;
    haptic('light');
    typeBoot(['MOUNT /' + activeScreen.toUpperCase(), 'READING LIVE PLAYER STATE', 'MODULE READY'], { speed: 4, hold: 130 });
    if (activeScreen === 'explore' || activeScreen === 'work') refreshLiveState();
  });

  function multiplayerFingerprint(snapshot) {
    var arena = snapshot && snapshot.arena;
    var kaiju = snapshot && snapshot.kaiju && snapshot.kaiju.match;
    return [arena && arena.battle_id, arena && arena.status, arena && arena.current_round, arena && arena.opponent_ready,
      snapshot && snapshot.arena_queue && snapshot.arena_queue.position, kaiju && kaiju.match_id, kaiju && kaiju.status,
      kaiju && kaiju.opponent_card_locked, snapshot && snapshot.kaiju && snapshot.kaiju.queue && snapshot.kaiju.queue.position].join('|');
  }

  async function refreshLiveState() {
    var multiplayerActive = state && (state.arena || state.arena_queue || state.kaiju && (state.kaiju.match || state.kaiju.queue));
    var activityActive = state && state.guidance && state.guidance.activity;
    var relevant = activeScreen === 'explore' && multiplayerActive || activeScreen === 'work' && activityActive;
    var minimumDelay = multiplayerActive && activeScreen === 'explore' ? 4500 : 14000;
    if (busy || noticesBusy || !state || !state.adopted || !relevant || Date.now() - lastPassiveRefreshAt < minimumDelay) return;
    lastPassiveRefreshAt = Date.now();
    var before = multiplayerFingerprint(state);
    try {
      var data = await post('/telegram-pets/app/state');
      if (!data.state) return;
      state = data.state;
      render();
      var after = multiplayerFingerprint(state);
      if (before !== after && activeScreen === 'explore') {
        tell('MULTIPLAYER STATE UPDATED.');
        haptic('light');
      } else if (activeScreen === 'work' && state.guidance && state.guidance.activity && state.guidance.activity.ready) {
        tell('TIMED ACTIVITY REWARD READY.');
        haptic('success');
      }
      await showPendingNotices();
    } catch (_) {}
  }

  function drawPixelRect(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }

  function petStage(pet) {
    if (!pet) return 0;
    var explicit = pet.evolution_stage == null ? NaN : Number(pet.evolution_stage);
    if (Number.isFinite(explicit)) return Math.max(0, Math.min(4, explicit));
    var label = String(pet.stage || '').toLowerCase();
    if (label.includes('legend')) return 4;
    if (label.includes('elite')) return 3;
    if (label.includes('cyber')) return 2;
    if (label.includes('street')) return 1;
    return 0;
  }

  function petMood(pet) {
    if (!pet) return 'curious';
    if (Number(pet.health) < 35) return 'hurt';
    if (Number(pet.energy) < 20) return 'tired';
    if (Number(pet.hunger) > 78) return 'hungry';
    if (Number(pet.cleanliness) < 30) return 'scruffy';
    if (Number(pet.happiness) > 78) return 'happy';
    return 'curious';
  }

  function drawPixelText(text, x, y, color, align) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.fillStyle = color; ctx.font = 'bold 8px "Courier New", monospace'; ctx.textAlign = align || 'left';
    ctx.fillText(String(text), x, y);
    ctx.restore();
  }

  function drawActionEffects(time, x, y, active) {
    if (!active) return;
    var phase = Math.floor(time / 90) + actionSequence * 7;
    var i;
    if (animationMode === 'feed') {
      drawPixelRect(x + 36, y - 7, 15, 8, '#ffb84d'); drawPixelRect(x + 43, y - 13, 6, 6, '#f4ff65');
      drawPixelText('NOM!', x + 52, y - 20, '#f4ff65', 'center');
    } else if (animationMode === 'play') {
      var ballX = x + Math.round(Math.sin(time / 105) * 48); var ballY = y - 10 - Math.abs(Math.round(Math.cos(time / 105) * 25));
      drawPixelRect(ballX - 5, ballY - 5, 10, 10, '#f6a7ff'); drawPixelRect(ballX - 2, ballY - 2, 4, 4, '#61f5ff');
    } else if (animationMode === 'clean') {
      for (i = 0; i < 7; i += 1) { var bubbleY = y - 5 - ((phase * 3 + i * 13) % 62); drawPixelRect(x - 45 + i * 15, bubbleY, 4 + i % 2, 4 + i % 2, '#b3ffff'); }
    } else if (animationMode === 'sleep') {
      drawPixelText('Z', x + 33, y - 32, '#d8f9ff'); drawPixelText('Z', x + 43, y - 45, '#d8f9ff'); drawPixelText('Z', x + 55, y - 60, '#d8f9ff');
    } else if (animationMode === 'train') {
      drawPixelRect(x - 55, y - 7, 34, 5, '#aab5ae'); drawPixelRect(x - 59, y - 13, 5, 17, '#aab5ae'); drawPixelRect(x - 65, y - 16, 6, 23, '#4ea85a');
      drawPixelText('+XP', x + 45, y - 40, '#f4ff65', 'center');
    } else if (animationMode === 'battle') {
      for (i = 0; i < 4; i += 1) { var slash = (phase * 6 + i * 17) % 70; drawPixelRect(x - 50 + slash, y - 55 + i * 9, 18, 2, i % 2 ? '#ff6d6d' : '#f4ff65'); }
      drawPixelText('COMBO!', x, y - 65, '#ff6d6d', 'center');
    } else if (animationMode === 'travel') {
      for (i = 0; i < 6; i += 1) drawPixelRect(x - 62 - ((phase * 4 + i * 15) % 42), y + 18 - i % 3 * 5, 8, 2, '#4ea85a');
      drawPixelText('RUN!', x + 44, y - 45, '#f4ff65', 'center');
    } else if (animationMode === 'work') {
      drawPixelRect(x + 36, y - 28, 4, 28, '#ffcf68'); drawPixelRect(x + 29, y - 33, 19, 7, '#aab5ae');
      drawPixelText('WORK', x + 43, y - 43, '#f4ff65', 'center');
    } else if (animationMode === 'equip') {
      for (i = 0; i < 5; i += 1) { var sparkle = (phase + i * 11) % 40; drawPixelRect(x - 46 + i * 23, y - 18 - sparkle, 3, 3, '#61f5ff'); }
      drawPixelText('GEAR ON', x, y - 65, '#61f5ff', 'center');
    } else if (animationMode === 'evolve') {
      ctx.strokeStyle = phase % 2 ? '#f6a7ff' : '#f4ff65'; ctx.lineWidth = 3; ctx.strokeRect(x - 45 - phase % 8, y - 58 - phase % 8, 90 + phase % 16, 82 + phase % 16);
      drawPixelText('EVOLVING', x, y - 70, '#f6a7ff', 'center');
    } else if (animationMode === 'trade' || animationMode === 'celebrate') {
      for (i = 0; i < 8; i += 1) { var coinY = y - ((phase * 4 + i * 17) % 76); drawPixelRect(x - 55 + i * 16, coinY, 5, 5, i % 3 ? '#f4ff65' : '#61f5ff'); }
      drawPixelText(animationMode === 'trade' ? 'DEAL!' : 'REWARD!', x, y - 68, '#f4ff65', 'center');
    } else if (animationMode === 'blocked') {
      drawPixelRect(x - 50, y - 58, 100, 3, '#ff6d6d'); drawPixelRect(x - 50, y - 58, 3, 20, '#ff6d6d');
      drawPixelText('NOT READY', x, y - 45, '#ff6d6d', 'center');
    } else {
      drawPixelText('!', x + 40, y - 44, '#f4ff65', 'center');
    }
  }

  function petPalette(lifecycle, stage) {
    var palettes = {
      mint_punch: ['#80ffd5', '#36a878', '#f4ff65'],
      coral_pop: ['#ff8bbd', '#c84f78', '#61f5ff'],
      cobalt_lime: ['#61a8ff', '#3158a8', '#a9ff55'],
      gold_violet: ['#f4cf58', '#8450aa', '#f6a7ff'],
      lavender_ice: ['#d8b7ff', '#7757a8', '#b3ffff'],
      turquoise_flame: ['#61f5ff', '#158f94', '#ff954f'],
    };
    var species = {
      neon_raccoon: ['#80ffd5', '#2c8f70', '#f4ff65'],
      bubble_ram: ['#ff8bbd', '#a84770', '#61f5ff'],
      comet_gecko: ['#61a8ff', '#3158a8', '#a9ff55'],
      vinyl_crab: ['#f4ff65', '#bd703b', '#ff8bbd'],
      lantern_fox: ['#c99cff', '#713d91', '#ffcf68'],
      sneaker_snail: ['#a9ff55', '#4d9938', '#61f5ff'],
      alley_drake: ['#ff954f', '#9c4329', '#f4ff65'],
      moon_ferret: ['#61f5ff', '#277f91', '#f6a7ff'],
    };
    var selected = palettes[lifecycle && lifecycle.appearance && lifecycle.appearance.palette]
      || species[lifecycle && lifecycle.species_id]
      || ['#a9ff9a', '#4ea85a', '#f4ff65'];
    if (stage >= 4) selected = [selected[0], selected[1], '#f6a7ff'];
    return { body: selected[0], shade: selected[1], accent: selected[2], outline: '#061009' };
  }

  function petPose(time, active, mood) {
    var pose = { x: 0, y: 0, headY: 0, squashX: 1, squashY: 1, arm: 0, tail: 0 };
    if (!active) {
      pose.y = mood === 'tired' ? 2 : Math.round(Math.sin(time / 270) * 2);
      pose.headY = mood === 'hurt' ? 2 : 0;
      return pose;
    }
    if (animationMode === 'feed') { pose.headY = 5; pose.arm = 7; pose.squashY = 0.96; }
    else if (animationMode === 'play') { pose.x = Math.round(Math.sin(time / 70) * 20); pose.y = -Math.abs(Math.round(Math.sin(time / 80) * 7)); pose.arm = -8; pose.tail = 13; }
    else if (animationMode === 'clean') { pose.x = Math.round(Math.sin(time / 90) * 3); pose.squashX = 1.04; }
    else if (animationMode === 'sleep') { pose.y = 7; pose.headY = 5; pose.squashX = 1.12; pose.squashY = 0.84; }
    else if (animationMode === 'train') { pose.y = -Math.abs(Math.round(Math.sin(time / 80) * 11)); pose.arm = -10; }
    else if (animationMode === 'battle') { pose.x = Math.round(Math.sin(time / 65) * 7); pose.headY = -2; pose.arm = -11; }
    else if (animationMode === 'travel') { pose.x = Math.round(Math.sin(time / 115) * 12); pose.y = -Math.abs(Math.round(Math.sin(time / 90) * 4)); pose.tail = 9; }
    else if (animationMode === 'work') { pose.headY = 2; pose.arm = -7; }
    else if (animationMode === 'celebrate' || animationMode === 'evolve') { pose.y = -Math.abs(Math.round(Math.sin(time / 80) * 11)); pose.arm = -13; pose.tail = 14; }
    else if (animationMode === 'blocked') { pose.x = Math.round(Math.sin(time / 28) * 3); pose.squashX = 0.96; }
    return pose;
  }

  function drawPetEyes(eyeStyle, mood, blink, outline, accent, headY) {
    var leftX = -15;
    var rightX = 8;
    var eyeHeight = blink ? 2 : mood === 'hurt' ? 4 : eyeStyle === 'sleepy' ? 4 : 7;
    if (eyeStyle === 'soft') { leftX = -13; rightX = 8; }
    if (eyeStyle === 'focused' && !blink) {
      drawPixelRect(leftX, -38 + headY, 8, 3, outline); drawPixelRect(rightX, -38 + headY, 8, 3, outline);
      drawPixelRect(leftX + 2, -35 + headY, 6, 4, outline); drawPixelRect(rightX, -35 + headY, 6, 4, outline);
    } else if (eyeStyle === 'mischief' && !blink) {
      drawPixelRect(leftX, -37 + headY, 7, 6, outline); drawPixelRect(rightX, -38 + headY, 8, 3, outline);
      drawPixelRect(rightX + 2, -35 + headY, 5, 3, outline);
    } else {
      drawPixelRect(leftX, -37 + headY, eyeStyle === 'soft' ? 6 : 7, eyeHeight, outline);
      drawPixelRect(rightX, -37 + headY, eyeStyle === 'soft' ? 6 : 7, eyeHeight, outline);
    }
    if (!blink && eyeStyle === 'bright') {
      drawPixelRect(leftX + 2, -36 + headY, 2, 2, accent); drawPixelRect(rightX + 2, -36 + headY, 2, 2, accent);
    }
  }

  function drawPetMarking(marking, palette, headY) {
    if (marking === 'moon_mask') {
      drawPixelRect(-21, -44 + headY, 13, 6, palette.shade); drawPixelRect(8, -44 + headY, 13, 6, palette.shade);
    } else if (marking === 'spray_stripe') {
      drawPixelRect(-22, -49 + headY, 8, 28, palette.accent); drawPixelRect(-14, -46 + headY, 5, 8, palette.accent);
    } else if (marking === 'pixel_freckles') {
      [-19, -10, 10, 18].forEach(function (markX, index) { drawPixelRect(markX, -27 + headY + index % 2 * 3, 3, 3, palette.accent); });
    } else if (marking === 'split_face') {
      drawPixelRect(0, -47 + headY, 22, 29, palette.shade); drawPixelRect(0, -47 + headY, 4, 29, palette.accent);
    } else if (marking === 'star_patch') {
      drawPixelRect(11, -45 + headY, 5, 17, palette.accent); drawPixelRect(5, -39 + headY, 17, 5, palette.accent);
    } else if (marking === 'ink_drops') {
      drawPixelRect(-20, -45 + headY, 5, 9, palette.shade); drawPixelRect(-12, -47 + headY, 4, 13, palette.shade); drawPixelRect(15, -42 + headY, 4, 8, palette.shade);
    }
  }

  function drawRaccoon(palette, pose) {
    drawPixelRect(27, -31 - pose.tail, 12, 32 + pose.tail, palette.outline); drawPixelRect(30, -28 - pose.tail, 6, 8, palette.body);
    drawPixelRect(30, -16 - pose.tail, 6, 7, palette.accent); drawPixelRect(30, -4 - pose.tail, 6, 5, palette.body);
    drawPixelRect(-25, -22, 52, 34, palette.outline); drawPixelRect(-21, -18, 44, 26, palette.body);
    drawPixelRect(-27, -52 + pose.headY, 54, 39, palette.outline); drawPixelRect(-23, -48 + pose.headY, 46, 31, palette.body);
    drawPixelRect(-23, -64 + pose.headY, 16, 17, palette.outline); drawPixelRect(7, -64 + pose.headY, 16, 17, palette.outline);
    drawPixelRect(-18, -59 + pose.headY, 8, 11, palette.shade); drawPixelRect(10, -59 + pose.headY, 8, 11, palette.shade);
    drawPixelRect(-21, -44 + pose.headY, 15, 8, palette.shade); drawPixelRect(6, -44 + pose.headY, 15, 8, palette.shade);
  }

  function drawRam(palette, pose) {
    drawPixelRect(-28, -26, 56, 38, palette.outline); drawPixelRect(-24, -22, 48, 30, palette.body);
    drawPixelRect(-27, -53 + pose.headY, 54, 40, palette.outline); drawPixelRect(-23, -49 + pose.headY, 46, 32, palette.body);
    drawPixelRect(-42, -57 + pose.headY, 18, 23, palette.outline); drawPixelRect(24, -57 + pose.headY, 18, 23, palette.outline);
    drawPixelRect(-38, -53 + pose.headY, 11, 16, palette.accent); drawPixelRect(27, -53 + pose.headY, 11, 16, palette.accent);
    drawPixelRect(-34, -49 + pose.headY, 7, 8, palette.shade); drawPixelRect(27, -49 + pose.headY, 7, 8, palette.shade);
    drawPixelRect(-18, 6, 12, 15, palette.outline); drawPixelRect(8, 6, 12, 15, palette.outline);
  }

  function drawGecko(palette, pose) {
    drawPixelRect(-32, -19, 58, 28, palette.outline); drawPixelRect(-28, -15, 50, 20, palette.body);
    drawPixelRect(21, -16 - pose.tail, 17, 9, palette.outline); drawPixelRect(34, -25 - pose.tail, 16, 9, palette.outline);
    drawPixelRect(47, -36 - pose.tail, 12, 9, palette.outline); drawPixelRect(24, -13 - pose.tail, 14, 4, palette.accent);
    drawPixelRect(-31, -49 + pose.headY, 58, 35, palette.outline); drawPixelRect(-27, -45 + pose.headY, 50, 27, palette.body);
    drawPixelRect(-24, -57 + pose.headY, 13, 13, palette.body); drawPixelRect(10, -57 + pose.headY, 13, 13, palette.body);
    drawPixelRect(-31, 3, 16, 8, palette.outline); drawPixelRect(11, 3, 16, 8, palette.outline);
  }

  function drawCrab(palette, pose) {
    drawPixelRect(-31, -24, 62, 34, palette.outline); drawPixelRect(-27, -20, 54, 26, palette.body);
    drawPixelRect(-48, -28 + pose.arm, 20, 13, palette.outline); drawPixelRect(28, -28 + pose.arm, 20, 13, palette.outline);
    drawPixelRect(-54, -38 + pose.arm, 16, 16, palette.outline); drawPixelRect(38, -38 + pose.arm, 16, 16, palette.outline);
    drawPixelRect(-49, -34 + pose.arm, 8, 8, palette.accent); drawPixelRect(41, -34 + pose.arm, 8, 8, palette.accent);
    drawPixelRect(-27, -52 + pose.headY, 54, 34, palette.outline); drawPixelRect(-23, -48 + pose.headY, 46, 26, palette.body);
    [-24, -8, 8, 24].forEach(function (legX) { drawPixelRect(legX, 7, 8, 13, palette.outline); });
  }

  function drawFox(palette, pose) {
    drawPixelRect(-23, -22, 48, 33, palette.outline); drawPixelRect(-19, -18, 40, 25, palette.body);
    drawPixelRect(23, -33 - pose.tail, 20, 35 + pose.tail, palette.outline); drawPixelRect(27, -29 - pose.tail, 12, 25 + pose.tail, palette.body);
    drawPixelRect(29, -11 - pose.tail, 10, 7, palette.accent);
    drawPixelRect(-27, -53 + pose.headY, 54, 39, palette.outline); drawPixelRect(-23, -49 + pose.headY, 46, 31, palette.body);
    drawPixelRect(-25, -72 + pose.headY, 18, 23, palette.outline); drawPixelRect(7, -72 + pose.headY, 18, 23, palette.outline);
    drawPixelRect(-20, -65 + pose.headY, 8, 14, palette.accent); drawPixelRect(12, -65 + pose.headY, 8, 14, palette.accent);
    drawPixelRect(-17, 6, 11, 14, palette.outline); drawPixelRect(8, 6, 11, 14, palette.outline);
  }

  function drawSnail(palette, pose) {
    drawPixelRect(-38, -33, 38, 38, palette.outline); drawPixelRect(-34, -29, 30, 30, palette.shade);
    drawPixelRect(-27, -22, 17, 17, palette.body); drawPixelRect(-21, -16, 7, 7, palette.accent);
    drawPixelRect(-8, -21, 42, 28, palette.outline); drawPixelRect(-4, -17, 34, 20, palette.body);
    drawPixelRect(3, -49 + pose.headY, 33, 34, palette.outline); drawPixelRect(7, -45 + pose.headY, 25, 26, palette.body);
    drawPixelRect(8, -62 + pose.headY, 5, 17, palette.outline); drawPixelRect(26, -62 + pose.headY, 5, 17, palette.outline);
    drawPixelRect(7, -65 + pose.headY, 7, 7, palette.accent); drawPixelRect(25, -65 + pose.headY, 7, 7, palette.accent);
    drawPixelRect(-8, 3, 46, 9, palette.outline); drawPixelRect(-4, 4, 38, 4, palette.accent);
  }

  function drawDrake(palette, pose) {
    drawPixelRect(-24, -25, 50, 36, palette.outline); drawPixelRect(-20, -21, 42, 28, palette.body);
    drawPixelRect(-43, -34 + pose.arm, 22, 29, palette.outline); drawPixelRect(21, -34 + pose.arm, 22, 29, palette.outline);
    drawPixelRect(-38, -29 + pose.arm, 14, 19, palette.shade); drawPixelRect(24, -29 + pose.arm, 14, 19, palette.shade);
    drawPixelRect(24, -21 - pose.tail, 25, 11, palette.outline); drawPixelRect(44, -30 - pose.tail, 14, 10, palette.outline);
    drawPixelRect(-27, -54 + pose.headY, 54, 40, palette.outline); drawPixelRect(-23, -50 + pose.headY, 46, 32, palette.body);
    drawPixelRect(-19, -68 + pose.headY, 8, 18, palette.accent); drawPixelRect(11, -68 + pose.headY, 8, 18, palette.accent);
    drawPixelRect(-18, 6, 11, 15, palette.outline); drawPixelRect(8, 6, 11, 15, palette.outline);
  }

  function drawFerret(palette, pose) {
    drawPixelRect(-38, -20, 66, 30, palette.outline); drawPixelRect(-34, -16, 58, 22, palette.body);
    drawPixelRect(24, -23 - pose.tail, 30, 12, palette.outline); drawPixelRect(49, -31 - pose.tail, 13, 12, palette.outline);
    drawPixelRect(-31, -50 + pose.headY, 58, 35, palette.outline); drawPixelRect(-27, -46 + pose.headY, 50, 27, palette.body);
    drawPixelRect(-25, -61 + pose.headY, 14, 15, palette.outline); drawPixelRect(10, -61 + pose.headY, 14, 15, palette.outline);
    drawPixelRect(-20, -56 + pose.headY, 7, 9, palette.accent); drawPixelRect(13, -56 + pose.headY, 7, 9, palette.accent);
    drawPixelRect(-27, 5, 13, 13, palette.outline); drawPixelRect(10, 5, 13, 13, palette.outline);
  }

  function drawSpeciesSilhouette(speciesId, palette, pose) {
    if (speciesId === 'bubble_ram') drawRam(palette, pose);
    else if (speciesId === 'comet_gecko') drawGecko(palette, pose);
    else if (speciesId === 'vinyl_crab') drawCrab(palette, pose);
    else if (speciesId === 'lantern_fox') drawFox(palette, pose);
    else if (speciesId === 'sneaker_snail') drawSnail(palette, pose);
    else if (speciesId === 'alley_drake') drawDrake(palette, pose);
    else if (speciesId === 'moon_ferret') drawFerret(palette, pose);
    else drawRaccoon(palette, pose);
  }

  function drawRareMorphShell(name, palette, pose) {
    if (!name) return;
    if (name === 'Celestial Serpent') {
      [-55, -43, -31, -19].forEach(function (segmentX, index) {
        drawPixelRect(segmentX, -8 - index * 8, 15, 13, palette.outline); drawPixelRect(segmentX + 3, -5 - index * 8, 9, 7, index % 2 ? palette.accent : palette.body);
      });
      drawPixelRect(-62, -5, 8, 8, palette.accent);
    } else if (name === 'Crown Beast') {
      drawPixelRect(-36, -66 + pose.headY, 72, 7, palette.accent);
      [-31, -15, 1, 17].forEach(function (spikeX, index) { drawPixelRect(spikeX, -78 - index % 2 * 5 + pose.headY, 9, 15 + index % 2 * 5, palette.accent); });
    } else if (name === 'Boombox Kaiju') {
      drawPixelRect(-57, -34, 28, 38, palette.outline); drawPixelRect(29, -34, 28, 38, palette.outline);
      drawPixelRect(-52, -29, 18, 18, palette.accent); drawPixelRect(34, -29, 18, 18, palette.accent);
      drawPixelRect(-47, -24, 8, 8, palette.outline); drawPixelRect(39, -24, 8, 8, palette.outline);
    } else if (name === 'Graffiti Guardian') {
      drawPixelRect(-61, -49 + pose.arm, 34, 12, palette.outline); drawPixelRect(27, -49 + pose.arm, 34, 12, palette.outline);
      drawPixelRect(-55, -37 + pose.arm, 27, 9, palette.accent); drawPixelRect(28, -37 + pose.arm, 27, 9, palette.accent);
      drawPixelRect(-48, -27 + pose.arm, 19, 7, palette.body); drawPixelRect(29, -27 + pose.arm, 19, 7, palette.body);
    }
  }

  function drawEvolutionLayers(stage, palette) {
    if (stage >= 1) {
      drawPixelRect(-24, -11, 48, 8, '#20262b'); drawPixelRect(-7, -11, 14, 8, palette.accent);
    }
    if (stage >= 2) {
      drawPixelRect(-31, -44, 7, 25, '#61f5ff'); drawPixelRect(24, -44, 7, 25, '#61f5ff');
      drawPixelRect(-4, -53, 8, 5, '#61f5ff');
    }
    if (stage >= 3) {
      drawPixelRect(-36, -18, 12, 24, palette.outline); drawPixelRect(24, -18, 12, 24, palette.outline);
      drawPixelRect(-32, -14, 7, 16, palette.body); drawPixelRect(25, -14, 7, 16, palette.body);
      drawPixelRect(-20, -7, 40, 4, palette.accent);
    }
    if (stage >= 4) {
      drawPixelRect(-24, -70, 48, 6, '#f6a7ff'); drawPixelRect(-18, -79, 7, 9, '#f6a7ff');
      drawPixelRect(-4, -84, 8, 14, palette.accent); drawPixelRect(11, -79, 7, 9, '#f6a7ff');
    }
  }

  function drawEquipmentLayers(pet, palette, pose) {
    var outfit = String(pet && pet.equipped_outfit || '');
    var armor = String(pet && pet.equipped_armor || '');
    var weapon = String(pet && pet.equipped_weapon || '');
    var charm = String(pet && pet.equipped_charm || '');
    var toy = String(pet && pet.equipped_toy || '');
    var food = String(pet && pet.equipped_food || '');
    if (outfit && !/none/.test(outfit)) {
      drawPixelRect(-22, -16, 44, 13, '#242a38'); drawPixelRect(-18, -13, 36, 5, outfit === 'crown_jacket' ? '#f4cf58' : palette.accent);
      drawPixelRect(-3, -16, 6, 13, '#f6a7ff');
    }
    if (armor && !/none/.test(armor)) {
      var armorColor = armor === 'cyber_armor' ? '#61f5ff' : armor === 'street_armor' ? '#aab5ae' : '#5b6570';
      drawPixelRect(-34, -20 + pose.arm, 13, 19, palette.outline); drawPixelRect(21, -20 + pose.arm, 13, 19, palette.outline);
      drawPixelRect(-30, -16 + pose.arm, 8, 12, armorColor); drawPixelRect(22, -16 + pose.arm, 8, 12, armorColor);
    }
    if (weapon && !/none/.test(weapon)) {
      if (weapon === 'moon_blaster') {
        drawPixelRect(30, -25 + pose.arm, 29, 10, palette.outline); drawPixelRect(34, -22 + pose.arm, 20, 5, '#61f5ff');
        drawPixelRect(28, -17 + pose.arm, 9, 13, palette.outline);
      } else {
        drawPixelRect(29, -23 + pose.arm, 18, 7, palette.outline);
        drawPixelRect(39, -31 + pose.arm, 4, 12, weapon === 'laser_claws' ? '#61f5ff' : '#aab5ae');
        drawPixelRect(46, -29 + pose.arm, 4, 12, weapon === 'laser_claws' ? '#61f5ff' : '#aab5ae');
      }
    }
    if (charm && !/none/.test(charm)) {
      drawPixelRect(-2, -10, 4, 11, '#f4cf58'); drawPixelRect(-6, -1, 12, 10, palette.outline);
      drawPixelRect(-3, 1, 6, 5, charm === 'shield_charm' ? '#61f5ff' : '#f4ff65');
    }
    if (toy === 'hoverboard') {
      drawPixelRect(-30, 18, 62, 6, palette.outline); drawPixelRect(-24, 18, 49, 3, '#f6a7ff');
      drawPixelRect(-23, 24, 8, 4, '#61f5ff'); drawPixelRect(17, 24, 8, 4, '#61f5ff');
    }
    if (food === 'crystal_bowl') {
      drawPixelRect(-51, 5, 20, 8, palette.outline); drawPixelRect(-48, 4, 14, 5, '#61f5ff');
    }
  }

  function unlockedCosmetic(key) {
    var cosmetics = state && state.live_systems && state.live_systems.cosmetics || [];
    return cosmetics.some(function (item) { return item && item.key === key && item.unlocked; });
  }

  function drawCosmeticLayers(time, palette, active) {
    if (unlockedCosmetic('profile_frame')) {
      drawPixelRect(-61, -73, 22, 4, palette.accent); drawPixelRect(-61, -73, 4, 22, palette.accent);
      drawPixelRect(39, -73, 22, 4, palette.accent); drawPixelRect(57, -73, 4, 22, palette.accent);
      drawPixelRect(-61, 17, 22, 4, palette.accent); drawPixelRect(-61, -1, 4, 22, palette.accent);
      drawPixelRect(39, 17, 22, 4, palette.accent); drawPixelRect(57, -1, 4, 22, palette.accent);
    }
    if (unlockedCosmetic('run_trail') && active && animationMode === 'travel') {
      for (var trail = 0; trail < 5; trail += 1) drawPixelRect(-73 - trail * 9, 5 - trail % 2 * 7, 7, 3, trail % 2 ? palette.accent : '#61f5ff');
    }
    if (unlockedCosmetic('victory_pose') && active && animationMode === 'celebrate') {
      drawPixelText('★ ALL CITY ★', 0, -91, palette.accent, 'center');
    }
    if (unlockedCosmetic('rename_badge')) {
      drawPixelRect(-18, 12, 36, 7, '#20262b'); drawPixelRect(-14, 14, 28, 3, palette.accent);
    }
  }

  function drawMoonEgg(time, active) {
    var crack = Math.floor(time / 260) % 3;
    var eggY = 150 + (active ? -Math.abs(Math.round(Math.sin(time / 100) * 5)) : Math.round(Math.sin(time / 340) * 2));
    drawPixelRect(134, eggY - 48, 52, 57, '#061009');
    drawPixelRect(138, eggY - 44, 44, 49, '#d8f9ff');
    drawPixelRect(142, eggY - 38, 8, 10, '#61f5ff'); drawPixelRect(174, eggY - 23, 6, 12, '#f6a7ff');
    drawPixelRect(147, eggY - 18, 7, 6, '#061009'); drawPixelRect(167, eggY - 18, 7, 6, '#061009');
    drawPixelRect(157, eggY - 9, 8, 3, '#061009');
    if (crack > 0) { drawPixelRect(158, eggY - 47, 4, 12, '#061009'); drawPixelRect(161, eggY - 38, 8, 4, '#061009'); }
    if (crack > 1) { drawPixelRect(151, eggY - 34, 11, 4, '#061009'); drawPixelRect(148, eggY - 30, 4, 9, '#061009'); }
    drawPixelRect(128, eggY + 5, 64, 11, '#6eb8a1'); drawPixelRect(134, eggY + 8, 52, 7, '#d8f9ff');
    if (active) drawPixelText('SIGNAL!', 160, eggY - 58, '#f4ff65', 'center');
  }

  function drawPet(time) {
    var pet = state && state.pet;
    var lifecycle = state && state.lifecycle || {};
    var stage = petStage(pet);
    var mood = petMood(pet);
    var renderTime = reducedMotion ? performance.now() : time;
    var active = animationUntil > renderTime;
    if (lifecycle.phase === 'egg') {
      drawMoonEgg(time, active);
      drawActionEffects(time, 160, 150, active);
      if (active && animationLabel) drawPixelText('[' + animationLabel + ']', 160, 211, animationMode === 'blocked' ? '#ff6d6d' : '#f4ff65', 'center');
      return;
    }

    var pose = petPose(time, active, mood);
    var rareName = lifecycle.rare && lifecycle.rare.name || '';
    var scale = lifecycle.phase === 'young' ? 0.82 : lifecycle.phase === 'rare' ? 1.13 : 1 + Math.min(4, stage) * 0.025;
    var palette = petPalette(lifecycle, stage);
    var x = 160 + pose.x;
    var y = 150 + pose.y + (lifecycle.phase === 'young' ? 8 : lifecycle.phase === 'rare' ? -4 : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * pose.squashX, scale * pose.squashY);
    ctx.shadowColor = lifecycle.phase === 'rare' ? palette.accent : stage >= 2 ? '#61f5ff' : palette.body;
    ctx.shadowBlur = lifecycle.phase === 'rare' ? 12 : stage * 2 + (active ? 6 : 2);
    drawRareMorphShell(rareName, palette, pose);
    drawSpeciesSilhouette(lifecycle.species_id || 'neon_raccoon', palette, pose);
    drawPetMarking(lifecycle.appearance && lifecycle.appearance.marking, palette, pose.headY);
    drawEvolutionLayers(stage, palette);
    drawEquipmentLayers(pet, palette, pose);
    drawCosmeticLayers(time, palette, active);

    var blink = !reducedMotion && Math.floor(renderTime / 1800) % 7 === 0 || mood === 'tired' || animationMode === 'sleep' && active;
    drawPetEyes(lifecycle.appearance && lifecycle.appearance.eyes || 'bright', mood, blink, palette.outline, palette.accent, pose.headY);
    drawPixelRect(-3, -27 + pose.headY, 6, 4, palette.outline);
    if (mood === 'happy' || active && ['play', 'celebrate', 'feed'].includes(animationMode)) {
      drawPixelRect(-8, -20 + pose.headY, 6, 3, palette.outline); drawPixelRect(2, -20 + pose.headY, 6, 3, palette.outline);
    } else if (mood === 'hungry') drawPixelRect(-5, -20 + pose.headY, 10, 5, palette.outline);
    else { drawPixelRect(-6, -20 + pose.headY, 12, 2, palette.outline); drawPixelRect(-2, -18 + pose.headY, 4, 2, palette.outline); }
    ctx.restore();
    ctx.shadowBlur = 0;

    if (!active && mood !== 'curious') drawPixelText(mood.toUpperCase(), x, y - 78 * scale, mood === 'hurt' ? '#ff6d6d' : palette.accent, 'center');
    if (rareName) drawPixelText(rareName.toUpperCase(), 160, 70, palette.accent, 'center');
    else if (lifecycle.species_name) drawPixelText(lifecycle.species_name.toUpperCase(), 160, 78, palette.accent, 'center');
    drawActionEffects(time, x, y, active);
    if (active && animationLabel) drawPixelText('[' + animationLabel + ']', 160, 211, animationMode === 'blocked' ? '#ff6d6d' : '#f4ff65', 'center');
  }

  function drawWorld(time) {
    drawPixelRect(0, 0, 320, 220, '#020704');
    for (var star = 0; star < 24; star += 1) {
      var sx = (star * 47 + 13) % 320; var sy = (star * 29 + 17) % 105;
      drawPixelRect(sx, sy, star % 5 ? 1 : 2, 1, star % 3 ? '#2c6c39' : '#a9ff9a');
    }
    drawPixelRect(0, 105, 320, 3, '#2c6c39');
    for (var building = 0; building < 10; building += 1) {
      var bx = building * 36 - 8; var bh = 28 + (building * 17 % 42);
      drawPixelRect(bx, 105 - bh, 30, bh, '#07170c');
      for (var wy = 0; wy < bh - 8; wy += 10) for (var wx = 5; wx < 27; wx += 9) if ((building + wy + wx) % 3) drawPixelRect(bx + wx, 110 - bh + wy, 3, 3, '#4ea85a');
    }
    drawPixelRect(0, 177, 320, 43, '#08140c'); drawPixelRect(0, 177, 320, 4, '#2c6c39');
    for (var line = 0; line < 320; line += 24) drawPixelRect(line, 202, 12, 2, '#1d4a28');
    drawPixelRect(24, 132, 42, 45, '#07170c'); drawPixelRect(30, 141, 30, 25, '#143522');
    drawPixelRect(254, 138, 42, 39, '#07170c'); drawPixelRect(260, 146, 30, 22, '#143522');
    drawPet(time);
  }

  function frame(time) {
    drawWorld(time);
    if (animationUntil <= time) { animationMode = 'idle'; animationLabel = ''; }
    if (reducedMotion) return;
    requestAnimationFrame(frame);
  }

  async function start() {
    await waitForTelegramContext();
    if (tg) {
      try { tg.ready(); tg.expand(); tg.setHeaderColor('#06110b'); tg.setBackgroundColor('#010402'); if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (_) {}
    }
    setInterval(function () { clock.textContent = new Date().toISOString().slice(11, 19) + ' UTC'; }, 1000);
    requestAnimationFrame(frame);
    await typeBoot(['MOONPET BIOS 0.9', 'CHECKING TELEGRAM SIGNATURE...', 'CONNECTING TO D1 MEMORY CORE...'], { speed: 10, hold: 180 });
    await restoreBrowserAuth();
    if (!initData && !telegramAuth) {
      tell('OPEN THIS GAME FROM @WIKICOMSBOT.', 'danger');
      await typeBoot(['AUTHENTICATION NOT FOUND', 'OPEN THE MINI APP INSIDE TELEGRAM', 'NO PLAYER DATA WAS READ'], { speed: 9, hold: 800 });
      return;
    }
    try {
      var data = await post('/telegram-pets/app/state');
      state = data.state;
      render();
      tell(state.adopted ? 'LIVE SAVE LOADED. CHOOSE A ROUTINE.' : 'MOON EGG READY FOR INITIALISATION.');
      await typeBoot(['SIGNATURE VERIFIED', 'PLAYER SAVE LOADED', 'MOONPET OS READY'], { speed: 8, hold: 320 });
      await showPendingNotices();
      window.setInterval(refreshLiveState, 5000);
    } catch (error) {
      tell(error.message || 'STARTUP FAILED', 'danger');
      await typeBoot(['STARTUP FAULT', error.message || 'API UNAVAILABLE', 'CLOSE AND REOPEN THE MINI APP'], { speed: 8, hold: 900 });
    }
  }

  start();
}());
