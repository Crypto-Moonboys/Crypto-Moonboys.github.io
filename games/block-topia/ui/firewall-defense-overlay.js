function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function seconds(ms) {
  return Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
}

export function createFirewallDefenseOverlay(doc, { onDeploy } = {}) {
  const root = doc.createElement('section');
  root.id = 'firewall-defense-overlay';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="firewall-underlay"></div>
    <div class="firewall-shell signal-console" role="dialog" aria-live="assertive" aria-label="Firewall Defense">
      <header>
        <p class="firewall-chip">FIREWALL BREACH — DEFEND THE NETWORK</p>
        <p class="firewall-sub" id="firewall-sub">Awaiting node lock…</p>
      </header>
      <div class="firewall-stats" id="firewall-stats"></div>
      <div class="firewall-bars" id="firewall-bars"></div>
      <div class="firewall-actions">
        <button type="button" data-defense="firewall">Firewall Node [5]</button>
        <button type="button" data-defense="disruptor">Pulse Disruptor [6]</button>
        <button type="button" data-defense="purge">Purge Beam [7]</button>
      </div>
      <p class="firewall-hint">Select a node on the live map. Use `5/6/7` to deploy, `K` to skip, and keep the map visible while placing.</p>
      <ul class="firewall-log" id="firewall-log"></ul>
    </div>
  `;
  doc.body.appendChild(root);

  const subEl = root.querySelector('#firewall-sub');
  const statsEl = root.querySelector('#firewall-stats');
  const barsEl = root.querySelector('#firewall-bars');
  const logEl = root.querySelector('#firewall-log');

  root.querySelectorAll('button[data-defense]').forEach((button) => {
    button.addEventListener('click', () => onDeploy?.(button.dataset.defense || ''));
  });

  function render(data = {}) {
    const active = Boolean(data.active);
    root.classList.toggle('hidden', !active);
    if (!active) return;

    const selected = data.selectedNodeId ? data.selectedNodeId.toUpperCase() : 'NONE';
    subEl.textContent = `Node ${selected} · Security Tokens ${data.tokens || 0} · ${seconds(data.timeLeftMs)}s`;
    statsEl.textContent = [
      `Waves ${data.wavesCleared || 0}/${data.totalWaves || 0}`,
      `Packets ${data.packetCount || 0}`,
      `Corrupted Nodes ${data.corruptedNodes || 0}`,
      `Defenses ${data.placementsUsed || 0}/${data.placementCap || 0}`,
      data.revealPaths ? 'Agent scan online' : 'Routes obscured',
    ].join(' · ');

    barsEl.replaceChildren();
    for (const node of data.keyNodeIntegrity || []) {
      const row = doc.createElement('label');
      row.className = 'firewall-key-row';
      row.innerHTML = `<span>${node.id.toUpperCase()} ${pct((node.integrity || 0) / 140)}</span><div><i style="width:${Math.max(0, Math.min(100, Math.round((node.integrity || 0) / 1.4)))}%"></i></div>`;
      barsEl.appendChild(row);
    }

    logEl.replaceChildren();
    (data.logs || []).slice(0, 5).forEach((entry) => {
      const li = doc.createElement('li');
      li.textContent = entry.text;
      logEl.appendChild(li);
    });
  }

  return { render };
}
