import { LEADERS } from '/js/waterfront-faction-identities.mjs?v=2';
import {
  clanLeaderQuestionError, clanLeaderSourceLinks, getClanLeaderBoard, mountClanLeaderDialog, sendClanLeaderQuestion,
} from '/js/clan-leader-dialog.js?lore=3';

const names = new Map(Object.entries(LEADERS).map(([id, profile]) => [id, profile.character]));
const keys = Array.from(names.keys());
const pick = document.querySelector('#map-leader-faction');
const controls = document.querySelector('#map-leader-controls');
for (const [key, name] of names) pick.add(new Option(name, key));
controls.hidden = false;

const map = document.querySelector('#map');
const mapViewport = document.querySelector('.viewport');
const mapScroller = document.querySelector('.map-scroll');
const openSlowdown = mountClanLeaderDialog(mapViewport, refresh);

const details = document.createElement('section');
details.className = 'leader-map-details';
details.setAttribute('aria-labelledby', 'leader-map-name');
details.hidden = true;
details.innerHTML = `
  <button type="button" data-close aria-label="Close leader details">×</button>
  <h2 id="leader-map-name"></h2>
  <p><span data-role></span> <span data-activity></span></p>
  <a data-character-page>Character wiki</a>
  <button type="button" data-ask>Ask a question</button>
  <button type="button" data-slow>Rival slowdowns</button>`;

const questionBox = document.createElement('dialog');
questionBox.className = 'clan-leader-dialog';
questionBox.setAttribute('aria-labelledby', 'leader-question-title');
questionBox.innerHTML = `
  <h2 id="leader-question-title"></h2>
  <form>
    <p><a data-character-page>Character wiki</a></p>
    <label>Question <textarea rows="3" maxlength="600" required></textarea></label>
    <p>10 free questions per UTC day. Each Clan Operation tier banked today earns one more.</p>
    <button type="submit">Send</button>
    <button type="button" data-cancel>Cancel</button>
  </form>`;
const input = questionBox.querySelector('textarea');

const bubble = document.createElement('div');
bubble.className = 'leader-map-bubble';
bubble.hidden = true;
bubble.innerHTML = `
  <a data-character-page></a>
  <span data-speech></span>
  <button type="button" data-more aria-label="More info">ⓘ</button>
  <button type="button" data-dismiss aria-label="Dismiss reply">×</button>`;

const replyBox = document.createElement('dialog');
replyBox.className = 'clan-leader-dialog';
replyBox.setAttribute('aria-labelledby', 'leader-reply-title');
replyBox.innerHTML = `
  <form method="dialog"><button type="submit" aria-label="Close full reply">Close</button></form>
  <h2 id="leader-reply-title"></h2>
  <p><a data-character-page>Character wiki</a></p>
  <div data-full-reply></div>`;

const announcement = document.createElement('p');
announcement.className = 'leader-map-announcement';
announcement.setAttribute('role', 'status');
mapViewport.append(details, questionBox, bubble, replyBox, announcement);

const histories = new Map();
let board;
let selected;
let asking;
let reply;
let pendingSelection;
let sequence = 0;
let returnTimer;

function lookup(key) {
  return board?.crews.find(crew => crew.faction_id === key);
}

function showDetails(key) {
  selected = key;
  const presence = lookup(key)?.presence;
  details.querySelector('h2').textContent = names.get(key);
  details.querySelector('[data-role]').textContent = LEADERS[key].callSign;
  const playing = presence?.playing_until * 1000 > Date.now();
  const paused = presence?.paused_until * 1000 > Date.now();
  details.querySelector('[data-activity]').textContent = playing ? '· Playing a game' : paused ? '· Paused' : '· In Waterfront';
  details.querySelector('[data-character-page]').href = LEADERS[key].bio;
  details.querySelector('[data-ask]').hidden = !board?.chat_enabled || playing;
  details.querySelector('[data-slow]').hidden = !board?.controls;
  details.hidden = false;
}

function openQuestion(key) {
  if (!board?.chat_enabled || lookup(key)?.presence?.playing_until * 1000 > Date.now()) return;
  asking = key;
  questionBox.querySelector('h2').textContent = 'Ask ' + names.get(key);
  questionBox.querySelector('[data-character-page]').href = LEADERS[key].bio;
  input.value = '';
  if (!questionBox.open) questionBox.showModal();
  input.focus();
}

function positionBubble() {
  if (!reply) return;
  const index = keys.indexOf(reply.key);
  const hit = index === selectedAvatar
    ? { x: player.x * tileSize + 16, y: player.y * tileSize + 22 }
    : factionHits.find(actor => actor.index === index);
  if (!hit) { bubble.hidden = true; return; }
  const gameBounds = map.getBoundingClientRect();
  const frame = mapScroller.getBoundingClientRect();
  const parent = mapViewport.getBoundingClientRect();
  const x = gameBounds.left + hit.x * gameBounds.width / mapWidth;
  const y = gameBounds.top + (hit.y - 20) * gameBounds.height / mapHeight;
  bubble.hidden = x < frame.left || x > frame.right || y < frame.top || y > frame.bottom;
  if (bubble.hidden) return;
  const half = bubble.offsetWidth / 2;
  bubble.style.left = Math.round(Math.min(parent.width - half - 4, Math.max(half + 4, x - parent.left))) + 'px';
  bubble.style.top = Math.round(Math.max(bubble.offsetHeight + 5, y - parent.top - 8)) + 'px';
}

function showSpeech(key, text, sources = [], error) {
  reply = { key, text, sources, error };
  const clipped = text.length > 145;
  const cut = text.slice(0, 140);
  const short = clipped ? (cut.replace(/\s+\S*$/u, '') || cut) + '…' : text;
  const profileLink = bubble.querySelector('[data-character-page]');
  profileLink.href = LEADERS[key].bio;
  profileLink.textContent = names.get(key);
  bubble.querySelector('[data-speech]').textContent = short;
  bubble.querySelector('[data-more]').hidden = !(clipped || sources.length || error === 'lore_task_required');
  announcement.textContent = names.get(key) + ': ' + text;
  positionBubble();
}

function clearSelection() {
  clearTimeout(pendingSelection);
  selected = null;
  details.hidden = true;
}

async function refresh() {
  if (!window.waterfrontAccess.canPlay()) return;
  try {
    const next = await getClanLeaderBoard();
    if (!window.waterfrontAccess.canPlay()) return;
    board = next;
    leaderStates = keys.map((key, index) => {
      const presence = lookup(key)?.presence;
      const pausedUntil = (presence?.paused_until ?? 0) * 1000;
      const playingUntil = (presence?.playing_until ?? 0) * 1000;
      return {
        pausedUntil, playingUntil, talking: presence?.talking,
        sceneTime: leaderStates[index]?.pausedUntil === pausedUntil ? leaderStates[index].sceneTime : sceneTime,
      };
    });
    clearTimeout(returnTimer);
    const now = Date.now();
    const ends = leaderStates.flatMap(state => [state.playingUntil, state.pausedUntil]).filter(time => time > now);
    if (ends.length) returnTimer = setTimeout(() => {
      if (selected) showDetails(selected);
      paintMap();
    }, Math.min(...ends) - now + 30);
    if (selected) showDetails(selected);
    paintMap();
  } catch {
    // Keep the last verified board through a temporary connection failure.
  }
}

map.addEventListener('waterfront:leader-select', ({ detail: { index, ask } }) => {
  clearTimeout(pendingSelection);
  const key = keys[index];
  if (ask && board?.chat_enabled) {
    showDetails(key);
    openQuestion(key);
  } else {
    pendingSelection = setTimeout(() => showDetails(key), 365);
  }
});
map.addEventListener('waterfront:leader-clear', clearSelection);
map.addEventListener('waterfront:map-painted', positionBubble);
mapScroller.addEventListener('scroll', positionBubble, { passive: true });
mapViewport.addEventListener('fullscreenchange', positionBubble);
document.querySelector('#map-leader-talk').addEventListener('click', () => showDetails(pick.value));
details.querySelector('[data-close]').addEventListener('click', clearSelection);
details.querySelector('[data-ask]').addEventListener('click', () => openQuestion(selected));
details.querySelector('[data-slow]').addEventListener('click', () => {
  const leader = lookup(selected);
  if (leader && board.controls) openSlowdown(names.get(selected), leader, board.controls, false);
});
questionBox.querySelector('[data-cancel]').addEventListener('click', () => questionBox.close());
questionBox.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || !asking) return;
  const key = asking;
  const ticket = ++sequence;
  const owner = window.MOONBOYS_IDENTITY?.getTelegramId?.();
  const historyKey = owner + ':' + key;
  const previous = histories.get(historyKey) ?? [];
  questionBox.close();
  mapViewport.setAttribute('data-leader-question-pending', '');
  showSpeech(key, 'Thinking…');
  const result = await sendClanLeaderQuestion(key, question, previous);
  if (result.ok) histories.set(historyKey, [...previous, { question, reply: result.reply }].slice(-2));
  if (ticket !== sequence) return;
  mapViewport.removeAttribute('data-leader-question-pending');
  if (result.ok) showSpeech(key, result.reply, result.sources);
  else showSpeech(key, clanLeaderQuestionError(result.error), [], result.error);
});
bubble.querySelector('[data-dismiss]').addEventListener('click', () => {
  sequence++;
  mapViewport.removeAttribute('data-leader-question-pending');
  reply = null;
  bubble.hidden = true;
});
bubble.querySelector('[data-more]').addEventListener('click', () => {
  if (!reply) return;
  replyBox.querySelector('h2').textContent = names.get(reply.key) + ' · Reply';
  replyBox.querySelector('[data-character-page]').href = LEADERS[reply.key].bio;
  const full = replyBox.querySelector('[data-full-reply]');
  const text = document.createElement('p');
  text.textContent = reply.text;
  full.replaceChildren(text);
  if (reply.sources.length) full.append(clanLeaderSourceLinks(reply.sources));
  if (reply.error === 'lore_task_required') {
    const link = document.createElement('a');
    link.href = '/community.html#clan-operation-title';
    link.textContent = 'Open Clan Operations';
    full.append(link);
  }
  replyBox.showModal();
});

window.addEventListener('waterfront:access', () => {
  if (window.waterfrontAccess.canPlay()) {
    refresh();
  } else {
    sequence++;
    mapViewport.removeAttribute('data-leader-question-pending');
    histories.clear();
    clearSelection();
    reply = null;
    bubble.hidden = true;
    announcement.textContent = '';
  }
});
setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
