// NBG London Graffiti Run mobile controls
// Touch input adapter for future mobile buttons.

export class MobileControls {
  constructor(input) {
    this.input = input;
    this.buttons = {};
  }

  bind(buttons) {
    this.buttons = buttons;

    Object.entries(buttons).forEach(([action, element]) => {
      element.addEventListener('touchstart', () => {
        this.input.press(action);
      });

      element.addEventListener('touchend', () => {
        this.input.release(action);
      });
    });
  }
}
