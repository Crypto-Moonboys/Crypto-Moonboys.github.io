function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function setMeter(bar, value) {
  if (!bar) return;
  bar.style.width = `${Math.round(Math.max(0, Math.min(100, (Number(value) || 0) * 100)))}%`;
}

function renderTraits(traits = []) {
  if (!traits.length) return 'none';
  return traits.map((trait) => `${trait.suppressed ? '✅' : '⚠️'} ${trait.name}`).join(' · ');
}

export function createNodeOutbreakOverlay(doc, { onAction } = {}) {
  const root = doc.createElement('section');
  root.id = 'node-outbreak-overlay';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="outbreak-underlay"></div>
    <div class="outbreak-shell" role="dialog" aria-live="assertive" aria-label="Node Outbreak Defense">
      <header class="outbreak-header">
        <p class="outbreak-chip">VIRUS ALERT — NODES UNDER ATTACK</p>
        <p class="outbreak-sub" id="outbreak-sub">Stand by…</p>
      </header>
      <div class="outbreak-bars">
        <label>Infection Level<div class="outbreak-meter"><span id="outbreak-infection-meter"></span></div></label>
        <label>Containment<div class="outbreak-meter containment"><span id="outbreak-containment-meter"></span></div></label>
        <label>Failure Pressure<div class="outbreak-meter pressure"><span id="outbreak-pressure-meter"></span></div></label>
      </div>
      <div class="outbreak-stats" id="outbreak-stats"></div>
      <div class="outbreak-actions">
        <button type="button" data-action="scan">Scan Node</button>
        <button type="button" data-action="isolate">Isolate Node</button>
        <button type="button" data-action="delayLink">Delay Link</button>
        <button type="button" data-action="purge">Purge Node</button>
      </div>
      <div class="outbreak-upgrades">
        <button type="button" data-upgrade="containment">Containment +</button>
        <button type="button" data-upgrade="detection">Detection +</button>
        <button type="button" data-upgrade="neutralization">Neutralization +</button>
      </div>
      <p class="outbreak-traits" id="outbreak-traits"></p>
      <ul class="outbreak-log" id="outbreak-log"></ul>
    </div>
  `;
  doc.body.appendChild(root);

  const subEl = root.querySelector('#outbreak-sub');
  const statsEl = root.querySelector('#outbreak-stats');
  const traitsEl = root.querySelector('#outbreak-traits');
  const logEl = root.querySelector('#outbreak-log');
  const infectionMeter = root.querySelector('#outbreak-infection-meter');
  const containmentMeter = root.querySelector('#outbreak-containment-meter');
  const pressureMeter = root.querySelector('#outbreak-pressure-meter');

  root.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', () => onAction?.({ kind: 'action', id: button.dataset.action }));
  });
  root.querySelectorAll('button[data-upgrade]').forEach((button) => {
    button.addEventListener('click', () => onAction?.({ kind: 'upgrade', id: button.dataset.upgrade }));
  });

  function render(data = {}) {
    const active = Boolean(data.active);
    root.classList.toggle('hidden', !active);
    if (!active) return;

    const selected = data.selectedNodeId ? data.selectedNodeId.toUpperCase() : 'NONE';
    subEl.textContent = `Selected node ${selected} · tokens ${data.tokens ?? 0}`;
    statsEl.textContent = [
      `Infected ${data.infectedCount || 0}`,
      `Takeover ${pct(data.takeoverRatio || 0)} / ${pct(data.takeoverThreshold || 0.45)}`,
      `Spread ${pct(data.spreadLevel || 0)}`,
      `Tree L${data.upgrades?.containment || 0}/L${data.upgrades?.detection || 0}/L${data.upgrades?.neutralization || 0}`,
      data.status === 'alert' ? 'ALERT LOCKDOWN' : 'DEFENSE ACTIVE',
    ].join(' · ');

    setMeter(infectionMeter, data.infectionLevel || 0);
    setMeter(containmentMeter, data.containment || 0);
    setMeter(pressureMeter, data.takeoverRatio || 0);

    traitsEl.textContent = `Virus traits: ${renderTraits(data.traits || [])}`;

    logEl.replaceChildren();
    (data.logs || []).slice(0, 5).forEach((entry) => {
      const li = doc.createElement('li');
      li.textContent = entry.text;
      logEl.appendChild(li);
    });
  }

  return { render };
}
