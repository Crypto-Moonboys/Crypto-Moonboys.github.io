/**
 * dismissible-ui.js
 *
 * Reusable helper for floating / popup UI elements that must be user-dismissible.
 *
 * Usage:
 *   window.DismissibleUI.addCloseButton(element, { onClose });
 *   window.DismissibleUI.register(element, opts);
 *   window.DismissibleUI.unregister(element);
 *   // Escape key handler is wired automatically on load.
 *
 * Rules:
 *  - Close button has aria-label="Close" and visible × symbol.
 *  - Keyboard accessible (focusable, Enter/Space activates).
 *  - Escape closes the most recently registered visible floating element.
 *  - Closing one element does NOT affect the game loop or other elements.
 *  - Close button click and Escape both call the same _dismiss() path, so
 *    opts.hide and opts.onClose are honoured consistently.
 */
(function () {
  'use strict';

  /* ── Per-element options (WeakMap so GC can collect removed elements) ── */
  var _optsMap = typeof WeakMap === 'function' ? new WeakMap() : null;

  /* ── Dismissible registry (ordered: first-in, last-dismissed) ──── */
  var _stack = [];

  function register(el, opts) {
    if (!el) return;
    if (_optsMap) _optsMap.set(el, opts || {});
    if (_stack.indexOf(el) === -1) _stack.push(el);
  }

  function unregister(el) {
    var idx = _stack.indexOf(el);
    if (idx !== -1) _stack.splice(idx, 1);
    if (_optsMap) _optsMap.delete(el);
  }

  /**
   * Central dismiss path used by both close-button click and Escape.
   * Guarantees opts.onClose and opts.hide are respected in every case.
   */
  function _dismiss(el) {
    var opts = (_optsMap && _optsMap.get(el)) || {};
    unregister(el);
    if (opts.onClose) opts.onClose(el);
    if (opts.hide) {
      el.style.display = 'none';
    } else {
      el.remove();
    }
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
      _dismiss(el);
    });

    el.appendChild(btn);
    register(el, opts);
    return btn;
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
    // Use computed display rather than offsetParent because position:fixed
    // elements correctly have offsetParent === null in many browsers.
    for (var i = _stack.length - 1; i >= 0; i--) {
      var el = _stack[i];
      if (el && window.getComputedStyle(el).display !== 'none') {
        // Use the shared _dismiss path so opts.hide / opts.onClose are honoured.
        _dismiss(el);
        e.stopPropagation();
        e.preventDefault();
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
