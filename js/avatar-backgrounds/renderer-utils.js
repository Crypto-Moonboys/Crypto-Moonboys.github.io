let activeRendererCount = 0;

export function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function emit(canvas, renderer, action) {
  canvas.dataset.renderer = renderer;
  canvas.dataset.rendererState = action;
  canvas.dataset.activeRendererCount = String(activeRendererCount);
  canvas.dispatchEvent(new CustomEvent('avatar-background-lifecycle', {
    bubbles: true,
    detail: { renderer, action },
  }));
}

export function createAnimatedRenderer(canvas, renderer, drawFrame, options = {}) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Animated backgrounds are not supported by this browser.');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMotion = window.matchMedia('(max-width: 768px), (pointer: coarse)');
  let frameId = 0;
  let started = false;
  let paused = false;
  let destroyed = false;
  let lastFrame = 0;

  function resize() {
    if (destroyed) return;
    const size = Math.max(1, Math.round(canvas.getBoundingClientRect().width || 1000));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const renderSize = Math.round(size * ratio);
    if (canvas.width !== renderSize || canvas.height !== renderSize) {
      canvas.width = renderSize;
      canvas.height = renderSize;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawFrame({ context, width: size, height: size, time: performance.now(), delta: 0 });
  }

  function schedule() {
    if (destroyed || paused || reducedMotion.matches) return;
    frameId = window.requestAnimationFrame(tick);
  }

  function tick(time) {
    frameId = 0;
    if (destroyed || paused) return;
    const fps = mobileMotion.matches ? 30 : Math.min(options.maxFps || 60, 60);
    const interval = 1000 / fps;
    if (!lastFrame || time - lastFrame >= interval) {
      const size = Math.max(1, canvas.width / Math.min(window.devicePixelRatio || 1, 2));
      drawFrame({ context, width: size, height: size, time, delta: lastFrame ? time - lastFrame : 0 });
      lastFrame = time;
    }
    schedule();
  }

  function start() {
    if (started || destroyed) return;
    started = true;
    activeRendererCount += 1;
    paused = false;
    resize();
    emit(canvas, renderer, reducedMotion.matches ? 'static' : 'started');
    schedule();
  }

  function pause() {
    if (!started || paused || destroyed) return;
    paused = true;
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    emit(canvas, renderer, 'paused');
  }

  function resume() {
    if (!started || !paused || destroyed) return;
    paused = false;
    emit(canvas, renderer, reducedMotion.matches ? 'static' : 'resumed');
    if (reducedMotion.matches) resize();
    else schedule();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (started) activeRendererCount = Math.max(0, activeRendererCount - 1);
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    emit(canvas, renderer, 'destroyed');
  }

  return { start, resize, pause, resume, destroy };
}
