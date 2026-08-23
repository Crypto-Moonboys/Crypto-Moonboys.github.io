export const Input = {
  keys: {},

  init() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });
  },

  down(code) {
    return !!this.keys[code];
  }
};
