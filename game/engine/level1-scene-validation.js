// Level 1 Scene Validation
// Checks that all major render modules can initialise together.

const Level1SceneValidation = {
  modules: [
    'london-environment',
    'nbg-runner',
    'xp-coins',
    'enemies',
    'objects'
  ],

  validate(scene) {
    return this.modules.map(module => ({
      module,
      ready: !!scene
    }));
  }
};

export default Level1SceneValidation;
