/**
 * sam-agent.js — Signal Analysis Module for Crystal Quest
 *
 * SAM is the lore guide and signal analyst embedded in Crystal Quest.
 * It reacts to run events with lore-flavored commentary and visual state changes.
 */
export function createSamAgent(options) {
  var root = options && options.root;
  var messageEl = options && options.messageEl;

  var STATES = ['idle', 'scanning', 'correct', 'error', 'hype', 'warning'];

  // ── Message pools per event ────────────────────────────────────────────────
  var MESSAGES = {
    idle: [
      'Awaiting mission command.',
      'Crystal array online. Ready to hunt.',
      'Signal dormant. Awaiting hunter activation.',
      'Lore grid initialised. All sectors clear.',
    ],
    scanning: [
      'Quest armed. Track the signal.',
      'Wiki trail detected. Begin lore hunt.',
      'Sector scan initiated. Crystals inbound.',
      'Run locked. The wiki holds your answers.',
      'Signal acquired. Follow the trail, hunter.',
    ],
    correct: [
      'Signal confirmed. Crystal secured.',
      'Lore lock verified. Moving to next signal.',
      'Knowledge fragment captured.',
      'Encyclopedia entry confirmed. Well played.',
    ],
    error: [
      'Data mismatch. Read the lore and retry.',
      'Signal lost. The answer is on the wiki page.',
      'Incorrect keyword. Re-scan the linked entry.',
      'Verification failed. Check the source page.',
      'Lore mismatch. Hunt harder, hunter.',
    ],
    hype_3: [
      '🔥 TRIPLE SIGNAL. Streak on fire.',
      '⚡ THREE IN A ROW. Lore hunter mode: activated.',
      '💎 Signal chain locked. The wiki bows to you.',
    ],
    hype_5: [
      '🔥🔥 FIVE-SIGNAL STREAK. Legendary pace.',
      '🌙 MOONBOY TIER UNLOCKED. Five perfect.',
      '⚡⚡ Five crystals — keep the chain alive.',
    ],
    hype_8: [
      '💎💎💎 EIGHT-SIGNAL CHAIN. UNTOUCHABLE.',
      '🚀 MOON MISSION ENGAGED. Eight straight.',
      '👑 LORE MASTER. Eight crystals. Undeniable.',
    ],
    skip: [
      '⚠️ Signal skipped. Reserve depleted.',
      'Signal bypass logged. Choose wisely, hunter.',
      'Trail detoured. Skips cost score.',
    ],
    lowSkips: [
      '⚠️ Last skip remaining. Use it wisely.',
      'Escape route nearly sealed. Stay sharp.',
    ],
    noSkips: [
      '🚫 No skips left. Face every signal now.',
      'Skip reserve empty. All missions are mandatory.',
    ],
    runStart: [
      'Crystal run armed. Hunt begins now.',
      'Session seeded. The wiki awaits, hunter.',
      'Lore trail activated. Find every crystal.',
      'Run locked in. Follow the signal across the wiki.',
    ],
    runComplete: [
      '✅ Run complete. All crystals accounted for.',
      '💎 Lore harvest complete. Submit your score.',
      '🏆 Signal chain closed. Leaderboard awaits.',
    ],
    packUnlock: [
      '📦 New lore pack loaded. Deeper signals ahead.',
      '🔓 Pack advancement. Fresh crystal trove unlocked.',
      '⚡ Next pack online. Harder hunts incoming.',
    ],
    reset: [
      'Run cleared. Ready for a new lore trail.',
      'Crystal array reset. Awaiting command.',
      'Signal wipe complete. Start a new hunt.',
    ],
  };

  var _msgCounters = {};
  function nextMsg(pool) {
    if (!pool || !pool.length) return '';
    var key = pool[0];
    var idx = _msgCounters[key] || 0;
    _msgCounters[key] = (idx + 1) % pool.length;
    return pool[idx];
  }

  // ── Core state setter ──────────────────────────────────────────────────────
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

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    setIdle: function (message) {
      setState('idle', message || nextMsg(MESSAGES.idle));
    },
    setScanning: function (message) {
      setState('scanning', message || nextMsg(MESSAGES.scanning));
    },
    onRunStart: function () {
      setState('scanning', nextMsg(MESSAGES.runStart));
    },
    onCorrect: function (streak) {
      var n = streak || 1;
      if (n >= 8) {
        setState('hype', nextMsg(MESSAGES.hype_8));
      } else if (n >= 5) {
        setState('hype', nextMsg(MESSAGES.hype_5));
      } else if (n >= 3) {
        setState('hype', nextMsg(MESSAGES.hype_3));
      } else {
        setState('correct', nextMsg(MESSAGES.correct));
      }
    },
    onWrong: function () {
      setState('error', nextMsg(MESSAGES.error));
    },
    onSkip: function (skipsLeft) {
      if (skipsLeft <= 0) {
        setState('warning', nextMsg(MESSAGES.noSkips));
      } else if (skipsLeft === 1) {
        setState('warning', nextMsg(MESSAGES.lowSkips));
      } else {
        setState('warning', nextMsg(MESSAGES.skip));
      }
    },
    onLowSkips: function () {
      setState('warning', nextMsg(MESSAGES.lowSkips));
    },
    onRunComplete: function () {
      setState('idle', nextMsg(MESSAGES.runComplete));
    },
    onPackUnlock: function () {
      setState('scanning', nextMsg(MESSAGES.packUnlock));
    },
    onReset: function () {
      setState('idle', nextMsg(MESSAGES.reset));
    },
  };
}
