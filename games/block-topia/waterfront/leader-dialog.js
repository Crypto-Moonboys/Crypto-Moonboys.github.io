import { getClanLeaderBoard, mountClanLeaderDialog } from '/js/clan-leader-dialog.js';

const names = new Map([
  ['all-city-bulls', 'All City Bulls'],
  ['nomad-bears', 'The Nomad Bears'],
  ['hard-fork-rockers', 'Hard Fork Rockers'],
  ['rugpull-miners', 'Rugpull Miners'],
  ['crypto-moongirls', 'Crypto Moongirls'],
  ['blockchain-furies', 'The Blockchain Furies'],
  ['graffpunks', 'GraffPunks'],
  ['crypto-stoned-boys', 'Crypto Stinedboys'],
  ['blockstars', 'The Blockstars'],
]);
const keys = Array.from(names.keys());
const pick = document.querySelector('#map-leader-faction');
const controls = document.querySelector('#map-leader-controls');
for (const [key, name] of names) pick.add(new Option(name, key));

let board;
const openDialog = mountClanLeaderDialog(document.querySelector('.viewport'), refresh);

async function refresh() {
  try {
    const next = await getClanLeaderBoard();
    const enabled = Boolean(next?.controls);
    factionDialogsEnabled = enabled;
    controls.hidden = !enabled;
    board = next;
    leaderPauses = keys.map((key, index) => {
      const presence = board?.crews.find(crew => crew.faction_id === key)?.presence;
      const until = (presence?.paused_until ?? 0) * 1000;
      if (until <= Date.now()) return null;
      return {
        until,
        talking: presence.talking,
        sceneTime: leaderPauses[index]?.until === until ? leaderPauses[index].sceneTime : sceneTime,
      };
    });
    paintMap();
  } catch {
    // Keep the last verified board through a temporary connection failure.
  }
}

function talk(key) {
  const leader = board?.crews.find(crew => crew.faction_id === key);
  if (leader && board.controls) openDialog(names.get(key), leader, board.controls);
}

document.querySelector('#map').addEventListener('waterfront:faction-talk', event => talk(keys[event.detail]));
document.querySelector('#map-leader-talk').addEventListener('click', () => talk(pick.value));
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
