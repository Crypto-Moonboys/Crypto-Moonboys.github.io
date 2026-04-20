(function () {
  'use strict';

  function canStartDrag(target) {
    if (!target) return false;
    return !target.closest('a,button,input,textarea,select,label,[role="button"],[contenteditable="true"]');
  }

  function mountDragScroll(node) {
    if (!node || node.dataset.shellScrollMounted === '1') return;
    node.dataset.shellScrollMounted = '1';

    var active = false;
    var moved = false;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;

    node.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!canStartDrag(event.target)) return;
      if (node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth) return;
      active = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = node.scrollLeft;
      startTop = node.scrollTop;
      node.classList.add('dragging-scroll');
      node.setPointerCapture(event.pointerId);
    });

    node.addEventListener('pointermove', function (event) {
      if (!active) return;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      node.scrollLeft = startLeft - dx;
      node.scrollTop = startTop - dy;
    });

    function end(event) {
      if (!active) return;
      active = false;
      node.classList.remove('dragging-scroll');
      if (moved) event.preventDefault();
      try { node.releasePointerCapture(event.pointerId); } catch (_) {}
    }

    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.style.touchAction = 'pan-x pan-y';

    node.addEventListener('lostpointercapture', function () {
      active = false;
      node.classList.remove('dragging-scroll');
    });
  }

  function init() {
    document.querySelectorAll('[data-shell-scroll]').forEach(mountDragScroll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MOONBOYS_SCROLL_SHELL = { init: init, mount: mountDragScroll };
}());
