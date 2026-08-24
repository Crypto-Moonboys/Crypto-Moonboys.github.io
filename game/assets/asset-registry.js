// NBG London Graffiti Run
// Runtime asset registry
// Phase 2: real asset integration

window.NBGAssetRegistry = {
  player: {
    manifest: "assets/player/nbg-runner-animation-manifest.json",
    animations: {
      idle: "assets/player/animations/idle.png",
      run: "assets/player/animations/run.png",
      jump: "assets/player/animations/jump.png",
      fall: "assets/player/animations/fall.png",
      spray: "assets/player/animations/spray.png",
      hurt: "assets/player/animations/hurt.png",
      victory: "assets/player/animations/victory.png"
    }
  },
  world: {
    sky: "assets/world/london-sky.png",
    moon: "assets/world/london-moon.png",
    skyline: "assets/world/london-skyline.png",
    graffiti: "assets/world/graffiti-wall.png",
    street: "assets/world/street-tiles.png",
    foreground: "assets/world/foreground.png"
  },
  objects: {
    coins: "assets/objects/xp-coins.png",
    checkpoint: "assets/objects/checkpoint.png",
    finish: "assets/objects/finish-flag.png"
  },
  enemies: {
    rat: "assets/enemies/london-rat.png",
    pigeon: "assets/enemies/pigeon.png",
    bot: "assets/enemies/graffiti-bot.png"
  },
  ui: {
    hud: "assets/ui/hud.png",
    title: "assets/ui/title-screen.png"
  }
};
