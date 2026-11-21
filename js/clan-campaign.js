const panel = document.querySelector('[data-clan-campaign]');
if (panel) {
  const disclosure = panel.closest('details');
  const body = panel.querySelector('[data-campaign-content]');
  const art = disclosure.querySelector('[data-campaign-art]');
  const defaultArt = art?.getAttribute('src');
  const status = panel.querySelector('[data-campaign-status]');
  const refresh = panel.querySelector('[data-campaign-refresh]');
  const personal = panel.querySelector('[data-campaign-personal]');
  const personalStatus = personal.querySelector('[role="status"]');
  const collection = personal.querySelector('ul');
  const factionName = key => window.MOONBOYS_FACTION_PROFILES?.[key]?.name || key.replaceAll('-', ' ');
  const formatDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const date = day => formatDate.format(new Date(day));
  const period = entry => `${date(entry.startsOn)} to ${date(entry.endsBefore)}, 00:00 UTC`;
  const percent = points => `${(points / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;
  let request = 0;
  let personalRequest = 0;

  function elt(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function loadCampaign(path = '', options = {}) {
    const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
    if (!api) throw new Error('campaign_api_unavailable');
    const response = await fetch(`${api}/clan-operations/state${path}`, {
      credentials: 'omit', signal: AbortSignal.timeout(12_000), ...options,
    });
    if (!response.ok) throw new Error('campaign_api_unavailable');
    const data = await response.json();
    if (!data.ok) throw new Error('campaign_api_unavailable');
    return data;
  }

  function scoreTable(title, rows, eligible) {
    const table = elt('table');
    const header = table.createTHead().insertRow();
    table.createCaption().textContent = title;
    for (const label of ['Faction', 'Players', 'Progress']) {
      const th = elt('th', label);
      th.scope = 'col';
      header.append(th);
    }
    const rowsBody = table.createTBody();
    for (const score of [...rows].sort((a, b) => b.points - a.points)) {
      const tr = rowsBody.insertRow();
      const name = elt('th', factionName(score.faction_id));
      name.scope = 'row';
      tr.append(name, elt('td', `${score.participants}/${score.roster}`),
        elt('td', percent(score.points) + (eligible.includes(score.faction_id) ? ' · Qualified' : '')));
    }
    return table;
  }

  function showProgress(section, window) {
    const progress = window.progress;
    if (!progress) {
      section.append(elt('p', 'Final results are settling.'));
      return;
    }
    if (window.mode === 'city') {
      const stages = progress.stages ?? [{ title: 'City progress', points: progress.cityPoints }];
      for (const stage of stages) {
        if (stage.points === null) {
          section.append(elt('p', `${stage.title} unlocks when the districts are restored.`));
          continue;
        }
        const meter = elt('progress');
        meter.max = window.cityTarget * 100;
        meter.value = stage.points;
        meter.setAttribute('aria-label', stage.title);
        section.append(elt('p', `${stage.title} · ${percent(stage.points)} · target ${window.cityTarget}%`), meter);
      }
    } else if (window.mode === 'ranked') {
      const winners = progress.eligibleFactions.map(factionName);
      section.append(elt('p', winners.length
        ? `${window.status === 'closed' ? 'Winner' : 'Current leader'} · ${winners.join(', ')}`
        : 'Two crews of at least three roster members are needed to place.'));
    } else {
      section.append(elt('p', `Crew target ${progress.threshold}% of the objective.`));
    }
    section.append(scoreTable(window.title, progress.rows, progress.eligibleFactions));
  }

  function showWindow(window, award, closed) {
    const section = elt(closed ? 'details' : 'section');
    section.append(elt(closed ? 'summary' : 'h5', window.title), elt('p', period(window)),
      elt('p', window.description));
    if (award) section.append(elt('p', `Collectible · ${award.title}`));
    showProgress(section, window);
    return section;
  }

  function renderCampaign(data) {
    body.replaceChildren();
    const { campaign, upcoming, previous } = data;
    if (art && campaign?.theme.artwork) art.src = '/art/' + encodeURIComponent(campaign.theme.artwork);
    else if (art) art.src = defaultArt;

    if (upcoming) body.append(elt('p', `Next campaign · Season ${upcoming.seasonId} · ${upcoming.title} · ${date(upcoming.startsOn)} at 00:00 UTC`));
    if (campaign) {
      body.append(elt('h4', `Season ${campaign.seasonId} · ${campaign.theme.title}`),
        elt('p', period(campaign)), elt('p', campaign.theme.description));
      const acts = elt('ol');
      acts.setAttribute('aria-label', 'Campaign acts');
      const day = data.utc_day;
      for (const act of campaign.acts) {
        const current = day >= act.startsOn && day < act.endsBefore;
        const item = elt('li', `${act.title} · ${date(act.startsOn)}${current ? ' · Current act' : ''}`);
        if (current) {
          item.setAttribute('aria-current', 'step');
          item.append(elt('p', act.description));
        }
        acts.append(item);
      }
      body.append(acts, elt('p', 'Bank tiers in your daily operation. Each challenge uses the locked roster for the UTC week in which it opens.'),
        elt('h4', 'Open challenges'));
      const link = elt('a', 'Play today’s Clan Operation');
      link.href = '#clan-operation';
      body.append(link);
      const open = campaign.windows.filter(window => window.status === 'open');
      const awardFor = window => campaign.collectibles.find(award => award.earnedFrom === window.id);
      for (const window of open) body.append(showWindow(window, awardFor(window), false));
      if (!open.length) body.append(elt('p', 'There are no open challenges today.'));
      const next = campaign.windows.find(window => window.status === 'upcoming');
      if (next) body.append(elt('p', `Next ${next.kind} opens ${date(next.startsOn)} at 00:00 UTC.`));
      const finished = campaign.windows.filter(window => window.status === 'closed' || window.status === 'settling');
      if (finished.length) {
        const results = elt('details');
        results.append(elt('summary', 'Completed challenges'));
        for (const window of finished.reverse()) results.append(showWindow(window, awardFor(window), true));
        body.append(results);
      }
    }
    if (previous) {
      const finale = { ...previous.finale, progress: previous.progress, status: 'closed',
        title: `Season ${previous.seasonId} finale · ${previous.finale.title}` };
      body.append(showWindow(finale, null, true));
    }
    if (!campaign && !upcoming && !previous) body.append(elt('p', 'The next campaign has yet to be prepared.'));
  }

  async function refreshCampaign() {
    const current = ++request;
    refresh.disabled = true;
    status.textContent = 'Loading campaign…';
    try {
      const data = await loadCampaign('?view=campaign');
      if (current !== request) return;
      renderCampaign(data);
      status.textContent = '';
    } catch {
      if (current !== request) return;
      body.replaceChildren();
      status.textContent = 'Campaign data is temporarily unavailable.';
    } finally {
      if (current === request) refresh.disabled = false;
    }
  }

  async function refreshCollectibles() {
    const current = ++personalRequest;
    collection.replaceChildren();
    personalStatus.textContent = '';
    if (!personal.open) return;
    const identity = window.MOONBOYS_IDENTITY;
    const owner = identity?.getTelegramId?.();
    if (!owner) {
      personalStatus.textContent = 'Connect Telegram to see your campaign collectibles.';
      return;
    }
    const stillCurrent = () => current === personalRequest && owner === identity.getTelegramId?.();
    personalStatus.textContent = 'Loading your collectibles…';
    try {
      const auth = identity.getFreshTelegramAuth
        ? await identity.getFreshTelegramAuth()
        : identity.getSignedTelegramAuth?.();
      if (!stillCurrent()) return;
      if (!auth) throw new Error('telegram_auth_unavailable');
      const data = await loadCampaign('', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_auth: auth, campaign_rewards_ui: 1 }),
      });
      if (!stillCurrent()) return;
      const items = data.collectibles.map(award => elt('li', `${award.collectible} · Season ${award.season_id}`));
      collection.replaceChildren(...items);
      personalStatus.textContent = items.length ? '' : 'You haven’t earned a campaign collectible yet.';
    } catch {
      if (stillCurrent()) personalStatus.textContent = 'Your campaign collectibles are temporarily unavailable.';
    }
  }

  refresh.addEventListener('click', refreshCampaign);
  disclosure.addEventListener('toggle', () => { if (disclosure.open) refreshCampaign(); });
  personal.addEventListener('toggle', refreshCollectibles);
  window.addEventListener('moonboys:identity-change', refreshCollectibles);
  window.addEventListener('moonboys:clan-operation-banked', () => {
    if (disclosure.open) refreshCampaign();
  });
  if (disclosure.open) refreshCampaign();
}
