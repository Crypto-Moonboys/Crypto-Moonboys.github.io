import { clearOptionalStack, defaultStack, indexManifest, randomStack } from './avatar-builder-core.mjs';

const PAGE_SIZE = 24;
const ICONS_URL = '/img/avatar-builder/category-icons.svg';
const host = document.querySelector('.avatar-builder-host');
const isHomepage = host?.dataset.builderContext === 'homepage';

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
        <div class="avatar-stack" id="avatar-stack"></div>
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
        <button class="action action-primary" type="button" id="randomize">Randomize</button>
        <button class="action" type="button" id="reset">Reset</button>
        <button class="action action-danger" type="button" id="clear-all">Clear All</button>
      </div>
      <a class="back-link" href="${isHomepage ? '/avatar-builder-test.html' : '/'}">${isHomepage ? 'Open standalone builder' : 'Back to Crypto Moonboys'}</a>
    </aside>
  </div>
  <p class="sr-only" id="live-region" aria-live="polite" aria-atomic="true"></p>`;

const state = { manifest: null, traitsById: null, traitsByCategory: null, selected: {}, activeCategory: 'background', page: 0 };
let layerRenderGeneration = 0;

const elements = {
  avatarFrame: host.querySelector('#avatar-frame'),
  avatarStack: host.querySelector('#avatar-stack'),
  categoryTabs: host.querySelector('#category-tabs'),
  clearAll: host.querySelector('#clear-all'),
  liveRegion: host.querySelector('#live-region'),
  pagination: host.querySelector('#pagination'),
  previewFallback: host.querySelector('#preview-fallback'),
  randomize: host.querySelector('#randomize'),
  reset: host.querySelector('#reset'),
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

function renderCategories() {
  elements.categoryTabs.innerHTML = state.manifest.categories.map((category) => `
    <button class="category-button" type="button" data-category="${category.id}" aria-pressed="${category.id === state.activeCategory}" aria-label="Open ${category.name} traits">
      ${icon(category.id)}
    </button>`).join('');
}

function renderLayers() {
  const generation = ++layerRenderGeneration;
  let pending = 0;
  let failures = 0;
  elements.avatarFrame.dataset.renderGeneration = String(generation);
  elements.previewFallback.hidden = true;
  elements.avatarStack.replaceChildren();
  state.manifest.categories.forEach((category) => {
    const trait = state.traitsById.get(state.selected[category.id]);
    if (!trait) return;
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
  state.selected[button.dataset.remove] = null;
  renderAll();
  announce(`${button.dataset.remove} cleared.`);
});

elements.randomize.addEventListener('click', () => {
  state.selected = randomStack(state.manifest);
  renderAll();
  announce('A complete random avatar stack is ready.');
});

elements.reset.addEventListener('click', () => {
  state.selected = defaultStack(state.manifest);
  renderAll();
  announce('Default avatar restored.');
});

elements.clearAll.addEventListener('click', () => {
  state.selected = clearOptionalStack(state.manifest, state.selected);
  renderAll();
  announce('Optional layers cleared. Required background and body remain.');
});

async function initialize() {
  try {
    const response = await fetch('/data/avatar-builder-manifest.json', { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
    state.manifest = await response.json();
    ({ traitsById: state.traitsById, traitsByCategory: state.traitsByCategory } = indexManifest(state.manifest));
    state.activeCategory = state.manifest.categoryOrder[0];
    state.selected = defaultStack(state.manifest);
    renderAll();
  } catch (error) {
    elements.trayStatus.hidden = false;
    elements.trayStatus.textContent = 'The avatar builder could not load. Please refresh and try again.';
    elements.avatarFrame.setAttribute('aria-busy', 'false');
    elements.randomize.disabled = true;
    elements.reset.disabled = true;
    elements.clearAll.disabled = true;
    console.error(error);
  }
}

initialize();
