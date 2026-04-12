/* game-fullscreen.js — Reusable fullscreen overlay for Crypto Moonboys arcade games.
 *
 * Drop in any arcade game page (after wiki.js, before </body>):
 *   <script src="/js/game-fullscreen.js"></script>
 *
 * Behaviour:
 *  • Clicking "Start" opens a full-viewport overlay containing the game.
 *  • While inside the overlay the game runs normally — all existing onclick/
 *    event handlers set by the game module script are untouched.
 *  • Exiting restores the game-card to its original position in the page.
 *  • Esc key, the ✕ Exit button, and tapping the backdrop all close the overlay.
 *  • The Fullscreen API is attempted where supported (graceful fallback).
 */
(function () {
  'use strict';

  var startBtn = document.getElementById('startBtn');
  var gameCard = document.querySelector('.game-card');

  // Only activate on pages that have both a Start button and a .game-card.
  if (!startBtn || !gameCard) return;

  /* ── Build overlay DOM ────────────────────────────────────────────── */

  var overlay = document.createElement('div');
  overlay.id = 'game-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Game — fullscreen mode');

  var closeBtn = document.createElement('button');
  closeBtn.id = 'game-overlay-close';
  closeBtn.setAttribute('aria-label', 'Exit fullscreen');
  closeBtn.textContent = '✕ Exit';

  var stage = document.createElement('div');
  stage.className = 'game-stage';

  overlay.appendChild(closeBtn);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);

  /* ── State ────────────────────────────────────────────────────────── */

  var origParent = null;
  var origNextSibling = null;
  var isOpen = false;

  /* ── Open ─────────────────────────────────────────────────────────── */

  function openOverlay() {
    if (isOpen) return;
    isOpen = true;

    // Remember where game-card lives so we can restore it on close.
    origParent = gameCard.parentNode;
    origNextSibling = gameCard.nextSibling;

    // Ensure every game canvas has an aspect-ratio so CSS max-height scaling
    // works correctly (canvas elements without CSS aspect-ratio don't shrink
    // automatically — e.g. Tetris sets canvas.width/height via JS).
    var canvases = gameCard.querySelectorAll('canvas');
    [].forEach.call(canvases, function (cv) {
      var computedRatio = getComputedStyle(cv).aspectRatio;
      var hasRatio = computedRatio && computedRatio !== 'auto';
      if (!hasRatio && cv.width && cv.height) {
        cv.style.setProperty('aspect-ratio', cv.width + ' / ' + cv.height);
      }
    });

    // Move the whole game-card (HUD + canvas + buttons) into the overlay.
    stage.appendChild(gameCard);

    // Show overlay.
    overlay.classList.add('active');
    document.body.classList.add('overlay-open');

    // Move focus to the close button for keyboard users.
    closeBtn.focus();

    // Attempt browser Fullscreen API; silently ignore if denied (iOS Safari, etc.).
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(function () {});
    }
  }

  /* ── Close ────────────────────────────────────────────────────────── */

  function closeOverlay() {
    if (!isOpen) return;
    isOpen = false;

    // Leave browser fullscreen if active.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }

    // Restore game-card to its original location in the page.
    if (origParent) {
      origParent.insertBefore(gameCard, origNextSibling);
      origParent = null;
      origNextSibling = null;
    }

    overlay.classList.remove('active');
    document.body.classList.remove('overlay-open');

    // Return focus to the start button.
    startBtn.focus();
  }

  /* ── Event wiring ─────────────────────────────────────────────────── */

  // Use capture phase so the overlay opens *before* the game's own onclick
  // handler fires (the game's onclick is a property set after this script
  // runs, so it fires in bubble phase after our capture listener).
  startBtn.addEventListener('click', function () {
    openOverlay();
  }, true);

  closeBtn.addEventListener('click', closeOverlay);

  // Esc key closes the overlay.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      closeOverlay();
    }
  });

  // Tap / click on the dark backdrop (outside the game-stage) closes overlay.
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      closeOverlay();
    }
  });

  // If the browser's own fullscreen is dismissed (e.g. by pressing Esc in
  // fullscreen mode) we keep the overlay open so gameplay isn't interrupted.
  // The user can still close via the ✕ button or Esc while not in fullscreen.
}());
