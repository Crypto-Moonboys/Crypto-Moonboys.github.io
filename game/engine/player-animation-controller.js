// NBG Runner animation controller
// Connects player states to sprite animation manifest.

window.NBGAnimationController = {
  state: 'idle',
  animations: {},
  frame: 0,

  init(manifest) {
    this.animations = manifest.animations || {};
    this.state = 'idle';
    this.frame = 0;
  },

  setState(state) {
    if (this.animations[state]) {
      this.state = state;
      this.frame = 0;
    }
  },

  update() {
    const animation = this.getCurrentAnimation();
    if (!animation) return;

    const frames = animation.frames || [];
    if (!frames.length) return;

    this.frame = (this.frame + 1) % frames.length;
  },

  getFrame() {
    const animation = this.getCurrentAnimation();
    if (!animation || !animation.frames) return null;
    return animation.frames[this.frame];
  },

  getCurrentAnimation() {
    return this.animations[this.state] || null;
  }
};
