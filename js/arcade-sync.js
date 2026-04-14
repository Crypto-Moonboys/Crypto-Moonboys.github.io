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
    const n = parseInt(localStorage.getItem(`highscore_${game}`) || "0", 10);
    return isNaN(n) ? 0 : n;
  },

  setHighScore(game, score) {
    if (typeof score !== "number" || !isFinite(score) || score < 0) {
      console.warn("[arcade-sync] Invalid score; not persisted:", score);
      return;
    }
    const current = this.getHighScore(game);
    if (Math.floor(score) > current) {
      localStorage.setItem(`highscore_${game}`, Math.floor(score));
    }
  }
};