// Level 1 HUD bridge
// Connects gameplay state updates to the HUD runtime.

export class Level1HudBridge {
  constructor(hud, gameplayState) {
    this.hud = hud;
    this.gameplayState = gameplayState;
  }

  init() {
    this.update();
  }

  update() {
    if (!this.hud || !this.gameplayState) return;

    this.hud.update({
      xp: this.gameplayState.xp || 0,
      coins: this.gameplayState.coins || 0,
      completed: this.gameplayState.completed || false
    });
  }
}
