import { loadSeasonConfig, loadLoreFeed, loadProphecyCandidates } from './blocktopia-season.js';
import { loadEconomyState, saveEconomyState, rollMarketTick, buyExposure, sellExposure, buyGear, scoreNightRun } from './blocktopia-economy.js';
import { fetchDistrictState, updateDistrictControl } from './blocktopia-districts.js';
import { pushBattleEvent, buildGraffitiEvent } from './blocktopia-battle-sync.js';
import { submitScore } from '/js/leaderboard-client.js';
import { ArcadeSync } from '/js/arcade-sync.js';

export async function bootBlockTopia(containerId = 'phaser-root') {
  const [season, lore, prophecy] = await Promise.all([
    loadSeasonConfig(),
    loadLoreFeed(),
    loadProphecyCandidates()
  ]);

  const economy = loadEconomyState();
  const districts = await fetchDistrictState();
  const player = ArcadeSync.getPlayer();

  const config = {
    type: Phaser.AUTO,
    width: 1080,
    height: 720,
    parent: containerId,
    backgroundColor: '#0b0912',
    physics: { default: 'arcade' },
    scene: new BlockTopiaScene({ season, lore, prophecy, economy, districts, player })
  };

  new Phaser.Game(config);
}

class BlockTopiaScene extends Phaser.Scene {
  constructor(data) {
    super('BlockTopiaScene');
    this.meta = data;
    this.marketPrice = 100;
    this.heat = 0;
    this.combo = 0;
    this.phase = 'Day';
    this.metaScore = 0;
  }

  preload() {}

  create() {
    this.add.text(20, 20, `${this.meta.lore.world_title} // Season: ${this.meta.season.season_name}`, { color: '#5ef2ff', fontSize: '18px' });
    this.playerSprite = this.add.rectangle(540, 520, 22, 32, 0xff4fd8);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE');

    this.zoneLabels = this.add.group();
    this.createZones();

    this.marketText = this.add.text(20, 60, '', { color: '#ffd84d', fontSize: '16px' });
    this.scoreText = this.add.text(20, 90, 'Score: 0', { color: '#eaf6ff', fontSize: '16px' });
    this.phaseText = this.add.text(20, 120, 'Phase: Day', { color: '#8dff6a', fontSize: '16px' });

    this.time.addEvent({ delay: 2500, loop: true, callback: this.tickMarket, callbackScope: this });

    this.input.keyboard.on('keydown-SPACE', () => this.togglePhase());
  }

  createZones() {
    const zones = [
      { id: 'mural-sector', x: 160, y: 260, color: 0xff4fd8 },
      { id: 'neon-exchange', x: 820, y: 260, color: 0xffd84d },
      { id: 'chain-plaza', x: 720, y: 460, color: 0x5ef2ff }
    ];

    zones.forEach(z => {
      const rect = this.add.rectangle(z.x, z.y, 140, 100, z.color, 0.2).setStrokeStyle(2, z.color);
      rect.zoneId = z.id;
      this.zoneLabels.add(rect);
    });
  }

  tickMarket() {
    const delta = rollMarketTick(this.meta.season.market_conditions);
    this.marketPrice = Math.max(1, this.marketPrice * (1 + delta));
    this.marketText.setText(`Market: ${this.marketPrice.toFixed(2)} | Credits: ${this.meta.economy.credits}`);
  }

  togglePhase() {
    this.phase = this.phase === 'Day' ? 'Night' : 'Day';
    this.phaseText.setText(`Phase: ${this.phase}`);
    if (this.phase === 'Night') this.combo = 0;
  }

  update() {
    const speed = 3;
    if (this.cursors.left.isDown || this.keys.A.isDown) this.playerSprite.x -= speed;
    if (this.cursors.right.isDown || this.keys.D.isDown) this.playerSprite.x += speed;
    if (this.cursors.up.isDown || this.keys.W.isDown) this.playerSprite.y -= speed;
    if (this.cursors.down.isDown || this.keys.S.isDown) this.playerSprite.y += speed;

    this.zoneLabels.getChildren().forEach(zone => {
      if (Phaser.Geom.Intersects.RectangleToRectangle(this.playerSprite.getBounds(), zone.getBounds())) {
        this.handleZone(zone.zoneId);
      }
    });
  }

  handleZone(zoneId) {
    if (this.phase === 'Night') {
      this.combo += 1;
      this.heat = Math.min(1, this.heat + 0.02);
      this.metaScore += 10 + this.combo * 2;

      updateDistrictControl(zoneId, 1, this.meta.player);
      pushBattleEvent(buildGraffitiEvent(this.meta.player, zoneId, this.metaScore));

      const { updatedEconomy, metaScore } = scoreNightRun(this.meta.economy, this.meta.districts.districts[zoneId], this.heat, this.combo);
      this.meta.economy = updatedEconomy;
      saveEconomyState(this.meta.economy);
      this.metaScore += metaScore;

      this.scoreText.setText(`Score: ${this.metaScore}`);
    } else if (zoneId === 'neon-exchange') {
      this.meta.economy = buyExposure(this.meta.economy, this.marketPrice, 100);
      saveEconomyState(this.meta.economy);
    }
  }

  shutdown() {
    const player = this.meta.player;
    submitScore(player, this.metaScore, 'blocktopia-social-hub');
  }
}
