import { clearOptionalStack, defaultStack, indexManifest, randomStack } from './avatar-builder-core.mjs';
import { isAnimatedBackground, loadAnimatedBackground } from './avatar-backgrounds/registry.js';

const PAGE_SIZE = 24;
const ICONS_URL = '/img/avatar-builder/category-icons.svg';
const host = document.querySelector('.avatar-builder-host');
const isHomepage = host?.dataset.builderContext === 'homepage';
const HOMEPAGE_INTRO_IMAGE = isHomepage ? (host?.dataset.introImage ?? null) : null;

if (!host) throw new Error('Avatar builder host was not found.');

host.innerHTML = `
  <div class="builder-shell">
    <section class="control-panel category-panel" aria-label="Avatar traits">
      <nav class="category-tabs" aria-label="Trait categories" id="category-tabs"></nav>
      <section class="trait-tray" aria-labelledby="tray-title">
        <div class="tray-heading">
          <h2 id="tray-title">Traits</h2>
          <span id="tray-count"></span>
        </div>
        <div class="tray-status" id="tray-status" role="status">Loading traits&hellip;</div>
        <div class="trait-grid" id="trait-grid"></div>
        <div class="pagination" id="pagination" aria-label="Trait pages"></div>
      </section>
    </section>

    <section class="preview-panel" aria-label="Avatar preview">
      <div class="avatar-frame" id="avatar-frame" aria-busy="true">
        <div class="avatar-stack" id="avatar-stack">
          <canvas class="animated-background-canvas" id="animated-background-canvas" width="1000" height="1000" hidden aria-hidden="true"></canvas>
          ${isHomepage ? `<img class="homepage-builder-intro" src="${HOMEPAGE_INTRO_IMAGE}" alt="Crypto Moonboys build your own Moonboy preview" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:20;pointer-events:none;" loading="eager" decoding="async">` : ''}
        </div>
        <div class="preview-fallback" id="preview-fallback" hidden>One or more layers could not load.</div>
      </div>
    </section>

    <aside class="control-panel selection-panel" aria-labelledby="selected-title">
      <div class="selection-heading">
        <p class="eyebrow">Current stack</p>
        <h2 id="selected-title">Selected traits</h2>
      </div>
      <ul class="selected-list" id="selected-list"></ul>
      <div class="main-actions">
        <button class="action" type="button" id="randomize">Randomize</button>
        <button class="action action-primary action-export" type="button" id="download-png" aria-label="Download avatar as PNG" disabled>Download PNG</button>
        <button class="action action-danger" type="button" id="clear-all">Clear All</button>
      </div>
      <p class="download-helper">A download is not ownership of a Moonboy. For fun only.</p>
      <a class="back-link" href="${isHomepage ? '/avatar-builder-test.html' : '/'}">${isHomepage ? 'Open standalone builder' : 'Back to Crypto Moonboys'}</a>
    </aside>
  </div>
  <p class="sr-only" id="live-region" aria-live="polite" aria-atomic="true"></p>`;

const state = { manifest: null, traitsById: null, traitsByCategory: null, selected: {}, activeCategory: 'background', page: 0 };
let layerRenderGeneration = 0;
let exportInProgress = false;
let backgroundLoadGeneration = 0;
let activeBackgroundRenderer = null;
let activeBackgroundKey = null;
let lastWorkingBackgroundId = null;
let builderIntersecting = true;

const elements = {
  avatarFrame: host.querySelector('#avatar-frame'),
  avatarStack: host.querySelector('#avatar-stack'),
  animatedCanvas: host.querySelector('#animated-background-canvas'),
  categoryTabs: host.querySelector('#category-tabs'),
  clearAll: host.querySelector('#clear-all'),
  downloadPng: host.querySelector('#download-png'),
  homepageIntro: host.querySelector('.homepage-builder-intro'),
  liveRegion: host.querySelector('#live-region'),
  pagination: host.querySelector('#pagination'),
  previewFallback: host.querySelector('#preview-fallback'),
  randomize: host.querySelector('#randomize'),
  selectedList: host.querySelector('#selected-list'),
  traitGrid: host.querySelector('#trait-grid'),
  trayCount: host.querySelector('#tray-count'),
  trayStatus: host.querySelector('#tray-status'),
  trayTitle: host.querySelector('#tray-title'),
};

function icon(categoryId, className = '') {
  return `<svg class="${className}" aria-hidden="true" viewBox="0 0 48 48"><use href="${ICONS_URL}#${categoryId}"></use></svg>`;
}

function announce(message) {
  elements.liveRegion.textContent = '';
  window.requestAnimationFrame(() => { elements.liveRegion.textContent = message; });
}

function dismissHomepageIntro() {
  if (!elements.homepageIntro) return;
  elements.homepageIntro.remove();
  elements.homepageIntro = null;
  elements.downloadPng.disabled = false;
}

function loadExportImage(trait) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${trait.name} could not be loaded for export.`));
    image.src = trait.layer;
  });
}

function exportFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `crypto-moonboy-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}

async function downloadAvatarPng() {
  if (exportInProgress || !state.manifest) return;

  exportInProgress = true;
  elements.downloadPng.disabled = true;
  elements.downloadPng.textContent = 'Preparing PNG\u2026';

  const snapshot = state.manifest.categories
    .map((category) => state.traitsById.get(state.selected[category.id]))
    .filter(Boolean);

  try {
    if (!snapshot.length) throw new Error('Select at least one avatar layer before downloading.');
    const animatedTrait = snapshot.find(isAnimatedBackground);
    let animatedFrame = null;
    if (animatedTrait) {
      if (elements.animatedCanvas.hidden || !activeBackgroundRenderer) {
        throw new Error(`${animatedTrait.name} is not ready for export.`);
      }
      animatedFrame = document.createElement('canvas');
      animatedFrame.width = 1000;
      animatedFrame.height = 1000;
      animatedFrame.dataset.renderer = animatedTrait.renderer;
      const animatedFrameContext = animatedFrame.getContext('2d');
      if (!animatedFrameContext) throw new Error('PNG export is not supported by this browser.');
      animatedFrameContext.drawImage(elements.animatedCanvas, 0, 0, 1000, 1000);
    }
    const images = new Map(await Promise.all(snapshot
      .filter((trait) => !isAnimatedBackground(trait))
      .map(async (trait) => [trait.id, await loadExportImage(trait)])));
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG export is not supported by this browser.');
    snapshot.forEach((trait) => {
      if (isAnimatedBackground(trait)) {
        context.drawImage(animatedFrame, 0, 0, 1000, 1000);
      } else {
        context.drawImage(images.get(trait.id), 0, 0, 1000, 1000);
      }
    });
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('The browser could not create the PNG.'));
      }, 'image/png');
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = exportFilename();
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    announce('Avatar PNG download ready.');
  } catch (error) {
    announce(error instanceof Error ? error.message : 'Avatar PNG could not be downloaded.');
    console.error(error);
  } finally {
    exportInProgress = false;
    elements.downloadPng.disabled = false;
    elements.downloadPng.textContent = 'Download PNG';
  }
}

function renderCategories() {
  elements.categoryTabs.innerHTML = state.manifest.categories.map((category) => `
    <button class="category-button" type="button" data-category="${category.id}" aria-pressed="${category.id === state.activeCategory}" aria-label="Open ${category.name} traits">
      ${icon(category.id)}
    </button>`).join('');
}

function clearAnimatedCanvas() {
  const context = elements.animatedCanvas.getContext('2d');
  context?.clearRect(0, 0, elements.animatedCanvas.width, elements.animatedCanvas.height);
}

function destroyAnimatedBackground() {
  backgroundLoadGeneration += 1;
  activeBackgroundRenderer?.destroy();
  activeBackgroundRenderer = null;
  activeBackgroundKey = null;
  elements.animatedCanvas.hidden = true;
  clearAnimatedCanvas();
}

function syncBackgroundPlayback() {
  if (!activeBackgroundRenderer) return;
  if (builderIntersecting && document.visibilityState === 'visible') activeBackgroundRenderer.resume();
  else activeBackgroundRenderer.pause();
}

async function activateAnimatedBackground(trait) {
  if (!isAnimatedBackground(trait)) {
    destroyAnimatedBackground();
    lastWorkingBackgroundId = trait?.id || lastWorkingBackgroundId;
    return;
  }
  if (activeBackgroundRenderer && activeBackgroundKey === trait.renderer) {
    elements.animatedCanvas.hidden = false;
    activeBackgroundRenderer.resize();
    syncBackgroundPlayback();
    lastWorkingBackgroundId = trait.id;
    return;
  }

  const generation = ++backgroundLoadGeneration;
  activeBackgroundRenderer?.destroy();
  activeBackgroundRenderer = null;
  activeBackgroundKey = null;
  clearAnimatedCanvas();
  elements.animatedCanvas.hidden = false;

  const createRenderer = await loadAnimatedBackground(trait.renderer);
  if (generation !== backgroundLoadGeneration) return;
  const renderer = createRenderer(elements.animatedCanvas);
  if (generation !== backgroundLoadGeneration) {
    renderer.destroy();
    return;
  }
  activeBackgroundRenderer = renderer;
  activeBackgroundKey = trait.renderer;
  renderer.start();
  syncBackgroundPlayback();
  lastWorkingBackgroundId = trait.id;
}

function renderLayers() {
  const generation = ++layerRenderGeneration;
  let pending = 0;
  let failures = 0;
  elements.avatarFrame.dataset.renderGeneration = String(generation);
  elements.previewFallback.hidden = true;
  elements.avatarStack.querySelectorAll('.avatar-layer').forEach((layer) => layer.remove());
  const backgroundTrait = state.traitsById.get(state.selected.background);
  pending += 1;
  activateAnimatedBackground(backgroundTrait).catch((error) => {
    if (generation !== layerRenderGeneration) return;
    console.error(error);
    announce(`${backgroundTrait?.name || 'Animated background'} could not be loaded. The previous background was restored.`);
    const fallbackId = lastWorkingBackgroundId || state.manifest.categories.find((category) => category.id === 'background').defaultTraitId;
    if (fallbackId && fallbackId !== state.selected.background) {
      state.selected.background = fallbackId;
      renderTray();
      renderSelected();
      renderLayers();
    } else {
      destroyAnimatedBackground();
    }
  }).finally(() => {
    if (generation !== layerRenderGeneration) return;
    pending -= 1;
    if (pending === 0) elements.avatarFrame.setAttribute('aria-busy', 'false');
  });
  state.manifest.categories.forEach((category) => {
    const trait = state.traitsById.get(state.selected[category.id]);
    if (!trait) return;
    if (isAnimatedBackground(trait)) return;
    pending += 1;
    const image = document.createElement('img');
    image.className = 'avatar-layer';
    image.src = trait.layer;
    image.alt = '';
    image.width = 1000;
    image.height = 1000;
    image.decoding = 'async';
    const finish = () => {
      if (generation !== layerRenderGeneration) return;
      pending -= 1;
      if (pending === 0) elements.avatarFrame.setAttribute('aria-busy', 'false');
    };
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', () => {
      if (generation !== layerRenderGeneration) return;
      failures += 1;
      image.hidden = true;
      elements.previewFallback.hidden = false;
      elements.previewFallback.textContent = `${failures} avatar layer${failures === 1 ? '' : 's'} could not load.`;
      announce(`${trait.name} could not be loaded.`);
      finish();
    }, { once: true });
    elements.avatarStack.append(image);
  });
  if (generation === layerRenderGeneration) {
    elements.avatarFrame.setAttribute('aria-busy', pending ? 'true' : 'false');
  }
}

function renderSelected() {
  elements.selectedList.innerHTML = state.manifest.categories.map((category) => {
    const trait = state.traitsById.get(state.selected[category.id]);
    return `<li class="selected-item">
      ${icon(category.id, 'selected-icon')}
      <span class="selected-copy"><strong>${trait?.name || 'None selected'}</strong><span>${category.name}${category.required ? ' · Required' : ''}</span></span>
      <button class="icon-button" type="button" data-remove="${category.id}" aria-label="Clear ${category.name}" ${category.required ? 'disabled title="Required layer"' : ''}>×</button>
    </li>`;
  }).join('');
}

function renderTray() {
  const category = state.manifest.categories.find((item) => item.id === state.activeCategory);
  const traits = state.traitsByCategory.get(state.activeCategory) || [];
  const pageCount = Math.max(1, Math.ceil(traits.length / PAGE_SIZE));
  state.page = Math.min(state.page, pageCount - 1);
  const visible = traits.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);

  elements.trayTitle.textContent = `${category.name} traits`;
  elements.trayCount.textContent = `${traits.length} available`;
  elements.trayStatus.hidden = true;
  elements.traitGrid.innerHTML = visible.map((trait) => `
    <button class="trait-button" type="button" data-trait="${trait.id}" aria-pressed="${state.selected[category.id] === trait.id}" aria-label="Select ${trait.name}">
      <img src="${trait.thumbnail}" alt="" width="240" height="240" loading="lazy" decoding="async">
      <span class="trait-name">${trait.name}</span>
    </button>`).join('');
  elements.pagination.innerHTML = `
    <button class="page-button" type="button" data-page="previous" aria-label="Previous trait page" ${state.page === 0 ? 'disabled' : ''}>←</button>
    <span class="page-label">${state.page + 1} / ${pageCount}</span>
    <button class="page-button" type="button" data-page="next" aria-label="Next trait page" ${state.page + 1 === pageCount ? 'disabled' : ''}>→</button>`;

  elements.traitGrid.querySelectorAll('img').forEach((image) => {
    image.addEventListener('error', () => {
      image.closest('.trait-button').classList.add('is-error');
    }, { once: true });
  });
}

function renderAll() {
  renderCategories();
  renderTray();
  renderSelected();
  renderLayers();
}

elements.categoryTabs.addEventListener('click', (event) => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.activeCategory = button.dataset.category;
  state.page = 0;
  renderCategories();
  renderTray();
});

elements.traitGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-trait]');
  if (!button || button.classList.contains('is-error')) return;
  dismissHomepageIntro();
  const trait = state.traitsById.get(button.dataset.trait);
  state.selected[trait.category] = trait.id;
  renderTray();
  renderSelected();
  renderLayers();
  announce(`${trait.name} selected for ${trait.category}.`);
});

elements.pagination.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (!button) return;
  state.page += button.dataset.page === 'next' ? 1 : -1;
  renderTray();
  elements.traitGrid.scrollTo({ top: 0, behavior: 'auto' });
});

elements.selectedList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]');
  if (!button || button.disabled) return;
  dismissHomepageIntro();
  state.selected[button.dataset.remove] = null;
  renderAll();
  announce(`${button.dataset.remove} cleared.`);
});

elements.randomize.addEventListener('click', () => {
  dismissHomepageIntro();
  state.selected = randomStack(state.manifest);
  renderAll();
  announce('A complete random avatar stack is ready.');
});

elements.clearAll.addEventListener('click', () => {
  dismissHomepageIntro();
  state.selected = clearOptionalStack(state.manifest, state.selected);
  renderAll();
  announce('Optional layers cleared. Required background and body remain.');
});

elements.downloadPng.addEventListener('click', downloadAvatarPng);

async function initialize() {
  try {
    const response = await fetch('/data/avatar-builder-manifest.json', { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
    state.manifest = await response.json();
    ({ traitsById: state.traitsById, traitsByCategory: state.traitsByCategory } = indexManifest(state.manifest));
    state.activeCategory = state.manifest.categoryOrder[0];
    const initialStack = defaultStack(state.manifest);
    state.selected = isHomepage ? clearOptionalStack(state.manifest, initialStack) : initialStack;
    lastWorkingBackgroundId = state.selected.background;
    renderAll();
    elements.downloadPng.disabled = isHomepage;
  } catch (error) {
    elements.trayStatus.hidden = false;
    elements.trayStatus.textContent = 'The avatar builder could not load. Please refresh and try again.';
    elements.avatarFrame.setAttribute('aria-busy', 'false');
    elements.randomize.disabled = true;
    elements.clearAll.disabled = true;
    elements.downloadPng.disabled = true;
    console.error(error);
  }
}

const intersectionObserver = new IntersectionObserver(([entry]) => {
  builderIntersecting = entry?.isIntersecting ?? true;
  syncBackgroundPlayback();
}, { threshold: .01 });
intersectionObserver.observe(host);
document.addEventListener('visibilitychange', syncBackgroundPlayback);
new ResizeObserver(() => activeBackgroundRenderer?.resize()).observe(elements.avatarFrame);
window.addEventListener('pagehide', destroyAnimatedBackground);
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  const backgroundTrait = state.traitsById?.get(state.selected.background);
  if (!isAnimatedBackground(backgroundTrait)) return;
  activateAnimatedBackground(backgroundTrait).catch((error) => {
    console.error(error);
    announce(`${backgroundTrait.name} could not be restored.`);
  });
});

initialize();