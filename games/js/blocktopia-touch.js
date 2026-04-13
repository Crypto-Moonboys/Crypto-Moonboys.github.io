export function enableTouchControls(scene, playerSprite) {
  let startX = 0;
  let startY = 0;

  scene.input.on('pointerdown', (pointer) => {
    startX = pointer.x;
    startY = pointer.y;
  });

  scene.input.on('pointermove', (pointer) => {
    if (!pointer.isDown) return;

    const dx = pointer.x - startX;
    const dy = pointer.y - startY;

    const speed = 0.1;
    playerSprite.x += dx * speed;
    playerSprite.y += dy * speed;

    startX = pointer.x;
    startY = pointer.y;
  });
}
