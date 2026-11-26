**AGENT CHECK REQUIRED — Before changing this game or its assets, audit every wired runtime image and loading path. Confirm that master PNG/JPG files are preserved, smaller transparent WebP derivatives are used at runtime without lost dimensions or sharpness, non-critical art is staged or lazy-loaded where safe, duplicate or unused requests are removed, and gameplay and animation speed are not harmed. Report exactly what already passes, what still needs doing, the affected files and size/performance impact, and any test or visual check that could not be completed. Never assume optimization is finished.**

# Block Topia Live City

`/games/block-topia/` is the current live gated 2-player Colyseus survival/mission prototype.

The [Lumina’s Waterfront handover](waterfront/README.md#preserve-the-restored-harbor) records the production map baseline and the checks for harbor geometry, assets, NPCs and saved edits. Read it before working on `/games/block-topia/waterfront/`.

The [approved map baseline](AGENTS.md) records the seven map views, miner placements, and close-zoom sprite settings.

## Live now

- Telegram-linked account required
- 50 Arcade XP required
- NPCs
- attacks
- HP
- respawns
- phases
- extraction
- upgrades
- ready/start/restart

## Active files

- `index.html`
- `main.js`
- `network.js`
- `styles.css`
- `server/block-topia/src/index.js`
- `server/block-topia/src/rooms/MinimalCityRoom.js`
