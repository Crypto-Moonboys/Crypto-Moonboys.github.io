import { clearOptionalStack, defaultStack, indexManifest, randomStack } from './avatar-builder-core.mjs';

const PAGE_SIZE = 24;
const ICONS_URL = '/img/avatar-builder/category-icons.svg';
const state = { manifest: null, traitsById: null, traitsByCategory: null, selected: {}, activeCategory: 'background', page: 0 };

const elements = {
  avatarFrame: document.querySelector('#avatar-frame'),
  avatarStack: document.querySelector('#avatar-stack'),
  categoryTabs: document.querySelector('#category-tabs'),
  clearAll: document.querySelector('#clear-all'),
  liveRegion: document.querySelector('#live-region'),
  pagination: document.querySelector('#pagination'),
  previewFallback: document.querySelector('#preview-fallback'),
  randomize: document.querySelector('#randomize'),
  reset: document.querySelector('#reset'),
  selectedList: document.querySelector('#selected-list'),
  traitGrid: document.querySelector('#trait-grid'),
  trayCount: document.querySelector('#tray-count'),
  trayStatus: document.querySelector('#tray-status'),
  trayTitle: document.querySelector('#tray-title'),
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
      ${icon(category.id)}<span>${category.name}</span>
    </button>`).join('');
}

function renderLayers() {
  let pending = 0;
  let failures = 0;
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
      pending -= 1;
      if (pending === 0) elements.avatarFrame.setAttribute('aria-busy', 'false');
    };
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', () => {
      failures += 1;
      image.hidden = true;
      elements.previewFallback.hidden = false;
      elements.previewFallback.textContent = `${failures} avatar layer${failures === 1 ? '' : 's'} could not load.`;
      announce(`${trait.name} could not be loaded.`);
      finish();
    }, { once: true });
    elements.avatarStack.append(image);
  });
  elements.avatarFrame.setAttribute('aria-busy', pending ? 'true' : 'false');
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
      <span>${trait.name}</span>
    </button>`).join('');
  elements.pagination.innerHTML = `
    <button class="page-button" type="button" data-page="previous" ${state.page === 0 ? 'disabled' : ''}>Previous</button>
    <span class="page-label">${state.page + 1} / ${pageCount}</span>
    <button class="page-button" type="button" data-page="next" ${state.page + 1 === pageCount ? 'disabled' : ''}>Next</button>`;

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
