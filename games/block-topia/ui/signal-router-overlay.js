function seconds(ms) {
  return Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
}

function pct(value) {
  return `${Math.round(Math.max(0, Math.min(100, (Number(value) || 0) * 100)))}%`;
}

export function createSignalRouterOverlay(doc, { onAction } = {}) {
  const style = doc.createElement('style');
  style.textContent = `
    #signal-router-overlay.hidden { display: none; }
    #signal-router-overlay { position: fixed; inset: 0; z-index: 78; pointer-events: none; font-family: Inter, sans-serif; }
    #signal-router-overlay .router-underlay { position: absolute; inset: 0; background: rgba(3,8,18,0.5); }
    #signal-router-overlay .router-shell { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); width: min(920px, calc(100vw - 24px)); background: rgba(5,15,32,0.88); border: 1px solid rgba(94,242,255,0.58); border-radius: 12px; box-shadow: 0 0 26px rgba(94,242,255,0.2); color: #d7f9ff; pointer-events: auto; padding: 10px 12px; }
    #signal-router-overlay .router-chip { margin: 0; color: #ff6fa7; letter-spacing: 0.08em; font-weight: 800; }
    #signal-router-overlay .router-sub { margin: 6px 0 8px; color: #7fefff; font-size: 13px; }
    #signal-router-overlay .router-rows { display: grid; grid-template-columns: 1.4fr 1fr; gap: 10px; }
    #signal-router-overlay .router-objectives, #signal-router-overlay .router-legend { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
    #signal-router-overlay .router-objectives li { background: rgba(9,20,43,0.9); border: 1px solid rgba(94,242,255,0.2); border-radius: 8px; padding: 6px 8px; font-size: 12px; }
    #signal-router-overlay .router-objectives li.complete { border-color: rgba(94,242,255,0.62); color: #9ff7ff; }
    #signal-router-overlay .router-objectives li.failed { border-color: rgba(255,92,129,0.74); color: #ffc6d6; }
    #signal-router-overlay .router-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
    #signal-router-overlay .router-actions button { border: 1px solid rgba(94,242,255,0.4); background: rgba(10,30,54,0.84); color: #d7f9ff; border-radius: 8px; padding: 5px 8px; font-size: 12px; cursor: pointer; }
    #signal-router-overlay .router-log { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; font-size: 11px; color: #a8dff6; }
    #signal-router-overlay .router-pressure { margin-top: 8px; height: 8px; background: rgba(255,255,255,0.1); border-radius: 99px; overflow: hidden; }
    #signal-router-overlay .router-pressure i { display: block; height: 100%; background: linear-gradient(90deg, #5ef2ff, #ffb347 55%, #ff4f9e); }
  `;
  doc.head.appendChild(style);

  const root = doc.createElement('section');
  root.id = 'signal-router-overlay';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="router-underlay"></div>
    <div class="router-shell" role="dialog" aria-live="assertive" aria-label="Signal Router">
      <p class="router-chip">SIGNAL CONGESTION — REROUTE THE GRID</p>
      <p class="router-sub" id="router-sub">Preparing reroute shell…</p>
      <div class="router-rows">
        <ul class="router-objectives" id="router-objectives"></ul>
        <ul class="router-legend" id="router-legend"></ul>
      </div>
      <div class="router-pressure"><i id="router-pressure-meter"></i></div>
      <div class="router-actions">
        <button type="button" data-action="prioritizeRoute">Prioritize Route</button>
        <button type="button" data-action="avoidLink">Avoid Link</button>
        <button type="button" data-action="rerouteTraffic">Reroute Traffic</button>
        <button type="button" data-action="stabilizeLink">Stabilize Link</button>
        <button type="button" data-action="clearCongestion">Clear Congestion</button>
      </div>
      <ul class="router-log" id="router-log"></ul>
    </div>
  `;
  doc.body.appendChild(root);

  const subEl = root.querySelector('#router-sub');
  const objEl = root.querySelector('#router-objectives');
  const legendEl = root.querySelector('#router-legend');
  const pressureEl = root.querySelector('#router-pressure-meter');
  const logEl = root.querySelector('#router-log');

  root.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', () => onAction?.(button.dataset.action || ''));
  });

  function render(data = {}) {
    const active = Boolean(data.active);
    root.classList.toggle('hidden', !active);
    if (!active) return;

    const selected = data.selectedNodeId ? data.selectedNodeId.toUpperCase() : 'NONE';
    subEl.textContent = [
      `Node ${selected}`,
      `Time ${seconds(data.timeLeftMs)}s`,
      `Failures ${data.failedObjectives || 0}/3`,
      `Tokens ${data.tokens || 0}`,
    ].join(' · ');

    objEl.replaceChildren();
    (data.objectives || []).forEach((objective) => {
      const li = doc.createElement('li');
      li.className = `${objective.complete ? 'complete' : ''} ${objective.connected === false ? 'failed' : ''}`;
      li.textContent = `${objective.complete ? '✅' : objective.connected ? '🟦' : '⚠️'} ${objective.label} (${seconds(objective.timeLeftMs)}s)`;
      objEl.appendChild(li);
    });

    const states = data.linkStates || {};
    legendEl.innerHTML = [
      `🟦 Stable ${states.normal || 0}`,
      `🟨 Overloaded ${states.overloaded || 0}`,
      `🟪 Corrupted ${states.corrupted || 0}`,
      `🟥 Blocked ${states.blocked || 0}`,
      `💠 Stabilized ${states.stabilized || 0}`,
    ].map((text) => `<li>${text}</li>`).join('');

    pressureEl.style.width = pct((data.pressure || 0) / 1);

    logEl.replaceChildren();
    (data.logs || []).slice(0, 5).forEach((entry) => {
      const li = doc.createElement('li');
      li.textContent = entry.text;
      logEl.appendChild(li);
    });
  }

  return { render };
}
