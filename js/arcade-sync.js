export const ArcadeSync = {
  getPlayer() {
    let player = localStorage.getItem("moonboys_player");
    if (!player) {
      player = `Player_${Math.floor(Math.random() * 10000)}`;
      localStorage.setItem("moonboys_player", player);
    }
    return player;
  },

  setPlayer(name) {
    localStorage.setItem("moonboys_player", name);
  },

  getHighScore(game) {
    return parseInt(
      localStorage.getItem(`highscore_${game}`) || "0",
      10
    );
  },

  setHighScore(game, score) {
    const current = this.getHighScore(game);
    if (score > current) {
      localStorage.setItem(`highscore_${game}`, score);
    }
  }
};