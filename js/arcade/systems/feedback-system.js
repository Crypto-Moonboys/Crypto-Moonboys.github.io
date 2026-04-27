export function pulseHudElement(el, cls, durationMs) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(function () {
    el.classList.remove(cls);
  }, durationMs);
}

export function setTransientBanner(target, text, color, seconds) {
  target.value = {
    text: text,
    color: color || '#f7c948',
    timer: seconds || 1.5,
    maxTimer: seconds || 1.5,
  };
}