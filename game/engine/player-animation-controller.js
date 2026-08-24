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
    const animations = playerManifest.animations || {};
    this.animations = Object.keys(animations).reduce((normalized, key) => {
      const animation = animations[key] || {};
      normalized[key] = {
        ...animation,
        key
      };
      return normalized;
    }, {});
    this.aliases = playerManifest.aliases || {};
    this.state = 'idle';
    this.frame = 0;
    this.elapsed = 0;
  },

  setState(state) {
    const nextState = this.resolveState(state);
    if (this.animations[nextState]) {
      if (this.state !== nextState) {
        this.frame = 0;
        this.elapsed = 0;
      }
      this.state = nextState;
    }
  },

  resolveState(state) {
    const stateMap = {
      idle: 'idle',
      moving: 'run',
      run: 'run',
      airborne: 'jump',
      jump: 'jump',
      falling: 'fall',
      fall: 'fall',
      tagging: 'spray',
      spray: 'spray',
      damaged: 'hurt',
      hit: 'hurt',
      hurt: 'hurt',
      complete: 'victory',
      victory: 'victory'
    };

    return stateMap[state] || this.aliases[state] || state;
  },

  setAnimationImage(state, image) {
    const animation = this.animations[state];
    if (!animation) return;

    animation.image = image;
  },

  getFrameCount(animation = this.getCurrentAnimation()) {
    if (!animation) return 1;
    if (Array.isArray(animation.frames)) return Math.max(1, animation.frames.length);
    if (Number.isFinite(animation.frames)) return Math.max(1, animation.frames);
    if (Number.isFinite(animation.frameCount)) return Math.max(1, animation.frameCount);
    return 1;
  },

  update(delta = 16.67) {
    const animation = this.getCurrentAnimation();
    if (!animation) return;

    const frameCount = this.getFrameCount(animation);
    if (frameCount <= 1) return;

    this.elapsed += this.toMilliseconds(delta);
    const frameMs = animation.frameMs ?? animation.speed ?? 145;
    while (this.elapsed >= frameMs) {
      this.frame = (this.frame + 1) % frameCount;
      this.elapsed -= frameMs;
    }
  },

  getFrame() {
    const animation = this.getCurrentAnimation();
    if (!animation) return 0;
    if (Array.isArray(animation.frames)) return animation.frames[this.frame] || 0;
    return this.frame % this.getFrameCount(animation);
  },

  getCurrentAnimation() {
    return this.animations[this.state] || null;
  },

  toMilliseconds(delta) {
    return delta < 10 ? delta * 1000 : delta;
  }
};
