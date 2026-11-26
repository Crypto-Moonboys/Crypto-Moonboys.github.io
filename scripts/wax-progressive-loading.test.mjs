import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('js/join-page-defer.js');
function fixture({ hash = '', observer = true, gallery = false } = {}) {
  const requests = [], scripts = [], styles = [], observed = new Set(), listeners = {};
  const image = name => ({ dataset: { sectionSrc: '/img/' + name + '.jpg' },
    set src(value) { requests.push(value); } });
  const upper = image('upper'), lower = image('lower');
  const group = { dataset: { sectionImages: '' },
    contains: target => target === upper || target === lower,
    querySelectorAll: () => [upper, lower] };
  const button = {};
  const builder = { dataset: { builderModule: '/js/avatar-builder-test.js',
    builderStyle: '/css/avatar-builder-test.css' },
    contains: target => target === button };
  const section = { contains: target => target === lower };
  let notify, options;
  class IO {
    constructor(callback, settings) { notify = callback; options = settings; }
    observe(target) { observed.add(target); }
    unobserve(target) { observed.delete(target); }
  }
  const window = { location: { hash }, addEventListener: (type, fn) => { listeners[type] = fn; } };
  if (observer) window.IntersectionObserver = IO;
  const document = {
    querySelector: () => builder,
    querySelectorAll: selector => selector === '[data-section-images]'
      ? (gallery ? [group] : []) : [upper, lower],
    getElementById: id => ({ 'build-moonboy': builder, history: section })[id],
    createElement: tagName => ({ tagName }), head: { append: resource => {
      if (resource.rel === 'stylesheet') styles.push(resource);
      else scripts.push(resource);
    } },
    addEventListener: (type, fn) => { listeners[type] = fn; }
  };
  vm.runInNewContext(source, { window, document, IntersectionObserver: IO });
  return { requests, scripts, styles, upper, lower, group, builder, button, listeners, observed, options,
    enter: target => notify([{ target, isIntersecting: true }]),
    outside: target => notify([{ target, isIntersecting: false }]) };
}

test('heavy resources stay idle until near view; images hydrate independently', () => {
  const f = fixture();
  assert.equal(f.options.rootMargin, '600px 0px');
  assert.equal(f.observed.size, 3);
  f.outside(f.lower);
  assert.deepEqual(f.requests, []);
  assert.equal(f.scripts.length, 0);
  f.enter(f.upper);
  assert.deepEqual(f.requests, ['/img/upper.jpg']);
  assert.equal(f.upper.loading, 'eager');
  assert.equal(f.observed.has(f.upper), false);
  assert.equal(f.lower.dataset.sectionSrc, '/img/lower.jpg');
  f.enter(f.upper);
  assert.equal(f.requests.length, 1);
  f.enter(f.lower);
  assert.deepEqual(f.requests, ['/img/upper.jpg', '/img/lower.jpg']);
});

test('builder module loads once on approach and never during initial page setup', () => {
  const f = fixture();
  assert.equal(f.scripts.length, 0);
  f.enter(f.builder);
  f.enter(f.builder);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.styles.length, 1);
  assert.equal(f.styles[0].href, '/css/avatar-builder-test.css');
  assert.equal(f.scripts[0].type, 'module');
  assert.equal(f.scripts[0].src, '/js/avatar-builder-test.js');
});

test('animated gallery warms all its images when the section approaches view', () => {
  const f = fixture({ gallery: true });
  assert.equal(f.observed.has(f.upper), false);
  assert.equal(f.observed.has(f.group), true);
  assert.deepEqual(f.requests, []);
  f.enter(f.group);
  assert.deepEqual(f.requests, ['/img/upper.jpg', '/img/lower.jpg']);
  assert.equal(f.scripts.length, 0);
});

test('direct builder links and keyboard focus start the builder immediately', () => {
  assert.equal(fixture({ hash: '#build-moonboy' }).scripts.length, 1);
  const f = fixture();
  f.listeners.focusin({ target: f.button });
  assert.equal(f.scripts.length, 1);
});

test('lower-section hash activates its own artwork without waking the builder', () => {
  const f = fixture({ hash: '#history' });
  assert.deepEqual(f.requests, ['/img/lower.jpg']);
  assert.equal(f.scripts.length, 0);
  assert.doesNotThrow(() => fixture({ hash: '#%invalid' }));
});

test('browsers without IntersectionObserver retain images and builder functionality', () => {
  const f = fixture({ observer: false });
  assert.equal(f.requests.length, 2);
  assert.equal(f.scripts.length, 1);
});

test('page keeps eager hero, stable image ratios, no-JS artwork and click-only videos', () => {
  const html = read('join-us-on-the-wax-blockchain.html');
  const fallbackImages = [...html.matchAll(/<noscript>(<img\b[^>]*>)<\/noscript>/g)];
  const active = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const deferred = [...active.matchAll(/<img\b[^>]*data-section-src="([^"]+)"[^>]*>/g)];
  assert.ok(deferred.length > 25);
  assert.equal(fallbackImages.length, deferred.length);
  for (const [tag, url] of deferred.map(match => [match[0], match[1]])) {
    assert.match(tag, /width="\d+"/);
    assert.match(tag, /height="\d+"/);
    assert.match(tag, /src="data:image\/svg\+xml,/);
    assert.ok(fallbackImages.some(match => match[1].includes('src="' + url + '"')));
  }
  assert.match(active, /<img\b[^>]*src="\/img\/homepage\/Crypto%20Moonboys%20WAXP%20Neon%20Cityscape222\.jpg"[^>]*loading="eager"/);
  assert.doesNotMatch(active, /<script\b[^>]*\ssrc="\/js\/avatar-builder-test\.js"/);
  assert.match(active, /data-builder-module="\/js\/avatar-builder-test\.js"/);
  assert.match(active, /data-builder-style="\/css\/avatar-builder-test\.css"/);
  assert.doesNotMatch(active, /<link\b[^>]*href="\/css\/avatar-builder-test\.css"/);
  assert.match(active, /href="\/moonboy-builder\.html"/);
  assert.doesNotMatch(active, /<(?:iframe|source)\b[^>]*\ssrc="/);
  assert.doesNotMatch(active, /<video\b[^>]*\sposter="/);
  assert.match(read('js/home-media-defer.js'), /video\.poster = video\.dataset\.poster/);
});
