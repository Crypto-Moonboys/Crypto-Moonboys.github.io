// NBG Game Entity Loader
// Loads Level 1 entities from JSON definitions and prepares runtime objects.

const NBGEntities = {
  player: null,
  coins: [],
  enemies: [],
  checkpoints: []
};

async function loadLevelEntities(levelFile) {
  const response = await fetch(levelFile);
  const level = await response.json();

  NBGEntities.player = {
    x: level.player.x,
    y: level.player.y,
    width: 32,
    height: 48,
    velocityX: 0,
    velocityY: 0,
    grounded: false,
    animation: 'idle'
  };

  NBGEntities.coins = level.coins || [];
  NBGEntities.enemies = level.enemies || [];
  NBGEntities.checkpoints = level.checkpoints || [];

  return NBGEntities;
}

window.NBGEntities = NBGEntities;
window.loadLevelEntities = loadLevelEntities;
