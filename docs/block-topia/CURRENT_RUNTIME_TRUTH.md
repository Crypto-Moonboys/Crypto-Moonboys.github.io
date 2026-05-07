# Block Topia — Current Runtime Truth

## Current live runtime

`/games/block-topia/` is the active gated 2-player Colyseus survival/mission prototype.

Live now:

- Telegram-linked account required
- 50 Arcade XP required
- `MinimalCityRoom` is the only live room
- NPCs
- attacks
- HP
- downs and respawns
- ready/start/restart flow
- world phases
- objectives
- extraction
- upgrades and recovery

## Active files

- `games/block-topia/index.html`
- `games/block-topia/main.js`
- `games/block-topia/network.js`
- `games/block-topia/styles.css`
- `server/block-topia/src/index.js`
- `server/block-topia/src/rooms/MinimalCityRoom.js`
- `workers/moonboys-api/blocktopia/routes.js`

## Live route surface

- `POST /blocktopia/progression`
- `POST /blocktopia/progression/entry`
- `POST /blocktopia/progression/upgrade`
- `POST /blocktopia/progression/mini-game`
- `POST /blocktopia/progression/reset`

## Drift rule

Do not document Block Topia as an MMO, persistent city sim, economy sim, or faction-war sandbox unless the code is wired and live.
