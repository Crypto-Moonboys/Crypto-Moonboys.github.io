const MAX_DT = 0.05;

const PREVENT_SCROLL_KEYS = {
  ' ': true,
  ArrowLeft: true,
  ArrowRight: true,
  ArrowUp: true,
  ArrowDown: true,
};

export class BaseGame {
  constructor(options) {
    const opts = options || {};

    this.keys = {};
    this.context = opts.context || {};

    this._raf = null;
    this._lastTime = 0;
    this._tickBound = this._tick.bind(this);

    this._boundKeyDown = this._handleKeyDown.bind(this);
    this._boundKeyUp = this._handleKeyUp.bind(this);

    this._systems = [];
    this._systemMap = {};
    this._isGameOver = false;

    this.onTick = null;
    this.onKeyDown = null;

    this._hooks = {
      init: typeof opts.init === 'function' ? opts.init : null,
      update: typeof opts.update === 'function' ? opts.update : null,
      render: typeof opts.render === 'function' ? opts.render : null,
      gameOver: typeof opts.gameOver === 'function' ? opts.gameOver : null,
      input: typeof opts.input === 'function' ? opts.input : null,
    };

    if (opts.systems) {
      this.loadSystems(opts.systems);
    }
  }

  setLifecycleHooks(hooks) {
    const next = hooks || {};
    if (typeof next.init === 'function') this._hooks.init = next.init;
    if (typeof next.update === 'function') this._hooks.update = next.update;
    if (typeof next.render === 'function') this._hooks.render = next.render;
    if (typeof next.gameOver === 'function') this._hooks.gameOver = next.gameOver;
    if (typeof next.input === 'function') this._hooks.input = next.input;
  }

  loadSystems(systemFactories) {
    this._systems = [];
    this._systemMap = {};

    if (!systemFactories) return;

    let entries = [];
    if (Array.isArray(systemFactories)) {
      entries = systemFactories.map(function (factory, index) {
        return [String(index), factory];
      });
    } else {
      entries = Object.entries(systemFactories);
    }

    for (const [name, factory] of entries) {
      if (typeof factory !== 'function') continue;
      const system = factory({ engine: this, context: this.context, name: name }) || {};
      const wrapped = {
        name: name,
        init: typeof system.init === 'function' ? system.init : null,
        update: typeof system.update === 'function' ? system.update : null,
        render: typeof system.render === 'function' ? system.render : null,
        gameOver: typeof system.gameOver === 'function' ? system.gameOver : null,
        onInput: typeof system.onInput === 'function' ? system.onInput : null,
        destroy: typeof system.destroy === 'function' ? system.destroy : null,
        raw: system,
      };
      this._systems.push(wrapped);
      this._systemMap[name] = wrapped.raw;
    }
  }

  getSystem(name) {
    return this._systemMap[name] || null;
  }

  async init() {
    for (const system of this._systems) {
      if (system.init) {
        await system.init(this.context);
      }
    }
    if (this._hooks.init) {
      await this._hooks.init(this.context);
    }
  }

  startLoop() {
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(this._tickBound);
  }

  stopLoop() {
    if (this._raf !== null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  async gameOver(reason) {
    if (this._isGameOver) return;
    this._isGameOver = true;
    this.stopLoop();

    for (const system of this._systems) {
      if (system.gameOver) {
        await system.gameOver(this.context, reason);
      }
    }

    if (this._hooks.gameOver) {
      await this._hooks.gameOver(this.context, reason);
    }
  }

  attachInput() {
    document.addEventListener('keydown', this._boundKeyDown);
    document.addEventListener('keyup', this._boundKeyUp);
  }

  detachInput() {
    document.removeEventListener('keydown', this._boundKeyDown);
    document.removeEventListener('keyup', this._boundKeyUp);
  }

  destroy() {
    this.stopLoop();
    this.detachInput();

    for (const system of this._systems) {
      if (system.destroy) {
        try {
          system.destroy(this.context);
        } catch (_) {}
      }
    }

    this._systems = [];
    this._systemMap = {};
  }

  _tick(ts) {
    const dt = Math.min((ts - this._lastTime) / 1000, MAX_DT);
    this._lastTime = ts;

    if (typeof this.onTick === 'function') {
      this.onTick(dt);
    } else {
      for (const system of this._systems) {
        if (system.update) system.update(dt, this.context);
      }
      if (this._hooks.update) this._hooks.update(dt, this.context);

      for (const system of this._systems) {
        if (system.render) system.render(dt, this.context);
      }
      if (this._hooks.render) this._hooks.render(dt, this.context);
    }

    this._raf = requestAnimationFrame(this._tickBound);
  }

  _handleKeyDown(e) {
    this.keys[e.key] = true;

    if (PREVENT_SCROLL_KEYS[e.key]) {
      e.preventDefault();
    }

    for (const system of this._systems) {
      if (system.onInput) {
        system.onInput(e, this.context);
      }
    }

    if (this._hooks.input) this._hooks.input(e, this.context);
    if (typeof this.onKeyDown === 'function') this.onKeyDown(e);
  }

  _handleKeyUp(e) {
    this.keys[e.key] = false;
  }
}