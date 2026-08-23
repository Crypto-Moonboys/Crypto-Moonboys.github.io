// NBG Game XP System
// Coins are leaderboard score only

export class XPSystem {
  constructor() {
    this.xp = 0;
    this.coins = 0;
  }

  collectCoin(value = 1) {
    this.coins += 1;
    this.xp += value;
  }

  getScore() {
    return {
      coins: this.coins,
      xp: this.xp
    };
  }
}
