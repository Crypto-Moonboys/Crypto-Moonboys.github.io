// NBG Level 1 player spawn controller hook
// Connects player spawn runtime into the Level 1 controller.

(function () {
  window.NBGLevel1PlayerSpawnHook = {
    attach(controller, playerSpawnRuntime) {
      if (!controller || !playerSpawnRuntime) return controller;

      controller.player = playerSpawnRuntime.player || controller.player;
      return controller;
    }
  };
})();
