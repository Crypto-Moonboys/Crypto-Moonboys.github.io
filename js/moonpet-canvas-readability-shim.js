(function () {
  'use strict';

  var TARGET_CANVAS_ID = 'moonpet-canvas';
  var WORLD_WIDTH = 320;
  var WORLD_HEIGHT = 220;
  var RENDER_SCALE = 2;

  function fitPixelText(value, limit) {
    var text = String(value || '');
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(0, limit - 1)) + '…';
  }

  function patchCanvasText(ctx) {
    if (!ctx || ctx.__moonpetReadableTextPatched) return;
    ctx.__moonpetReadableTextPatched = true;

    var originalFillText = ctx.fillText.bind(ctx);
    ctx.fillText = function (text, x, y, maxWidth) {
      var copy = String(text == null ? '' : text);

      if (copy) {
        if (y <= 24 && x < 95) copy = fitPixelText(copy, 22);
        if ((y >= 26 && y <= 45 || y >= 88 && y <= 106) && x >= 170) {
          copy = fitPixelText(copy.replace(/^MOONPET\s*\/\/\s*/i, 'PET: '), 17);
        }
        if (y >= 130 && y <= 178) copy = fitPixelText(copy, x < 72 ? 15 : 28);
        if (x >= 244) copy = fitPixelText(copy, 9);
      }

      return originalFillText(copy, x, y, maxWidth);
    };
  }

  function sharpenMoonpetCanvas(canvas, ctx) {
    if (!canvas || !ctx || canvas.__moonpetReadableCanvas) return;
    canvas.__moonpetReadableCanvas = true;

    canvas.width = WORLD_WIDTH * RENDER_SCALE;
    canvas.height = WORLD_HEIGHT * RENDER_SCALE;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.imageRendering = 'crisp-edges';

    if (ctx.setTransform) {
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    patchCanvasText(ctx);
  }

  var originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    var ctx = originalGetContext.call(this, type, options);
    if (type === '2d' && this && this.id === TARGET_CANVAS_ID) {
      sharpenMoonpetCanvas(this, ctx);
    }
    return ctx;
  };

  window.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById(TARGET_CANVAS_ID);
    if (canvas) {
      canvas.width = WORLD_WIDTH * RENDER_SCALE;
      canvas.height = WORLD_HEIGHT * RENDER_SCALE;
      canvas.style.imageRendering = 'pixelated';
      canvas.style.imageRendering = 'crisp-edges';
    }
  });
})();
