import { LEADERS } from '/js/waterfront-faction-identities.mjs?v=2';

const identity = window.MOONBOYS_IDENTITY;
const gate = document.querySelector('#bt-gate');
const game = document.querySelector('#waterfront-game');
const status = document.querySelector('#waterfront-entry-status');
const buttons = {
  login: document.querySelector('#waterfront-login'),
  faction: document.querySelector('#waterfront-join-faction'),
  enter: document.querySelector('#waterfront-enter'),
  retry: document.querySelector('#waterfront-retry'),
};

let lease = crypto.randomUUID();
let proof;
let faction;
let admitted = false;
let deadline = 0;
let generation = 0;
let pending;
let renewal;
let expiry;
let mapStartup;
let leavingPage = false;

const canPlay = () => admitted && Date.now() < deadline;
const notify = () => window.dispatchEvent(new Event('waterfront:access'));
window.waterfrontAccess = Object.freeze({
  canPlay,
  faction: () => faction,
  reload: async () => {
    leavingPage = true;
    await clearSeat('Checking access…');
    window.location.reload();
  },
});

function showGate(message, button) {
  const wasAdmitted = admitted;
  admitted = false;
  for (const dialog of game.querySelectorAll('dialog[open]')) dialog.close();
  game.inert = true;
  game.hidden = true;
  if (document.fullscreenElement === game) document.exitFullscreen().catch(() => {});
  status.textContent = message;
  for (const [name, element] of Object.entries(buttons)) element.hidden = name !== button;
  gate.hidden = false;
  if (wasAdmitted) {
    notify();
    buttons[button]?.focus({ preventScroll: true });
  }
}

function seatRequest(action, telegramAuth, currentLease) {
  const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
  if (!api) return Promise.resolve({ error: 'admission_unavailable' });
  return fetch(api + '/blocktopia/waterfront/seat', {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    keepalive: action === 'leave', signal: AbortSignal.timeout(action === 'leave' ? 3000 : 8000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, lease_id: currentLease, telegram_auth: telegramAuth }),
  }).then(response => response.json()).catch(() => ({ error: 'admission_unavailable' }));
}

function clearSeat(message, button) {
  const old = lease;
  const auth = proof;
  generation++;
  pending = null;
  proof = null;
  lease = crypto.randomUUID();
  clearTimeout(renewal);
  clearTimeout(expiry);
  deadline = 0;
  showGate(message, button);
  return auth ? seatRequest('leave', auth, old) : Promise.resolve();
}

function script(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src = new URL(url, import.meta.url).href;
    element.onload = resolve;
    element.onerror = () => { element.remove(); reject(new Error('map_load_failed')); };
    document.body.append(element);
  });
}

function bootMap(district) {
  if (!mapStartup) {
    mapStartup = (async () => {
      const { extendWaterfront, restoreIslandLayout, islandPatrol, islandSeed } =
        await import('./nature-island.mjs?v=2');
      window.waterfrontDistrict = extendWaterfront(district);
      window.restoreWaterfrontLayout = restoreIslandLayout;
      window.waterfrontIslandPatrol = islandPatrol;
      window.waterfrontIslandSeed = islandSeed;
      if (!window.createWaterfrontFactionConversations) {
        const { createFactionConversations } = await import('./faction-conversations.mjs?v=2');
        window.createWaterfrontFactionConversations = createFactionConversations;
      }
      window.waterfrontCharacterNames = Object.values(LEADERS).map(leader => leader.character);
      if (!window.drawWaterfront) await script('harbor-art.js?v=47');
      if (!window.waterfrontCrewBriefing) await script('crew-briefing.js?v=1');
      if (!window.waterfrontMapLoaded) await script('map.js?v=10');
      if (!window.waterfrontMapLoaded) throw new Error('map_load_failed');
      await import('./leader-dialog.js?lore=9');
    })().catch(error => {
      mapStartup = null;
      throw error;
    });
  }
  return mapStartup;
}

function keepSeat(expiresIn, requestedAt) {
  // Use the request start for a conservative local expiry, independent of the
  // browser clock's offset from the server clock.
  deadline = requestedAt + (expiresIn - 1) * 1000;
  clearTimeout(expiry);
  clearTimeout(renewal);
  expiry = setTimeout(() => clearSeat('Your Waterfront seat expired.', 'retry'), Math.max(0, deadline - Date.now()));
  renewal = setTimeout(() => checkSeat('renew'), 20000);
}

function handleClosed(error) {
  const messages = {
    connect_telegram: ['Sign in with Telegram to see Waterfront.', 'login'],
    join_faction: ['Join one of the nine factions in Battle Chamber to play.', 'faction'],
    seat_occupied: ['Someone from your faction is already playing.', 'retry'],
    seat_lost: ['Your Waterfront seat is no longer active.', 'retry'],
  };
  clearSeat(...(messages[error] ?? ['Waterfront access is temporarily unavailable.', 'retry']));
}

async function checkSeat(action = 'status') {
  if (leavingPage) return;
  if (pending) {
    if (action === 'renew' && deadline > Date.now()) renewal = setTimeout(() => checkSeat('renew'), 5000);
    return;
  }
  const turn = { generation, lease };
  pending = turn;
  if (action !== 'renew') showGate(action === 'join' ? 'Reserving your faction’s seat…' : 'Checking access…');
  try {
    await identity?.ready;
    const auth = identity?.getFreshTelegramAuth
      ? await identity.getFreshTelegramAuth()
      : identity?.getSignedTelegramAuth?.();
    if (turn.generation !== generation) return;
    if (!auth || String(auth.id) !== String(identity.getTelegramId?.() ?? '')) {
      handleClosed('connect_telegram');
      return;
    }
    const requestedAt = Date.now();
    const result = await seatRequest(action, auth, turn.lease);
    if (turn.generation !== generation) {
      if (action === 'join' && result.ok) seatRequest('leave', auth, turn.lease);
      return;
    }
    if (String(auth.id) !== String(identity.getTelegramId?.() ?? '')) {
      if (action === 'join' && result.ok) seatRequest('leave', auth, turn.lease);
      clearSeat('Checking access…');
      checkSeat();
      return;
    }
    if (!result.ok) {
      if (action === 'renew' && canPlay() && ['admission_unavailable', 'rate_limited'].includes(result.error)) {
        renewal = setTimeout(() => checkSeat('renew'), 5000);
      } else {
        handleClosed(result.error);
      }
      return;
    }
    if (action === 'status') {
      if (result.occupied) showGate('Someone from your faction is already playing.', 'retry');
      else showGate('One player per faction. Your faction’s seat is open.', 'enter');
      return;
    }
    if (!Number.isInteger(result.expires_in) || result.expires_in < 2 || !result.faction_id) {
      handleClosed('admission_unavailable');
      return;
    }
    proof = auth;
    faction = result.faction_id;
    keepSeat(result.expires_in, requestedAt);
    if (action === 'join') {
      await bootMap(result.district);
      if (turn.generation !== generation || deadline <= Date.now()) return;
      admitted = true;
      game.hidden = false;
      game.inert = false;
      gate.hidden = true;
      notify();
      document.querySelector('#map-info').focus({ preventScroll: true });
    }
  } catch {
    if (turn.generation === generation) handleClosed('admission_unavailable');
  } finally {
    if (pending === turn) pending = null;
  }
}

buttons.enter.addEventListener('click', () => checkSeat('join'));
buttons.retry.addEventListener('click', () => checkSeat());
document.querySelector('#waterfront-leave').addEventListener('click', async () => {
  await clearSeat('You left Waterfront.', 'retry');
  checkSeat();
});
window.addEventListener('moonboys:identity-change', () => {
  if (proof && String(proof.id) !== String(identity.getTelegramId?.() ?? '')) {
    clearSeat('Checking access…');
    checkSeat();
  } else if (!admitted) {
    checkSeat();
  }
});
window.addEventListener('pagehide', () => {
  leavingPage = true;
  clearSeat('Checking access…');
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  leavingPage = false;
  checkSeat();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !admitted) return;
  if (canPlay()) checkSeat('renew');
  else clearSeat('Your Waterfront seat expired.', 'retry');
});

checkSeat();
