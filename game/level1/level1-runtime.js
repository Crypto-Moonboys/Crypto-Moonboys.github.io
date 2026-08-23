// NBG London Graffiti Run - Level 1 Runtime Integration
// Connects the Level 1 scene with the render pipeline.

export function createLevel1Runtime({ scene, renderer, assets, player, camera, hud }) {
  return {
    scene,
    renderer,
    assets,
    player,
    camera,
    hud,
    running: true,

    update(delta) {
      if (!this.running) return;

      player.update(delta);
      camera.follow(player);
      scene.update(delta);
      renderer.render(scene, camera);
      hud.update(scene.xp || 0);
    }
  };
}
