export const CLAN_REWARD_NAMES = Object.freeze({
  weekly: 'Crew Spotlight Badge',
  monthly: 'Monthly Crew Champion Badge',
  seasonal: 'City Champion Trophy and title',
});

export function renderClanPeriodRewards(list, awards, faction = null) {
  const items = awards
    .filter(award => !faction || award.faction_id === faction)
    .map(award => {
      const item = document.createElement('li');
      const clan = window.MOONBOYS_FACTION_PROFILES?.[award.faction_id]?.name
        || award.faction_id.replaceAll('-', ' ');
      item.textContent = `${CLAN_REWARD_NAMES[award.kind]} · ${clan} · ${award.starts_on} UTC`;
      return item;
    });
  list.replaceChildren(...items);
  list.hidden = items.length === 0;
}

const profile = document.querySelector('[data-clan-profile-awards]');
if (profile) {
  const list = profile.querySelector('ul');
  const status = profile.querySelector('[role="status"]');
  let requestId = 0;
  async function refreshAwards() {
    const current = ++requestId;
    list.replaceChildren();
    list.hidden = true;
    status.textContent = '';
    if (!profile.open) return;
    const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
    const identity = window.MOONBOYS_IDENTITY;
    const owner = identity?.getTelegramId?.();
    if (!api || !owner) {
      status.textContent = 'Connect Telegram to view your clan awards.';
      return;
    }
    status.textContent = 'Loading clan awards…';
    const stillCurrent = () => profile.open && current === requestId && owner === identity.getTelegramId?.();
    try {
      const auth = identity.getFreshTelegramAuth
        ? await identity.getFreshTelegramAuth()
        : identity.getSignedTelegramAuth?.();
      if (!stillCurrent()) return;
      if (!auth) throw new Error('clan_award_session_unavailable');
      const response = await fetch(`${api}/clan-operations/state`, {
        method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(12_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_auth: auth, period_rewards_ui: 'profile' }),
      });
      if (!response.ok) throw new Error('clan_awards_unavailable');
      const data = await response.json();
      if (stillCurrent() && Array.isArray(data.period_rewards)) {
        renderClanPeriodRewards(list, data.period_rewards);
        status.textContent = list.hidden ? 'No clan awards earned yet.' : '';
      }
    } catch {
      if (stillCurrent()) status.textContent = 'Clan awards are temporarily unavailable.';
    }
  }
  window.addEventListener('moonboys:identity-change', refreshAwards);
  profile.addEventListener('toggle', refreshAwards);
}
