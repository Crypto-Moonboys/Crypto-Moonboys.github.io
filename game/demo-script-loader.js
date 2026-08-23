// Demo dependency loader
// Loads runtime modules in dependency order for NBG London Graffiti Run.

const NBGDemoModules = [
  'runtime-asset-loader.js',
  'engine/level-render-pipeline.js',
  'engine/london-environment-loader.js',
  'level1/level1-controller.js',
  'level1/level1-main-runtime.js',
  'demo-level1-boot.js'
];

window.NBGDemoModules = NBGDemoModules;
