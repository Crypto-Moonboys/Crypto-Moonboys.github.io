function seconds(ms) {
  return Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
}

export function createCircuitConnectOverlay(doc, { onAction } = {}) {
  const style = doc.createElement('style');
  style.textContent = `
    #circuit-connect-overlay.hidden { display: none; }
    #circuit-connect-overlay { position: fixed; inset: 0; z-index: 881; pointer-events: none; font-family: Inter, sans-serif; }
    #circuit-connect-overlay .circuit-dim { position: absolute; inset: 0; background: radial-gradient(circle at 82% 18%, rgba(94,242,255,0.08), transparent 22%), linear-gradient(180deg, rgba(2,8,18,0.1), rgba(2,8,18,0.34)); backdrop-filter: blur(1px); }
    #circuit-connect-overlay .circuit-shell { position: absolute; top: 94px; right: 14px; width: min(430px, calc(100vw - 28px)); max-height: min(48vh, 520px); overflow: auto; border: 1px solid rgba(122, 230, 255, 0.34); border-radius: 4px; background: linear-gradient(180deg, rgba(6, 18, 35, 0.94), rgba(3, 10, 22, 0.9)); box-shadow: 0 24px 54px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04); color: #dcf7ff; pointer-events: auto; padding: 10px 11px 12px; }
    #circuit-connect-overlay .circuit-chip { margin: 0; letter-spacing: 0.08em; color: #ff6a9d; font-weight: 800; }
    #circuit-connect-overlay .circuit-sub { margin: 5px 0 8px; color: #86efff; font-size: 12px; }
    #circuit-connect-overlay .circuit-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
    #circuit-connect-overlay ul { margin: 0; padding: 0; list-style: none; }
    #circuit-connect-overlay .circuit-objectives li, #circuit-connect-overlay .circuit-stats li { border: 1px solid rgba(110, 202, 255, 0.2); border-radius: 4px; background: rgba(12, 23, 48, 0.9); padding: 6px 8px; font-size: 12px; margin-bottom: 5px; }
    #circuit-connect-overlay .circuit-actions { margin-top: 8px; display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    #circuit-connect-overlay button { border: 1px solid rgba(122, 230, 255, 0.34); background: rgba(9, 30, 58, 0.92); color: #d7f8ff; border-radius: 4px; font-size: 11px; padding: 6px 8px; cursor: pointer; text-align: left; }
    #circuit-connect-overlay .circuit-bar { height: 9px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; margin-top: 7px; }
    #circuit-connect-overlay .circuit-bar i { display: block; height: 100%; background: linear-gradient(90deg, #56f5ff, #ffc75d 55%, #ff5f85); }
    #circuit-connect-overlay .circuit-hint { margin: 8px 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(174,238,255,0.72); }
    #circuit-connect-overlay .circuit-log { margin: 8px 0 0; padding: 0; list-style: none; max-height: 72px; overflow: auto; }
    #circuit-connect-overlay .circuit-log li { font-size: 11px; color: #a3dff3; margin-top: 3px; }
  `;
  doc.head.appendChild(style);

  const root = doc.createElement('section');
  root.id = 'circuit-connect-overlay';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="circuit-dim"></div>
    <div class="circuit-shell" role="dialog" aria-live="assertive" aria-label="Circuit Connect">
      <p class="circuit-chip">CIRCUIT BREACH — RECONNECT THE NODES</p>
      <p class="circuit-sub" id="circuit-sub">Initializing recovery shell…</p>
      <div class="circuit-grid">
        <ul class="circuit-objectives" id="circuit-objectives"></ul>
        <ul class="circuit-stats" id="circuit-stats"></ul>
      </div>
      <div class="circuit-bar"><i id="circuit-integrity"></i></div>
      <div class="circuit-actions">
        <button type="button" data-action="reconnectLink">Reconnect Link [A]</button>
        <button type="button" data-action="stabilizeLink">Stabilize Link [S]</button>
        <button type="button" data-action="rerouteNode">Reroute [D]</button>
        <button type="button" data-action="deployBridge">Bridge [F]</button>
        <button type="button" data-action="reinforceConnection">Reinforce [G]</button>
      </div>
      <p class="circuit-hint">Recovery strip active. Lock a node, use `A/S/D/F/G`, and keep `K` visible for skip.</p>
      <ul class="circuit-log" id="circuit-log"></ul>
    </div>
  `;
  doc.body.appendChild(root);

  const subEl = root.querySelector('#circuit-sub');
  const objectiveEl = root.querySelector('#circuit-objectives');
  const statsEl = root.querySelector('#circuit-stats');
  const integrityEl = root.querySelector('#circuit-integrity');
  const logEl = root.querySelector('#circuit-log');

  root.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', () => onAction?.(button.dataset.action || ''));
  });

  function render(data = {}) {
    const active = Boolean(data.active);
    root.classList.toggle('hidden', !active);
    if (!active) return;

    const selected = data.selectedNodeId ? data.selectedNodeId.toUpperCase() : 'NONE';
    subEl.textContent = `Node ${selected} · Integrity ${Math.round(data.integrity || 0)}% · Time ${seconds(data.timeLeftMs)}s · Bridge charges ${data.supportCharges || 0}`;

    objectiveEl.replaceChildren();
    (data.objectives || []).forEach((objective) => {
      const li = doc.createElement('li');
      li.textContent = `${objective.complete ? '✅' : '⚠️'} ${objective.label} (${seconds(objective.timeLeftMs)}s)`;
      objectiveEl.appendChild(li);
    });

    const ls = data.linkStates || {};
    statsEl.innerHTML = [
      `🟦 Stable ${ls.stable || 0}`,
      `🟧 Unstable ${ls.unstable || 0}`,
      `🟥 Broken ${ls.broken || 0}`,
      `🟪 Bridge ${ls.bridge || 0}`,
      `💠 Reinforced ${ls.reinforced || 0}`,
      `💥 Fractures ${data.fractureTypes?.length || 0}`,
      `🤝 NPC actors ${data.npcActors?.length || 0}`,
    ].map((item) => `<li>${item}</li>`).join('');

    integrityEl.style.width = `${Math.round(Math.max(0, Math.min(100, data.integrity || 0)))}%`;

    logEl.replaceChildren();
    (data.logs || []).slice(0, 5).forEach((entry) => {
      const li = doc.createElement('li');
      li.textContent = entry.text;
      logEl.appendChild(li);
    });
  }

  return { render };
}
