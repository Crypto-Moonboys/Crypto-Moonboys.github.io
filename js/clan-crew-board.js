import { CLAN_REWARD_NAMES } from './clan-period-display.js';
import { mountClanLeaderDialog } from './clan-leader-dialog.js?lore=2';

const board = document.querySelector('[data-clan-crew-progress]');
const cards = board?.querySelector('[data-clan-crew-cards]');
const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
const profiles = window.MOONBOYS_FACTION_PROFILES;
const factionOrder = window.MOONBOYS_FACTION_PROFILE_ORDER;

if (cards && api && profiles && factionOrder?.length) {
  const period = board.querySelector('[data-clan-crew-period]');
  const status = board.querySelector(':scope > [role="status"]');
  const refresh = board.querySelector('[data-clan-crew-refresh]');
  const competitionPanel = board.querySelector('[data-clan-crew-competition]');
  const week = board.querySelector('[data-clan-crew-week]');
  const ranking = board.querySelector('[data-clan-crew-ranking]');
  const join = board.querySelector('[data-clan-crew-join]');
  const entry = board.querySelector('[data-clan-crew-entry]');
  const cityRules = board.querySelector('[data-clan-city-rules]');
  const finals = board.querySelector('[data-clan-final-results]');
  const leaderRules = board.querySelector('[data-clan-leader-rules]');
  const presenceRules = board.querySelector('[data-clan-leader-presence-rules]');
  const talkToLeader = leaderRules && mountClanLeaderDialog(document.body, () => load());
  // The front idle frame is first in each four-row group of the Waterfront atlas.
  const leaderSprites = [
    'all-city-bulls', 'nomad-bears', 'hard-fork-rockers', 'rugpull-miners',
    'crypto-moongirls', 'blockchain-furies', 'graffpunks', 'crypto-stoned-boys', 'blockstars',
  ];
  const signalBonus = document.querySelector('[data-clan-signal-bonus]');
  const cityProjects = {
    'rugpull-miners': 'Mine tunnels',
    graffpunks: 'Faction mural',
    'nomad-bears': 'Trail network',
    'all-city-bulls': 'District defences',
    'crypto-moongirls': 'Signal network',
    'hard-fork-rockers': 'Fork crossings',
    'blockchain-furies': 'Pulse grid',
    blockstars: 'City spotlight',
    'crypto-stoned-boys': 'Artifact archive',
  };
  const cityStages = ['Underway', 'Opened', 'Expanded', 'Complete'];

  function renderRewards(result) {
    if (signalBonus) {
      signalBonus.hidden = !result?.signal_bonus_xp;
      signalBonus.textContent = result?.signal_bonus_xp
        ? `Bank a Clan Operation tier during a live signal to earn ${result.signal_bonus_xp} Community XP once per window. The bonus may take a few minutes to appear.`
        : '';
    }
    if (!finals) return;
    finals.hidden = !Array.isArray(result?.final_results);
    const items = (result?.final_results ?? []).map(period => {
      const item = document.createElement('li');
      const winners = period.crews.filter(crew => crew.rank === 1).map(crew => profiles[crew.faction_id].name);
      const winnerLabel = winners.length ? `${winners.join(', ')} · ${CLAN_REWARD_NAMES[period.kind]}` : 'No winner';
      const ranks = period.crews.filter(crew => crew.rank !== null).sort((a, b) => a.rank - b.rank);
      item.textContent = `${period.kind[0].toUpperCase() + period.kind.slice(1)} · ${period.starts_on} to ${period.ends_before} UTC (end exclusive) · ${winnerLabel}`;
      if (ranks.length) {
        const scores = document.createElement('ul');
        for (const { rank, faction_id, scored_banks, possible_banks } of ranks) {
          const score = document.createElement('li');
          score.textContent = `#${rank} ${profiles[faction_id].name} · ${percent.format(scored_banks / possible_banks)}`;
          scores.append(score);
        }
        item.append(scores);
      }
      return item;
    });
    if (!items.length && !finals.hidden) {
      const item = document.createElement('li');
      item.textContent = 'The first eligible period has yet to close.';
      items.push(item);
    }
    finals.querySelector('ul').replaceChildren(...items);
  }
  const readOwner = () => String(window.MOONBOYS_IDENTITY?.getTelegramId?.() ?? '');
  const date = /^\d{4}-\d{2}-\d{2}$/;
  let generation = 0;
  let entryGeneration = 0;
  let data;
  const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, style: 'percent' });

  function renderCompetition() {
    if (!competitionPanel || !data?.competition) return;
    const results = data.competition[week.value];
    ranking.textContent = results.ranked
      ? `Ranked crew scores for the week starting ${results.week_start} UTC.`
      : `Week starting ${results.week_start} UTC is unranked. Ranking needs ${results.min_crews} crews with at least ${results.min_roster} signed-up members each.`;
    const scores = new Map(results.crews.map(row => [row.faction_id, row]));
    const ordered = Array.from(cards.children).sort((a, b) =>
      (scores.get(a.dataset.faction).rank ?? Infinity) - (scores.get(b.dataset.faction).rank ?? Infinity));
    for (const row of ordered) {
      const score = scores.get(row.dataset.faction);
      const metric = row.querySelector('[data-clan-crew-score]');
      const place = score.rank == null ? '' : `#${score.rank} · `;
      metric.querySelector('dd').textContent = score.possible_banks
        ? `${place}${percent.format(score.scored_banks / score.possible_banks)} · ${score.active_members}/${score.roster_size} active`
        : 'No roster';
      metric.hidden = false;
    }
    cards.append(...ordered);
  }

  async function refreshEntry(intent = 'status') {
    if (!join) return;
    const current = ++entryGeneration;
    const nextWeek = data?.competition?.next_week_start;
    const owner = readOwner();
    join.hidden = true;
    entry.textContent = '';
    if (!nextWeek || !owner) return;
    const currentEntry = () => current === entryGeneration && owner === readOwner();
    const buttonText = `Enter week starting ${nextWeek} UTC`;
    try {
      const gate = window.MOONBOYS_IDENTITY;
      const auth = gate.getFreshTelegramAuth
        ? await gate.getFreshTelegramAuth()
        : gate.getSignedTelegramAuth?.();
      if (!currentEntry() || !auth) return;
      const response = await fetch(`${api}/clan-operations/state`, {
        method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(12_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_auth: auth, crew_entry: intent, week_start: nextWeek }),
      });
      const info = await response.json();
      if (!currentEntry()) return;
      if (info.error === 'join_faction') {
        entry.textContent = 'Choose a faction to enter next week.';
        return;
      }
      if (info.error === 'crew_week_changed' || (info.ok && info.week_start !== nextWeek)) {
        load();
        return;
      }
      if (!response.ok || !info.ok) throw new Error('crew entry unavailable');
      if (info.entered_faction) {
        entry.textContent = `Entered for ${profiles[info.entered_faction].name} in the week starting ${nextWeek} UTC.`;
        return;
      }
      join.textContent = buttonText;
      join.hidden = false;
    } catch {
      if (!currentEntry()) return;
      entry.textContent = 'Crew entry is temporarily unavailable. Refresh crew progress to try again.';
    }
  }

  function renderMetric(label, value) {
    const metric = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    metric.append(term, description);
    return metric;
  }

  function renderLeader(leader, priorWeekFinal) {
    const cell = document.createElement('div');
    cell.className = 'clan-crew-leader';
    const title = document.createElement('h4');
    title.textContent = 'Faction leader this week';
    cell.append(title);
    const power = document.createElement('strong');
    power.textContent = `${leader.power.toLocaleString()} power`;
    const portrait = document.createElement('span');
    portrait.className = 'clan-leader-sprite';
    portrait.setAttribute('aria-hidden', 'true');
    portrait.style.backgroundPositionY = `-${leaderSprites.indexOf(leader.faction_id) * 144}px`;
    cell.append(portrait, power);

    const breakdown = document.createElement('div');
    breakdown.textContent = `${leader.banks} banks · ${leader.signals} signals · +${leader.boost.toLocaleString()} perk`;
    cell.append(breakdown);
    if (leader.presence && data.leaders.controls) {
      const { rounds, site_path, faction_path, paused_until, playing_until, talking } = leader.presence;
      const activity = document.createElement('div');
      const paused = paused_until && paused_until * 1000 > Date.now();
      activity.textContent = `${rounds.toLocaleString()} leader rounds${paused ? (talking ? ' · In conversation' : ' · Paused')
        : playing_until * 1000 > Date.now() ? ' · Playing a game' : ''}`;
      const links = document.createElement('div');
      const faction = document.createElement('a');
      faction.href = faction_path;
      faction.textContent = 'Faction page';
      const visit = document.createElement('a');
      visit.href = site_path;
      visit.textContent = 'Arcade visit';
      links.append(faction);
      if (site_path !== faction_path) links.append(' · ', visit);
      cell.append(activity, links);
    }
    if ((leader.presence && data.leaders.controls) || data.leaders.chat_enabled) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = data.leaders.chat_enabled ? 'Talk to leader' : 'Talk or slow down';
      button.addEventListener('click', () => talkToLeader(profiles[leader.faction_id].name, leader,
        data.leaders.controls, data.leaders.chat_enabled));
      cell.append(button);
    }
    if (!leader.perk) {
      const status = document.createElement('small');
      status.textContent = priorWeekFinal ? 'Unranked last week' : 'Awaiting final weekly standings';
      status.className = 'clan-crew-leader-status';
      cell.append(status);
      return cell;
    }

    const { rank, level, selected, options } = leader.perk;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `Lv ${level} · ${options.find(option => option.id === selected).name}`;
    const previous = document.createElement('p');
    previous.textContent = `Last week #${rank}. The leader selected one perk for this week.`;
    const choices = document.createElement('ul');
    for (const option of options) {
      const line = document.createElement('li');
      line.textContent = `${option.name} · +${option.points} ${option.unit}${option.id === selected ? ' (active)' : ''}`;
      choices.append(line);
    }
    details.append(summary, previous, choices);
    cell.append(details);
    return cell;
  }

  async function load({ automatic = false } = {}) {
    if (automatic && refresh.getAttribute('aria-disabled') === 'true') return;
    const current = ++generation;
    refresh.setAttribute('aria-disabled', 'true');
    if (!board.hidden && !automatic) status.textContent = 'Refreshing crew progress…';
    try {
      const response = await fetch(`${api}/clan-operations/state?view=crew-progress${competitionPanel ? '&standings=1' : ''}${cityRules ? '&city=1' : ''}${leaderRules ? '&leaders=1' : ''}`, {
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error('crew progress unavailable');
      const result = await response.json();
      if (current !== generation) return;
      const previousEntryWeek = data?.competition?.next_week_start;
      data = result;
      renderRewards(data);
      if (data.ok === true && (data.enabled === false || data.crews === undefined)) {
        // Older Workers only return the pilot flag. Wait for the published board contract.
        board.hidden = true;
        cards.hidden = true;
        cards.replaceChildren();
        period.textContent = '';
        status.textContent = '';
        if (competitionPanel) {
          competitionPanel.hidden = true;
          refreshEntry();
        }
        return;
      }

      if (data.ok !== true || data.enabled !== true || !date.test(data.utc_day) || !date.test(data.week_start) ||
          !Array.isArray(data.crews) || data.crews.length !== factionOrder.length) throw new Error('invalid crew progress');
      const byFaction = new Map(data.crews.map(row => [row.faction_id, row]));
      const showCity = Boolean(cityRules && data.crews.every(crew => crew.city));
      if (cityRules) cityRules.hidden = !showCity;
      const leaders = new Map((data.leaders?.week_start === data.week_start ? data.leaders.crews ?? [] : [])
        .map(leader => [leader.faction_id, leader]));
      const showLeaders = Boolean(leaderRules && factionOrder.every(key => leaders.has(key)));
      if (leaderRules) leaderRules.hidden = !showLeaders;
      if (presenceRules) presenceRules.hidden = !showLeaders || !data.leaders?.controls;
      const expanded = new Set(Array.from(cards.querySelectorAll('.clan-crew-leader details[open]'),
        node => node.closest('[data-faction]').dataset.faction));
      const content = factionOrder.map(key => {
        const counts = byFaction.get(key);
        if (!counts || !Number.isSafeInteger(counts.today_banks) || !Number.isSafeInteger(counts.week_banks) ||
            counts.today_banks < 0 || counts.week_banks < counts.today_banks) throw new Error('invalid crew totals');

        const card = document.createElement('li');
        card.className = 'clan-crew-card';
        card.dataset.faction = key;
        card.style.setProperty('--crew-accent', profiles[key].chamberColor);

        const body = document.createElement('div');
        body.className = 'clan-crew-card-body';
        const name = document.createElement('h3');
        const link = document.createElement('a');
        link.href = '/battle-chamber/factions/' + key + '.html';
        link.innerHTML = window.MOONBOYS_FACTION?.renderIcon?.(key, 20) || '';
        link.append(profiles[key].name);
        name.append(link);

        const stats = document.createElement('dl');
        stats.className = 'clan-crew-card-stats';
        stats.append(
          renderMetric('Today', counts.today_banks.toLocaleString()),
          renderMetric('This week', counts.week_banks.toLocaleString()),
        );
        if (showCity) {
          const next = counts.city.next === null ? '' : ` · ${counts.week_banks}/${counts.city.next} banks`;
          stats.append(renderMetric('City project', `${cityProjects[key]} · ${cityStages[counts.city.stage]}${next}`));
        }
        const score = renderMetric('Weekly score', '');
        score.dataset.clanCrewScore = '';
        score.hidden = true;
        stats.append(score);
        body.append(name, stats);
        if (showLeaders) {
          const leader = renderLeader(leaders.get(key), data.leaders.prior_week_final);
          const details = leader.querySelector('details');
          if (details) details.open = expanded.has(key);
          body.append(leader);
        }
        const art = document.createElement('div');
        art.className = 'clan-crew-card-art';
        card.append(body, art);
        return card;
      });
      cards.replaceChildren(...content);
      if (competitionPanel) {
        competitionPanel.hidden = !data.competition;
        renderCompetition();
        if (!automatic || previousEntryWeek !== data.competition?.next_week_start) refreshEntry();
      }
      period.textContent = `UTC today ${data.utc_day} · Week starting ${data.week_start}`;
      cards.hidden = false;
      const announce = !board.hidden;
      board.hidden = false;
      if (!automatic) status.textContent = announce ? 'Crew progress updated.' : '';
    } catch {
      if (current !== generation || (automatic && !board.hidden)) return;
      cards.replaceChildren();
      period.textContent = '';
      cards.hidden = true;
      data = undefined;
      renderRewards();
      if (cityRules) cityRules.hidden = true;
      if (competitionPanel) {
        competitionPanel.hidden = true;
        refreshEntry();
      }
      // Keep a visible retry control for visitors who have already seen the board.
      status.textContent = 'Crew progress is temporarily unavailable.';
    } finally {
      if (current === generation) refresh.removeAttribute('aria-disabled');
    }
  }

  refresh.addEventListener('click', () => {
    if (refresh.getAttribute('aria-disabled') !== 'true') load();
  });
  week?.addEventListener('change', renderCompetition);
  join?.addEventListener('click', () => refreshEntry('join'));
  window.addEventListener('moonboys:identity-change', () => refreshEntry());
  window.addEventListener('moonboys:telegram-session', () => refreshEntry());
  window.addEventListener('moonboys:faction-status', () => refreshEntry());
  window.addEventListener('moonboys:clan-operation-banked', load);
  load();
  if (leaderRules) {
    setInterval(() => {
      if (!document.hidden && !board.contains(document.activeElement)) load({ automatic: true });
    }, 60_000);
  }
}
