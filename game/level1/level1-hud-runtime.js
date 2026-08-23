// Level 1 HUD Runtime
// Connects gameplay state to the visible XP / progress display.

export class Level1HudRuntime {
  constructor(hud, gameplayState) {
    this.hud = hud;
    this.gameplayState = gameplayState;
  }

  init() {
    this.refresh();
  }

  update() {
    this.refresh();
  }

  refresh() {
    if (!this.hud || !this.gameplayState) return;

    this.hud.update({
      xp: this.gameplayState.xp || 0,
      coins: this.gameplayState.coins || 0,
      completed: this.gameplayState.completed || false
    });
  }
}
