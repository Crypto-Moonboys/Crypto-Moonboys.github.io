(() => {
  'use strict';

  const amount = document.getElementById('amountIn');
  const quoteBtn = document.getElementById('quoteBtn');
  const switchBtn = document.getElementById('switchTokens');
  const result = document.getElementById('resultPanel');

  function isTyping(event) {
    const tag = String(event.target?.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea' || event.target?.isContentEditable;
  }

  function showHint(text, ttl = 1800) {
    if (!result) return;
    const note = document.createElement('div');
    note.className = 'warning';
    note.textContent = text;
    result.prepend(note);
    window.setTimeout(() => note.remove(), ttl);
  }

  function showShortcutHelp() {
    showHint('Shortcuts: / focus amount · Enter refresh while typing · r refresh · s switch pair · ? show help', 5000);
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === 'Enter' && isTyping(event)) {
      event.preventDefault();
      quoteBtn?.click();
      return;
    }

    if (isTyping(event)) return;

    if (event.key === '?' || (event.shiftKey && event.key === '/')) {
      event.preventDefault();
      showShortcutHelp();
      return;
    }

    if (event.key === '/') {
      event.preventDefault();
      amount?.focus();
      amount?.select();
      showHint('Amount focused. Press Enter to refresh quote. Press ? for shortcuts.');
      return;
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      quoteBtn?.click();
      showHint('Quote refreshed.');
      return;
    }

    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      switchBtn?.click();
      showHint('Pair switched.');
    }
  });
})();
