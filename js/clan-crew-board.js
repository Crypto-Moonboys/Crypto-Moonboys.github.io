const board = document.querySelector('[data-clan-crew-progress]');
const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
const profiles = window.MOONBOYS_FACTION_PROFILES;
const factionOrder = window.MOONBOYS_FACTION_PROFILE_ORDER;

if (board && api && profiles && factionOrder?.length) {
  const table = board.querySelector('[data-clan-crew-table]');
  const rows = table.querySelector('tbody');
  const period = board.querySelector('[data-clan-crew-period]');
  const status = board.querySelector(':scope > [role="status"]');
  const refresh = board.querySelector('[data-clan-crew-refresh]');
  const competitionPanel = board.querySelector('[data-clan-crew-competition]');
  const week = board.querySelector('[data-clan-crew-week]');
  const ranking = board.querySelector('[data-clan-crew-ranking]');
  const scoreHeader = board.querySelector('[data-clan-crew-score]');
  const join = board.querySelector('[data-clan-crew-join]');
  const entry = board.querySelector('[data-clan-crew-entry]');
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
    const ordered = Array.from(rows.children).sort((a, b) =>
      (scores.get(a.dataset.faction).rank ?? Infinity) - (scores.get(b.dataset.faction).rank ?? Infinity));
    for (const row of ordered) {
      const score = scores.get(row.dataset.faction);
      const cell = row.querySelector('[data-clan-crew-score]');
      const place = score.rank == null ? '' : `#${score.rank} · `;
      cell.textContent = score.possible_banks
        ? `${place}${percent.format(score.scored_banks / score.possible_banks)} · ${score.active_members}/${score.roster_size} active`
        : 'No roster';
      cell.hidden = false;
    }
    for (const row of ordered) rows.append(row);
    scoreHeader.hidden = false;
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

  async function load() {
    const current = ++generation;
    refresh.setAttribute('aria-disabled', 'true');
    if (!board.hidden) status.textContent = 'Refreshing crew progress…';
    try {
      const response = await fetch(`${api}/clan-operations/state?view=crew-progress${competitionPanel ? '&standings=1' : ''}`, {
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error('crew progress unavailable');
      const result = await response.json();
      if (current !== generation) return;
      data = result;
      if (data.ok === true && (data.enabled === false || data.crews === undefined)) {
        // Older Workers only return the pilot flag. Wait for the published board contract.
        board.hidden = true;
        rows.replaceChildren();
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
      const content = factionOrder.map(key => {
        const counts = byFaction.get(key);
        if (!counts || !Number.isSafeInteger(counts.today_banks) || !Number.isSafeInteger(counts.week_banks) ||
            counts.today_banks < 0 || counts.week_banks < counts.today_banks) throw new Error('invalid crew totals');

        const row = document.createElement('tr');
        row.dataset.faction = key;
        const name = document.createElement('th');
        name.scope = 'row';
        const link = document.createElement('a');
        link.href = '/battle-chamber/factions/' + key + '.html';
        link.textContent = profiles[key].name;
        name.append(link);
        row.append(name);
        for (const value of [counts.today_banks, counts.week_banks]) {
          const cell = document.createElement('td');
          cell.textContent = value.toLocaleString();
          row.append(cell);
        }
        const scoreCell = document.createElement('td');
        scoreCell.setAttribute('data-clan-crew-score', '');
        scoreCell.hidden = true;
        row.append(scoreCell);
        return row;
      });
      rows.replaceChildren(...content);
      if (competitionPanel) {
        competitionPanel.hidden = !data.competition;
        scoreHeader.hidden = true;
        renderCompetition();
        refreshEntry();
      }
      period.textContent = `UTC today ${data.utc_day} · Week starting ${data.week_start}`;
      table.hidden = false;
      const announce = !board.hidden;
      board.hidden = false;
      status.textContent = announce ? 'Crew progress updated.' : '';
    } catch {
      if (current !== generation) return;
      rows.replaceChildren();
      period.textContent = '';
      table.hidden = true;
      data = undefined;
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
}
