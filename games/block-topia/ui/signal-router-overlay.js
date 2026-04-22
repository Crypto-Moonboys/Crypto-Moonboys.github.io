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
    #signal-router-overlay { position: fixed; inset: 0; z-index: 878; pointer-events: none; font-family: Inter, sans-serif; }
    #signal-router-overlay .router-underlay { position: absolute; inset: 0; background: radial-gradient(circle at 78% 18%, rgba(94,242,255,0.08), transparent 24%), linear-gradient(180deg, rgba(3,8,18,0.12), rgba(3,8,18,0.34)); backdrop-filter: blur(1px); }
    #signal-router-overlay .router-shell { position: absolute; top: 94px; right: 14px; width: min(430px, calc(100vw - 28px)); max-height: min(48vh, 520px); overflow: auto; background: linear-gradient(180deg, rgba(4,14,28,0.94), rgba(4,10,22,0.88)); border: 1px solid rgba(94,242,255,0.34); border-radius: 4px; box-shadow: 0 24px 54px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04); color: #d7f9ff; pointer-events: auto; padding: 10px 11px 12px; }
    #signal-router-overlay .router-chip { margin: 0; color: #ff6fa7; letter-spacing: 0.08em; font-weight: 800; }
    #signal-router-overlay .router-sub { margin: 6px 0 8px; color: #7fefff; font-size: 13px; }
    #signal-router-overlay .router-rows { display: grid; grid-template-columns: 1fr; gap: 8px; }
    #signal-router-overlay .router-objectives, #signal-router-overlay .router-legend { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
    #signal-router-overlay .router-objectives li { background: rgba(9,20,43,0.9); border: 1px solid rgba(94,242,255,0.2); border-radius: 4px; padding: 6px 8px; font-size: 12px; }
    #signal-router-overlay .router-objectives li.complete { border-color: rgba(94,242,255,0.62); color: #9ff7ff; }
    #signal-router-overlay .router-objectives li.failed { border-color: rgba(255,92,129,0.74); color: #ffc6d6; }
    #signal-router-overlay .router-actions { margin-top: 10px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    #signal-router-overlay .router-actions button { border: 1px solid rgba(94,242,255,0.32); background: rgba(10,30,54,0.84); color: #d7f9ff; border-radius: 4px; padding: 6px 8px; font-size: 11px; cursor: pointer; text-align: left; }
    #signal-router-overlay .router-hint { margin: 8px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(174,238,255,0.72); }
    #signal-router-overlay .router-log { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; font-size: 11px; color: #a8dff6; max-height: 72px; overflow: auto; }
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
        <button type="button" data-action="prioritizeRoute">Prioritize Route [Z]</button>
        <button type="button" data-action="avoidLink">Avoid Link [X]</button>
        <button type="button" data-action="rerouteTraffic">Reroute Traffic [C]</button>
        <button type="button" data-action="stabilizeLink">Stabilize Link [V]</button>
        <button type="button" data-action="clearCongestion">Clear Congestion [B]</button>
      </div>
      <p class="router-hint">Tactical reroute strip. Keep the map visible, lock a node, then use `Z/X/C/V/B` or `K` to skip.</p>
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
