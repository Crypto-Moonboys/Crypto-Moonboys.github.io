// NBG Game HUD
// Displays XP and leaderboard score.

export class HUD {
  constructor(element) {
    this.element = element;
  }

  update(xp) {
    if (this.element) {
      this.element.textContent = `XP: ${xp}`;
    }
  }
}
