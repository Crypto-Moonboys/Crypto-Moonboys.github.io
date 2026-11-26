/* Keep the WAX page's text/anchors in HTML; hydrate heavy assets near view. */
(() => {
  'use strict';
  const builder = document.querySelector('[data-builder-module]');
  const activate = element => {
    if ('sectionImages' in element.dataset) {
      // Warm the complete animated strip together, before it scrolls sideways.
      element.querySelectorAll('img[data-section-src]').forEach(activate);
      delete element.dataset.sectionImages;
    } else if (element.dataset.sectionSrc) {
      // The observer owns proximity; do not apply a second browser lazy gate.
      element.loading = 'eager';
      element.src = element.dataset.sectionSrc;
      delete element.dataset.sectionSrc;
    } else if (element === builder && !builder.dataset.builderStarted) {
      builder.dataset.builderStarted = 'true';
      if (builder.dataset.builderStyle) {
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = builder.dataset.builderStyle;
        document.head.append(style);
      }
      const script = document.createElement('script');
      script.type = 'module';
      script.src = builder.dataset.builderModule;
      // The standalone-builder link remains usable if the module cannot load.
      document.head.append(script);
    }
  };
  const groups = [...document.querySelectorAll('[data-section-images]')];
  const targets = [...document.querySelectorAll('img[data-section-src]')]
    .filter(image => !groups.some(group => group.contains(image)));
  targets.push(...groups);
  if (builder) targets.push(builder);
  if (!('IntersectionObserver' in window)) {
    targets.forEach(activate);
    return;
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      activate(entry.target);
    }
  }, { rootMargin: '600px 0px', threshold: 0 });
  targets.forEach(element => observer.observe(element));

  // Hash jumps and keyboard focus must work even before the observer's next
  // asynchronous notification. Do not make anchored visitors scroll twice.
  const activateWithin = target => {
    for (const element of targets) {
      if (element === target || target.contains(element)) {
        observer.unobserve(element);
        activate(element);
      }
    }
  };
  const activateHash = () => {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); }
    catch { return; }
    const target = id && document.getElementById(id);
    if (target) activateWithin(target);
  };
  window.addEventListener('hashchange', activateHash);
  document.addEventListener('focusin', event => {
    if (builder?.contains(event.target)) activateWithin(builder);
  });
  activateHash();
})();
