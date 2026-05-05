/**
 * dismissible-ui.js
 *
 * Reusable helper for floating / popup UI elements that must be user-dismissible.
 *
 * Usage:
 *   window.DismissibleUI.addCloseButton(element, { onClose });
 *   window.DismissibleUI.register(element);
 *   window.DismissibleUI.unregister(element);
 *   // Escape key handler is wired automatically on load.
 *
 * Rules:
 *  - Close button has aria-label="Close" and visible × symbol.
 *  - Keyboard accessible (focusable, Enter/Space activates).
 *  - Escape closes the most recently registered visible floating element.
 *  - Closing one element does NOT affect the game loop or other elements.
 */
(function () {
  'use strict';

  /* ── Dismissible registry (ordered: first-in, last-dismissed) ──── */
  var _stack = [];

  function register(el) {
    if (!el) return;
    if (_stack.indexOf(el) === -1) _stack.push(el);
  }

  function unregister(el) {
    var idx = _stack.indexOf(el);
    if (idx !== -1) _stack.splice(idx, 1);
  }

  /**
   * Add a visible × close button to a floating element.
   *
   * @param {HTMLElement} el       The container to append the close button to.
   * @param {Object}      opts
   *   opts.onClose {function}  Called after the element is hidden/removed.
   *   opts.hide    {boolean}   When true, hides with display:none instead of removing.
   *   opts.className {string}  Extra class(es) on the button. Defaults to 'dismissible-close'.
   */
  function addCloseButton(el, opts) {
    if (!el) return null;
    opts = opts || {};

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = opts.className || 'dismissible-close';
    btn.setAttribute('aria-label', 'Close');
    btn.textContent = '\u00D7'; // ×

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      _dismiss(el, opts);
    });

    el.appendChild(btn);
    register(el);
    return btn;
  }

  function _dismiss(el, opts) {
    unregister(el);
    if (opts && opts.onClose) opts.onClose(el);
    if (opts && opts.hide) {
      el.style.display = 'none';
    } else {
      el.remove();
    }
  }

  /* ── Global Escape handler ──────────────────────────────────────── */
  // Closes the topmost registered dismissible when Escape is pressed and
  // no higher-priority modal (game overlay) is handling the keypress.
  // game-fullscreen.js handles Escape for the game overlay and for micro
  // notifications, so this handler is a fallback for other dismissibles.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (_stack.length === 0) return;
    // Walk from top of stack to find the last visible element.
    for (var i = _stack.length - 1; i >= 0; i--) {
      var el = _stack[i];
      if (el && el.offsetParent !== null) {
        unregister(el);
        el.remove();
        e.stopPropagation();
        return;
      }
    }
  });

  /* ── Public API ──────────────────────────────────────────────────── */
  window.DismissibleUI = {
    addCloseButton: addCloseButton,
    register: register,
    unregister: unregister,
  };
}());
