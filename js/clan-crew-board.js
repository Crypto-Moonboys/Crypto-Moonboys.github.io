const board = document.querySelector('[data-clan-crew-progress]');
const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
const profiles = window.MOONBOYS_FACTION_PROFILES;
const factionOrder = window.MOONBOYS_FACTION_PROFILE_ORDER;

if (board && api && profiles && factionOrder?.length) {
  const table = board.querySelector('[data-clan-crew-table]');
  const rows = table.querySelector('tbody');
  const period = board.querySelector('[data-clan-crew-period]');
  const status = board.querySelector('[role="status"]');
  const refresh = board.querySelector('[data-clan-crew-refresh]');
  const date = /^\d{4}-\d{2}-\d{2}$/;
  let generation = 0;

  async function load() {
    const current = ++generation;
    refresh.setAttribute('aria-disabled', 'true');
    if (!board.hidden) status.textContent = 'Refreshing crew progress…';
    try {
      const response = await fetch(`${api}/clan-operations/state?view=crew-progress`, {
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error('crew progress unavailable');
      const data = await response.json();
      if (current !== generation) return;
      if (data.ok === true && (data.enabled === false || data.crews === undefined)) {
        // Older Workers only return the pilot flag. Wait for the published board contract.
        board.hidden = true;
        rows.replaceChildren();
        period.textContent = '';
        status.textContent = '';
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
        return row;
      });
      rows.replaceChildren(...content);
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
      // Keep a visible retry control for visitors who have already seen the board.
      status.textContent = 'Crew progress is temporarily unavailable.';
    } finally {
      if (current === generation) refresh.removeAttribute('aria-disabled');
    }
  }

  refresh.addEventListener('click', () => {
    if (refresh.getAttribute('aria-disabled') !== 'true') load();
  });
  window.addEventListener('moonboys:clan-operation-banked', load);
  load();
}
