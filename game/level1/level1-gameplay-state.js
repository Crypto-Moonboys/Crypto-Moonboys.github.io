// NBG London Graffiti Run - Level 1 Gameplay State

const Level1GameplayState = {
  xp: 0,
  completed: false,
  hits: 0,

  init() {
    this.xp = 0;
    this.completed = false;
    this.hits = 0;
  },

  collectXP(amount = 1) {
    this.xp += amount;
    return this.xp;
  },

  playerHit() {
    this.hits += 1;
  },

  finishLevel() {
    this.completed = true;
    return {
      xp: this.xp,
      completed: this.completed,
      hits: this.hits
    };
  }
};

export default Level1GameplayState;
