// NBG Runner animation controller
// Connects player states to sprite animation manifest.

window.NBGAnimationController = {
  state: 'idle',
  animations: {},
  aliases: {},
  frameWidth: 32,
  frameHeight: 48,
  frame: 0,
  elapsed: 0,

  init(manifest) {
    const playerManifest = manifest?.player || manifest?.sprites?.player || manifest || {};
    this.animations = playerManifest.animations || {};
    this.aliases = playerManifest.aliases || {};
    this.frameWidth = playerManifest.frameWidth || playerManifest.frameSize?.width || 32;
    this.frameHeight = playerManifest.frameHeight || playerManifest.frameSize?.height || 48;
    this.state = 'idle';
    this.frame = 0;
    this.elapsed = 0;
  },

  setState(state) {
    const nextState = this.resolveState(state);
    if (this.animations[nextState] && this.state !== nextState) {
      this.state = nextState;
      this.frame = 0;
      this.elapsed = 0;
    }
  },

  update(delta = 16.67) {
    const animation = this.getCurrentAnimation();
    if (!animation) return;

    const frameCount = this.getFrameCount(animation);
    if (frameCount <= 1) return;

    this.elapsed += delta;
    const frameMs = animation.frameMs || animation.speed || 145;
    while (this.elapsed >= frameMs) {
      this.frame = (this.frame + 1) % frameCount;
      this.elapsed -= frameMs;
    }
  },

  getFrame() {
    const animation = this.getCurrentAnimation();
    const frameCount = this.getFrameCount(animation);
    if (!animation || !frameCount) return 0;
    return this.frame % frameCount;
  },

  getCurrentAnimation() {
    return this.animations[this.state] || null;
  },

  getFrameCount(animation) {
    if (!animation) return 0;
    if (Array.isArray(animation.frames)) return animation.frames.length;
    return animation.frames || 1;
  },

  resolveState(state) {
    return this.aliases[state] || state || 'idle';
  },

  getFrameRect() {
    const animation = this.getCurrentAnimation();
    const frame = this.getFrame();
    const frameWidth = animation?.frameWidth || this.frameWidth;
    const frameHeight = animation?.frameHeight || this.frameHeight;
    const row = animation?.row || 0;

    return {
      x: frame * frameWidth,
      y: row * frameHeight,
      width: frameWidth,
      height: frameHeight
    };
  }
};
