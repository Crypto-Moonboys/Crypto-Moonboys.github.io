// NBG Runner animation controller
// Connects player states to sprite animation manifest.

const NBGAnimationController = {
  state: 'idle',
  animations: {},

  init(manifest) {
    this.animations = manifest.animations || {};
    this.state = 'idle';
  },

  setState(state) {
    if (this.animations[state]) {
      this.state = state;
    }
  },

  getCurrentAnimation() {
    return this.animations[this.state] || null;
  }
};

export default NBGAnimationController;
