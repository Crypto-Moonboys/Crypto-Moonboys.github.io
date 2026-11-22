import { assessRecipe, DEFAULT_RECIPE, OPTIONS, readRecipe } from './clan-wall-studio-rules.mjs';

const GROUPS = [
  ['Sketch', [['sketch', 'Letter style'], ['width', 'Width'], ['lean', 'Lean'], ['placement', 'Placement']]],
  ['Fill', [['fill', 'Fill style'], ['palette', 'Palette']]],
  ['Outline', [['outline', 'Cap']]],
  ['Depth', [['depth', 'Method'], ['direction', 'Direction'], ['reach', 'Reach']]],
];
const INKS = {
  lime: ['#f0ff87', '#5c9805'], uv: ['#e3b4ff', '#5710aa'],
  cold: ['#d8ffff', '#097cbd'], pink: ['#ffd0e5', '#b50a65'],
};

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function makePieceCanvas(className = 'wall-studio-canvas') {
  const canvas = node('canvas', '', className);
  canvas.width = 960;
  canvas.height = 384;
  return canvas;
}

export function paintPiece(canvas, recipe) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const incline = { back: .21, upright: 0, forward: -.21 }[recipe.lean];
  const split = recipe.placement === 'split';
  const center = { left: 379, center: 480, right: 581, split: 480 }[recipe.placement];
  const width = { tight: 430, balanced: 550, wide: 670 }[recipe.width];
  const groups = split ? [['GRA', 455 - width / 4, width / 2], ['FF', 505 + width / 4, width / 2]] : [['GRAFF', center, width]];
  const baseline = 246;
  const font = { tag: 'italic 900 135px sans-serif', 'throw-up': '900 166px sans-serif',
    wildstyle: 'italic 900 179px Impact, sans-serif' }[recipe.sketch];
  const colors = INKS[recipe.palette];
  const fill = ctx.createLinearGradient(0, -138, 0, 0);
  const stops = recipe.fill === 'chrome'
    ? [[0, '#394451'], [.25, '#f5fbff'], [.49, '#adbac8'], [.51, '#293445'], [.83, '#dae5ec'], [1, '#768390']]
    : [[0, colors[0]], [1, colors[1]]];
  for (const [at, color] of stops) fill.addColorStop(at, color);

  function lettering(style, weight = 0, dx = 0, dy = 0) {
    for (const [word, x, maxWidth] of groups) {
      ctx.save();
      if (split) {
        // Paint, outlines and depth must all leave the expansion seam clear.
        ctx.beginPath();
        ctx.rect(x < 480 ? 0 : 496, 0, 464, canvas.height);
        ctx.clip();
      }
      ctx.translate(x + dx, baseline + dy);
      ctx.transform(1, 0, incline, 1, 0, 0);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.scale(maxWidth / ctx.measureText(word).width, 1);
      ctx.lineJoin = 'round';
      if (weight) {
        ctx.strokeStyle = style;
        ctx.lineWidth = weight;
      } else {
        ctx.fillStyle = style;
      }

      // Overlap the throw-up letters, and kick individual wildstyle letters off the baseline.
      const letters = [...word];
      const widths = letters.map(letter => ctx.measureText(letter).width);
      const overlap = recipe.sketch === 'tag' ? 0 : 9;
      const total = widths.reduce((sum, width) => sum + width, 0) - overlap * (letters.length - 1);
      let cursor = -total / 2;
      for (const [index, letter] of letters.entries()) {
        ctx.save();
        const step = recipe.sketch === 'wildstyle' ? 9 : recipe.sketch === 'throw-up' ? 4 : 0;
        ctx.translate(cursor + widths[index] / 2, (index % 2 ? -1 : 1) * step);
        ctx.rotate((index % 2 ? 1 : -1) * step / 70);
        if (weight) ctx.strokeText(letter, 0, 0);
        else ctx.fillText(letter, 0, 0);
        ctx.restore();
        cursor += widths[index] - overlap;
      }
      ctx.restore();
    }
  }

  if (recipe.depth !== 'none') {
    const [x, y] = { 'down-left': [-1, 1], 'down-right': [1, 1], 'up-right': [1, -1] }[recipe.direction];
    const distance = recipe.reach === 'long' ? 27 : 13;
    if (recipe.depth === 'shadow') lettering('#08050cde', 9, x * distance, y * distance);
    else for (let i = distance; i > 0; i -= 2) lettering(i % 4 === 1 ? '#7548a1' : '#382047', 6, x * i, y * i);
  }
  if (recipe.finish.includes('lime-keyline')) lettering('#d0f134', recipe.outline === 'fat' ? 28 : 17);
  if (recipe.outline !== 'none') lettering('#100b18', recipe.outline === 'fat' ? 20 : 9);
  if (recipe.fill === 'none') lettering(colors[0], 3);
  else lettering(recipe.fill === 'flat' ? colors[0] : fill);

  for (const [, x, span] of groups) {
    ctx.save();
    ctx.translate(x - span / 2, 0);
    if (recipe.finish.includes('highlights')) {
      ctx.fillStyle = '#fffcec';
      for (const fraction of [.12, .45, .78]) ctx.fillRect(span * fraction, 130, span * .1, 4);
    }
    if (recipe.finish.includes('cutbacks')) {
      ctx.strokeStyle = '#201929';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(span * .15, 223);
      ctx.lineTo(span * .27, 209);
      ctx.moveTo(span * .66, 223);
      ctx.lineTo(span * .8, 208);
      ctx.stroke();
    }
    if (recipe.finish.includes('arrows') || recipe.sketch === 'wildstyle') {
      ctx.fillStyle = colors[0];
      ctx.beginPath();
      ctx.moveTo(span * .18, 272);
      ctx.lineTo(span * .8, 252);
      ctx.lineTo(span * .72, 242);
      ctx.lineTo(span * .94, 253);
      ctx.lineTo(span * .76, 276);
      ctx.lineTo(span * .8, 263);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  if (recipe.finish.includes('signature')) {
    ctx.fillStyle = colors[0];
    ctx.font = 'italic bold 24px cursive';
    ctx.fillText('GK', split ? 748 : center + width * .3, 308);
  }
}

export function renderPrint(record) {
  const recipe = readRecipe(record.recipe);
  if (!recipe) return null;
  const canvas = makePieceCanvas('wall-studio-print');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', record.name + ' · ' + record.utc_day);
  paintPiece(canvas, recipe);
  return canvas;
}

export function mountWallStudio(container, { tier, storageKey, onChange }) {
  const panel = node('section', '', 'wall-studio');
  const canvas = makePieceCanvas();
  canvas.setAttribute('role', 'img');
  const brief = node('h4');
  brief.tabIndex = -1;
  const budget = node('output', '', 'wall-studio-budget');
  budget.setAttribute('aria-live', 'polite');
  const checks = node('ul', '', 'wall-studio-checks');
  const tools = node('div', '', 'wall-studio-tools');
  const fields = new Map();
  const finishes = new Map();
  const undo = node('button', 'Undo last edit');
  undo.type = 'button';
  const history = [];
  let recipe = { ...DEFAULT_RECIPE };
  try { recipe = readRecipe(JSON.parse(sessionStorage.getItem(storageKey))) ?? recipe; } catch { /* Storage is optional. */ }

  for (const [layer, parts] of GROUPS) {
    const group = node('fieldset');
    group.append(node('legend', layer));
    for (const [key, name] of parts) {
      const field = node('div', '', 'wall-studio-field');
      const label = node('label', name);
      const select = node('select');
      select.id = 'wall-studio-' + key;
      label.htmlFor = select.id;
      for (const [id, title, cost] of OPTIONS[key]) {
        const option = node('option', title + (cost ? ` · ${cost}` : ''));
        option.value = id;
        select.append(option);
      }
      field.append(label, select);
      group.append(field);
      fields.set(key, select);
      select.addEventListener('change', () => edit({ ...recipe, [key]: select.value }));
    }
    tools.append(group);
  }

  const finish = node('fieldset');
  finish.append(node('legend', 'Finish'));
  for (const [id, name, cost] of OPTIONS.finish) {
    const label = node('label', '', 'wall-studio-check');
    const checkbox = node('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      const list = checkbox.checked ? [...recipe.finish, id] : recipe.finish.filter(value => value !== id);
      edit({ ...recipe, finish: list });
    });
    finishes.set(id, checkbox);
    label.append(checkbox, node('span', `${name} · ${cost}`));
    finish.append(label);
  }
  tools.append(finish);
  undo.addEventListener('click', () => {
    if (!history.length) return;
    recipe = history.pop();
    update();
  });

  function edit(next) {
    history.push(recipe);
    recipe = next;
    update();
  }

  function update() {
    const result = assessRecipe(tier, recipe);
    const remaining = result.budget - result.spent;
    brief.textContent = result.title + ' brief';
    budget.textContent = remaining < 0 ? `${-remaining} units over budget` : `${remaining} of ${result.budget} paint units left`;
    budget.toggleAttribute('data-over-budget', remaining < 0);
    checks.replaceChildren(...result.checks.map(check => node('li', (check.met ? '✓ ' : '○ ') + check.label)));
    for (const [key, select] of fields) select.value = recipe[key];
    for (const [id, checkbox] of finishes) checkbox.checked = recipe.finish.includes(id);
    fields.get('direction').disabled = recipe.depth === 'none';
    fields.get('reach').disabled = recipe.depth === 'none';
    undo.disabled = !history.length;
    canvas.setAttribute('aria-label', `GRAFF ${recipe.sketch} · ${recipe.fill} fill · ${recipe.placement} placement`);
    paintPiece(canvas, recipe);
    try { sessionStorage.setItem(storageKey, JSON.stringify(recipe)); } catch { /* Storage is optional. */ }
    onChange(result);
  }

  panel.append(brief, budget, checks, canvas, tools, undo);
  container.replaceChildren(panel);
  update();
  return { heading: brief, storageKey };
}
