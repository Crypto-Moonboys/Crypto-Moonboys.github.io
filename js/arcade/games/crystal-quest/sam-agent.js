export function createSamAgent(options) {
  var root = options && options.root;
  var messageEl = options && options.messageEl;

  var STATES = ['idle', 'scanning', 'correct', 'error', 'hype', 'warning'];

  function setState(state, message) {
    if (!root) return;
    if (!STATES.includes(state)) {
      console.warn('[crystal-quest] Invalid SAM state:', state);
      state = 'idle';
    }
    STATES.forEach(function (name) {
      root.classList.toggle('sam-' + name, name === state);
    });
    root.setAttribute('data-sam-state', state);
    if (messageEl && typeof message === 'string') {
      messageEl.textContent = message;
    }
  }

  return {
    setIdle: function (message) { setState('idle', message || 'Awaiting mission command.'); },
    setScanning: function (message) { setState('scanning', message || 'Scanning wiki signal…'); },
    onCorrect: function (isStreak) {
      setState(isStreak ? 'hype' : 'correct', 'Signal confirmed');
    },
    onWrong: function () {
      setState('error', 'Data mismatch');
    },
    onSkip: function () {
      setState('warning', 'Signal lost');
    },
    onLowSkips: function () {
      setState('warning', 'Skip reserve low');
    },
    onRunComplete: function () {
      setState('idle', 'Run complete. Submit your score.');
    },
  };
}
